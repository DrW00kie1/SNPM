import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMutationJournalEntry,
  formatMutationJournalWarning,
  getMutationJournalPath,
  readMutationJournalEntries,
  recordMutationJournalEntry,
  summarizeDiff,
  tryRecordMutationJournalEntry,
} from "../src/commands/mutation-journal.mjs";
import { validatePullPageMetadata } from "../src/notion/page-metadata.mjs";
import { assertJsonContract } from "../src/contracts/json-contracts.mjs";

test("getMutationJournalPath uses env override or local app data default", () => {
  assert.equal(
    getMutationJournalPath({ env: { SNPM_JOURNAL_PATH: "C:\\tmp\\journal.ndjson" } }),
    "C:\\tmp\\journal.ndjson",
  );

  assert.match(
    getMutationJournalPath({ env: { LOCALAPPDATA: "C:\\Users\\Sean\\AppData\\Local" } }),
    /C:\\Users\\Sean\\AppData\\Local[\\/]SNPM[\\/]journal\.ndjson$/,
  );
});

test("summarizeDiff hashes the diff without storing its content", () => {
  const summary = summarizeDiff("diff --git a b\n@@\n-old\n+new\n");

  assert.equal(summary.additions, 1);
  assert.equal(summary.deletions, 1);
  assert.match(summary.hash, /^[a-f0-9]{64}$/);
});

test("buildMutationJournalEntry records operational metadata only", () => {
  const pullMetadata = {
    schema: "snpm.pull-metadata.v1",
    commandFamily: "page",
    workspaceName: "infrastructure-hq",
    targetPath: "Projects > SNPM > Planning > Roadmap",
    pageId: "page-1",
    authMode: "project-token",
    lastEditedTime: "2026-04-23T19:00:00.000Z",
    pulledAt: "2026-04-23T19:01:00.000Z",
  };
  const entry = buildMutationJournalEntry({
    command: "page-push",
    surface: "planning",
    timestamp: "04-23-2026 12:00:00",
    result: {
      applied: true,
      authMode: "project-token",
      diff: "diff --git a b\n@@\n-secret\n+redacted\n",
      pageId: "page-1",
      projectId: "project-1",
      targetPath: "Projects > SNPM > Planning > Roadmap",
      metadata: {
        ...pullMetadata,
        bodyMarkdown: "# should not be copied",
        token: "secret-token",
        projectTokenEnv: "SNPM_NOTION_TOKEN",
        envValue: "ntn_secret",
      },
      currentBodyMarkdown: "# Current\nsecret",
      nextBodyMarkdown: "# Next\nredacted",
      projectTokenEnv: "PROJECT_NOTION_TOKEN",
    },
  });

  assert.equal(entry.schema, "snpm.mutation-journal.v1");
  assert.equal(entry.command, "page-push");
  assert.equal(entry.surface, "planning");
  assert.equal(entry.targetPath, "Projects > SNPM > Planning > Roadmap");
  assert.equal(entry.pageId, "page-1");
  assert.equal(entry.authMode, "project-token");
  assert.equal(entry.timestamp, "04-23-2026 12:00:00");
  assert.deepEqual(Object.keys(entry).sort(), [
    "authMode",
    "command",
    "diff",
    "pageId",
    "revision",
    "schema",
    "surface",
    "targetPath",
    "timestamp",
  ].sort());
  assert.deepEqual(entry.revision, validatePullPageMetadata(pullMetadata));
  assert.equal(entry.diff.additions, 1);
  assert.equal(entry.diff.deletions, 1);
  assert.deepEqual(Object.keys(entry.diff).sort(), ["additions", "deletions", "hash"]);
  const serialized = JSON.stringify(entry);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("redacted"), false);
  assert.equal(serialized.includes("should not be copied"), false);
  assert.equal(serialized.includes("SNPM_NOTION_TOKEN"), false);
  assert.equal(serialized.includes("PROJECT_NOTION_TOKEN"), false);
  assert.equal(serialized.includes("ntn_secret"), false);
  assertJsonContract("snpm.mutation-journal.v1", entry);
});

test("buildMutationJournalEntry omits unsafe revision fields and raw failure diagnostics", () => {
  const childStdout = "child-stdout-generated-secret";
  const childStderr = "child-stderr-token";
  const rawBody = "# Raw Notion body\nsecret body";
  const envValue = "PROJECT_TOKEN_ENV_VALUE";
  const token = "ntn_secret_journal_contract";
  const stack = "Error: stack sentinel\n    at writeGeneratedSecret";
  const pullMetadata = {
    schema: "snpm.pull-metadata.v1",
    commandFamily: "secret-record",
    workspaceName: "infrastructure-hq",
    targetPath: "Projects > SNPM > Access > App & Backend > DATABASE_URL",
    pageId: "secret-page",
    projectId: "project-page",
    authMode: "project-token",
    lastEditedTime: "2026-04-23T19:00:00.000Z",
    pulledAt: "2026-04-23T19:01:00.000Z",
  };

  const entry = buildMutationJournalEntry({
    command: "secret-record-generate",
    surface: "secret-record",
    timestamp: "04-23-2026 12:00:00",
    result: {
      applied: true,
      authMode: "project-token",
      diff: `-${childStdout}\n+${childStderr}\n`,
      pageId: "secret-page",
      targetPath: pullMetadata.targetPath,
      metadata: {
        ...pullMetadata,
        bodyMarkdown: rawBody,
        stdout: childStdout,
        stderr: childStderr,
        token,
        envValue,
        stack,
      },
      failure: `failed with ${token}`,
      stdout: childStdout,
      stderr: childStderr,
      currentBodyMarkdown: rawBody,
      nextBodyMarkdown: rawBody.replace("secret body", "new secret body"),
      stack,
    },
  });

  assert.deepEqual(entry.revision, validatePullPageMetadata(pullMetadata));
  const serialized = JSON.stringify(entry);
  for (const value of [childStdout, childStderr, rawBody, envValue, token, stack, "writeGeneratedSecret"]) {
    assert.equal(serialized.includes(value), false);
  }
  assertJsonContract("snpm.mutation-journal.v1", entry);
});

test("buildMutationJournalEntry for secret-bearing commands excludes body and raw diff text", () => {
  const entry = buildMutationJournalEntry({
    command: "secret-record-push",
    surface: "secret-record",
    timestamp: "04-25-2026 12:00:00",
    result: {
      applied: true,
      authMode: "project-token",
      diff: "diff --git a b\n@@\n-old-super-secret-value\n+new-super-secret-value\n",
      pageId: "secret-page",
      targetPath: "Projects > SNPM > Access > App & Backend > GEMINI_API_KEY",
      currentBodyMarkdown: "## Raw Value\nold-super-secret-value\n",
      nextBodyMarkdown: "## Raw Value\nnew-super-secret-value\n",
    },
  });

  const serialized = JSON.stringify(entry);
  assert.equal(entry.command, "secret-record-push");
  assert.equal(entry.surface, "secret-record");
  assert.match(entry.diff.hash, /^[a-f0-9]{64}$/);
  assert.equal(serialized.includes("old-super-secret-value"), false);
  assert.equal(serialized.includes("new-super-secret-value"), false);
  assert.equal(serialized.includes("## Raw Value"), false);
});

test("recordMutationJournalEntry appends ndjson and list honors limit", () => {
  const writes = [];
  const dirs = [];
  const journalPath = "C:\\tmp\\journal.ndjson";

  const recorded = recordMutationJournalEntry({
    command: "doc-push",
    surface: "project-docs",
    timestamp: "04-23-2026 12:00:00",
    result: {
      applied: true,
      authMode: "project-token",
      diff: "",
      pageId: "page-1",
      targetPath: "Projects > SNPM",
    },
  }, {
    journalPath,
    mkdirSyncImpl: (dir) => dirs.push(dir),
    appendFileSyncImpl: (_path, text) => writes.push(text),
  });

  assert.equal(recorded.journalPath, journalPath);
  assert.equal(dirs.length, 1);
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(writes[0]).command, "doc-push");

  const entries = readMutationJournalEntries({
    journalPath,
    limit: "1",
    readFileSyncImpl: () => [
      JSON.stringify({ command: "first" }),
      "{not json",
      JSON.stringify({ command: "second" }),
      "",
    ].join("\n"),
  });

  assert.deepEqual(entries, [{ command: "second" }]);
});

test("tryRecordMutationJournalEntry reports append failure without throwing", () => {
  const failure = new Error("disk full");
  const recorded = tryRecordMutationJournalEntry({
    command: "runbook-push",
    surface: "runbooks",
    timestamp: "04-23-2026 12:00:00",
    result: {
      applied: true,
      authMode: "workspace-token",
      diff: "+new",
      pageId: "page-1",
      targetPath: "Projects > SNPM > Runbooks > Deploy",
    },
  }, {
    journalPath: "C:\\tmp\\journal.ndjson",
    mkdirSyncImpl: () => {},
    appendFileSyncImpl: () => {
      throw failure;
    },
  });

  assert.equal(recorded.ok, false);
  assert.equal(recorded.journalPath, "C:\\tmp\\journal.ndjson");
  assert.equal(recorded.error, failure);
  assert.equal(recorded.warning, formatMutationJournalWarning(failure));
  assert.equal(recorded.entry.command, "runbook-push");
});
