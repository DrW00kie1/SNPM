import test from "node:test";
import assert from "node:assert/strict";

import { loadWorkspaceConfig, resolveWorkspaceConfigPath, validateWorkspaceConfig } from "../src/notion/config.mjs";
import { getManagedDocStarterDocScaffold } from "../src/notion/managed-doc-policy.mjs";

test("loadWorkspaceConfig returns the validated Infrastructure HQ config", () => {
  const config = loadWorkspaceConfig("infrastructure-hq");
  assert.equal(config.notionVersion, "2026-03-11");
  assert.equal(config.projectStarter.children[0].title, "Ops");
  assert.equal(config.policyPack.version, 1);
  assert.deepEqual(config.policyPack.reservedProjectRoots, config.projectStarter.children.map((child) => child.title));
  assert.ok(config.workspace.managedDocs.exactPages.some((entry) => entry.path === "Templates"));
  assert.ok(config.workspace.managedDocs.subtreeRoots.some((entry) => entry.path === "Templates > Project Templates"));
  assert.deepEqual(config.policyPack.starterDocScaffold.map((entry) => entry.target), [
    "Root > Overview",
    "Root > Operating Model",
    "Planning > Roadmap",
    "Planning > Current Cycle",
  ]);
  assert.deepEqual(getManagedDocStarterDocScaffold(config), config.policyPack.starterDocScaffold);
});

test("resolveWorkspaceConfigPath points at the expected workspace file", () => {
  const configPath = resolveWorkspaceConfigPath("infrastructure-hq");
  assert.match(configPath, /config[\\/]workspaces[\\/]infrastructure-hq\.json$/);
});

test("loadWorkspaceConfig throws a helpful error for an unknown workspace", () => {
  assert.throws(
    () => loadWorkspaceConfig("missing-workspace"),
    /Unknown workspace "missing-workspace"/,
  );
});

test("validateWorkspaceConfig rejects malformed starter-tree definitions", () => {
  assert.throws(
    () => validateWorkspaceConfig({
      notionVersion: "2026-03-11",
      workspace: {
        projectsPageId: "projects",
        projectTemplatesPageId: "templates",
        managedDocs: {
          exactPages: [],
          subtreeRoots: [],
        },
        forbiddenScopePageIds: { home: "home" },
      },
      projectStarter: {
        children: [{ title: "", children: [] }],
      },
    }, "inline config"),
    /projectStarter\.children\[0\]\.title/,
  );
});

test("validateWorkspaceConfig accepts an explicit policy pack v1", () => {
  const config = validateWorkspaceConfig({
    notionVersion: "2026-03-11",
    workspace: {
      projectsPageId: "projects",
      projectTemplatesPageId: "templates",
      managedDocs: {
        exactPages: [{ path: "Templates", pageId: "templates" }],
        subtreeRoots: [{ path: "Templates > Project Templates", pageId: "project-templates" }],
      },
      forbiddenScopePageIds: { home: "home" },
    },
    projectStarter: {
      children: [
        {
          title: "Planning",
          children: [
            { title: "Roadmap", children: [] },
            { title: "Current Cycle", children: [] },
          ],
        },
      ],
    },
    policyPack: {
      version: 1,
      reservedProjectRoots: ["Planning"],
      approvedPlanningPages: ["Roadmap", "Current Cycle"],
      curatedWorkspaceDocs: [{ path: "Templates", pageId: "templates" }],
      curatedTemplateDocs: [{ path: "Templates > Project Templates", pageId: "project-templates" }],
      projectStarterRoots: [
        {
          title: "Planning",
          children: [
            { title: "Roadmap", children: [] },
            { title: "Current Cycle", children: [] },
          ],
        },
      ],
      starterDocScaffold: [
        {
          id: "roadmap",
          kind: "planning-page",
          target: "Planning > Roadmap",
          file: "planning/roadmap.md",
          templateId: "planning-roadmap",
        },
      ],
      optionalSurfaces: [
        {
          surface: "validation-sessions",
          path: "Ops > Validation > Validation Sessions",
          kind: "database",
          reason: "Validation Sessions are optional.",
        },
      ],
      truthBoundaries: [
        {
          surface: "planning",
          recommendedHome: "notion",
          reason: "Planning state belongs in Notion.",
        },
      ],
    },
  }, "inline config");

  assert.deepEqual(config.policyPack.approvedPlanningPages, ["Roadmap", "Current Cycle"]);
  assert.equal(config.policyPack.truthBoundaries[0].surface, "planning");
  assert.deepEqual(config.policyPack.starterDocScaffold, [
    {
      id: "roadmap",
      kind: "planning-page",
      target: "Planning > Roadmap",
      file: "planning/roadmap.md",
      templateId: "planning-roadmap",
    },
  ]);
});
