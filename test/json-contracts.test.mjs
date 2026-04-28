import test from "node:test";
import assert from "node:assert/strict";

import {
  JSON_CONTRACT_IDS,
  assertJsonContract,
  isJsonContractId,
  validateJsonContract,
} from "../src/contracts/json-contracts.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const pullMetadata = {
  schema: "snpm.pull-metadata.v1",
  commandFamily: "page",
  workspaceName: "infrastructure-hq",
  targetPath: "Projects > SNPM > Planning > Roadmap",
  pageId: "page-1",
  projectId: "project-1",
  authMode: "project-token",
  lastEditedTime: "2026-04-23T20:00:00.000Z",
  pulledAt: "2026-04-23T20:01:00.000Z",
};

const validPayloads = {
  "snpm.cli-error.v1": {
    ok: false,
    schemaVersion: 1,
    command: "sync-check",
    error: {
      code: "manifest_error",
      category: "preflight",
      message: "Sync manifest is invalid.",
      retryable: false,
      details: {
        kind: "manifest",
      },
    },
  },
  "snpm.discover.v1": {
    ok: true,
    schemaVersion: 1,
    command: "discover",
    snpm: {
      identity: "SNPM is the control repo.",
      runContext: "C:\\SNPM",
      workspace: "infrastructure-hq",
      project: "SNPM",
      projectTokenEnv: null,
      recommendedProjectTokenEnv: "SNPM_NOTION_TOKEN",
    },
    boundaries: {
      useControlRepo: "Use C:\\SNPM.",
      noVendoring: "Do not vendor SNPM internals.",
      consumerRepoOwns: ["source code"],
      notionOwns: ["approved planning pages"],
    },
    commandForms: {
      sourceCheckout: {
        context: "Use source checkout.",
        firstContactCommand: "npm run discover -- --project \"SNPM\"",
      },
      installedCli: {
        context: "Use installed CLI.",
        firstContactCommand: "snpm discover --project \"SNPM\"",
      },
    },
    safeFirstCommands: [{
      command: "npm run doctor -- --project \"SNPM\"",
      reason: "Read-only scan.",
    }],
    optionalSetupCommands: [{
      command: "npm run capabilities",
      reason: "Machine-readable discovery.",
    }],
    mutationLoop: ["Pull, edit, diff, push with apply."],
    notes: ["discover is read-only."],
  },
  "snpm.capabilities.v1.minimal": {
    schemaVersion: 1,
    canonicalCommands: ["discover"],
    commands: [{
      canonical: "discover",
      aliases: [],
      summary: "Print compact first-contact guidance.",
      usageLines: ["node src/cli.mjs discover --project \"Project Name\""],
      requiredFlags: ["--project \"Project Name\""],
      optionalFlags: ["--workspace infrastructure-hq"],
      examples: ["npm run discover -- --project \"SNPM\""],
      notes: ["JSON only."],
      surface: "first-contact",
      authScope: "project-token-optional",
      mutationMode: "read-only",
      stability: "stable",
      contract: {
        commandKind: "command",
        family: "discover",
        subcommand: null,
        outputMode: "json",
        npmScripts: ["discover"],
        sourceCheckoutForm: "node src/cli.mjs discover",
        installedCliForm: "snpm discover",
        dispatchKey: "discover",
      },
    }],
  },
  "snpm.plan-change.v1": {
    ok: true,
    command: "plan-change",
    goal: "Plan manifest draft",
    projectName: "SNPM",
    targets: [{
      index: 0,
      type: "planning",
      projectName: "SNPM",
      pagePath: "Planning > Roadmap",
    }],
    recommendations: [{
      ok: true,
      recommendedHome: "notion",
      surface: "planning",
      targetPath: "Projects > SNPM > Planning > Roadmap",
      reason: "Planning belongs in Notion.",
      warnings: [],
      nextCommands: [{
        kind: "command",
        command: "npm run page-pull -- --project \"SNPM\" --page \"Planning > Roadmap\"",
        reason: "Pull before editing.",
      }],
    }],
    nextCommands: [{
      kind: "command",
      command: "npm run page-pull -- --project \"SNPM\" --page \"Planning > Roadmap\"",
      reason: "Pull before editing.",
    }],
    warnings: [],
    manifestDraft: {
      version: 2,
      workspace: "infrastructure-hq",
      project: "SNPM",
      entries: [{
        kind: "planning-page",
        pagePath: "Planning > Roadmap",
        file: "notion/planning/roadmap.md",
      }],
    },
  },
  "snpm.manifest-v2.diagnostic.v1": {
    code: "manifest-v2-check-remote-failed",
    severity: "error",
    message: "Remote Notion target could not be read.",
    command: "sync-check",
    entry: {
      kind: "planning-page",
      target: "Planning > Roadmap",
      file: "notion/planning/roadmap.md",
      metadataPath: "C:\\repo\\notion\\planning\\roadmap.md.snpm-meta.json",
    },
    targetPath: "Projects > SNPM > Planning > Roadmap",
    safeNextCommand: "sync check",
    recoveryAction: "Verify the remote Notion target is readable.",
    state: {
      phase: "remote-read",
    },
  },
  "snpm.manifest-v2.sync-result.v1": {
    command: "sync-check",
    manifestPath: "C:\\repo\\snpm.sync.json",
    projectName: "SNPM",
    workspaceName: "infrastructure-hq",
    authMode: "project-token",
    hasDiff: true,
    driftCount: 1,
    appliedCount: 0,
    failures: [],
    entries: [{
      kind: "planning-page",
      target: "Planning > Roadmap",
      file: "notion/planning/roadmap.md",
      targetPath: "Projects > SNPM > Planning > Roadmap",
      status: "drift",
      hasDiff: true,
      applied: false,
    }],
    diagnostics: [],
    selectedCount: 1,
    skippedCount: 0,
  },
  "snpm.manifest-v2.review-output.v1": {
    written: true,
    directory: "C:\\repo\\.snpm-review",
    summaryPath: "C:\\repo\\.snpm-review\\summary.json",
    entriesDirectory: "C:\\repo\\.snpm-review\\entries",
    files: [
      "C:\\repo\\.snpm-review\\summary.json",
      "C:\\repo\\.snpm-review\\entries\\001-planning-page-roadmap.review.json",
    ],
    entryCount: 1,
    diffCount: 0,
  },
  "snpm.pull-metadata.v1": pullMetadata,
  "snpm.mutation-journal.v1": {
    schema: "snpm.mutation-journal.v1",
    command: "page-push",
    surface: "planning",
    targetPath: "Projects > SNPM > Planning > Roadmap",
    pageId: "page-1",
    authMode: "project-token",
    timestamp: "04-23-2026 12:00:00",
    revision: pullMetadata,
    diff: {
      hash: "a".repeat(64),
      additions: 2,
      deletions: 1,
    },
  },
};

test("exports the Sprint 1F contract ids", () => {
  assert.deepEqual(JSON_CONTRACT_IDS, [
    "snpm.cli-error.v1",
    "snpm.discover.v1",
    "snpm.capabilities.v1.minimal",
    "snpm.plan-change.v1",
    "snpm.manifest-v2.diagnostic.v1",
    "snpm.manifest-v2.sync-result.v1",
    "snpm.manifest-v2.review-output.v1",
    "snpm.pull-metadata.v1",
    "snpm.mutation-journal.v1",
  ]);
  assert.equal(isJsonContractId("snpm.pull-metadata.v1"), true);
  assert.equal(isJsonContractId("discover.v1"), true);
  assert.equal(isJsonContractId("snpm.unknown.v1"), false);
});

test("validates representative valid payloads for every contract", () => {
  for (const contractId of JSON_CONTRACT_IDS) {
    const payload = clone(validPayloads[contractId]);
    const result = validateJsonContract(contractId, payload);
    assert.deepEqual(result, {
      ok: true,
      contractId,
      errors: [],
    }, contractId);
    assert.equal(assertJsonContract(contractId, payload), payload);
  }
});

test("reports unsupported contract ids", () => {
  const result = validateJsonContract("snpm.unknown.v1", {});

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, "contractId");
  assert.throws(
    () => assertJsonContract("snpm.unknown.v1", {}),
    /Unsupported JSON contract/,
  );
});

test("rejects invalid required fields", () => {
  const cases = [
    ["snpm.cli-error.v1", (payload) => delete payload.error.message, /error\.message/],
    ["snpm.discover.v1", (payload) => delete payload.snpm.project, /snpm\.project/],
    ["snpm.capabilities.v1.minimal", (payload) => delete payload.commands[0].canonical, /commands\[0\]\.canonical/],
    ["snpm.plan-change.v1", (payload) => delete payload.goal, /goal/],
    ["snpm.manifest-v2.diagnostic.v1", (payload) => delete payload.safeNextCommand, /safeNextCommand/],
    ["snpm.manifest-v2.sync-result.v1", (payload) => delete payload.entries[0].status, /entries\[0\]\.status/],
    ["snpm.manifest-v2.review-output.v1", (payload) => delete payload.summaryPath, /summaryPath/],
    ["snpm.pull-metadata.v1", (payload) => delete payload.pageId, /pageId/],
    ["snpm.mutation-journal.v1", (payload) => delete payload.diff.hash, /diff\.hash/],
  ];

  for (const [contractId, mutate, expected] of cases) {
    const payload = clone(validPayloads[contractId]);
    mutate(payload);
    const result = validateJsonContract(contractId, payload);

    assert.equal(result.ok, false, contractId);
    assert.match(JSON.stringify(result.errors), expected, contractId);
  }
});

test("rejects invalid enum and literal fields", () => {
  const cases = [
    ["snpm.cli-error.v1", (payload) => payload.schemaVersion = 2, /schemaVersion/],
    ["snpm.discover.v1", (payload) => payload.command = "doctor", /command/],
    ["snpm.capabilities.v1.minimal", (payload) => payload.commands[0].authScope = "root-token", /authScope/],
    ["snpm.capabilities.v1.minimal", (payload) => payload.commands[0].contract.outputMode = "xml", /outputMode/],
    ["snpm.plan-change.v1", (payload) => payload.targets[0].type = "validation-session", /targets\[0\]\.type/],
    ["snpm.plan-change.v1", (payload) => payload.manifestDraft.entries[0].kind = "secret-record", /manifestDraft\.entries\[0\]\.kind/],
    ["snpm.manifest-v2.diagnostic.v1", (payload) => payload.severity = "fatal", /severity/],
    ["snpm.manifest-v2.diagnostic.v1", (payload) => payload.command = "sync-delete", /command/],
    ["snpm.manifest-v2.sync-result.v1", (payload) => payload.authMode = "personal-token", /authMode/],
    ["snpm.manifest-v2.sync-result.v1", (payload) => payload.entries[0].status = "deleted", /status/],
    ["snpm.pull-metadata.v1", (payload) => payload.schema = "snpm.pull-metadata.v2", /schema/],
    ["snpm.pull-metadata.v1", (payload) => payload.commandFamily = "secret", /commandFamily/],
    ["snpm.mutation-journal.v1", (payload) => payload.schema = "snpm.mutation-journal.v2", /schema/],
  ];

  for (const [contractId, mutate, expected] of cases) {
    const payload = clone(validPayloads[contractId]);
    mutate(payload);
    const result = validateJsonContract(contractId, payload);

    assert.equal(result.ok, false, contractId);
    assert.match(JSON.stringify(result.errors), expected, contractId);
  }
});

test("rejects leak-prone fields across contracts", () => {
  const cases = [
    ["snpm.cli-error.v1", (payload) => payload.error.details.token = "ntn_secret_value", /token/],
    ["snpm.discover.v1", (payload) => payload.snpm.token = "ntn_secret_value", /token/],
    ["snpm.capabilities.v1.minimal", (payload) => payload.commands[0].secret = "raw secret", /secret/],
    ["snpm.plan-change.v1", (payload) => payload.recommendations[0].bodyMarkdown = "# raw body", /bodyMarkdown/],
    ["snpm.manifest-v2.diagnostic.v1", (payload) => payload.state.password = "hunter2", /password/],
    ["snpm.manifest-v2.sync-result.v1", (payload) => payload.entries[0].currentBodyMarkdown = "# current", /currentBodyMarkdown/],
    ["snpm.manifest-v2.review-output.v1", (payload) => payload.diff = "diff --git a b\n+secret", /raw diff text/],
    ["snpm.pull-metadata.v1", (payload) => payload.bodyMarkdown = "# raw Notion body", /bodyMarkdown/],
    ["snpm.mutation-journal.v1", (payload) => payload.diff.raw = "diff --git a b\n+secret", /diff\.raw|raw diff text/],
  ];

  for (const [contractId, mutate, expected] of cases) {
    const payload = clone(validPayloads[contractId]);
    mutate(payload);
    const result = validateJsonContract(contractId, payload);

    assert.equal(result.ok, false, contractId);
    assert.match(JSON.stringify(result.errors), expected, contractId);
  }
});

test("supports review-output skipped shape", () => {
  const payload = {
    written: false,
    reason: "review-output-dir-not-provided",
  };

  assert.equal(validateJsonContract("snpm.manifest-v2.review-output.v1", payload).ok, true);
});

test("validates timestamp and digest formats", () => {
  const invalidMetadata = clone(validPayloads["snpm.pull-metadata.v1"]);
  invalidMetadata.pulledAt = "04-23-2026 12:00:00";
  assert.match(
    JSON.stringify(validateJsonContract("snpm.pull-metadata.v1", invalidMetadata).errors),
    /pulledAt/,
  );

  const invalidJournal = clone(validPayloads["snpm.mutation-journal.v1"]);
  invalidJournal.diff.hash = "not-a-sha";
  assert.match(
    JSON.stringify(validateJsonContract("snpm.mutation-journal.v1", invalidJournal).errors),
    /SHA-256/,
  );
});
