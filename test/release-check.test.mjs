import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function readRepoFile(...segments) {
  return readFileSync(path.join(REPO_ROOT, ...segments), "utf8");
}

function readPackageJson() {
  return JSON.parse(readRepoFile("package.json"));
}

test("package metadata exposes Node 22 release-check scripts", () => {
  const packageJson = readPackageJson();

  assert.equal(packageJson.engines.node, ">=22.0.0");
  assert.equal(packageJson.scripts["package-contract"], "npm run test:package-contract");
  assert.equal(
    packageJson.scripts["test:package-contract"],
    "node --test test/package-install.test.mjs test/release-check.test.mjs test/release-policy.test.mjs",
  );
  assert.equal(packageJson.scripts["release-audit"], "node scripts/release-audit.mjs");
  assert.equal(packageJson.scripts["release-check"], "node scripts/release-check.mjs");
});

test("CI runs the secret-free release check on Node 22 and 24 across Ubuntu and Windows", () => {
  const workflow = readRepoFile(".github", "workflows", "ci.yml");

  assert.match(workflow, /\bpull_request:\s*\n/);
  assert.match(workflow, /\bpush:\s*\n/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /os:\s*\[ubuntu-latest, windows-latest\]/);
  assert.match(workflow, /node-version:\s*\[22\.x, 24\.x\]/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm run release-check/);
  assert.doesNotMatch(workflow, /\bsecrets\./i);
  assert.doesNotMatch(workflow, /\bNOTION\b/i);
  assert.doesNotMatch(workflow, /\benv:\s*\n/i);
});

test("release-check runs the full local release gate without live Notion commands", () => {
  const script = readRepoFile("scripts", "release-check.mjs");

  assert.match(script, /full test suite/);
  assert.match(script, /test:package-contract/);
  assert.match(script, /release audit/);
  assert.match(script, /scripts\/release-audit\.mjs/);
  assert.match(script, /pack", "--dry-run", "--json", "--ignore-scripts/);
  assert.match(script, /src\/cli\.mjs", "--help/);
  assert.match(script, /capabilities smoke/);
  assert.match(script, /discover smoke/);
  assert.doesNotMatch(script, /verify-project|doctor|recommend|NOTION/i);
});

test("release-audit scans packed paths and text contents for package leaks", () => {
  const script = readRepoFile("scripts", "release-audit.mjs");

  assert.match(script, /PACKED_PUBLIC_ALLOWLIST/);
  assert.match(script, /PACKED_PRIVATE_PATH_DENYLIST/);
  assert.match(script, /PACKED_CONTENT_DENYLIST/);
  assert.match(script, /auditPackedPaths/);
  assert.match(script, /auditPackedContents/);
  assert.match(script, /NPM_TOKEN|NODE_AUTH_TOKEN/);
  assert.match(script, /validation-bundle/);
  assert.match(script, /browser session state/);
  assert.doesNotMatch(script, /verify-project|doctor|recommend/);
});
