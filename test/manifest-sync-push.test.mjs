import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  MANIFEST_V2_SYNC_CHECK_KINDS,
  targetForManifestV2SyncEntry,
} from "../src/notion/manifest-sync-check.mjs";
import {
  MANIFEST_V2_PUSH_DIAGNOSTIC_CODES,
} from "../src/notion/manifest-sync-diagnostics.mjs";
import {
  createManifestV2SyncPushAdapters,
  pushManifestV2SyncManifest,
} from "../src/notion/manifest-sync-push.mjs";
import { assertJsonContract } from "../src/contracts/json-contracts.mjs";

const manifestDir = path.resolve("manifest-v2-push-fixture");

function makeEntry(kind, target, file, overrides = {}) {
  const entry = {
    kind,
    target,
    file,
    absoluteFilePath: path.join(manifestDir, file),
    ...overrides,
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

function baseManifest(entries) {
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

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function projectIdForKind(kind) {
  return ["template-doc", "workspace-doc"].includes(kind) ? undefined : "project-snpm";
}

function remoteFor(entry, overrides = {}) {
  const target = targetForManifestV2SyncEntry(entry);
  const pageId = overrides.pageId || `page-${slug(target)}`;
  const projectId = Object.hasOwn(overrides, "projectId") ? overrides.projectId : projectIdForKind(entry.kind);
  const targetPath = overrides.targetPath || `Projects > SNPM > ${target}`;
  const lastEditedTime = overrides.lastEditedTime || "2026-04-23T12:00:00.000Z";
  const metadata = {
    schema: "snpm.pull-metadata.v1",
    commandFamily: commandFamilyForKind(entry.kind),
    workspaceName: "infrastructure-hq",
    targetPath,
    pageId,
    authMode: "project-token",
    lastEditedTime,
    pulledAt: "2026-04-23T12:01:00.000Z",
  };

  if (projectId) {
    metadata.projectId = projectId;
  }

  return {
    pageId,
    projectId: projectId || null,
    targetPath,
    authMode: "project-token",
    liveMetadata: {
      pageId,
      lastEditedTime,
      archived: overrides.archived === true,
    },
    metadata,
    markdown: overrides.markdown || `Remote ${target}\n`,
  };
}

function previewFor(entry, localMarkdown, overrides = {}) {
  const remote = remoteFor(entry, overrides);
  const remoteMarkdown = overrides.remoteMarkdown || remote.markdown;
  const diff = localMarkdown === remoteMarkdown ? "" : `--- remote\n+++ local\n${localMarkdown}`;

  return {
    pageId: remote.pageId,
    projectId: remote.projectId,
    targetPath: remote.targetPath,
    authMode: remote.authMode,
    hasDiff: diff.length > 0,
    diff,
    nextBodyMarkdown: Object.hasOwn(overrides, "nextBodyMarkdown") ? overrides.nextBodyMarkdown : localMarkdown,
    applied: false,
    warnings: overrides.warnings || [],
  };
}

function metadataText(entry, overrides = {}) {
  return `${JSON.stringify({
    ...remoteFor(entry).metadata,
    ...overrides,
  }, null, 2)}\n`;
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

    const value = localFiles.get(filePath);
    if (value instanceof Error) {
      throw value;
    }

    return value;
  };
}

function diagnosticCodes(result) {
  return (result.diagnostics || []).map((diagnostic) => diagnostic.code);
}

function entryDiagnosticCodes(entry) {
  return (entry.diagnostics || []).map((diagnostic) => diagnostic.code);
}

function throwConfiguredFailure(failure) {
  if (failure instanceof Error) {
    throw failure;
  }

  throw new Error(failure);
}

function makeFakeAdapters({
  applyFailuresByTarget = new Map(),
  calls = [],
  mutationCalls = [],
  previewByTarget = new Map(),
  previewFailuresByTarget = new Map(),
  remoteByTarget = new Map(),
  remoteFailuresByTarget = new Map(),
} = {}) {
  return Object.fromEntries(MANIFEST_V2_SYNC_CHECK_KINDS.map((kind) => [kind, {
    async pushLocal({ apply, entry, fileMarkdown, manifest, metadata, projectTokenEnv }) {
      const target = targetForManifestV2SyncEntry(entry);
      calls.push({
        op: "pushLocal",
        apply,
        kind,
        target,
        fileMarkdown,
        metadata,
        projectName: manifest.projectName,
        projectTokenEnv,
      });

      if (apply) {
        mutationCalls.push({ kind, target });
        if (applyFailuresByTarget.has(target)) {
          throwConfiguredFailure(applyFailuresByTarget.get(target));
        }
      } else if (previewFailuresByTarget.has(target)) {
        throwConfiguredFailure(previewFailuresByTarget.get(target));
      }

      const result = previewByTarget.get(target) || previewFor(entry, fileMarkdown);
      return {
        ...result,
        applied: apply && result.hasDiff,
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

      if (remoteFailuresByTarget.has(target)) {
        throwConfiguredFailure(remoteFailuresByTarget.get(target));
      }

      const remoteOverride = remoteByTarget.get(target);
      if (typeof remoteOverride === "function") {
        return remoteOverride({
          entry,
          kind,
          manifest,
          projectTokenEnv,
          target,
        });
      }

      return remoteOverride || remoteFor(entry);
    },
  }]));
}

test("manifest v2 push preview reports mixed entries without sidecars or mutation", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("project-doc", "Root > Overview", "docs/project-overview.md"),
    makeEntry("runbook", "Missing Runbook", "runbooks/missing.md"),
    makeEntry("validation-session", "Remote Failure", "ops/validation/session.md"),
  ];
  const localFiles = new Map([
    [entries[0].absoluteFilePath, remoteFor(entries[0]).markdown],
    [entries[1].absoluteFilePath, "Local project doc drift\n"],
    [entries[3].absoluteFilePath, "Local validation session\n"],
  ]);
  const calls = [];
  const mutationCalls = [];
  const readCalls = [];

  const result = await pushManifestV2SyncManifest({
    adapters: makeFakeAdapters({
      calls,
      mutationCalls,
      previewFailuresByTarget: new Map([["Remote Failure", "Validation session could not be diffed."]]),
    }),
    config: baseConfig(),
    manifest: baseManifest(entries),
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    readFileSyncImpl: mapBackedReadFile(localFiles, readCalls),
  });

  assert.equal(result.command, "sync-push");
  assert.equal(result.authMode, "project-token");
  assert.equal(result.hasDiff, true);
  assert.equal(result.driftCount, 1);
  assert.equal(result.appliedCount, 0);
  assert.deepEqual(result.entries.map((entry) => ({
    kind: entry.kind,
    target: entry.target,
    file: entry.file,
    metadataPath: entry.metadataPath,
    status: entry.status,
    hasDiff: entry.hasDiff,
    applied: entry.applied,
  })), [
    {
      kind: "planning-page",
      target: "Planning > Roadmap",
      file: "planning/roadmap.md",
      metadataPath: `${entries[0].absoluteFilePath}.snpm-meta.json`,
      status: "in-sync",
      hasDiff: false,
      applied: false,
    },
    {
      kind: "project-doc",
      target: "Root > Overview",
      file: "docs/project-overview.md",
      metadataPath: `${entries[1].absoluteFilePath}.snpm-meta.json`,
      status: "push-preview",
      hasDiff: true,
      applied: false,
    },
    {
      kind: "runbook",
      target: "Missing Runbook",
      file: "runbooks/missing.md",
      metadataPath: `${entries[2].absoluteFilePath}.snpm-meta.json`,
      status: "error",
      hasDiff: false,
      applied: false,
    },
    {
      kind: "validation-session",
      target: "Remote Failure",
      file: "ops/validation/session.md",
      metadataPath: `${entries[3].absoluteFilePath}.snpm-meta.json`,
      status: "error",
      hasDiff: false,
      applied: false,
    },
  ]);
  assert.match(result.entries[2].failure, /sync pull --apply/i);
  assert.match(result.entries[3].failure, /could not be diffed/i);
  assert.equal(result.failures.length, 2);
  assert.deepEqual(calls.map((call) => `${call.kind}:${call.op}:${call.target}`), [
    "planning-page:pushLocal:Planning > Roadmap",
    "project-doc:pushLocal:Root > Overview",
    "validation-session:pushLocal:Remote Failure",
  ]);
  assert.deepEqual(readCalls.map((call) => call.filePath), entries.map((entry) => entry.absoluteFilePath));
  assert.deepEqual(mutationCalls, []);
  assertJsonContract("snpm.manifest-v2.sync-result.v1", result);
  assertJsonContract("snpm.manifest-v2.diagnostic.v1", result.diagnostics[0]);
});

test("manifest v2 push apply validates sidecars and calls push adapters", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
  ];
  const localFiles = new Map([
    [entries[0].absoluteFilePath, "Local roadmap update\n"],
    [`${entries[0].absoluteFilePath}.snpm-meta.json`, metadataText(entries[0])],
    [entries[1].absoluteFilePath, "Runbook update\n"],
    [`${entries[1].absoluteFilePath}.snpm-meta.json`, metadataText(entries[1])],
  ]);
  const calls = [];
  const mutationCalls = [];

  const result = await pushManifestV2SyncManifest({
    adapters: makeFakeAdapters({ calls, mutationCalls }),
    apply: true,
    config: baseConfig(),
    manifest: baseManifest(entries),
    maxMutations: "all",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    readFileSyncImpl: mapBackedReadFile(localFiles),
  });

  assert.deepEqual(result.failures, []);
  assert.equal(result.appliedCount, 2);
  assert.equal(result.driftCount, 2);
  assert.deepEqual(result.entries.map((entry) => ({
    status: entry.status,
    hasDiff: entry.hasDiff,
    applied: entry.applied,
  })), [
    { status: "pushed", hasDiff: true, applied: true },
    { status: "pushed", hasDiff: true, applied: true },
  ]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /sync pull --apply/i);
  assert.deepEqual(diagnosticCodes(result), [
    MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_STALE_AFTER_APPLY,
  ]);
  assert.equal(result.diagnostics[0].severity, "warning");
  assert.equal(result.diagnostics[0].state.appliedCount, 2);
  assertJsonContract("snpm.manifest-v2.sync-result.v1", result);
  assertJsonContract("snpm.manifest-v2.diagnostic.v1", result.diagnostics[0]);
  assert.deepEqual(calls.map((call) => `${call.op}:${call.apply}:${call.target}`), [
    "pushLocal:false:Planning > Roadmap",
    "readRemote:undefined:Planning > Roadmap",
    "pushLocal:false:Release Smoke Test",
    "readRemote:undefined:Release Smoke Test",
    "pushLocal:true:Planning > Roadmap",
    "pushLocal:true:Release Smoke Test",
  ]);
  assert.deepEqual(mutationCalls.map((call) => call.target), [
    "Planning > Roadmap",
    "Release Smoke Test",
  ]);
  assert.equal(calls[4].metadata.pageId, remoteFor(entries[0]).pageId);
  assert.equal(calls[5].metadata.pageId, remoteFor(entries[1]).pageId);
});

test("manifest v2 push refreshSidecars is only valid with apply and performs no preview work", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
  ];
  const calls = [];
  const readCalls = [];
  const writes = [];

  const result = await pushManifestV2SyncManifest({
    adapters: makeFakeAdapters({ calls }),
    config: baseConfig(),
    manifest: baseManifest(entries),
    readFileSyncImpl: mapBackedReadFile(new Map(), readCalls),
    refreshSidecars: true,
    writeFileSyncImpl: (...args) => writes.push(args),
  });

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /requires --apply/);
  assert.equal(result.entries[0].status, "error");
  assert.match(result.recovery, /--apply/);
  assert.deepEqual(diagnosticCodes(result), [
    MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.REFRESH_SIDECARS_REQUIRES_APPLY,
  ]);
  assert.equal(result.diagnostics[0].severity, "error");
  assert.equal(result.diagnostics[0].safeNextCommand, "sync push --apply --refresh-sidecars");
  assert.equal(result.diagnostics[0].entry.target, "Planning > Roadmap");
  assertJsonContract("snpm.manifest-v2.sync-result.v1", result);
  assertJsonContract("snpm.manifest-v2.diagnostic.v1", result.diagnostics[0]);
  assert.deepEqual(calls, []);
  assert.deepEqual(readCalls, []);
  assert.deepEqual(writes, []);
});

test("manifest v2 push apply refreshes sidecars after all mutations succeed", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
  ];
  const localMarkdownByTarget = new Map([
    ["Planning > Roadmap", "Local roadmap update\n"],
    ["Release Smoke Test", "Runbook update\n"],
  ]);
  const refreshLastEditedTime = "2026-04-23T12:05:00.000Z";
  const readCounts = new Map();
  const refreshedRemote = (entry) => {
    const target = targetForManifestV2SyncEntry(entry);
    const count = readCounts.get(target) || 0;
    readCounts.set(target, count + 1);
    return count === 0
      ? remoteFor(entry)
      : remoteFor(entry, {
        lastEditedTime: refreshLastEditedTime,
        markdown: localMarkdownByTarget.get(target),
      });
  };
  const localFiles = new Map([
    [entries[0].absoluteFilePath, localMarkdownByTarget.get("Planning > Roadmap")],
    [`${entries[0].absoluteFilePath}.snpm-meta.json`, metadataText(entries[0])],
    [entries[1].absoluteFilePath, localMarkdownByTarget.get("Release Smoke Test")],
    [`${entries[1].absoluteFilePath}.snpm-meta.json`, metadataText(entries[1])],
  ]);
  const calls = [];
  const mutationCalls = [];
  const writes = [];
  const renames = [];

  const result = await pushManifestV2SyncManifest({
    adapters: makeFakeAdapters({
      calls,
      mutationCalls,
      remoteByTarget: new Map([
        ["Planning > Roadmap", ({ entry }) => refreshedRemote(entry)],
        ["Release Smoke Test", ({ entry }) => refreshedRemote(entry)],
      ]),
    }),
    apply: true,
    config: baseConfig(),
    manifest: baseManifest(entries),
    maxMutations: "all",
    readFileSyncImpl: mapBackedReadFile(localFiles),
    refreshSidecars: true,
    renameSyncImpl: (...args) => renames.push(args),
    writeFileSyncImpl: (...args) => writes.push(args),
  });

  assert.deepEqual(result.failures, []);
  assert.equal(result.appliedCount, 2);
  assert.equal(result.warnings, undefined);
  assert.equal(result.diagnostics, undefined);
  assert.deepEqual(result.entries.map((entry) => ({
    status: entry.status,
    applied: entry.applied,
    sidecarRefreshed: entry.sidecarRefreshed,
  })), [
    { status: "pushed", applied: true, sidecarRefreshed: true },
    { status: "pushed", applied: true, sidecarRefreshed: true },
  ]);
  assert.deepEqual(calls.map((call) => `${call.op}:${call.apply}:${call.target}`), [
    "pushLocal:false:Planning > Roadmap",
    "readRemote:undefined:Planning > Roadmap",
    "pushLocal:false:Release Smoke Test",
    "readRemote:undefined:Release Smoke Test",
    "pushLocal:true:Planning > Roadmap",
    "pushLocal:true:Release Smoke Test",
    "readRemote:undefined:Planning > Roadmap",
    "readRemote:undefined:Release Smoke Test",
  ]);
  assert.deepEqual(mutationCalls.map((call) => call.target), [
    "Planning > Roadmap",
    "Release Smoke Test",
  ]);
  assert.deepEqual(writes.map((write) => write[0]), [
    `${entries[0].absoluteFilePath}.snpm-meta.json.tmp`,
    `${entries[1].absoluteFilePath}.snpm-meta.json.tmp`,
  ]);
  assert.equal(writes.every((write) => write[2] === "utf8"), true);
  assert.deepEqual(renames, [
    [`${entries[0].absoluteFilePath}.snpm-meta.json.tmp`, `${entries[0].absoluteFilePath}.snpm-meta.json`],
    [`${entries[1].absoluteFilePath}.snpm-meta.json.tmp`, `${entries[1].absoluteFilePath}.snpm-meta.json`],
  ]);
  assert.equal(JSON.parse(writes[0][1]).lastEditedTime, refreshLastEditedTime);
  assert.equal(JSON.parse(writes[1][1]).lastEditedTime, refreshLastEditedTime);
});

test("manifest v2 push refreshSidecars writes zero sidecars when refresh preflight fails", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
  ];
  const localMarkdownByTarget = new Map([
    ["Planning > Roadmap", "Local roadmap update\n"],
    ["Release Smoke Test", "Runbook update\n"],
  ]);
  const readCounts = new Map();
  const refreshedRemote = (entry) => {
    const target = targetForManifestV2SyncEntry(entry);
    const count = readCounts.get(target) || 0;
    readCounts.set(target, count + 1);
    if (count === 0) {
      return remoteFor(entry);
    }

    return remoteFor(entry, {
      lastEditedTime: "2026-04-23T12:05:00.000Z",
      markdown: target === "Release Smoke Test"
        ? "Unexpected remote body\n"
        : localMarkdownByTarget.get(target),
    });
  };
  const localFiles = new Map([
    [entries[0].absoluteFilePath, localMarkdownByTarget.get("Planning > Roadmap")],
    [`${entries[0].absoluteFilePath}.snpm-meta.json`, metadataText(entries[0])],
    [entries[1].absoluteFilePath, localMarkdownByTarget.get("Release Smoke Test")],
    [`${entries[1].absoluteFilePath}.snpm-meta.json`, metadataText(entries[1])],
  ]);
  const calls = [];
  const mutationCalls = [];
  const writes = [];

  const result = await pushManifestV2SyncManifest({
    adapters: makeFakeAdapters({
      calls,
      mutationCalls,
      remoteByTarget: new Map([
        ["Planning > Roadmap", ({ entry }) => refreshedRemote(entry)],
        ["Release Smoke Test", ({ entry }) => refreshedRemote(entry)],
      ]),
    }),
    apply: true,
    config: baseConfig(),
    manifest: baseManifest(entries),
    maxMutations: "all",
    readFileSyncImpl: mapBackedReadFile(localFiles),
    refreshSidecars: true,
    writeFileSyncImpl: (...args) => writes.push(args),
  });

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /Sidecar refresh preflight failed/);
  assert.match(result.failures[0], /Remote markdown mismatch/);
  assert.match(result.failures[0], /No sidecars were written/);
  assert.match(result.recovery, /sync pull --apply/);
  assert.deepEqual(diagnosticCodes(result), [
    MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_REFRESH_PREFLIGHT_FAILED,
  ]);
  assert.equal(result.diagnostics[0].safeNextCommand, "sync pull --apply");
  assert.equal(result.diagnostics[0].entry.target, "Release Smoke Test");
  assert.equal(result.diagnostics[0].state.sidecarWritesAttempted, false);
  assert.equal(result.appliedCount, 2);
  assert.equal(result.entries[0].applied, true);
  assert.equal(result.entries[1].applied, true);
  assert.equal(result.entries[1].sidecarRefreshed, false);
  assert.deepEqual(mutationCalls.map((call) => call.target), [
    "Planning > Roadmap",
    "Release Smoke Test",
  ]);
  assert.deepEqual(writes, []);
});

test("manifest v2 push refreshSidecars reports partial sidecar writes without undoing apply result", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
  ];
  const localMarkdownByTarget = new Map([
    ["Planning > Roadmap", "Local roadmap update\n"],
    ["Release Smoke Test", "Runbook update\n"],
  ]);
  const readCounts = new Map();
  const refreshedRemote = (entry) => {
    const target = targetForManifestV2SyncEntry(entry);
    const count = readCounts.get(target) || 0;
    readCounts.set(target, count + 1);
    return count === 0
      ? remoteFor(entry)
      : remoteFor(entry, {
        lastEditedTime: "2026-04-23T12:05:00.000Z",
        markdown: localMarkdownByTarget.get(target),
      });
  };
  const localFiles = new Map([
    [entries[0].absoluteFilePath, localMarkdownByTarget.get("Planning > Roadmap")],
    [`${entries[0].absoluteFilePath}.snpm-meta.json`, metadataText(entries[0])],
    [entries[1].absoluteFilePath, localMarkdownByTarget.get("Release Smoke Test")],
    [`${entries[1].absoluteFilePath}.snpm-meta.json`, metadataText(entries[1])],
  ]);
  const failingMetadataPath = `${entries[1].absoluteFilePath}.snpm-meta.json`;
  const mutationCalls = [];
  const writes = [];
  const writeAttempts = [];
  const renames = [];

  const result = await pushManifestV2SyncManifest({
    adapters: makeFakeAdapters({
      mutationCalls,
      remoteByTarget: new Map([
        ["Planning > Roadmap", ({ entry }) => refreshedRemote(entry)],
        ["Release Smoke Test", ({ entry }) => refreshedRemote(entry)],
      ]),
    }),
    apply: true,
    config: baseConfig(),
    manifest: baseManifest(entries),
    maxMutations: "all",
    readFileSyncImpl: mapBackedReadFile(localFiles),
    refreshSidecars: true,
    renameSyncImpl: (...args) => renames.push(args),
    writeFileSyncImpl: (filePath, body, encoding) => {
      writeAttempts.push([filePath, body, encoding]);
      if (filePath === `${failingMetadataPath}.tmp`) {
        throw new Error("disk full");
      }

      writes.push([filePath, body, encoding]);
    },
  });

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /Sidecar refresh write failed/);
  assert.match(result.failures[0], /Partial sidecar writes/);
  assert.match(result.failures[0], /Attempted sidecar/);
  assert.match(result.failures[0], /planning\\roadmap\.md\.snpm-meta\.json/);
  assert.match(result.failures[0], /runbooks\\release-smoke\.md\.snpm-meta\.json/);
  assert.match(result.failures[0], /disk full/);
  assert.match(result.recovery, /sync pull --apply/);
  assert.deepEqual(diagnosticCodes(result), [
    MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_REFRESH_WRITE_FAILED,
  ]);
  assert.equal(result.diagnostics[0].entry.target, "Release Smoke Test");
  assert.equal(result.diagnostics[0].state.sidecarWritesCompleted, 1);
  assert.deepEqual(result.diagnostics[0].state.partialSidecarWrites, [
    `${entries[0].absoluteFilePath}.snpm-meta.json`,
  ]);
  assert.equal(result.appliedCount, 2);
  assert.equal(result.entries[0].applied, true);
  assert.equal(result.entries[1].applied, true);
  assert.equal(result.entries[0].sidecarRefreshed, true);
  assert.equal(result.entries[1].sidecarRefreshed, false);
  assert.equal(result.entries[1].metadata.lastEditedTime, "2026-04-23T12:05:00.000Z");
  assert.deepEqual(mutationCalls.map((call) => call.target), [
    "Planning > Roadmap",
    "Release Smoke Test",
  ]);
  assert.deepEqual(writeAttempts.map((write) => write[0]), [
    `${entries[0].absoluteFilePath}.snpm-meta.json.tmp`,
    `${entries[1].absoluteFilePath}.snpm-meta.json.tmp`,
  ]);
  assert.deepEqual(writes.map((write) => write[0]), [
    `${entries[0].absoluteFilePath}.snpm-meta.json.tmp`,
  ]);
  assert.deepEqual(renames, [
    [`${entries[0].absoluteFilePath}.snpm-meta.json.tmp`, `${entries[0].absoluteFilePath}.snpm-meta.json`],
  ]);
});

test("manifest v2 push selection applies and refreshes sidecars only for selected entries", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("project-doc", "Root > Overview", "docs/project-overview.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
  ];
  const selectedEntries = [entries[1]];
  const localMarkdown = "Selected project doc update\n";
  const readCounts = new Map();
  const refreshedRemote = (entry) => {
    const target = targetForManifestV2SyncEntry(entry);
    const count = readCounts.get(target) || 0;
    readCounts.set(target, count + 1);
    return count === 0
      ? remoteFor(entry)
      : remoteFor(entry, {
        lastEditedTime: "2026-04-23T12:06:00.000Z",
        markdown: localMarkdown,
      });
  };
  const localFiles = new Map([
    [entries[1].absoluteFilePath, localMarkdown],
    [`${entries[1].absoluteFilePath}.snpm-meta.json`, metadataText(entries[1])],
  ]);
  const calls = [];
  const mutationCalls = [];
  const writes = [];
  const renames = [];

  const result = await pushManifestV2SyncManifest({
    adapters: makeFakeAdapters({
      calls,
      mutationCalls,
      remoteByTarget: new Map([
        ["Root > Overview", ({ entry }) => refreshedRemote(entry)],
      ]),
    }),
    apply: true,
    config: baseConfig(),
    manifest: baseManifest(entries),
    readFileSyncImpl: mapBackedReadFile(localFiles),
    refreshSidecars: true,
    renameSyncImpl: (...args) => renames.push(args),
    selectedEntries,
    writeFileSyncImpl: (...args) => writes.push(args),
  });

  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.entries.map((entry) => entry.target), ["Root > Overview"]);
  assert.equal(result.selectedCount, 1);
  assert.equal(result.skippedCount, 2);
  assert.deepEqual(result.skippedEntries.map((entry) => entry.target), [
    "Planning > Roadmap",
    "Release Smoke Test",
  ]);
  assert.deepEqual(calls.map((call) => `${call.op}:${call.apply}:${call.target}`), [
    "pushLocal:false:Root > Overview",
    "readRemote:undefined:Root > Overview",
    "pushLocal:true:Root > Overview",
    "readRemote:undefined:Root > Overview",
  ]);
  assert.deepEqual(mutationCalls.map((call) => call.target), ["Root > Overview"]);
  assert.deepEqual(writes.map((write) => write[0]), [
    `${entries[1].absoluteFilePath}.snpm-meta.json.tmp`,
  ]);
  assert.deepEqual(renames, [
    [`${entries[1].absoluteFilePath}.snpm-meta.json.tmp`, `${entries[1].absoluteFilePath}.snpm-meta.json`],
  ]);
});

test("manifest v2 push apply enforces mutation budgets after preflight and before mutation", async (t) => {
  async function runBudgetCase({ maxMutations, expectedFailures, expectedMutations }) {
    const entries = [
      makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
      makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
    ];
    const localFiles = new Map([
      [entries[0].absoluteFilePath, "Local roadmap update\n"],
      [`${entries[0].absoluteFilePath}.snpm-meta.json`, metadataText(entries[0])],
      [entries[1].absoluteFilePath, "Runbook update\n"],
      [`${entries[1].absoluteFilePath}.snpm-meta.json`, metadataText(entries[1])],
    ]);
    const calls = [];
    const mutationCalls = [];
    const writes = [];

    const result = await pushManifestV2SyncManifest({
      adapters: makeFakeAdapters({ calls, mutationCalls }),
      apply: true,
      config: baseConfig(),
      manifest: baseManifest(entries),
      maxMutations,
      readFileSyncImpl: mapBackedReadFile(localFiles),
      writeFileSyncImpl: (...args) => writes.push(args),
    });

    assert.equal(result.failures.length, expectedFailures);
    assert.deepEqual(mutationCalls.map((call) => call.target), expectedMutations);
    return { calls, result, writes };
  }

  await t.test("default budget blocks more than one changed entry", async () => {
    const { calls, result, writes } = await runBudgetCase({
      maxMutations: undefined,
      expectedFailures: 1,
      expectedMutations: [],
    });

    assert.match(result.failures[0], /mutation budget exceeded/);
    assert.match(result.failures[0], /maxMutations is 1/);
    assert.equal(result.appliedCount, 0);
    assert.deepEqual(diagnosticCodes(result), [
      MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.MUTATION_BUDGET_EXCEEDED,
    ]);
    assert.equal(result.diagnostics[0].state.changedCount, 2);
    assert.equal(result.diagnostics[0].state.maxMutations, 1);
    assert.equal(result.diagnostics[0].safeNextCommand, "sync push --apply --max-mutations <n|all>");
    assert.deepEqual(writes, []);
    assert.deepEqual(calls.map((call) => `${call.op}:${call.apply}:${call.target}`), [
      "pushLocal:false:Planning > Roadmap",
      "readRemote:undefined:Planning > Roadmap",
      "pushLocal:false:Release Smoke Test",
      "readRemote:undefined:Release Smoke Test",
    ]);
  });

  await t.test("numeric budget blocks above the limit", async () => {
    const { result, writes } = await runBudgetCase({
      maxMutations: 1,
      expectedFailures: 1,
      expectedMutations: [],
    });

    assert.match(result.failures[0], /maxMutations is 1/);
    assert.deepEqual(writes, []);
  });

  await t.test("numeric budget permits changed entries within the limit", async () => {
    const { result } = await runBudgetCase({
      maxMutations: 2,
      expectedFailures: 0,
      expectedMutations: ["Planning > Roadmap", "Release Smoke Test"],
    });

    assert.equal(result.appliedCount, 2);
  });

  await t.test("all budget permits every changed entry", async () => {
    const { result } = await runBudgetCase({
      maxMutations: "all",
      expectedFailures: 0,
      expectedMutations: ["Planning > Roadmap", "Release Smoke Test"],
    });

    assert.equal(result.appliedCount, 2);
  });
});

test("manifest v2 push apply blocks missing and malformed sidecars before mutation", async (t) => {
  await t.test("missing sidecar", async () => {
    const entries = [
      makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
      makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
    ];
    const localFiles = new Map([
      [entries[0].absoluteFilePath, "Local roadmap update\n"],
      [`${entries[0].absoluteFilePath}.snpm-meta.json`, metadataText(entries[0])],
      [entries[1].absoluteFilePath, "Runbook update\n"],
    ]);
    const mutationCalls = [];

    const result = await pushManifestV2SyncManifest({
      adapters: makeFakeAdapters({ mutationCalls }),
      apply: true,
      config: baseConfig(),
      manifest: baseManifest(entries),
      readFileSyncImpl: mapBackedReadFile(localFiles),
    });

    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /Metadata sidecar/);
    assert.match(result.failures[0], /sync pull --apply/i);
    assert.deepEqual(diagnosticCodes(result), [
      MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_MISSING,
    ]);
    assert.deepEqual(entryDiagnosticCodes(result.entries[1]), [
      MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_MISSING,
    ]);
    assert.equal(result.diagnostics[0].entry.target, "Release Smoke Test");
    assert.equal(result.diagnostics[0].safeNextCommand, "sync pull --apply");
    assert.deepEqual(mutationCalls, []);
  });

  await t.test("malformed sidecar", async () => {
    const entries = [
      makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
      makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
    ];
    const localFiles = new Map([
      [entries[0].absoluteFilePath, "Local roadmap update\n"],
      [`${entries[0].absoluteFilePath}.snpm-meta.json`, metadataText(entries[0])],
      [entries[1].absoluteFilePath, "Runbook update\n"],
      [`${entries[1].absoluteFilePath}.snpm-meta.json`, "{not json"],
    ]);
    const mutationCalls = [];

    const result = await pushManifestV2SyncManifest({
      adapters: makeFakeAdapters({ mutationCalls }),
      apply: true,
      config: baseConfig(),
      manifest: baseManifest(entries),
      readFileSyncImpl: mapBackedReadFile(localFiles),
    });

    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /not valid JSON/);
    assert.deepEqual(diagnosticCodes(result), [
      MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_MALFORMED,
    ]);
    assert.equal(result.diagnostics[0].entry.target, "Release Smoke Test");
    assert.deepEqual(mutationCalls, []);
  });
});

test("manifest v2 push rejects sync file and sidecar path collisions before reads or mutation", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("runbook", "Release Smoke Test", "planning/roadmap.md.snpm-meta.json"),
  ];
  const calls = [];
  const mutationCalls = [];
  const readCalls = [];

  const result = await pushManifestV2SyncManifest({
    adapters: makeFakeAdapters({ calls, mutationCalls }),
    apply: true,
    config: baseConfig(),
    manifest: baseManifest(entries),
    readFileSyncImpl: mapBackedReadFile(new Map(), readCalls),
  });

  assert.equal(result.entries.every((entry) => entry.status === "error"), true);
  assert.equal(result.failures.length, 2);
  assert.match(result.failures.join("\n"), /Sync file\/sidecar path collision/);
  assert.deepEqual(calls, []);
  assert.deepEqual(readCalls, []);
  assert.deepEqual(mutationCalls, []);
});

test("manifest v2 push apply blocks stale, mismatched, archived, and trashed metadata before mutation", async (t) => {
  await t.test("stale metadata", async () => {
    const entry = makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md");
    const localFiles = new Map([
      [entry.absoluteFilePath, "Local roadmap update\n"],
      [`${entry.absoluteFilePath}.snpm-meta.json`, metadataText(entry, {
        lastEditedTime: "2026-04-23T11:00:00.000Z",
      })],
    ]);
    const mutationCalls = [];

    const result = await pushManifestV2SyncManifest({
      adapters: makeFakeAdapters({ mutationCalls }),
      apply: true,
      config: baseConfig(),
      manifest: baseManifest([entry]),
      readFileSyncImpl: mapBackedReadFile(localFiles),
    });

    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /Stale metadata/);
    assert.deepEqual(diagnosticCodes(result), [
      MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.METADATA_STALE,
    ]);
    assert.equal(result.diagnostics[0].targetPath, "Projects > SNPM > Planning > Roadmap");
    assert.equal(result.diagnostics[0].entry.target, "Planning > Roadmap");
    assert.deepEqual(mutationCalls, []);
  });

  await t.test("live metadata must be independent from sidecar metadata", async () => {
    const entry = makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md");
    const localFiles = new Map([
      [entry.absoluteFilePath, "Local roadmap update\n"],
      [`${entry.absoluteFilePath}.snpm-meta.json`, metadataText(entry)],
    ]);
    const remote = remoteFor(entry);
    delete remote.liveMetadata;
    remote.lastEditedTime = undefined;
    remote.last_edited_time = undefined;
    const mutationCalls = [];

    const result = await pushManifestV2SyncManifest({
      adapters: makeFakeAdapters({
        mutationCalls,
        remoteByTarget: new Map([["Planning > Roadmap", remote]]),
      }),
      apply: true,
      config: baseConfig(),
      manifest: baseManifest([entry]),
      readFileSyncImpl: mapBackedReadFile(localFiles),
    });

    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /must return liveMetadata/);
    assert.deepEqual(diagnosticCodes(result), [
      MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.REMOTE_PREFLIGHT_FAILED,
    ]);
    assert.deepEqual(mutationCalls, []);
  });

  await t.test("target, page, and project mismatch", async () => {
    const entries = [
      makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
      makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
      makeEntry("project-doc", "Root > Overview", "docs/project-overview.md"),
    ];
    const localFiles = new Map([
      [entries[0].absoluteFilePath, "Local roadmap update\n"],
      [`${entries[0].absoluteFilePath}.snpm-meta.json`, metadataText(entries[0], {
        targetPath: "Projects > SNPM > Wrong",
      })],
      [entries[1].absoluteFilePath, "Runbook update\n"],
      [`${entries[1].absoluteFilePath}.snpm-meta.json`, metadataText(entries[1], {
        pageId: "wrong-page",
      })],
      [entries[2].absoluteFilePath, "Project doc update\n"],
      [`${entries[2].absoluteFilePath}.snpm-meta.json`, metadataText(entries[2], {
        projectId: "wrong-project",
      })],
    ]);
    const mutationCalls = [];

    const result = await pushManifestV2SyncManifest({
      adapters: makeFakeAdapters({ mutationCalls }),
      apply: true,
      config: baseConfig(),
      manifest: baseManifest(entries),
      readFileSyncImpl: mapBackedReadFile(localFiles),
    });

    assert.equal(result.failures.length, 3);
    assert.match(result.failures[0], /targetPath mismatch/);
    assert.match(result.failures[1], /pageId mismatch|Live page id mismatch/);
    assert.match(result.failures[2], /projectId mismatch/);
    assert.deepEqual(diagnosticCodes(result), [
      MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.METADATA_MISMATCH,
      MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.METADATA_MISMATCH,
      MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.METADATA_MISMATCH,
    ]);
    assert.deepEqual(mutationCalls, []);
  });

  await t.test("archived or trashed target", async () => {
    const entries = [
      makeEntry("planning-page", "Archived Page", "planning/archived.md"),
      makeEntry("runbook", "Trashed Runbook", "runbooks/trashed.md"),
    ];
    const localFiles = new Map([
      [entries[0].absoluteFilePath, "Archived update\n"],
      [`${entries[0].absoluteFilePath}.snpm-meta.json`, metadataText(entries[0])],
      [entries[1].absoluteFilePath, "Trashed update\n"],
      [`${entries[1].absoluteFilePath}.snpm-meta.json`, metadataText(entries[1])],
    ]);
    const mutationCalls = [];
    const remoteByTarget = new Map([
      ["Archived Page", remoteFor(entries[0], { archived: true })],
      ["Trashed Runbook", {
        ...remoteFor(entries[1]),
        liveMetadata: {
          pageId: remoteFor(entries[1]).pageId,
          lastEditedTime: "2026-04-23T12:00:00.000Z",
          archived: true,
        },
      }],
    ]);

    const result = await pushManifestV2SyncManifest({
      adapters: makeFakeAdapters({ mutationCalls, remoteByTarget }),
      apply: true,
      config: baseConfig(),
      manifest: baseManifest(entries),
      readFileSyncImpl: mapBackedReadFile(localFiles),
    });

    assert.equal(result.failures.length, 2);
    assert.match(result.failures.join("\n"), /archived or in trash/);
    assert.deepEqual(diagnosticCodes(result), [
      MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.METADATA_ARCHIVED_OR_TRASHED,
      MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.METADATA_ARCHIVED_OR_TRASHED,
    ]);
    assert.deepEqual(mutationCalls, []);
  });
});

test("manifest v2 push apply blocks remote preflight failures before any mutation", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
  ];
  const localFiles = new Map([
    [entries[0].absoluteFilePath, "Local roadmap update\n"],
    [`${entries[0].absoluteFilePath}.snpm-meta.json`, metadataText(entries[0])],
    [entries[1].absoluteFilePath, "Runbook update\n"],
    [`${entries[1].absoluteFilePath}.snpm-meta.json`, metadataText(entries[1])],
  ]);
  const calls = [];
  const mutationCalls = [];

  const result = await pushManifestV2SyncManifest({
    adapters: makeFakeAdapters({
      calls,
      mutationCalls,
      remoteFailuresByTarget: new Map([["Release Smoke Test", "Runbook target could not be read."]]),
    }),
    apply: true,
    config: baseConfig(),
    manifest: baseManifest(entries),
    readFileSyncImpl: mapBackedReadFile(localFiles),
  });

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /could not be read/);
  assert.deepEqual(diagnosticCodes(result), [
    MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.REMOTE_PREFLIGHT_FAILED,
  ]);
  assert.equal(result.diagnostics[0].targetPath, "Projects > SNPM > Release Smoke Test");
  assert.equal(result.diagnostics[0].entry.target, "Release Smoke Test");
  assert.deepEqual(mutationCalls, []);
  assert.deepEqual(calls.map((call) => `${call.op}:${call.apply}:${call.target}`), [
    "pushLocal:false:Planning > Roadmap",
    "readRemote:undefined:Planning > Roadmap",
    "pushLocal:false:Release Smoke Test",
    "readRemote:undefined:Release Smoke Test",
  ]);
});

test("manifest v2 push apply blocks transport preflight failures before any mutation", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
  ];
  const localFiles = new Map([
    [entries[0].absoluteFilePath, "Local roadmap update\n"],
    [`${entries[0].absoluteFilePath}.snpm-meta.json`, metadataText(entries[0])],
    [entries[1].absoluteFilePath, "Runbook update\n"],
    [`${entries[1].absoluteFilePath}.snpm-meta.json`, metadataText(entries[1])],
  ]);
  const transportError = new Error("Notion transport failed before remote freshness validation.");
  transportError.name = "NotionTransportError";
  transportError.kind = "network";
  transportError.method = "GET";
  transportError.apiPath = "pages/page-release-smoke-test";
  const calls = [];
  const mutationCalls = [];

  const result = await pushManifestV2SyncManifest({
    adapters: makeFakeAdapters({
      calls,
      mutationCalls,
      remoteFailuresByTarget: new Map([["Release Smoke Test", transportError]]),
    }),
    apply: true,
    config: baseConfig(),
    manifest: baseManifest(entries),
    maxMutations: "all",
    readFileSyncImpl: mapBackedReadFile(localFiles),
  });

  assert.equal(result.appliedCount, 0);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /transport failed/i);
  assert.equal(result.entries[0].status, "push-preview");
  assert.equal(result.entries[0].applied, false);
  assert.equal(result.entries[1].status, "error");
  assert.equal(result.entries[1].applied, false);
  assert.equal(result.entries[1].failure, transportError.message);
  assert.equal(result.diagnostics[0].entry.target, "Release Smoke Test");
  assert.equal(result.diagnostics[0].state.phase, "apply-preflight");
  assert.deepEqual(mutationCalls, []);
  assert.deepEqual(calls.map((call) => `${call.op}:${call.apply}:${call.target}`), [
    "pushLocal:false:Planning > Roadmap",
    "readRemote:undefined:Planning > Roadmap",
    "pushLocal:false:Release Smoke Test",
    "readRemote:undefined:Release Smoke Test",
  ]);
});

test("manifest v2 push apply stops on first apply failure and reports partial remote mutations", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
    makeEntry("validation-session", "Session Fixture", "ops/validation/session.md"),
  ];
  const localFiles = new Map([
    [entries[0].absoluteFilePath, "Local roadmap update\n"],
    [`${entries[0].absoluteFilePath}.snpm-meta.json`, metadataText(entries[0])],
    [entries[1].absoluteFilePath, "Runbook update\n"],
    [`${entries[1].absoluteFilePath}.snpm-meta.json`, metadataText(entries[1])],
    [entries[2].absoluteFilePath, "Validation update\n"],
    [`${entries[2].absoluteFilePath}.snpm-meta.json`, metadataText(entries[2])],
  ]);
  const calls = [];
  const mutationCalls = [];

  const result = await pushManifestV2SyncManifest({
    adapters: makeFakeAdapters({
      applyFailuresByTarget: new Map([["Release Smoke Test", "Notion PATCH failed."]]),
      calls,
      mutationCalls,
    }),
    apply: true,
    config: baseConfig(),
    manifest: baseManifest(entries),
    maxMutations: "all",
    readFileSyncImpl: mapBackedReadFile(localFiles),
  });

  assert.equal(result.entries[0].status, "pushed");
  assert.equal(result.entries[0].applied, true);
  assert.equal(result.entries[1].status, "error");
  assert.equal(result.entries[1].applied, false);
  assert.equal(result.entries[2].status, "push-preview");
  assert.equal(result.entries[2].applied, false);
  assert.equal(result.appliedCount, 1);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /Prior remote mutations: planning-page "Planning > Roadmap"/);
  assert.match(result.failures[0], /No rollback was attempted/);
  assert.match(result.recovery, /sync pull --apply/);
  assert.deepEqual(diagnosticCodes(result), [
    MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.PARTIAL_APPLY,
  ]);
  assert.equal(result.diagnostics[0].entry.target, "Release Smoke Test");
  assert.equal(result.diagnostics[0].targetPath, "Projects > SNPM > Release Smoke Test");
  assert.deepEqual(result.diagnostics[0].state.priorRemoteMutations, [
    {
      kind: "planning-page",
      target: "Planning > Roadmap",
      targetPath: "Projects > SNPM > Planning > Roadmap",
    },
  ]);
  assert.deepEqual(mutationCalls.map((call) => call.target), [
    "Planning > Roadmap",
    "Release Smoke Test",
  ]);
  assert.deepEqual(calls.filter((call) => call.apply === true).map((call) => call.target), [
    "Planning > Roadmap",
    "Release Smoke Test",
  ]);
  assert.equal(mutationCalls.filter((call) => call.target === "Release Smoke Test").length, 1);
  assert.equal(calls.filter((call) => call.apply === true && call.target === "Release Smoke Test").length, 1);
  assert.equal(mutationCalls.some((call) => call.target === "Session Fixture"), false);
});

test("manifest v2 push apply transport failures preserve partial-apply reporting", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
    makeEntry("validation-session", "Session Fixture", "ops/validation/session.md"),
  ];
  const localFiles = new Map([
    [entries[0].absoluteFilePath, "Local roadmap update\n"],
    [`${entries[0].absoluteFilePath}.snpm-meta.json`, metadataText(entries[0])],
    [entries[1].absoluteFilePath, "Runbook update\n"],
    [`${entries[1].absoluteFilePath}.snpm-meta.json`, metadataText(entries[1])],
    [entries[2].absoluteFilePath, "Validation update\n"],
    [`${entries[2].absoluteFilePath}.snpm-meta.json`, metadataText(entries[2])],
  ]);
  const transportError = new Error("Notion transport failed while applying markdown.");
  transportError.name = "NotionTransportError";
  transportError.kind = "timeout";
  transportError.method = "PATCH";
  transportError.apiPath = "pages/page-release-smoke-test/markdown";
  const calls = [];
  const mutationCalls = [];

  const result = await pushManifestV2SyncManifest({
    adapters: makeFakeAdapters({
      applyFailuresByTarget: new Map([["Release Smoke Test", transportError]]),
      calls,
      mutationCalls,
    }),
    apply: true,
    config: baseConfig(),
    manifest: baseManifest(entries),
    maxMutations: "all",
    readFileSyncImpl: mapBackedReadFile(localFiles),
  });

  assert.equal(result.entries[0].status, "pushed");
  assert.equal(result.entries[0].applied, true);
  assert.equal(result.entries[1].status, "error");
  assert.equal(result.entries[1].applied, false);
  assert.equal(result.entries[2].status, "push-preview");
  assert.equal(result.entries[2].applied, false);
  assert.equal(result.appliedCount, 1);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /transport failed while applying markdown/i);
  assert.match(result.failures[0], /Prior remote mutations: planning-page "Planning > Roadmap"/);
  assert.match(result.failures[0], /No rollback was attempted/);
  assert.match(result.recovery, /sync pull --apply/);
  assert.deepEqual(diagnosticCodes(result), [
    MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.PARTIAL_APPLY,
  ]);
  assert.equal(result.diagnostics[0].state.phase, "partial-apply");
  assert.deepEqual(result.diagnostics[0].state.priorRemoteMutations, [
    {
      kind: "planning-page",
      target: "Planning > Roadmap",
      targetPath: "Projects > SNPM > Planning > Roadmap",
    },
  ]);
  assert.deepEqual(mutationCalls.map((call) => call.target), [
    "Planning > Roadmap",
    "Release Smoke Test",
  ]);
  assert.deepEqual(calls.filter((call) => call.apply === true).map((call) => call.target), [
    "Planning > Roadmap",
    "Release Smoke Test",
  ]);
  assert.equal(mutationCalls.filter((call) => call.target === "Release Smoke Test").length, 1);
  assert.equal(calls.filter((call) => call.apply === true && call.target === "Release Smoke Test").length, 1);
  assert.equal(mutationCalls.some((call) => call.target === "Session Fixture"), false);
});

test("manifest v2 push reports unsupported and incomplete adapters", async (t) => {
  await t.test("unsupported kind", async () => {
    const entry = makeEntry("unsupported-kind", "Unsupported Target", "unsupported.md");
    const result = await pushManifestV2SyncManifest({
      adapters: {},
      config: baseConfig(),
      manifest: baseManifest([entry]),
      readFileSyncImpl: mapBackedReadFile(new Map([[entry.absoluteFilePath, "Local\n"]])),
    });

    assert.equal(result.entries[0].status, "error");
    assert.match(result.failures[0], /Unsupported manifest v2 sync push kind/);
  });

  await t.test("missing push adapter", async () => {
    const entry = makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md");
    const result = await pushManifestV2SyncManifest({
      adapters: { "planning-page": { readRemote: async () => remoteFor(entry) } },
      config: baseConfig(),
      manifest: baseManifest([entry]),
      readFileSyncImpl: mapBackedReadFile(new Map([[entry.absoluteFilePath, "Local\n"]])),
    });

    assert.equal(result.entries[0].status, "error");
    assert.match(result.failures[0], /missing pushLocal/);
  });

  await t.test("missing read adapter on apply", async () => {
    const entry = makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md");
    const localFiles = new Map([
      [entry.absoluteFilePath, "Local\n"],
      [`${entry.absoluteFilePath}.snpm-meta.json`, metadataText(entry)],
    ]);
    const mutationCalls = [];

    const result = await pushManifestV2SyncManifest({
      adapters: {
        "planning-page": {
          async pushLocal() {
            mutationCalls.push("pushLocal");
            return previewFor(entry, "Local\n");
          },
        },
      },
      apply: true,
      config: baseConfig(),
      manifest: baseManifest([entry]),
      readFileSyncImpl: mapBackedReadFile(localFiles),
    });

    assert.equal(result.entries[0].status, "error");
    assert.match(result.failures[0], /missing readRemote/);
    assert.deepEqual(mutationCalls, []);
  });
});

test("default manifest v2 push adapters route entries to owning push helpers", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("project-doc", "Root > Overview", "docs/project-overview.md"),
    makeEntry("template-doc", "Templates > Overview", "docs/template-overview.md"),
    makeEntry("workspace-doc", "Runbooks > Workflow", "docs/workflow.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
    makeEntry("validation-session", "Session Fixture", "ops/validation/session.md"),
  ];
  const calls = [];
  const adapters = createManifestV2SyncPushAdapters({
    createManifestV2SyncCheckAdaptersImpl: () => Object.fromEntries(MANIFEST_V2_SYNC_CHECK_KINDS.map((kind) => [kind, {
      async readRemote({ entry }) {
        calls.push({ op: "readRemote", kind, target: targetForManifestV2SyncEntry(entry) });
        return remoteFor(entry);
      },
    }])),
    pushApprovedPageBodyImpl: async (args) => {
      calls.push({ op: "page-push", args });
      return previewFor(entries[0], args.fileBodyMarkdown);
    },
    pushDocBodyImpl: async (args) => {
      calls.push({ op: "doc-push", args });
      const entry = entries.find((candidate) => candidate.docPath === args.docPath);
      return previewFor(entry, args.fileBodyMarkdown);
    },
    pushRunbookBodyImpl: async (args) => {
      calls.push({ op: "runbook-push", args });
      return previewFor(entries[4], args.fileBodyMarkdown);
    },
    pushValidationSessionFileImpl: async (args) => {
      calls.push({ op: "validation-session-push", args });
      return previewFor(entries[5], args.fileMarkdown);
    },
  });

  const adapterInput = {
    config: baseConfig(),
    manifest: baseManifest(entries),
    projectTokenEnv: "SNPM_NOTION_TOKEN",
  };

  await adapters["planning-page"].pushLocal({
    ...adapterInput,
    apply: false,
    entry: entries[0],
    fileMarkdown: "planning body\n",
  });
  await Promise.all(entries.slice(1, 4).map((entry) => adapters[entry.kind].pushLocal({
    ...adapterInput,
    apply: false,
    entry,
    fileMarkdown: `${entry.target}\n`,
  })));
  await adapters.runbook.pushLocal({
    ...adapterInput,
    apply: false,
    entry: entries[4],
    fileMarkdown: "runbook body\n",
  });
  await adapters["validation-session"].pushLocal({
    ...adapterInput,
    apply: false,
    entry: entries[5],
    fileMarkdown: "validation body\n",
  });
  await adapters["planning-page"].readRemote({ ...adapterInput, entry: entries[0] });

  assert.deepEqual(calls.map((call) => call.op), [
    "page-push",
    "doc-push",
    "doc-push",
    "doc-push",
    "runbook-push",
    "validation-session-push",
    "readRemote",
  ]);
  assert.equal(calls[0].args.pagePath, "Planning > Roadmap");
  assert.equal(calls[0].args.projectName, "SNPM");
  assert.equal(calls[1].args.docPath, "Root > Overview");
  assert.equal(calls[1].args.projectName, "SNPM");
  assert.equal(calls[2].args.docPath, "Templates > Overview");
  assert.equal(calls[2].args.projectName, undefined);
  assert.equal(calls[3].args.docPath, "Runbooks > Workflow");
  assert.equal(calls[3].args.projectName, undefined);
  assert.equal(calls[4].args.title, "Release Smoke Test");
  assert.equal(calls[4].args.commandFamily, "runbook");
  assert.equal(calls[5].args.title, "Session Fixture");
  assert.equal(calls[5].args.fileMarkdown, "validation body\n");
  assert.equal(calls.every((call) => call.op === "readRemote" || call.args.workspaceName === "infrastructure-hq"), true);
  assert.equal(calls.every((call) => call.op === "readRemote" || call.args.projectTokenEnv === "SNPM_NOTION_TOKEN"), true);
});
