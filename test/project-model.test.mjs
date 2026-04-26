import test from "node:test";
import assert from "node:assert/strict";

import { loadWorkspaceConfig } from "../src/notion/config.mjs";
import { buildProjectRootNode, expectedCanonicalSource, projectPath } from "../src/notion/project-model.mjs";

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
  const config = loadWorkspaceConfig("infrastructure-hq.example");
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
