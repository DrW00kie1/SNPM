#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

export const EXPECTED_REQUIRED_STATUS_CHECK_CONTEXTS = [
  "Release Check (ubuntu-latest, Node 22.x)",
  "Release Check (ubuntu-latest, Node 24.x)",
  "Release Check (windows-latest, Node 22.x)",
  "Release Check (windows-latest, Node 24.x)",
];

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} must return valid JSON: ${error.message}`);
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function commandText(command, args) {
  return [command, ...args].join(" ");
}

function defaultRunCommand(command, args, { cwd = REPO_ROOT } = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

function defaultReadPackageJson({ cwd = REPO_ROOT } = {}) {
  return JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
}

function requireCommandOk(result, command, args) {
  const label = commandText(command, args);

  if (result?.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`);
  }

  if (result?.status !== 0) {
    throw new Error(`${label} failed with status ${result?.status ?? 1}: ${result?.stderr || ""}`.trim());
  }

  return result.stdout || "";
}

function isMissingBranchProtection(result) {
  if (!result || result.status === 0) {
    return false;
  }

  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  return /\bBranch not protected\b/i.test(text) || /"status"\s*:\s*"404"/.test(text);
}

function collectRequiredContexts(protection) {
  const statusChecks = protection?.required_status_checks;
  const contexts = new Set(asArray(statusChecks?.contexts).filter((context) => typeof context === "string"));

  for (const check of asArray(statusChecks?.checks)) {
    if (typeof check?.context === "string") {
      contexts.add(check.context);
    }
  }

  return contexts;
}

function visibleEnabledFlag(payload, field) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, field)) {
    return undefined;
  }

  const value = payload[field];
  if (typeof value === "boolean") {
    return value;
  }

  if (value && typeof value.enabled === "boolean") {
    return value.enabled;
  }

  return undefined;
}

function addCheck(checks, ok, label, detail) {
  checks.push({ ok, label, detail });
}

export function evaluateReleaseGovernance({
  repo,
  protection,
  releases,
  packageJson,
  expectedContexts = EXPECTED_REQUIRED_STATUS_CHECK_CONTEXTS,
} = {}) {
  const checks = [];
  const failures = [];

  const repoIsPublic = repo?.visibility === "PUBLIC" || repo?.isPrivate === false;
  addCheck(checks, repoIsPublic, "GitHub repository is public", `visibility=${repo?.visibility ?? "unknown"}`);

  const defaultBranch = repo?.defaultBranchRef?.name;
  addCheck(checks, defaultBranch === "main", "GitHub default branch is main", `defaultBranch=${defaultBranch ?? "unknown"}`);

  const protectedBranch = protection && Object.keys(protection).length > 0;
  addCheck(checks, protectedBranch, "main branch protection is visible", protectedBranch ? "protection payload returned" : "missing protection payload");

  const requiredContexts = collectRequiredContexts(protection);
  const missingContexts = expectedContexts.filter((context) => !requiredContexts.has(context));
  addCheck(
    checks,
    missingContexts.length === 0,
    "main branch protection requires expected CI contexts",
    missingContexts.length === 0 ? `${requiredContexts.size} required contexts visible` : `missing: ${missingContexts.join(", ")}`,
  );

  const forcePushesEnabled = visibleEnabledFlag(protection, "allow_force_pushes");
  if (forcePushesEnabled !== undefined) {
    addCheck(checks, forcePushesEnabled === false, "main branch protection disallows force pushes", `allow_force_pushes.enabled=${forcePushesEnabled}`);
  }

  const deletionsEnabled = visibleEnabledFlag(protection, "allow_deletions");
  if (deletionsEnabled !== undefined) {
    addCheck(checks, deletionsEnabled === false, "main branch protection disallows deletions", `allow_deletions.enabled=${deletionsEnabled}`);
  }

  addCheck(
    checks,
    asArray(releases).length === 0,
    "GitHub Releases are not in use for this posture",
    `${asArray(releases).length} releases visible`,
  );

  const publishScripts = ["publish", "prepublish", "prepublishOnly", "prepare", "release"].filter(
    (scriptName) => packageJson?.scripts?.[scriptName] !== undefined,
  );
  const publishPostureOk =
    packageJson?.name === "snpm" &&
    packageJson?.private === true &&
    packageJson?.publishConfig === undefined &&
    publishScripts.length === 0;
  addCheck(
    checks,
    publishPostureOk,
    "npm publish posture matches private package metadata",
    publishPostureOk
      ? "private=true, no publishConfig, no publish/release lifecycle scripts"
      : `name=${packageJson?.name ?? "unknown"}, private=${packageJson?.private}, publishConfig=${packageJson?.publishConfig === undefined ? "absent" : "present"}, scripts=${publishScripts.join(", ") || "none"}`,
  );

  for (const check of checks) {
    if (!check.ok) {
      failures.push(`${check.label}: ${check.detail}`);
    }
  }

  return {
    ok: failures.length === 0,
    checks,
    failures,
  };
}

export function auditReleaseGovernance({
  cwd = REPO_ROOT,
  runCommand = defaultRunCommand,
  readPackageJson = defaultReadPackageJson,
  expectedContexts = EXPECTED_REQUIRED_STATUS_CHECK_CONTEXTS,
} = {}) {
  const repoViewArgs = ["repo", "view", "--json", "nameWithOwner,visibility,isPrivate,defaultBranchRef"];
  const repo = parseJson(requireCommandOk(runCommand("gh", repoViewArgs, { cwd }), "gh", repoViewArgs), "gh repo view");
  const repoName = repo?.nameWithOwner;

  if (typeof repoName !== "string" || repoName === "") {
    throw new Error("gh repo view must return nameWithOwner");
  }

  const protectionArgs = ["api", `repos/${repoName}/branches/main/protection`];
  const protectionResult = runCommand("gh", protectionArgs, { cwd });
  const protection = isMissingBranchProtection(protectionResult)
    ? null
    : parseJson(requireCommandOk(protectionResult, "gh", protectionArgs), "gh branch protection API");

  const releasesArgs = ["release", "list", "--limit", "100", "--json", "tagName,name,isDraft,isPrerelease"];
  const releases = parseJson(requireCommandOk(runCommand("gh", releasesArgs, { cwd }), "gh", releasesArgs), "gh release list");
  const packageJson = readPackageJson({ cwd });

  return evaluateReleaseGovernance({
    repo,
    protection,
    releases,
    packageJson,
    expectedContexts,
  });
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isDirectRun()) {
  try {
    const result = auditReleaseGovernance();

    for (const check of result.checks) {
      const marker = check.ok ? "ok" : "fail";
      console.error(`[release-governance] ${marker}: ${check.label} (${check.detail})`);
    }

    if (!result.ok) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`[release-governance] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
