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
  fetchPageMarkdown,
  MANAGED_BODY_NORMALIZATIONS,
  normalizeEditableBodyMarkdown,
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

const GENERATED_SECRET_REDACTION_MARKER = "[SNPM REDACTED SECRET OUTPUT]";

function ensureBodyMarkdown(fileBodyMarkdown) {
  return normalizeEditableBodyMarkdown(fileBodyMarkdown || "");
}

function managedPageError(surfaceLabel, title, hint) {
  return new Error(`${surfaceLabel} "${title}" is not managed by SNPM yet. ${hint}`);
}

function alreadyManagedError(surfaceLabel, title) {
  return new Error(`${surfaceLabel} "${title}" is already managed by SNPM. Use pull, diff, or push instead.`);
}

function isMarkdownHeading(line) {
  return /^#{1,6}\s+/.test(line);
}

function isRawValueHeading(line) {
  return /^#{1,6}\s+Raw Value\s*$/i.test(line);
}

function parseFenceOpen(line) {
  const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) {
    return null;
  }

  return {
    char: match[1][0],
    length: match[1].length,
  };
}

function isFenceClose(line, opener) {
  const trimmed = line.trim();
  const match = /^(`+|~+)/.exec(trimmed);
  if (!match) {
    return false;
  }

  return match[1][0] === opener.char
    && match[1].length >= opener.length
    && trimmed.slice(match[1].length).trim() === "";
}

function isAllowedRawValueText(line) {
  return line.trim() === "" || /^Raw Value\s*$/i.test(line.trim());
}

function isPlaceholderRawValue(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return true;
  }

  const lower = trimmed.toLowerCase();
  return lower === "<paste secret here>"
    || lower === "<paste scoped token here>"
    || (/^<[^>\n]+>$/.test(trimmed) && /(api\s*key|client\s*secret|paste|password|scoped\s*token|secret|token|value)/i.test(trimmed))
    || /^(?:change[-_ ]?me|example[-_ ]?(?:secret|token|value)|n\/a|none|null|placeholder|replace[-_ ]?me|tbd|todo)$/i.test(trimmed);
}

function isRedactedRawValue(value) {
  const trimmed = String(value || "").trim();
  return new RegExp(`^(?:\\[?redacted\\]?|<redacted>|hidden|masked|secret redacted|token redacted|${GENERATED_SECRET_REDACTION_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})$`, "i").test(trimmed)
    || /^[*xX]{6,}$/.test(trimmed);
}

function redactGeneratedRawValueError(error, rawValue) {
  const message = error instanceof Error ? error.message : String(error);
  const redacted = typeof rawValue === "string" && rawValue.length > 0
    ? message.split(rawValue).join(GENERATED_SECRET_REDACTION_MARKER)
    : "Generated secret Notion write failed.";
  return new Error(redacted);
}

function normalizeGeneratedRawValue(value, { surfaceLabel }) {
  if (typeof value !== "string") {
    throw new Error(`${surfaceLabel} generated raw value must be provided as an in-memory string.`);
  }

  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.includes("\n")) {
    throw new Error(`${surfaceLabel} generated raw value must be a single line.`);
  }

  if (normalized.includes("\0")) {
    throw new Error(`${surfaceLabel} generated raw value contains unsupported NUL bytes.`);
  }

  if (normalized.length > 8192) {
    throw new Error(`${surfaceLabel} generated raw value is too large for the write-only ingestion lane.`);
  }

  if (!normalized.trim()) {
    throw new Error(`${surfaceLabel} generated raw value cannot be empty.`);
  }

  if (isPlaceholderRawValue(normalized)) {
    throw new Error(`${surfaceLabel} generated raw value cannot be a placeholder.`);
  }

  if (isRedactedRawValue(normalized)) {
    throw new Error(`${surfaceLabel} generated raw value cannot be redacted output.`);
  }

  return normalized;
}

function buildRawValueFence(rawValue) {
  const longestRun = Math.max(0, ...Array.from(String(rawValue).matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return {
    open: `${fence}plain text`,
    close: fence,
  };
}

function findRawValueFence(markdown, { allowPlaceholder = false, command }) {
  const lines = normalizeMarkdownNewlines(markdown || "").split("\n");
  const sections = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!isRawValueHeading(lines[index])) {
      continue;
    }

    let end = index + 1;
    while (end < lines.length && !isMarkdownHeading(lines[end])) {
      end += 1;
    }

    sections.push({
      headingIndex: index,
      startIndex: index + 1,
      endIndex: end,
    });
  }

  if (sections.length !== 1) {
    throw new Error(`${command} requires exactly one managed ## Raw Value section.`);
  }

  const section = sections[0];
  let openIndex = null;
  let closeIndex = null;
  let opener = null;

  for (let index = section.startIndex; index < section.endIndex; index += 1) {
    if (openIndex === null) {
      const opening = parseFenceOpen(lines[index]);
      if (opening) {
        openIndex = index;
        opener = opening;
        continue;
      }

      if (!isAllowedRawValueText(lines[index])) {
        throw new Error(`${command} Raw Value must contain exactly one fenced value and no plaintext secret material.`);
      }
      continue;
    }

    if (closeIndex === null) {
      if (isFenceClose(lines[index], opener)) {
        closeIndex = index;
      }
      continue;
    }

    if (parseFenceOpen(lines[index])) {
      throw new Error(`${command} Raw Value must contain exactly one fenced value.`);
    }

    if (!isAllowedRawValueText(lines[index])) {
      throw new Error(`${command} Raw Value must contain exactly one fenced value and no plaintext secret material.`);
    }
  }

  if (openIndex === null || closeIndex === null) {
    throw new Error(`${command} requires exactly one fenced value under ## Raw Value.`);
  }

  const value = lines.slice(openIndex + 1, closeIndex).join("\n");
  if (!value.trim()) {
    throw new Error(`${command} cannot update an empty Raw Value.`);
  }

  if (!allowPlaceholder && isPlaceholderRawValue(value)) {
    throw new Error(`${command} cannot update a placeholder Raw Value.`);
  }

  if (isRedactedRawValue(value)) {
    throw new Error(`${command} cannot update redacted Raw Value output.`);
  }

  return {
    lines,
    openIndex,
    closeIndex,
  };
}

function replaceRawValueFence(markdown, rawValue, { allowPlaceholder = false, command }) {
  const parsed = findRawValueFence(markdown, { allowPlaceholder, command });
  const fence = buildRawValueFence(rawValue);

  return [
    ...parsed.lines.slice(0, parsed.openIndex),
    fence.open,
    rawValue,
    fence.close,
    ...parsed.lines.slice(parsed.closeIndex + 1),
  ].join("\n");
}

function redactedGeneratedAccessResult({
  pageId,
  projectId,
  targetPath,
  authMode,
  action,
  redactedChange,
  applied,
  timestamp,
}) {
  return {
    pageId,
    projectId,
    targetPath,
    authMode,
    authScope: "project-or-workspace",
    managedState: applied ? "managed" : "pending",
    preserveChildren: true,
    hasDiff: true,
    diffRedacted: true,
    redactedChange,
    generatedSecretStored: applied,
    action,
    applied,
    timestamp: applied ? timestamp : null,
    warnings: applied
      ? ["Generated raw value is write-only: SNPM stored it in Notion and did not return it locally."]
      : ["Preview only: SNPM did not run the generator and did not store a raw value."],
  };
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
  const initialLiveMetadata = await fetchLivePageMetadata(target.pageId, surfaceClient);
  const markdown = await fetchPageMarkdown(target.pageId, target.targetPath, surfaceClient);
  const liveMetadata = assertLivePageMetadataStable({
    before: initialLiveMetadata,
    after: await fetchLivePageMetadata(target.pageId, surfaceClient),
    targetPath: target.targetPath,
  });
  const managedParts = splitManagedPageMarkdownIfPresent(markdown);

  if (!managedParts) {
    throw managedPageError(surfaceLabel, title, unmanagedHint);
  }

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

async function pullManagedSurfaceBody(options) {
  const context = await loadManagedSurfaceContext(options);
  const metadata = buildPullPageMetadata({
    commandFamily: options.commandFamily || "managed-page",
    workspaceName: options.workspaceName || "infrastructure-hq",
    targetPath: context.targetPath,
    pageId: context.pageId,
    projectId: context.projectId,
    authMode: context.authMode,
    lastEditedTime: context.liveMetadata.lastEditedTime,
  });
  return {
    pageId: context.pageId,
    projectId: context.projectId,
    targetPath: context.targetPath,
    authMode: context.authMode,
    bodyMarkdown: context.bodyMarkdown,
    liveMetadata: context.liveMetadata,
    metadata,
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
    authScope: "project-or-workspace",
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

async function pushManagedSurfaceBody({
  fileBodyMarkdown,
  apply = false,
  metadata,
  commandFamily = "managed-page",
  workspaceName = "infrastructure-hq",
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
      authScope: "project-or-workspace",
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
    commandFamily,
    workspaceName,
    targetPath: context.targetPath,
    pageId: context.pageId,
    projectId: context.projectId,
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
    projectId: context.projectId,
    targetPath: context.targetPath,
    authMode: context.authMode,
    authScope: "project-or-workspace",
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

async function createGeneratedAccessRecord({
  config,
  projectName,
  domainTitle,
  title,
  generatedRawValue,
  generatedValue,
  projectTokenEnv,
  apply = false,
  timestamp = nowTimestamp(),
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
  surfaceLabel,
  icon,
  buildManagedMarkdown,
  redactedChange,
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
    throw new Error(`${surfaceLabel} "${title}" already exists at ${existing.targetPath}.`);
  }

  const targetPath = `${context.domainTarget.targetPath} > ${title}`;
  if (!apply) {
    return redactedGeneratedAccessResult({
      pageId: null,
      projectId: context.domainTarget.projectId,
      targetPath,
      authMode: context.authMode,
      action: "would-create",
      redactedChange,
      applied: false,
      timestamp,
    });
  }

  const rawValue = normalizeGeneratedRawValue(generatedRawValue ?? generatedValue, { surfaceLabel });
  const templateMarkdown = buildManagedMarkdown({
    projectName,
    domainTitle,
    title,
    bodyMarkdown: "",
    timestamp,
  });
  const markdown = replaceRawValueFence(templateMarkdown, rawValue, {
    allowPlaceholder: true,
    command: `${surfaceLabel} generated create`,
  });
  let pageId;
  try {
    pageId = await createManagedChildPage(context.domainTarget.pageId, title, icon, markdown, context.surfaceClient);
  } catch (error) {
    throw redactGeneratedRawValueError(error, rawValue);
  }

  return redactedGeneratedAccessResult({
    pageId,
    projectId: context.domainTarget.projectId,
    targetPath,
    authMode: context.authMode,
    action: "created",
    redactedChange,
    applied: true,
    timestamp,
  });
}

async function updateGeneratedAccessRecord({
  config,
  projectName,
  domainTitle,
  title,
  generatedRawValue,
  generatedValue,
  projectTokenEnv,
  apply = false,
  timestamp = nowTimestamp(),
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
  surfaceLabel,
  adoptCommand,
  redactedChange,
}) {
  const context = await loadManagedSurfaceContext({
    config,
    projectTokenEnv,
    resolveClient,
    syncClient,
    projectName,
    title,
    targetResolver: (project, recordTitle, workspaceConfig, client) => resolveManagedAccessRecordTarget(
      project,
      domainTitle,
      recordTitle,
      workspaceConfig,
      client,
      surfaceLabel,
      adoptCommand,
    ),
    surfaceLabel,
    unmanagedHint: `Use "${adoptCommand}" first.`,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  findRawValueFence(context.bodyMarkdown, {
    command: `${surfaceLabel} generated update`,
  });

  if (!apply) {
    return redactedGeneratedAccessResult({
      pageId: context.pageId,
      projectId: context.projectId,
      targetPath: context.targetPath,
      authMode: context.authMode,
      action: "would-update",
      redactedChange,
      applied: false,
      timestamp,
    });
  }

  const rawValue = normalizeGeneratedRawValue(generatedRawValue ?? generatedValue, { surfaceLabel });
  const nextBodyMarkdown = replaceRawValueFence(context.bodyMarkdown, rawValue, {
    command: `${surfaceLabel} generated update`,
  });
  const replacementMarkdown = buildManagedPageMarkdown({
    headerMarkdown: context.headerMarkdown,
    bodyMarkdown: nextBodyMarkdown,
    canonicalPath: context.targetPath,
    timestamp,
  });

  try {
    assertLivePageMetadataStable({
      before: context.liveMetadata,
      after: await fetchLivePageMetadata(context.pageId, context.client),
      targetPath: context.targetPath,
    });
    await replacePageMarkdown(context.pageId, context.targetPath, replacementMarkdown, context.client);
  } catch (error) {
    throw redactGeneratedRawValueError(error, rawValue);
  }

  return redactedGeneratedAccessResult({
    pageId: context.pageId,
    projectId: context.projectId,
    targetPath: context.targetPath,
    authMode: context.authMode,
    action: "updated",
    redactedChange,
    applied: true,
    timestamp,
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

export async function createGeneratedSecretRecord(options) {
  return createGeneratedAccessRecord({
    ...options,
    surfaceLabel: "Secret record",
    icon: SECRET_RECORD_ICON,
    buildManagedMarkdown: buildManagedSecretRecordMarkdown,
    redactedChange: "raw-value-created",
  });
}

export async function updateGeneratedSecretRecord(options) {
  return updateGeneratedAccessRecord({
    ...options,
    surfaceLabel: "Secret record",
    adoptCommand: "secret-record adopt",
    redactedChange: "raw-value-replaced",
  });
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

export async function createGeneratedAccessToken(options) {
  return createGeneratedAccessRecord({
    ...options,
    surfaceLabel: "Access token",
    icon: ACCESS_TOKEN_ICON,
    buildManagedMarkdown: buildManagedAccessTokenMarkdown,
    redactedChange: "raw-value-created",
  });
}

export async function updateGeneratedAccessToken(options) {
  return updateGeneratedAccessRecord({
    ...options,
    surfaceLabel: "Access token",
    adoptCommand: "access-token adopt",
    redactedChange: "raw-value-replaced",
  });
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
