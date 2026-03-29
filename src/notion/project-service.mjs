import { getProjectToken, getWorkspaceToken, nowTimestamp, deriveProjectTokenEnv } from "./env.mjs";
import { makeNotionClient } from "./client.mjs";
import { buildProjectRootNode, expectedCanonicalSource, pathFromSegments, projectPath } from "./project-model.mjs";
import { cloneTemplateBlock, getCanonicalSource, sanitizeCover, sanitizeIcon } from "./template-blocks.mjs";

export async function findChildPage(parentPageId, title, client) {
  const children = await client.getChildren(parentPageId);
  return children.find((child) => child.type === "child_page" && child.child_page?.title === title) || null;
}

export async function createChildPage(parentPageId, title, client) {
  return client.request("POST", "pages", {
    parent: { type: "page_id", page_id: parentPageId },
    properties: {
      title: {
        title: [{ type: "text", text: { content: title } }],
      },
    },
  });
}

export async function patchPageMeta(pageId, title, sourcePage, client) {
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

export async function appendBlocks(blockId, blocks, client) {
  if (blocks.length === 0) return;

  for (let index = 0; index < blocks.length; index += 100) {
    await client.request("PATCH", `blocks/${blockId}/children`, {
      children: blocks.slice(index, index + 100),
    });
  }
}

export async function clonePageTree({
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
    const cloned = await cloneTemplateBlock(
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

export async function verifyExpectedTree(pageId, node, projectName, client, failures, pathTitles = []) {
  const page = await client.request("GET", `pages/${pageId}`);
  const path = pathTitles.join(" > ");

  if (!page.icon) {
    failures.push(`Missing icon on ${path}`);
  }

  const canonical = await getCanonicalSource(pageId, client);
  const expected = expectedCanonicalSource(projectName, pathTitles);
  if (canonical !== expected) {
    failures.push(`Canonical Source mismatch on ${path}: expected "${expected}", got "${canonical || "missing"}"`);
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

export async function collectExpectedPageIds(pageId, node, client, collected = [], pathTitles = []) {
  collected.push({ title: node.title, id: pageId, path: pathTitles.join(" > ") });
  const childPages = (await client.getChildren(pageId)).filter((block) => block.type === "child_page");
  for (const expectedChild of node.children) {
    const actualChild = childPages.find((child) => child.child_page.title === expectedChild.title);
    if (!actualChild) continue;
    await collectExpectedPageIds(actualChild.id, expectedChild, client, collected, [...pathTitles, expectedChild.title]);
  }
  return collected;
}

export async function verifyScope(projectPageId, projectName, config, projectTokenEnv) {
  const projectToken = getProjectToken(projectTokenEnv);
  const client = makeNotionClient(projectToken, config.notionVersion);
  const failures = [];
  const workspaceClient = makeNotionClient(getWorkspaceToken(), config.notionVersion);
  const rootNode = buildProjectRootNode(projectName, config);
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
  await verifyExpectedTree(projectRoot.id, buildProjectRootNode(projectName, config), projectName, client, failures, [projectName]);

  if (projectTokenEnv) {
    failures.push(...(await verifyScope(projectRoot.id, projectName, config, projectTokenEnv)));
  }

  return {
    projectId: projectRoot.id,
    failures,
  };
}
