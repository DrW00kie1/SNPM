import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function tempCommandDir() {
  return mkdtempSync(path.join(os.tmpdir(), "snpm-sync-command-"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

function writeTempManifest(tempDir, rawManifest) {
  return writeJson(path.join(tempDir, "snpm.sync.json"), rawManifest);
}

function rawManifestV2(entries) {
  return {
    version: 2,
    workspace: "infrastructure-hq",
    project: "SNPM",
    entries,
  };
}

function rawManifestV1() {
  return {
    version: 1,
    workspace: "infrastructure-hq",
    project: "SNPM",
    entries: [{
      kind: "validation-session",
      title: "Session Fixture",
      file: "ops/validation/session.md",
    }],
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

test("runSyncCheck passes manifest v2 selection and review options to the v2 implementation", async () => {
  const calls = [];
  const result = await runSyncCheck({
    entries: ["planning-page:Planning > Roadmap", "runbook:Deploy"],
    entriesFile: "-",
    manifestPath: "C:\\repo\\snpm.sync.json",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    reviewOutput: "review",
    loadSyncManifestImpl: () => manifest(2),
    loadWorkspaceConfigImpl: () => config(),
    readFileSyncImpl: () => JSON.stringify(["project-doc:Root > Overview"]),
    checkManifestV2SyncManifestImpl: async ({
      entries,
      entriesFile,
      reviewOutput,
      selectionOptions,
    }) => {
      calls.push({ entries, entriesFile, reviewOutput, selectionOptions });
      return {
        command: "sync-check",
        failures: [],
        driftCount: 0,
        entries: [],
      };
    },
  });

  assert.equal(result.command, "sync-check");
  assert.deepEqual(calls, [{
    entries: ["planning-page:Planning > Roadmap", "runbook:Deploy"],
    entriesFile: "-",
    reviewOutput: "review",
    selectionOptions: {
      selectors: [
        "planning-page:Planning > Roadmap",
        "runbook:Deploy",
        "project-doc:Root > Overview",
      ],
    },
  }]);
});

test("runSyncCheck loads a temp manifest v2 and selector file before invoking the v2 contract", async () => {
  const tempDir = tempCommandDir();

  try {
    const manifestPath = writeTempManifest(tempDir, rawManifestV2([
      { kind: "planning-page", pagePath: " Planning > Roadmap ", file: "planning/roadmap.md" },
      { kind: "runbook", title: "Release Smoke Test", file: "runbooks/release.md" },
    ]));
    const entriesFile = writeJson(path.join(tempDir, "selectors.json"), {
      selectors: [{ kind: "runbook", target: "Release Smoke Test" }],
    });
    const calls = [];

    const result = await runSyncCheck({
      entries: ["planning-page:Planning > Roadmap"],
      entriesFile,
      manifestPath,
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      reviewOutput: path.join(tempDir, "review"),
      workspaceOverride: "workspace-override",
      loadWorkspaceConfigImpl: (workspaceName) => {
        calls.push({ op: "config", workspaceName });
        return config();
      },
      checkManifestV2SyncManifestImpl: async ({
        manifest: loadedManifest,
        projectTokenEnv,
        reviewOutput,
        selectionOptions,
      }) => {
        calls.push({
          op: "v2-check",
          manifestPath: loadedManifest.manifestPath,
          workspaceName: loadedManifest.workspaceName,
          projectName: loadedManifest.projectName,
          entries: loadedManifest.entries.map((entry) => ({
            kind: entry.kind,
            target: entry.target,
            targetField: entry.targetField,
            file: entry.file,
          })),
          projectTokenEnv,
          reviewOutput,
          selectionOptions,
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
      { op: "config", workspaceName: "workspace-override" },
      {
        op: "v2-check",
        manifestPath: path.resolve(manifestPath),
        workspaceName: "workspace-override",
        projectName: "SNPM",
        entries: [
          {
            kind: "planning-page",
            target: "Planning > Roadmap",
            targetField: "pagePath",
            file: ["planning", "roadmap.md"].join(path.sep),
          },
          {
            kind: "runbook",
            target: "Release Smoke Test",
            targetField: "title",
            file: ["runbooks", "release.md"].join(path.sep),
          },
        ],
        projectTokenEnv: "SNPM_NOTION_TOKEN",
        reviewOutput: path.join(tempDir, "review"),
        selectionOptions: {
          selectors: [
            "planning-page:Planning > Roadmap",
            { kind: "runbook", target: "Release Smoke Test" },
          ],
        },
      },
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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

test("runSyncPull passes manifest v2 selection options to the v2 implementation", async () => {
  const calls = [];
  const result = await runSyncPull({
    apply: true,
    entries: ["project-doc:Root > Overview"],
    entriesFile: "entries.json",
    manifestPath: "C:\\repo\\snpm.sync.json",
    loadSyncManifestImpl: () => manifest(2),
    loadWorkspaceConfigImpl: () => config(),
    readFileSyncImpl: () => JSON.stringify([{ kind: "runbook", target: "Deploy" }]),
    pullManifestV2SyncManifestImpl: async ({ entries, entriesFile, reviewOutput, selectionOptions }) => {
      calls.push({ entries, entriesFile, reviewOutput, selectionOptions });
      return {
        command: "sync-pull",
        failures: [],
        entries: [],
      };
    },
  });

  assert.equal(result.command, "sync-pull");
  assert.deepEqual(calls, [{
    entries: ["project-doc:Root > Overview"],
    entriesFile: "entries.json",
    reviewOutput: undefined,
    selectionOptions: {
      selectors: [
        "project-doc:Root > Overview",
        { kind: "runbook", target: "Deploy" },
      ],
    },
  }]);
});

test("runSyncPull loads a temp manifest v2 and returns pull sidecar contract data from the v2 adapter", async () => {
  const tempDir = tempCommandDir();

  try {
    const manifestPath = writeTempManifest(tempDir, rawManifestV2([
      { kind: "project-doc", docPath: "Root > Overview", file: "docs/overview.md" },
      { kind: "validation-session", title: "Session Fixture", file: "ops/validation/session.md" },
    ]));
    const entriesFile = writeJson(path.join(tempDir, "entries.json"), [
      { kind: "validation-session", target: "Session Fixture" },
    ]);
    const calls = [];

    const result = await runSyncPull({
      apply: true,
      entriesFile,
      manifestPath,
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      loadWorkspaceConfigImpl: (workspaceName) => {
        calls.push({ op: "config", workspaceName });
        return config();
      },
      pullManifestV2SyncManifestImpl: async ({
        apply,
        manifest: loadedManifest,
        projectTokenEnv,
        selectionOptions,
      }) => {
        calls.push({
          op: "v2-pull",
          apply,
          version: loadedManifest.version,
          targets: loadedManifest.entries.map((entry) => `${entry.kind}:${entry.target}`),
          projectTokenEnv,
          selectionOptions,
        });
        return {
          command: "sync-pull",
          applied: true,
          appliedCount: 1,
          driftCount: 1,
          failures: [],
          localWrites: [{
            file: ["ops", "validation", "session.md"].join(path.sep),
            metadataPath: `${["ops", "validation", "session.md"].join(path.sep)}.snpm-meta.json`,
          }],
          entries: [{
            kind: "validation-session",
            target: "Session Fixture",
            status: "pulled",
            hasDiff: true,
            applied: true,
            metadataPath: path.join(tempDir, "ops", "validation", "session.md.snpm-meta.json"),
          }],
          notionMutationCount: 0,
        };
      },
      pullValidationSessionSyncManifestImpl: async () => {
        throw new Error("v1 sync pull should not run for manifest v2");
      },
    });

    assert.equal(result.command, "sync-pull");
    assert.equal(result.applied, true);
    assert.equal(result.notionMutationCount, 0);
    assert.deepEqual(result.localWrites, [{
      file: ["ops", "validation", "session.md"].join(path.sep),
      metadataPath: `${["ops", "validation", "session.md"].join(path.sep)}.snpm-meta.json`,
    }]);
    assert.deepEqual(calls, [
      { op: "config", workspaceName: "infrastructure-hq" },
      {
        op: "v2-pull",
        apply: true,
        version: 2,
        targets: [
          "project-doc:Root > Overview",
          "validation-session:Session Fixture",
        ],
        projectTokenEnv: "SNPM_NOTION_TOKEN",
        selectionOptions: {
          selectors: [{ kind: "validation-session", target: "Session Fixture" }],
        },
      },
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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
      entries,
      entriesFile,
      manifest: loadedManifest,
      maxMutations,
      projectTokenEnv,
      refreshSidecars,
      reviewOutput,
    }) => {
      calls.push({
        op: "v2-push",
        apply,
        entries,
        entriesFile,
        maxMutations,
        notionVersion: loadedConfig.notionVersion,
        version: loadedManifest.version,
        projectTokenEnv,
        refreshSidecars,
        reviewOutput,
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
      entries: undefined,
      entriesFile: undefined,
      maxMutations: 1,
      notionVersion: "2026-03-11",
      version: 2,
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      refreshSidecars: true,
      reviewOutput: undefined,
    },
  ]);
});

test("runSyncPush passes manifest v2 selection, preview review output, and explicit mutation budget", async () => {
  const calls = [];
  const result = await runSyncPush({
    apply: false,
    entries: ["planning-page:Planning > Roadmap"],
    entriesFile: "entries.json",
    manifestPath: "C:\\repo\\snpm.sync.json",
    maxMutations: "all",
    reviewOutput: "review",
    loadSyncManifestImpl: () => manifest(2),
    loadWorkspaceConfigImpl: () => config(),
    readFileSyncImpl: () => JSON.stringify(["runbook:Deploy"]),
    pushManifestV2SyncManifestImpl: async ({ apply, entries, entriesFile, maxMutations, reviewOutput, selectionOptions }) => {
      calls.push({ apply, entries, entriesFile, maxMutations, reviewOutput, selectionOptions });
      return {
        command: "sync-push",
        failures: [],
        entries: [],
      };
    },
  });

  assert.equal(result.command, "sync-push");
  assert.deepEqual(calls, [{
    apply: false,
    entries: ["planning-page:Planning > Roadmap"],
    entriesFile: "entries.json",
    maxMutations: "all",
    reviewOutput: "review",
    selectionOptions: {
      selectors: [
        "planning-page:Planning > Roadmap",
        "runbook:Deploy",
      ],
    },
  }]);
});

test("runSyncPush defaults manifest v2 apply maxMutations to 1 but leaves preview unbudgeted", async () => {
  const maxMutationValues = [];

  await runSyncPush({
    apply: true,
    manifestPath: "C:\\repo\\snpm.sync.json",
    loadSyncManifestImpl: () => manifest(2),
    loadWorkspaceConfigImpl: () => config(),
    pushManifestV2SyncManifestImpl: async ({ maxMutations }) => {
      maxMutationValues.push(maxMutations);
      return { command: "sync-push", failures: [], entries: [] };
    },
  });

  await runSyncPush({
    apply: false,
    manifestPath: "C:\\repo\\snpm.sync.json",
    loadSyncManifestImpl: () => manifest(2),
    loadWorkspaceConfigImpl: () => config(),
    pushManifestV2SyncManifestImpl: async ({ maxMutations }) => {
      maxMutationValues.push(maxMutations);
      return { command: "sync-push", failures: [], entries: [] };
    },
  });

  assert.deepEqual(maxMutationValues, [1, undefined]);
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

test("runSyncPush loads a temp manifest v2 and forwards diagnostics-sidecar apply contract", async () => {
  const tempDir = tempCommandDir();

  try {
    const manifestPath = writeTempManifest(tempDir, rawManifestV2([
      { kind: "planning-page", pagePath: "Planning > Roadmap", file: "planning/roadmap.md" },
      { kind: "runbook", title: "Release Smoke Test", file: "runbooks/release.md" },
    ]));
    const entriesFile = writeJson(path.join(tempDir, "entries.json"), {
      entries: ["planning-page:Planning > Roadmap"],
    });
    const calls = [];

    const result = await runSyncPush({
      apply: true,
      entriesFile,
      manifestPath,
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      refreshSidecars: true,
      loadWorkspaceConfigImpl: () => config(),
      pushManifestV2SyncManifestImpl: async ({
        apply,
        manifest: loadedManifest,
        maxMutations,
        projectTokenEnv,
        refreshSidecars,
        selectionOptions,
      }) => {
        calls.push({
          apply,
          maxMutations,
          version: loadedManifest.version,
          targets: loadedManifest.entries.map((entry) => `${entry.kind}:${entry.target}`),
          projectTokenEnv,
          refreshSidecars,
          selectionOptions,
        });
        return {
          command: "sync-push",
          appliedCount: 1,
          failures: [],
          diagnostics: [{
            code: "manifest-v2-push-sidecar-stale-after-apply",
            severity: "warning",
            safeNextCommand: "sync pull --apply",
            recoveryAction: "Refresh sidecars before the next push.",
            entry: {
              kind: "planning-page",
              target: "Planning > Roadmap",
              file: ["planning", "roadmap.md"].join(path.sep),
            },
          }],
          entries: [{
            kind: "planning-page",
            target: "Planning > Roadmap",
            file: ["planning", "roadmap.md"].join(path.sep),
            targetPath: "Projects > SNPM > Planning > Roadmap",
            status: "pushed",
            hasDiff: true,
            diff: "+updated roadmap\n",
            applied: true,
            sidecarRefreshed: true,
            pageId: "page-roadmap",
          }],
        };
      },
      pushValidationSessionSyncManifestImpl: async () => {
        throw new Error("v1 sync push should not run for manifest v2");
      },
      tryRecordMutationJournalEntryImpl: () => ({
        ok: true,
        journalPath: path.join(tempDir, "journal.ndjson"),
      }),
    });

    assert.equal(result.command, "sync-push");
    assert.equal(result.appliedCount, 1);
    assert.deepEqual(result.journal, {
      path: path.join(tempDir, "journal.ndjson"),
      entryCount: 1,
    });
    assert.deepEqual(result.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      safeNextCommand: diagnostic.safeNextCommand,
      target: diagnostic.entry.target,
    })), [{
      code: "manifest-v2-push-sidecar-stale-after-apply",
      severity: "warning",
      safeNextCommand: "sync pull --apply",
      target: "Planning > Roadmap",
    }]);
    assert.deepEqual(calls, [{
      apply: true,
      maxMutations: 1,
      version: 2,
      targets: [
        "planning-page:Planning > Roadmap",
        "runbook:Release Smoke Test",
      ],
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      refreshSidecars: true,
      selectionOptions: {
        selectors: ["planning-page:Planning > Roadmap"],
      },
    }]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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

test("runSyncCheck, runSyncPull, and runSyncPush reject manifest v1 selection, review, and mutation budget options", async () => {
  await assert.rejects(
    runSyncCheck({
      entries: ["validation-session:Session"],
      manifestPath: "C:\\repo\\snpm.sync.json",
      loadSyncManifestImpl: () => manifest(1),
      loadWorkspaceConfigImpl: () => config(),
    }),
    /manifest v1.*--entry.*--entries-file/i,
  );

  await assert.rejects(
    runSyncPull({
      manifestPath: "C:\\repo\\snpm.sync.json",
      reviewOutput: "review",
      loadSyncManifestImpl: () => manifest(1),
      loadWorkspaceConfigImpl: () => config(),
    }),
    /manifest v1.*--review-output/i,
  );

  await assert.rejects(
    runSyncPush({
      manifestPath: "C:\\repo\\snpm.sync.json",
      maxMutations: 1,
      loadSyncManifestImpl: () => manifest(1),
      loadWorkspaceConfigImpl: () => config(),
    }),
    /manifest v1.*--max-mutations/i,
  );
});

test("runSyncPush rejects review output for manifest v2 apply", async () => {
  await assert.rejects(
    runSyncPush({
      apply: true,
      manifestPath: "C:\\repo\\snpm.sync.json",
      reviewOutput: "review",
      loadSyncManifestImpl: () => manifest(2),
      loadWorkspaceConfigImpl: () => config(),
    }),
    /--review-output.*preview/i,
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

test("temp manifest v1 remains validation-session only and rejects v2-only command options", async () => {
  const tempDir = tempCommandDir();

  try {
    const manifestPath = writeTempManifest(tempDir, rawManifestV1());
    const calls = [];

    const checkResult = await runSyncCheck({
      manifestPath,
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      loadWorkspaceConfigImpl: (workspaceName) => {
        calls.push({ op: "config", workspaceName });
        return config();
      },
      checkManifestV2SyncManifestImpl: async () => {
        throw new Error("v2 sync check should not run for manifest v1");
      },
      checkValidationSessionSyncManifestImpl: async ({ manifest: loadedManifest }) => {
        calls.push({
          op: "v1-check",
          version: loadedManifest.version,
          entries: loadedManifest.entries.map((entry) => `${entry.kind}:${entry.title}`),
        });
        return {
          command: "sync-check",
          failures: [],
          driftCount: 0,
          entries: [],
        };
      },
    });

    assert.equal(checkResult.command, "sync-check");
    assert.deepEqual(calls, [
      { op: "config", workspaceName: "infrastructure-hq" },
      {
        op: "v1-check",
        version: 1,
        entries: ["validation-session:Session Fixture"],
      },
    ]);

    await assert.rejects(
      runSyncCheck({
        entries: ["validation-session:Session Fixture"],
        manifestPath,
        loadWorkspaceConfigImpl: () => config(),
        checkManifestV2SyncManifestImpl: async () => {
          throw new Error("v2 sync check should not run for manifest v1 selectors");
        },
      }),
      /manifest v1.*--entry.*--entries-file/i,
    );

    await assert.rejects(
      runSyncPush({
        apply: true,
        manifestPath,
        maxMutations: "all",
        loadWorkspaceConfigImpl: () => config(),
        pushManifestV2SyncManifestImpl: async () => {
          throw new Error("v2 sync push should not run for manifest v1 budgets");
        },
      }),
      /manifest v1.*--max-mutations/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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

