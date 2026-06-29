#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const ARCHITECTURE_SCHEMA_VERSION = "snpm.architecture-inventory.v1";

const SOURCE_DIRS = ["src", "scripts", "test"];
const LOCAL_IMPORT_PATTERN = /\b(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/gms;
const PRIVATE_TEST_DEPENDENCY_PATTERNS = [
  {
    label: "closeout artifacts",
    pattern: /\b(?:readFileSync|existsSync|readdirSync|writeFileSync|rmSync|mkdirSync|new URL|path\.join)\s*\([^)]*["'`](?:\.\.\/)?\.snpm-closeout(?:\/|\\|["'`])/s,
  },
  {
    label: "task memory",
    pattern: /\b(?:readFileSync|existsSync|readdirSync|writeFileSync|rmSync|mkdirSync|new URL|path\.join)\s*\([^)]*["'`](?:\.\.\/)?(?:research\.md|plan\.md|AGENTS\.md|agents_ver2\.md|tasks)(?:\/|\\|["'`])/s,
  },
  {
    label: "local DOCX artifact",
    pattern: /\b(?:readFileSync|existsSync|writeFileSync|new URL|path\.join)\s*\([^)]*["'`][^"'`]*\.docx["'`]/is,
  },
];

function toPosix(filePath) {
  return filePath.replace(/\\/g, "/");
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

function relativeRepoPath(filePath, repoRoot) {
  return toPosix(path.relative(repoRoot, filePath));
}

function readArchitectureFilesFromDisk({ repoRoot = REPO_ROOT } = {}) {
  return SOURCE_DIRS.flatMap((dir) => listFiles(path.join(repoRoot, dir)))
    .filter((filePath) => filePath.endsWith(".mjs"))
    .map((filePath) => ({
      path: relativeRepoPath(filePath, repoRoot),
      source: readFileSync(filePath, "utf8"),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function classifyArchitectureLayer(filePath) {
  const normalized = toPosix(filePath);

  if (normalized === "src/cli.mjs" || normalized.startsWith("src/cli/") || normalized === "src/cli-help.mjs" || normalized === "src/command-registry.mjs") {
    return "cli-registry";
  }
  if (normalized === "src/validators.mjs") {
    return "validators";
  }
  if (normalized.startsWith("src/commands/")) {
    return "commands";
  }
  if (normalized.startsWith("src/infrastructure/")) {
    return "infrastructure";
  }
  if (normalized.startsWith("src/contracts/")) {
    return "contracts";
  }
  if (normalized.startsWith("src/notion-cli/")) {
    return "notion-cli-adapter";
  }
  if (normalized.startsWith("src/notion/")) {
    return "notion-domain";
  }
  if (normalized.startsWith("test/")) {
    return "tests";
  }
  if (normalized.startsWith("scripts/")) {
    return "release-tooling";
  }
  return "unclassified";
}

export function parseLocalImports(source) {
  const imports = [];

  for (const match of source.matchAll(LOCAL_IMPORT_PATTERN)) {
    const specifier = match[1] || match[2];
    if (specifier?.startsWith(".")) {
      imports.push(specifier);
    }
  }

  return imports;
}

function resolveLocalImport(fromPath, specifier) {
  const fromDir = path.posix.dirname(toPosix(fromPath));
  const resolved = path.posix.normalize(path.posix.join(fromDir, specifier));

  if (resolved.endsWith(".mjs")) {
    return resolved;
  }

  return `${resolved}.mjs`;
}

function buildModuleEntries(files) {
  return files.map((file) => {
    const layer = classifyArchitectureLayer(file.path);
    return {
      path: file.path,
      layer,
      imports: parseLocalImports(file.source).map((specifier) => ({
        specifier,
        target: resolveLocalImport(file.path, specifier),
      })).sort((a, b) => a.target.localeCompare(b.target) || a.specifier.localeCompare(b.specifier)),
    };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function summarizeLayers(modules) {
  const counts = new Map();
  for (const module of modules) {
    counts.set(module.layer, (counts.get(module.layer) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([layer, count]) => ({ layer, count }))
    .sort((a, b) => a.layer.localeCompare(b.layer));
}

function auditBoundaryEdges(modules) {
  const byPath = new Map(modules.map((module) => [module.path, module]));
  const violations = [];

  for (const module of modules) {
    for (const imported of module.imports) {
      const target = byPath.get(imported.target);
      if (!target) {
        continue;
      }

      if (module.layer === "notion-domain" && (target.layer === "cli-registry" || target.layer === "commands")) {
        violations.push({
          code: "architecture.domain-imports-command-layer",
          file: module.path,
          target: target.path,
          message: "Notion domain modules must not import CLI registry or command-handler modules.",
        });
      }

      if (module.layer === "contracts" && ["cli-registry", "commands", "notion-domain", "notion-cli-adapter"].includes(target.layer)) {
        violations.push({
          code: "architecture.contracts-import-runtime-layer",
          file: module.path,
          target: target.path,
          message: "JSON contract helpers must stay independent of runtime command/domain implementations.",
        });
      }

      const allowedInfrastructureCommandImports = new Set([
        "src/commands/secret-output-safety.mjs",
      ]);

      if (module.layer === "infrastructure" && (target.layer === "cli-registry" || (target.layer === "commands" && !allowedInfrastructureCommandImports.has(target.path)))) {
        violations.push({
          code: "architecture.infrastructure-imports-command-layer",
          file: module.path,
          target: target.path,
          message: "Infrastructure utilities must not import CLI registry or command-handler modules.",
        });
      }

      if (module.layer === "infrastructure" && target.layer === "notion-domain" && !/^src\/notion\/(?:core\/)?env\.mjs$/.test(target.path)) {
        violations.push({
          code: "architecture.infrastructure-imports-notion-surface",
          file: module.path,
          target: target.path,
          message: "Infrastructure utilities must not import Notion surface implementations; only pure shared Notion helpers are allowed.",
        });
      }
    }
  }

  return violations;
}

function auditPrivateTestDependencies(files) {
  return files
    .filter((file) => file.path.startsWith("test/"))
    .flatMap((file) => PRIVATE_TEST_DEPENDENCY_PATTERNS
      .filter(({ pattern }) => pattern.test(file.source))
      .map(({ label }) => ({
        code: "architecture.test-depends-on-local-artifact",
        file: file.path,
        target: label,
        message: `Tests must not depend on local-only ${label}.`,
      })));
}

function auditTestLayerLayout(files) {
  return files
    .filter((file) => /^test\/[^/]+\.test\.mjs$/.test(file.path))
    .map((file) => ({
      code: "architecture.test-not-layered",
      file: file.path,
      message: "Tests must live under a layer directory such as test/cli, test/commands, test/notion, test/manifest, test/access, test/infrastructure, or test/package.",
    }));
}

function auditRetiredBrowserLane(files, packageJson) {
  const violations = [];

  for (const file of files) {
    if (/^src\/notion-ui(?:\/|$)/i.test(file.path)) {
      violations.push({
        code: "architecture.retired-notion-ui-source",
        file: file.path,
        message: "Retired browser/UI automation source must not return under src/notion-ui.",
      });
    }
    if (/^src\/(?:commands\/)?validation-bundle/i.test(file.path)) {
      violations.push({
        code: "architecture.retired-validation-bundle-source",
        file: file.path,
        message: "Retired validation-bundle command source must not return.",
      });
    }
    if (/from\s+["']playwright["']|from\s+["']playwright-core["']/i.test(file.source)) {
      violations.push({
        code: "architecture.playwright-import",
        file: file.path,
        message: "Playwright imports are retired with the validation-bundle browser lane.",
      });
    }
  }

  const scripts = packageJson?.scripts || {};
  for (const [name, command] of Object.entries(scripts)) {
    if (/validation-bundle/i.test(`${name}\n${command}`)) {
      violations.push({
        code: "architecture.retired-validation-bundle-script",
        file: "package.json",
        target: name,
        message: "Package scripts must not advertise retired validation-bundle commands.",
      });
    }
  }

  return violations;
}

function auditPackageBoundary(packageJson) {
  const files = Array.isArray(packageJson?.files) ? packageJson.files : [];
  const violations = [];

  for (const entry of files) {
    if (/^(?:scripts|test|tasks|\.)\/?/i.test(entry)) {
      violations.push({
        code: "architecture.package-includes-internal-tree",
        file: "package.json",
        target: entry,
        message: "Package files must not include internal scripts, tests, task memory, or dot-state trees.",
      });
    }
    if (/^docs\/(?:architecture|architecture-inventory|development-plan|operator-roadmap|live-notion-docs)/i.test(entry)) {
      violations.push({
        code: "architecture.package-includes-internal-doc",
        file: "package.json",
        target: entry,
        message: "Package files must exclude architecture/planning docs from runtime tarballs.",
      });
    }
  }

  return violations;
}

export function buildArchitectureInventory({ files, packageJson = {} } = {}) {
  const inputFiles = files ? [...files].sort((a, b) => a.path.localeCompare(b.path)) : readArchitectureFilesFromDisk();
  const modules = buildModuleEntries(inputFiles);
  const violations = [
    ...auditBoundaryEdges(modules),
    ...auditPrivateTestDependencies(inputFiles),
    ...auditTestLayerLayout(inputFiles),
    ...auditRetiredBrowserLane(inputFiles, packageJson),
    ...auditPackageBoundary(packageJson),
  ].sort((a, b) => `${a.code}:${a.file}:${a.target || ""}`.localeCompare(`${b.code}:${b.file}:${b.target || ""}`));

  return {
    ok: violations.length === 0,
    schemaVersion: ARCHITECTURE_SCHEMA_VERSION,
    moduleCount: modules.length,
    layers: summarizeLayers(modules),
    modules,
    violations,
    migrationSlices: [
      "command-shell-split",
      "domain-service-grouping",
      "infrastructure-utilities",
      "tests-by-layer",
      "typescript-or-final-closeout-decision",
    ],
  };
}

function readPackageJson({ repoRoot = REPO_ROOT } = {}) {
  const filePath = path.join(repoRoot, "package.json");
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return {};
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function auditArchitecture({ repoRoot = REPO_ROOT } = {}) {
  return buildArchitectureInventory({
    files: readArchitectureFilesFromDisk({ repoRoot }),
    packageJson: readPackageJson({ repoRoot }),
  });
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isDirectRun()) {
  const jsonOutput = process.argv.includes("--json");
  const result = auditArchitecture();

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    console.error(`[architecture-inventory] audited ${result.moduleCount} modules across ${result.layers.length} layers`);
    for (const layer of result.layers) {
      console.error(`[architecture-inventory] ${layer.layer}: ${layer.count}`);
    }
  }

  if (!result.ok) {
    console.error("[architecture-inventory] boundary violations:");
    for (const violation of result.violations) {
      console.error(`- ${violation.code}: ${violation.file}${violation.target ? ` -> ${violation.target}` : ""}: ${violation.message}`);
    }
    process.exit(1);
  }
}
