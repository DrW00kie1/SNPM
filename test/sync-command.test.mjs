import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

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

test("runSyncPush routes manifest v2 to the injected v2 push implementation after loading config", async () => {
  const calls = [];
  const result = await runSyncPush({
    apply: true,
    manifestPath: "C:\\repo\\snpm.sync.json",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    refreshSidecars: true,
    loadSyncManifestImpl: () => manifest(2),
    loadWorkspaceConfigImpl: (workspaceName) => {
      calls.push({ op: "config", workspaceName });
      return config();
    },
    pushManifestV2SyncManifestImpl: async ({
      apply,
      config: loadedConfig,
      manifest: loadedManifest,
      projectTokenEnv,
      refreshSidecars,
    }) => {
      calls.push({
        op: "v2-push",
        apply,
        notionVersion: loadedConfig.notionVersion,
        version: loadedManifest.version,
        projectTokenEnv,
        refreshSidecars,
      });
      return {
        command: "sync-push",
        appliedCount: 0,
        failures: [],
        entries: [{
          kind: "planning-page",
          target: "Planning > Roadmap",
          file: "notion/target.md",
          targetPath: "Projects > SNPM > Planning > Roadmap",
          status: "in-sync",
          hasDiff: false,
          diff: "",
          applied: false,
        }],
      };
    },
    pushValidationSessionSyncManifestImpl: async () => {
      throw new Error("v1 sync push should not run for manifest v2");
    },
  });

  assert.equal(result.command, "sync-push");
  assert.equal(result.appliedCount, 0);
  assert.deepEqual(calls, [
    { op: "config", workspaceName: "infrastructure-hq" },
    {
      op: "v2-push",
      apply: true,
      notionVersion: "2026-03-11",
      version: 2,
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      refreshSidecars: true,
    },
  ]);
});

test("runSyncPush preserves manifest v2 routing defaults when refreshSidecars is absent", async () => {
  const result = await runSyncPush({
    apply: true,
    manifestPath: "C:\\repo\\snpm.sync.json",
    loadSyncManifestImpl: () => manifest(2),
    loadWorkspaceConfigImpl: () => config(),
    pushManifestV2SyncManifestImpl: async ({ refreshSidecars }) => ({
      command: "sync-push",
      appliedCount: 0,
      failures: [],
      refreshSidecars,
      entries: [],
    }),
    pushValidationSessionSyncManifestImpl: async () => {
      throw new Error("v1 sync push should not run for manifest v2");
    },
  });

  assert.equal(result.command, "sync-push");
  assert.equal(result.refreshSidecars, false);
});

test("runSyncPush rejects refreshSidecars for manifest v1 sync push", async () => {
  await assert.rejects(
    runSyncPush({
      apply: true,
      manifestPath: "C:\\repo\\snpm.sync.json",
      refreshSidecars: true,
      loadSyncManifestImpl: () => manifest(1),
      loadWorkspaceConfigImpl: () => config(),
      pushValidationSessionSyncManifestImpl: async () => {
        throw new Error("v1 sync push should not run when refreshSidecars is requested");
      },
    }),
    /--refresh-sidecars is only supported for manifest v2/i,
  );
});

test("runSyncPush rejects refreshSidecars for manifest v2 preview sync push", async () => {
  await assert.rejects(
    runSyncPush({
      apply: false,
      manifestPath: "C:\\repo\\snpm.sync.json",
      refreshSidecars: true,
      loadSyncManifestImpl: () => manifest(2),
      loadWorkspaceConfigImpl: () => config(),
      pushManifestV2SyncManifestImpl: async () => {
        throw new Error("v2 sync push should not run for refreshSidecars preview");
      },
    }),
    /--refresh-sidecars requires --apply/i,
  );
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

test("runSyncPush records redacted journal entries for applied manifest v2 entries only", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-sync-journal-"));
  const journalPath = path.join(tempDir, "journal.ndjson");
  const previousJournalPath = process.env.SNPM_JOURNAL_PATH;
  process.env.SNPM_JOURNAL_PATH = journalPath;

  try {
    const result = await runSyncPush({
      apply: true,
      manifestPath: "C:\\repo\\snpm.sync.json",
      projectTokenEnv: "PROJECT_NOTION_TOKEN",
      loadSyncManifestImpl: () => manifest(2),
      loadWorkspaceConfigImpl: () => config(),
      pushManifestV2SyncManifestImpl: async () => ({
        command: "sync-push",
        manifestPath: "C:\\repo\\snpm.sync.json",
        projectName: "SNPM",
        workspaceName: "infrastructure-hq",
        authMode: "project-token",
        hasDiff: true,
        driftCount: 3,
        appliedCount: 2,
        failures: [],
        entries: [
          {
            kind: "planning-page",
            target: "Planning > Roadmap",
            file: "notion/roadmap.md",
            targetPath: "Projects > SNPM > Planning > Roadmap",
            status: "pushed",
            hasDiff: true,
            diff: "diff --git a b\n@@\n-old-body-token\n+new-body-secret\n",
            applied: true,
            pageId: "page-1",
            metadata: {
              schema: "snpm.pull-metadata.v1",
              commandFamily: "page",
              workspaceName: "infrastructure-hq",
              targetPath: "Projects > SNPM > Planning > Roadmap",
              pageId: "page-1",
              authMode: "project-token",
              lastEditedTime: "2026-04-23T19:00:00.000Z",
              pulledAt: "2026-04-23T19:01:00.000Z",
              bodyMarkdown: "# body should not be copied",
              token: "ntn_secret_value",
              projectTokenEnv: "PROJECT_NOTION_TOKEN",
            },
            currentBodyMarkdown: "# Current\nold-body-token",
            nextBodyMarkdown: "# Next\nnew-body-secret",
            projectTokenEnv: "PROJECT_NOTION_TOKEN",
          },
          {
            kind: "runbook",
            target: "Notion Workspace Workflow",
            file: "notion/runbook.md",
            targetPath: "Projects > SNPM > Runbooks > Notion Workspace Workflow",
            status: "push-preview",
            hasDiff: true,
            diff: "+unapplied-secret",
            applied: false,
            pageId: "page-2",
          },
          {
            kind: "project-doc",
            target: "Overview",
            file: "notion/overview.md",
            targetPath: "Projects > SNPM > Overview",
            status: "pushed",
            hasDiff: true,
            diff: "+updated overview",
            applied: true,
            pageId: "page-3",
            metadata: {
              schema: "snpm.pull-metadata.v1",
              commandFamily: "doc",
              workspaceName: "infrastructure-hq",
              targetPath: "Projects > SNPM > Overview",
              pageId: "page-3",
              authMode: "project-token",
              lastEditedTime: "2026-04-23T20:00:00.000Z",
              pulledAt: "2026-04-23T20:01:00.000Z",
            },
          },
        ],
      }),
    });

    assert.deepEqual(result.journal, {
      path: journalPath,
      entryCount: 2,
    });
    assert.equal(result.appliedCount, 2);
    assert.equal(result.warnings, undefined);

    const journalEntries = readFileSync(journalPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    assert.equal(journalEntries.length, 2);
    assert.deepEqual(
      journalEntries.map((entry) => [entry.command, entry.surface, entry.pageId]),
      [
        ["sync-push", "planning", "page-1"],
        ["sync-push", "project-docs", "page-3"],
      ],
    );
    assert.match(journalEntries[0].diff.hash, /^[a-f0-9]{64}$/);
    assert.equal(journalEntries[0].diff.additions, 1);
    assert.equal(journalEntries[0].diff.deletions, 1);

    const serialized = JSON.stringify(journalEntries);
    assert.equal(serialized.includes("old-body-token"), false);
    assert.equal(serialized.includes("new-body-secret"), false);
    assert.equal(serialized.includes("unapplied-secret"), false);
    assert.equal(serialized.includes("body should not be copied"), false);
    assert.equal(serialized.includes("PROJECT_NOTION_TOKEN"), false);
    assert.equal(serialized.includes("ntn_secret_value"), false);
    assert.equal(serialized.includes("runbooks"), false);
  } finally {
    if (previousJournalPath === undefined) {
      delete process.env.SNPM_JOURNAL_PATH;
    } else {
      process.env.SNPM_JOURNAL_PATH = previousJournalPath;
    }
  }
});

test("runSyncPush returns journal warnings without undoing successful v2 apply result", async () => {
  const result = await runSyncPush({
    apply: true,
    manifestPath: "C:\\repo\\snpm.sync.json",
    loadSyncManifestImpl: () => manifest(2),
    loadWorkspaceConfigImpl: () => config(),
    pushManifestV2SyncManifestImpl: async () => ({
      command: "sync-push",
      authMode: "workspace-token",
      appliedCount: 1,
      failures: [],
      warnings: ["refresh sidecars after sync push --apply"],
      entries: [{
        kind: "planning-page",
        target: "Planning > Roadmap",
        file: "notion/roadmap.md",
        targetPath: "Projects > SNPM > Planning > Roadmap",
        status: "pushed",
        hasDiff: true,
        diff: "+safe update",
        applied: true,
        pageId: "page-1",
      }],
    }),
    tryRecordMutationJournalEntryImpl: () => ({
      ok: false,
      journalPath: "C:\\tmp\\journal.ndjson",
      warning: "Mutation journal write failed: disk full",
    }),
  });

  assert.equal(result.command, "sync-push");
  assert.equal(result.appliedCount, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.entries[0].applied, true);
  assert.equal(result.journal, undefined);
  assert.deepEqual(result.warnings, [
    "refresh sidecars after sync push --apply",
    "Mutation journal write failed: disk full",
  ]);
});

