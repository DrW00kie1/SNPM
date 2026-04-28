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

function readReleasePolicy() {
  return readRepoFile("docs", "release-policy.md");
}

function assertSafePackageIdentity(packageJson) {
  assert.equal(packageJson.name, "snpm");
  assert.equal(packageJson.private, true);
  assert.deepEqual(packageJson.repository, {
    type: "git",
    url: "git+https://github.com/DrW00kie1/SNPM.git",
  });
  assert.deepEqual(packageJson.bugs, {
    url: "https://github.com/DrW00kie1/SNPM/issues",
  });
  assert.equal(packageJson.homepage, "https://github.com/DrW00kie1/SNPM#readme");
}

function assertNoNpmPublishPosture(packageJson) {
  assert.equal(packageJson.publishConfig, undefined);
  assert.equal(packageJson.scripts?.publish, undefined);
  assert.equal(packageJson.scripts?.prepublish, undefined);
  assert.equal(packageJson.scripts?.prepublishOnly, undefined);
  assert.equal(packageJson.scripts?.postpublish, undefined);
  assert.equal(packageJson.scripts?.release, undefined);
  assert.equal(packageJson.config?.registry, undefined);
  assert.equal(packageJson.config?.token, undefined);
  assert.equal(packageJson.config?.npmToken, undefined);
  assert.equal(packageJson.npmToken, undefined);
  assert.equal(packageJson.nodeAuthToken, undefined);
}

test("release policy documents current distribution and npm publish posture", () => {
  const policy = readReleasePolicy();

  assert.match(policy, /source checkout/i);
  assert.match(policy, /reviewed Git or tarball installs/i);
  assert.match(policy, /npm publishing is deferred/i);
  assert.match(policy, /Never publish the unscoped package name `snpm`/);
  assert.match(policy, /owned scoped package name/i);
  assert.match(policy, /explicit approval/i);
});

test("release policy documents required release gates", () => {
  const policy = readReleasePolicy();

  assert.match(policy, /clean clone/i);
  assert.match(policy, /`npm ci`/);
  assert.match(policy, /`npm run release-check`/);
  assert.match(policy, /`npm pack --dry-run --json --ignore-scripts`/);
  assert.match(policy, /Manually review the pack output/i);
  assert.match(policy, /local live SNPM verification/i);
});

test("release policy documents tag, release action, and branch protection governance", () => {
  const policy = readReleasePolicy();

  assert.match(policy, /SemVer/i);
  assert.match(policy, /`vX\.Y\.Z-rc\.N`/);
  assert.match(policy, /`vX\.Y\.Z`/);
  assert.match(policy, /GitHub Releases and npm publishing are separate explicit actions/i);
  assert.match(policy, /Branch protection is a manual requirement before stable releases/i);
});

test("package remains private and does not expose an unscoped npm publish posture", () => {
  const packageJson = readPackageJson();

  assertSafePackageIdentity(packageJson);
  assertNoNpmPublishPosture(packageJson);
  assert.deepEqual(packageJson.bin, {
    snpm: "./src/cli.mjs",
  });
});
