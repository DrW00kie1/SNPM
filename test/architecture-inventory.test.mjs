import test from "node:test";
import assert from "node:assert/strict";

import {
  auditArchitecture,
  buildArchitectureInventory,
  classifyArchitectureLayer,
  parseLocalImports,
} from "../scripts/architecture-inventory.mjs";

function buildFixtureInventory(files, packageJson = { files: [] }) {
  return buildArchitectureInventory({
    files,
    packageJson,
  });
}

function violationCodes(result) {
  return result.violations.map((violation) => violation.code);
}

test("architecture inventory passes for the current repository and is deterministic", () => {
  const first = auditArchitecture();
  const second = auditArchitecture();

  assert.equal(first.ok, true, JSON.stringify(first.violations, null, 2));
  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, "snpm.architecture-inventory.v1");
  assert.ok(first.layers.some((layer) => layer.layer === "cli-registry"));
  assert.ok(first.layers.some((layer) => layer.layer === "commands"));
  assert.ok(first.layers.some((layer) => layer.layer === "notion-domain"));
  assert.ok(first.layers.some((layer) => layer.layer === "notion-cli-adapter"));
  assert.ok(first.layers.some((layer) => layer.layer === "contracts"));
  assert.ok(first.layers.some((layer) => layer.layer === "tests"));
  assert.ok(first.layers.some((layer) => layer.layer === "release-tooling"));
  assert.deepEqual(first.migrationSlices, [
    "command-shell-split",
    "domain-service-grouping",
    "infrastructure-utilities",
    "tests-by-layer",
    "typescript-or-final-closeout-decision",
  ]);
});

test("architecture layer classification covers the migration buckets", () => {
  assert.equal(classifyArchitectureLayer("src/cli.mjs"), "cli-registry");
  assert.equal(classifyArchitectureLayer("src/cli-help.mjs"), "cli-registry");
  assert.equal(classifyArchitectureLayer("src/command-registry.mjs"), "cli-registry");
  assert.equal(classifyArchitectureLayer("src/commands/sync.mjs"), "commands");
  assert.equal(classifyArchitectureLayer("src/contracts/json-contracts.mjs"), "contracts");
  assert.equal(classifyArchitectureLayer("src/notion/page-markdown.mjs"), "notion-domain");
  assert.equal(classifyArchitectureLayer("src/notion/manifest/manifest-sync-push.mjs"), "notion-domain");
  assert.equal(classifyArchitectureLayer("src/notion-cli/api-adapter.mjs"), "notion-cli-adapter");
  assert.equal(classifyArchitectureLayer("src/validators.mjs"), "validators");
  assert.equal(classifyArchitectureLayer("test/cli.test.mjs"), "tests");
  assert.equal(classifyArchitectureLayer("scripts/release-check.mjs"), "release-tooling");
});

test("architecture inventory parses static and literal dynamic local imports", () => {
  assert.deepEqual(parseLocalImports(`
    import "./setup.mjs";
    import value from "../commands/page-push.mjs";
    export { helper } from "./helper.mjs";
    const lazy = await import("./lazy.mjs");
    import fs from "node:fs";
  `), [
    "./setup.mjs",
    "../commands/page-push.mjs",
    "./helper.mjs",
    "./lazy.mjs",
  ]);
});

test("architecture inventory rejects Notion domain imports from command handlers", () => {
  const result = buildFixtureInventory([
    {
      path: "src/notion/page-service.mjs",
      source: 'import { runPagePush } from "../commands/page-push.mjs";',
    },
    {
      path: "src/commands/page-push.mjs",
      source: "export function runPagePush() {}",
    },
  ]);

  assert.equal(result.ok, false);
  assert.ok(violationCodes(result).includes("architecture.domain-imports-command-layer"));
});

test("architecture inventory rejects JSON contracts importing runtime command or domain code", () => {
  const result = buildFixtureInventory([
    {
      path: "src/contracts/json-contracts.mjs",
      source: 'import { readPage } from "../notion/page-markdown.mjs";',
    },
    {
      path: "src/notion/page-markdown.mjs",
      source: "export function readPage() {}",
    },
  ]);

  assert.equal(result.ok, false);
  assert.ok(violationCodes(result).includes("architecture.contracts-import-runtime-layer"));
});

test("architecture inventory rejects test dependencies on local-only task artifacts", () => {
  const closeoutPath = ".snpm" + "-closeout/page.md";
  const researchFile = "research" + ".md";
  const docxArtifact = "SNPM_Product_Hardening_Design_Plan_v1_3_Validation_Bundle_Removal" + ".docx";
  const result = buildFixtureInventory([
    {
      path: "test/local-artifacts.test.mjs",
      source: `
        import { readFileSync } from "node:fs";
        readFileSync("${closeoutPath}", "utf8");
        readFileSync("${researchFile}", "utf8");
        readFileSync("${docxArtifact}");
      `,
    },
  ]);

  assert.equal(result.ok, false);
  assert.ok(violationCodes(result).includes("architecture.test-depends-on-local-artifact"));
});

test("architecture inventory rejects retired validation-bundle and browser automation resurrection", () => {
  const playwrightPackage = "play" + "wright";
  const validationBundle = "validation" + "-bundle";
  const result = buildFixtureInventory([
    {
      path: "src/notion-ui/browser.mjs",
      source: `import { chromium } from "${playwrightPackage}";`,
    },
    {
      path: `src/commands/${validationBundle}.mjs`,
      source: "export function runValidationBundle() {}",
    },
  ], {
    files: [],
    scripts: {
      [`${validationBundle}-preview`]: `node src/cli.mjs ${validationBundle} preview`,
    },
  });

  assert.equal(result.ok, false);
  assert.ok(violationCodes(result).includes("architecture.retired-notion-ui-source"));
  assert.ok(violationCodes(result).includes("architecture.playwright-import"));
  assert.ok(violationCodes(result).includes("architecture.retired-validation-bundle-source"));
  assert.ok(violationCodes(result).includes("architecture.retired-validation-bundle-script"));
});

test("architecture inventory rejects package allowlist drift into internal architecture artifacts", () => {
  const result = buildFixtureInventory([], {
    files: [
      "src/",
      "scripts/",
      "docs/architecture.md",
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(violationCodes(result).includes("architecture.package-includes-internal-tree"));
  assert.ok(violationCodes(result).includes("architecture.package-includes-internal-doc"));
});
