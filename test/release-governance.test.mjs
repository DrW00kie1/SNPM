import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPECTED_REQUIRED_STATUS_CHECK_CONTEXTS,
  auditReleaseGovernance,
  evaluateReleaseGovernance,
} from "../scripts/release-governance.mjs";

function healthyRepo() {
  return {
    nameWithOwner: "example/snpm",
    visibility: "PUBLIC",
    isPrivate: false,
    defaultBranchRef: { name: "main" },
  };
}

function healthyProtection() {
  return {
    required_status_checks: {
      contexts: EXPECTED_REQUIRED_STATUS_CHECK_CONTEXTS,
    },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  };
}

function healthyPackageJson() {
  return {
    name: "snpm",
    private: true,
    scripts: {
      test: "node --test",
    },
  };
}

function fakeGhCommand(responses, seen = []) {
  return (command, args) => {
    seen.push([command, ...args]);
    assert.equal(command, "gh");

    const key = args.join(" ");
    if (!Object.prototype.hasOwnProperty.call(responses, key)) {
      return {
        status: 1,
        stdout: "",
        stderr: `unexpected command: ${key}`,
      };
    }

    const response = responses[key];
    if (response && typeof response === "object" && Object.prototype.hasOwnProperty.call(response, "status")) {
      return {
        status: response.status,
        stdout: response.stdout ?? "",
        stderr: response.stderr ?? "",
      };
    }

    return {
      status: 0,
      stdout: JSON.stringify(response),
      stderr: "",
    };
  };
}

test("evaluateReleaseGovernance passes for the expected release posture", () => {
  const result = evaluateReleaseGovernance({
    repo: healthyRepo(),
    protection: healthyProtection(),
    releases: [],
    packageJson: healthyPackageJson(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("auditReleaseGovernance reads GitHub facts through gh without mutation commands", () => {
  const seen = [];
  const responses = {
    "repo view --json nameWithOwner,visibility,isPrivate,defaultBranchRef": healthyRepo(),
    "api repos/example/snpm/branches/main/protection": healthyProtection(),
    "release list --limit 100 --json tagName,name,isDraft,isPrerelease": [],
  };

  const result = auditReleaseGovernance({
    runCommand: fakeGhCommand(responses, seen),
    readPackageJson: () => healthyPackageJson(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(seen, [
    ["gh", "repo", "view", "--json", "nameWithOwner,visibility,isPrivate,defaultBranchRef"],
    ["gh", "api", "repos/example/snpm/branches/main/protection"],
    ["gh", "release", "list", "--limit", "100", "--json", "tagName,name,isDraft,isPrerelease"],
  ]);
});

test("auditReleaseGovernance reports drift in repo protection and release usage", () => {
  const protection = {
    required_status_checks: {
      checks: EXPECTED_REQUIRED_STATUS_CHECK_CONTEXTS.slice(0, 2).map((context) => ({ context })),
    },
    allow_force_pushes: { enabled: true },
    allow_deletions: { enabled: true },
  };
  const responses = {
    "repo view --json nameWithOwner,visibility,isPrivate,defaultBranchRef": {
      ...healthyRepo(),
      visibility: "PRIVATE",
      isPrivate: true,
      defaultBranchRef: { name: "develop" },
    },
    "api repos/example/snpm/branches/main/protection": protection,
    "release list --limit 100 --json tagName,name,isDraft,isPrerelease": [{ tagName: "v0.1.0" }],
  };

  const result = auditReleaseGovernance({
    runCommand: fakeGhCommand(responses),
    readPackageJson: () => healthyPackageJson(),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /repository is public/);
  assert.match(result.failures.join("\n"), /default branch is main/);
  assert.match(result.failures.join("\n"), /requires expected CI contexts/);
  assert.match(result.failures.join("\n"), /disallows force pushes/);
  assert.match(result.failures.join("\n"), /disallows deletions/);
  assert.match(result.failures.join("\n"), /GitHub Releases are not in use/);
});

test("auditReleaseGovernance reports missing branch protection instead of aborting", () => {
  const responses = {
    "repo view --json nameWithOwner,visibility,isPrivate,defaultBranchRef": healthyRepo(),
    "api repos/example/snpm/branches/main/protection": {
      status: 1,
      stderr: '{"message":"Branch not protected","status":"404"}\ngh: Branch not protected (HTTP 404)',
    },
    "release list --limit 100 --json tagName,name,isDraft,isPrerelease": [],
  };

  const result = auditReleaseGovernance({
    runCommand: fakeGhCommand(responses),
    readPackageJson: () => healthyPackageJson(),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /main branch protection is visible/);
  assert.match(result.failures.join("\n"), /requires expected CI contexts/);
});

test("evaluateReleaseGovernance reports npm publish posture drift from package metadata", () => {
  const result = evaluateReleaseGovernance({
    repo: healthyRepo(),
    protection: healthyProtection(),
    releases: [],
    packageJson: {
      name: "@owner/snpm",
      private: false,
      publishConfig: { access: "public" },
      scripts: {
        prepublishOnly: "npm test",
      },
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /npm publish posture/);
  assert.match(result.failures.join("\n"), /publishConfig=present/);
  assert.match(result.failures.join("\n"), /prepublishOnly/);
});

test("force push and deletion checks are skipped when protection payload omits those fields", () => {
  const result = evaluateReleaseGovernance({
    repo: healthyRepo(),
    protection: {
      required_status_checks: {
        contexts: EXPECTED_REQUIRED_STATUS_CHECK_CONTEXTS,
      },
    },
    releases: [],
    packageJson: healthyPackageJson(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.checks.some((check) => check.label.includes("force pushes")), false);
  assert.equal(result.checks.some((check) => check.label.includes("deletions")), false);
});
