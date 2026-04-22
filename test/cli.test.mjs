import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  findCommandHelp,
  parseArgs,
  resolveHelpRequest,
  usage,
} from "../src/cli.mjs";

const CLI_PATH = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function runCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

test("usage includes the conventional CLI synopsis and command families", () => {
  const help = usage();
  assert.match(help, /node src\/cli\.mjs <command> \[options\]/);
  assert.match(help, /node src\/cli\.mjs --help/);
  assert.match(help, /node src\/cli\.mjs help <command>/);
  assert.match(help, /create-project/);
  assert.match(help, /doc <create\|adopt\|pull\|diff\|push\|edit>/);
  assert.match(help, /page <pull\|diff\|push\|edit>/);
  assert.match(help, /access-domain <create\|adopt\|pull\|diff\|push\|edit>/);
  assert.match(help, /validation-sessions <init\|verify>/);
  assert.match(help, /sync <check\|pull\|push>/);
  assert.match(help, /Recommend stays an alias for the read-only scan unless --intent is provided/);
  assert.match(help, /managed doc surface uses doc-\* commands/);
  assert.match(help, /browser\/UI automation remains paused on codex\/validation-bundle/);
  assert.match(help, /markdown body is written to stdout and the structured metadata is written to stderr/);
  assert.match(help, /Implementation notes, design specs, task breakdowns, and investigations are repo-first intents/);
  assert.match(help, /support --explain/);
  assert.match(help, /--review-output <dir>/);
});

test("help registry resolves command aliases to the canonical command", () => {
  assert.equal(findCommandHelp("page-push")?.canonical, "page push");
  assert.equal(findCommandHelp("page push")?.canonical, "page push");
  assert.equal(findCommandHelp("verify")?.canonical, "verify-project");
});

test("resolveHelpRequest supports global, command, and unknown help targets", () => {
  assert.deepEqual(resolveHelpRequest([]), { type: "global" });
  assert.deepEqual(resolveHelpRequest(["--help"]), { type: "global" });
  assert.deepEqual(resolveHelpRequest(["help"]), { type: "global" });
  assert.deepEqual(resolveHelpRequest(["verify-project", "--help"]), {
    type: "command",
    command: "verify-project",
  });
  assert.deepEqual(resolveHelpRequest(["help", "page-push"]), {
    type: "command",
    command: "page push",
  });
  assert.deepEqual(resolveHelpRequest(["fake-command", "--help"]), {
    type: "unknown",
    command: "fake-command",
  });
});

test("parseArgs supports doctor and recommend aliases", () => {
  const doctorParsed = parseArgs([
    "doctor",
    "--project",
    "SNPM",
    "--project-token-env",
    "SNPM_NOTION_TOKEN",
  ]);
  const recommendParsed = parseArgs([
    "recommend",
    "--project",
    "Tall Man Training",
  ]);

  assert.equal(doctorParsed.command, "doctor");
  assert.equal(doctorParsed.options.project, "SNPM");
  assert.equal(doctorParsed.options["project-token-env"], "SNPM_NOTION_TOKEN");
  assert.equal(recommendParsed.command, "recommend");
  assert.equal(recommendParsed.options.project, "Tall Man Training");
});

test("parseArgs supports doc subcommands", () => {
  const parsed = parseArgs([
    "doc",
    "edit",
    "--project",
    "SNPM",
    "--path",
    "Root > Overview",
    "--apply",
    "--explain",
    "--review-output",
    "review",
  ]);

  assert.equal(parsed.command, "doc edit");
  assert.equal(parsed.options.project, "SNPM");
  assert.equal(parsed.options.path, "Root > Overview");
  assert.equal(parsed.options.apply, true);
  assert.equal(parsed.options.explain, true);
  assert.equal(parsed.options["review-output"], "review");
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

test("parseArgs supports access-domain and nested record subcommands", () => {
  const domainParsed = parseArgs([
    "access-domain",
    "create",
    "--project",
    "SNPM",
    "--title",
    "App & Backend",
    "--file",
    "access-domain.md",
  ]);
  const secretParsed = parseArgs([
    "secret-record",
    "push",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "GEMINI_API_KEY",
    "--file",
    "secret.md",
    "--apply",
  ]);
  const tokenParsed = parseArgs([
    "access-token",
    "adopt",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "Project Token",
    "--apply",
  ]);

  assert.equal(domainParsed.command, "access-domain create");
  assert.equal(domainParsed.options.title, "App & Backend");
  assert.equal(secretParsed.command, "secret-record push");
  assert.equal(secretParsed.options.domain, "App & Backend");
  assert.equal(secretParsed.options.apply, true);
  assert.equal(tokenParsed.command, "access-token adopt");
  assert.equal(tokenParsed.options.domain, "App & Backend");
  assert.equal(tokenParsed.options.apply, true);
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

test("parseArgs supports validation-sessions verify with bundle mode", () => {
  const parsed = parseArgs([
    "validation-sessions",
    "verify",
    "--project",
    "Tall Man Training",
    "--project-token-env",
    "TALLMAN_NOTION_TOKEN",
    "--bundle",
  ]);

  assert.equal(parsed.command, "validation-sessions verify");
  assert.equal(parsed.options.project, "Tall Man Training");
  assert.equal(parsed.options["project-token-env"], "TALLMAN_NOTION_TOKEN");
  assert.equal(parsed.options.bundle, true);
});

test("parseArgs supports sync subcommands", () => {
  const parsed = parseArgs([
    "sync",
    "push",
    "--manifest",
    "C:\\tall-man-training\\snpm.sync.json",
    "--project-token-env",
    "TALLMAN_NOTION_TOKEN",
    "--apply",
  ]);

  assert.equal(parsed.command, "sync push");
  assert.equal(parsed.options.manifest, "C:\\tall-man-training\\snpm.sync.json");
  assert.equal(parsed.options["project-token-env"], "TALLMAN_NOTION_TOKEN");
  assert.equal(parsed.options.apply, true);
});

test("cli with no args prints global help and exits successfully", () => {
  const result = runCli([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /node src\/cli\.mjs <command> \[options\]/);
  assert.equal(result.stderr, "");
});

test("cli help alias prints global help and exits successfully", () => {
  const result = runCli(["help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /node src\/cli\.mjs --help/);
  assert.equal(result.stderr, "");
});

test("cli --help prints global help and exits successfully", () => {
  const result = runCli(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Core Commands:/);
  assert.equal(result.stderr, "");
});

test("cli -h prints global help and exits successfully", () => {
  const result = runCli(["-h"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Managed Docs And Planning:/);
  assert.equal(result.stderr, "");
});

test("cli subcommand --help prints command help and bypasses option validation", () => {
  const result = runCli(["verify-project", "--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Command: verify-project/);
  assert.match(result.stdout, /--name "Project Name"/);
  assert.equal(result.stderr, "");
});

test("cli subcommand -h supports spaced commands", () => {
  const result = runCli(["page", "push", "-h"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Command: page push/);
  assert.match(result.stdout, /--page "Planning > <Page Name>"/);
  assert.equal(result.stderr, "");
});

test("cli help command resolves hyphenated command aliases", () => {
  const result = runCli(["help", "page-push"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Command: page push/);
  assert.match(result.stdout, /Aliases:\n  page-push/);
  assert.equal(result.stderr, "");
});

test("cli help suppresses required option validation when extra flags are present", () => {
  const result = runCli(["verify-project", "--help", "--name", "SNPM"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Command: verify-project/);
  assert.doesNotMatch(result.stdout, /"ok":/);
  assert.equal(result.stderr, "");
});

test("cli unknown command help prints the error plus global help and exits non-zero", () => {
  const result = runCli(["fake-command", "--help"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command: fake-command/);
  assert.match(result.stdout, /node src\/cli\.mjs <command> \[options\]/);
});
