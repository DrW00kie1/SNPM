import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  MANIFEST_V2_SYNC_CHECK_KINDS,
  targetForManifestV2SyncEntry,
} from "../src/notion/manifest-sync-check.mjs";
import { pullManifestV2SyncManifest } from "../src/notion/manifest-sync-pull.mjs";
import { assertJsonContract } from "../src/contracts/json-contracts.mjs";

const manifestDir = path.resolve("manifest-v2-pull-fixture");

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

  return kind;
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function metadataFor({ kind, target, targetPath }) {
  return {
    schema: "snpm.pull-metadata.v1",
    commandFamily: commandFamilyForKind(kind),
    workspaceName: "infrastructure-hq",
    targetPath,
    pageId: `page-${slug(target)}`,
    projectId: "project-snpm",
    authMode: "project-token",
    lastEditedTime: "2026-04-23T12:00:00.000Z",
    pulledAt: "2026-04-23T12:01:00.000Z",
  };
}

function remoteFor(entry, markdown) {
  const target = targetForManifestV2SyncEntry(entry);
  const targetPath = `Projects > SNPM > ${target}`;

  return {
    targetPath,
    markdown,
    metadata: metadataFor({
      kind: entry.kind,
      target,
      targetPath,
    }),
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

    const value = localFiles.get(filePath);
    if (value instanceof Error) {
      throw value;
    }

    return value;
  };
}

function simpleDiff(currentMarkdown, nextMarkdown) {
  if (currentMarkdown === nextMarkdown) {
    return "";
  }

  return `--- local\n+++ remote\n${nextMarkdown}`;
}

function diagnosticCodes(result) {
  return (result.diagnostics || []).map((diagnostic) => diagnostic.code);
}

function entryDiagnosticCodes(entry) {
  return (entry.diagnostics || []).map((diagnostic) => diagnostic.code);
}

function makeFakeAdapters({
  calls = [],
  failuresByTarget = new Map(),
  mutationCalls = [],
  remoteByTarget = new Map(),
} = {}) {
  return Object.fromEntries(MANIFEST_V2_SYNC_CHECK_KINDS.map((kind) => [kind, {
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

      return remoteByTarget.get(target) || remoteFor(entry, `# ${target}\nRemote body\n`);
    },
    async mutateRemote() {
      mutationCalls.push({ kind, op: "mutateRemote" });
      throw new Error("mutation hooks must not be called by manifest v2 pull");
    },
    async writeLocal() {
      mutationCalls.push({ kind, op: "writeLocal" });
      throw new Error("adapter write hooks must not be called by manifest v2 pull");
    },
  }]));
}

test("manifest v2 pull preview reports existing, missing, in-sync, drift, and failures without writes", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("project-doc", "Root > Overview", "docs/project-overview.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
    makeEntry("validation-session", "Session Fixture", "ops/validation/session.md"),
  ];
  const remoteByTarget = new Map([
    ["Planning > Roadmap", remoteFor(entries[0], "Remote roadmap\n")],
    ["Root > Overview", remoteFor(entries[1], "Remote overview\n")],
    ["Release Smoke Test", remoteFor(entries[2], "Runbook body\n")],
  ]);
  const localFiles = new Map([
    [entries[0].absoluteFilePath, "Local roadmap\r\n"],
    [entries[2].absoluteFilePath, "Runbook body\n"],
  ]);
  const calls = [];
  const writes = [];
  const mkdirs = [];

  const result = await pullManifestV2SyncManifest({
    adapters: makeFakeAdapters({
      calls,
      failuresByTarget: new Map([["Session Fixture", "Validation session could not be read."]]),
      remoteByTarget,
    }),
    config: baseConfig(),
    diffMarkdownTextImpl: simpleDiff,
    manifest: baseManifest(entries),
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    readFileSyncImpl: mapBackedReadFile(localFiles),
    writeFileSyncImpl: (...args) => writes.push(args),
    mkdirSyncImpl: (...args) => mkdirs.push(args),
  });

  assert.equal(result.command, "sync-pull");
  assert.equal(result.authMode, "project-token");
  assert.equal(result.hasDiff, true);
  assert.equal(result.driftCount, 2);
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
      status: "pull-preview",
      hasDiff: true,
      applied: false,
    },
    {
      kind: "project-doc",
      target: "Root > Overview",
      file: "docs/project-overview.md",
      metadataPath: `${entries[1].absoluteFilePath}.snpm-meta.json`,
      status: "pull-create-preview",
      hasDiff: true,
      applied: false,
    },
    {
      kind: "runbook",
      target: "Release Smoke Test",
      file: "runbooks/release-smoke.md",
      metadataPath: `${entries[2].absoluteFilePath}.snpm-meta.json`,
      status: "in-sync",
      hasDiff: false,
      applied: false,
    },
    {
      kind: "validation-session",
      target: "Session Fixture",
      file: "ops/validation/session.md",
      metadataPath: `${entries[3].absoluteFilePath}.snpm-meta.json`,
      status: "error",
      hasDiff: false,
      applied: false,
    },
  ]);
  assert.match(result.entries[3].failure, /could not be read/);
  assert.deepEqual(entryDiagnosticCodes(result.entries[3]), ["manifest-v2-pull-remote-failed"]);
  assert.deepEqual(diagnosticCodes(result), ["manifest-v2-pull-remote-failed"]);
  assert.equal(result.diagnostics[0].severity, "error");
  assert.equal(result.diagnostics[0].safeNextCommand, "sync check");
  assert.equal(result.diagnostics[0].entry.kind, "validation-session");
  assert.equal(result.diagnostics[0].entry.target, "Session Fixture");
  assert.equal(result.diagnostics[0].entry.file, "ops/validation/session.md");
  assert.equal(result.diagnostics[0].entry.metadataPath, `${entries[3].absoluteFilePath}.snpm-meta.json`);
  assert.deepEqual(result.diagnostics[0].state, { phase: "preflight" });
  assertJsonContract("snpm.manifest-v2.diagnostic.v1", result.diagnostics[0]);
  assertJsonContract("snpm.manifest-v2.sync-result.v1", result);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(calls.map((call) => `${call.kind}:${call.target}`), [
    "planning-page:Planning > Roadmap",
    "project-doc:Root > Overview",
    "runbook:Release Smoke Test",
    "validation-session:Session Fixture",
  ]);
  assert.deepEqual(writes, []);
  assert.deepEqual(mkdirs, []);
});

test("manifest v2 pull apply writes changed files and sidecars for all successful entries", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
    makeEntry("validation-session", "Session Fixture", "ops/validation/session.md"),
  ];
  const remoteByTarget = new Map([
    ["Planning > Roadmap", remoteFor(entries[0], "Remote roadmap\n")],
    ["Release Smoke Test", remoteFor(entries[1], "Runbook body\n")],
    ["Session Fixture", remoteFor(entries[2], "Session body\n")],
  ]);
  const localFiles = new Map([
    [entries[0].absoluteFilePath, "Local roadmap\n"],
    [entries[2].absoluteFilePath, "Session body\n"],
  ]);
  const writes = [];
  const mkdirs = [];

  const result = await pullManifestV2SyncManifest({
    adapters: makeFakeAdapters({ remoteByTarget }),
    apply: true,
    config: baseConfig(),
    diffMarkdownTextImpl: simpleDiff,
    manifest: baseManifest(entries),
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    readFileSyncImpl: mapBackedReadFile(localFiles),
    writeFileSyncImpl: (...args) => writes.push(args),
    mkdirSyncImpl: (...args) => mkdirs.push(args),
  });

  assert.deepEqual(result.entries.map((entry) => ({
    status: entry.status,
    hasDiff: entry.hasDiff,
    applied: entry.applied,
  })), [
    { status: "pulled", hasDiff: true, applied: true },
    { status: "pulled-created", hasDiff: true, applied: true },
    { status: "in-sync", hasDiff: false, applied: true },
  ]);
  assert.equal(result.appliedCount, 3);
  assert.equal(result.driftCount, 2);
  assert.deepEqual(result.failures, []);
  assertJsonContract("snpm.manifest-v2.sync-result.v1", result);
  assert.deepEqual(writes.map((write) => write[0]), [
    entries[0].absoluteFilePath,
    `${entries[0].absoluteFilePath}.snpm-meta.json`,
    entries[1].absoluteFilePath,
    `${entries[1].absoluteFilePath}.snpm-meta.json`,
    `${entries[2].absoluteFilePath}.snpm-meta.json`,
  ]);
  assert.equal(writes[0][1], "Remote roadmap\n");
  assert.equal(writes[2][1], "Runbook body\n");
  assert.deepEqual(JSON.parse(writes[1][1]), remoteByTarget.get("Planning > Roadmap").metadata);
  assert.deepEqual(JSON.parse(writes[3][1]), remoteByTarget.get("Release Smoke Test").metadata);
  assert.deepEqual(JSON.parse(writes[4][1]), remoteByTarget.get("Session Fixture").metadata);
  assert.equal(mkdirs.length >= 5, true);
});

test("manifest v2 pull processes and writes only selected entries", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("project-doc", "Root > Overview", "docs/project-overview.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
  ];
  const selectedEntries = [entries[1]];
  const remoteByTarget = new Map([
    ["Planning > Roadmap", remoteFor(entries[0], "Remote roadmap\n")],
    ["Root > Overview", remoteFor(entries[1], "Remote overview\n")],
    ["Release Smoke Test", remoteFor(entries[2], "Runbook body\n")],
  ]);
  const calls = [];
  const writes = [];

  const result = await pullManifestV2SyncManifest({
    adapters: makeFakeAdapters({ calls, remoteByTarget }),
    apply: true,
    config: baseConfig(),
    diffMarkdownTextImpl: simpleDiff,
    manifest: baseManifest(entries),
    readFileSyncImpl: mapBackedReadFile(new Map()),
    selectedEntries,
    writeFileSyncImpl: (...args) => writes.push(args),
    mkdirSyncImpl: () => {},
  });

  assert.deepEqual(result.entries.map((entry) => entry.target), ["Root > Overview"]);
  assert.deepEqual(calls.map((call) => call.target), ["Root > Overview"]);
  assert.equal(result.selectedCount, 1);
  assert.equal(result.skippedCount, 2);
  assert.deepEqual(result.skippedEntries.map((entry) => entry.target), [
    "Planning > Roadmap",
    "Release Smoke Test",
  ]);
  assert.deepEqual(writes.map((write) => write[0]), [
    entries[1].absoluteFilePath,
    `${entries[1].absoluteFilePath}.snpm-meta.json`,
  ]);
});

test("manifest v2 pull apply rejects output and sidecar path collisions before writes", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("runbook", "Release Smoke Test", "planning/roadmap.md.snpm-meta.json"),
  ];
  const calls = [];
  const writes = [];
  const mkdirs = [];

  const result = await pullManifestV2SyncManifest({
    adapters: makeFakeAdapters({ calls }),
    apply: true,
    config: baseConfig(),
    diffMarkdownTextImpl: simpleDiff,
    manifest: baseManifest(entries),
    readFileSyncImpl: mapBackedReadFile(new Map()),
    writeFileSyncImpl: (...args) => writes.push(args),
    mkdirSyncImpl: (...args) => mkdirs.push(args),
  });

  assert.equal(result.entries.every((entry) => entry.status === "error"), true);
  assert.deepEqual(result.entries.map(entryDiagnosticCodes), [
    ["manifest-v2-pull-path-collision"],
    ["manifest-v2-pull-path-collision"],
  ]);
  assert.deepEqual(diagnosticCodes(result), [
    "manifest-v2-pull-path-collision",
    "manifest-v2-pull-path-collision",
  ]);
  assert.equal(result.diagnostics[0].safeNextCommand, "sync check");
  assert.equal(result.diagnostics[0].entry.target, "Planning > Roadmap");
  assert.equal(result.diagnostics[0].entry.metadataPath, `${entries[0].absoluteFilePath}.snpm-meta.json`);
  assert.deepEqual(result.diagnostics[0].state, { phase: "path-collision" });
  assert.equal(result.failures.length, 2);
  assert.match(result.failures.join("\n"), /Output\/sidecar path collision/);
  assert.deepEqual(calls, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(mkdirs, []);
});

test("manifest v2 pull apply performs no writes when a preflight read fails", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("project-doc", "Root > Overview", "docs/project-overview.md"),
  ];
  const readError = new Error("EACCES: permission denied");
  readError.code = "EACCES";
  const localFiles = new Map([
    [entries[0].absoluteFilePath, "Local roadmap\n"],
    [entries[1].absoluteFilePath, readError],
  ]);
  const writes = [];
  const mkdirs = [];

  const result = await pullManifestV2SyncManifest({
    adapters: makeFakeAdapters(),
    apply: true,
    config: baseConfig(),
    diffMarkdownTextImpl: simpleDiff,
    manifest: baseManifest(entries),
    readFileSyncImpl: mapBackedReadFile(localFiles),
    writeFileSyncImpl: (...args) => writes.push(args),
    mkdirSyncImpl: (...args) => mkdirs.push(args),
  });

  assert.equal(result.entries[0].status, "pull-preview");
  assert.equal(result.entries[0].applied, false);
  assert.equal(result.entries[1].status, "error");
  assert.match(result.entries[1].failure, /permission denied/);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(writes, []);
  assert.deepEqual(mkdirs, []);
});

test("manifest v2 pull apply reports partial local writes when a filesystem write fails", async () => {
  const entries = [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
    makeEntry("validation-session", "Session Fixture", "ops/validation/session.md"),
  ];
  const localFiles = new Map([
    [entries[0].absoluteFilePath, "Local roadmap\n"],
  ]);
  const writes = [];
  const failingMetadataPath = `${entries[1].absoluteFilePath}.snpm-meta.json`;

  const result = await pullManifestV2SyncManifest({
    adapters: makeFakeAdapters(),
    apply: true,
    config: baseConfig(),
    diffMarkdownTextImpl: simpleDiff,
    manifest: baseManifest(entries),
    readFileSyncImpl: mapBackedReadFile(localFiles),
    writeFileSyncImpl: (filePath, body, encoding) => {
      if (filePath === failingMetadataPath) {
        throw new Error("disk full");
      }

      writes.push([filePath, body, encoding]);
    },
    mkdirSyncImpl: () => {},
  });

  assert.equal(result.entries[0].status, "pulled");
  assert.equal(result.entries[0].applied, true);
  assert.equal(result.entries[1].status, "error");
  assert.equal(result.entries[1].applied, false);
  assert.deepEqual(entryDiagnosticCodes(result.entries[1]), ["manifest-v2-pull-write-failed"]);
  assert.deepEqual(diagnosticCodes(result), ["manifest-v2-pull-write-failed"]);
  assert.equal(result.diagnostics[0].safeNextCommand, "sync pull --apply");
  assert.equal(result.diagnostics[0].entry.target, "Release Smoke Test");
  assert.equal(result.diagnostics[0].entry.metadataPath, `${entries[1].absoluteFilePath}.snpm-meta.json`);
  assert.equal(result.diagnostics[0].state.phase, "write");
  assert.equal(result.diagnostics[0].state.partialWriteCount, 3);
  assert.deepEqual(result.diagnostics[0].state.partialWrites, [
    entries[0].absoluteFilePath,
    `${entries[0].absoluteFilePath}.snpm-meta.json`,
    entries[1].absoluteFilePath,
  ]);
  assert.equal(result.entries[2].applied, false);
  assert.equal(result.appliedCount, 1);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /Partial local writes/);
  assert.match(result.failures[0], /planning[\\/]roadmap\.md/);
  assert.match(result.failures[0], /runbooks\\release-smoke\.md/);
  assert.match(result.failures[0], /disk full/);
  assert.deepEqual(writes.map((write) => write[0]), [
    entries[0].absoluteFilePath,
    `${entries[0].absoluteFilePath}.snpm-meta.json`,
    entries[1].absoluteFilePath,
  ]);
});
