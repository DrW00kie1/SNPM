import path from "node:path";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

import { pushDocBody } from "./doc-pages.mjs";
import {
  createManifestV2SyncCheckAdapters,
  targetForManifestV2SyncEntry,
} from "./manifest-sync-check.mjs";
import {
  MANIFEST_V2_PUSH_DIAGNOSTIC_CODES,
  buildManifestV2PushBudgetDiagnostic,
  buildManifestV2PushFailureDiagnostic,
  buildManifestV2PushWarningDiagnostic,
} from "./manifest-sync-diagnostics.mjs";
import {
  normalizeMarkdownNewlines,
  pushApprovedPageBody,
} from "./page-markdown.mjs";
import {
  assertPullPageMetadataFresh,
  buildPullPageMetadata,
  validatePullPageMetadata,
} from "./page-metadata.mjs";
import { pushRunbookBody } from "./project-pages.mjs";
import { pushValidationSessionFile } from "./validation-sessions.mjs";
import { resolveManifestSyncSelection } from "./manifest-selection.mjs";

const SIDECAR_STALE_WARNING = 'Applied manifest v2 sync push mutations make local metadata sidecars stale. Run "sync pull --apply" before the next push.';
const PARTIAL_APPLY_RECOVERY = 'No rollback was attempted. Run "sync pull --apply" to refresh local files and sidecars before retrying.';
const SIDECAR_REFRESH_RECOVERY = 'No rollback was attempted. Run "sync pull --apply" before the next push, or resolve the refresh failure and retry sync push --apply --refresh-sidecars.';

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

function buildSkippedEntry(entry, manifest) {
  const descriptor = buildEntryDescriptor(entry, manifest);
  return buildEntryBase(descriptor);
}

function buildTopLevelFailure(entry, error) {
  const target = targetForManifestV2SyncEntry(entry);
  return `${entry.kind} "${target}" (${entry.file}): ${toErrorMessage(error)}`;
}

function buildErrorEntry(descriptor, error, { phase = "preflight", state, targetPath } = {}) {
  return {
    ...buildEntryBase(descriptor),
    status: "error",
    hasDiff: false,
    diff: "",
    applied: false,
    failure: toErrorMessage(error),
    diagnostics: [buildManifestV2PushFailureDiagnostic({
      descriptor,
      error,
      phase,
      state,
      targetPath,
    })],
  };
}

function annotatePushError(error, context) {
  if (error && typeof error === "object") {
    Object.assign(error, context);
    throw error;
  }

  const wrapped = new Error(String(error));
  Object.assign(wrapped, context);
  throw wrapped;
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
  const pushedMarkdown = typeof result.nextBodyMarkdown === "string"
    ? normalizeMarkdownNewlines(result.nextBodyMarkdown)
    : typeof result.nextFileMarkdown === "string"
      ? normalizeMarkdownNewlines(result.nextFileMarkdown)
      : typeof result.nextMarkdown === "string"
        ? normalizeMarkdownNewlines(result.nextMarkdown)
        : null;
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
    pushedMarkdown,
    warnings: Array.isArray(result.warnings) ? result.warnings.filter(Boolean) : [],
  };
}

function remoteMarkdownFromReadResult(entry, result) {
  if (result && typeof result.markdown === "string") {
    return normalizeMarkdownNewlines(result.markdown);
  }

  if (result && typeof result.bodyMarkdown === "string") {
    return normalizeMarkdownNewlines(result.bodyMarkdown);
  }

  if (result && typeof result.fileMarkdown === "string") {
    return normalizeMarkdownNewlines(result.fileMarkdown);
  }

  throw new Error(`${entry.kind} adapter readRemote must return markdown, bodyMarkdown, or fileMarkdown for sidecar refresh.`);
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

function metadataFromRefreshRemote({
  entry,
  manifest,
  remote,
  targetPath,
}) {
  if (remote?.metadata) {
    return validatePullPageMetadata(remote.metadata);
  }

  const lastEditedTime = remote?.liveMetadata?.lastEditedTime
    || remote?.liveMetadata?.last_edited_time
    || remote?.lastEditedTime
    || remote?.last_edited_time;

  if (remote?.pageId && lastEditedTime) {
    return buildPullPageMetadata({
      commandFamily: commandFamilyForEntry(entry),
      workspaceName: manifest.workspaceName,
      targetPath,
      pageId: remote.pageId,
      projectId: normalizedProjectId(remote.projectId),
      authMode: remote.authMode,
      lastEditedTime,
    });
  }

  throw new Error(`${entry.kind} adapter readRemote must return metadata, or pageId with live metadata, for sidecar refresh.`);
}

function normalizedProjectId(projectId) {
  return typeof projectId === "string" && projectId.trim() !== "" ? projectId : undefined;
}

function assertRemoteProjectMatches(remoteProjectId, expectedProjectId) {
  const normalizedRemote = normalizedProjectId(remoteProjectId);
  const normalizedExpected = normalizedProjectId(expectedProjectId);

  if (normalizedExpected === undefined) {
    if (normalizedRemote !== undefined) {
      throw new Error(`Remote projectId mismatch: expected no projectId, got "${normalizedRemote}".`);
    }
    return;
  }

  if (normalizedRemote !== undefined && normalizedRemote !== normalizedExpected) {
    throw new Error(`Remote projectId mismatch: expected "${normalizedExpected}", got "${normalizedRemote}".`);
  }
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

function expectedRefreshIdentity(summaryEntry, preflightEntry) {
  return {
    targetPath: summaryEntry.targetPath || preflightEntry.metadata?.targetPath,
    pageId: summaryEntry.pageId || preflightEntry.metadata?.pageId,
    projectId: normalizedProjectId(summaryEntry.projectId) || normalizedProjectId(preflightEntry.metadata?.projectId),
  };
}

function validateRefreshMetadata({
  entry,
  manifest,
  metadata,
  preflightEntry,
  remote,
  summaryEntry,
  targetPath,
}) {
  const expected = expectedRefreshIdentity(summaryEntry, preflightEntry);
  if (expected.targetPath && targetPath !== expected.targetPath) {
    throw new Error(`Remote targetPath mismatch: expected "${expected.targetPath}", got "${targetPath}".`);
  }

  if (remote?.pageId && expected.pageId && remote.pageId !== expected.pageId) {
    throw new Error(`Remote pageId mismatch: expected "${expected.pageId}", got "${remote.pageId}".`);
  }

  assertRemoteProjectMatches(remote?.projectId, expected.projectId);

  const validatedMetadata = assertPullPageMetadataFresh({
    metadata,
    liveMetadata: liveMetadataFromRemote(entry, remote),
    commandFamily: commandFamilyForEntry(entry),
    workspaceName: manifest.workspaceName,
    targetPath,
    pageId: expected.pageId,
    projectId: expected.projectId,
  });

  assertMetadataProjectMatches(validatedMetadata, expected.projectId);

  return validatedMetadata;
}

function assertRefreshMarkdownMatches({ descriptor, localMarkdown, remoteMarkdown }) {
  if (remoteMarkdown === localMarkdown) {
    return;
  }

  throw new Error(`Remote markdown mismatch after sync push for ${descriptor.entry.kind} "${targetForManifestV2SyncEntry(descriptor.entry)}": re-read remote markdown does not match pushed local markdown.`);
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
    pushedMarkdown,
    ...summaryEntry
  } = entry;

  return summaryEntry;
}

function buildSummary({
  manifest,
  authMode,
  diagnostics = [],
  entries,
  failures,
  mutationBudget,
  recovery,
  selectionMetadata,
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

  if (mutationBudget) {
    summary.mutationBudget = mutationBudget;
  }

  if (warnings.length > 0) {
    summary.warnings = warnings;
  }

  const entryDiagnostics = entries.flatMap((entry) => Array.isArray(entry.diagnostics) ? entry.diagnostics : []);
  const allDiagnostics = [
    ...entryDiagnostics,
    ...diagnostics,
  ];

  if (allDiagnostics.length > 0) {
    summary.diagnostics = allDiagnostics;
  }

  if (recovery) {
    summary.recovery = recovery;
  }

  if (selectionMetadata) {
    Object.assign(summary, selectionMetadata);
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
  let preview;

  try {
    const fileMarkdown = requireLocalMarkdown(descriptor, { readFileSyncImpl });
    const metadata = apply
      ? readMetadataSidecar(descriptor, { readFileSyncImpl })
      : undefined;
    preview = normalizePushResult(entry, await adapter.pushLocal({
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
      pushedMarkdown: preview.pushedMarkdown !== null ? preview.pushedMarkdown : fileMarkdown,
    };
  } catch (error) {
    annotatePushError(error, {
      targetPath: preview?.targetPath,
    });
  }
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
      entries.push(buildErrorEntry(descriptor, error, {
        phase: apply ? "apply-preflight" : "preview",
        targetPath: error?.targetPath,
      }));
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

function buildRefreshPreflightFailureMessage({ descriptor, error }) {
  return `Sidecar refresh preflight failed for ${descriptor.entry.kind} "${targetForManifestV2SyncEntry(descriptor.entry)}": ${toErrorMessage(error)}. No sidecars were written.`;
}

function buildSidecarWriteFailureMessage({
  attemptedSidecarPath,
  descriptor,
  error,
  partialSidecarWrites,
}) {
  const partialLabel = partialSidecarWrites.length > 0
    ? partialSidecarWrites.join(", ")
    : "none";

  return `Sidecar refresh write failed for ${descriptor.entry.kind} "${targetForManifestV2SyncEntry(descriptor.entry)}": ${toErrorMessage(error)}. Attempted sidecar: ${attemptedSidecarPath}. Partial sidecar writes: ${partialLabel}.`;
}

async function preflightSidecarRefreshes({
  adapters,
  config,
  descriptors,
  entries,
  manifest,
  preflightEntries,
  projectTokenEnv,
}) {
  const refreshes = [];
  const failures = [];

  for (const [index, descriptor] of descriptors.entries()) {
    const preflightEntry = preflightEntries[index];
    const summaryEntry = entries[index];

    try {
      const adapter = requireAdapter(descriptor.entry, adapters, { apply: true });
      const remote = await adapter.readRemote({
        config,
        entry: descriptor.entry,
        manifest,
        projectTokenEnv,
      });
      const targetPath = typeof remote?.targetPath === "string" && remote.targetPath.trim() !== ""
        ? remote.targetPath
        : remote?.metadata?.targetPath;
      const metadata = metadataFromRefreshRemote({
        entry: descriptor.entry,
        manifest,
        remote,
        targetPath,
      });
      const validatedMetadata = validateRefreshMetadata({
        entry: descriptor.entry,
        manifest,
        metadata,
        preflightEntry,
        remote,
        summaryEntry,
        targetPath,
      });
      const remoteMarkdown = remoteMarkdownFromReadResult(descriptor.entry, remote);
      assertRefreshMarkdownMatches({
        descriptor,
        localMarkdown: preflightEntry.pushedMarkdown ?? preflightEntry.fileMarkdown,
        remoteMarkdown,
      });

      refreshes.push({
        metadata: validatedMetadata,
      });
    } catch (error) {
      const failure = buildRefreshPreflightFailureMessage({
        descriptor,
        error,
      });
      const diagnostic = buildManifestV2PushFailureDiagnostic({
        descriptor,
        error: new Error(failure),
        phase: "sidecar-refresh-preflight",
        state: {
          sidecarWritesAttempted: false,
        },
        targetPath: summaryEntry?.targetPath || preflightEntry?.metadata?.targetPath,
      });
      refreshes.push(null);
      failures.push({
        index,
        diagnostic,
        failure,
        topLevelFailure: buildTopLevelFailure(descriptor.entry, new Error(failure)),
      });
    }
  }

  return {
    failures,
    refreshes,
  };
}

function writeSidecarRefreshes({
  descriptors,
  entries,
  renameSyncImpl,
  refreshes,
  writeFileSyncImpl,
}) {
  const refreshedEntries = entries.map((entry) => ({ ...entry }));
  const partialSidecarWrites = [];

  for (const [index, refresh] of refreshes.entries()) {
    const descriptor = descriptors[index];
    const temporaryMetadataPath = `${descriptor.metadataPath}.tmp`;
    const metadataBody = `${JSON.stringify(refresh.metadata, null, 2)}\n`;

    refreshedEntries[index] = {
      ...refreshedEntries[index],
      metadata: refresh.metadata,
      sidecarRefreshed: false,
    };

    try {
      writeFileSyncImpl(temporaryMetadataPath, metadataBody, "utf8");
      renameSyncImpl(temporaryMetadataPath, descriptor.metadataPath);
      partialSidecarWrites.push(descriptor.metadataPath);
      refreshedEntries[index] = {
        ...refreshedEntries[index],
        sidecarRefreshed: true,
      };
    } catch (error) {
      const failure = buildSidecarWriteFailureMessage({
        attemptedSidecarPath: descriptor.metadataPath,
        descriptor,
        error,
        partialSidecarWrites,
      });
      const diagnostic = buildManifestV2PushFailureDiagnostic({
        descriptor,
        error: new Error(failure),
        phase: "sidecar-refresh-write",
        state: {
          attemptedSidecarPath: descriptor.metadataPath,
          partialSidecarWrites: [...partialSidecarWrites],
          sidecarWritesCompleted: partialSidecarWrites.length,
        },
        targetPath: refreshedEntries[index].targetPath,
      });
      refreshedEntries[index] = {
        ...refreshedEntries[index],
        diagnostics: [
          ...(Array.isArray(refreshedEntries[index].diagnostics) ? refreshedEntries[index].diagnostics : []),
          diagnostic,
        ],
        failure,
        sidecarRefreshed: false,
      };

      return {
        entries: refreshedEntries,
        failures: [buildTopLevelFailure(descriptor.entry, new Error(failure))],
        partialSidecarWrites,
      };
    }
  }

  return {
    entries: refreshedEntries,
    failures: [],
    partialSidecarWrites,
  };
}

async function refreshSidecarsAfterApply({
  adapters,
  config,
  descriptors,
  entries,
  manifest,
  preflightEntries,
  projectTokenEnv,
  renameSyncImpl,
  writeFileSyncImpl,
}) {
  const preflight = await preflightSidecarRefreshes({
    adapters,
    config,
    descriptors,
    entries,
    manifest,
    preflightEntries,
    projectTokenEnv,
  });

  if (preflight.failures.length > 0) {
    const failedIndexes = new Map(preflight.failures.map((failure) => [failure.index, failure.failure]));
    const diagnosticsByIndex = new Map(preflight.failures.map((failure) => [failure.index, failure.diagnostic]));
    return {
      entries: entries.map((entry, index) => {
        const refresh = preflight.refreshes[index];
        const baseEntry = refresh?.metadata
          ? {
            ...entry,
            metadata: refresh.metadata,
            sidecarRefreshed: false,
          }
          : entry;

        return failedIndexes.has(index)
          ? {
            ...baseEntry,
            diagnostics: [
              ...(Array.isArray(baseEntry.diagnostics) ? baseEntry.diagnostics : []),
              diagnosticsByIndex.get(index),
            ].filter(Boolean),
            failure: failedIndexes.get(index),
            sidecarRefreshed: false,
          }
          : baseEntry;
      }),
      failures: preflight.failures.map((failure) => failure.topLevelFailure),
      recovery: SIDECAR_REFRESH_RECOVERY,
    };
  }

  const writes = writeSidecarRefreshes({
    descriptors,
    entries,
    renameSyncImpl,
    refreshes: preflight.refreshes,
    writeFileSyncImpl,
  });

  return {
    ...writes,
    recovery: writes.failures.length > 0 ? SIDECAR_REFRESH_RECOVERY : undefined,
  };
}

function buildDescriptors(manifest, entries = manifest.entries) {
  return entries.map((entry) => buildEntryDescriptor(entry, manifest));
}

function normalizeMaxMutations(maxMutations) {
  if (maxMutations === "all") {
    return Infinity;
  }

  const budget = maxMutations === undefined ? 1 : maxMutations;
  if (!Number.isInteger(budget) || budget <= 0) {
    throw new Error('sync push --apply maxMutations must be a positive integer or "all".');
  }

  return budget;
}

function describeMutationBudget({ entries, maxMutations }) {
  const budget = normalizeMaxMutations(maxMutations);
  const changedCount = entries.filter((entry) => entry.hasDiff).length;

  return {
    maxMutations: budget === Infinity ? "all" : budget,
    changedCount,
    withinBudget: changedCount <= budget,
  };
}

function buildMutationBudgetFailure(mutationBudget) {
  const budgetLabel = String(mutationBudget.maxMutations);
  return `sync push --apply mutation budget exceeded: ${mutationBudget.changedCount} changed entries would mutate Notion, but maxMutations is ${budgetLabel}. No mutations or sidecar refreshes were performed.`;
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
  maxMutations,
  projectTokenEnv,
  readFileSyncImpl = readFileSync,
  refreshSidecars = false,
  renameSyncImpl = renameSync,
  selectedEntries,
  selectionOptions,
  writeFileSyncImpl = writeFileSync,
}) {
  const selection = resolveManifestSyncSelection({
    buildSkippedEntry,
    manifest,
    selectedEntries,
    selectionOptions,
  });
  const descriptors = buildDescriptors(manifest, selection.entries);

  if (refreshSidecars && !apply) {
    const failure = 'sync push --refresh-sidecars requires --apply.';
    return buildSummary({
      manifest,
      authMode: projectTokenEnv ? "project-token" : "workspace-token",
      entries: descriptors.map((descriptor) => buildErrorEntry(descriptor, new Error(failure))),
      failures: [failure],
      recovery: 'Re-run with --apply, or omit --refresh-sidecars for preview.',
      selectionMetadata: selection.metadata,
    });
  }

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
      selectionMetadata: selection.metadata,
    });
  }

  const mutationBudget = describeMutationBudget({
    entries: preflight.entries,
    maxMutations,
  });
  if (!mutationBudget.withinBudget) {
    const budgetFailure = buildMutationBudgetFailure(mutationBudget);
    return buildSummary({
      manifest,
      authMode: projectTokenEnv ? "project-token" : "workspace-token",
      diagnostics: [buildManifestV2PushBudgetDiagnostic({
        message: budgetFailure,
        mutationBudget,
      })],
      entries: preflight.entries.map(stripPreflightState),
      failures: [budgetFailure],
      mutationBudget,
      selectionMetadata: selection.metadata,
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
      const diagnostic = buildManifestV2PushFailureDiagnostic({
        descriptor,
        error: new Error(failure),
        phase: "partial-apply",
        state: {
          priorRemoteMutations: appliedEntries.map((appliedEntry) => ({
            kind: appliedEntry.kind,
            target: appliedEntry.target,
            targetPath: appliedEntry.targetPath,
          })),
        },
        targetPath: entry.targetPath || entry.metadata?.targetPath,
      });
      entries.push({
        ...stripPreflightState(entry),
        status: "error",
        applied: false,
        diagnostics: [diagnostic],
        failure,
      });
      failures.push(buildTopLevelFailure(descriptor.entry, new Error(failure)));

      for (const remainingEntry of preflight.entries.slice(index + 1)) {
        entries.push(stripPreflightState(remainingEntry));
      }
      break;
    }
  }

  if (refreshSidecars && failures.length === 0) {
    const refreshed = await refreshSidecarsAfterApply({
      adapters,
      config,
      descriptors,
      entries,
      manifest,
      preflightEntries: preflight.entries,
      projectTokenEnv,
      renameSyncImpl,
      writeFileSyncImpl,
    });

    return buildSummary({
      manifest,
      authMode: projectTokenEnv ? "project-token" : "workspace-token",
      entries: refreshed.entries,
      failures: refreshed.failures,
      mutationBudget,
      recovery: refreshed.recovery,
      selectionMetadata: selection.metadata,
    });
  }

  const warnings = appliedEntries.length > 0 && failures.length === 0
    ? [SIDECAR_STALE_WARNING]
    : [];
  const warningDiagnostics = warnings.map((warning) => buildManifestV2PushWarningDiagnostic({
    code: MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_STALE_AFTER_APPLY,
    message: warning,
    state: {
      phase: "post-apply",
      appliedCount: appliedEntries.length,
      sidecarRefreshed: false,
    },
  }));

  return buildSummary({
    manifest,
    authMode: projectTokenEnv ? "project-token" : "workspace-token",
    diagnostics: warningDiagnostics,
    entries,
    failures,
    mutationBudget,
    recovery: failures.length > 0 ? PARTIAL_APPLY_RECOVERY : undefined,
    selectionMetadata: selection.metadata,
    warnings,
  });
}
