import { getProjectToken, getWorkspaceToken, nowTimestamp, deriveProjectTokenEnv } from "./env.mjs";
import { makeNotionClient } from "./client.mjs";
import { getManagedDocReservedRootTitles } from "./managed-doc-policy.mjs";
import { buildProjectRootNode, expectedCanonicalSource, pathFromSegments, projectPath } from "./project-model.mjs";
import { cloneTemplateBlock, getCanonicalSource, sanitizeCover, sanitizeIcon } from "./template-blocks.mjs";
import { collectValidationSessionScopeChecks, verifyValidationSessionsExtension } from "./validation-sessions.mjs";

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

export async function verifyExpectedTree(pageId, node, projectName, client, failures, pathTitles = [], config = null) {
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

  const children = await client.getChildren(pageId);
  const childPages = children.filter((block) => block.type === "child_page");
  const childDatabases = children.filter((block) => block.type === "child_database");
  const expectedTitles = node.children.map((child) => child.title);
  const actualTitles = [
    ...childPages.map((child) => child.child_page.title),
    ...childDatabases.map((child) => child.child_database.title),
  ];
  const lastPathTitle = pathTitles[pathTitles.length - 1] || "";
  const allowAnyExtras = lastPathTitle === "Runbooks" || lastPathTitle === "Access";
  const allowedExtraTitles = new Set(
    lastPathTitle === "Ops"
      ? ["Builds"]
      : lastPathTitle === "Validation"
        ? ["Validation Sessions"]
        : [],
  );
  const missingTitles = expectedTitles.filter((title) => !actualTitles.includes(title));

  let lastMatchedIndex = -1;
  let ordered = true;
  for (const title of expectedTitles) {
    const nextIndex = actualTitles.indexOf(title);
    if (nextIndex === -1) {
      ordered = false;
      break;
    }
    if (nextIndex < lastMatchedIndex) {
      ordered = false;
      break;
    }
    lastMatchedIndex = nextIndex;
  }

  const reservedRootTitles = config ? new Set(getManagedDocReservedRootTitles(config)) : null;
  const allowManagedProjectDocExtras = pathTitles.length === 1;
  const disallowedExtras = allowAnyExtras
    ? []
    : actualTitles.filter((title) => {
      if (expectedTitles.includes(title) || allowedExtraTitles.has(title)) {
        return false;
      }

      if (allowManagedProjectDocExtras && reservedRootTitles && !reservedRootTitles.has(title)) {
        return false;
      }

      return true;
    });

  if (missingTitles.length > 0 || !ordered || disallowedExtras.length > 0) {
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
      config,
    );
  }
}

async function collectDescendantPageIds(pageId, client, collected = [], pathTitles = []) {
  const childPages = (await client.getChildren(pageId)).filter((block) => block.type === "child_page");

  for (const childPage of childPages) {
    const childPathTitles = [...pathTitles, childPage.child_page.title];
    collected.push({
      title: childPage.child_page.title,
      id: childPage.id,
      path: childPathTitles.join(" > "),
    });
    await collectDescendantPageIds(childPage.id, client, collected, childPathTitles);
  }

  return collected;
}

async function verifyManagedDescendants(pageId, projectName, client, failures, pathTitles = [], options = {}) {
  const { requireIcon = true, rootTitleFilter = null, depth = 0 } = options;
  const childPages = (await client.getChildren(pageId)).filter((block) => block.type === "child_page");

  for (const childPage of childPages) {
    if (depth === 0 && typeof rootTitleFilter === "function" && !rootTitleFilter(childPage.child_page.title)) {
      continue;
    }

    const childPathTitles = [...pathTitles, childPage.child_page.title];
    const childPath = childPathTitles.join(" > ");
    const page = await client.request("GET", `pages/${childPage.id}`);
    const canonical = await getCanonicalSource(childPage.id, client);

    if (canonical) {
      if (requireIcon && !page.icon) {
        failures.push(`Missing icon on ${childPath}`);
      }

      const expected = expectedCanonicalSource(projectName, childPathTitles);
      if (canonical !== expected) {
        failures.push(`Canonical Source mismatch on ${childPath}: expected "${expected}", got "${canonical || "missing"}"`);
      }
    }

    await verifyManagedDescendants(childPage.id, projectName, client, failures, childPathTitles, {
      requireIcon,
      rootTitleFilter,
      depth: depth + 1,
    });
  }
}

export async function verifyApprovedExtensions(projectPageId, projectName, config, client, failures) {
  const reservedRootTitles = new Set(getManagedDocReservedRootTitles(config));
  await verifyManagedDescendants(projectPageId, projectName, client, failures, [projectName], {
    requireIcon: false,
    rootTitleFilter: (title) => !reservedRootTitles.has(title),
  });

  const runbooksPage = await findChildPage(projectPageId, "Runbooks", client);
  if (runbooksPage) {
    await verifyManagedDescendants(runbooksPage.id, projectName, client, failures, [projectName, "Runbooks"]);
  }

  const accessPage = await findChildPage(projectPageId, "Access", client);
  if (accessPage) {
    await verifyManagedDescendants(accessPage.id, projectName, client, failures, [projectName, "Access"]);
  }

  const opsPage = await findChildPage(projectPageId, "Ops", client);
  if (!opsPage) {
    return;
  }

  const buildsPage = await findChildPage(opsPage.id, "Builds", client);
  if (buildsPage) {
    const buildsPathTitles = [projectName, "Ops", "Builds"];
    const buildsPath = buildsPathTitles.join(" > ");
    const page = await client.request("GET", `pages/${buildsPage.id}`);
    if (!page.icon) {
      failures.push(`Missing icon on ${buildsPath}`);
    }

    const canonical = await getCanonicalSource(buildsPage.id, client);
    const expected = expectedCanonicalSource(projectName, buildsPathTitles);
    if (canonical !== expected) {
      failures.push(`Canonical Source mismatch on ${buildsPath}: expected "${expected}", got "${canonical || "missing"}"`);
    }

    await verifyManagedDescendants(buildsPage.id, projectName, client, failures, buildsPathTitles);
  }

  await verifyValidationSessionsExtension(projectPageId, projectName, client, failures);
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

async function collectManagedProjectDocScopeChecks(projectPageId, projectName, config, client) {
  const reservedRootTitles = new Set(getManagedDocReservedRootTitles(config));
  const childPages = (await client.getChildren(projectPageId)).filter((block) => block.type === "child_page");
  const collected = [];

  for (const childPage of childPages) {
    const title = childPage.child_page.title;
    if (reservedRootTitles.has(title)) {
      continue;
    }

    collected.push({
      title,
      id: childPage.id,
      path: [projectName, title].join(" > "),
    });
    await collectDescendantPageIds(childPage.id, client, collected, [projectName, title]);
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
  allowedChecks.push(...(await collectManagedProjectDocScopeChecks(projectPageId, projectName, config, workspaceClient)));
  const runbooksPage = await findChildPage(projectPageId, "Runbooks", workspaceClient);
  if (runbooksPage) {
    allowedChecks.push(...(await collectDescendantPageIds(
      runbooksPage.id,
      workspaceClient,
      [],
      [projectName, "Runbooks"],
    )));
  }
  const accessPage = await findChildPage(projectPageId, "Access", workspaceClient);
  if (accessPage) {
    allowedChecks.push(...(await collectDescendantPageIds(
      accessPage.id,
      workspaceClient,
      [],
      [projectName, "Access"],
    )));
  }
  const opsPage = await findChildPage(projectPageId, "Ops", workspaceClient);
  if (opsPage) {
    const buildsPage = await findChildPage(opsPage.id, "Builds", workspaceClient);
    if (buildsPage) {
      allowedChecks.push({
        title: "Builds",
        id: buildsPage.id,
        path: [projectName, "Ops", "Builds"].join(" > "),
      });
      allowedChecks.push(...(await collectDescendantPageIds(
        buildsPage.id,
        workspaceClient,
        [],
        [projectName, "Ops", "Builds"],
      )));
    }
  }
  allowedChecks.push(...(await collectValidationSessionScopeChecks(projectPageId, projectName, workspaceClient)));

  const dedupedChecks = [...new Map(allowedChecks.map((check) => [`${check.type || "page"}:${check.id}`, check])).values()];

  for (const check of dedupedChecks) {
    let response;
    if (check.type === "database") {
      response = await client.requestMaybe("GET", `databases/${check.id}`);
    } else if (check.type === "data_source") {
      response = await client.requestMaybe("POST", `data_sources/${check.id}/query`, { page_size: 1 });
    } else {
      response = await client.requestMaybe("GET", `blocks/${check.id}/children?page_size=1`);
    }
    if (!response.ok) {
      failures.push(`Project token could not read allowed ${check.type || "page"} ${check.path}.`);
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
  await verifyExpectedTree(projectRoot.id, buildProjectRootNode(projectName, config), projectName, client, failures, [projectName], config);
  await verifyApprovedExtensions(projectRoot.id, projectName, config, client, failures);

  if (projectTokenEnv) {
    failures.push(...(await verifyScope(projectRoot.id, projectName, config, projectTokenEnv)));
  }

  return {
    projectId: projectRoot.id,
    failures,
  };
}
