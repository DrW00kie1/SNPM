import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  MANIFEST_V2_SYNC_CHECK_KINDS,
  checkManifestV2SyncManifest,
  createManifestV2SyncCheckAdapters,
  targetForManifestV2SyncEntry,
} from "../src/notion/manifest-sync-check.mjs";

const manifestDir = "C:\\repo";

function makeEntry(kind, target, file) {
  const entry = {
    kind,
    target,
    file,
    absoluteFilePath: path.join(manifestDir, file),
  };

  if (kind === "planning-page") {
    entry.pagePath = target;
  } else if (["project-doc", "template-doc", "workspace-doc"].includes(kind)) {
    entry.docPath = target;
  } else {
    entry.title = target;
  }

  return entry;
}

function mixedEntries() {
  return [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("project-doc", "Root > Overview", "docs/project-overview.md"),
    makeEntry("template-doc", "Templates > Project Templates > Overview", "docs/template-overview.md"),
    makeEntry("workspace-doc", "Runbooks > Notion Workspace Workflow", "docs/workflow.md"),
    makeEntry("runbook", "SNPM Operator Validation Runbook", "runbooks/operator.md"),
    makeEntry("validation-session", "SNPM Validation Session Fixture", "ops/validation/session.md"),
  ];
}

function baseManifest(entries = mixedEntries()) {
  return {
    manifestPath: path.join(manifestDir, "snpm.sync.json"),
    manifestDir,
    workspaceName: "infrastructure-hq",
    projectName: "SNPM",
    entries,
  };
}

function baseConfig() {
  return {
    notionVersion: "2026-03-11",
    workspace: { projectsPageId: "projects" },
  };
}

function missingFileError(filePath) {
  const error = new Error(`ENOENT: ${filePath}`);
  error.code = "ENOENT";
  return error;
}

function mapBackedReadFile(localFiles, readCalls = []) {
  return (filePath, encoding) => {
    readCalls.push({ filePath, encoding });
    assert.equal(encoding, "utf8");

    if (!localFiles.has(filePath)) {
      throw missingFileError(filePath);
    }

    return localFiles.get(filePath);
  };
}

function simpleMissingLocalDiff(_currentMarkdown, nextMarkdown) {
  return `missing-local\n+++ remote\n${nextMarkdown}`;
}

function makeFakeAdapters({
  calls = [],
  diffByTarget = new Map(),
  failuresByTarget = new Map(),
  mutationCalls = [],
  remoteByTarget = new Map(),
} = {}) {
  return Object.fromEntries(MANIFEST_V2_SYNC_CHECK_KINDS.map((kind) => [kind, {
    async diffLocal({ entry, localMarkdown, manifest, projectTokenEnv }) {
      const target = targetForManifestV2SyncEntry(entry);
      calls.push({
        op: "diffLocal",
        kind,
        target,
        localMarkdown,
        projectName: manifest.projectName,
        projectTokenEnv,
      });

      if (failuresByTarget.has(target)) {
        throw new Error(failuresByTarget.get(target));
      }

      return diffByTarget.get(target) || {
        targetPath: `Projects > SNPM > ${target}`,
        hasDiff: false,
        diff: "",
      };
    },
    async readRemote({ entry, manifest, projectTokenEnv }) {
      const target = targetForManifestV2SyncEntry(entry);
      calls.push({
        op: "readRemote",
        kind,
        target,
        projectName: manifest.projectName,
        projectTokenEnv,
      });

      if (failuresByTarget.has(target)) {
        throw new Error(failuresByTarget.get(target));
      }

      return {
        targetPath: `Projects > SNPM > ${target}`,
        markdown: remoteByTarget.get(target) || `# ${target}\nRemote body\n`,
      };
    },
    async mutateRemote() {
      mutationCalls.push({ kind, op: "mutateRemote" });
      throw new Error("mutation hooks must not be called by sync check");
    },
    async writeLocal() {
      mutationCalls.push({ kind, op: "writeLocal" });
      throw new Error("write hooks must not be called by sync check");
    },
  }]));
}

test("manifest v2 check handles mixed entries, drift, missing local files, and in-sync entries", async () => {
  const entries = mixedEntries();
  const manifest = baseManifest(entries);
  const localFiles = new Map([
    [entries[0].absoluteFilePath, "Roadmap local\r\n"],
    [entries[1].absoluteFilePath, "Project doc local\n"],
    [entries[3].absoluteFilePath, "Workspace doc local\n"],
    [entries[5].absoluteFilePath, "Validation local\n"],
  ]);
  const calls = [];
  const diffByTarget = new Map([
    ["Planning > Roadmap", {
      targetPath: "Projects > SNPM > Planning > Roadmap",
      hasDiff: false,
      diff: "",
    }],
    ["Root > Overview", {
      targetPath: "Projects > SNPM > Overview",
      hasDiff: true,
      diff: "project-doc drift\n",
    }],
    ["Runbooks > Notion Workspace Workflow", {
      targetPath: "Runbooks > Notion Workspace Workflow",
      hasDiff: false,
      diff: "",
    }],
    ["SNPM Validation Session Fixture", {
      targetPath: "Projects > SNPM > Ops > Validation > Validation Sessions > SNPM Validation Session Fixture",
      hasDiff: true,
      diff: "validation drift\n",
    }],
  ]);
  const remoteByTarget = new Map([
    ["Templates > Project Templates > Overview", "Template remote\n"],
    ["SNPM Operator Validation Runbook", "Runbook remote\n"],
  ]);

  const result = await checkManifestV2SyncManifest({
    adapters: makeFakeAdapters({ calls, diffByTarget, remoteByTarget }),
    config: baseConfig(),
    diffMarkdownTextImpl: simpleMissingLocalDiff,
    manifest,
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    readFileSyncImpl: mapBackedReadFile(localFiles),
  });

  assert.equal(result.command, "sync-check");
  assert.equal(result.authMode, "project-token");
  assert.equal(result.hasDiff, true);
  assert.equal(result.driftCount, 4);
  assert.equal(result.appliedCount, 0);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.entries.map((entry) => ({
    kind: entry.kind,
    target: entry.target,
    status: entry.status,
    hasDiff: entry.hasDiff,
    applied: entry.applied,
  })), [
    { kind: "planning-page", target: "Planning > Roadmap", status: "in-sync", hasDiff: false, applied: false },
    { kind: "project-doc", target: "Root > Overview", status: "drift", hasDiff: true, applied: false },
    { kind: "template-doc", target: "Templates > Project Templates > Overview", status: "missing-local-file", hasDiff: true, applied: false },
    { kind: "workspace-doc", target: "Runbooks > Notion Workspace Workflow", status: "in-sync", hasDiff: false, applied: false },
    { kind: "runbook", target: "SNPM Operator Validation Runbook", status: "missing-local-file", hasDiff: true, applied: false },
    { kind: "validation-session", target: "SNPM Validation Session Fixture", status: "drift", hasDiff: true, applied: false },
  ]);
  assert.deepEqual(calls.map((call) => `${call.kind}:${call.op}`), [
    "planning-page:diffLocal",
    "project-doc:diffLocal",
    "template-doc:readRemote",
    "workspace-doc:diffLocal",
    "runbook:readRemote",
    "validation-session:diffLocal",
  ]);
  assert.equal(result.entries[2].diff.includes("Template remote"), true);
  assert.equal(result.entries[4].diff.includes("Runbook remote"), true);
});

test("manifest v2 check isolates per-entry adapter failures", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("project-doc", "Root > Overview", "docs/project-overview.md"),
    makeEntry("runbook", "SNPM Operator Validation Runbook", "runbooks/operator.md"),
  ];
  const manifest = baseManifest(entries);
  const localFiles = new Map(entries.map((entry) => [entry.absoluteFilePath, `${entry.target}\n`]));
  const calls = [];

  const result = await checkManifestV2SyncManifest({
    adapters: makeFakeAdapters({
      calls,
      failuresByTarget: new Map([["Root > Overview", "Doc target could not be read."]]),
    }),
    config: baseConfig(),
    manifest,
    readFileSyncImpl: mapBackedReadFile(localFiles),
  });

  assert.deepEqual(result.entries.map((entry) => entry.status), ["in-sync", "error", "in-sync"]);
  assert.equal(result.entries[1].failure, "Doc target could not be read.");
  assert.equal("failure" in result.entries[0], false);
  assert.equal("failure" in result.entries[2], false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /project-doc "Root > Overview"/);
  assert.deepEqual(calls.map((call) => call.target), [
    "Planning > Roadmap",
    "Root > Overview",
    "SNPM Operator Validation Runbook",
  ]);
});

test("manifest v2 check does not call write or mutation hooks", async () => {
  const entries = [
    makeEntry("template-doc", "Templates > Project Templates > Overview", "docs/template-overview.md"),
    makeEntry("validation-session", "SNPM Validation Session Fixture", "ops/validation/session.md"),
  ];
  const mutationCalls = [];
  const localFiles = new Map([
    [entries[1].absoluteFilePath, "Validation local\n"],
  ]);

  const result = await checkManifestV2SyncManifest({
    adapters: makeFakeAdapters({ mutationCalls }),
    config: baseConfig(),
    diffMarkdownTextImpl: simpleMissingLocalDiff,
    manifest: baseManifest(entries),
    readFileSyncImpl: mapBackedReadFile(localFiles),
  });

  assert.equal(result.entries.every((entry) => entry.applied === false), true);
  assert.equal(result.appliedCount, 0);
  assert.deepEqual(mutationCalls, []);
});

test("default manifest v2 adapters route normalized entries to existing read-only helpers", async () => {
  const entries = mixedEntries();
  const manifest = baseManifest(entries);
  const localFiles = new Map(entries.map((entry) => [entry.absoluteFilePath, `${entry.target}\n`]));
  const calls = [];
  const adapters = createManifestV2SyncCheckAdapters({
    diffApprovedPageBodyImpl: async (args) => {
      calls.push({ op: "page-diff", args });
      return { targetPath: "Projects > SNPM > Planning > Roadmap", hasDiff: false, diff: "" };
    },
    pullApprovedPageBodyImpl: async (args) => {
      calls.push({ op: "page-pull", args });
      return { targetPath: "Projects > SNPM > Planning > Roadmap", bodyMarkdown: "remote\n" };
    },
    diffDocBodyImpl: async (args) => {
      calls.push({ op: "doc-diff", args });
      return { targetPath: args.docPath, hasDiff: false, diff: "" };
    },
    pullDocBodyImpl: async (args) => {
      calls.push({ op: "doc-pull", args });
      return { targetPath: args.docPath, bodyMarkdown: "remote\n" };
    },
    diffRunbookBodyImpl: async (args) => {
      calls.push({ op: "runbook-diff", args });
      return { targetPath: `Projects > SNPM > Runbooks > ${args.title}`, hasDiff: false, diff: "" };
    },
    pullRunbookBodyImpl: async (args) => {
      calls.push({ op: "runbook-pull", args });
      return { targetPath: `Projects > SNPM > Runbooks > ${args.title}`, bodyMarkdown: "remote\n" };
    },
    diffValidationSessionFileImpl: async (args) => {
      calls.push({ op: "validation-session-diff", args });
      return { targetPath: `Projects > SNPM > Ops > Validation > Validation Sessions > ${args.title}`, hasDiff: false, diff: "" };
    },
    pullValidationSessionFileImpl: async (args) => {
      calls.push({ op: "validation-session-pull", args });
      return { targetPath: `Projects > SNPM > Ops > Validation > Validation Sessions > ${args.title}`, fileMarkdown: "remote\n" };
    },
  });

  const result = await checkManifestV2SyncManifest({
    adapters,
    config: baseConfig(),
    manifest,
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    readFileSyncImpl: mapBackedReadFile(localFiles),
  });

  assert.equal(result.hasDiff, false);
  assert.deepEqual(calls.map((call) => call.op), [
    "page-diff",
    "doc-diff",
    "doc-diff",
    "doc-diff",
    "runbook-diff",
    "validation-session-diff",
  ]);
  assert.equal(calls[0].args.pagePath, "Planning > Roadmap");
  assert.equal(calls[0].args.fileBodyMarkdown, "Planning > Roadmap\n");
  assert.equal(calls[1].args.docPath, "Root > Overview");
  assert.equal(calls[1].args.projectName, "SNPM");
  assert.equal(calls[2].args.docPath, "Templates > Project Templates > Overview");
  assert.equal(calls[2].args.projectName, undefined);
  assert.equal(calls[3].args.docPath, "Runbooks > Notion Workspace Workflow");
  assert.equal(calls[3].args.projectName, undefined);
  assert.equal(calls[4].args.title, "SNPM Operator Validation Runbook");
  assert.equal(calls[4].args.commandFamily, "runbook");
  assert.equal(calls[5].args.title, "SNPM Validation Session Fixture");
  assert.equal(calls[5].args.fileMarkdown, "SNPM Validation Session Fixture\n");
  assert.equal(calls.every((call) => call.args.projectTokenEnv === "SNPM_NOTION_TOKEN"), true);
  assert.equal(calls.every((call) => call.args.workspaceName === "infrastructure-hq"), true);
});
