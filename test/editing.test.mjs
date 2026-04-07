import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

import { resolveEditorCommand, runManagedEditLoop } from "../src/commands/editing.mjs";

test("resolveEditorCommand prefers EDITOR, then code, then notepad on Windows", () => {
  assert.equal(resolveEditorCommand({
    env: { EDITOR: "vim" },
    spawnSyncImpl: () => ({ status: 1, stdout: "" }),
  }), "vim");

  assert.equal(resolveEditorCommand({
    env: {},
    platform: "win32",
    spawnSyncImpl: () => ({ status: 0, stdout: "C:\\Users\\Sean\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd" }),
  }), "code --wait");

  assert.equal(resolveEditorCommand({
    env: {},
    platform: "win32",
    spawnSyncImpl: () => ({ status: 1, stdout: "" }),
  }), "notepad");
});

test("runManagedEditLoop previews without mutating by default", async () => {
  let pushed = null;

  const result = await runManagedEditLoop({
    apply: false,
    fileLabel: "page.md",
    pullImpl: async () => ({
      bodyMarkdown: "old body\n",
    }),
    pushImpl: async (payload) => {
      pushed = payload;
      return {
        pageId: "page-1",
        targetPath: "Projects > SNPM > Planning > Roadmap",
        authMode: "project-token",
        authScope: "project-or-workspace",
        managedState: "managed",
        preserveChildren: true,
        normalizationsApplied: ["lf-newlines"],
        warnings: [],
        currentBodyMarkdown: "old body\n",
        nextBodyMarkdown: payload.fileBodyMarkdown,
        diff: "diff --git a/current.md b/next.md\n",
        hasDiff: true,
        applied: false,
        timestamp: null,
      };
    },
    openEditorImpl: (filePath) => {
      writeFileSync(filePath, "new body\n", "utf8");
      return "fake-editor";
    },
  });

  assert.equal(pushed.apply, false);
  assert.equal(pushed.fileBodyMarkdown, "new body\n");
  assert.equal(result.applied, false);
  assert.equal(result.editor, "fake-editor");
});

test("runManagedEditLoop mutates only when apply is true", async () => {
  const appliedFlags = [];

  const result = await runManagedEditLoop({
    apply: true,
    fileLabel: "runbook.md",
    pullImpl: async () => ({
      bodyMarkdown: "line one\n",
    }),
    pushImpl: async (payload) => {
      appliedFlags.push(payload.apply);
      return {
        pageId: "runbook-1",
        targetPath: "Projects > SNPM > Runbooks > Release Smoke Test",
        authMode: "project-token",
        authScope: "project-or-workspace",
        managedState: "managed",
        preserveChildren: true,
        normalizationsApplied: ["lf-newlines"],
        warnings: [],
        currentBodyMarkdown: "line one\n",
        nextBodyMarkdown: payload.fileBodyMarkdown,
        diff: "",
        hasDiff: false,
        applied: true,
        timestamp: "04-06-2026 18:05:00",
      };
    },
    openEditorImpl: (filePath) => {
      const body = readFileSync(filePath, "utf8");
      writeFileSync(filePath, `${body}line two\n`, "utf8");
      return "fake-editor";
    },
  });

  assert.deepEqual(appliedFlags, [true]);
  assert.equal(result.applied, true);
  assert.equal(result.nextBodyMarkdown, "line one\nline two\n");
});
