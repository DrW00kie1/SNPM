import path from "node:path";
import { readFileSync } from "node:fs";

import { pushDocBody } from "./doc-pages.mjs";
import {
  createManifestV2SyncCheckAdapters,
  targetForManifestV2SyncEntry,
} from "./manifest-sync-check.mjs";
import {
  normalizeMarkdownNewlines,
  pushApprovedPageBody,
} from "./page-markdown.mjs";
import {
  assertPullPageMetadataFresh,
  validatePullPageMetadata,
} from "./page-metadata.mjs";
import { pushRunbookBody } from "./project-pages.mjs";
import { pushValidationSessionFile } from "./validation-sessions.mjs";

const SIDECAR_STALE_WARNING = 'Applied manifest v2 sync push mutations make local metadata sidecars stale. Run "sync pull --apply" before the next push.';
const PARTIAL_APPLY_RECOVERY = 'No rollback was attempted. Run "sync pull --apply" to refresh local files and sidecars before retrying.';

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingLocalFileError(error) {
  return error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

function projectNameForEntry(entry, manifest) {
  return entry.projectName || manifest.projectName;
}

function docProjectNameForEntry(entry, manifest) {
  if (entry.kind === "project-doc") {
    return projectNameForEntry(entry, manifest);
  }

  return entry.projectName || undefined;
}

function commandFamilyForEntry(entry) {
  if (entry.kind === "planning-page") {
    return "page";
  }

  if (entry.kind === "project-doc" || entry.kind === "template-doc" || entry.kind === "workspace-doc") {
    return "doc";
  }

  if (entry.kind === "validation-session") {
    return "validation-session";
  }

  return entry.kind;
}

function entryFilePath(entry, manifest) {
  const candidate = entry.absoluteFilePath
    || (entry.file && manifest.manifestDir ? path.resolve(manifest.manifestDir, entry.file) : entry.file);

  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new Error(`Manifest ${entry.kind} entry "${targetForManifestV2SyncEntry(entry)}" is missing an absolute file path.`);
  }

  return path.resolve(candidate);
}

function entryMetadataPath(filePath) {
  return `${filePath}.snpm-meta.json`;
}

function buildEntryDescriptor(entry, manifest) {
  const filePath = entryFilePath(entry, manifest);

  return {
    entry,
    filePath,
    metadataPath: entryMetadataPath(filePath),
  };
}

function buildEntryBase(descriptor) {
  return {
    kind: descriptor.entry.kind,
    target: targetForManifestV2SyncEntry(descriptor.entry),
    file: descriptor.entry.file,
    targetPath: null,
    metadataPath: descriptor.metadataPath || null,
  };
}

function buildTopLevelFailure(entry, error) {
  const target = targetForManifestV2SyncEntry(entry);
  return `${entry.kind} "${target}" (${entry.file}): ${toErrorMessage(error)}`;
}

function buildErrorEntry(descriptor, error) {
  return {
    ...buildEntryBase(descriptor),
    status: "error",
    hasDiff: false,
    diff: "",
    applied: false,
    failure: toErrorMessage(error),
  };
}

function requireLocalMarkdown(descriptor, { readFileSyncImpl = readFileSync } = {}) {
  try {
    return normalizeMarkdownNewlines(readFileSyncImpl(descriptor.filePath, "utf8"));
  } catch (error) {
    if (isMissingLocalFileError(error)) {
      throw new Error(`Local sync file "${descriptor.entry.file}" does not exist. Run "sync pull --apply" first.`);
    }

    throw error;
  }
}

function readMetadataSidecar(descriptor, { readFileSyncImpl = readFileSync } = {}) {
  let rawMetadata;

  try {
    rawMetadata = readFileSyncImpl(descriptor.metadataPath, "utf8");
  } catch (error) {
    if (isMissingLocalFileError(error)) {
      throw new Error(`Metadata sidecar "${descriptor.metadataPath}" is required for sync push --apply. Run "sync pull --apply" first.`);
    }

    throw new Error(`Unable to read metadata sidecar "${descriptor.metadataPath}": ${toErrorMessage(error)}`);
  }

  try {
    return validatePullPageMetadata(JSON.parse(rawMetadata));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Metadata sidecar "${descriptor.metadataPath}" is not valid JSON: ${error.message}`);
    }

    throw error;
  }
}

function normalizeDiff(diff) {
  return typeof diff === "string" ? normalizeMarkdownNewlines(diff) : "";
}

function normalizePushResult(entry, result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`${entry.kind} adapter pushLocal must return an object.`);
  }

  const diff = normalizeDiff(result.diff);
  const hasDiff = typeof result.hasDiff === "boolean" ? result.hasDiff : diff.length > 0;
  const targetPath = typeof result.targetPath === "string" && result.targetPath.trim() !== ""
    ? result.targetPath
    : null;

  if (!targetPath) {
    throw new Error(`${entry.kind} adapter pushLocal must return targetPath.`);
  }

  return {
    pageId: result.pageId || null,
    projectId: result.projectId || null,
    targetPath,
    authMode: result.authMode || null,
    hasDiff,
    diff,
    applied: result.applied === true,
    warnings: Array.isArray(result.warnings) ? result.warnings.filter(Boolean) : [],
  };
}

function liveMetadataFromRemote(entry, remote) {
  const liveMetadata = remote?.liveMetadata;
  if (liveMetadata && typeof liveMetadata === "object" && !Array.isArray(liveMetadata)) {
    return liveMetadata;
  }

  const pageId = remote?.pageId;
  const lastEditedTime = remote?.lastEditedTime
    || remote?.last_edited_time;

  if (pageId && lastEditedTime) {
    return {
      pageId,
      lastEditedTime,
      archived: remote?.archived === true || remote?.in_trash === true,
    };
  }

  throw new Error(`${entry.kind} adapter readRemote must return liveMetadata for sync push --apply preflight.`);
}

function normalizedProjectId(projectId) {
  return typeof projectId === "string" && projectId.trim() !== "" ? projectId : undefined;
}

function assertMetadataProjectMatches(metadata, expectedProjectId) {
  const normalizedExpected = normalizedProjectId(expectedProjectId);
  if (normalizedExpected === undefined) {
    if ("projectId" in metadata) {
      throw new Error(`Metadata projectId mismatch: expected no projectId, got "${metadata.projectId}".`);
    }
    return;
  }

  if (metadata.projectId !== normalizedExpected) {
    throw new Error(`Metadata projectId mismatch: expected "${normalizedExpected}", got "${metadata.projectId}".`);
  }
}

function validatePreflightMetadata({
  entry,
  manifest,
  metadata,
  preview,
  remote,
}) {
  const expectedPageId = preview.pageId || remote?.pageId || undefined;
  const expectedProjectId = normalizedProjectId(preview.projectId) || normalizedProjectId(remote?.projectId);
  const validatedMetadata = assertPullPageMetadataFresh({
    metadata,
    liveMetadata: liveMetadataFromRemote(entry, remote),
    commandFamily: commandFamilyForEntry(entry),
    workspaceName: manifest.workspaceName,
    targetPath: preview.targetPath,
    pageId: expectedPageId,
    projectId: expectedProjectId,
  });

  assertMetadataProjectMatches(validatedMetadata, expectedProjectId);

  return validatedMetadata;
}

function buildPreviewStatus(hasDiff) {
  return hasDiff ? "push-preview" : "in-sync";
}

function buildAppliedStatus(hasDiff) {
  return hasDiff ? "pushed" : "in-sync";
}

function withOptionalWarnings(entry, warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) {
    return entry;
  }

  return {
    ...entry,
    warnings,
  };
}

function buildPreflightSummaryEntry(descriptor, preview) {
  return withOptionalWarnings({
    ...buildEntryBase(descriptor),
    targetPath: preview.targetPath,
    status: buildPreviewStatus(preview.hasDiff),
    hasDiff: preview.hasDiff,
    diff: preview.diff,
    applied: false,
  }, preview.warnings);
}

function stripPreflightState(entry) {
  const {
    fileMarkdown,
    metadata,
    ...summaryEntry
  } = entry;

  return summaryEntry;
}

function buildSummary({
  manifest,
  authMode,
  entries,
  failures,
  recovery,
  warnings = [],
}) {
  const driftCount = entries.filter((entry) => entry.hasDiff).length;
  const appliedCount = entries.filter((entry) => entry.applied).length;
  const summary = {
    command: "sync-push",
    manifestPath: manifest.manifestPath,
    projectName: manifest.projectName,
    workspaceName: manifest.workspaceName,
    authMode,
    hasDiff: driftCount > 0,
    driftCount,
    appliedCount,
    failures,
    entries,
  };

  if (warnings.length > 0) {
    summary.warnings = warnings;
  }

  if (recovery) {
    summary.recovery = recovery;
  }

  return summary;
}

function requireAdapter(entry, adapters, { apply }) {
  const adapter = adapters?.[entry.kind];
  if (!adapter) {
    throw new Error(`Unsupported manifest v2 sync push kind "${entry.kind}".`);
  }

  if (typeof adapter.pushLocal !== "function") {
    throw new Error(`Manifest v2 sync push adapter "${entry.kind}" is missing pushLocal.`);
  }

  if (apply && typeof adapter.readRemote !== "function") {
    throw new Error(`Manifest v2 sync push adapter "${entry.kind}" is missing readRemote.`);
  }

  return adapter;
}

function pathCollisionKey(filePath) {
  return path.resolve(filePath).toLowerCase();
}

function addCollision(collisions, owner, message) {
  if (!collisions.has(owner.index)) {
    collisions.set(owner.index, new Set());
  }

  collisions.get(owner.index).add(message);
}

function findPathCollisions(descriptors) {
  const ownersByPath = new Map();

  for (const [index, descriptor] of descriptors.entries()) {
    for (const [role, filePath] of [["sync file", descriptor.filePath], ["sidecar", descriptor.metadataPath]]) {
      const key = pathCollisionKey(filePath);
      const owners = ownersByPath.get(key) || [];
      owners.push({
        index,
        role,
        filePath,
        entry: descriptor.entry,
      });
      ownersByPath.set(key, owners);
    }
  }

  const collisions = new Map();
  for (const owners of ownersByPath.values()) {
    if (owners.length < 2) {
      continue;
    }

    const pathLabel = owners[0].filePath;
    const ownerLabels = owners
      .map((owner) => `${owner.role} for ${owner.entry.kind} "${targetForManifestV2SyncEntry(owner.entry)}"`)
      .join(", ");
    const message = `Sync file/sidecar path collision at "${pathLabel}": ${ownerLabels}.`;

    for (const owner of owners) {
      addCollision(collisions, owner, message);
    }
  }

  return collisions;
}

async function preflightEntry({
  adapter,
  apply,
  config,
  descriptor,
  manifest,
  projectTokenEnv,
  readFileSyncImpl,
}) {
  const { entry } = descriptor;
  const fileMarkdown = requireLocalMarkdown(descriptor, { readFileSyncImpl });
  const metadata = apply
    ? readMetadataSidecar(descriptor, { readFileSyncImpl })
    : undefined;
  const preview = normalizePushResult(entry, await adapter.pushLocal({
    apply: false,
    config,
    entry,
    fileMarkdown,
    manifest,
    metadata,
    projectTokenEnv,
  }));

  let validatedMetadata = metadata;
  if (apply) {
    const remote = await adapter.readRemote({
      config,
      entry,
      manifest,
      projectTokenEnv,
    });
    validatedMetadata = validatePreflightMetadata({
      entry,
      manifest,
      metadata,
      preview,
      remote,
    });
  }

  return {
    ...buildPreflightSummaryEntry(descriptor, preview),
    fileMarkdown,
    metadata: validatedMetadata,
  };
}

async function preflightManifestEntries({
  adapters,
  apply,
  config,
  descriptors,
  manifest,
  projectTokenEnv,
  readFileSyncImpl,
}) {
  const entries = [];
  const failures = [];
  const collisions = findPathCollisions(descriptors);

  for (const [index, descriptor] of descriptors.entries()) {
    try {
      const collisionFailures = collisions.get(index);
      if (collisionFailures?.size > 0) {
        throw new Error(Array.from(collisionFailures).join(" "));
      }

      const adapter = requireAdapter(descriptor.entry, adapters, { apply });
      entries.push(await preflightEntry({
        adapter,
        apply,
        config,
        descriptor,
        manifest,
        projectTokenEnv,
        readFileSyncImpl,
      }));
    } catch (error) {
      entries.push(buildErrorEntry(descriptor, error));
      failures.push(buildTopLevelFailure(descriptor.entry, error));
    }
  }

  return {
    entries,
    failures,
  };
}

async function applyEntry({
  adapter,
  config,
  descriptor,
  entry,
  manifest,
  projectTokenEnv,
}) {
  if (!entry.hasDiff) {
    return stripPreflightState({
      ...entry,
      status: "in-sync",
      applied: false,
    });
  }

  const result = normalizePushResult(descriptor.entry, await adapter.pushLocal({
    apply: true,
    config,
    entry: descriptor.entry,
    fileMarkdown: entry.fileMarkdown,
    manifest,
    metadata: entry.metadata,
    projectTokenEnv,
  }));

  if (!result.applied) {
    throw new Error(`${descriptor.entry.kind} adapter pushLocal returned applied:false for a changed sync push entry.`);
  }

  return withOptionalWarnings({
    ...stripPreflightState(entry),
    pageId: result.pageId || entry.metadata?.pageId || null,
    projectId: result.projectId || entry.metadata?.projectId || null,
    authMode: result.authMode || entry.metadata?.authMode || null,
    metadata: entry.metadata,
    targetPath: result.targetPath,
    status: buildAppliedStatus(result.hasDiff),
    hasDiff: result.hasDiff,
    diff: result.diff,
    applied: true,
  }, result.warnings);
}

function buildApplyFailureMessage({ descriptor, error, appliedEntries }) {
  const appliedLabel = appliedEntries.length > 0
    ? appliedEntries.map((entry) => `${entry.kind} "${entry.target}"`).join(", ")
    : "none";

  return `Sync push apply failed for ${descriptor.entry.kind} "${targetForManifestV2SyncEntry(descriptor.entry)}": ${toErrorMessage(error)}. Prior remote mutations: ${appliedLabel}. The current ${descriptor.entry.kind} "${targetForManifestV2SyncEntry(descriptor.entry)}" may be partially mutated. ${PARTIAL_APPLY_RECOVERY}`;
}

function buildDescriptors(manifest) {
  return manifest.entries.map((entry) => buildEntryDescriptor(entry, manifest));
}

function pushArgsForEntry({ apply, config, entry, fileMarkdown, manifest, metadata, projectTokenEnv }) {
  const baseArgs = {
    apply,
    config,
    metadata,
    projectTokenEnv,
    workspaceName: manifest.workspaceName,
  };

  if (entry.kind === "planning-page") {
    return {
      ...baseArgs,
      fileBodyMarkdown: fileMarkdown,
      pagePath: entry.pagePath,
      projectName: projectNameForEntry(entry, manifest),
    };
  }

  if (entry.kind === "project-doc" || entry.kind === "template-doc" || entry.kind === "workspace-doc") {
    return {
      ...baseArgs,
      docPath: entry.docPath,
      fileBodyMarkdown: fileMarkdown,
      projectName: docProjectNameForEntry(entry, manifest),
    };
  }

  if (entry.kind === "runbook") {
    return {
      ...baseArgs,
      commandFamily: "runbook",
      fileBodyMarkdown: fileMarkdown,
      projectName: projectNameForEntry(entry, manifest),
      title: entry.title,
    };
  }

  if (entry.kind === "validation-session") {
    return {
      ...baseArgs,
      fileMarkdown,
      projectName: projectNameForEntry(entry, manifest),
      title: entry.title,
    };
  }

  throw new Error(`Unsupported manifest v2 sync push kind "${entry.kind}".`);
}

export function createManifestV2SyncPushAdapters({
  createManifestV2SyncCheckAdaptersImpl = createManifestV2SyncCheckAdapters,
  pushApprovedPageBodyImpl = pushApprovedPageBody,
  pushDocBodyImpl = pushDocBody,
  pushRunbookBodyImpl = pushRunbookBody,
  pushValidationSessionFileImpl = pushValidationSessionFile,
} = {}) {
  const checkAdapters = createManifestV2SyncCheckAdaptersImpl();
  const pushImpls = {
    "planning-page": pushApprovedPageBodyImpl,
    "project-doc": pushDocBodyImpl,
    "template-doc": pushDocBodyImpl,
    "workspace-doc": pushDocBodyImpl,
    runbook: pushRunbookBodyImpl,
    "validation-session": pushValidationSessionFileImpl,
  };

  return Object.fromEntries(Object.entries(pushImpls).map(([kind, pushImpl]) => [kind, {
    async readRemote(input) {
      const readRemote = checkAdapters?.[kind]?.readRemote;
      if (typeof readRemote !== "function") {
        throw new Error(`Manifest v2 sync push adapter "${kind}" is missing readRemote.`);
      }

      return readRemote(input);
    },
    async pushLocal(input) {
      return pushImpl(pushArgsForEntry(input));
    },
  }]));
}

export async function pushManifestV2SyncManifest({
  adapters = createManifestV2SyncPushAdapters(),
  apply = false,
  config,
  manifest,
  projectTokenEnv,
  readFileSyncImpl = readFileSync,
}) {
  const descriptors = buildDescriptors(manifest);
  const preflight = await preflightManifestEntries({
    adapters,
    apply,
    config,
    descriptors,
    manifest,
    projectTokenEnv,
    readFileSyncImpl,
  });

  if (!apply || preflight.failures.length > 0) {
    return buildSummary({
      manifest,
      authMode: projectTokenEnv ? "project-token" : "workspace-token",
      entries: preflight.entries.map(stripPreflightState),
      failures: preflight.failures,
    });
  }

  const entries = [];
  const failures = [];
  const appliedEntries = [];

  for (const [index, entry] of preflight.entries.entries()) {
    const descriptor = descriptors[index];
    try {
      const adapter = requireAdapter(descriptor.entry, adapters, { apply: true });
      const appliedEntry = await applyEntry({
        adapter,
        config,
        descriptor,
        entry,
        manifest,
        projectTokenEnv,
      });
      entries.push(appliedEntry);
      if (appliedEntry.applied) {
        appliedEntries.push(appliedEntry);
      }
    } catch (error) {
      const failure = buildApplyFailureMessage({
        descriptor,
        error,
        appliedEntries,
      });
      entries.push({
        ...stripPreflightState(entry),
        status: "error",
        applied: false,
        failure,
      });
      failures.push(buildTopLevelFailure(descriptor.entry, new Error(failure)));

      for (const remainingEntry of preflight.entries.slice(index + 1)) {
        entries.push(stripPreflightState(remainingEntry));
      }
      break;
    }
  }

  const warnings = appliedEntries.length > 0 && failures.length === 0
    ? [SIDECAR_STALE_WARNING]
    : [];

  return buildSummary({
    manifest,
    authMode: projectTokenEnv ? "project-token" : "workspace-token",
    entries,
    failures,
    recovery: failures.length > 0 ? PARTIAL_APPLY_RECOVERY : undefined,
    warnings,
  });
}
