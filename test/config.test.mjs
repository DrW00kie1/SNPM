import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadWorkspaceConfig, resolveWorkspaceConfigPath, validateWorkspaceConfig } from "../src/notion/config.mjs";
import { getManagedDocStarterDocScaffold } from "../src/notion/managed-doc-policy.mjs";

test("loadWorkspaceConfig returns the validated Infrastructure HQ config", () => {
  const config = loadWorkspaceConfig("infrastructure-hq.example");
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

test("SNPM_WORKSPACE_CONFIG_DIR points config loading at private local configs", () => {
  const previous = process.env.SNPM_WORKSPACE_CONFIG_DIR;
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-workspace-config-"));
  try {
    writeFileSync(path.join(tempDir, "private-workspace.json"), JSON.stringify({
      notionVersion: "2026-03-11",
      workspace: {
        projectsPageId: "private-projects-page-id",
        projectTemplatesPageId: "private-project-templates-page-id",
        managedDocs: {
          exactPages: [{ path: "Projects", pageId: "private-projects-page-id" }],
          subtreeRoots: [{ path: "Templates > Project Templates", pageId: "private-project-templates-page-id" }],
        },
        forbiddenScopePageIds: { home: "private-home-page-id" },
      },
      projectStarter: {
        children: [{ title: "Planning", children: [{ title: "Roadmap", children: [] }] }],
      },
    }));
    process.env.SNPM_WORKSPACE_CONFIG_DIR = tempDir;

    const config = loadWorkspaceConfig("private-workspace");

    assert.match(resolveWorkspaceConfigPath("private-workspace"), /private-workspace\.json$/);
    assert.equal(config.workspace.projectsPageId, "private-projects-page-id");
    assert.equal(config.projectStarter.children[0].title, "Planning");
  } finally {
    if (previous === undefined) {
      delete process.env.SNPM_WORKSPACE_CONFIG_DIR;
    } else {
      process.env.SNPM_WORKSPACE_CONFIG_DIR = previous;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loadWorkspaceConfig throws a helpful error for an unknown workspace", () => {
  assert.throws(
    () => loadWorkspaceConfig("missing-workspace"),
    /Unknown workspace "missing-workspace"/,
  );
});

test("workspace names are validated before config path traversal can read files", () => {
  const previous = process.env.SNPM_WORKSPACE_CONFIG_DIR;
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-workspace-validation-"));
  const configDir = path.join(tempDir, "configs");
  try {
    mkdirSync(configDir);
    writeFileSync(path.join(tempDir, "escape.json"), JSON.stringify({
      notionVersion: "2026-03-11",
      workspace: {
        projectsPageId: "escaped-projects-page-id",
        projectTemplatesPageId: "escaped-project-templates-page-id",
        managedDocs: {
          exactPages: [{ path: "Projects", pageId: "escaped-projects-page-id" }],
          subtreeRoots: [{ path: "Templates > Project Templates", pageId: "escaped-project-templates-page-id" }],
        },
        forbiddenScopePageIds: { home: "escaped-home-page-id" },
      },
      projectStarter: {
        children: [{ title: "Planning", children: [] }],
      },
    }));
    process.env.SNPM_WORKSPACE_CONFIG_DIR = configDir;

    assert.throws(
      () => loadWorkspaceConfig("../escape"),
      /Workspace name must be a safe config basename/i,
    );
    assert.throws(
      () => resolveWorkspaceConfigPath("infrastructure-hq/../../escape"),
      /Workspace name must be a safe config basename/i,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.SNPM_WORKSPACE_CONFIG_DIR;
    } else {
      process.env.SNPM_WORKSPACE_CONFIG_DIR = previous;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
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
