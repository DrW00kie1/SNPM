import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  findCommandHelp,
  parseArgs,
  resolveHelpRequest,
  usage,
  withMutationJournal,
} from "../src/cli.mjs";
import {
  buildCapabilityMap,
  capabilityJson,
} from "../src/cli-help.mjs";

const CLI_PATH = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = require("../package.json");
const SUPPORTED_MANIFEST_VERSIONS = [1, 2];
const SUPPORTED_MANIFEST_V2_ENTRY_KINDS = [
  "planning-page",
  "project-doc",
  "template-doc",
  "workspace-doc",
  "runbook",
  "validation-session",
];
const MANIFEST_V2_DIAGNOSTIC_NON_GOALS = [
  "rollback",
  "automatic-retries",
  "semantic-consistency-checks",
  "transaction-semantics",
  "generic-batch-apply",
];

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

function commandText(command) {
  return [
    command.summary,
    ...command.usageLines,
    ...command.requiredFlags,
    ...command.optionalFlags,
    ...command.examples,
    ...command.notes,
  ].join("\n");
}

function parseJsonPayloadFromMixedStdout(stdout) {
  const jsonStart = stdout.indexOf("{\n");
  assert.notEqual(jsonStart, -1, `Expected JSON payload in stdout:\n${stdout}`);
  return JSON.parse(stdout.slice(jsonStart));
}

function assertSyncPullDocumentsManifestV2Pull(text) {
  assert.match(text, /manifest v2/i);
  assert.match(text, /local file/i);
  assert.match(text, /(?:sidecar|\.snpm-meta\.json)/i);
  assert.match(text, /(?:does not mutate Notion|without mutating Notion|no Notion mutation)/i);
  assert.doesNotMatch(text, /Manifest v2 mixed-surface manifests are check-only/i);
}

function assertSyncPushDocumentsGuardedManifestV2Push(text) {
  assert.match(text, /manifest v1 validation-session/i);
  assert.match(text, /manifest v2/i);
  assert.match(text, /guarded/i);
  assert.match(text, /existing approved targets/i);
  assert.match(text, /(?:Notion updates|mutates Notion|Notion mutation)/i);
  assert.match(text, /--refresh-sidecars/);
  assert.match(text, /sidecar/i);
  assert.match(text, /local/i);
  assert.match(text, /requires --apply/i);
  assert.match(text, /manifest v2 only/i);
  assert.doesNotMatch(text, /(?:reject|not supported|unsupported)/i);
}

function assertSyncCapabilityMetadata(command, expected) {
  assert.deepEqual(command.supportedManifestVersions, SUPPORTED_MANIFEST_VERSIONS);
  assert.deepEqual(command.supportedManifestV2EntryKinds, SUPPORTED_MANIFEST_V2_ENTRY_KINDS);
  assert.equal(command.notionMutation, expected.notionMutation);
  assert.equal(command.localFileWrites, expected.localFileWrites);
  assert.equal(command.journalWrites, expected.journalWrites);
  assert.equal(command.sidecarRefresh, expected.sidecarRefresh);
  assert.equal(command.manifestV2Selection, "entry-or-entries-file");
  assert.equal(command.reviewOutput, expected.reviewOutput);
  assert.equal(command.maxMutations, expected.maxMutations);
  assert.equal(command.structuredDiagnostics, expected.structuredDiagnostics);
  assert.equal(command.diagnosticScope, "manifest-v2-only");
  assert.equal(command.diagnosticPurpose, "operator-recovery-metadata");
  assert.deepEqual(command.diagnosticNonGoals, MANIFEST_V2_DIAGNOSTIC_NON_GOALS);
  assert.deepEqual(command.diagnosticFields, [
    "code",
    "severity",
    "entry",
    "target",
    "safeNextCommand",
    "recoveryAction",
  ]);
}

test("usage includes planning sync plus access, runbook, build-record, validation-session, validation-bundle, and manifest sync commands", () => {
  const help = usage();
  assert.match(help, /node src\/cli\.mjs <command> \[options\]/);
  assert.match(help, /node src\/cli\.mjs --help/);
  assert.match(help, /node src\/cli\.mjs help <command>/);
  assert.match(help, /create-project/);
  assert.match(help, /capabilities/);
  assert.match(help, /plan-change/);
  assert.match(help, /doc <create\|adopt\|pull\|diff\|push\|edit>/);
  assert.match(help, /page <pull\|diff\|push\|edit>/);
  assert.match(help, /access-domain <create\|adopt\|pull\|diff\|push\|edit>/);
  assert.match(help, /journal <list>/);
  assert.match(help, /validation-sessions <init\|verify>/);
  assert.match(help, /validation-bundle <login\|preview\|apply\|verify>/);
  assert.match(help, /sync <check\|pull\|push>/);
  assert.match(help, /Manifest v2[^.]*sync check[^.]*sync pull[^.]*guarded sync push/i);
  assert.match(help, /(?:sync pull[^.]*local[- ]file|local[- ]file[^.]*sync pull)/i);
  assert.match(help, /Validation-session manifest v1 sync[^.]*sync push/i);
  assert.match(help, /guarded sync push for existing approved targets/i);
  assert.doesNotMatch(help, /v2 mixed-surface support is check-only/);
  assert.doesNotMatch(help, /sync pull and sync push remain manifest v1 validation-session operations/);
  assert.doesNotMatch(help, /sync push[^.]*reject/i);
  assert.match(help, /Recommend stays an alias for the read-only scan unless --intent is provided/);
  assert.match(help, /managed doc surface uses doc-\* commands/);
  assert.match(help, /Validation-session bundle verification remains the API-visible check/);
  assert.match(help, /Validation-bundle automation launches Playwright Chromium directly/);
  assert.match(help, /markdown body is written to stdout and the structured metadata is written to stderr/);
  assert.match(help, /Implementation notes, design specs, task breakdowns, and investigations are repo-first intents/);
  assert.match(help, /support --explain/);
  assert.match(help, /--review-output <dir>/);
  assert.match(help, /npm run verify-project/);
  assert.match(help, /npm run doc-create/);
  assert.match(help, /npm run page-push/);
});

test("help registry resolves command aliases to the canonical command", () => {
  assert.equal(findCommandHelp("page-push")?.canonical, "page push");
  assert.equal(findCommandHelp("page push")?.canonical, "page push");
  assert.equal(findCommandHelp("validation-bundle-verify")?.canonical, "validation-bundle verify");
  assert.equal(findCommandHelp("verify")?.canonical, "verify-project");
  assert.equal(findCommandHelp("journal-list")?.canonical, "journal list");
  assert.equal(findCommandHelp("journal list")?.canonical, "journal list");
});

test("capability map is schema-versioned and includes existing commands from the help registry", () => {
  const capabilities = buildCapabilityMap();
  const pagePush = capabilities.commands.find((command) => command.canonical === "page push");
  const registryPagePush = findCommandHelp("page push");

  assert.equal(capabilities.schemaVersion, 1);
  assert.ok(capabilities.commandGroups.some((group) => group.title === "Core Commands"));
  assert.ok(capabilities.canonicalCommands.includes("verify-project"));
  assert.ok(capabilities.canonicalCommands.includes("page push"));
  assert.ok(capabilities.canonicalCommands.includes("validation-bundle verify"));
  assert.ok(capabilities.canonicalCommands.includes("capabilities"));
  assert.ok(capabilities.canonicalCommands.includes("plan-change"));
  assert.ok(capabilities.canonicalCommands.includes("journal list"));
  assert.deepEqual(pagePush, {
    canonical: registryPagePush.canonical,
    aliases: registryPagePush.aliases,
    summary: registryPagePush.summary,
    usageLines: registryPagePush.usageLines,
    requiredFlags: registryPagePush.requiredFlags,
    optionalFlags: registryPagePush.optionalFlags,
    examples: registryPagePush.examples,
    notes: registryPagePush.notes,
    surface: registryPagePush.surface,
    authScope: registryPagePush.authScope,
    mutationMode: registryPagePush.mutationMode,
    stability: registryPagePush.stability,
  });
});

test("capability map exposes sprint metadata fields for every command", () => {
  const capabilities = buildCapabilityMap();

  for (const command of capabilities.commands) {
    assert.equal(typeof command.canonical, "string");
    assert.ok(Array.isArray(command.aliases));
    assert.equal(typeof command.summary, "string");
    assert.ok(Array.isArray(command.usageLines));
    assert.ok(Array.isArray(command.requiredFlags));
    assert.ok(Array.isArray(command.optionalFlags));
    assert.ok(Array.isArray(command.examples));
    assert.ok(Array.isArray(command.notes));
    assert.equal(typeof command.surface, "string");
    assert.equal(typeof command.authScope, "string");
    assert.equal(typeof command.mutationMode, "string");
    assert.equal(typeof command.stability, "string");
  }
});

test("capabilities command help and npm script are registered", () => {
  const spec = findCommandHelp("capabilities");
  const capabilities = buildCapabilityMap();
  const parsedJson = JSON.parse(capabilityJson());

  assert.equal(spec?.canonical, "capabilities");
  assert.equal(spec?.surface, "cli");
  assert.equal(spec?.authScope, "none");
  assert.equal(spec?.mutationMode, "read-only");
  assert.equal(packageJson.scripts.capabilities, "node src/cli.mjs capabilities");
  assert.deepEqual(parsedJson, capabilities);
});

test("sync check, pull, and push help document manifest v2 boundaries", () => {
  const checkResult = runCli(["sync", "check", "--help"]);
  const pullResult = runCli(["sync", "pull", "--help"]);
  const pushResult = runCli(["sync", "push", "--help"]);
  const capabilitiesResult = runCli(["capabilities"]);
  const processCapabilities = JSON.parse(capabilitiesResult.stdout);
  const capabilities = buildCapabilityMap();
  const syncCheckCapability = capabilities.commands.find((command) => command.canonical === "sync check");
  const syncPullCapability = capabilities.commands.find((command) => command.canonical === "sync pull");
  const syncPushCapability = capabilities.commands.find((command) => command.canonical === "sync push");
  const processSyncCheckCapability = processCapabilities.commands.find((command) => command.canonical === "sync check");
  const processSyncPullCapability = processCapabilities.commands.find((command) => command.canonical === "sync pull");
  const processSyncPushCapability = processCapabilities.commands.find((command) => command.canonical === "sync push");

  assert.equal(checkResult.status, 0);
  assert.equal(checkResult.stderr, "");
  assert.match(checkResult.stdout, /Command: sync check/);
  assert.match(checkResult.stdout, /manifest v2 mixed-surface manifests/i);
  assert.match(checkResult.stdout, /planning pages, project docs, template docs, workspace docs, runbooks, and validation sessions/);
  assert.match(checkResult.stdout, /--entry <kind:target>/);
  assert.match(checkResult.stdout, /--entries-file <path\|->/);
  assert.match(checkResult.stdout, /--review-output <dir>/);
  assert.match(checkResult.stdout, /structured result\/review metadata/i);
  assert.match(checkResult.stdout, /stable codes, severity, entry\/target context, a safe next command, and a recovery action/i);

  assert.equal(pullResult.status, 0);
  assert.equal(pullResult.stderr, "");
  assert.match(pullResult.stdout, /Command: sync pull/);
  assertSyncPullDocumentsManifestV2Pull(pullResult.stdout);
  assert.match(pullResult.stdout, /--entry <kind:target>/);
  assert.match(pullResult.stdout, /--entries-file <path\|->/);
  assert.match(pullResult.stdout, /structured result metadata/i);
  assert.match(pullResult.stdout, /safe next command/i);

  assert.equal(pushResult.status, 0);
  assert.equal(pushResult.stderr, "");
  assert.match(pushResult.stdout, /Command: sync push/);
  assertSyncPushDocumentsGuardedManifestV2Push(pushResult.stdout);
  assert.match(pushResult.stdout, /--entry <kind:target>/);
  assert.match(pushResult.stdout, /--entries-file <path\|->/);
  assert.match(pushResult.stdout, /--review-output <dir>/);
  assert.match(pushResult.stdout, /--max-mutations <n\|all>/);
  assert.match(pushResult.stdout, /defaults to 1/i);
  assert.match(pushResult.stdout, /structured result\/review metadata/i);
  assert.match(pushResult.stdout, /do not add rollback, automatic retries, semantic consistency checks, transaction semantics, or generic batch apply/i);

  assert.equal(capabilitiesResult.status, 0);
  assert.equal(capabilitiesResult.stderr, "");

  assert.ok(syncCheckCapability);
  assert.ok(syncPullCapability);
  assert.ok(syncPushCapability);
  assert.ok(processSyncCheckCapability);
  assert.ok(processSyncPullCapability);
  assert.ok(processSyncPushCapability);

  const syncCheckText = commandText(syncCheckCapability);
  const syncPullText = commandText(syncPullCapability);
  const syncPushText = commandText(syncPushCapability);

  assert.match(syncCheckText, /manifest v2 mixed-surface manifests/i);
  assert.match(syncCheckText, /planning pages, project docs, template docs, workspace docs, runbooks, and validation sessions/);
  assert.match(syncCheckText, /structured result\/review metadata/i);
  assert.match(syncCheckText, /manifest v2 metadata only/i);
  assertSyncPullDocumentsManifestV2Pull(syncPullText);
  assert.match(syncPullText, /structured result metadata/i);
  assert.match(syncPullText, /manifest v2 metadata only/i);
  assertSyncPushDocumentsGuardedManifestV2Push(syncPushText);
  assert.match(syncPushText, /structured result\/review metadata/i);
  assert.match(syncPushText, /manifest v2 metadata only/i);

  assertSyncCapabilityMetadata(syncCheckCapability, {
    notionMutation: "none",
    localFileWrites: "none",
    journalWrites: "none",
    reviewOutput: "manifest-v2-only",
    structuredDiagnostics: "manifest-v2-result-and-review-metadata",
  });
  assertSyncCapabilityMetadata(syncPullCapability, {
    notionMutation: "none",
    localFileWrites: "apply-gated",
    journalWrites: "none",
    reviewOutput: "unsupported",
    structuredDiagnostics: "manifest-v2-result-metadata",
  });
  assertSyncCapabilityMetadata(syncPushCapability, {
    notionMutation: "apply-gated",
    localFileWrites: "opt-in-refresh-sidecars-apply-gated",
    journalWrites: "apply-gated",
    sidecarRefresh: "opt-in-apply-gated",
    reviewOutput: "manifest-v2-preview-only",
    maxMutations: "manifest-v2-apply-default-1",
    structuredDiagnostics: "manifest-v2-result-and-review-metadata",
  });
  assert.deepEqual(processSyncCheckCapability, syncCheckCapability);
  assert.deepEqual(processSyncPullCapability, syncPullCapability);
  assert.deepEqual(processSyncPushCapability, syncPushCapability);
});

test("cli sync check reports review-output diagnostics when artifact writing fails", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-cli-review-output-"));
  const manifestPath = path.join(tempDir, "snpm.sync.json");
  const markdownPath = path.join(tempDir, "roadmap.md");
  const reviewOutputPath = path.join(tempDir, "review-output");
  const missingTokenEnv = "SNPM_REVIEW_OUTPUT_FAILURE_TEST_TOKEN_SHOULD_NOT_EXIST_9F44";

  try {
    writeFileSync(markdownPath, "# Local Roadmap\n", "utf8");
    writeFileSync(manifestPath, `${JSON.stringify({
      version: 2,
      workspace: "infrastructure-hq",
      project: "SNPM",
      entries: [{
        kind: "planning-page",
        pagePath: "Planning > Roadmap",
        file: "roadmap.md",
      }],
    }, null, 2)}\n`, "utf8");
    writeFileSync(reviewOutputPath, "not a directory\n", "utf8");

    const result = runCli([
      "sync",
      "check",
      "--manifest",
      manifestPath,
      "--project-token-env",
      missingTokenEnv,
      "--review-output",
      reviewOutputPath,
    ], {
      env: {
        [missingTokenEnv]: "",
      },
    });
    const payload = parseJsonPayloadFromMixedStdout(result.stdout);
    const reviewDiagnostic = payload.diagnostics.find((diagnostic) => (
      diagnostic.code === "manifest-v2-check-review-output-failed"
    ));

    assert.equal(result.status, 1);
    assert.equal(result.stderr, "");
    assert.equal(payload.ok, false);
    assert.equal(payload.reviewOutput.written, false);
    assert.match(payload.reviewOutput.failure, /review-output/i);
    assert.ok(payload.failures.some((failure) => /Review output failed:/i.test(failure)));
    assert.ok(reviewDiagnostic);
    assert.equal(reviewDiagnostic.command, "sync-check");
    assert.equal(reviewDiagnostic.safeNextCommand, "sync check --review-output <dir>");
    assert.equal(reviewDiagnostic.recoveryAction, "Choose a writable review output directory, or rerun without review output.");
    assert.equal(reviewDiagnostic.state.phase, "review-output");
    assert.equal(reviewDiagnostic.state.reviewOutputDir, reviewOutputPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("plan-change and journal list command help and npm scripts are registered", () => {
  const planChange = findCommandHelp("plan-change");
  const journalList = findCommandHelp("journal-list");

  assert.equal(planChange?.canonical, "plan-change");
  assert.equal(planChange?.surface, "planning");
  assert.equal(planChange?.authScope, "project-token-optional");
  assert.equal(planChange?.mutationMode, "read-only");
  assert.match(planChange?.usageLines.join("\n") || "", /--targets-file <path\|->/);
  assert.match(planChange?.notes.join("\n") || "", /prints JSON only/);

  assert.equal(journalList?.canonical, "journal list");
  assert.deepEqual(journalList?.aliases, ["journal-list"]);
  assert.equal(journalList?.surface, "mutation-journal");
  assert.equal(journalList?.authScope, "local-filesystem");
  assert.equal(journalList?.mutationMode, "read-only");
  assert.match(journalList?.notes.join("\n") || "", /prints JSON only/);

  assert.equal(packageJson.scripts["plan-change"], "node src/cli.mjs plan-change");
  assert.equal(packageJson.scripts["journal-list"], "node src/cli.mjs journal list");
});

test("command help advertises strict metadata sidecar flags", () => {
  assert.ok(findCommandHelp("page pull")?.optionalFlags.includes("--metadata-output <path>"));
  assert.ok(findCommandHelp("page push")?.optionalFlags.includes("--metadata <path>"));
  assert.ok(findCommandHelp("doc pull")?.notes.join("\n").includes("<output>.snpm-meta.json"));
  assert.ok(findCommandHelp("doc push")?.notes.join("\n").includes("<file>.snpm-meta.json"));
  assert.ok(findCommandHelp("build-record pull")?.optionalFlags.includes("--metadata-output <path>"));
  assert.ok(findCommandHelp("validation-session push")?.optionalFlags.includes("--metadata <path>"));
});

test("withMutationJournal records applied mutations and keeps journal path on the result", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-cli-journal-"));
  const journalPath = path.join(tempDir, "journal.ndjson");
  const previousJournalPath = process.env.SNPM_JOURNAL_PATH;
  process.env.SNPM_JOURNAL_PATH = journalPath;

  try {
    const result = withMutationJournal({
      applied: true,
      targetPath: "Projects > SNPM > Planning > Roadmap",
      pageId: "page-1",
      authMode: "project-token",
      diff: "--- a\n+++ b\n-old\n+new\n",
      metadata: {
        schema: "snpm.pull-metadata.v1",
        commandFamily: "page",
        workspaceName: "infrastructure-hq",
        targetPath: "Projects > SNPM > Planning > Roadmap",
        pageId: "page-1",
        lastEditedTime: "2026-04-23T10:00:00.000Z",
        pulledAt: "2026-04-23T10:01:00.000Z",
        secretValue: "must-not-persist",
      },
    }, {
      command: "page-push",
      surface: "planning",
    });

    assert.deepEqual(result.journal, { path: journalPath });
    const entry = JSON.parse(readFileSync(journalPath, "utf8").trim());
    assert.equal(entry.command, "page-push");
    assert.equal(entry.surface, "planning");
    assert.equal(entry.diff.additions, 1);
    assert.equal(entry.diff.deletions, 1);
    assert.equal(entry.revision.lastEditedTime, "2026-04-23T10:00:00.000Z");
    assert.equal(entry.revision.secretValue, undefined);
  } finally {
    if (previousJournalPath === undefined) {
      delete process.env.SNPM_JOURNAL_PATH;
    } else {
      process.env.SNPM_JOURNAL_PATH = previousJournalPath;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
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
  assert.deepEqual(resolveHelpRequest(["validation-bundle", "verify", "--help"]), {
    type: "command",
    command: "validation-bundle verify",
  });
  assert.deepEqual(resolveHelpRequest(["plan-change", "--help"]), {
    type: "command",
    command: "plan-change",
  });
  assert.deepEqual(resolveHelpRequest(["help", "journal-list"]), {
    type: "command",
    command: "journal list",
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
    "--metadata",
    "backlog.md.snpm-meta.json",
    "--apply",
  ]);

  assert.equal(parsed.command, "page push");
  assert.equal(parsed.options.project, "SNPM");
  assert.equal(parsed.options.page, "Planning > Backlog");
  assert.equal(parsed.options.file, "backlog.md");
  assert.equal(parsed.options.metadata, "backlog.md.snpm-meta.json");
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

test("parseArgs supports validation-bundle commands", () => {
  const loginParsed = parseArgs([
    "validation-bundle",
    "login",
  ]);
  const applyParsed = parseArgs([
    "validation-bundle",
    "apply",
    "--project",
    "SNPM",
    "--project-token-env",
    "SNPM_NOTION_TOKEN",
    "--apply",
  ]);

  assert.equal(loginParsed.command, "validation-bundle login");
  assert.equal(applyParsed.command, "validation-bundle apply");
  assert.equal(applyParsed.options.project, "SNPM");
  assert.equal(applyParsed.options["project-token-env"], "SNPM_NOTION_TOKEN");
  assert.equal(applyParsed.options.apply, true);
});

test("parseArgs supports sync subcommands", () => {
  const parsed = parseArgs([
    "sync",
    "push",
    "--manifest",
    "C:\\tall-man-training\\snpm.sync.json",
    "--entry",
    "planning-page:Planning > Roadmap",
    "--entry",
    "runbook:Deploy",
    "--entries-file",
    "-",
    "--review-output",
    "review",
    "--max-mutations",
    "all",
    "--project-token-env",
    "TALLMAN_NOTION_TOKEN",
    "--apply",
    "--refresh-sidecars",
  ]);

  assert.equal(parsed.command, "sync push");
  assert.equal(parsed.options.manifest, "C:\\tall-man-training\\snpm.sync.json");
  assert.deepEqual(parsed.options.entry, [
    "planning-page:Planning > Roadmap",
    "runbook:Deploy",
  ]);
  assert.equal(parsed.options["entries-file"], "-");
  assert.equal(parsed.options["review-output"], "review");
  assert.equal(parsed.options["max-mutations"], "all");
  assert.equal(parsed.options["project-token-env"], "TALLMAN_NOTION_TOKEN");
  assert.equal(parsed.options.apply, true);
  assert.equal(parsed.options["refresh-sidecars"], true);
});

test("parseArgs preserves single-value overwrite behavior for other flags", () => {
  const parsed = parseArgs([
    "sync",
    "check",
    "--manifest",
    "first.json",
    "--manifest",
    "second.json",
  ]);

  assert.equal(parsed.command, "sync check");
  assert.equal(parsed.options.manifest, "second.json");
});

test("parseArgs supports plan-change and journal list discovery commands", () => {
  const planChangeParsed = parseArgs([
    "plan-change",
    "--targets-file",
    "-",
    "--project",
    "SNPM",
  ]);
  const journalListParsed = parseArgs([
    "journal",
    "list",
    "--limit",
    "5",
  ]);

  assert.equal(planChangeParsed.command, "plan-change");
  assert.equal(planChangeParsed.options["targets-file"], "-");
  assert.equal(planChangeParsed.options.project, "SNPM");
  assert.equal(journalListParsed.command, "journal list");
  assert.equal(journalListParsed.options.limit, "5");
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

test("cli validation-bundle help prints command help and bypasses option validation", () => {
  const result = runCli(["validation-bundle", "preview", "--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Command: validation-bundle preview/);
  assert.match(result.stdout, /This lane is experimental/i);
  assert.equal(result.stderr, "");
});

test("cli plan-change and journal-list help print command help", () => {
  const planChangeResult = runCli(["plan-change", "--help"]);
  const journalListResult = runCli(["help", "journal-list"]);

  assert.equal(planChangeResult.status, 0);
  assert.match(planChangeResult.stdout, /Command: plan-change/);
  assert.match(planChangeResult.stdout, /--targets-file <path\|->/);
  assert.equal(planChangeResult.stderr, "");

  assert.equal(journalListResult.status, 0);
  assert.match(journalListResult.stdout, /Command: journal list/);
  assert.match(journalListResult.stdout, /Aliases:\n  journal-list/);
  assert.equal(journalListResult.stderr, "");
});

test("cli capabilities prints JSON only", () => {
  const result = runCli(["capabilities"]);
  const parsed = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(parsed, buildCapabilityMap());
  assert.ok(parsed.canonicalCommands.includes("capabilities"));
  assert.ok(parsed.canonicalCommands.includes("plan-change"));
  assert.ok(parsed.canonicalCommands.includes("journal list"));
});

test("cli journal list prints JSON only without live Notion", () => {
  const result = runCli(["journal", "list", "--limit", "5"], {
    env: {
      SNPM_JOURNAL_PATH: fileURLToPath(new URL("../.missing-test-journal.ndjson", import.meta.url)),
    },
  });
  const parsed = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(parsed, {
    ok: true,
    command: "journal-list",
    entries: [],
  });
});

test("cli unknown command help prints the error plus global help and exits non-zero", () => {
  const result = runCli(["fake-command", "--help"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command: fake-command/);
  assert.match(result.stdout, /node src\/cli\.mjs <command> \[options\]/);
});
