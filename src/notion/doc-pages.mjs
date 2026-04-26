import { getProjectToken, getWorkspaceToken, nowTimestamp } from "./env.mjs";
import { makeNotionClient } from "./client.mjs";
import {
  assertLivePageMetadataStable,
  assertPullPageMetadataFreshFromNotion,
  buildPullPageMetadata,
  fetchLivePageMetadata,
} from "./page-metadata.mjs";
import {
  buildManagedPageMarkdown,
  choosePageSyncAuth,
  diffMarkdownBodies,
  diffMarkdownText,
  escapeManagedHeaderText,
  fetchPageMarkdown,
  MANAGED_BODY_NORMALIZATIONS,
  normalizeEditableBodyMarkdown,
  replacePageMarkdown,
  splitManagedPageMarkdown,
  splitManagedPageMarkdownIfPresent,
} from "./page-markdown.mjs";
import {
  findProjectManagedDocTarget,
  findWorkspaceManagedDocTarget,
  prepareProjectManagedDocCreateTarget,
  prepareWorkspaceManagedDocCreateTarget,
  resolveProjectManagedDocTarget,
  resolveWorkspaceManagedDocTarget,
} from "./doc-targets.mjs";
import { getManagedDocReservedRootTitles } from "./managed-doc-policy.mjs";
import { buildManagedDocMarkdown, MANAGED_DOC_ICON } from "./managed-page-templates.mjs";
import { createChildPage } from "./project-service.mjs";

function docSurfaceError(targetPath, hint) {
  return new Error(`Doc "${targetPath}" is not managed by SNPM yet. ${hint}`);
}

function alreadyManagedDocError(targetPath) {
  return new Error(`Doc "${targetPath}" is already managed by SNPM. Use doc-pull, doc-diff, or doc-push instead.`);
}

function isTargetManagedHeader(headerMarkdown, targetPath) {
  const escapedTargetPath = escapeManagedHeaderText(targetPath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^Canonical Source: ${escapedTargetPath}$`, "m").test(headerMarkdown)
    && /^Last Updated:/m.test(headerMarkdown);
}

function buildAdoptedDocMarkdown({ markdown, targetPath, title, timestamp }) {
  const parts = splitManagedPageMarkdownIfPresent(markdown);
  if (parts && /^Canonical Source:/m.test(parts.headerMarkdown) && /^Last Updated:/m.test(parts.headerMarkdown)) {
    if (isTargetManagedHeader(parts.headerMarkdown, targetPath)) {
      throw alreadyManagedDocError(targetPath);
    }

    return buildManagedPageMarkdown({
      headerMarkdown: parts.headerMarkdown,
      bodyMarkdown: parts.bodyMarkdown,
      canonicalPath: targetPath,
      timestamp,
    });
  }

  return buildManagedDocMarkdown({
    canonicalPath: targetPath,
    title,
    bodyMarkdown: markdown,
    timestamp,
  });
}

function assertManagedHeaderFields(headerMarkdown, targetPath) {
  if (!/^Canonical Source:/m.test(headerMarkdown)) {
    throw docSurfaceError(targetPath, 'Use "doc-adopt" first.');
  }
  if (!/^Last Updated:/m.test(headerMarkdown)) {
    throw docSurfaceError(targetPath, 'Use "doc-adopt" first.');
  }
}

async function patchPageIcon(pageId, icon, client) {
  if (!icon) {
    return;
  }

  await client.request("PATCH", `pages/${pageId}`, { icon });
}

async function buildDocClients({
  config,
  projectTokenEnv,
  targetAuthScope,
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const workspaceClient = resolveClient
    || makeNotionClientImpl(getWorkspaceTokenImpl(), config.notionVersion);

  if (syncClient) {
    return {
      workspaceClient,
      surfaceClient: syncClient,
      authMode: targetAuthScope === "workspace-only"
        ? "workspace-token"
        : (projectTokenEnv ? "project-token" : "workspace-token"),
    };
  }

  if (targetAuthScope === "workspace-only") {
    return {
      workspaceClient,
      surfaceClient: workspaceClient,
      authMode: "workspace-token",
    };
  }

  const selected = choosePageSyncAuth(projectTokenEnv, {
    getProjectTokenImpl,
    getWorkspaceTokenImpl,
  });

  return {
    workspaceClient,
    surfaceClient: makeNotionClientImpl(selected.token, config.notionVersion),
    authMode: selected.authMode,
  };
}

async function resolveDocContext({
  config,
  docPath,
  projectName,
  projectTokenEnv,
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const workspaceClient = resolveClient
    || makeNotionClientImpl(getWorkspaceTokenImpl(), config.notionVersion);

  const target = projectName
    ? await resolveProjectManagedDocTarget(projectName, docPath, config, workspaceClient)
    : await resolveWorkspaceManagedDocTarget(docPath, config, workspaceClient);

  const { surfaceClient, authMode } = await buildDocClients({
    config,
    projectTokenEnv,
    targetAuthScope: target.authScope,
    resolveClient: workspaceClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const initialLiveMetadata = await fetchLivePageMetadata(target.pageId, surfaceClient);
  const markdown = await fetchPageMarkdown(target.pageId, target.targetPath, surfaceClient);
  const liveMetadata = assertLivePageMetadataStable({
    before: initialLiveMetadata,
    after: await fetchLivePageMetadata(target.pageId, surfaceClient),
    targetPath: target.targetPath,
  });
  const managedParts = splitManagedPageMarkdownIfPresent(markdown);
  if (!managedParts) {
    throw docSurfaceError(target.targetPath, 'Use "doc-adopt" first.');
  }
  assertManagedHeaderFields(managedParts.headerMarkdown, target.targetPath);

  return {
    ...target,
    authMode,
    client: surfaceClient,
    markdown,
    liveMetadata,
    headerMarkdown: managedParts.headerMarkdown,
    bodyMarkdown: managedParts.bodyMarkdown,
  };
}

async function resolveDocCreateTarget({
  config,
  docPath,
  projectName,
  projectTokenEnv,
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const workspaceClient = resolveClient
    || makeNotionClientImpl(getWorkspaceTokenImpl(), config.notionVersion);

  const target = projectName
    ? await prepareProjectManagedDocCreateTarget(projectName, docPath, config, workspaceClient)
    : await prepareWorkspaceManagedDocCreateTarget(docPath, config, workspaceClient);

  const { surfaceClient, authMode } = await buildDocClients({
    config,
    projectTokenEnv,
    targetAuthScope: target.authScope,
    resolveClient: workspaceClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  return {
    ...target,
    client: surfaceClient,
    authMode,
  };
}

async function resolveDocAdoptTarget({
  config,
  docPath,
  projectName,
  projectTokenEnv,
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const workspaceClient = resolveClient
    || makeNotionClientImpl(getWorkspaceTokenImpl(), config.notionVersion);

  const target = projectName
    ? await resolveProjectManagedDocTarget(projectName, docPath, config, workspaceClient)
    : await resolveWorkspaceManagedDocTarget(docPath, config, workspaceClient);

  const { surfaceClient, authMode } = await buildDocClients({
    config,
    projectTokenEnv,
    targetAuthScope: target.authScope,
    resolveClient: workspaceClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const markdown = await fetchPageMarkdown(target.pageId, target.targetPath, surfaceClient);
  return {
    ...target,
    markdown,
    client: surfaceClient,
    authMode,
  };
}

export async function createDoc({
  config,
  docPath,
  fileBodyMarkdown,
  projectName,
  projectTokenEnv,
  apply = false,
  timestamp = nowTimestamp(),
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const target = await resolveDocCreateTarget({
    config,
    docPath,
    projectName,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const markdown = buildManagedDocMarkdown({
    canonicalPath: target.targetPath,
    title: target.title,
    bodyMarkdown: normalizeEditableBodyMarkdown(fileBodyMarkdown || ""),
    timestamp,
  });
  const diff = diffMarkdownText("", markdown);

  if (!apply) {
    return {
      pageId: null,
      projectId: target.projectId || null,
      targetPath: target.targetPath,
      authMode: target.authMode,
      hasDiff: true,
      diff,
      applied: false,
      timestamp: null,
    };
  }

  const page = await createChildPage(target.parentPageId, target.title, target.client);
  await patchPageIcon(page.id, MANAGED_DOC_ICON, target.client);
  await replacePageMarkdown(page.id, target.targetPath, markdown, target.client);

  return {
    pageId: page.id,
    projectId: target.projectId || null,
    targetPath: target.targetPath,
    authMode: target.authMode,
    hasDiff: true,
    diff,
    applied: true,
    timestamp,
  };
}

export async function adoptDoc({
  config,
  docPath,
  projectName,
  projectTokenEnv,
  apply = false,
  timestamp = nowTimestamp(),
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const context = await resolveDocAdoptTarget({
    config,
    docPath,
    projectName,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const nextMarkdown = buildAdoptedDocMarkdown({
    markdown: context.markdown,
    targetPath: context.targetPath,
    title: context.title,
    timestamp,
  });
  const diff = diffMarkdownText(context.markdown, nextMarkdown);

  if (!apply || diff.length === 0) {
    return {
      pageId: context.pageId,
      projectId: context.projectId || null,
      targetPath: context.targetPath,
      authMode: context.authMode,
      hasDiff: diff.length > 0,
      diff,
      applied: false,
      timestamp: null,
    };
  }

  await patchPageIcon(context.pageId, MANAGED_DOC_ICON, context.client);
  await replacePageMarkdown(context.pageId, context.targetPath, nextMarkdown, context.client);

  return {
    pageId: context.pageId,
    projectId: context.projectId || null,
    targetPath: context.targetPath,
    authMode: context.authMode,
    hasDiff: true,
    diff,
    applied: true,
    timestamp,
  };
}

export async function pullDocBody(options) {
  const context = await resolveDocContext(options);
  const metadata = buildPullPageMetadata({
    commandFamily: "doc",
    workspaceName: options.workspaceName || "infrastructure-hq",
    targetPath: context.targetPath,
    pageId: context.pageId,
    projectId: context.projectId || undefined,
    authMode: context.authMode,
    lastEditedTime: context.liveMetadata.lastEditedTime,
  });
  return {
    pageId: context.pageId,
    projectId: context.projectId || null,
    targetPath: context.targetPath,
    authMode: context.authMode,
    bodyMarkdown: context.bodyMarkdown,
    liveMetadata: context.liveMetadata,
    metadata,
  };
}

export async function diffDocBody({ fileBodyMarkdown, ...options }) {
  const context = await resolveDocContext(options);
  const normalizedFileBody = normalizeEditableBodyMarkdown(fileBodyMarkdown || "");
  const diff = diffMarkdownBodies(context.bodyMarkdown, normalizedFileBody);

  return {
    pageId: context.pageId,
    projectId: context.projectId || null,
    targetPath: context.targetPath,
    authMode: context.authMode,
    authScope: context.authScope,
    managedState: "managed",
    preserveChildren: true,
    normalizationsApplied: MANAGED_BODY_NORMALIZATIONS.slice(),
    warnings: [],
    currentBodyMarkdown: context.bodyMarkdown,
    nextBodyMarkdown: normalizedFileBody,
    hasDiff: diff.length > 0,
    diff,
  };
}

export async function pushDocBody({
  fileBodyMarkdown,
  apply = false,
  metadata,
  timestamp = nowTimestamp(),
  ...options
}) {
  const context = await resolveDocContext(options);
  const normalizedFileBody = normalizeEditableBodyMarkdown(fileBodyMarkdown || "");
  const diff = diffMarkdownBodies(context.bodyMarkdown, normalizedFileBody);

  if (!apply || diff.length === 0) {
    return {
      pageId: context.pageId,
      projectId: context.projectId || null,
      targetPath: context.targetPath,
      authMode: context.authMode,
      authScope: context.authScope,
      managedState: "managed",
      preserveChildren: true,
      normalizationsApplied: MANAGED_BODY_NORMALIZATIONS.slice(),
      warnings: [],
      currentBodyMarkdown: context.bodyMarkdown,
      nextBodyMarkdown: normalizedFileBody,
      hasDiff: diff.length > 0,
      diff,
      applied: false,
      timestamp: null,
    };
  }

  const validatedMetadata = await assertPullPageMetadataFreshFromNotion({
    metadata,
    client: context.client,
    commandFamily: "doc",
    workspaceName: options.workspaceName || "infrastructure-hq",
    targetPath: context.targetPath,
    pageId: context.pageId,
    projectId: context.projectId || undefined,
  });

  const replacementMarkdown = buildManagedPageMarkdown({
    headerMarkdown: context.headerMarkdown,
    bodyMarkdown: normalizedFileBody,
    canonicalPath: context.targetPath,
    timestamp,
  });
  await replacePageMarkdown(context.pageId, context.targetPath, replacementMarkdown, context.client);

  return {
    pageId: context.pageId,
    projectId: context.projectId || null,
    targetPath: context.targetPath,
    authMode: context.authMode,
    authScope: context.authScope,
    managedState: "managed",
    preserveChildren: true,
    normalizationsApplied: MANAGED_BODY_NORMALIZATIONS.slice(),
    warnings: [],
    metadata: validatedMetadata,
    currentBodyMarkdown: context.bodyMarkdown,
    nextBodyMarkdown: normalizedFileBody,
    hasDiff: true,
    diff,
    applied: true,
    timestamp,
  };
}

function verifyManagedHeaderMarkdown(headerMarkdown, targetPath) {
  assertManagedHeaderFields(headerMarkdown, targetPath);
  if (!isTargetManagedHeader(headerMarkdown, targetPath)) {
    throw new Error(`Canonical Source mismatch on "${targetPath}".`);
  }
}

async function verifyWorkspaceDocPage(pageId, targetPath, client, failures, checkedPaths) {
  checkedPaths.push(targetPath);

  try {
    const markdown = await fetchPageMarkdown(pageId, targetPath, client);
    const parts = splitManagedPageMarkdown(markdown);
    verifyManagedHeaderMarkdown(parts.headerMarkdown, targetPath);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

async function verifyWorkspaceDocDescendants(pageId, targetPath, client, reservedRoots, failures, checkedPaths, depth = 0) {
  const childPages = (await client.getChildren(pageId)).filter((child) => child.type === "child_page");

  for (const child of childPages) {
    const title = child.child_page.title;
    if (depth === 0 && reservedRoots.has(title)) {
      continue;
    }

    const childTargetPath = `${targetPath} > ${title}`;
    await verifyWorkspaceDocPage(child.id, childTargetPath, client, failures, checkedPaths);
    await verifyWorkspaceDocDescendants(child.id, childTargetPath, client, reservedRoots, failures, checkedPaths, depth + 1);
  }
}

export async function verifyWorkspaceDocs({
  config,
  client = makeNotionClient(getWorkspaceToken(), config.notionVersion),
}) {
  const failures = [];
  const checkedPaths = [];
  const reservedRoots = new Set(getManagedDocReservedRootTitles(config));

  for (const entry of config.workspace.managedDocs.exactPages) {
    await verifyWorkspaceDocPage(entry.pageId, entry.path, client, failures, checkedPaths);
  }

  for (const entry of config.workspace.managedDocs.subtreeRoots) {
    await verifyWorkspaceDocPage(entry.pageId, entry.path, client, failures, checkedPaths);
    await verifyWorkspaceDocDescendants(entry.pageId, entry.path, client, reservedRoots, failures, checkedPaths);
  }

  return {
    checkedPaths,
    failures,
  };
}

export async function findExistingManagedDocTarget({
  config,
  docPath,
  projectName,
  client,
}) {
  return projectName
    ? findProjectManagedDocTarget(projectName, docPath, config, client)
    : findWorkspaceManagedDocTarget(docPath, config, client);
}
