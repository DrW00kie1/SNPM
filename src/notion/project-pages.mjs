import { getProjectToken, getWorkspaceToken, nowTimestamp } from "./env.mjs";
import { makeNotionClient } from "./client.mjs";
import {
  buildManagedPageMarkdown,
  choosePageSyncAuth,
  diffMarkdownBodies,
  diffMarkdownText,
  fetchPageMarkdown,
  normalizeMarkdownNewlines,
  replacePageMarkdown,
  splitManagedPageMarkdownIfPresent,
} from "./page-markdown.mjs";
import {
  findBuildRecordTarget,
  findBuildsContainerTarget,
  findRunbookTarget,
  resolveBuildRecordTarget,
  resolveOpsTarget,
  resolveRunbookTarget,
  resolveRunbooksContainerTarget,
} from "./page-targets.mjs";
import {
  BUILDS_CONTAINER_ICON,
  BUILD_RECORD_ICON,
  RUNBOOK_ICON,
  buildManagedBuildRecordMarkdown,
  buildManagedBuildsContainerMarkdown,
  buildManagedRunbookMarkdown,
} from "./managed-page-templates.mjs";
import { createChildPage } from "./project-service.mjs";

function ensureBodyMarkdown(fileBodyMarkdown) {
  return normalizeMarkdownNewlines(fileBodyMarkdown || "");
}

function managedPageError(surfaceLabel, title, hint) {
  return new Error(`${surfaceLabel} "${title}" is not managed by SNPM yet. ${hint}`);
}

function alreadyManagedError(surfaceLabel, title) {
  return new Error(`${surfaceLabel} "${title}" is already managed by SNPM. Use pull, diff, or push instead.`);
}

async function buildSurfaceClients({
  config,
  projectTokenEnv,
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
      authMode: projectTokenEnv ? "project-token" : "workspace-token",
    };
  }

  const auth = choosePageSyncAuth(projectTokenEnv, {
    getProjectTokenImpl,
    getWorkspaceTokenImpl,
  });

  return {
    workspaceClient,
    surfaceClient: makeNotionClientImpl(auth.token, config.notionVersion),
    authMode: auth.authMode,
  };
}

async function patchPageIcon(pageId, icon, client) {
  if (!icon) return;
  await client.request("PATCH", `pages/${pageId}`, { icon });
}

async function createManagedChildPage(parentPageId, title, icon, markdown, client) {
  const page = await createChildPage(parentPageId, title, client);
  await patchPageIcon(page.id, icon, client);
  await replacePageMarkdown(page.id, title, markdown, client);
  return page.id;
}

async function loadManagedSurfaceContext({
  config,
  projectTokenEnv,
  resolveClient,
  syncClient,
  projectName,
  title,
  targetResolver,
  surfaceLabel,
  unmanagedHint,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const { workspaceClient, surfaceClient, authMode } = await buildSurfaceClients({
    config,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const target = await targetResolver(projectName, title, config, workspaceClient);
  const markdown = await fetchPageMarkdown(target.pageId, target.targetPath, surfaceClient);
  const managedParts = splitManagedPageMarkdownIfPresent(markdown);

  if (!managedParts) {
    throw managedPageError(surfaceLabel, title, unmanagedHint);
  }

  return {
    ...target,
    authMode,
    client: surfaceClient,
    markdown,
    headerMarkdown: managedParts.headerMarkdown,
    bodyMarkdown: managedParts.bodyMarkdown,
  };
}

async function pullManagedSurfaceBody(options) {
  const context = await loadManagedSurfaceContext(options);
  return {
    pageId: context.pageId,
    projectId: context.projectId,
    targetPath: context.targetPath,
    authMode: context.authMode,
    bodyMarkdown: context.bodyMarkdown,
  };
}

async function diffManagedSurfaceBody({
  fileBodyMarkdown,
  ...options
}) {
  const context = await loadManagedSurfaceContext(options);
  const normalizedFileBody = ensureBodyMarkdown(fileBodyMarkdown);
  const diff = diffMarkdownBodies(context.bodyMarkdown, normalizedFileBody);

  return {
    pageId: context.pageId,
    projectId: context.projectId,
    targetPath: context.targetPath,
    authMode: context.authMode,
    hasDiff: diff.length > 0,
    diff,
  };
}

async function pushManagedSurfaceBody({
  fileBodyMarkdown,
  apply = false,
  timestamp = nowTimestamp(),
  ...options
}) {
  const context = await loadManagedSurfaceContext(options);
  const normalizedFileBody = ensureBodyMarkdown(fileBodyMarkdown);
  const diff = diffMarkdownBodies(context.bodyMarkdown, normalizedFileBody);

  if (!apply || diff.length === 0) {
    return {
      pageId: context.pageId,
      projectId: context.projectId,
      targetPath: context.targetPath,
      authMode: context.authMode,
      hasDiff: diff.length > 0,
      diff,
      applied: false,
      timestamp: null,
    };
  }

  const replacementMarkdown = buildManagedPageMarkdown({
    headerMarkdown: context.headerMarkdown,
    bodyMarkdown: normalizedFileBody,
    canonicalPath: context.targetPath,
    timestamp,
  });

  await replacePageMarkdown(context.pageId, context.targetPath, replacementMarkdown, context.client);

  return {
    pageId: context.pageId,
    projectId: context.projectId,
    targetPath: context.targetPath,
    authMode: context.authMode,
    hasDiff: true,
    diff,
    applied: true,
    timestamp,
  };
}

export async function createRunbook({
  config,
  projectName,
  title,
  fileBodyMarkdown,
  projectTokenEnv,
  apply = false,
  timestamp = nowTimestamp(),
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const { workspaceClient, surfaceClient, authMode } = await buildSurfaceClients({
    config,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const runbooksTarget = await resolveRunbooksContainerTarget(projectName, config, workspaceClient);
  const existing = await findRunbookTarget(projectName, title, config, workspaceClient);
  if (existing) {
    throw new Error(`Runbook "${title}" already exists at ${existing.targetPath}.`);
  }

  const markdown = buildManagedRunbookMarkdown({
    projectName,
    title,
    bodyMarkdown: ensureBodyMarkdown(fileBodyMarkdown),
    timestamp,
  });
  const targetPath = `${runbooksTarget.targetPath} > ${title}`;
  const diff = diffMarkdownText("", markdown);

  if (!apply) {
    return {
      pageId: null,
      projectId: runbooksTarget.projectId,
      targetPath,
      authMode,
      hasDiff: true,
      diff,
      applied: false,
      timestamp: null,
    };
  }

  const pageId = await createManagedChildPage(runbooksTarget.pageId, title, RUNBOOK_ICON, markdown, surfaceClient);

  return {
    pageId,
    projectId: runbooksTarget.projectId,
    targetPath,
    authMode,
    hasDiff: true,
    diff,
    applied: true,
    timestamp,
  };
}

export async function adoptRunbook({
  config,
  projectName,
  title,
  projectTokenEnv,
  apply = false,
  timestamp = nowTimestamp(),
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const { workspaceClient, surfaceClient, authMode } = await buildSurfaceClients({
    config,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const target = await resolveRunbookTarget(projectName, title, config, workspaceClient);
  const currentMarkdown = await fetchPageMarkdown(target.pageId, target.targetPath, surfaceClient);
  if (splitManagedPageMarkdownIfPresent(currentMarkdown)) {
    throw alreadyManagedError("Runbook", title);
  }

  const nextMarkdown = buildManagedRunbookMarkdown({
    projectName,
    title,
    bodyMarkdown: currentMarkdown,
    timestamp,
  });
  const diff = diffMarkdownText(currentMarkdown, nextMarkdown);

  if (!apply) {
    return {
      pageId: target.pageId,
      projectId: target.projectId,
      targetPath: target.targetPath,
      authMode,
      hasDiff: diff.length > 0,
      diff,
      applied: false,
      timestamp: null,
    };
  }

  const page = await surfaceClient.request("GET", `pages/${target.pageId}`);
  if (!page.icon) {
    await patchPageIcon(target.pageId, RUNBOOK_ICON, surfaceClient);
  }
  await replacePageMarkdown(target.pageId, target.targetPath, nextMarkdown, surfaceClient);

  return {
    pageId: target.pageId,
    projectId: target.projectId,
    targetPath: target.targetPath,
    authMode,
    hasDiff: diff.length > 0,
    diff,
    applied: true,
    timestamp,
  };
}

export async function pullRunbookBody(options) {
  return pullManagedSurfaceBody({
    ...options,
    targetResolver: resolveRunbookTarget,
    surfaceLabel: "Runbook",
    unmanagedHint: 'Use "runbook adopt" first.',
  });
}

export async function diffRunbookBody(options) {
  return diffManagedSurfaceBody({
    ...options,
    targetResolver: resolveRunbookTarget,
    surfaceLabel: "Runbook",
    unmanagedHint: 'Use "runbook adopt" first.',
  });
}

export async function pushRunbookBody(options) {
  return pushManagedSurfaceBody({
    ...options,
    targetResolver: resolveRunbookTarget,
    surfaceLabel: "Runbook",
    unmanagedHint: 'Use "runbook adopt" first.',
  });
}

export async function createBuildRecord({
  config,
  projectName,
  title,
  fileBodyMarkdown,
  projectTokenEnv,
  apply = false,
  timestamp = nowTimestamp(),
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const { workspaceClient, surfaceClient, authMode } = await buildSurfaceClients({
    config,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const opsTarget = await resolveOpsTarget(projectName, config, workspaceClient);
  let buildsTarget = await findBuildsContainerTarget(projectName, config, workspaceClient);
  const existing = buildsTarget
    ? await findBuildRecordTarget(projectName, title, config, workspaceClient)
    : null;

  if (existing) {
    throw new Error(`Build record "${title}" already exists at ${existing.targetPath}.`);
  }

  const targetPath = `${opsTarget.targetPath} > Builds > ${title}`;
  const markdown = buildManagedBuildRecordMarkdown({
    projectName,
    title,
    bodyMarkdown: ensureBodyMarkdown(fileBodyMarkdown),
    timestamp,
  });
  const diff = diffMarkdownText("", markdown);
  const needsContainer = !buildsTarget;

  if (!apply) {
    return {
      pageId: null,
      projectId: opsTarget.projectId,
      targetPath,
      authMode,
      hasDiff: true,
      diff,
      applied: false,
      timestamp: null,
      needsContainer,
      containerCreated: false,
    };
  }

  let containerCreated = false;
  if (!buildsTarget) {
    const containerMarkdown = buildManagedBuildsContainerMarkdown({ projectName, timestamp });
    const buildsPageId = await createManagedChildPage(
      opsTarget.pageId,
      "Builds",
      BUILDS_CONTAINER_ICON,
      containerMarkdown,
      surfaceClient,
    );
    buildsTarget = {
      projectId: opsTarget.projectId,
      pageId: buildsPageId,
      pageSegments: ["Ops", "Builds"],
      targetPath: `${opsTarget.targetPath} > Builds`,
    };
    containerCreated = true;
  }

  const pageId = await createManagedChildPage(
    buildsTarget.pageId,
    title,
    BUILD_RECORD_ICON,
    markdown,
    surfaceClient,
  );

  return {
    pageId,
    projectId: buildsTarget.projectId,
    targetPath,
    authMode,
    hasDiff: true,
    diff,
    applied: true,
    timestamp,
    needsContainer,
    containerCreated,
  };
}

export async function pullBuildRecordBody(options) {
  return pullManagedSurfaceBody({
    ...options,
    targetResolver: resolveBuildRecordTarget,
    surfaceLabel: "Build record",
    unmanagedHint: 'Create or standardize it with "build-record create" before syncing.',
  });
}

export async function diffBuildRecordBody(options) {
  return diffManagedSurfaceBody({
    ...options,
    targetResolver: resolveBuildRecordTarget,
    surfaceLabel: "Build record",
    unmanagedHint: 'Create or standardize it with "build-record create" before syncing.',
  });
}

export async function pushBuildRecordBody(options) {
  return pushManagedSurfaceBody({
    ...options,
    targetResolver: resolveBuildRecordTarget,
    surfaceLabel: "Build record",
    unmanagedHint: 'Create or standardize it with "build-record create" before syncing.',
  });
}
