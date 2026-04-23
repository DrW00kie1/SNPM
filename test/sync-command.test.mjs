import test from "node:test";
import assert from "node:assert/strict";

import {
  runSyncCheck,
  runSyncPull,
  runSyncPush,
} from "../src/commands/sync.mjs";

function manifest(version = 2) {
  return {
    version,
    manifestPath: "C:\\repo\\snpm.sync.json",
    manifestDir: "C:\\repo",
    workspaceName: "infrastructure-hq",
    projectName: "SNPM",
    entries: [{
      kind: version === 2 ? "planning-page" : "validation-session",
      target: version === 2 ? "Planning > Roadmap" : "Session",
      targetField: version === 2 ? "pagePath" : "title",
      pagePath: version === 2 ? "Planning > Roadmap" : undefined,
      title: version === 1 ? "Session" : undefined,
      file: "notion/target.md",
      absoluteFilePath: "C:\\repo\\notion\\target.md",
    }],
  };
}

function config() {
  return {
    notionVersion: "2026-03-11",
    workspace: { projectsPageId: "projects" },
  };
}

test("runSyncCheck routes manifest v2 to the read-only v2 check engine", async () => {
  const calls = [];
  const result = await runSyncCheck({
    manifestPath: "C:\\repo\\snpm.sync.json",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    loadSyncManifestImpl: () => manifest(2),
    loadWorkspaceConfigImpl: (workspaceName) => {
      calls.push({ op: "config", workspaceName });
      return config();
    },
    checkManifestV2SyncManifestImpl: async ({ config: loadedConfig, manifest: loadedManifest, projectTokenEnv }) => {
      calls.push({
        op: "v2-check",
        notionVersion: loadedConfig.notionVersion,
        version: loadedManifest.version,
        projectTokenEnv,
      });
      return {
        command: "sync-check",
        failures: [],
        driftCount: 0,
        entries: [],
      };
    },
    checkValidationSessionSyncManifestImpl: async () => {
      throw new Error("v1 sync check should not run for manifest v2");
    },
  });

  assert.equal(result.command, "sync-check");
  assert.deepEqual(calls, [
    { op: "config", workspaceName: "infrastructure-hq" },
    {
      op: "v2-check",
      notionVersion: "2026-03-11",
      version: 2,
      projectTokenEnv: "SNPM_NOTION_TOKEN",
    },
  ]);
});

test("runSyncCheck preserves manifest v1 validation-session routing", async () => {
  const calls = [];
  const result = await runSyncCheck({
    manifestPath: "C:\\repo\\snpm.sync.json",
    loadSyncManifestImpl: () => manifest(1),
    loadWorkspaceConfigImpl: () => config(),
    checkManifestV2SyncManifestImpl: async () => {
      throw new Error("v2 sync check should not run for manifest v1");
    },
    checkValidationSessionSyncManifestImpl: async ({ manifest: loadedManifest }) => {
      calls.push({ op: "v1-check", version: loadedManifest.version });
      return {
        command: "sync-check",
        failures: [],
        driftCount: 0,
        entries: [],
      };
    },
  });

  assert.equal(result.command, "sync-check");
  assert.deepEqual(calls, [{ op: "v1-check", version: 1 }]);
});

test("runSyncPull routes manifest v2 to the injected v2 pull implementation", async () => {
  const calls = [];
  const result = await runSyncPull({
    apply: true,
    manifestPath: "C:\\repo\\snpm.sync.json",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    loadSyncManifestImpl: () => manifest(2),
    loadWorkspaceConfigImpl: (workspaceName) => {
      calls.push({ op: "config", workspaceName });
      return config();
    },
    pullManifestV2SyncManifestImpl: async ({
      apply,
      config: loadedConfig,
      manifest: loadedManifest,
      projectTokenEnv,
    }) => {
      calls.push({
        op: "v2-pull",
        apply,
        notionVersion: loadedConfig.notionVersion,
        version: loadedManifest.version,
        projectTokenEnv,
      });
      return {
        command: "sync-pull",
        applied: true,
        entries: [],
        localWrites: [],
        notionMutationCount: 0,
      };
    },
    pullValidationSessionSyncManifestImpl: async () => {
      throw new Error("v1 sync pull should not run for manifest v2");
    },
  });

  assert.equal(result.command, "sync-pull");
  assert.equal(result.notionMutationCount, 0);
  assert.deepEqual(calls, [
    { op: "config", workspaceName: "infrastructure-hq" },
    {
      op: "v2-pull",
      apply: true,
      notionVersion: "2026-03-11",
      version: 2,
      projectTokenEnv: "SNPM_NOTION_TOKEN",
    },
  ]);
});

test("runSyncPush rejects manifest v2 before loading workspace config", async () => {
  const loadWorkspaceConfigImpl = () => {
    throw new Error("workspace config should not be loaded for v2 push rejection");
  };

  await assert.rejects(() => runSyncPush({
    manifestPath: "C:\\repo\\snpm.sync.json",
    loadSyncManifestImpl: () => manifest(2),
    loadWorkspaceConfigImpl,
    pushValidationSessionSyncManifestImpl: async () => {
      throw new Error("v1 sync push should not run for manifest v2");
    },
  }), /Manifest version 2 does not support sync push yet/i);
});

test("runSyncPull and runSyncPush preserve manifest v1 validation-session routing", async () => {
  const calls = [];

  const pullResult = await runSyncPull({
    apply: false,
    manifestPath: "C:\\repo\\snpm.sync.json",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    loadSyncManifestImpl: () => manifest(1),
    loadWorkspaceConfigImpl: (workspaceName) => {
      calls.push({ op: "pull-config", workspaceName });
      return config();
    },
    pullManifestV2SyncManifestImpl: async () => {
      throw new Error("v2 sync pull should not run for manifest v1");
    },
    pullValidationSessionSyncManifestImpl: async ({
      apply,
      config: loadedConfig,
      manifest: loadedManifest,
      projectTokenEnv,
    }) => {
      calls.push({
        op: "v1-pull",
        apply,
        notionVersion: loadedConfig.notionVersion,
        version: loadedManifest.version,
        projectTokenEnv,
      });
      return {
        command: "sync-pull",
        applied: false,
      };
    },
  });

  const pushResult = await runSyncPush({
    apply: true,
    manifestPath: "C:\\repo\\snpm.sync.json",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    loadSyncManifestImpl: () => manifest(1),
    loadWorkspaceConfigImpl: (workspaceName) => {
      calls.push({ op: "push-config", workspaceName });
      return config();
    },
    pushValidationSessionSyncManifestImpl: async ({
      apply,
      config: loadedConfig,
      manifest: loadedManifest,
      projectTokenEnv,
    }) => {
      calls.push({
        op: "v1-push",
        apply,
        notionVersion: loadedConfig.notionVersion,
        version: loadedManifest.version,
        projectTokenEnv,
      });
      return {
        command: "sync-push",
        applied: true,
      };
    },
  });

  assert.deepEqual(pullResult, {
    command: "sync-pull",
    applied: false,
  });
  assert.deepEqual(pushResult, {
    command: "sync-push",
    applied: true,
  });
  assert.deepEqual(calls, [
    { op: "pull-config", workspaceName: "infrastructure-hq" },
    {
      op: "v1-pull",
      apply: false,
      notionVersion: "2026-03-11",
      version: 1,
      projectTokenEnv: "SNPM_NOTION_TOKEN",
    },
    { op: "push-config", workspaceName: "infrastructure-hq" },
    {
      op: "v1-push",
      apply: true,
      notionVersion: "2026-03-11",
      version: 1,
      projectTokenEnv: "SNPM_NOTION_TOKEN",
    },
  ]);
});

