import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildCapabilityMap } from "../src/cli-help.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const INVENTORY_DIR = path.join(REPO_ROOT, "docs", "command-inventory");
const PRE_SPRINT_0_JSON = path.join(INVENTORY_DIR, "pre-sprint-0.json");
const PRE_SPRINT_0_MARKDOWN = path.join(INVENTORY_DIR, "pre-sprint-0.md");
const EXPECTED_RETIRED_CANDIDATES = [
  "validation-bundle.login",
  "validation-bundle.preview",
  "validation-bundle.apply",
  "validation-bundle.verify",
];

function readInventory() {
  return JSON.parse(readFileSync(PRE_SPRINT_0_JSON, "utf8"));
}

function readPackageJson() {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
}

function readPackageLock() {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "package-lock.json"), "utf8"));
}

function currentValidationBundleCommands() {
  return buildCapabilityMap()
    .commands
    .map((command) => command.canonical)
    .filter((command) => command.startsWith("validation-bundle "))
    .sort();
}

function isValidationBundleRetiredFromCurrentSurface() {
  return currentValidationBundleCommands().length === 0;
}

function listFiles(rootDir) {
  if (!existsSync(rootDir)) {
    return [];
  }

  return readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(fullPath);
    }

    return [fullPath];
  });
}

function relativeRepoPath(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

test("pre-sprint-0 command inventory preserves the retired validation-bundle baseline", () => {
  const inventory = readInventory();
  const retiredCommands = inventory.commands
    .filter((command) => command.status === "retired-candidate")
    .map((command) => command.id)
    .sort();
  const validationSessionsVerify = inventory.commands
    .find((command) => command.canonical === "validation-sessions verify");

  assert.equal(inventory.schemaVersion, "snpm-command-inventory.v1");
  assert.match(inventory.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(inventory.retiredCandidates, EXPECTED_RETIRED_CANDIDATES);
  assert.deepEqual(retiredCommands, [...EXPECTED_RETIRED_CANDIDATES].sort());
  assert.deepEqual(inventory.source, {
    help: true,
    capabilities: true,
    packageScripts: true,
  });
  assert.equal(validationSessionsVerify?.status, "active-at-inventory-time");
  assert.equal(validationSessionsVerify?.surface, "validation-sessions");
  assert.ok(validationSessionsVerify?.npmScripts.includes("validation-sessions-verify"));

  for (const retiredId of EXPECTED_RETIRED_CANDIDATES) {
    const retiredCommand = inventory.commands.find((command) => command.id === retiredId);
    assert.equal(retiredCommand?.surface, "validation-bundle");
    assert.equal(retiredCommand?.stability, "experimental");
    assert.equal(retiredCommand?.status, "retired-candidate");
    assert.match(retiredCommand?.canonical || "", /^validation-bundle /);
    assert.ok(
      retiredCommand?.npmScripts.some((scriptName) => scriptName.startsWith("validation-bundle-")),
      `${retiredId} should preserve its pre-removal npm script`,
    );
  }
});

test("pre-sprint-0 markdown inventory summarizes the JSON baseline", () => {
  const inventory = readInventory();
  const markdown = readFileSync(PRE_SPRINT_0_MARKDOWN, "utf8");
  const validationBundleScriptCount = inventory.packageScripts
    .filter((script) => script.name.startsWith("validation-bundle-"))
    .length;

  assert.match(markdown, /historical baseline captured before validation-bundle retirement/i);
  assert.match(markdown, new RegExp(`Generated: ${inventory.generatedAt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(markdown, new RegExp(`Commands in capabilities: ${inventory.commands.length}`));
  assert.match(markdown, new RegExp(`npm scripts: ${inventory.packageScripts.length}`));
  assert.match(markdown, new RegExp(`validation-bundle npm scripts: ${validationBundleScriptCount}`));

  for (const retiredId of EXPECTED_RETIRED_CANDIDATES) {
    assert.match(markdown, new RegExp(`- ${retiredId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
});

test("current validation-bundle command retirement state is not partial", () => {
  assert.deepEqual(currentValidationBundleCommands(), []);
});

test("Playwright dependency is not retained after active validation-bundle command retirement", () => {
  if (!isValidationBundleRetiredFromCurrentSurface()) {
    return;
  }

  const packageJson = readPackageJson();
  const packageLock = readPackageLock();
  const dependencySections = [
    packageJson.dependencies || {},
    packageJson.devDependencies || {},
    packageJson.optionalDependencies || {},
  ];
  const lockPackageNames = Object.keys(packageLock.packages || {});

  for (const dependencies of dependencySections) {
    assert.equal("playwright" in dependencies, false);
    assert.equal("playwright-core" in dependencies, false);
  }
  assert.equal(lockPackageNames.some((name) => /node_modules\/playwright(?:-core)?$/.test(name)), false);
});

test("source imports do not cross into notion-ui after active validation-bundle command retirement", () => {
  if (!isValidationBundleRetiredFromCurrentSurface()) {
    return;
  }

  const srcFiles = listFiles(path.join(REPO_ROOT, "src"))
    .filter((filePath) => filePath.endsWith(".mjs"));
  const notionUiSourceFiles = srcFiles
    .filter((filePath) => relativeRepoPath(filePath).startsWith("src/notion-ui/"));

  assert.deepEqual(notionUiSourceFiles.map(relativeRepoPath), []);

  for (const filePath of srcFiles) {
    const source = readFileSync(filePath, "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*notion-ui\//, `${relativeRepoPath(filePath)} imports notion-ui`);
    assert.doesNotMatch(source, /from\s+["']playwright["']/, `${relativeRepoPath(filePath)} imports Playwright`);
    assert.doesNotMatch(source, /from\s+["'][^"']*validation-bundle[^"']*["']/, `${relativeRepoPath(filePath)} imports the retired validation-bundle lane`);
  }
});
