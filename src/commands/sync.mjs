import { loadWorkspaceConfig } from "../notion/config.mjs";
import { loadSyncManifest } from "../notion/sync-manifest.mjs";
import {
  checkValidationSessionSyncManifest,
  pullValidationSessionSyncManifest,
  pushValidationSessionSyncManifest,
} from "../notion/validation-session-sync.mjs";

function loadManifestAndConfig(manifestPath, workspaceOverride) {
  const manifest = loadSyncManifest(
    manifestPath,
    workspaceOverride ? { workspaceOverride } : {},
  );
  const config = loadWorkspaceConfig(manifest.workspaceName);

  return { manifest, config };
}

export async function runSyncCheck({
  manifestPath,
  projectTokenEnv,
  workspaceOverride,
}) {
  const { manifest, config } = loadManifestAndConfig(manifestPath, workspaceOverride);
  return checkValidationSessionSyncManifest({
    config,
    manifest,
    projectTokenEnv,
  });
}

export async function runSyncPull({
  apply = false,
  manifestPath,
  projectTokenEnv,
  workspaceOverride,
}) {
  const { manifest, config } = loadManifestAndConfig(manifestPath, workspaceOverride);
  return pullValidationSessionSyncManifest({
    apply,
    config,
    manifest,
    projectTokenEnv,
  });
}

export async function runSyncPush({
  apply = false,
  manifestPath,
  projectTokenEnv,
  workspaceOverride,
}) {
  const { manifest, config } = loadManifestAndConfig(manifestPath, workspaceOverride);
  return pushValidationSessionSyncManifest({
    apply,
    config,
    manifest,
    projectTokenEnv,
  });
}
