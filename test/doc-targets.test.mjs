import test from "node:test";
import assert from "node:assert/strict";

import {
  findProjectManagedDocTarget,
  findWorkspaceManagedDocTarget,
  normalizeProjectManagedDocPath,
  normalizeWorkspaceManagedDocPath,
  prepareProjectManagedDocCreateTarget,
  prepareWorkspaceManagedDocCreateTarget,
  resolveProjectManagedDocTarget,
  resolveWorkspaceManagedDocTarget,
} from "../src/notion/doc-targets.mjs";

function makeConfig() {
  return {
    workspace: {
      projectsPageId: "projects",
      managedDocs: {
        exactPages: [
          { path: "Infrastructure HQ Home", pageId: "home" },
          { path: "Templates", pageId: "templates-root" },
          { path: "Runbooks > Notion Workspace Workflow", pageId: "workflow-runbook" },
        ],
        subtreeRoots: [
          { path: "Templates > Project Templates", pageId: "project-templates" },
        ],
      },
    },
    projectStarter: {
      children: [
        { title: "Ops", children: [] },
        { title: "Planning", children: [] },
        { title: "Access", children: [] },
        { title: "Vendors", children: [] },
        { title: "Runbooks", children: [] },
        { title: "Incidents", children: [] },
      ],
    },
  };
}

function makeClient(childrenMap) {
  return {
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };
}

test("normalizeProjectManagedDocPath supports Root and Root descendants", () => {
  assert.deepEqual(
    normalizeProjectManagedDocPath("Root > Overview", makeConfig()),
    {
      family: "project-doc",
      createAllowed: true,
      pageSegments: ["Overview"],
      normalizedPath: "Root > Overview",
    },
  );
});

test("normalizeProjectManagedDocPath rejects reserved project roots", () => {
  assert.throws(
    () => normalizeProjectManagedDocPath("Root > Runbooks > Validation", makeConfig()),
    /runbook-\*/i,
  );
  assert.throws(
    () => normalizeProjectManagedDocPath("Runbooks > Validation", makeConfig()),
    /runbook-\*/i,
  );
});

test("normalizeWorkspaceManagedDocPath supports exact pages and template subtree paths", () => {
  const config = makeConfig();
  assert.equal(normalizeWorkspaceManagedDocPath("Templates", config).family, "workspace-exact");
  assert.equal(
    normalizeWorkspaceManagedDocPath("Templates > Project Templates > Overview", config).family,
    "workspace-subtree-doc",
  );
});

test("resolveProjectManagedDocTarget resolves Root and approved planning compatibility paths", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [
      { type: "child_page", id: "overview", child_page: { title: "Overview" } },
      { type: "child_page", id: "planning", child_page: { title: "Planning" } },
    ]],
    ["planning", [{ type: "child_page", id: "roadmap", child_page: { title: "Roadmap" } }]],
  ]);
  const client = makeClient(childrenMap);

  const rootTarget = await resolveProjectManagedDocTarget("SNPM", "Root", makeConfig(), client);
  const planningTarget = await resolveProjectManagedDocTarget("SNPM", "Planning > Roadmap", makeConfig(), client);

  assert.equal(rootTarget.targetPath, "Projects > SNPM");
  assert.equal(planningTarget.targetPath, "Projects > SNPM > Planning > Roadmap");
});

test("prepareProjectManagedDocCreateTarget resolves the parent for a new root doc", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", []],
  ]);

  const target = await prepareProjectManagedDocCreateTarget("SNPM", "Root > Overview", makeConfig(), makeClient(childrenMap));
  assert.equal(target.parentPageId, "project-root");
  assert.equal(target.targetPath, "Projects > SNPM > Overview");
});

test("findProjectManagedDocTarget returns null when a doc is missing", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", []],
  ]);

  const target = await findProjectManagedDocTarget("SNPM", "Root > Missing", makeConfig(), makeClient(childrenMap));
  assert.equal(target, null);
});

test("resolveWorkspaceManagedDocTarget resolves curated exact pages and template descendants", async () => {
  const childrenMap = new Map([
    ["project-templates", [{ type: "child_page", id: "overview", child_page: { title: "Overview" } }]],
  ]);
  const client = makeClient(childrenMap);

  const exactTarget = await resolveWorkspaceManagedDocTarget("Templates", makeConfig(), client);
  const subtreeTarget = await resolveWorkspaceManagedDocTarget("Templates > Project Templates > Overview", makeConfig(), client);

  assert.equal(exactTarget.pageId, "templates-root");
  assert.equal(subtreeTarget.targetPath, "Templates > Project Templates > Overview");
});

test("prepareWorkspaceManagedDocCreateTarget resolves the parent for a new template doc", async () => {
  const childrenMap = new Map([
    ["project-templates", [{ type: "child_page", id: "guides", child_page: { title: "Guides" } }]],
    ["guides", []],
  ]);

  const target = await prepareWorkspaceManagedDocCreateTarget(
    "Templates > Project Templates > Guides > Overview",
    makeConfig(),
    makeClient(childrenMap),
  );

  assert.equal(target.parentPageId, "guides");
  assert.equal(target.targetPath, "Templates > Project Templates > Guides > Overview");
});

test("normalizeWorkspaceManagedDocPath rejects reserved template roots", () => {
  assert.throws(
    () => normalizeWorkspaceManagedDocPath("Templates > Project Templates > Runbooks > Workflow", makeConfig()),
    /runbook-\*/i,
  );
});

test("findWorkspaceManagedDocTarget returns null for a missing template descendant", async () => {
  const target = await findWorkspaceManagedDocTarget(
    "Templates > Project Templates > Missing",
    makeConfig(),
    makeClient(new Map()),
  );

  assert.equal(target, null);
});
