import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";

import {
  MANIFEST_V2_SYNC_CHECK_KINDS,
  checkManifestV2SyncManifest,
  createManifestV2SyncCheckAdapters,
  targetForManifestV2SyncEntry,
} from "../src/notion/manifest-sync-check.mjs";
import { writeManifestV2PreviewReviewArtifacts } from "../src/commands/sync-review-output.mjs";

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

function diagnosticCodes(result) {
  return (result.diagnostics || []).map((diagnostic) => diagnostic.code);
}

function entryDiagnosticCodes(entry) {
  return (entry.diagnostics || []).map((diagnostic) => diagnostic.code);
}

function commandFamilyForKind(kind) {
  if (kind === "planning-page") {
    return "page";
  }

  if (["project-doc", "template-doc", "workspace-doc"].includes(kind)) {
    return "doc";
  }

  if (kind === "validation-session") {
    return "validation-session";
  }

  return kind;
}

function makePullMetadata({ authMode = "project-token", commandFamily, pageId, projectId, targetPath }) {
  const metadata = {
    schema: "snpm.pull-metadata.v1",
    commandFamily,
    workspaceName: "infrastructure-hq",
    targetPath,
    pageId,
    authMode,
    lastEditedTime: "2026-04-23T20:00:00.000Z",
    pulledAt: "2026-04-23T20:01:00.000Z",
  };

  if (projectId) {
    metadata.projectId = projectId;
  }

  return metadata;
}

function makePullResult({
  authMode = "project-token",
  commandFamily,
  markdown,
  markdownField = "bodyMarkdown",
  pageId,
  projectId = "project-root",
  targetPath,
}) {
  const result = {
    pageId,
    projectId,
    targetPath,
    authMode,
    liveMetadata: {
      pageId,
      lastEditedTime: "2026-04-23T20:00:00.000Z",
      archived: false,
    },
    metadata: makePullMetadata({
      authMode,
      commandFamily,
      pageId,
      projectId,
      targetPath,
    }),
  };
  result[markdownField] = markdown;
  return result;
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
        pageId: `${kind}-page`,
        projectId: "project-root",
        targetPath: `Projects > SNPM > ${target}`,
        authMode: projectTokenEnv ? "project-token" : "workspace-token",
        liveMetadata: {
          pageId: `${kind}-page`,
          lastEditedTime: "2026-04-23T20:00:00.000Z",
          archived: false,
        },
        metadata: makePullMetadata({
          authMode: projectTokenEnv ? "project-token" : "workspace-token",
          commandFamily: commandFamilyForKind(kind),
          pageId: `${kind}-page`,
          projectId: "project-root",
          targetPath: `Projects > SNPM > ${target}`,
        }),
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
  for (const entry of [result.entries[2], result.entries[4]]) {
    assert.equal("metadata" in entry, false);
    assert.equal("pageId" in entry, false);
    assert.equal("projectId" in entry, false);
    assert.equal("authMode" in entry, false);
    assert.equal("liveMetadata" in entry, false);
  }
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
  assert.deepEqual(entryDiagnosticCodes(result.entries[1]), ["manifest-v2-check-remote-failed"]);
  assert.deepEqual(diagnosticCodes(result), ["manifest-v2-check-remote-failed"]);
  assert.equal(result.diagnostics[0].severity, "error");
  assert.equal(result.diagnostics[0].safeNextCommand, "sync check");
  assert.equal(result.diagnostics[0].entry.kind, "project-doc");
  assert.equal(result.diagnostics[0].entry.target, "Root > Overview");
  assert.equal(result.diagnostics[0].entry.file, "docs/project-overview.md");
  assert.deepEqual(result.diagnostics[0].state, { phase: "check" });
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

test("manifest v2 check review output includes structured diagnostics", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("project-doc", "Root > Overview", "docs/project-overview.md"),
  ];
  const localFiles = new Map(entries.map((entry) => [entry.absoluteFilePath, `${entry.target}\n`]));
  const reviewDir = mkdtempSync(path.join(os.tmpdir(), "snpm-check-review-"));

  try {
    const result = await checkManifestV2SyncManifest({
      adapters: makeFakeAdapters({
        failuresByTarget: new Map([["Root > Overview", "Doc target could not be read."]]),
      }),
      config: baseConfig(),
      manifest: baseManifest(entries),
      readFileSyncImpl: mapBackedReadFile(localFiles),
    });

    const artifacts = writeManifestV2PreviewReviewArtifacts({
      result,
      reviewOutputDir: reviewDir,
    });
    const summary = JSON.parse(readFileSync(artifacts.summaryPath, "utf8"));
    const failedEntryPath = artifacts.files.find((filePath) => filePath.endsWith("002-project-doc-root-overview.review.json"));
    const failedEntry = JSON.parse(readFileSync(failedEntryPath, "utf8"));

    assert.deepEqual(summary.diagnostics.map((diagnostic) => diagnostic.code), ["manifest-v2-check-remote-failed"]);
    assert.deepEqual(summary.entries.map((entry) => entry.diagnostics?.map((diagnostic) => diagnostic.code)), [
      undefined,
      ["manifest-v2-check-remote-failed"],
    ]);
    assert.deepEqual(failedEntry.diagnostics.map((diagnostic) => diagnostic.code), ["manifest-v2-check-remote-failed"]);
    assert.equal(failedEntry.failure, "Doc target could not be read.");
  } finally {
    rmSync(reviewDir, { recursive: true, force: true });
  }
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
  assert.equal(result.entries.some((entry) => "metadata" in entry), false);
});

test("manifest v2 check processes only selected entries and reports selection metadata", async () => {
  const entries = mixedEntries();
  const selectedEntries = [entries[1], entries[4]];
  const calls = [];
  const localFiles = new Map(entries.map((entry) => [entry.absoluteFilePath, `${entry.target}\n`]));

  const result = await checkManifestV2SyncManifest({
    adapters: makeFakeAdapters({ calls }),
    config: baseConfig(),
    manifest: baseManifest(entries),
    readFileSyncImpl: mapBackedReadFile(localFiles),
    selectedEntries,
  });

  assert.deepEqual(result.entries.map((entry) => entry.target), [
    "Root > Overview",
    "SNPM Operator Validation Runbook",
  ]);
  assert.deepEqual(calls.map((call) => call.target), [
    "Root > Overview",
    "SNPM Operator Validation Runbook",
  ]);
  assert.equal("selection" in result, true);
  assert.equal(result.selectedCount, 2);
  assert.equal(result.skippedCount, 4);
  assert.deepEqual(result.skippedEntries.map((entry) => entry.target), [
    "Planning > Roadmap",
    "Templates > Project Templates > Overview",
    "Runbooks > Notion Workspace Workflow",
    "SNPM Validation Session Fixture",
  ]);
});

test("default manifest v2 readRemote adapters preserve pull metadata and identifiers", async () => {
  const entries = mixedEntries();
  const manifest = baseManifest(entries);
  const calls = [];
  const adapters = createManifestV2SyncCheckAdapters({
    pullApprovedPageBodyImpl: async (args) => {
      calls.push({ op: "page-pull", args });
      return makePullResult({
        commandFamily: "page",
        markdown: "planning remote\n",
        pageId: "planning-page",
        projectId: "project-root",
        targetPath: "Projects > SNPM > Planning > Roadmap",
      });
    },
    pullDocBodyImpl: async (args) => {
      calls.push({ op: "doc-pull", args });
      return makePullResult({
        authMode: args.projectName ? "project-token" : "workspace-token",
        commandFamily: "doc",
        markdown: `doc remote: ${args.docPath}\n`,
        pageId: `doc-page-${calls.length}`,
        projectId: args.projectName ? "project-root" : null,
        targetPath: `Docs > ${args.docPath}`,
      });
    },
    pullRunbookBodyImpl: async (args) => {
      calls.push({ op: "runbook-pull", args });
      return makePullResult({
        commandFamily: "runbook",
        markdown: "runbook remote\n",
        pageId: "runbook-page",
        projectId: "project-root",
        targetPath: `Projects > SNPM > Runbooks > ${args.title}`,
      });
    },
    pullValidationSessionFileImpl: async (args) => {
      calls.push({ op: "validation-session-pull", args });
      return makePullResult({
        commandFamily: "validation-session",
        markdown: "validation remote\n",
        markdownField: "fileMarkdown",
        pageId: "validation-page",
        projectId: "project-root",
        targetPath: `Projects > SNPM > Ops > Validation > Validation Sessions > ${args.title}`,
      });
    },
  });
  const adapterInput = {
    config: baseConfig(),
    manifest,
    projectTokenEnv: "SNPM_NOTION_TOKEN",
  };

  const planning = await adapters["planning-page"].readRemote({ ...adapterInput, entry: entries[0] });
  const docs = await Promise.all(entries.slice(1, 4).map((entry) => adapters[entry.kind].readRemote({
    ...adapterInput,
    entry,
  })));
  const runbook = await adapters.runbook.readRemote({ ...adapterInput, entry: entries[4] });
  const validationSession = await adapters["validation-session"].readRemote({ ...adapterInput, entry: entries[5] });
  const remotes = [planning, ...docs, runbook, validationSession];

  assert.deepEqual(remotes.map((remote) => remote.markdown), [
    "planning remote\n",
    "doc remote: Root > Overview\n",
    "doc remote: Templates > Project Templates > Overview\n",
    "doc remote: Runbooks > Notion Workspace Workflow\n",
    "runbook remote\n",
    "validation remote\n",
  ]);
  assert.deepEqual(remotes.map((remote) => remote.metadata.commandFamily), [
    "page",
    "doc",
    "doc",
    "doc",
    "runbook",
    "validation-session",
  ]);
  assert.deepEqual(remotes.map((remote) => remote.pageId), [
    "planning-page",
    "doc-page-2",
    "doc-page-3",
    "doc-page-4",
    "runbook-page",
    "validation-page",
  ]);
  assert.equal(planning.projectId, "project-root");
  assert.equal(docs[0].projectId, "project-root");
  assert.equal(docs[1].projectId, null);
  assert.equal(docs[2].projectId, null);
  assert.deepEqual(remotes.map((remote) => remote.authMode), [
    "project-token",
    "project-token",
    "workspace-token",
    "workspace-token",
    "project-token",
    "project-token",
  ]);
  assert.deepEqual(remotes.map((remote) => remote.liveMetadata.pageId), remotes.map((remote) => remote.pageId));
  assert.deepEqual(calls.map((call) => call.op), [
    "page-pull",
    "doc-pull",
    "doc-pull",
    "doc-pull",
    "runbook-pull",
    "validation-session-pull",
  ]);
  assert.equal(calls[1].args.projectName, "SNPM");
  assert.equal(calls[2].args.projectName, undefined);
  assert.equal(calls[3].args.projectName, undefined);
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
