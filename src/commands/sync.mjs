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
  loadSyncManifestImpl = loadSyncManifest,
  loadWorkspaceConfigImpl = loadWorkspaceConfig,
  manifestPath,
  projectTokenEnv,
  workspaceOverride,
}) {
  const { manifest, config } = loadManifestAndConfig(manifestPath, workspaceOverride, {
    loadSyncManifestImpl,
    loadWorkspaceConfigImpl,
  });

  if (manifest.version === SYNC_MANIFEST_V2_VERSION) {
    return checkManifestV2SyncManifestImpl({
      config,
      manifest,
      projectTokenEnv,
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
  loadSyncManifestImpl = loadSyncManifest,
  loadWorkspaceConfigImpl = loadWorkspaceConfig,
  manifestPath,
  projectTokenEnv,
  pullManifestV2SyncManifestImpl = pullManifestV2SyncManifest,
  pullValidationSessionSyncManifestImpl = pullValidationSessionSyncManifest,
  workspaceOverride,
}) {
  const { manifest, config } = loadManifestAndConfig(manifestPath, workspaceOverride, {
    loadSyncManifestImpl,
    loadWorkspaceConfigImpl,
  });

  if (manifest.version === SYNC_MANIFEST_V2_VERSION) {
    return pullManifestV2SyncManifestImpl({
      apply,
      config,
      manifest,
      projectTokenEnv,
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
  loadSyncManifestImpl = loadSyncManifest,
  loadWorkspaceConfigImpl = loadWorkspaceConfig,
  manifestPath,
  projectTokenEnv,
  pushManifestV2SyncManifestImpl = pushManifestV2SyncManifest,
  pushValidationSessionSyncManifestImpl = pushValidationSessionSyncManifest,
  tryRecordMutationJournalEntryImpl = tryRecordMutationJournalEntry,
  workspaceOverride,
}) {
  const { manifest, config } = loadManifestAndConfig(manifestPath, workspaceOverride, {
    loadSyncManifestImpl,
    loadWorkspaceConfigImpl,
  });

  if (manifest.version === SYNC_MANIFEST_V2_VERSION) {
    const result = await pushManifestV2SyncManifestImpl({
      apply,
      config,
      manifest,
      projectTokenEnv,
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
