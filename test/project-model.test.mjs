import test from "node:test";
import assert from "node:assert/strict";

import { loadWorkspaceConfig } from "../src/notion/config.mjs";
import { buildProjectRootNode, expectedCanonicalSource, projectPath } from "../src/notion/project-model.mjs";

function withClearedWorkspaceConfigDir(fn) {
  const previous = process.env.SNPM_WORKSPACE_CONFIG_DIR;
  try {
    delete process.env.SNPM_WORKSPACE_CONFIG_DIR;
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.SNPM_WORKSPACE_CONFIG_DIR;
    } else {
      process.env.SNPM_WORKSPACE_CONFIG_DIR = previous;
    }
  }
}

test("projectPath builds the expected workspace path", () => {
  assert.equal(projectPath("SNPM"), "Projects > SNPM");
  assert.equal(projectPath("SNPM", ["Planning", "Roadmap"]), "Projects > SNPM > Planning > Roadmap");
});

test("expectedCanonicalSource follows the project path contract", () => {
  assert.equal(
    expectedCanonicalSource("SNPM", ["SNPM", "Planning", "Roadmap"]),
    "Canonical Source: Projects > SNPM > Planning > Roadmap",
  );
});

test("buildProjectRootNode reflects the configured starter tree", () => {
  const config = withClearedWorkspaceConfigDir(() => loadWorkspaceConfig("infrastructure-hq.example"));
  const node = buildProjectRootNode("SNPM", config);
  assert.equal(node.title, "SNPM");
  assert.deepEqual(node.children.map((child) => child.title), [
    "Ops",
    "Planning",
    "Access",
    "Vendors",
    "Runbooks",
    "Incidents",
  ]);
});
