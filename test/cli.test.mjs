import test from "node:test";
import assert from "node:assert/strict";

import { parseArgs, usage } from "../src/cli.mjs";

test("usage includes planning sync plus runbook, build-record, and validation-session commands", () => {
  const help = usage();
  assert.match(help, /npm run page-pull/);
  assert.match(help, /npm run page-diff/);
  assert.match(help, /npm run page-push/);
  assert.match(help, /npm run runbook-create/);
  assert.match(help, /npm run runbook-adopt/);
  assert.match(help, /npm run build-record-create/);
  assert.match(help, /npm run build-record-push/);
  assert.match(help, /npm run validation-sessions-init/);
  assert.match(help, /npm run validation-sessions-verify/);
  assert.match(help, /npm run validation-session-create/);
  assert.match(help, /npm run validation-session-push/);
});

test("parseArgs supports page subcommands and boolean apply flags", () => {
  const parsed = parseArgs([
    "page",
    "push",
    "--project",
    "SNPM",
    "--page",
    "Planning > Backlog",
    "--file",
    "backlog.md",
    "--apply",
  ]);

  assert.equal(parsed.command, "page push");
  assert.equal(parsed.options.project, "SNPM");
  assert.equal(parsed.options.page, "Planning > Backlog");
  assert.equal(parsed.options.file, "backlog.md");
  assert.equal(parsed.options.apply, true);
});

test("parseArgs supports runbook subcommands", () => {
  const parsed = parseArgs([
    "runbook",
    "adopt",
    "--project",
    "SNPM",
    "--title",
    "Legacy Runbook",
    "--apply",
  ]);

  assert.equal(parsed.command, "runbook adopt");
  assert.equal(parsed.options.project, "SNPM");
  assert.equal(parsed.options.title, "Legacy Runbook");
  assert.equal(parsed.options.apply, true);
});

test("parseArgs supports build-record subcommands", () => {
  const parsed = parseArgs([
    "build-record",
    "create",
    "--project",
    "SNPM",
    "--title",
    "Validation Build",
    "--file",
    "build.md",
  ]);

  assert.equal(parsed.command, "build-record create");
  assert.equal(parsed.options.project, "SNPM");
  assert.equal(parsed.options.title, "Validation Build");
  assert.equal(parsed.options.file, "build.md");
});

test("parseArgs supports validation-session subcommands", () => {
  const parsed = parseArgs([
    "validation-session",
    "push",
    "--project",
    "SNPM",
    "--title",
    "Regression Pass 1",
    "--file",
    "session.md",
    "--apply",
  ]);

  assert.equal(parsed.command, "validation-session push");
  assert.equal(parsed.options.project, "SNPM");
  assert.equal(parsed.options.title, "Regression Pass 1");
  assert.equal(parsed.options.file, "session.md");
  assert.equal(parsed.options.apply, true);
});

test("parseArgs supports validation-sessions verify", () => {
  const parsed = parseArgs([
    "validation-sessions",
    "verify",
    "--project",
    "Tall Man Training",
    "--project-token-env",
    "TALLMAN_NOTION_TOKEN",
  ]);

  assert.equal(parsed.command, "validation-sessions verify");
  assert.equal(parsed.options.project, "Tall Man Training");
  assert.equal(parsed.options["project-token-env"], "TALLMAN_NOTION_TOKEN");
});
