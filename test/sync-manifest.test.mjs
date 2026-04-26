import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { parseSyncManifest, validateSyncManifest } from "../src/notion/sync-manifest.mjs";

const manifestPath = path.join("C:\\repo", "snpm.sync.json");
const workspace = "infrastructure-hq";
const project = "Tall Man Training";
const rawPageId = "12345678-1234-1234-1234-123456789abc";
const rawCompactPageId = "12345678123412341234123456789abc";

function manifestV2(entries) {
  return {
    version: 2,
    workspace,
    project,
    entries,
  };
}

function parseV2(entries) {
  return parseSyncManifest(manifestV2(entries), manifestPath);
}

function validPlanningEntry(file = "planning/roadmap.md") {
  return {
    kind: "planning-page",
    pagePath: "Planning > Roadmap",
    file,
  };
}

test("parseSyncManifest preserves v1 validation-session manifest behavior", () => {
  const result = parseSyncManifest({
    version: 1,
    workspace,
    project,
    entries: [{
      kind: "validation-session",
      title: "iPhone TestFlight 0.5.1 (2) - Sean - 2026-03-28",
      file: "ops/validation-sessions/iphone-testflight-0.5.1-2-sean-2026-03-28.md",
    }],
  }, manifestPath);

  assert.equal(result.version, 1);
  assert.equal(result.workspaceName, workspace);
  assert.equal(result.projectName, project);
  assert.equal(result.entries[0].kind, "validation-session");
  assert.equal(result.entries[0].targetField, "title");
  assert.equal(result.entries[0].target, "iPhone TestFlight 0.5.1 (2) - Sean - 2026-03-28");
  assert.equal(result.entries[0].title, "iPhone TestFlight 0.5.1 (2) - Sean - 2026-03-28");
  assert.match(result.entries[0].absoluteFilePath, /ops[\\/]validation-sessions[\\/]iphone-testflight-0.5.1-2-sean-2026-03-28\.md$/);
});

test("parseSyncManifest rejects duplicate titles", () => {
  assert.throws(() => parseSyncManifest({
    version: 1,
    workspace,
    project,
    entries: [
      { kind: "validation-session", title: "Same Title", file: "ops/validation-sessions/one.md" },
      { kind: "validation-session", title: "Same Title", file: "ops/validation-sessions/two.md" },
    ],
  }, manifestPath), /duplicate validation-session title/i);
});

test("parseSyncManifest rejects duplicate files", () => {
  assert.throws(() => parseSyncManifest({
    version: 1,
    workspace,
    project,
    entries: [
      { kind: "validation-session", title: "One", file: "ops/validation-sessions/session.md" },
      { kind: "validation-session", title: "Two", file: "ops/validation-sessions/session.md" },
    ],
  }, manifestPath), /same file/i);
});

test("parseSyncManifest rejects unsupported kinds and escaping paths", () => {
  assert.throws(() => parseSyncManifest({
    version: 1,
    workspace,
    project,
    entries: [{ kind: "runbook", title: "Nope", file: "ops/runbooks/nope.md" }],
  }, manifestPath), /unsupported kind/i);

  assert.throws(() => parseSyncManifest({
    version: 1,
    workspace,
    project,
    entries: [{ kind: "validation-session", title: "Bad Path", file: "..\\outside.md" }],
  }, manifestPath), /must stay within the manifest directory tree/i);
});

test("parseSyncManifest normalizes valid v2 mixed-surface entries", () => {
  const result = parseV2([
    { kind: "planning-page", pagePath: " Planning > Roadmap ", file: "planning/roadmap.md" },
    { kind: "project-doc", docPath: " Root > Overview ", file: "docs/project-overview.md" },
    { kind: "template-doc", docPath: " Templates > Project Templates > Overview ", file: "templates/project-overview.md" },
    { kind: "workspace-doc", docPath: " Runbooks > Notion Workspace Workflow ", file: "workspace/notion-workflow.md" },
    { kind: "runbook", title: " Release Smoke Test ", file: "runbooks/release-smoke.md" },
    { kind: "validation-session", title: " iPhone TestFlight 0.5.1 (2) - Sean - 2026-03-28 ", file: "ops/validation-sessions/iphone.md" },
  ]);

  assert.equal(result.version, 2);
  assert.equal(result.workspaceName, workspace);
  assert.equal(result.projectName, project);

  assert.deepEqual(result.entries.map((entry) => ({
    kind: entry.kind,
    target: entry.target,
    targetField: entry.targetField,
    title: entry.title,
    pagePath: entry.pagePath,
    docPath: entry.docPath,
    file: entry.file,
  })), [
    {
      kind: "planning-page",
      target: "Planning > Roadmap",
      targetField: "pagePath",
      title: undefined,
      pagePath: "Planning > Roadmap",
      docPath: undefined,
      file: ["planning", "roadmap.md"].join(path.sep),
    },
    {
      kind: "project-doc",
      target: "Root > Overview",
      targetField: "docPath",
      title: undefined,
      pagePath: undefined,
      docPath: "Root > Overview",
      file: ["docs", "project-overview.md"].join(path.sep),
    },
    {
      kind: "template-doc",
      target: "Templates > Project Templates > Overview",
      targetField: "docPath",
      title: undefined,
      pagePath: undefined,
      docPath: "Templates > Project Templates > Overview",
      file: ["templates", "project-overview.md"].join(path.sep),
    },
    {
      kind: "workspace-doc",
      target: "Runbooks > Notion Workspace Workflow",
      targetField: "docPath",
      title: undefined,
      pagePath: undefined,
      docPath: "Runbooks > Notion Workspace Workflow",
      file: ["workspace", "notion-workflow.md"].join(path.sep),
    },
    {
      kind: "runbook",
      target: "Release Smoke Test",
      targetField: "title",
      title: "Release Smoke Test",
      pagePath: undefined,
      docPath: undefined,
      file: ["runbooks", "release-smoke.md"].join(path.sep),
    },
    {
      kind: "validation-session",
      target: "iPhone TestFlight 0.5.1 (2) - Sean - 2026-03-28",
      targetField: "title",
      title: "iPhone TestFlight 0.5.1 (2) - Sean - 2026-03-28",
      pagePath: undefined,
      docPath: undefined,
      file: ["ops", "validation-sessions", "iphone.md"].join(path.sep),
    },
  ]);
  assert.match(result.entries[0].absoluteFilePath, /planning[\\/]roadmap\.md$/);
});

test("parseSyncManifest rejects v2 entries with missing required target fields", () => {
  const cases = [
    [{ kind: "planning-page", file: "planning/roadmap.md" }, /pagePath/],
    [{ kind: "project-doc", file: "docs/project-overview.md" }, /docPath/],
    [{ kind: "template-doc", file: "templates/project-overview.md" }, /docPath/],
    [{ kind: "workspace-doc", file: "workspace/notion-workflow.md" }, /docPath/],
    [{ kind: "runbook", file: "runbooks/release-smoke.md" }, /title/],
    [{ kind: "validation-session", file: "ops/validation-sessions/iphone.md" }, /title/],
  ];

  for (const [entry, errorPattern] of cases) {
    assert.throws(() => parseV2([entry]), errorPattern);
  }
});

test("parseSyncManifest rejects v2 raw Notion page ids", () => {
  assert.throws(() => parseV2([{
    kind: "planning-page",
    pagePath: `Planning > ${rawPageId}`,
    file: "planning/raw-id.md",
  }]), /raw Notion page id/i);

  assert.throws(() => parseV2([{
    kind: "runbook",
    title: rawCompactPageId,
    file: "runbooks/raw-id.md",
  }]), /raw Notion page id/i);
});

test("parseSyncManifest rejects v2 invalid file paths", () => {
  const cases = [
    [validPlanningEntry(path.resolve("outside.md")), /must be relative/i],
    [validPlanningEntry("..\\outside.md"), /must stay within the manifest directory tree/i],
    [validPlanningEntry("../outside.md"), /must stay within the manifest directory tree/i],
    [validPlanningEntry("planning/*.md"), /glob patterns/i],
    [validPlanningEntry("planning/roadmap?.md"), /glob patterns/i],
    [validPlanningEntry("planning/[draft].md"), /glob patterns/i],
  ];

  for (const [entry, errorPattern] of cases) {
    assert.throws(() => parseV2([entry]), errorPattern);
  }
});

test("parseSyncManifest rejects v2 duplicate files", () => {
  assert.throws(() => parseV2([
    { kind: "planning-page", pagePath: "Planning > Roadmap", file: "shared.md" },
    { kind: "runbook", title: "Release Smoke Test", file: ".\\shared.md" },
  ]), /same file/i);
});

test("parseSyncManifest rejects v2 duplicate kind and target entries", () => {
  assert.throws(() => parseV2([
    { kind: "project-doc", docPath: "Root > Overview", file: "docs/project-overview.md" },
    { kind: "project-doc", docPath: " Root > Overview ", file: "docs/project-overview-copy.md" },
  ]), /duplicate project-doc target/i);
});

test("parseSyncManifest rejects v2 unsupported kinds", () => {
  assert.throws(() => parseV2([{
    kind: "secret-record",
    title: "Production API",
    file: "access/production-api.md",
  }]), /unsupported kind/i);
});

test("validateSyncManifest validates generated in-memory manifest objects", () => {
  const result = validateSyncManifest(manifestV2([validPlanningEntry()]), { manifestPath });

  assert.equal(result.version, 2);
  assert.equal(result.manifestPath, path.resolve(manifestPath));
  assert.equal(result.entries[0].file, ["planning", "roadmap.md"].join(path.sep));
});

test("validateSyncManifest requires an explicit manifest path for relative file safety", () => {
  assert.throws(
    () => validateSyncManifest(manifestV2([validPlanningEntry()])),
    /requires a non-empty "manifestPath" string/i,
  );
});
