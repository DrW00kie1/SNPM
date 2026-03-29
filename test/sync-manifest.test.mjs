import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { parseSyncManifest } from "../src/notion/sync-manifest.mjs";

const manifestPath = path.join("C:\\repo", "snpm.sync.json");

test("parseSyncManifest normalizes a valid validation-session manifest", () => {
  const result = parseSyncManifest({
    version: 1,
    workspace: "infrastructure-hq",
    project: "Tall Man Training",
    entries: [{
      kind: "validation-session",
      title: "iPhone TestFlight 0.5.1 (2) - Sean - 2026-03-28",
      file: "ops/validation-sessions/iphone-testflight-0.5.1-2-sean-2026-03-28.md",
    }],
  }, manifestPath);

  assert.equal(result.workspaceName, "infrastructure-hq");
  assert.equal(result.projectName, "Tall Man Training");
  assert.equal(result.entries[0].kind, "validation-session");
  assert.equal(result.entries[0].title, "iPhone TestFlight 0.5.1 (2) - Sean - 2026-03-28");
  assert.match(result.entries[0].absoluteFilePath, /ops[\\/]validation-sessions[\\/]iphone-testflight-0.5.1-2-sean-2026-03-28\.md$/);
});

test("parseSyncManifest rejects duplicate titles", () => {
  assert.throws(() => parseSyncManifest({
    version: 1,
    workspace: "infrastructure-hq",
    project: "Tall Man Training",
    entries: [
      { kind: "validation-session", title: "Same Title", file: "ops/validation-sessions/one.md" },
      { kind: "validation-session", title: "Same Title", file: "ops/validation-sessions/two.md" },
    ],
  }, manifestPath), /duplicate validation-session title/i);
});

test("parseSyncManifest rejects duplicate files", () => {
  assert.throws(() => parseSyncManifest({
    version: 1,
    workspace: "infrastructure-hq",
    project: "Tall Man Training",
    entries: [
      { kind: "validation-session", title: "One", file: "ops/validation-sessions/session.md" },
      { kind: "validation-session", title: "Two", file: "ops/validation-sessions/session.md" },
    ],
  }, manifestPath), /same file/i);
});

test("parseSyncManifest rejects unsupported kinds and escaping paths", () => {
  assert.throws(() => parseSyncManifest({
    version: 1,
    workspace: "infrastructure-hq",
    project: "Tall Man Training",
    entries: [{ kind: "runbook", title: "Nope", file: "ops/runbooks/nope.md" }],
  }, manifestPath), /unsupported kind/i);

  assert.throws(() => parseSyncManifest({
    version: 1,
    workspace: "infrastructure-hq",
    project: "Tall Man Training",
    entries: [{ kind: "validation-session", title: "Bad Path", file: "..\\outside.md" }],
  }, manifestPath), /must stay within the manifest directory tree/i);
});
