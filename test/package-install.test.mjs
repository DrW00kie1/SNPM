import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { capabilityJson } from "../src/cli-help.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const NPM_COMMAND = "npm";

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

function packDryRunFiles() {
  const output = runNpm(["pack", "--dry-run", "--json"], {
    cwd: REPO_ROOT,
  });
  const [packResult] = JSON.parse(output);

  return packResult.files.map((file) => file.path).sort();
}

function packTo(tempDir) {
  const output = runNpm(["pack", "--pack-destination", tempDir, "--json"], {
    cwd: REPO_ROOT,
  });
  const [packResult] = JSON.parse(output);
  return path.join(tempDir, packResult.filename);
}

function runSnpm(binPath, args, { cwd, env = {} } = {}) {
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
    encoding: "utf8",
    windowsHide: true,
  });
}

test("package metadata exposes an snpm executable while remaining private", () => {
  const packageJson = readPackageJson();
  const cliSource = readFileSync(path.join(REPO_ROOT, "src", "cli.mjs"), "utf8");

  assert.equal(packageJson.private, true);
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

test("packed package installs an snpm bin that runs from outside the source checkout", () => {
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
    assert.deepEqual(JSON.parse(capabilities.stdout), JSON.parse(capabilityJson()));
    assert.doesNotMatch(capabilities.stdout, /validation-bundle/i);

    const discover = runSnpm(binPath, ["discover", "--project", "SNPM"], { cwd: consumerDir, env });
    assert.equal(discover.status, 0, discover.stderr);
    const discoverPayload = JSON.parse(discover.stdout);
    assert.equal(discoverPayload.commandForms.installedCli.firstContactCommand, 'snpm discover --project "SNPM"');

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
    assert.deepEqual(JSON.parse(structuredFailure.stderr), {
      ok: false,
      schemaVersion: 1,
      command: "verify-project",
      error: {
        code: "missing_required_option",
        category: "usage",
        message: 'Provide --name "Project Name".',
      },
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
