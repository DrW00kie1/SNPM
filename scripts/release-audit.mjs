#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const PACK_DRY_RUN_ARGS = ["pack", "--dry-run", "--json", "--ignore-scripts"];

export const PACKED_PUBLIC_ALLOWLIST = [
  /^LICENSE$/,
  /^README\.md$/,
  /^package\.json$/,
  /^assets\/readme\/(?:safe-mutation-loop|secret-boundary|snpm-control-plane)\.png$/,
  /^config\/workspaces\/[a-z0-9-]+\.example\.json$/,
  /^docs\/(?:agent-quickstart|fresh-project-usage|github-testing-loop|json-contract-schemas|migration-guidance|project-access|project-bootstrap|project-token-setup|release-policy|validation-session-sync|validation-session-ui-bundle|validation-sessions|workspace-config|workspace-overview)\.md$/,
  /^src\/[a-z0-9][a-z0-9-]*\.mjs$/,
  /^src\/commands\/[a-z0-9][a-z0-9-]*\.mjs$/,
  /^src\/contracts\/[a-z0-9][a-z0-9-]*\.mjs$/,
  /^src\/notion\/[a-z0-9][a-z0-9-]*\.mjs$/,
];

export const PACKED_PRIVATE_PATH_DENYLIST = [
  { label: "private workspace config", pattern: /^config\/workspaces\/(?![a-z0-9-]+\.example\.json$)/i },
  { label: "task memory", pattern: /^(?:AGENTS|agents_ver2|plan|research)\.md$|^tasks(?:\/|$)/i },
  { label: ".snpm state", pattern: /(?:^|\/)\.snpm[^/]*(?:\/|$)/i },
  { label: "environment files", pattern: /(?:^|\/)\.env(?:$|[./_-])|(?:^|\/)\.npmrc$/i },
  { label: "DOCX artifacts", pattern: /\.docx$/i },
  { label: "tests", pattern: /^(?:test|tests)(?:\/|$)/i },
  { label: "closeout output", pattern: /(?:^|\/)closeouts?(?:\/|$)|(?:^|\/)\.snpm-closeout(?:\/|$)/i },
  { label: "review output", pattern: /(?:^|\/)(?:review-output|reviews?)(?:\/|$)/i },
  { label: "scaffold output", pattern: /(?:^|\/)(?:scaffold-output|scaffolded-docs|scaffold)(?:\/|$)/i },
  { label: "browser/session state", pattern: /(?:^|\/)(?:browser|browser-session|browser-sessions|sessions?|storage-state|auth-state)(?:\/|$)|(?:^|\/)(?:cookies|localStorage|sessionStorage|storageState)\.json$/i },
  { label: "retired validation-bundle artifacts", pattern: /validation-bundle/i },
  { label: "retired validation-bundle UI sources", pattern: /^src\/notion-ui(?:\/|$)/i },
  { label: "internal planning docs", pattern: /^docs\/(?:command-inventory(?:\/|$)|live-notion-docs\.md$|development-plan\.md$|operator-roadmap\.md$|new-thread-handoff\.md$)/i },
  { label: "local package artifacts", pattern: /(?:^|\/)(?:node_modules|\.git)(?:\/|$)|\.tgz$/i },
];

export const PACKED_CONTENT_DENYLIST = [
  { label: "npm publish token literal", pattern: /\bnpm_[A-Za-z0-9]{20,}\b/ },
  { label: "GitHub publish token literal", pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { label: "Notion secret literal", pattern: /\b(?:secret|ntn)_[A-Za-z0-9]{20,}\b/ },
  {
    label: "registry auth token assignment",
    pattern: /(?:\/\/registry\.npmjs\.org\/:)?_authToken\s*=\s*(?!\$\{?[A-Z0-9_]+\}?|<|replace-|example-)[^\s"'`]+/i,
  },
  {
    label: "publish token assignment",
    pattern: /\b(?:NPM_TOKEN|NODE_AUTH_TOKEN|NPM_AUTH_TOKEN)\b\s*[:=]\s*(?!\$\{?[A-Z0-9_]+\}?|<|replace-|example-)[^\s"'`]+/i,
  },
  {
    label: "private env assignment",
    pattern: /(?:^|\n)\s*(?:NOTION_TOKEN|SNPM_NOTION_TOKEN|SNPM_WORKSPACE_CONFIG_DIR|NPM_TOKEN|NODE_AUTH_TOKEN)\s*=\s*(?!\$\{?[A-Z0-9_]+\}?|<|replace-|example-)[^\s#]+/i,
  },
  {
    label: "browser session state",
    pattern: /"(?:cookies|localStorage|sessionStorage|storageState)"\s*:\s*(?:\[|\{|"(?!<|example|replace-)[^"]+")/i,
  },
  {
    label: "retired validation-bundle command guidance",
    pattern: /\bvalidation-bundle(?:\s+|-)(?:login|preview|apply|verify)\b/i,
  },
  {
    label: "retired validation-bundle wildcard guidance",
    pattern: /\bvalidation-bundle-\*/i,
  },
  {
    label: "retired browser auth scope",
    pattern: /\blocal-browser-session\b/i,
  },
  {
    label: "browser automation runtime guidance",
    pattern: /\b(?:playwright|chromium)\b.+\b(?:validation-bundle|notion ui|browser automation)\b|\b(?:validation-bundle|notion ui|browser automation)\b.+\b(?:playwright|chromium)\b/i,
  },
];

const TEXT_FILE_PATTERN = /\.(?:cjs|js|json|md|mjs|txt|yaml|yml)$/i;
const TEXT_BASENAMES = new Set(["LICENSE", "README.md", "package.json"]);

function quoteWindowsArg(value) {
  const text = String(value);
  if (text === "") {
    return '""';
  }

  return /[\s"&()^|<>]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function packedPath(entry) {
  return typeof entry === "string" ? entry : entry?.path;
}

function runNpm(args, { cwd = REPO_ROOT } = {}) {
  const isWindows = process.platform === "win32";
  const command = isWindows ? process.env.ComSpec || "cmd.exe" : "npm";
  const commandArgs = isWindows
    ? ["/d", "/s", "/c", ["npm", ...args].map(quoteWindowsArg).join(" ")]
    : args;

  return spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

export function parsePackJson(output, context = "npm pack dry run") {
  let payload;
  try {
    payload = JSON.parse(output);
  } catch (error) {
    throw new Error(`${context} must emit valid JSON output: ${error.message}`);
  }

  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error(`${context} must return exactly one package result`);
  }

  const [packResult] = payload;
  if (!packResult || typeof packResult.filename !== "string" || !Array.isArray(packResult.files)) {
    throw new Error(`${context} result must include filename and files[]`);
  }

  if (packResult.entryCount !== packResult.files.length) {
    throw new Error(`${context} entryCount must match files[]`);
  }

  return packResult;
}

export function collectPackedFiles({ cwd = REPO_ROOT } = {}) {
  const result = runNpm(PACK_DRY_RUN_ARGS, { cwd });

  if (result.error) {
    throw new Error(`npm pack dry run failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`npm pack dry run failed with status ${result.status ?? 1}\n${result.stderr || ""}`);
  }

  return parsePackJson(result.stdout);
}

export function auditPackedPaths(files) {
  const violations = [];

  for (const entry of files) {
    const file = packedPath(entry);

    if (typeof file !== "string" || file === "") {
      violations.push("packed file entries must include non-empty paths");
      continue;
    }

    if (file.includes("\\")) {
      violations.push(`${file} must use npm's portable slash format`);
    }

    if (!PACKED_PUBLIC_ALLOWLIST.some((pattern) => pattern.test(file))) {
      violations.push(`${file} is not covered by the public package allowlist`);
    }

    for (const { label, pattern } of PACKED_PRIVATE_PATH_DENYLIST) {
      if (pattern.test(file)) {
        violations.push(`${file} matches the private package denylist: ${label}`);
      }
    }
  }

  return violations;
}

function isTextFile(file) {
  return TEXT_BASENAMES.has(path.posix.basename(file)) || TEXT_FILE_PATTERN.test(file);
}

function resolvePackedSourcePath(file, repoRoot) {
  const absoluteRoot = path.resolve(repoRoot);
  const absolutePath = path.resolve(absoluteRoot, ...file.split("/"));

  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`${file} resolves outside the repository root`);
  }

  return absolutePath;
}

export function auditPackedContents(files, { repoRoot = REPO_ROOT } = {}) {
  const violations = [];
  let scannedTextFileCount = 0;

  for (const entry of files) {
    const file = packedPath(entry);

    if (typeof file !== "string" || !isTextFile(file)) {
      continue;
    }

    let absolutePath;
    try {
      absolutePath = resolvePackedSourcePath(file, repoRoot);
    } catch (error) {
      violations.push(error.message);
      continue;
    }

    if (!existsSync(absolutePath)) {
      violations.push(`${file} cannot be inspected because the source file is missing`);
      continue;
    }

    if (!statSync(absolutePath).isFile()) {
      violations.push(`${file} cannot be inspected because it is not a file`);
      continue;
    }

    const content = readFileSync(absolutePath, "utf8");
    scannedTextFileCount += 1;

    for (const { label, pattern } of PACKED_CONTENT_DENYLIST) {
      if (pattern.test(content)) {
        violations.push(`${file} matches the packed content denylist: ${label}`);
      }
    }
  }

  return { scannedTextFileCount, violations };
}

export function auditReleasePackage({ cwd = REPO_ROOT } = {}) {
  const packResult = collectPackedFiles({ cwd });
  const files = packResult.files.map((file) => file.path).sort();
  const pathViolations = auditPackedPaths(files);
  const contentResult = auditPackedContents(files, { repoRoot: cwd });
  const violations = [...pathViolations, ...contentResult.violations];

  return {
    ok: violations.length === 0,
    files,
    packResult,
    scannedTextFileCount: contentResult.scannedTextFileCount,
    violations,
  };
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isDirectRun()) {
  try {
    const result = auditReleasePackage();

    if (!result.ok) {
      console.error("[release-audit] package audit failed:");
      for (const violation of result.violations) {
        console.error(`- ${violation}`);
      }
      process.exit(1);
    }

    console.error(
      `[release-audit] audited ${result.files.length} packed paths and ${result.scannedTextFileCount} packed text files`,
    );
  } catch (error) {
    console.error(`[release-audit] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
