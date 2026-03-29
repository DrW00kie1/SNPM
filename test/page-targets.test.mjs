import test from "node:test";
import assert from "node:assert/strict";

import {
  APPROVED_PLANNING_PAGE_PATHS,
  parseApprovedPlanningPagePath,
  resolveApprovedPlanningPageTarget,
} from "../src/notion/page-targets.mjs";

test("approved planning targets stay limited to the four planning pages", () => {
  assert.deepEqual(APPROVED_PLANNING_PAGE_PATHS, [
    "Planning > Roadmap",
    "Planning > Current Cycle",
    "Planning > Backlog",
    "Planning > Decision Log",
  ]);
});

test("parseApprovedPlanningPagePath accepts the approved planning targets", () => {
  assert.deepEqual(
    parseApprovedPlanningPagePath("Planning > Current Cycle"),
    ["Planning", "Current Cycle"],
  );
});

test("parseApprovedPlanningPagePath rejects unsupported targets", () => {
  assert.throws(
    () => parseApprovedPlanningPagePath("Ops > Environments"),
    /Approved page targets are limited to/,
  );
});

test("resolveApprovedPlanningPageTarget walks the project subtree", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "planning", child_page: { title: "Planning" } }]],
    ["planning", [{ type: "child_page", id: "roadmap", child_page: { title: "Roadmap" } }]],
  ]);

  const client = {
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  const target = await resolveApprovedPlanningPageTarget("SNPM", "Planning > Roadmap", {
    workspace: { projectsPageId: "projects" },
  }, client);

  assert.equal(target.pageId, "roadmap");
  assert.equal(target.targetPath, "Projects > SNPM > Planning > Roadmap");
});
