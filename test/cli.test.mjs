import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  commandRegistryContract,
  commandUsage,
} from "../src/cli-help.mjs";

const CLI_PATH = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_WORKSPACE_CONFIG_DIR = path.join(REPO_ROOT, "config", "workspaces");
const require = createRequire(import.meta.url);
const packageJson = require("../package.json");
const JSON_CONTRACTS_URL = new URL("../src/contracts/json-contracts.mjs", import.meta.url);
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
    input: options.input,
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

function publicWorkspaceConfigEnv(env = {}) {
  return {
    ...env,
    SNPM_WORKSPACE_CONFIG_DIR: PUBLIC_WORKSPACE_CONFIG_DIR,
  };
}

function runNpmScript(script, args = []) {
  const npmArgs = ["run", "--silent", script, "--", ...args];
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", ["npm", ...npmArgs].map((arg) => (
      /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg
    )).join(" ")]
    : npmArgs;

  return spawnSync(command, commandArgs, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: process.env,
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

function assertStructuredCliFailure(result, { category, code, command, messagePattern }) {
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");

  const payload = JSON.parse(result.stderr);
  assert.equal(payload.ok, false);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.command, command);
  assert.equal(payload.error.code, code);
  assert.equal(payload.error.category, category);
  assert.match(payload.error.message, messagePattern);
}

function assertValidContractResult(result, contractId) {
  if (result === undefined || result === true) {
    return;
  }

  if (result && typeof result === "object") {
    if ("ok" in result) {
      assert.equal(result.ok, true, `${contractId} validation failed: ${JSON.stringify(result)}`);
      return;
    }

    if ("valid" in result) {
      assert.equal(result.valid, true, `${contractId} validation failed: ${JSON.stringify(result)}`);
      return;
    }
  }

  assert.fail(`${contractId} validator returned an unsupported result: ${JSON.stringify(result)}`);
}

async function assertJsonContractPayload(contractId, payload) {
  let contractsModule;
  try {
    contractsModule = await import(JSON_CONTRACTS_URL);
  } catch (error) {
    assert.fail(`Expected src/contracts/json-contracts.mjs to export validateJsonContract: ${error.message}`);
  }

  assert.equal(
    typeof contractsModule.validateJsonContract,
    "function",
    "src/contracts/json-contracts.mjs must export validateJsonContract(contractId, payload)",
  );
  assertValidContractResult(await contractsModule.validateJsonContract(contractId, payload), contractId);
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

test("usage includes planning sync plus access, runbook, build-record, validation-session, and manifest sync commands", () => {
  const help = usage();
  assert.match(help, /node src\/cli\.mjs <command> \[options\]/);
  assert.match(help, /snpm <command> \[options\]/);
  assert.match(help, /node src\/cli\.mjs --help/);
  assert.match(help, /snpm --help/);
  assert.match(help, /node src\/cli\.mjs help <command>/);
  assert.match(help, /snpm help <command>/);
  assert.match(help, /create-project/);
  assert.match(help, /capabilities/);
  assert.match(help, /discover/);
  assert.match(help, /plan-change/);
  assert.match(help, /scaffold-docs/);
  assert.match(help, /doc <create\|adopt\|pull\|diff\|push\|edit>/);
  assert.match(help, /page <pull\|diff\|push\|edit>/);
  assert.match(help, /access-domain <create\|adopt\|pull\|diff\|push\|edit>/);
  assert.match(help, /journal <list>/);
  assert.match(help, /validation-sessions <init\|verify>/);
  assert.match(help, /sync <check\|pull\|push>/);
  assert.doesNotMatch(help, /validation-bundle/i);
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
  assert.match(help, /markdown body is written to stdout and the structured metadata is written to stderr/);
  assert.match(help, /Implementation notes, design specs, task breakdowns, and investigations are repo-first intents/);
  assert.match(help, /scaffold-docs is preview-first bootstrap doc scaffolding/);
  assert.match(help, /support --explain/);
  assert.match(help, /--review-output <dir>/);
  assert.match(help, /--error-format json\|text/);
  assert.match(help, /SNPM_ERROR_FORMAT=json\|text/);
  assert.match(help, /npm run verify-project/);
  assert.match(help, /npm run scaffold-docs/);
  assert.match(help, /npm run doc-create/);
  assert.match(help, /npm run page-push/);
  assert.match(help, /snpm verify-project --help/);
  assert.match(help, /snpm page push -h/);
  assert.match(help, /snpm sync --help/);
  assert.doesNotMatch(help, /Worker A/);
});

test("help presentation includes source checkout and installed CLI forms from the registry", () => {
  const capabilities = buildCapabilityMap();
  const verifyCapability = capabilities.commands.find((command) => command.canonical === "verify-project");
  const pagePushCapability = capabilities.commands.find((command) => command.canonical === "page push");
  const verifyHelp = commandUsage("verify-project");
  const pagePushHelp = commandUsage("page push");
  const discoverHelp = commandUsage("discover");

  assert.equal(capabilities.schemaVersion, 1);
  assert.equal(verifyCapability?.contract.sourceCheckoutForm, "node src/cli.mjs verify-project");
  assert.equal(verifyCapability?.contract.installedCliForm, "snpm verify-project");
  assert.equal(pagePushCapability?.contract.sourceCheckoutForm, "node src/cli.mjs page push");
  assert.equal(pagePushCapability?.contract.installedCliForm, "snpm page push");

  assert.match(verifyHelp, /node src\/cli\.mjs verify-project --name "Project Name"/);
  assert.match(verifyHelp, /snpm verify-project --name "Project Name"/);
  assert.match(verifyHelp, /See `node src\/cli\.mjs --help` or `snpm --help`/);
  assert.match(pagePushHelp, /node src\/cli\.mjs page push --project "Project Name"/);
  assert.match(pagePushHelp, /snpm page push --project "Project Name"/);
  assert.match(discoverHelp, /node src\/cli\.mjs discover --project "Project Name"/);
  assert.match(discoverHelp, /snpm discover --project "Project Name"/);
  assert.match(discoverHelp, /source-checkout npm script commands/);
});

test("help registry resolves command aliases to the canonical command", () => {
  assert.equal(findCommandHelp("doc")?.canonical, "doc");
  assert.equal(findCommandHelp("page")?.canonical, "page");
  assert.equal(findCommandHelp("page-push")?.canonical, "page push");
  assert.equal(findCommandHelp("page push")?.canonical, "page push");
  assert.equal(findCommandHelp("runbook")?.canonical, "runbook");
  assert.equal(findCommandHelp("secret-record")?.canonical, "secret-record");
  assert.equal(findCommandHelp("access-token")?.canonical, "access-token");
  assert.equal(findCommandHelp("secret-record-generate")?.canonical, "secret-record generate");
  assert.equal(findCommandHelp("access-token generate")?.canonical, "access-token generate");
  assert.equal(findCommandHelp("sync")?.canonical, "sync");
  assert.equal(findCommandHelp("validation-session")?.canonical, "validation-session");
  assert.equal(findCommandHelp("validation-bundle-verify"), null);
  assert.equal(findCommandHelp("validation-bundle verify"), null);
  assert.equal(findCommandHelp("verify")?.canonical, "verify-project");
  assert.equal(findCommandHelp("discover")?.canonical, "discover");
  assert.equal(findCommandHelp("journal-list")?.canonical, "journal list");
  assert.equal(findCommandHelp("journal list")?.canonical, "journal list");
});

test("command registry contract has unique lookups and complete command metadata", () => {
  const contract = commandRegistryContract();
  const canonicalSet = new Set(contract.canonicalCommands);

  assert.equal(contract.schemaVersion, 1);
  assert.equal(canonicalSet.size, contract.canonicalCommands.length);
  assert.deepEqual(contract.diagnostics, {
    duplicateCanonicals: [],
    lookupCollisions: [],
    missingMetadata: [],
    invalidEnumValues: [],
  });

  for (const entry of contract.lookupEntries) {
    assert.equal(findCommandHelp(entry.lookup)?.canonical, entry.canonical);
    assert.ok(canonicalSet.has(entry.canonical));
  }
});

test("command registry contract preserves capability canonical ordering", () => {
  const contract = commandRegistryContract();
  const capabilities = buildCapabilityMap();

  assert.deepEqual(capabilities.canonicalCommands, contract.canonicalCommands);
  assert.deepEqual(
    capabilities.commands.map((command) => command.canonical),
    contract.canonicalCommands,
  );
});

test("capability map is schema-versioned and includes existing commands from the help registry", () => {
  const capabilities = buildCapabilityMap();
  const pagePush = capabilities.commands.find((command) => command.canonical === "page push");
  const registryPagePush = findCommandHelp("page push");

  assert.equal(capabilities.schemaVersion, 1);
  assert.ok(capabilities.commandGroups.some((group) => group.title === "Core Commands"));
  assert.ok(capabilities.canonicalCommands.includes("verify-project"));
  assert.ok(capabilities.canonicalCommands.includes("page push"));
  assert.equal(capabilities.canonicalCommands.includes("validation-bundle verify"), false);
  assert.ok(capabilities.canonicalCommands.includes("capabilities"));
  assert.ok(capabilities.canonicalCommands.includes("discover"));
  assert.ok(capabilities.canonicalCommands.includes("plan-change"));
  assert.ok(capabilities.canonicalCommands.includes("scaffold-docs"));
  assert.ok(capabilities.canonicalCommands.includes("sync"));
  assert.ok(capabilities.canonicalCommands.includes("doc"));
  assert.ok(capabilities.canonicalCommands.includes("runbook"));
  assert.ok(capabilities.canonicalCommands.includes("secret-record"));
  assert.ok(capabilities.canonicalCommands.includes("access-token"));
  assert.ok(capabilities.canonicalCommands.includes("secret-record generate"));
  assert.ok(capabilities.canonicalCommands.includes("access-token generate"));
  assert.ok(capabilities.canonicalCommands.includes("journal list"));
  assert.deepEqual(capabilities.structuredErrors, {
    schemaVersion: 1,
    defaultFormat: "text",
    supportedFormats: ["text", "json"],
    jsonContracts: ["snpm.cli-error.v1"],
    flag: "--error-format json|text",
    environmentVariable: "SNPM_ERROR_FORMAT",
    precedence: "cli-flag-over-env",
    stream: "stderr-only-for-top-level-failures",
    stdoutOnFailure: "empty",
    scope: "top-level-thrown-and-preflight-failures",
    successSchemas: "unchanged",
    nonGoals: ["automatic-retries", "rollback", "transaction-semantics", "mutation-behavior-changes"],
  });
  assert.doesNotMatch(JSON.stringify(capabilities), /validation-bundle/i);
  assert.doesNotMatch(JSON.stringify(capabilities), /Worker A/);
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
    contract: registryPagePush.contract,
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

test("validation-bundle npm scripts are not registered", () => {
  assert.equal(packageJson.scripts["validation-bundle-login"], undefined);
  assert.equal(packageJson.scripts["validation-bundle-preview"], undefined);
  assert.equal(packageJson.scripts["validation-bundle-apply"], undefined);
  assert.equal(packageJson.scripts["validation-bundle-verify"], undefined);
});

test("transport hardening does not add public CLI flags or command surface", () => {
  const help = usage();
  const capabilities = buildCapabilityMap();
  const packageScripts = Object.keys(packageJson.scripts).join("\n");
  const publicDiscovery = [
    help,
    JSON.stringify(capabilities),
    packageScripts,
  ].join("\n");

  assert.doesNotMatch(publicDiscovery, /--timeout\b/);
  assert.doesNotMatch(publicDiscovery, /--retry\b/);
  assert.doesNotMatch(publicDiscovery, /\btransport(?:-| )?(?:check|doctor|retry|timeout)\b/i);
  assert.equal(capabilities.canonicalCommands.some((command) => /transport/i.test(command)), false);
  assert.equal(Object.keys(packageJson.scripts).some((script) => /transport/i.test(script)), false);
});

test("discover command help, capability metadata, and npm script are registered", () => {
  const spec = findCommandHelp("discover");
  const capabilities = buildCapabilityMap();
  const command = capabilities.commands.find((candidate) => candidate.canonical === "discover");

  assert.equal(spec?.canonical, "discover");
  assert.equal(spec?.surface, "first-contact");
  assert.equal(spec?.authScope, "project-token-optional");
  assert.equal(spec?.mutationMode, "read-only");
  assert.equal(command?.firstContact, true);
  assert.equal(command?.notionMutation, "none");
  assert.equal(command?.localFileWrites, "none");
  assert.equal(command?.journalWrites, "none");
  assert.match(commandText(spec), /--project "Project Name"/);
  assert.match(commandText(spec), /C:\\SNPM/);
  assert.match(commandText(spec), /source-checkout npm script commands/);
  assert.match(commandText(spec), /snpm discover --project "Project Name"/);
  assert.match(commandText(spec), /does not read Notion/);
  assert.equal(packageJson.scripts.discover, "node src/cli.mjs discover");
});

test("doctor help, audit capability metadata, and npm scripts are registered", () => {
  const spec = findCommandHelp("doctor");
  const capabilities = buildCapabilityMap();
  const command = capabilities.commands.find((candidate) => candidate.canonical === "doctor");

  assert.equal(spec?.canonical, "doctor");
  assert.equal(spec?.surface, "project-health");
  assert.equal(spec?.authScope, "project-token-optional");
  assert.equal(spec?.mutationMode, "read-only");
  assert.match(commandText(spec), /--truth-audit/);
  assert.match(commandText(spec), /--consistency-audit/);
  assert.match(commandText(spec), /--stale-after-days <positive integer>/);
  assert.match(commandText(spec), /defaults to 30/i);
  assert.match(commandText(spec), /either audit flag/i);
  assert.match(commandText(spec), /truth-quality audit/i);
  assert.match(commandText(spec), /cross-document consistency audit/i);
  assert.match(commandText(spec), /Roadmap vs Current Cycle active markers/i);
  assert.match(commandText(spec), /findings are advisory/i);
  assert.match(commandText(spec), /planning pages, project docs, managed runbooks, and curated workspace\/template docs/i);
  assert.match(commandText(spec), /excludes raw secret\/token body inspection/i);
  assert.match(commandText(spec), /does not mutate Notion/i);
  assert.ok(command);
  assert.deepEqual(command.auditFlags, ["truth-audit", "consistency-audit"]);
  assert.deepEqual(command.npmScripts, ["doctor", "truth-audit", "consistency-audit"]);
  assert.equal(command.notionMutation, "none");
  assert.equal(command.localFileWrites, "none");
  assert.equal(command.journalWrites, "none");
  assert.equal(command.truthAudit, "optional-read-only");
  assert.equal(command.consistencyAudit, "optional-advisory-read-only");
  assert.equal(command.staleAfterDaysDefault, 30);
  assert.deepEqual(command.staleAfterDaysCompatibleAuditFlags, [
    "truth-audit",
    "consistency-audit",
  ]);
  assert.deepEqual(command.supportedTruthAuditSurfaces, [
    "planning-page",
    "project-doc",
    "runbook",
    "workspace-doc",
    "template-doc",
  ]);
  assert.deepEqual(command.truthAuditExclusions, [
    "secret-record-body",
    "access-token-body",
  ]);
  assert.deepEqual(command.truthAuditNonGoals, [
    "notion-mutation",
    "local-file-output",
    "sidecar-writes",
    "mutation-journal",
    "auto-fix",
    "semantic-contradiction-detection",
    "rollback",
    "retries",
    "generic-batch-apply",
  ]);
  assert.deepEqual(command.supportedConsistencyAuditRules, [
    "roadmap-current-cycle-active-marker",
    "runbook-reference-resolution",
    "access-structural-reference-resolution",
  ]);
  assert.deepEqual(command.consistencyAuditExclusions, [
    "secret-record-body",
    "access-token-body",
  ]);
  assert.deepEqual(command.consistencyAuditNonGoals, [
    "notion-mutation",
    "local-file-output",
    "sidecar-writes",
    "mutation-journal",
    "auto-fix",
    "top-level-failure-on-advisory-findings",
    "rollback",
    "retries",
    "generic-batch-apply",
  ]);
  assert.equal(packageJson.scripts["consistency-audit"], "node src/cli.mjs doctor --consistency-audit");
  assert.equal(packageJson.scripts["truth-audit"], "node src/cli.mjs doctor --truth-audit");
});

test("scaffold-docs help, capability entry, and npm script are registered", () => {
  const spec = findCommandHelp("scaffold-docs");
  const capabilities = buildCapabilityMap();
  const command = capabilities.commands.find((candidate) => candidate.canonical === "scaffold-docs");

  assert.equal(spec?.canonical, "scaffold-docs");
  assert.equal(spec?.surface, "project-doc-scaffold");
  assert.equal(spec?.authScope, "project-token-optional");
  assert.equal(spec?.mutationMode, "local-file-output");
  assert.match(spec?.usageLines.join("\n") || "", /scaffold-docs --project "Project Name"/);
  assert.match(spec?.usageLines.join("\n") || "", /--output-dir <dir>/);
  assert.match(spec?.notes.join("\n") || "", /Preview-first bootstrap doc scaffolding/);
  assert.match(spec?.notes.join("\n") || "", /prints JSON only/);
  assert.match(spec?.notes.join("\n") || "", /never mutates Notion directly/);
  assert.doesNotMatch(commandText(spec), /--apply/);
  assert.ok(command);
  assert.deepEqual(command, {
    canonical: spec.canonical,
    aliases: spec.aliases,
    summary: spec.summary,
    usageLines: spec.usageLines,
    requiredFlags: spec.requiredFlags,
    optionalFlags: spec.optionalFlags,
    examples: spec.examples,
    notes: spec.notes,
    surface: spec.surface,
    authScope: spec.authScope,
    mutationMode: spec.mutationMode,
    stability: spec.stability,
    contract: spec.contract,
    notionMutation: "none",
    localFileWrites: "output-dir-gated",
    journalWrites: "none",
    supportedScaffoldKinds: ["project-doc", "planning-page"],
    scaffoldTargets: [
      "Root > Overview",
      "Root > Operating Model",
      "Planning > Roadmap",
      "Planning > Current Cycle",
    ],
  });
  assert.equal(packageJson.scripts["scaffold-docs"], "node src/cli.mjs scaffold-docs");
});

test("npm run examples in help capabilities have registered package scripts", () => {
  const capabilities = buildCapabilityMap();
  const packageScripts = new Set(Object.keys(packageJson.scripts));

  for (const command of capabilities.commands) {
    for (const example of command.examples) {
      const match = example.match(/^npm run ([a-z0-9-]+)/);
      if (!match) {
        continue;
      }

      assert.ok(
        packageScripts.has(match[1]),
        `${command.canonical} example references missing npm script ${match[1]}`,
      );
    }
  }
});

test("package scripts align with command registry metadata", () => {
  const capabilities = buildCapabilityMap();
  const packageScriptEntries = Object.entries(packageJson.scripts);
  const releaseGateScripts = new Set([
    "test",
    "package-contract",
    "test:package-contract",
    "release-audit",
    "release-governance",
    "release-check",
  ]);
  const registryScriptTargets = new Map();
  const registryMetadataScripts = new Map();

  for (const command of capabilities.commands) {
    for (const script of [command.canonical, ...command.aliases]) {
      if (script.includes(" ")) {
        continue;
      }

      registryScriptTargets.set(script, command.canonical);
    }

    for (const script of command.contract?.npmScripts || []) {
      registryMetadataScripts.set(script, command.canonical);
      assert.ok(
        packageJson.scripts[script],
        `${command.canonical} metadata references missing npm script ${script}`,
      );
    }
  }

  for (const [script, commandLine] of packageScriptEntries) {
    if (releaseGateScripts.has(script)) {
      continue;
    }

    assert.doesNotMatch(script, /validation-bundle/i);
    assert.doesNotMatch(commandLine, /validation-bundle/i);

    const canonical = registryScriptTargets.get(script);
    if (canonical) {
      assert.equal(commandLine, `node src/cli.mjs ${canonical}`);
      continue;
    }

    assert.ok(
      registryMetadataScripts.has(script),
      `${script} package script is not represented by command registry aliases or npmScripts metadata`,
    );
  }

  assert.equal(packageJson.scripts["truth-audit"], "node src/cli.mjs doctor --truth-audit");
  assert.equal(packageJson.scripts["consistency-audit"], "node src/cli.mjs doctor --consistency-audit");
  assert.equal(registryMetadataScripts.get("truth-audit"), "doctor");
  assert.equal(registryMetadataScripts.get("consistency-audit"), "doctor");
});

test("capability map preserves all registry metadata fields", () => {
  const capabilities = buildCapabilityMap();
  const baseFields = new Set([
    "canonical",
    "aliases",
    "summary",
    "usageLines",
    "requiredFlags",
    "optionalFlags",
    "examples",
    "notes",
    "surface",
    "authScope",
    "mutationMode",
    "stability",
  ]);

  for (const command of capabilities.commands) {
    const spec = findCommandHelp(command.canonical);

    for (const [field, value] of Object.entries(spec)) {
      if (baseFields.has(field)) {
        continue;
      }

      assert.deepEqual(
        command[field],
        value,
        `${command.canonical} capability omitted registry metadata field ${field}`,
      );
    }
  }
});

test("secret-bearing access help and capabilities document consume-only output", () => {
  const secretPull = findCommandHelp("secret-record pull");
  const secretExec = findCommandHelp("secret-record exec");
  const secretGenerate = findCommandHelp("secret-record generate");
  const tokenPull = findCommandHelp("access-token pull");
  const tokenExec = findCommandHelp("access-token exec");
  const tokenGenerate = findCommandHelp("access-token generate");
  const secretDiff = findCommandHelp("secret-record diff");
  const capabilities = buildCapabilityMap();
  const secretPullCapability = capabilities.commands.find((command) => command.canonical === "secret-record pull");
  const secretExecCapability = capabilities.commands.find((command) => command.canonical === "secret-record exec");
  const secretGenerateCapability = capabilities.commands.find((command) => command.canonical === "secret-record generate");
  const secretDiffCapability = capabilities.commands.find((command) => command.canonical === "secret-record diff");

  assert.ok(secretPull);
  assert.ok(secretExec);
  assert.ok(secretGenerate);
  assert.ok(tokenPull);
  assert.ok(tokenExec);
  assert.ok(tokenGenerate);
  assert.ok(secretDiff);
  assert.doesNotMatch(commandText(secretPull), /--raw-secret-output/);
  assert.doesNotMatch(commandText(secretPull), /--allow-repo-secret-output/);
  assert.doesNotMatch(commandText(secretPull), /\.snpm\/secrets/);
  assert.match(commandText(secretPull), /redacted-only|redacted by default/i);
  assert.match(commandText(secretPull), /exec/i);
  assert.doesNotMatch(commandText(tokenPull), /--raw-secret-output/);
  assert.match(commandText(secretExec), /--env-name ENV_NAME/);
  assert.match(commandText(secretExec), /--stdin-secret/);
  assert.match(commandText(secretExec), / -- <command> \[args\.\.\.\]/);
  assert.match(commandText(tokenExec), /--env-name ENV_NAME/);
  assert.match(commandText(secretGenerate), /--mode <create\|update>/);
  assert.match(commandText(secretGenerate), / -- <generator-command> \[args\.\.\.\]/);
  assert.match(commandText(secretGenerate), /Preview mode does not run the child generator/i);
  assert.doesNotMatch(commandText(secretGenerate), /--file <file\|->/);
  assert.doesNotMatch(commandText(secretGenerate), /--output/);
  assert.match(commandText(tokenGenerate), /write-only|without local raw export/i);
  assert.match(commandText(secretDiff), /Unsupported/i);
  assert.equal(secretPullCapability.secretOutput, "redacted-only");
  assert.equal(secretPullCapability.rawSecretExport, "unsupported");
  assert.equal(secretPullCapability.localSecretPersistence, "unsupported");
  assert.equal(secretPullCapability.rawSecretOutput, undefined);
  assert.equal(secretPullCapability.repoSecretOutputGuard, undefined);
  assert.equal(secretPullCapability.reviewOutputRedaction, "secret-bearing-surfaces-redacted");
  assert.equal(secretPullCapability.secretConsumption, "exec-only");
  assert.equal(secretExecCapability.secretConsumption, "exec-only");
  assert.deepEqual(secretExecCapability.secretDeliveryModes, ["env", "stdin"]);
  assert.equal(secretExecCapability.childProcessExecution, "shell-false");
  assert.equal(secretExecCapability.childOutputRedaction, "exact-secret-redaction-fail-closed");
  assert.equal(secretGenerateCapability.generatedSecretIngestion, "write-only");
  assert.equal(secretGenerateCapability.rawSecretInput, "child-stdout-only");
  assert.equal(secretGenerateCapability.rawSecretArgvInput, "unsupported");
  assert.equal(secretGenerateCapability.localFileWrites, "none");
  assert.equal(secretGenerateCapability.generatorExecution, "apply-only-shell-false");
  assert.equal(secretDiffCapability.supported, false);
  assert.equal(secretDiffCapability.replacementCommand, "secret-record exec");
  assert.equal(packageJson.scripts["secret-record-exec"], "node src/cli.mjs secret-record exec");
  assert.equal(packageJson.scripts["secret-record-generate"], "node src/cli.mjs secret-record generate");
  assert.equal(packageJson.scripts["access-token-exec"], "node src/cli.mjs access-token exec");
  assert.equal(packageJson.scripts["access-token-generate"], "node src/cli.mjs access-token generate");
  assert.equal(packageJson.scripts["secret-record-diff"], "node src/cli.mjs secret-record diff");
  assert.equal(packageJson.scripts["secret-record-push"], "node src/cli.mjs secret-record push");
  assert.equal(packageJson.scripts["access-token-diff"], "node src/cli.mjs access-token diff");
  assert.equal(packageJson.scripts["access-token-push"], "node src/cli.mjs access-token push");
});

test("secret help and capabilities do not advertise deprecated raw secret output flags", () => {
  const publicHelpText = [
    usage(),
    commandUsage("secret-record"),
    commandUsage("secret-record pull"),
    commandUsage("secret-record generate"),
    commandUsage("access-token"),
    commandUsage("access-token pull"),
    commandUsage("access-token generate"),
  ].join("\n");
  const capabilitiesText = capabilityJson();
  const publicDiscoveryText = `${publicHelpText}\n${capabilitiesText}`;
  const capabilities = buildCapabilityMap();
  const secretPullCapability = capabilities.commands.find((command) => command.canonical === "secret-record pull");
  const tokenPullCapability = capabilities.commands.find((command) => command.canonical === "access-token pull");
  const secretGenerateCapability = capabilities.commands.find((command) => command.canonical === "secret-record generate");
  const tokenGenerateCapability = capabilities.commands.find((command) => command.canonical === "access-token generate");

  assert.doesNotMatch(publicDiscoveryText, /--raw-secret-output/);
  assert.doesNotMatch(publicDiscoveryText, /--allow-repo-secret-output/);
  assert.doesNotMatch(publicDiscoveryText, /\.snpm[\\/]secrets/i);
  assert.doesNotMatch(capabilitiesText, /"rawSecretOutput"/);
  assert.doesNotMatch(capabilitiesText, /"repoSecretOutputGuard"/);
  assert.match(publicHelpText, /secret-record exec/);
  assert.match(publicHelpText, /access-token exec/);
  assert.match(publicHelpText, /secret-record generate/);
  assert.match(publicHelpText, /access-token generate/);
  assert.equal(secretPullCapability?.rawSecretExport, "unsupported");
  assert.equal(tokenPullCapability?.rawSecretExport, "unsupported");
  assert.equal(secretGenerateCapability?.rawSecretExport, "unsupported");
  assert.equal(tokenGenerateCapability?.rawSecretExport, "unsupported");
  assert.equal(secretGenerateCapability?.rawSecretArgvInput, "unsupported");
  assert.equal(tokenGenerateCapability?.rawSecretArgvInput, "unsupported");
});

test("pull command help documents stdout body and stderr metadata streaming mode", () => {
  const streamingPullCommands = [
    "doc pull",
    "page pull",
    "access-domain pull",
    "runbook pull",
    "build-record pull",
    "validation-session pull",
  ];

  for (const command of streamingPullCommands) {
    const text = commandUsage(command);

    assert.match(text, /--output <file\|->/, `${command} should advertise file-or-stdout output`);
    assert.match(text, /--metadata-output <path>/, `${command} should advertise explicit streamed metadata output`);
    assert.match(text, /markdown body is written to stdout and the structured metadata is written to stderr/i);
  }

  const secretPullText = commandUsage("secret-record pull");
  const tokenPullText = commandUsage("access-token pull");

  assert.match(secretPullText, /--output <file\|->/);
  assert.match(secretPullText, /redacted-only/i);
  assert.doesNotMatch(secretPullText, /--metadata-output <path>/);
  assert.match(tokenPullText, /--output <file\|->/);
  assert.match(tokenPullText, /redacted-only/i);
  assert.doesNotMatch(tokenPullText, /--metadata-output <path>/);
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
    writeFileSync(manifestPath, `${JSON.stringify({
      version: 2,
      workspace: "infrastructure-hq.example",
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
      env: publicWorkspaceConfigEnv({ [missingTokenEnv]: "" }),
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
  assert.ok(planChange?.optionalFlags.includes("--manifest-draft"));
  assert.match(planChange?.notes.join("\n") || "", /prints JSON only/);
  assert.match(planChange?.notes.join("\n") || "", /read-only routing surface/i);
  assert.equal(planChange?.manifestDraft, "optional-read-only-planner-mode");
  assert.deepEqual(planChange?.plannerModes, ["routing", "manifest-draft"]);

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

test("withMutationJournal records generated secret mutations without raw material", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-cli-generated-journal-"));
  const journalPath = path.join(tempDir, "journal.ndjson");
  const previousJournalPath = process.env.SNPM_JOURNAL_PATH;
  const sentinel = "postgres://sentinel-secret@example.invalid/db";
  process.env.SNPM_JOURNAL_PATH = journalPath;

  try {
    const result = withMutationJournal({
      applied: true,
      authMode: "project-token",
      generatedSecretStored: true,
      pageId: "secret-page",
      projectId: "project-page",
      redactedChange: "raw-value-created",
      targetPath: "Projects > SNPM > Access > App & Backend > DATABASE_URL",
      timestamp: "2026-04-25T12:00:00.000Z",
    }, {
      command: "secret-record-generate",
      surface: "secret-record",
    });

    assert.deepEqual(result.journal, { path: journalPath });
    const rawJournal = readFileSync(journalPath, "utf8");
    assert.doesNotMatch(rawJournal, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(rawJournal, /postgres:\/\/|Raw Value|stdout|stderr|childArgs|generator/);
    const entry = JSON.parse(rawJournal.trim());
    assert.equal(entry.command, "secret-record-generate");
    assert.equal(entry.surface, "secret-record");
    assert.equal(entry.targetPath, "Projects > SNPM > Access > App & Backend > DATABASE_URL");
    assert.equal(entry.pageId, "secret-page");
    assert.equal(entry.authMode, "project-token");
    assert.equal(entry.revision, null);
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
  assert.deepEqual(resolveHelpRequest(["sync", "--help"]), {
    type: "command",
    command: "sync",
  });
  assert.deepEqual(resolveHelpRequest(["help", "doc"]), {
    type: "command",
    command: "doc",
  });
  assert.deepEqual(resolveHelpRequest(["page", "--help"]), {
    type: "command",
    command: "page",
  });
  assert.deepEqual(resolveHelpRequest(["help", "runbook"]), {
    type: "command",
    command: "runbook",
  });
  assert.deepEqual(resolveHelpRequest(["secret-record", "--help"]), {
    type: "command",
    command: "secret-record",
  });
  assert.deepEqual(resolveHelpRequest(["help", "secret-record-generate"]), {
    type: "command",
    command: "secret-record generate",
  });
  assert.deepEqual(resolveHelpRequest(["access-token", "generate", "--help"]), {
    type: "command",
    command: "access-token generate",
  });
  assert.deepEqual(resolveHelpRequest(["validation-session", "--help"]), {
    type: "command",
    command: "validation-session",
  });
  assert.deepEqual(resolveHelpRequest(["verify-project", "--help"]), {
    type: "command",
    command: "verify-project",
  });
  assert.deepEqual(resolveHelpRequest(["help", "page-push"]), {
    type: "command",
    command: "page push",
  });
  assert.deepEqual(resolveHelpRequest(["validation-bundle", "verify", "--help"]), {
    type: "unknown",
    command: "validation-bundle verify",
  });
  assert.deepEqual(resolveHelpRequest(["plan-change", "--help"]), {
    type: "command",
    command: "plan-change",
  });
  assert.deepEqual(resolveHelpRequest(["scaffold-docs", "--help"]), {
    type: "command",
    command: "scaffold-docs",
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

  const truthAuditParsed = parseArgs([
    "doctor",
    "--truth-audit",
    "--stale-after-days",
    "45",
    "--project",
    "SNPM",
  ]);

  assert.equal(truthAuditParsed.command, "doctor");
  assert.equal(truthAuditParsed.options["truth-audit"], true);
  assert.equal(truthAuditParsed.options["stale-after-days"], "45");
  assert.equal(truthAuditParsed.options.project, "SNPM");

  const consistencyAuditParsed = parseArgs([
    "doctor",
    "--consistency-audit",
    "--stale-after-days",
    "45",
    "--project",
    "SNPM",
  ]);

  assert.equal(consistencyAuditParsed.command, "doctor");
  assert.equal(consistencyAuditParsed.options["consistency-audit"], true);
  assert.equal(consistencyAuditParsed.options["stale-after-days"], "45");
  assert.equal(consistencyAuditParsed.options.project, "SNPM");
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
  const generatedParsed = parseArgs([
    "secret-record",
    "generate",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "DATABASE_URL",
    "--mode",
    "create",
    "--apply",
    "--",
    "node",
    "scripts/generate-dsn.mjs",
  ]);

  assert.equal(domainParsed.command, "access-domain create");
  assert.equal(domainParsed.options.title, "App & Backend");
  assert.equal(secretParsed.command, "secret-record push");
  assert.equal(secretParsed.options.domain, "App & Backend");
  assert.equal(secretParsed.options.apply, true);
  assert.equal(tokenParsed.command, "access-token adopt");
  assert.equal(tokenParsed.options.domain, "App & Backend");
  assert.equal(tokenParsed.options.apply, true);
  assert.equal(generatedParsed.command, "secret-record generate");
  assert.equal(generatedParsed.options.mode, "create");
  assert.equal(generatedParsed.options.apply, true);
  assert.deepEqual(generatedParsed.options.passthroughArgs, ["node", "scripts/generate-dsn.mjs"]);
});

test("parseArgs recognizes deprecated raw secret flags for runtime rejection", () => {
  const rawPullParsed = parseArgs([
    "secret-record",
    "pull",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "GEMINI_API_KEY",
    "--output",
    ".snpm/secrets/secret-record.md",
    "--raw-secret-output",
    "--allow-repo-secret-output",
  ]);
  assert.equal(rawPullParsed.command, "secret-record pull");
  assert.equal(rawPullParsed.options["raw-secret-output"], true);
  assert.equal(rawPullParsed.options["allow-repo-secret-output"], true);
});

test("parseArgs supports literal passthrough only for secret exec and generate commands", () => {
  const secretParsed = parseArgs([
    "secret-record",
    "exec",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "GEMINI_API_KEY",
    "--env-name",
    "GEMINI_API_KEY",
    "--cwd",
    "C:\\repo",
    "--",
    "node",
    "-e",
    "console.log(process.env.GEMINI_API_KEY)",
    "--child-flag",
  ]);
  const tokenParsed = parseArgs([
    "access-token-exec",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "SNPM_NOTION_TOKEN",
    "--stdin-secret",
    "--",
    "--version",
  ]);
  const generateParsed = parseArgs([
    "access-token-generate",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "Project Token",
    "--mode",
    "update",
    "--",
    "node",
    "scripts/generate-token.mjs",
  ]);

  assert.equal(secretParsed.command, "secret-record exec");
  assert.equal(secretParsed.options.project, "SNPM");
  assert.equal(secretParsed.options["env-name"], "GEMINI_API_KEY");
  assert.equal(secretParsed.options.cwd, "C:\\repo");
  assert.deepEqual(secretParsed.options.passthroughArgs, [
    "node",
    "-e",
    "console.log(process.env.GEMINI_API_KEY)",
    "--child-flag",
  ]);
  assert.equal(tokenParsed.command, "access-token-exec");
  assert.equal(tokenParsed.options["stdin-secret"], true);
  assert.deepEqual(tokenParsed.options.passthroughArgs, ["--version"]);
  assert.equal(generateParsed.command, "access-token-generate");
  assert.equal(generateParsed.options.mode, "update");
  assert.deepEqual(generateParsed.options.passthroughArgs, ["node", "scripts/generate-token.mjs"]);

  assert.throws(
    () => parseArgs([
      "doctor",
      "--project",
      "SNPM",
      "--",
      "node",
    ]),
    /literal -- child-command delimiter is only supported for secret-record exec\/generate and access-token exec\/generate/i,
  );

  assert.throws(
    () => parseArgs([
      "secret-record",
      "exec",
      "--project",
      "SNPM",
      "--domain",
      "App & Backend",
      "--title",
      "GEMINI_API_KEY",
      "--env-name",
      "GEMINI_API_KEY",
      "--",
    ]),
    /Provide a child command after -- for secret-record exec/i,
  );
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
    "C:\\example-project\\snpm.sync.json",
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
  assert.equal(parsed.options.manifest, "C:\\example-project\\snpm.sync.json");
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
  const discoverParsed = parseArgs([
    "discover",
    "--project",
    "SNPM",
    "--project-token-env",
    "SNPM_NOTION_TOKEN",
  ]);
  const planChangeParsed = parseArgs([
    "plan-change",
    "--targets-file",
    "-",
    "--project",
    "SNPM",
    "--manifest-draft",
  ]);
  const journalListParsed = parseArgs([
    "journal",
    "list",
    "--limit",
    "5",
  ]);
  const scaffoldParsed = parseArgs([
    "scaffold-docs",
    "--project",
    "SNPM",
    "--project-token-env",
    "SNPM_NOTION_TOKEN",
    "--output-dir",
    ".snpm-scaffold",
  ]);

  assert.equal(discoverParsed.command, "discover");
  assert.equal(discoverParsed.options.project, "SNPM");
  assert.equal(discoverParsed.options["project-token-env"], "SNPM_NOTION_TOKEN");
  assert.equal(planChangeParsed.command, "plan-change");
  assert.equal(planChangeParsed.options["targets-file"], "-");
  assert.equal(planChangeParsed.options.project, "SNPM");
  assert.equal(planChangeParsed.options["manifest-draft"], true);
  assert.equal(journalListParsed.command, "journal list");
  assert.equal(journalListParsed.options.limit, "5");
  assert.equal(scaffoldParsed.command, "scaffold-docs");
  assert.equal(scaffoldParsed.options.project, "SNPM");
  assert.equal(scaffoldParsed.options["project-token-env"], "SNPM_NOTION_TOKEN");
  assert.equal(scaffoldParsed.options["output-dir"], ".snpm-scaffold");
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

test("cli family-level help resolves supported command families", () => {
  const families = [
    ["sync", /sync <check\|pull\|push>/],
    ["doc", /doc <create\|adopt\|pull\|diff\|push\|edit>/],
    ["page", /page <pull\|diff\|push\|edit>/],
    ["runbook", /runbook <create\|adopt\|pull\|diff\|push\|edit>/],
    ["validation-session", /validation-session <create\|adopt\|pull\|diff\|push>/],
  ];

  for (const [family, usagePattern] of families) {
    const helpFlagResult = runCli([family, "--help"]);
    const helpCommandResult = runCli(["help", family]);

    assert.equal(helpFlagResult.status, 0, `${family} --help should exit successfully`);
    assert.match(helpFlagResult.stdout, new RegExp(`Command: ${family}`));
    assert.match(helpFlagResult.stdout, usagePattern);
    assert.match(helpFlagResult.stdout, /Use the subcommand help for exact required flags and mutation boundaries/);
    assert.equal(helpFlagResult.stderr, "");

    assert.equal(helpCommandResult.status, 0, `help ${family} should exit successfully`);
    assert.match(helpCommandResult.stdout, new RegExp(`Command: ${family}`));
    assert.match(helpCommandResult.stdout, usagePattern);
    assert.equal(helpCommandResult.stderr, "");
  }
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

test("cli validation-bundle help fails as an unknown command", () => {
  const result = runCli(["validation-bundle", "preview", "--help"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command: validation-bundle preview/);
  assert.match(result.stdout, /node src\/cli\.mjs <command> \[options\]/);
  assert.doesNotMatch(result.stdout, /Command: validation-bundle preview/);
});

test("cli plan-change and journal-list help print command help", () => {
  const planChangeResult = runCli(["plan-change", "--help"]);
  const journalListResult = runCli(["help", "journal-list"]);

  assert.equal(planChangeResult.status, 0);
  assert.match(planChangeResult.stdout, /Command: plan-change/);
  assert.match(planChangeResult.stdout, /--targets-file <path\|->/);
  assert.match(planChangeResult.stdout, /--manifest-draft/);
  assert.match(planChangeResult.stdout, /read-only routing surface/i);
  assert.equal(planChangeResult.stderr, "");

  assert.equal(journalListResult.status, 0);
  assert.match(journalListResult.stdout, /Command: journal list/);
  assert.match(journalListResult.stdout, /Aliases:\n  journal-list/);
  assert.equal(journalListResult.stderr, "");
});

test("cli plan-change --manifest-draft reads stdin targets-file before live routing", () => {
  const result = runCli(["plan-change", "--targets-file", "-", "--manifest-draft"], {
    input: "{not-json",
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /plan-change targets file is not valid JSON/);
  assert.doesNotMatch(result.stderr, /Missing value for --manifest-draft/);
});

test("cli plan-change --manifest-draft prints contract-validated JSON only", async () => {
  const result = runCli([
    "plan-change",
    "--targets-file",
    "-",
    "--manifest-draft",
    "--project",
    "SNPM",
    "--workspace",
    "infrastructure-hq.example",
  ], {
    input: `${JSON.stringify({
      goal: "Prepare a repo-owned implementation note.",
      targets: [{
        type: "implementation-note",
        repoPath: "notes/sprint-1f.md",
      }],
    })}\n`,
    env: publicWorkspaceConfigEnv(),
  });
  const parsed = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, "plan-change");
  assert.equal(parsed.projectName, "SNPM");
  assert.deepEqual(parsed.manifestDraft, {
    version: 2,
    workspace: "infrastructure-hq.example",
    project: "SNPM",
    entries: [],
  });
  assert.deepEqual(parsed.manifestUnsupportedTargets, [{
    index: 0,
    type: "implementation-note",
    reason: "Repo-owned targets are not Notion manifest entries.",
    repoPath: "notes/sprint-1f.md",
    projectName: "SNPM",
  }]);
  await assertJsonContractPayload("snpm.plan-change.v1", parsed);
});

test("cli discover help prints first-contact command help", () => {
  const result = runCli(["discover", "--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Command: discover/);
  assert.match(result.stdout, /--project "Project Name"/);
  assert.match(result.stdout, /C:\\SNPM/);
  assert.match(result.stdout, /snpm discover --project "Project Name"/);
  assert.match(result.stdout, /source-checkout npm script commands/);
  assert.match(result.stdout, /does not read Notion/);
  assert.equal(result.stderr, "");
});

test("cli help process output exposes source checkout and installed CLI usage", () => {
  const globalResult = runCli(["--help"]);
  const commandResult = runCli(["verify-project", "--help"]);

  assert.equal(globalResult.status, 0);
  assert.equal(globalResult.stderr, "");
  assert.match(globalResult.stdout, /node src\/cli\.mjs <command> \[options\]/);
  assert.match(globalResult.stdout, /snpm <command> \[options\]/);
  assert.match(globalResult.stdout, /npm run verify-project/);
  assert.match(globalResult.stdout, /snpm verify-project --help/);

  assert.equal(commandResult.status, 0);
  assert.equal(commandResult.stderr, "");
  assert.match(commandResult.stdout, /Command: verify-project/);
  assert.match(commandResult.stdout, /node src\/cli\.mjs verify-project --name "Project Name"/);
  assert.match(commandResult.stdout, /snpm verify-project --name "Project Name"/);
  assert.match(commandResult.stdout, /npm run verify-project/);
});

test("cli discover prints compact JSON first-contact guidance without side effects", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-discover-test-"));
  const journalPath = path.join(tempDir, "journal.ndjson");
  try {
    const result = runCli(["discover", "--project", "SNPM", "--project-token-env", "SNPM_NOTION_TOKEN"], {
      env: {
        SNPM_JOURNAL_PATH: journalPath,
      },
    });
    const parsed = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.ok(result.stdout.length < 8000, `discover output should stay compact, got ${result.stdout.length} chars`);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.command, "discover");
    assert.match(parsed.snpm.identity, /Infrastructure HQ Notion control repo/);
    assert.equal(parsed.snpm.runContext, "C:\\SNPM");
    assert.equal(parsed.snpm.project, "SNPM");
    assert.equal(parsed.snpm.projectTokenEnv, "SNPM_NOTION_TOKEN");
    assert.match(parsed.boundaries.noVendoring, /Do not vendor SNPM scripts/);
    assert.equal(
      parsed.commandForms.sourceCheckout.firstContactCommand,
      'npm run discover -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
    );
    assert.equal(
      parsed.commandForms.installedCli.firstContactCommand,
      'snpm discover --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
    );
    assert.equal(
      parsed.commandForms.sourceCheckout.safeFirstCommands[0].command,
      'npm run doctor -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
    );
    assert.equal(
      parsed.commandForms.installedCli.safeFirstCommands[0].command,
      'snpm doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
    );
    assert.match(JSON.stringify(parsed.safeFirstCommands), /doctor/);
    assert.match(JSON.stringify(parsed.safeFirstCommands), /recommend/);
    assert.match(JSON.stringify(parsed.safeFirstCommands), /plan-change/);
    assert.match(JSON.stringify(parsed.mutationLoop), /Pull/);
    assert.match(JSON.stringify(parsed.notes), /does not read Notion/);
    assert.equal(existsSync(journalPath), false);
    await assertJsonContractPayload("snpm.discover.v1", parsed);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("cli scaffold-docs help prints registry-only command help", () => {
  const result = runCli(["scaffold-docs", "--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Command: scaffold-docs/);
  assert.match(result.stdout, /Preview-first bootstrap doc scaffolding/);
  assert.match(result.stdout, /--output-dir <dir>/);
  assert.match(result.stdout, /never mutates Notion directly/);
  assert.doesNotMatch(result.stdout, /--apply/);
  assert.equal(result.stderr, "");
});

test("cli doctor help documents read-only advisory audits", () => {
  const result = runCli(["doctor", "--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Command: doctor/);
  assert.match(result.stdout, /--truth-audit/);
  assert.match(result.stdout, /--consistency-audit/);
  assert.match(result.stdout, /--stale-after-days <positive integer>/);
  assert.match(result.stdout, /defaults to 30/i);
  assert.match(result.stdout, /either audit flag/i);
  assert.match(result.stdout, /advisory/i);
  assert.match(result.stdout, /Roadmap vs Current Cycle active markers/i);
  assert.match(result.stdout, /does not mutate Notion/i);
  assert.match(result.stdout, /raw secret\/token body inspection/i);
  assert.equal(result.stderr, "");
});

test("cli secret-bearing help documents consume-only exec guidance", () => {
  const secretFamilyResult = runCli(["secret-record", "--help"]);
  const secretResult = runCli(["secret-record", "pull", "--help"]);
  const secretExecResult = runCli(["secret-record", "exec", "--help"]);
  const secretGenerateResult = runCli(["secret-record", "generate", "--help"]);
  const tokenFamilyResult = runCli(["access-token", "--help"]);
  const tokenResult = runCli(["access-token", "pull", "--help"]);
  const tokenExecResult = runCli(["access-token", "exec", "--help"]);
  const tokenGenerateResult = runCli(["access-token", "generate", "--help"]);

  assert.equal(secretFamilyResult.status, 0);
  assert.match(secretFamilyResult.stdout, /Command: secret-record/);
  assert.match(secretFamilyResult.stdout, /secret-record generate/i);
  assert.match(secretFamilyResult.stdout, /write-only generated secret ingestion/i);
  assert.equal(secretFamilyResult.stderr, "");

  assert.equal(secretResult.status, 0);
  assert.doesNotMatch(secretResult.stdout, /--raw-secret-output/);
  assert.doesNotMatch(secretResult.stdout, /--allow-repo-secret-output/);
  assert.match(secretResult.stdout, /redacted-only|redacted by default/i);
  assert.match(secretResult.stdout, /exec/i);
  assert.equal(secretResult.stderr, "");

  assert.equal(tokenResult.status, 0);
  assert.doesNotMatch(tokenResult.stdout, /--raw-secret-output/);
  assert.match(tokenResult.stdout, /redacted-only|redacted by default/i);
  assert.equal(tokenResult.stderr, "");

  assert.equal(secretExecResult.status, 0);
  assert.match(secretExecResult.stdout, /Command: secret-record exec/);
  assert.match(secretExecResult.stdout, /--env-name ENV_NAME/);
  assert.match(secretExecResult.stdout, /--stdin-secret/);
  assert.match(secretExecResult.stdout, / -- <command> \[args\.\.\.\]/);
  assert.equal(secretExecResult.stderr, "");

  assert.equal(secretGenerateResult.status, 0);
  assert.match(secretGenerateResult.stdout, /Command: secret-record generate/);
  assert.match(secretGenerateResult.stdout, /--mode <create\|update>/);
  assert.match(secretGenerateResult.stdout, / -- <generator-command> \[args\.\.\.\]/);
  assert.match(secretGenerateResult.stdout, /Preview mode does not run the child generator/i);
  assert.doesNotMatch(secretGenerateResult.stdout, /--raw-secret-output/);
  assert.equal(secretGenerateResult.stderr, "");

  assert.equal(tokenFamilyResult.status, 0);
  assert.match(tokenFamilyResult.stdout, /Command: access-token/);
  assert.match(tokenFamilyResult.stdout, /access-token generate/i);
  assert.equal(tokenFamilyResult.stderr, "");

  assert.equal(tokenExecResult.status, 0);
  assert.match(tokenExecResult.stdout, /Command: access-token exec/);
  assert.match(tokenExecResult.stdout, /--env-name ENV_NAME/);
  assert.equal(tokenExecResult.stderr, "");

  assert.equal(tokenGenerateResult.status, 0);
  assert.match(tokenGenerateResult.stdout, /Command: access-token generate/);
  assert.match(tokenGenerateResult.stdout, /child generator/i);
  assert.equal(tokenGenerateResult.stderr, "");
});

test("npm scripts for secret and access child commands dispatch to command help", () => {
  const scripts = [
    ["secret-record-exec", /Command: secret-record exec/, / -- <command> \[args\.\.\.\]/],
    ["secret-record-generate", /Command: secret-record generate/, / -- <generator-command> \[args\.\.\.\]/],
    ["access-token-exec", /Command: access-token exec/, / -- <command> \[args\.\.\.\]/],
    ["access-token-generate", /Command: access-token generate/, / -- <generator-command> \[args\.\.\.\]/],
  ];

  for (const [script, commandPattern, childPattern] of scripts) {
    const result = runNpmScript(script, ["--help"]);

    assert.equal(result.status, 0, `${script} --help should exit successfully`);
    assert.match(result.stdout, commandPattern);
    assert.match(result.stdout, childPattern);
    assert.equal(result.stderr, "");
  }
});

test("cli deprecated raw secret flags fail with exec-only guidance", () => {
  const secretResult = runCli([
    "secret-record",
    "pull",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "GEMINI_API_KEY",
    "--output",
    "-",
    "--raw-secret-output",
  ]);
  const tokenResult = runCli([
    "access-token",
    "pull",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "SNPM_NOTION_TOKEN",
    "--output",
    "-",
    "--allow-repo-secret-output",
  ]);

  assert.equal(secretResult.status, 1);
  assert.equal(secretResult.stdout, "");
  assert.match(secretResult.stderr, /--raw-secret-output (?:is no longer supported|is unsupported)/i);
  assert.match(secretResult.stderr, /secret-record exec(?: or |\/)access-token exec/i);

  assert.equal(tokenResult.status, 1);
  assert.equal(tokenResult.stdout, "");
  assert.match(tokenResult.stderr, /--allow-repo-secret-output (?:is no longer supported|is unsupported)/i);
  assert.match(tokenResult.stderr, /raw secret export/i);
});

test("cli rejects passthrough delimiter outside secret child commands and requires child command", () => {
  const nonExecResult = runCli([
    "doctor",
    "--project",
    "SNPM",
    "--",
    "node",
  ]);
  const execWithoutChild = runCli([
    "secret-record",
    "exec",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "GEMINI_API_KEY",
    "--env-name",
    "GEMINI_API_KEY",
  ]);
  const generateWithoutChild = runCli([
    "access-token",
    "generate",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "Project Token",
    "--mode",
    "create",
  ]);
  const generateWithLocalInput = runCli([
    "secret-record",
    "generate",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "DATABASE_URL",
    "--mode",
    "create",
    "--file",
    "secret.md",
    "--",
    "node",
    "scripts/generate-dsn.mjs",
  ]);
  const sentinel = "postgres://sentinel-secret";
  const generateWithValueFlag = runCli([
    "secret-record",
    "generate",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "DATABASE_URL",
    "--mode",
    "create",
    "--value",
    sentinel,
    "--",
    "node",
    "scripts/generate-dsn.mjs",
  ]);
  const generateWithPositionalSecret = runCli([
    "secret-record",
    "generate",
    "--project",
    "SNPM",
    "--domain",
    "App & Backend",
    "--title",
    "DATABASE_URL",
    "--mode",
    "create",
    sentinel,
    "--",
    "node",
    "scripts/generate-dsn.mjs",
  ]);
  const hyphenatedGenerateWithPositionalSecret = runCli([
    "secret-record-generate",
    sentinel,
  ]);

  assert.equal(nonExecResult.status, 1);
  assert.equal(nonExecResult.stdout, "");
  assert.match(nonExecResult.stderr, /literal -- child-command delimiter is only supported for secret-record exec\/generate and access-token exec\/generate/i);

  assert.equal(execWithoutChild.status, 1);
  assert.equal(execWithoutChild.stdout, "");
  assert.match(execWithoutChild.stderr, /Provide a child command after -- for secret-record exec/i);

  assert.equal(generateWithoutChild.status, 1);
  assert.equal(generateWithoutChild.stdout, "");
  assert.match(generateWithoutChild.stderr, /Provide a child command after -- for access-token generate/i);

  assert.equal(generateWithLocalInput.status, 1);
  assert.equal(generateWithLocalInput.stdout, "");
  assert.match(generateWithLocalInput.stderr, /secret-record generate does not support --file/i);
  assert.match(generateWithLocalInput.stderr, /never reads raw values from local files, stdin, env vars, or output paths/i);

  assert.equal(generateWithValueFlag.status, 1);
  assert.equal(generateWithValueFlag.stdout, "");
  assert.match(generateWithValueFlag.stderr, /secret-record generate does not support --value/i);
  assert.doesNotMatch(generateWithValueFlag.stderr, /sentinel-secret/);

  assert.equal(generateWithPositionalSecret.status, 1);
  assert.equal(generateWithPositionalSecret.stdout, "");
  assert.match(generateWithPositionalSecret.stderr, /Unexpected argument before -- for secret-record generate/i);
  assert.doesNotMatch(generateWithPositionalSecret.stderr, /sentinel-secret/);

  assert.equal(hyphenatedGenerateWithPositionalSecret.status, 1);
  assert.equal(hyphenatedGenerateWithPositionalSecret.stdout, "");
  assert.match(hyphenatedGenerateWithPositionalSecret.stderr, /Unexpected argument before -- for secret-record-generate/i);
  assert.doesNotMatch(hyphenatedGenerateWithPositionalSecret.stderr, /sentinel-secret/);
});

test("cli doctor rejects invalid stale-after-days for audit flags before live doctor execution", () => {
  const invalidValues = ["0", "-1", "abc", "1.5", "30days"];

  for (const auditFlag of ["--truth-audit", "--consistency-audit"]) {
    for (const value of invalidValues) {
      const result = runCli([
        "doctor",
        "--project",
        "SNPM",
        auditFlag,
        "--stale-after-days",
        value,
      ]);

      assert.equal(result.status, 1, `${auditFlag} ${value} should fail`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /--stale-after-days must be a positive integer/);
    }
  }
});

test("cli doctor --consistency-audit reaches the doctor command path", () => {
  const result = runCli([
    "doctor",
    "--project",
    "SNPM",
    "--consistency-audit",
    "--workspace",
    "missing-consistency-audit-test",
  ]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Unknown workspace "missing-consistency-audit-test"/);
  assert.doesNotMatch(result.stderr, /Missing value for --consistency-audit/);
});

test("cli capabilities prints JSON only", async () => {
  const result = runCli(["capabilities"]);
  const parsed = JSON.parse(result.stdout);
  const planChangeCapability = parsed.commands.find((command) => command.canonical === "plan-change");

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(parsed, buildCapabilityMap());
  assert.ok(parsed.canonicalCommands.includes("capabilities"));
  assert.ok(parsed.canonicalCommands.includes("plan-change"));
  assert.ok(parsed.canonicalCommands.includes("scaffold-docs"));
  assert.ok(parsed.canonicalCommands.includes("sync"));
  assert.ok(parsed.canonicalCommands.includes("journal list"));
  assert.equal(parsed.commands.find((command) => command.canonical === "doctor")?.truthAudit, "optional-read-only");
  assert.equal(parsed.commands.find((command) => command.canonical === "doctor")?.consistencyAudit, "optional-advisory-read-only");
  assert.ok(parsed.commands.find((command) => command.canonical === "doctor")?.auditFlags.includes("consistency-audit"));
  assert.ok(parsed.commands.find((command) => command.canonical === "doctor")?.npmScripts.includes("consistency-audit"));
  assert.deepEqual(parsed.commands.find((command) => command.canonical === "capabilities")?.jsonContracts, ["snpm.capabilities.v1.minimal"]);
  assert.deepEqual(parsed.commands.find((command) => command.canonical === "discover")?.jsonContracts, ["snpm.discover.v1"]);
  assert.deepEqual(planChangeCapability?.jsonContracts, ["snpm.plan-change.v1"]);
  assert.deepEqual(planChangeCapability?.manifestDraftJsonContracts, ["snpm.plan-change.v1"]);
  assert.equal(planChangeCapability?.manifestDraft, "optional-read-only-planner-mode");
  assert.deepEqual(planChangeCapability?.plannerModes, ["routing", "manifest-draft"]);
  assert.deepEqual(planChangeCapability?.manifestDraftEntryKinds, [
    "planning-page",
    "project-doc",
    "template-doc",
    "workspace-doc",
    "runbook",
  ]);
  await assertJsonContractPayload("snpm.capabilities.v1.minimal", parsed);
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

test("cli hyphenated aliases preserve stdout, stderr, exit code, and JSON payloads", () => {
  const journalPath = fileURLToPath(new URL("../.missing-alias-test-journal.ndjson", import.meta.url));
  const env = {
    SNPM_JOURNAL_PATH: journalPath,
  };
  const spacedResult = runCli(["journal", "list", "--limit", "1"], { env });
  const hyphenatedResult = runCli(["journal-list", "--limit", "1"], { env });

  assert.equal(spacedResult.status, 0);
  assert.equal(hyphenatedResult.status, 0);
  assert.equal(spacedResult.stderr, "");
  assert.equal(hyphenatedResult.stderr, "");
  assert.deepEqual(JSON.parse(spacedResult.stdout), JSON.parse(hyphenatedResult.stdout));
  assert.deepEqual(JSON.parse(hyphenatedResult.stdout), {
    ok: true,
    command: "journal-list",
    entries: [],
  });
});

test("cli output modes cover JSON-only, mixed stdout, and stderr-only failures", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-cli-output-modes-"));
  const manifestPath = path.join(tempDir, "snpm.sync.json");
  const markdownPath = path.join(tempDir, "roadmap.md");
  const missingTokenEnv = "SNPM_OUTPUT_MODE_TEST_TOKEN_SHOULD_NOT_EXIST_8A31";

  try {
    const jsonOnly = runCli(["discover", "--project", "SNPM"]);
    const parsedJsonOnly = JSON.parse(jsonOnly.stdout);

    assert.equal(jsonOnly.status, 0);
    assert.equal(jsonOnly.stderr, "");
    assert.equal(parsedJsonOnly.ok, true);
    assert.equal(parsedJsonOnly.command, "discover");

    const stderrOnlyFailure = runCli(["verify-project"]);

    assert.equal(stderrOnlyFailure.status, 1);
    assert.equal(stderrOnlyFailure.stdout, "");
    assert.match(stderrOnlyFailure.stderr, /Provide --name "Project Name"/);

    writeFileSync(markdownPath, "# Local Roadmap\n", "utf8");
    writeFileSync(manifestPath, `${JSON.stringify({
      version: 2,
      workspace: "infrastructure-hq.example",
      project: "SNPM",
      entries: [{
        kind: "planning-page",
        pagePath: "Planning > Roadmap",
        file: "roadmap.md",
      }],
    }, null, 2)}\n`, "utf8");

    const mixedResult = runCli([
      "sync",
      "check",
      "--manifest",
      manifestPath,
      "--project-token-env",
      missingTokenEnv,
    ], {
      env: publicWorkspaceConfigEnv({ [missingTokenEnv]: "" }),
    });
    const mixedPayload = parseJsonPayloadFromMixedStdout(mixedResult.stdout);

    assert.equal(mixedResult.status, 1);
    assert.equal(mixedResult.stderr, "");
    assert.match(mixedResult.stdout, /^\[planning-page\] Planning > Roadmap \(roadmap\.md\)/);
    assert.match(mixedResult.stdout, /Error: (?:Set NOTION_TOKEN|Set INFRASTRUCTURE_HQ_NOTION_TOKEN|GET blocks\/|Local file|ENOENT)/i);
    assert.equal(mixedPayload.ok, false);
    assert.equal(mixedPayload.command, "sync-check");
    assert.equal(mixedPayload.entries[0].status, "error");
    assert.equal(mixedPayload.entries[0].diagnostics[0].code, "manifest-v2-check-local-file-failed");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("cli top-level error format defaults to text and supports env json", async () => {
  const textResult = runCli(["verify-project"]);
  const jsonResult = runCli(["verify-project"], {
    env: {
      SNPM_ERROR_FORMAT: "json",
    },
  });
  const parsed = JSON.parse(jsonResult.stderr);

  assert.equal(textResult.status, 1);
  assert.equal(textResult.stdout, "");
  assert.match(textResult.stderr, /Provide --name "Project Name"/);
  assert.doesNotThrow(() => {
    assert.throws(() => JSON.parse(textResult.stderr));
  });

  assert.equal(jsonResult.status, 1);
  assert.equal(jsonResult.stdout, "");
  assert.deepEqual(parsed, {
    ok: false,
    schemaVersion: 1,
    command: "verify-project",
    error: {
      code: "missing_required_option",
      category: "usage",
      message: 'Provide --name "Project Name".',
    },
  });
  await assertJsonContractPayload("snpm.cli-error.v1", parsed);
});

test("cli --error-format flag wins over SNPM_ERROR_FORMAT", () => {
  const flagJsonResult = runCli([
    "doctor",
    "--project",
    "SNPM",
    "--truth-audit",
    "--stale-after-days",
    "0",
    "--error-format",
    "json",
  ], {
    env: {
      SNPM_ERROR_FORMAT: "text",
    },
  });
  const flagTextResult = runCli([
    "doctor",
    "--project",
    "SNPM",
    "--truth-audit",
    "--stale-after-days",
    "0",
    "--error-format",
    "text",
  ], {
    env: {
      SNPM_ERROR_FORMAT: "json",
    },
  });

  assert.equal(flagJsonResult.status, 1);
  assert.equal(flagJsonResult.stdout, "");
  assert.deepEqual(JSON.parse(flagJsonResult.stderr), {
    ok: false,
    schemaVersion: 1,
    command: "doctor",
    error: {
      code: "cli_error",
      category: "runtime",
      message: "--stale-after-days must be a positive integer.",
    },
  });

  assert.equal(flagTextResult.status, 1);
  assert.equal(flagTextResult.stdout, "");
  assert.match(flagTextResult.stderr, /--stale-after-days must be a positive integer/);
  assert.throws(() => JSON.parse(flagTextResult.stderr));
});

test("cli --error-format scan stops before literal passthrough delimiter", () => {
  const result = runCli([
    "secret-record",
    "exec",
    "--project",
    "SNPM",
    "--",
    "--error-format",
    "json",
  ]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Provide --domain "Access Domain Title"/);
  assert.throws(() => JSON.parse(result.stderr));
});

test("cli invalid --error-format fails before command execution", () => {
  const result = runCli([
    "discover",
    "--project",
    "SNPM",
    "--error-format",
    "xml",
  ]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /--error-format must be json or text/);
});

test("cli invalid SNPM_ERROR_FORMAT fails unless the CLI flag overrides it", () => {
  const invalidEnv = runCli(["verify-project"], {
    env: {
      SNPM_ERROR_FORMAT: "jsn",
    },
  });
  const flagOverride = runCli(["verify-project", "--error-format", "json"], {
    env: {
      SNPM_ERROR_FORMAT: "jsn",
    },
  });

  assert.equal(invalidEnv.status, 1);
  assert.equal(invalidEnv.stdout, "");
  assert.match(invalidEnv.stderr, /SNPM_ERROR_FORMAT must be json or text/);

  assert.equal(flagOverride.status, 1);
  assert.equal(flagOverride.stdout, "");
  assert.deepEqual(JSON.parse(flagOverride.stderr), {
    ok: false,
    schemaVersion: 1,
    command: "verify-project",
    error: {
      code: "missing_required_option",
      category: "usage",
      message: 'Provide --name "Project Name".',
    },
  });
});

test("cli --error-format json covers unknown command, invalid workspace, and invalid manifest failures", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-cli-structured-errors-"));
  try {
    const manifestPath = path.join(tempDir, "snpm.sync.json");
    writeFileSync(manifestPath, "{ invalid manifest json", "utf8");

    const unknownCommand = runCli(["--error-format", "json", "fake-command"]);
    const unknownHelp = runCli(["fake-command", "--help", "--error-format", "json"]);
    const invalidWorkspace = runCli([
      "--error-format",
      "json",
      "doctor",
      "--project",
      "SNPM",
      "--workspace",
      "missing-structured-error-workspace",
    ]);
    const invalidManifest = runCli([
      "--error-format",
      "json",
      "sync",
      "check",
      "--manifest",
      manifestPath,
    ]);

    assertStructuredCliFailure(unknownCommand, {
      category: "usage",
      code: "unknown_command",
      command: "fake-command",
      messagePattern: /Unknown command: fake-command/,
    });
    assertStructuredCliFailure(unknownHelp, {
      category: "usage",
      code: "unknown_command",
      command: "fake-command",
      messagePattern: /Unknown command: fake-command/,
    });
    assertStructuredCliFailure(invalidWorkspace, {
      category: "usage",
      code: "invalid_workspace",
      command: "doctor",
      messagePattern: /Unknown workspace "missing-structured-error-workspace"/,
    });
    assertStructuredCliFailure(invalidManifest, {
      category: "preflight",
      code: "manifest_error",
      command: "sync",
      messagePattern: /Sync manifest ".+snpm\.sync\.json" is not valid JSON\./,
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("cli --error-format json covers metadata sidecar parse failures", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-cli-sidecar-error-"));
  try {
    const manifestPath = path.join(tempDir, "snpm.sync.json");
    const markdownPath = path.join(tempDir, "roadmap.md");
    const sidecarPath = path.join(tempDir, "roadmap.md.snpm-meta.json");

    writeFileSync(markdownPath, "# Local Roadmap\n", "utf8");
    writeFileSync(sidecarPath, "{ invalid sidecar json", "utf8");
    writeFileSync(manifestPath, `${JSON.stringify({
      version: 2,
      workspace: "infrastructure-hq.example",
      project: "SNPM",
      entries: [{
        kind: "planning-page",
        pagePath: "Planning > Roadmap",
        file: "roadmap.md",
      }],
    }, null, 2)}\n`, "utf8");

    const result = runCli([
      "--error-format",
      "json",
      "sync",
      "push",
      "--manifest",
      manifestPath,
      "--apply",
    ], {
      env: publicWorkspaceConfigEnv(),
    });
    const payload = parseJsonPayloadFromMixedStdout(result.stdout);

    assert.equal(result.status, 1);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /^\[planning-page\] Planning > Roadmap \(roadmap\.md\)/);
    assert.match(result.stdout, /Metadata sidecar ".+roadmap\.md\.snpm-meta\.json" is not valid JSON/);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, "sync-push");
    assert.equal(payload.entries[0].status, "error");
    assert.equal(payload.entries[0].diagnostics[0].code, "manifest-v2-push-sidecar-malformed");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("cli opt-in structured errors do not echo generated values or child command material", () => {
  const cases = [
    {
      args: [
        "secret-record",
        "generate",
        "--error-format",
        "json",
        "--project",
        "SNPM",
        "--domain",
        "App & Backend",
        "--title",
        "DATABASE_URL",
        "--mode",
        "create",
        "--value",
        "postgres://structured-error-secret",
        "--",
        process.execPath,
        "-e",
        "process.stdout.write('child-stdout-secret')",
      ],
      leaked: /structured-error-secret|child-stdout-secret/,
    },
    {
      args: [
        "access-token",
        "generate",
        "--project",
        "SNPM",
        "--domain",
        "App & Backend",
        "--title",
        "Project Token",
        "--mode",
        "create",
        "access-token-generated-value",
        "--",
        process.execPath,
        "-e",
        "process.stderr.write('child-stderr-secret')",
      ],
      env: {
        SNPM_ERROR_FORMAT: "json",
      },
      leaked: /access-token-generated-value|child-stderr-secret/,
    },
  ];

  for (const item of cases) {
    const result = runCli(item.args, { env: item.env });
    const structured = JSON.parse(result.stderr);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(structured.ok, false);
    assert.equal(typeof structured.error.message, "string");
    assert.doesNotMatch(result.stderr, item.leaked);
    assert.doesNotMatch(result.stdout, item.leaked);
  }
});

test("cli manifest v2 diagnostics stay in sync payloads when structured top-level errors are enabled", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-cli-structured-manifest-"));
  const manifestPath = path.join(tempDir, "snpm.sync.json");
  const markdownPath = path.join(tempDir, "roadmap.md");
  const missingTokenEnv = "SNPM_STRUCTURED_MANIFEST_TOKEN_SHOULD_NOT_EXIST_2F91";

  try {
    writeFileSync(manifestPath, `${JSON.stringify({
      version: 2,
      workspace: "infrastructure-hq.example",
      project: "SNPM",
      entries: [{
        kind: "planning-page",
        pagePath: "Planning > Roadmap",
        file: "roadmap.md",
      }],
    }, null, 2)}\n`, "utf8");

    const result = runCli([
      "sync",
      "check",
      "--error-format",
      "json",
      "--manifest",
      manifestPath,
      "--project-token-env",
      missingTokenEnv,
    ], {
      env: publicWorkspaceConfigEnv({ [missingTokenEnv]: "" }),
    });
    const payload = parseJsonPayloadFromMixedStdout(result.stdout);

    assert.equal(result.status, 1);
    assert.equal(result.stderr, "");
    assert.equal(payload.ok, false);
    assert.equal(payload.command, "sync-check");
    assert.equal(payload.error, undefined);
    assert.equal(payload.entries[0].diagnostics[0].code, "manifest-v2-check-local-file-failed");
    assert.equal(payload.diagnostics[0].code, "manifest-v2-check-local-file-failed");
    assert.equal(payload.diagnostics[0].command, "sync-check");
    assert.equal(payload.diagnostics[0].state.phase, "check");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("cli unknown command help prints the error plus global help and exits non-zero", () => {
  const result = runCli(["fake-command", "--help"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command: fake-command/);
  assert.match(result.stdout, /node src\/cli\.mjs <command> \[options\]/);
});

test("cli validation-bundle command exits non-zero as unknown", () => {
  const result = runCli([
    "validation-bundle",
    "verify",
    "--project",
    "SNPM",
    "--project-token-env",
    "SNPM_NOTION_TOKEN",
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command: validation-bundle verify/);
  assert.equal(result.stdout, "");
});
