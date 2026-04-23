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
        schema: "snpm.pull-metadata.v1",
        commandFamily: "page",
        workspaceName: "infrastructure-hq",
        targetPath: "Projects > SNPM > Planning > Roadmap",
        pageId: "page-1",
        authMode: "project-token",
        lastEditedTime: "2026-04-23T19:00:00.000Z",
        pulledAt: "2026-04-23T19:01:00.000Z",
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
  assert.deepEqual(entry.revision, {
    schema: "snpm.pull-metadata.v1",
    commandFamily: "page",
    workspaceName: "infrastructure-hq",
    targetPath: "Projects > SNPM > Planning > Roadmap",
    pageId: "page-1",
    authMode: "project-token",
    lastEditedTime: "2026-04-23T19:00:00.000Z",
    pulledAt: "2026-04-23T19:01:00.000Z",
  });
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
