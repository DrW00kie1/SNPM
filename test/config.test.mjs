import test from "node:test";
import assert from "node:assert/strict";

import { loadWorkspaceConfig, resolveWorkspaceConfigPath, validateWorkspaceConfig } from "../src/notion/config.mjs";

test("loadWorkspaceConfig returns the validated Infrastructure HQ config", () => {
  const config = loadWorkspaceConfig("infrastructure-hq");
  assert.equal(config.notionVersion, "2026-03-11");
  assert.equal(config.projectStarter.children[0].title, "Ops");
  assert.ok(config.workspace.managedDocs.exactPages.some((entry) => entry.path === "Templates"));
  assert.ok(config.workspace.managedDocs.subtreeRoots.some((entry) => entry.path === "Templates > Project Templates"));
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
