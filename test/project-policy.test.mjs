import test from "node:test";
import assert from "node:assert/strict";

import { loadWorkspaceConfig } from "../src/notion/config.mjs";
import { normalizeProjectPolicyPackValue } from "../src/notion/project-policy.mjs";

function makePolicyPack(overrides = {}) {
  return {
    version: 1,
    reservedProjectRoots: ["Ops", "Planning", "Access"],
    approvedPlanningPages: ["Roadmap", "Backlog"],
    curatedWorkspaceDocs: [
      { path: "Templates", pageId: "templates" },
    ],
    curatedTemplateDocs: [
      { path: "Templates > Project Templates", pageId: "project-templates" },
    ],
    projectStarterRoots: [
      {
        title: "Ops",
        children: [],
      },
      {
        title: "Planning",
        children: [
          { title: "Roadmap", children: [] },
          { title: "Backlog", children: [] },
        ],
      },
      {
        title: "Access",
        children: [],
      },
    ],
    optionalSurfaces: [
      {
        surface: "build-records",
        path: "Ops > Builds",
        kind: "page",
        reason: "Build records are optional.",
      },
    ],
    truthBoundaries: [
      {
        surface: "planning",
        recommendedHome: "notion",
        reason: "Planning state belongs in Notion.",
      },
      {
        surface: "repo-doc",
        recommendedHome: "repo",
        reason: "Code-coupled docs stay in the repo.",
      },
    ],
    ...overrides,
  };
}

test("default project policy pack matches the current Infrastructure HQ config", () => {
  const config = loadWorkspaceConfig("infrastructure-hq");

  assert.equal(config.policyPack.version, 1);
  assert.deepEqual(
    config.policyPack.reservedProjectRoots,
    config.projectStarter.children.map((child) => child.title),
  );
  assert.deepEqual(config.policyPack.approvedPlanningPages, [
    "Roadmap",
    "Current Cycle",
    "Backlog",
    "Decision Log",
  ]);
  assert.deepEqual(config.policyPack.curatedWorkspaceDocs, config.workspace.managedDocs.exactPages);
  assert.deepEqual(config.policyPack.curatedTemplateDocs, config.workspace.managedDocs.subtreeRoots);
  assert.deepEqual(config.policyPack.projectStarterRoots, config.projectStarter.children);
  assert.ok(config.policyPack.optionalSurfaces.some((surface) => surface.surface === "build-records"));
  assert.ok(config.policyPack.optionalSurfaces.some((surface) => surface.surface === "validation-sessions"));
  assert.ok(config.policyPack.truthBoundaries.some((boundary) => boundary.surface === "planning"));
  assert.ok(config.policyPack.truthBoundaries.some((boundary) => boundary.surface === "generated-output"));
});

test("explicit project policy pack v1 validates and normalizes", () => {
  const policyPack = normalizeProjectPolicyPackValue(makePolicyPack({
    reservedProjectRoots: [" Ops ", "Planning", "Access"],
  }), "inline config");

  assert.deepEqual(policyPack.reservedProjectRoots, ["Ops", "Planning", "Access"]);
  assert.equal(policyPack.curatedTemplateDocs[0].path, "Templates > Project Templates");
  assert.equal(policyPack.truthBoundaries[0].recommendedHome, "notion");
});

test("project policy pack rejects malformed reserved project roots", () => {
  assert.throws(
    () => normalizeProjectPolicyPackValue(makePolicyPack({
      reservedProjectRoots: ["Ops", ""],
    }), "inline config"),
    /policyPack\.reservedProjectRoots\[1\]/,
  );
});

test("project policy pack rejects malformed starter roots", () => {
  assert.throws(
    () => normalizeProjectPolicyPackValue(makePolicyPack({
      projectStarterRoots: [{ title: "Ops" }],
    }), "inline config"),
    /policyPack\.projectStarterRoots\[0\]\.children/,
  );
});

test("project policy pack rejects starter roots that are not reserved roots", () => {
  assert.throws(
    () => normalizeProjectPolicyPackValue(makePolicyPack({
      reservedProjectRoots: ["Planning"],
    }), "inline config"),
    /reservedProjectRoots must include every policyPack\.projectStarterRoots title\. Missing: "Ops", "Access"/,
  );
});

test("project policy pack rejects duplicate surfaces", () => {
  assert.throws(
    () => normalizeProjectPolicyPackValue(makePolicyPack({
      optionalSurfaces: [
        {
          surface: "build-records",
          path: "Ops > Builds",
          kind: "page",
          reason: "Build records are optional.",
        },
        {
          surface: "build-records",
          path: "Ops > Builds Archive",
          kind: "page",
          reason: "Duplicate surface.",
        },
      ],
    }), "inline config"),
    /duplicate surfaces in policyPack\.optionalSurfaces: "build-records"/,
  );

  assert.throws(
    () => normalizeProjectPolicyPackValue(makePolicyPack({
      truthBoundaries: [
        {
          surface: "planning",
          recommendedHome: "notion",
          reason: "Planning state belongs in Notion.",
        },
        {
          surface: "planning",
          recommendedHome: "repo",
          reason: "Duplicate surface.",
        },
      ],
    }), "inline config"),
    /duplicate surfaces in policyPack\.truthBoundaries: "planning"/,
  );
});

test("project policy pack rejects unsupported versions", () => {
  assert.throws(
    () => normalizeProjectPolicyPackValue(makePolicyPack({
      version: 2,
    }), "inline config"),
    /policyPack\.version must be 1/,
  );
});
