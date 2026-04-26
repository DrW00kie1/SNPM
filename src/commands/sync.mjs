import { readFileSync } from "node:fs";

import { loadWorkspaceConfig } from "../notion/config.mjs";
import { checkManifestV2SyncManifest } from "../notion/manifest-sync-check.mjs";
import { pullManifestV2SyncManifest } from "../notion/manifest-sync-pull.mjs";
import { pushManifestV2SyncManifest } from "../notion/manifest-sync-push.mjs";
import {
  loadSyncManifest,
  SYNC_MANIFEST_V1_VERSION,
  SYNC_MANIFEST_VERSION as SYNC_MANIFEST_V2_VERSION,
} from "../notion/sync-manifest.mjs";
import {
  checkValidationSessionSyncManifest,
  pullValidationSessionSyncManifest,
  pushValidationSessionSyncManifest,
} from "../notion/validation-session-sync.mjs";
import { tryRecordMutationJournalEntry } from "./mutation-journal.mjs";

function loadManifest(manifestPath, workspaceOverride, {
  loadSyncManifestImpl = loadSyncManifest,
} = {}) {
  return loadSyncManifestImpl(
    manifestPath,
    workspaceOverride ? { workspaceOverride } : {},
  );
}

function loadConfigForManifest(manifest, {
  loadWorkspaceConfigImpl = loadWorkspaceConfig,
} = {}) {
  return loadWorkspaceConfigImpl(manifest.workspaceName);
}

function loadManifestAndConfig(manifestPath, workspaceOverride, deps = {}) {
  const manifest = loadManifest(manifestPath, workspaceOverride, deps);
  const config = loadConfigForManifest(manifest, deps);

  return { manifest, config };
}

function hasSelectionOptions({ entries, entriesFile }) {
  return (Array.isArray(entries) && entries.length > 0) || Boolean(entriesFile);
}

function normalizeInlineEntries(entries) {
  if (entries === undefined) {
    return [];
  }

  if (Array.isArray(entries)) {
    return entries;
  }

  return [entries];
}

function selectorValuesFromEntriesFile(entriesFile, {
  readFileSyncImpl = readFileSync,
} = {}) {
  if (!entriesFile) {
    return [];
  }

  const rawText = entriesFile === "-"
    ? readFileSyncImpl(0, "utf8")
    : readFileSyncImpl(entriesFile, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Entries file "${entriesFile}" is not valid JSON: ${error.message}`);
  }

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.entries)) {
      return parsed.entries;
    }

    if (Array.isArray(parsed.selectors)) {
      return parsed.selectors;
    }
  }

  throw new Error(`Entries file "${entriesFile}" must be a JSON array, or an object with an "entries" or "selectors" array.`);
}

function buildSelectionOptions({ entries, entriesFile, readFileSyncImpl }) {
  const selectors = [
    ...normalizeInlineEntries(entries),
    ...selectorValuesFromEntriesFile(entriesFile, { readFileSyncImpl }),
  ];

  return selectors.length > 0 ? { selectors } : undefined;
}

function assertNoV1OnlyUnsupportedOptions(manifest, {
  entries,
  entriesFile,
  maxMutations,
  reviewOutput,
}) {
  if (manifest.version !== SYNC_MANIFEST_V1_VERSION) {
    return;
  }

  if (hasSelectionOptions({ entries, entriesFile })) {
    throw new Error("Manifest v1 validation-session sync does not support --entry or --entries-file selection; selection is only supported for manifest v2.");
  }

  if (reviewOutput) {
    throw new Error("Manifest v1 validation-session sync does not support --review-output; review artifacts are only supported for manifest v2 sync check and sync push preview.");
  }

  if (maxMutations !== undefined) {
    throw new Error("Manifest v1 validation-session sync does not support --max-mutations; mutation budgets are only supported for manifest v2 sync push apply.");
  }
}

function assertReviewOutputAllowed({ apply, commandName, reviewOutput }) {
  if (!reviewOutput) {
    return;
  }

  if (commandName === "sync pull") {
    throw new Error("sync pull does not support --review-output; use manifest v2 sync check or sync push preview for review artifacts.");
  }

  if (commandName === "sync push" && apply) {
    throw new Error("sync push --review-output is only supported for preview; omit --apply when writing review artifacts.");
  }
}

function assertManifestV1ForSyncMutation(manifest, commandName) {
  if (manifest.version === SYNC_MANIFEST_V1_VERSION) {
    return;
  }

  if (manifest.version === SYNC_MANIFEST_V2_VERSION) {
    throw new Error(`Manifest version 2 does not support ${commandName} yet. Use "sync check" or "sync pull" for manifest v2, then use the owning page-*, doc-*, runbook-*, or validation-session-* command family for Notion writes.`);
  }

  throw new Error(`Unsupported sync manifest version "${manifest.version}".`);
}

function surfaceForManifestV2SyncEntry(entry) {
  if (entry.kind === "planning-page") {
    return "planning";
  }

  if (entry.kind === "project-doc") {
    return "project-docs";
  }

  if (entry.kind === "template-doc") {
    return "template-docs";
  }

  if (entry.kind === "workspace-doc") {
    return "workspace-docs";
  }

  if (entry.kind === "runbook") {
    return "runbooks";
  }

  if (entry.kind === "validation-session") {
    return "validation-session";
  }

  return entry.kind || "sync-entry";
}

function buildManifestV2SyncPushJournalResult(entry, result) {
  return {
    ...entry,
    authMode: entry.authMode || result.authMode,
  };
}

export function withManifestV2SyncPushJournal(result, {
  apply = false,
  tryRecordMutationJournalEntryImpl = tryRecordMutationJournalEntry,
} = {}) {
  if (!apply || !result || !Array.isArray(result.entries)) {
    return result;
  }

  const recordedPaths = [];
  const journalWarnings = [];

  for (const entry of result.entries) {
    if (!entry || entry.applied !== true) {
      continue;
    }

    const recorded = tryRecordMutationJournalEntryImpl({
      command: "sync-push",
      surface: surfaceForManifestV2SyncEntry(entry),
      result: buildManifestV2SyncPushJournalResult(entry, result),
    });

    if (recorded.ok) {
      recordedPaths.push(recorded.journalPath);
      continue;
    }

    journalWarnings.push(recorded.warning);
  }

  if (recordedPaths.length === 0 && journalWarnings.length === 0) {
    return result;
  }

  return {
    ...result,
    ...(recordedPaths.length > 0
      ? {
        journal: {
          path: recordedPaths[0],
          entryCount: recordedPaths.length,
        },
      }
      : {}),
    ...(journalWarnings.length > 0
      ? {
        warnings: [
          ...(Array.isArray(result.warnings) ? result.warnings : []),
          ...journalWarnings,
        ],
      }
      : {}),
  };
}

export async function runSyncCheck({
  checkManifestV2SyncManifestImpl = checkManifestV2SyncManifest,
  checkValidationSessionSyncManifestImpl = checkValidationSessionSyncManifest,
  entries,
  entriesFile,
  loadSyncManifestImpl = loadSyncManifest,
  loadWorkspaceConfigImpl = loadWorkspaceConfig,
  manifestPath,
  projectTokenEnv,
  readFileSyncImpl = readFileSync,
  reviewOutput,
  workspaceOverride,
}) {
  const { manifest, config } = loadManifestAndConfig(manifestPath, workspaceOverride, {
    loadSyncManifestImpl,
    loadWorkspaceConfigImpl,
  });
  assertNoV1OnlyUnsupportedOptions(manifest, { entries, entriesFile, reviewOutput });
  const selectionOptions = buildSelectionOptions({ entries, entriesFile, readFileSyncImpl });

  if (manifest.version === SYNC_MANIFEST_V2_VERSION) {
    return checkManifestV2SyncManifestImpl({
      config,
      entries,
      entriesFile,
      manifest,
      projectTokenEnv,
      reviewOutput,
      selectionOptions,
    });
  }

  return checkValidationSessionSyncManifestImpl({
    config,
    manifest,
    projectTokenEnv,
  });
}

export async function runSyncPull({
  apply = false,
  entries,
  entriesFile,
  loadSyncManifestImpl = loadSyncManifest,
  loadWorkspaceConfigImpl = loadWorkspaceConfig,
  manifestPath,
  projectTokenEnv,
  pullManifestV2SyncManifestImpl = pullManifestV2SyncManifest,
  pullValidationSessionSyncManifestImpl = pullValidationSessionSyncManifest,
  readFileSyncImpl = readFileSync,
  reviewOutput,
  workspaceOverride,
}) {
  const { manifest, config } = loadManifestAndConfig(manifestPath, workspaceOverride, {
    loadSyncManifestImpl,
    loadWorkspaceConfigImpl,
  });
  assertNoV1OnlyUnsupportedOptions(manifest, { entries, entriesFile, reviewOutput });
  assertReviewOutputAllowed({ apply, commandName: "sync pull", reviewOutput });
  const selectionOptions = buildSelectionOptions({ entries, entriesFile, readFileSyncImpl });

  if (manifest.version === SYNC_MANIFEST_V2_VERSION) {
    return pullManifestV2SyncManifestImpl({
      apply,
      config,
      entries,
      entriesFile,
      manifest,
      projectTokenEnv,
      reviewOutput,
      selectionOptions,
    });
  }

  return pullValidationSessionSyncManifestImpl({
    apply,
    config,
    manifest,
    projectTokenEnv,
  });
}

export async function runSyncPush({
  apply = false,
  entries,
  entriesFile,
  loadSyncManifestImpl = loadSyncManifest,
  loadWorkspaceConfigImpl = loadWorkspaceConfig,
  manifestPath,
  maxMutations,
  projectTokenEnv,
  pushManifestV2SyncManifestImpl = pushManifestV2SyncManifest,
  pushValidationSessionSyncManifestImpl = pushValidationSessionSyncManifest,
  readFileSyncImpl = readFileSync,
  refreshSidecars = false,
  reviewOutput,
  tryRecordMutationJournalEntryImpl = tryRecordMutationJournalEntry,
  workspaceOverride,
}) {
  const { manifest, config } = loadManifestAndConfig(manifestPath, workspaceOverride, {
    loadSyncManifestImpl,
    loadWorkspaceConfigImpl,
  });
  assertNoV1OnlyUnsupportedOptions(manifest, { entries, entriesFile, maxMutations, reviewOutput });
  assertReviewOutputAllowed({ apply, commandName: "sync push", reviewOutput });
  const selectionOptions = buildSelectionOptions({ entries, entriesFile, readFileSyncImpl });

  if (refreshSidecars && manifest.version === SYNC_MANIFEST_V1_VERSION) {
    throw new Error("sync push --refresh-sidecars is only supported for manifest v2; manifest v1 validation-session sync does not refresh sidecars.");
  }

  if (refreshSidecars && !apply) {
    throw new Error("sync push --refresh-sidecars requires --apply because it refreshes local .snpm-meta.json sidecars after Notion updates.");
  }

  if (manifest.version === SYNC_MANIFEST_V2_VERSION) {
    const effectiveMaxMutations = maxMutations === undefined && apply ? 1 : maxMutations;
    const result = await pushManifestV2SyncManifestImpl({
      apply,
      config,
      entries,
      entriesFile,
      manifest,
      maxMutations: effectiveMaxMutations,
      projectTokenEnv,
      refreshSidecars,
      reviewOutput,
      selectionOptions,
    });

    return withManifestV2SyncPushJournal(result, {
      apply,
      tryRecordMutationJournalEntryImpl,
    });
  }

  assertManifestV1ForSyncMutation(manifest, "sync push");

  return pushValidationSessionSyncManifestImpl({
    apply,
    config,
    manifest,
    projectTokenEnv,
  });
}
