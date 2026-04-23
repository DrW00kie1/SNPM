import { loadWorkspaceConfig } from "../notion/config.mjs";
import { checkManifestV2SyncManifest } from "../notion/manifest-sync-check.mjs";
import { pullManifestV2SyncManifest } from "../notion/manifest-sync-pull.mjs";
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
  pushValidationSessionSyncManifestImpl = pushValidationSessionSyncManifest,
  workspaceOverride,
}) {
  const manifest = loadManifest(manifestPath, workspaceOverride, { loadSyncManifestImpl });
  assertManifestV1ForSyncMutation(manifest, "sync push");
  const config = loadConfigForManifest(manifest, { loadWorkspaceConfigImpl });

  return pushValidationSessionSyncManifestImpl({
    apply,
    config,
    manifest,
    projectTokenEnv,
  });
}
