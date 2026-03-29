import { getProjectToken, getWorkspaceToken, nowTimestamp, deriveProjectTokenEnv } from "./env.mjs";
import { makeNotionClient } from "./client.mjs";

const SUPPORTED_BLOCK_TYPES = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "divider",
  "callout",
  "code",
  "quote",
]);

function plainText(richText) {
  return (richText || []).map((item) => item.plain_text || item.text?.content || "").join("").trim();
}

function cloneRichText(richText) {
  return (richText || []).map((item) => {
    if (item.type === "text") {
      return {
        type: "text",
        text: {
          content: item.text?.content || "",
          link: item.text?.link || null,
        },
        annotations: item.annotations,
      };
    }

    return {
      type: "text",
      text: { content: item.plain_text || "" },
      annotations: item.annotations,
    };
  });
}

function sanitizeIcon(icon) {
  if (!icon) return undefined;
  if (icon.type === "emoji") return { type: "emoji", emoji: icon.emoji };
  if (icon.type === "external") return { type: "external", external: { url: icon.external.url } };
  if (icon.type === "custom_emoji") {
    return { type: "custom_emoji", custom_emoji: { id: icon.custom_emoji.id } };
  }
  if (icon.type === "file_upload") {
    return { type: "file_upload", file_upload: { id: icon.file_upload.id } };
  }
  if (icon.type === "file" && icon.file?.url) {
    return { type: "external", external: { url: icon.file.url } };
  }
  return undefined;
}

function sanitizeCover(cover) {
  if (!cover) return undefined;
  if (cover.type === "external") return { type: "external", external: { url: cover.external.url } };
  if (cover.type === "file_upload") {
    return { type: "file_upload", file_upload: { id: cover.file_upload.id } };
  }
  if (cover.type === "file" && cover.file?.url) {
    return { type: "external", external: { url: cover.file.url } };
  }
  return undefined;
}

function replaceHeaderRichText(richText, canonicalSource, timestamp) {
  const text = plainText(richText);
  if (text.startsWith("Canonical Source:")) {
    return [{ type: "text", text: { content: `Canonical Source: ${canonicalSource}` } }];
  }
  if (text.startsWith("Last Updated:")) {
    return [{ type: "text", text: { content: `Last Updated: ${timestamp}` } }];
  }
  return cloneRichText(richText);
}

function projectPath(name, suffix = []) {
  return ["Projects", name, ...suffix].join(" > ");
}

function pathFromSegments(segments) {
  return segments.join(" > ");
}

async function cloneBlock(block, canonicalSource, timestamp, sourceClient) {
  if (block.type === "child_page") return null;
  if (!SUPPORTED_BLOCK_TYPES.has(block.type)) {
    throw new Error(`Unsupported block type in template: ${block.type}`);
  }

  if (block.type === "divider") {
    return { object: "block", type: "divider", divider: {} };
  }

  const prop = block[block.type];
  const payload = {
    object: "block",
    type: block.type,
    [block.type]: {},
  };

  if ("rich_text" in prop) {
    payload[block.type].rich_text = replaceHeaderRichText(prop.rich_text, canonicalSource, timestamp);
  }
  if ("color" in prop) {
    payload[block.type].color = prop.color || "default";
  }

  if (block.type === "callout") {
    payload.callout.icon = sanitizeIcon(prop.icon) || { type: "emoji", emoji: "💡" };
  }

  if (block.type === "code") {
    payload.code.language = prop.language || "plain text";
    payload.code.caption = cloneRichText(prop.caption || []);
  }

  if (block.has_children) {
    const childBlocks = await sourceClient.getChildren(block.id);
    const clonedChildren = [];
    for (const child of childBlocks) {
      const cloned = await cloneBlock(child, canonicalSource, timestamp, sourceClient);
      if (cloned) clonedChildren.push(cloned);
    }
    if (clonedChildren.length > 0) {
      payload[block.type].children = clonedChildren;
    }
  }

  return payload;
}

async function findChildPage(parentPageId, title, client) {
  const children = await client.getChildren(parentPageId);
  return children.find((child) => child.type === "child_page" && child.child_page?.title === title) || null;
}

async function createChildPage(parentPageId, title, client) {
  return client.request("POST", "pages", {
    parent: { type: "page_id", page_id: parentPageId },
    properties: {
      title: {
        title: [{ type: "text", text: { content: title } }],
      },
    },
  });
}

async function patchPageMeta(pageId, title, sourcePage, client) {
  const body = {
    properties: {
      title: {
        title: [{ type: "text", text: { content: title } }],
      },
    },
  };

  const icon = sanitizeIcon(sourcePage.icon);
  const cover = sanitizeCover(sourcePage.cover);
  if (icon) body.icon = icon;
  if (cover) body.cover = cover;

  await client.request("PATCH", `pages/${pageId}`, body);
}

async function appendBlocks(blockId, blocks, client) {
  if (blocks.length === 0) return;

  for (let index = 0; index < blocks.length; index += 100) {
    await client.request("PATCH", `blocks/${blockId}/children`, {
      children: blocks.slice(index, index + 100),
    });
  }
}

async function clonePageTree({
  sourcePageId,
  destinationParentId,
  destinationTitle,
  destinationPathSegments,
  timestamp,
  sourceClient,
  destinationClient,
}) {
  const sourcePage = await sourceClient.request("GET", `pages/${sourcePageId}`);
  const createdPage = await createChildPage(destinationParentId, destinationTitle, destinationClient);
  await patchPageMeta(createdPage.id, destinationTitle, sourcePage, destinationClient);

  const sourceBlocks = await sourceClient.getChildren(sourcePageId);
  const clonedBlocks = [];
  for (const block of sourceBlocks) {
    const cloned = await cloneBlock(
      block,
      pathFromSegments(destinationPathSegments),
      timestamp,
      sourceClient,
    );
    if (cloned) clonedBlocks.push(cloned);
  }
  await appendBlocks(createdPage.id, clonedBlocks, destinationClient);

  for (const childPage of sourceBlocks.filter((block) => block.type === "child_page")) {
    await clonePageTree({
      sourcePageId: childPage.id,
      destinationParentId: createdPage.id,
      destinationTitle: childPage.child_page.title,
      destinationPathSegments: [...destinationPathSegments, childPage.child_page.title],
      timestamp,
      sourceClient,
      destinationClient,
    });
  }

  return createdPage.id;
}

async function getCanonicalSource(pageId, client) {
  const blocks = await client.getChildren(pageId);
  const match = blocks.find(
    (block) => block.type === "paragraph" && plainText(block.paragraph.rich_text).startsWith("Canonical Source:"),
  );
  return match ? plainText(match.paragraph.rich_text) : "";
}

async function verifyExpectedTree(pageId, node, projectName, client, failures, pathTitles = []) {
  const page = await client.request("GET", `pages/${pageId}`);
  const path = pathTitles.join(" > ");

  if (!page.icon) {
    failures.push(`Missing icon on ${path}`);
  }

  const canonical = await getCanonicalSource(pageId, client);
  const expectedCanonical = `Canonical Source: ${projectPath(projectName, pathTitles.slice(1))}`;
  if (canonical !== expectedCanonical) {
    failures.push(`Canonical Source mismatch on ${path}: expected "${expectedCanonical}", got "${canonical || "missing"}"`);
  }

  const childPages = (await client.getChildren(pageId)).filter((block) => block.type === "child_page");
  const expectedTitles = node.children.map((child) => child.title);
  const actualTitles = childPages.map((child) => child.child_page.title);

  if (expectedTitles.join("|") !== actualTitles.join("|")) {
    failures.push(`Child page mismatch on ${path}: expected [${expectedTitles.join(", ")}], got [${actualTitles.join(", ")}]`);
  }

  for (const expectedChild of node.children) {
    const actualChild = childPages.find((child) => child.child_page.title === expectedChild.title);
    if (!actualChild) continue;
    await verifyExpectedTree(
      actualChild.id,
      expectedChild,
      projectName,
      client,
      failures,
      [...pathTitles, expectedChild.title],
    );
  }
}

async function collectExpectedPageIds(pageId, node, client, collected = [], pathTitles = []) {
  collected.push({ title: node.title, id: pageId, path: pathTitles.join(" > ") });
  const childPages = (await client.getChildren(pageId)).filter((block) => block.type === "child_page");
  for (const expectedChild of node.children) {
    const actualChild = childPages.find((child) => child.child_page.title === expectedChild.title);
    if (!actualChild) continue;
    await collectExpectedPageIds(actualChild.id, expectedChild, client, collected, [...pathTitles, expectedChild.title]);
  }
  return collected;
}

async function verifyScope(projectPageId, projectName, config, projectTokenEnv) {
  const projectToken = getProjectToken(projectTokenEnv);
  const client = makeNotionClient(projectToken, config.notionVersion);
  const failures = [];
  const workspaceClient = makeNotionClient(getWorkspaceToken(), config.notionVersion);
  const rootNode = { title: projectName, children: config.projectStarter.children };
  const allowedChecks = await collectExpectedPageIds(projectPageId, rootNode, workspaceClient, [], [projectName]);

  for (const check of allowedChecks) {
    const response = await client.requestMaybe("GET", `blocks/${check.id}/children?page_size=1`);
    if (!response.ok) {
      failures.push(`Project token could not read allowed page ${check.path}.`);
    }
  }

  for (const [label, pageId] of Object.entries(config.workspace.forbiddenScopePageIds)) {
    const response = await client.requestMaybe("GET", `blocks/${pageId}/children?page_size=1`);
    if (response.ok) {
      failures.push(`Project token unexpectedly read forbidden page "${label}".`);
    }
  }

  return failures;
}

export async function createProject(projectName, config) {
  const workspaceToken = getWorkspaceToken();
  const client = makeNotionClient(workspaceToken, config.notionVersion);

  const existing = await findChildPage(config.workspace.projectsPageId, projectName, client);
  if (existing) {
    throw new Error(`A project named "${projectName}" already exists under Projects.`);
  }

  const timestamp = nowTimestamp();
  const projectId = await clonePageTree({
    sourcePageId: config.workspace.projectTemplatesPageId,
    destinationParentId: config.workspace.projectsPageId,
    destinationTitle: projectName,
    destinationPathSegments: ["Projects", projectName],
    timestamp,
    sourceClient: client,
    destinationClient: client,
  });

  return {
    projectId,
    recommendedProjectTokenEnv: deriveProjectTokenEnv(projectName),
    destinationPath: projectPath(projectName),
    timestamp,
  };
}

export async function verifyProject(projectName, config, projectTokenEnv) {
  const client = makeNotionClient(getWorkspaceToken(), config.notionVersion);
  const projectRoot = await findChildPage(config.workspace.projectsPageId, projectName, client);
  if (!projectRoot) {
    throw new Error(`Project "${projectName}" does not exist under Projects.`);
  }

  const failures = [];
  const rootNode = {
    title: projectName,
    children: config.projectStarter.children,
  };
  await verifyExpectedTree(projectRoot.id, rootNode, projectName, client, failures, [projectName]);

  if (projectTokenEnv) {
    failures.push(...(await verifyScope(projectRoot.id, projectName, config, projectTokenEnv)));
  }

  return {
    projectId: projectRoot.id,
    failures,
  };
}

