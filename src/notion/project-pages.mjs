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
  findAccessDomainTarget,
  findAccessRecordTarget,
  resolveAccessDomainTarget,
  resolveAccessTarget,
  findBuildRecordTarget,
  findBuildsContainerTarget,
  findRunbookTarget,
  resolveBuildRecordTarget,
  resolveOpsTarget,
  resolveRunbookTarget,
  resolveRunbooksContainerTarget,
} from "./page-targets.mjs";
import {
  ACCESS_DOMAIN_ICON,
  ACCESS_TOKEN_ICON,
  BUILDS_CONTAINER_ICON,
  BUILD_RECORD_ICON,
  RUNBOOK_ICON,
  SECRET_RECORD_ICON,
  buildManagedAccessDomainMarkdown,
  buildManagedAccessTokenMarkdown,
  buildManagedBuildRecordMarkdown,
  buildManagedBuildsContainerMarkdown,
  buildManagedSecretRecordMarkdown,
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

async function resolveAccessDomainContext({
  config,
  projectName,
  domainTitle,
  projectTokenEnv,
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

  const accessTarget = await resolveAccessTarget(projectName, config, workspaceClient);
  const domainTarget = await findAccessDomainTarget(projectName, domainTitle, config, workspaceClient);

  if (!domainTarget) {
    throw new Error(
      `Access domain "${domainTitle}" does not exist at ${accessTarget.targetPath} > ${domainTitle}. Use "access-domain create" or "access-domain adopt" first.`,
    );
  }

  return {
    workspaceClient,
    surfaceClient,
    authMode,
    accessTarget,
    domainTarget,
  };
}

async function resolveManagedAccessRecordTarget(projectName, domainTitle, title, config, client, surfaceLabel, adoptCommand) {
  const accessTarget = await resolveAccessTarget(projectName, config, client);
  const domainTarget = await findAccessDomainTarget(projectName, domainTitle, config, client);

  if (!domainTarget) {
    throw new Error(
      `Access domain "${domainTitle}" does not exist at ${accessTarget.targetPath} > ${domainTitle}. Use "access-domain create" or "access-domain adopt" first.`,
    );
  }

  const recordTarget = await findAccessRecordTarget(projectName, domainTitle, title, config, client);
  if (!recordTarget) {
    throw new Error(`${surfaceLabel} "${title}" does not exist at ${domainTarget.targetPath} > ${title}. Use "${adoptCommand}" only for an existing page or create the record first.`);
  }

  return recordTarget;
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

export async function createAccessDomain({
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

  const accessTarget = await resolveAccessTarget(projectName, config, workspaceClient);
  const existing = await findAccessDomainTarget(projectName, title, config, workspaceClient);
  if (existing) {
    throw new Error(`Access domain "${title}" already exists at ${existing.targetPath}.`);
  }

  const markdown = buildManagedAccessDomainMarkdown({
    projectName,
    title,
    bodyMarkdown: ensureBodyMarkdown(fileBodyMarkdown),
    timestamp,
  });
  const targetPath = `${accessTarget.targetPath} > ${title}`;
  const diff = diffMarkdownText("", markdown);

  if (!apply) {
    return {
      pageId: null,
      projectId: accessTarget.projectId,
      targetPath,
      authMode,
      hasDiff: true,
      diff,
      applied: false,
      timestamp: null,
    };
  }

  const pageId = await createManagedChildPage(accessTarget.pageId, title, ACCESS_DOMAIN_ICON, markdown, surfaceClient);

  return {
    pageId,
    projectId: accessTarget.projectId,
    targetPath,
    authMode,
    hasDiff: true,
    diff,
    applied: true,
    timestamp,
  };
}

export async function adoptAccessDomain({
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

  const target = await resolveAccessDomainTarget(projectName, title, config, workspaceClient);
  const currentMarkdown = await fetchPageMarkdown(target.pageId, target.targetPath, surfaceClient);
  if (splitManagedPageMarkdownIfPresent(currentMarkdown)) {
    throw alreadyManagedError("Access domain", title);
  }

  const nextMarkdown = buildManagedAccessDomainMarkdown({
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
    await patchPageIcon(target.pageId, ACCESS_DOMAIN_ICON, surfaceClient);
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

export async function pullAccessDomainBody(options) {
  return pullManagedSurfaceBody({
    ...options,
    targetResolver: resolveAccessDomainTarget,
    surfaceLabel: "Access domain",
    unmanagedHint: 'Use "access-domain adopt" first.',
  });
}

export async function diffAccessDomainBody(options) {
  return diffManagedSurfaceBody({
    ...options,
    targetResolver: resolveAccessDomainTarget,
    surfaceLabel: "Access domain",
    unmanagedHint: 'Use "access-domain adopt" first.',
  });
}

export async function pushAccessDomainBody(options) {
  return pushManagedSurfaceBody({
    ...options,
    targetResolver: resolveAccessDomainTarget,
    surfaceLabel: "Access domain",
    unmanagedHint: 'Use "access-domain adopt" first.',
  });
}

export async function createSecretRecord({
  config,
  projectName,
  domainTitle,
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
  const context = await resolveAccessDomainContext({
    config,
    projectName,
    domainTitle,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const existing = await findAccessRecordTarget(projectName, domainTitle, title, config, context.workspaceClient);
  if (existing) {
    throw new Error(`Secret record "${title}" already exists at ${existing.targetPath}.`);
  }

  const markdown = buildManagedSecretRecordMarkdown({
    projectName,
    domainTitle,
    title,
    bodyMarkdown: ensureBodyMarkdown(fileBodyMarkdown),
    timestamp,
  });
  const targetPath = `${context.domainTarget.targetPath} > ${title}`;
  const diff = diffMarkdownText("", markdown);

  if (!apply) {
    return {
      pageId: null,
      projectId: context.domainTarget.projectId,
      targetPath,
      authMode: context.authMode,
      hasDiff: true,
      diff,
      applied: false,
      timestamp: null,
    };
  }

  const pageId = await createManagedChildPage(context.domainTarget.pageId, title, SECRET_RECORD_ICON, markdown, context.surfaceClient);

  return {
    pageId,
    projectId: context.domainTarget.projectId,
    targetPath,
    authMode: context.authMode,
    hasDiff: true,
    diff,
    applied: true,
    timestamp,
  };
}

export async function adoptSecretRecord({
  config,
  projectName,
  domainTitle,
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
  const context = await resolveAccessDomainContext({
    config,
    projectName,
    domainTitle,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const target = await resolveManagedAccessRecordTarget(
    projectName,
    domainTitle,
    title,
    config,
    context.workspaceClient,
    "Secret record",
    "secret-record adopt",
  );
  const currentMarkdown = await fetchPageMarkdown(target.pageId, target.targetPath, context.surfaceClient);
  if (splitManagedPageMarkdownIfPresent(currentMarkdown)) {
    throw alreadyManagedError("Secret record", title);
  }

  const nextMarkdown = buildManagedSecretRecordMarkdown({
    projectName,
    domainTitle,
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
      authMode: context.authMode,
      hasDiff: diff.length > 0,
      diff,
      applied: false,
      timestamp: null,
    };
  }

  const page = await context.surfaceClient.request("GET", `pages/${target.pageId}`);
  if (!page.icon) {
    await patchPageIcon(target.pageId, SECRET_RECORD_ICON, context.surfaceClient);
  }
  await replacePageMarkdown(target.pageId, target.targetPath, nextMarkdown, context.surfaceClient);

  return {
    pageId: target.pageId,
    projectId: target.projectId,
    targetPath: target.targetPath,
    authMode: context.authMode,
    hasDiff: diff.length > 0,
    diff,
    applied: true,
    timestamp,
  };
}

export async function pullSecretRecordBody({
  domainTitle,
  ...options
}) {
  return pullManagedSurfaceBody({
    ...options,
    domainTitle,
    targetResolver: (projectName, title, config, client) => resolveManagedAccessRecordTarget(
      projectName,
      domainTitle,
      title,
      config,
      client,
      "Secret record",
      "secret-record adopt",
    ),
    surfaceLabel: "Secret record",
    unmanagedHint: 'Use "secret-record adopt" first.',
  });
}

export async function diffSecretRecordBody({
  domainTitle,
  ...options
}) {
  return diffManagedSurfaceBody({
    ...options,
    domainTitle,
    targetResolver: (projectName, title, config, client) => resolveManagedAccessRecordTarget(
      projectName,
      domainTitle,
      title,
      config,
      client,
      "Secret record",
      "secret-record adopt",
    ),
    surfaceLabel: "Secret record",
    unmanagedHint: 'Use "secret-record adopt" first.',
  });
}

export async function pushSecretRecordBody({
  domainTitle,
  ...options
}) {
  return pushManagedSurfaceBody({
    ...options,
    domainTitle,
    targetResolver: (projectName, title, config, client) => resolveManagedAccessRecordTarget(
      projectName,
      domainTitle,
      title,
      config,
      client,
      "Secret record",
      "secret-record adopt",
    ),
    surfaceLabel: "Secret record",
    unmanagedHint: 'Use "secret-record adopt" first.',
  });
}

export async function createAccessToken({
  config,
  projectName,
  domainTitle,
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
  const context = await resolveAccessDomainContext({
    config,
    projectName,
    domainTitle,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const existing = await findAccessRecordTarget(projectName, domainTitle, title, config, context.workspaceClient);
  if (existing) {
    throw new Error(`Access token "${title}" already exists at ${existing.targetPath}.`);
  }

  const markdown = buildManagedAccessTokenMarkdown({
    projectName,
    domainTitle,
    title,
    bodyMarkdown: ensureBodyMarkdown(fileBodyMarkdown),
    timestamp,
  });
  const targetPath = `${context.domainTarget.targetPath} > ${title}`;
  const diff = diffMarkdownText("", markdown);

  if (!apply) {
    return {
      pageId: null,
      projectId: context.domainTarget.projectId,
      targetPath,
      authMode: context.authMode,
      hasDiff: true,
      diff,
      applied: false,
      timestamp: null,
    };
  }

  const pageId = await createManagedChildPage(context.domainTarget.pageId, title, ACCESS_TOKEN_ICON, markdown, context.surfaceClient);

  return {
    pageId,
    projectId: context.domainTarget.projectId,
    targetPath,
    authMode: context.authMode,
    hasDiff: true,
    diff,
    applied: true,
    timestamp,
  };
}

export async function adoptAccessToken({
  config,
  projectName,
  domainTitle,
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
  const context = await resolveAccessDomainContext({
    config,
    projectName,
    domainTitle,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const target = await resolveManagedAccessRecordTarget(
    projectName,
    domainTitle,
    title,
    config,
    context.workspaceClient,
    "Access token",
    "access-token adopt",
  );
  const currentMarkdown = await fetchPageMarkdown(target.pageId, target.targetPath, context.surfaceClient);
  if (splitManagedPageMarkdownIfPresent(currentMarkdown)) {
    throw alreadyManagedError("Access token", title);
  }

  const nextMarkdown = buildManagedAccessTokenMarkdown({
    projectName,
    domainTitle,
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
      authMode: context.authMode,
      hasDiff: diff.length > 0,
      diff,
      applied: false,
      timestamp: null,
    };
  }

  const page = await context.surfaceClient.request("GET", `pages/${target.pageId}`);
  if (!page.icon) {
    await patchPageIcon(target.pageId, ACCESS_TOKEN_ICON, context.surfaceClient);
  }
  await replacePageMarkdown(target.pageId, target.targetPath, nextMarkdown, context.surfaceClient);

  return {
    pageId: target.pageId,
    projectId: target.projectId,
    targetPath: target.targetPath,
    authMode: context.authMode,
    hasDiff: diff.length > 0,
    diff,
    applied: true,
    timestamp,
  };
}

export async function pullAccessTokenBody({
  domainTitle,
  ...options
}) {
  return pullManagedSurfaceBody({
    ...options,
    domainTitle,
    targetResolver: (projectName, title, config, client) => resolveManagedAccessRecordTarget(
      projectName,
      domainTitle,
      title,
      config,
      client,
      "Access token",
      "access-token adopt",
    ),
    surfaceLabel: "Access token",
    unmanagedHint: 'Use "access-token adopt" first.',
  });
}

export async function diffAccessTokenBody({
  domainTitle,
  ...options
}) {
  return diffManagedSurfaceBody({
    ...options,
    domainTitle,
    targetResolver: (projectName, title, config, client) => resolveManagedAccessRecordTarget(
      projectName,
      domainTitle,
      title,
      config,
      client,
      "Access token",
      "access-token adopt",
    ),
    surfaceLabel: "Access token",
    unmanagedHint: 'Use "access-token adopt" first.',
  });
}

export async function pushAccessTokenBody({
  domainTitle,
  ...options
}) {
  return pushManagedSurfaceBody({
    ...options,
    domainTitle,
    targetResolver: (projectName, title, config, client) => resolveManagedAccessRecordTarget(
      projectName,
      domainTitle,
      title,
      config,
      client,
      "Access token",
      "access-token adopt",
    ),
    surfaceLabel: "Access token",
    unmanagedHint: 'Use "access-token adopt" first.',
  });
}
