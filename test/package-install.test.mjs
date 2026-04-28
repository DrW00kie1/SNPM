import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { capabilityJson } from "../src/cli-help.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const JSON_CONTRACTS_URL = new URL("../src/contracts/json-contracts.mjs", import.meta.url);
const NPM_COMMAND = "npm";
const PACK_DRY_RUN_ARGS = ["pack", "--dry-run", "--json", "--ignore-scripts"];
const UPDATED_NODE_ENGINE_MAJOR = 22;

const PACKED_PUBLIC_ALLOWLIST = [
  /^LICENSE$/,
  /^README\.md$/,
  /^package\.json$/,
  /^assets\/readme\/(?:safe-mutation-loop|secret-boundary|snpm-control-plane)\.png$/,
  /^config\/workspaces\/[a-z0-9-]+\.example\.json$/,
  /^docs\/(?:[a-z0-9][a-z0-9-]*\/)?[a-z0-9][a-z0-9-]*\.(?:json|md)$/,
  /^src\/[a-z0-9][a-z0-9-]*\.mjs$/,
  /^src\/commands\/[a-z0-9][a-z0-9-]*\.mjs$/,
  /^src\/contracts\/[a-z0-9][a-z0-9-]*\.mjs$/,
  /^src\/notion\/[a-z0-9][a-z0-9-]*\.mjs$/,
];

const PACKED_PRIVATE_DENYLIST = [
  { label: "private workspace config", pattern: /^config\/workspaces\/(?![^/]+\.example\.json$)/i },
  { label: "task memory", pattern: /^(?:AGENTS|agents_ver2|plan|research)\.md$|^tasks\//i },
  { label: ".snpm state", pattern: /^\.snpm(?:\/|$)|^\.snpm-closeout(?:\/|$)/i },
  { label: "environment files", pattern: /(?:^|\/)\.env(?:$|[./_-])|(?:^|\/)\.npmrc$/i },
  { label: "DOCX files", pattern: /\.docx$/i },
  { label: "tests", pattern: /^(?:test|tests)\//i },
  { label: "closeout artifacts", pattern: /(?:^|\/)closeouts?(?:\/|$)/i },
  { label: "review artifacts", pattern: /(?:^|\/)review(?:\/|$)/i },
  { label: "scaffold artifacts", pattern: /(?:^|\/)scaffold(?:\/|$)/i },
  { label: "browser/session artifacts", pattern: /(?:^|\/)(?:browser|browser-session|sessions?)(?:\/|$)/i },
  { label: "validation-bundle artifacts", pattern: /validation-bundle/i },
  { label: "validation-bundle UI sources", pattern: /^src\/notion-ui\//i },
  { label: "local package artifacts", pattern: /(?:^|\/)(?:node_modules|\.git)(?:\/|$)|\.tgz$/i },
];

function readPackageJson() {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (!/[\s"&()^|<>]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '\\"')}"`;
}

function runNpm(args, { cwd, encoding = "utf8" } = {}) {
  if (process.platform === "win32") {
    return execFileSync("cmd.exe", ["/d", "/s", "/c", `npm ${args.map(quoteWindowsArg).join(" ")}`], {
      cwd,
      encoding,
      windowsHide: true,
    });
  }

  return execFileSync(NPM_COMMAND, args, {
    cwd,
    encoding,
    windowsHide: true,
  });
}

function parsePackJson(output, context) {
  let payload;
  try {
    payload = JSON.parse(output);
  } catch (error) {
    assert.fail(`${context} must emit valid JSON output: ${error.message}`);
  }

  assert.equal(Array.isArray(payload), true, `${context} JSON output must be an array`);
  assert.equal(payload.length, 1, `${context} must return one package result`);

  const [packResult] = payload;
  assert.equal(typeof packResult.filename, "string", `${context} result must include a filename`);
  assert.equal(Array.isArray(packResult.files), true, `${context} result must include files[]`);
  assert.equal(packResult.entryCount, packResult.files.length, `${context} entryCount must match files[]`);

  for (const file of packResult.files) {
    assert.equal(typeof file.path, "string", `${context} files[] entries must include a path`);
    assert.notEqual(file.path, "", `${context} files[] paths must be non-empty`);
    assert.doesNotMatch(file.path, /\\/, `${context} file paths must use npm's portable slash format`);
  }

  return packResult;
}

function assertPackDryRunArgs(args) {
  assert.equal(args.includes("--dry-run"), true, "npm pack dry run must use --dry-run");
  assert.equal(args.includes("--json"), true, "npm pack dry run must use --json");
  assert.equal(args.includes("--ignore-scripts"), true, "npm pack dry run must use --ignore-scripts");
}

function packDryRunFiles() {
  assertPackDryRunArgs(PACK_DRY_RUN_ARGS);
  const output = runNpm(PACK_DRY_RUN_ARGS, {
    cwd: REPO_ROOT,
  });
  const packResult = parsePackJson(output, "npm pack dry run");

  return packResult.files.map((file) => file.path).sort();
}

function packTo(tempDir) {
  const output = runNpm(["pack", "--pack-destination", tempDir, "--json", "--ignore-scripts"], {
    cwd: REPO_ROOT,
  });
  const [packResult] = JSON.parse(output);
  return path.join(tempDir, packResult.filename);
}

function assertPackedPathPolicy(files) {
  const violations = [];

  for (const file of files) {
    if (!PACKED_PUBLIC_ALLOWLIST.some((pattern) => pattern.test(file))) {
      violations.push(`${file} is not covered by the public package allowlist`);
    }

    for (const { label, pattern } of PACKED_PRIVATE_DENYLIST) {
      if (pattern.test(file)) {
        violations.push(`${file} matches the private package denylist: ${label}`);
      }
    }
  }

  assert.deepEqual(violations, []);
}

function assertUpdatedNodeEngineContract(packageJson) {
  const nodeRange = packageJson.engines?.node;

  assert.equal(typeof nodeRange, "string", "package.json must declare engines.node");

  const match = nodeRange.match(/(?:^|\s)>=\s*(\d+)(?:\.\d+){0,2}(?:\s|$)/);

  assert.notEqual(match, null, `package.json engines.node must use a >= range, found ${nodeRange}`);
  assert.equal(
    Number(match[1]) >= UPDATED_NODE_ENGINE_MAJOR,
    true,
    `updated package.json engines.node must require Node >=${UPDATED_NODE_ENGINE_MAJOR}, found ${nodeRange}`,
  );
}

function runSnpm(binPath, args, { cwd, env = {}, input } = {}) {
  const command = process.platform === "win32" ? "cmd.exe" : binPath;
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", `${quoteWindowsArg(binPath)} ${args.map(quoteWindowsArg).join(" ")}`]
    : args;
  return spawnSync(command, commandArgs, {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    input,
    encoding: "utf8",
    windowsHide: true,
  });
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

test("package metadata exposes an snpm executable while remaining private", () => {
  const packageJson = readPackageJson();
  const cliSource = readFileSync(path.join(REPO_ROOT, "src", "cli.mjs"), "utf8");

  assert.equal(packageJson.private, true);
  assertUpdatedNodeEngineContract(packageJson);
  assert.deepEqual(packageJson.bin, {
    snpm: "./src/cli.mjs",
  });
  assert.match(cliSource, /^#!\/usr\/bin\/env node\r?\n/);
});

test("package metadata keeps validation-bundle scripts absent", () => {
  const packageJson = readPackageJson();
  const scriptNames = Object.keys(packageJson.scripts);
  const scriptCommands = Object.values(packageJson.scripts).join("\n");

  assert.equal(scriptNames.some((script) => /validation-bundle/i.test(script)), false);
  assert.doesNotMatch(scriptCommands, /validation-bundle/i);
});

test("package tarball contains runtime files and excludes local-only materials", () => {
  const files = packDryRunFiles();
  const fileSet = new Set(files);

  assertPackedPathPolicy(files);

  assert.equal(fileSet.has("package.json"), true);
  assert.equal(fileSet.has("README.md"), true);
  assert.equal(fileSet.has("LICENSE"), true);
  assert.equal(fileSet.has("src/cli.mjs"), true);
  assert.equal(fileSet.has("docs/workspace-overview.md"), true);
  assert.equal(fileSet.has("assets/readme/snpm-control-plane.png"), true);
  assert.equal(fileSet.has("config/workspaces/infrastructure-hq.example.json"), true);

  assert.equal(fileSet.has("config/workspaces/infrastructure-hq.json"), false);
  assert.equal(fileSet.has("research.md"), false);
  assert.equal(fileSet.has("plan.md"), false);
  assert.equal(fileSet.has("AGENTS.md"), false);
  assert.equal(fileSet.has(".env"), false);
  assert.equal(fileSet.has(".npmrc"), false);
  assert.equal(fileSet.has(".snpm-closeout"), false);
  assert.equal(files.some((file) => file.startsWith(".snpm")), false);
  assert.equal(files.some((file) => file.startsWith("test/")), false);
  assert.equal(files.some((file) => file.startsWith("tasks/")), false);
  assert.equal(files.some((file) => file.toLowerCase().endsWith(".docx")), false);
  assert.equal(files.some((file) => /^src\/(?:commands\/|notion-ui\/).*validation-bundle/i.test(file)), false);
  assert.equal(files.some((file) => /^src\/notion-ui\//i.test(file)), false);
  assert.equal(files.some((file) => /(?:^|\/)validation-bundle(?:\.|\/)/i.test(file)), false);
});

test("packed package installs an snpm bin that runs from outside the source checkout", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-package-install-"));
  try {
    const tarballPath = packTo(tempDir);
    const consumerDir = path.join(tempDir, "consumer");
    mkdirSync(consumerDir, { recursive: true });
    writeFileSync(path.join(consumerDir, "package.json"), JSON.stringify({ private: true }));

    runNpm([
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      tarballPath,
    ], { cwd: consumerDir });

    const binPath = path.join(
      consumerDir,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "snpm.cmd" : "snpm",
    );
    const env = {
      SNPM_JOURNAL_PATH: path.join(tempDir, "journal.ndjson"),
    };

    const help = runSnpm(binPath, ["--help"], { cwd: consumerDir, env });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /node src\/cli\.mjs <command> \[options\]/);
    assert.doesNotMatch(help.stdout, /validation-bundle/i);

    const capabilities = runSnpm(binPath, ["capabilities"], { cwd: consumerDir, env });
    assert.equal(capabilities.status, 0, capabilities.stderr);
    const capabilitiesPayload = JSON.parse(capabilities.stdout);
    assert.deepEqual(capabilitiesPayload, JSON.parse(capabilityJson()));
    assert.doesNotMatch(capabilities.stdout, /validation-bundle/i);
    await assertJsonContractPayload("snpm.capabilities.v1.minimal", capabilitiesPayload);

    const discover = runSnpm(binPath, ["discover", "--project", "SNPM"], { cwd: consumerDir, env });
    assert.equal(discover.status, 0, discover.stderr);
    const discoverPayload = JSON.parse(discover.stdout);
    assert.equal(discoverPayload.commandForms.installedCli.firstContactCommand, 'snpm discover --project "SNPM"');
    await assertJsonContractPayload("snpm.discover.v1", discoverPayload);

    const journal = runSnpm(binPath, ["journal", "list", "--limit", "1"], { cwd: consumerDir, env });
    assert.equal(journal.status, 0, journal.stderr);
    assert.deepEqual(JSON.parse(journal.stdout).entries, []);

    const validationBundleHelp = runSnpm(binPath, ["validation-bundle", "verify", "--help"], { cwd: consumerDir, env });
    assert.equal(validationBundleHelp.status, 1);
    assert.match(validationBundleHelp.stderr, /Unknown command: validation-bundle verify/);
    assert.doesNotMatch(validationBundleHelp.stdout, /Command: validation-bundle verify/);

    const structuredFailure = runSnpm(binPath, ["--error-format", "json", "verify-project"], { cwd: consumerDir, env });
    assert.equal(structuredFailure.status, 1);
    assert.equal(structuredFailure.stdout, "");
    const structuredFailurePayload = JSON.parse(structuredFailure.stderr);
    assert.deepEqual(structuredFailurePayload, {
      ok: false,
      schemaVersion: 1,
      command: "verify-project",
      error: {
        code: "missing_required_option",
        category: "usage",
        message: 'Provide --name "Project Name".',
      },
    });
    await assertJsonContractPayload("snpm.cli-error.v1", structuredFailurePayload);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
