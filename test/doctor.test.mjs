import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCESS_DOMAIN_ICON,
  SECRET_RECORD_ICON,
  VALIDATION_SESSION_ICON,
} from "../src/notion/managed-page-templates.mjs";
import { diagnoseProject } from "../src/notion/doctor.mjs";

function paragraph(text) {
  return {
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: text }, plain_text: text }],
    },
  };
}

function childPage(id, title) {
  return {
    type: "child_page",
    id,
    child_page: { title },
  };
}

function childDatabase(id, title) {
  return {
    type: "child_database",
    id,
    child_database: { title },
  };
}

function makeConfig() {
  return {
    notionVersion: "2026-03-11",
    workspace: {
      projectsPageId: "projects-root",
    },
  };
}

function makeFakeClient({
  childrenMap,
  pageMap = new Map(),
  databaseMap = new Map(),
  dataSourceMap = new Map(),
  queryMap = new Map(),
  markdownMap = new Map(),
}) {
  return {
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
    async request(method, apiPath) {
      if (method === "GET" && /^pages\/[^/]+$/.test(apiPath)) {
        return pageMap.get(apiPath.slice("pages/".length)) || { icon: { type: "emoji", emoji: "📄" } };
      }

      if (method === "GET" && /^pages\/[^/]+\/markdown$/.test(apiPath)) {
        const pageId = apiPath.slice("pages/".length, -"/markdown".length);
        return {
          markdown: markdownMap.get(pageId) || "",
          truncated: false,
          unknown_block_ids: [],
        };
      }

      if (method === "GET" && apiPath.startsWith("databases/")) {
        return databaseMap.get(apiPath.slice("databases/".length));
      }

      if (method === "GET" && apiPath.startsWith("data_sources/")) {
        return dataSourceMap.get(apiPath.slice("data_sources/".length));
      }

      if (method === "POST" && apiPath.startsWith("data_sources/") && apiPath.endsWith("/query")) {
        const dataSourceId = apiPath.slice("data_sources/".length, -"/query".length);
        return {
          results: queryMap.get(dataSourceId) || [],
          has_more: false,
          next_cursor: null,
        };
      }

      throw new Error(`Unexpected request: ${method} ${apiPath}`);
    },
  };
}

function makeBaseChildrenMap(projectName = "SNPM") {
  return new Map([
    ["projects-root", [childPage("project", projectName)]],
    ["project", [
      childPage("access", "Access"),
      childPage("ops", "Ops"),
      childPage("runbooks", "Runbooks"),
    ]],
    ["access", [paragraph(`Canonical Source: Projects > ${projectName} > Access`)]],
    ["runbooks", [paragraph(`Canonical Source: Projects > ${projectName} > Runbooks`)]],
    ["ops", [
      childPage("validation", "Validation"),
      paragraph(`Canonical Source: Projects > ${projectName} > Ops`),
    ]],
    ["validation", [paragraph(`Canonical Source: Projects > ${projectName} > Ops > Validation`)]],
  ]);
}

function makeBasePageMap() {
  return new Map([
    ["project", { icon: { type: "emoji", emoji: "🗂️" } }],
    ["access", { icon: { type: "emoji", emoji: "🔐" } }],
    ["ops", { icon: { type: "emoji", emoji: "🛠️" } }],
    ["runbooks", { icon: { type: "emoji", emoji: "📚" } }],
    ["validation", { icon: { type: "emoji", emoji: "🧪" } }],
  ]);
}

test("doctor summarizes empty optional surfaces and recommendations without hard failures", async () => {
  const result = await diagnoseProject({
    config: makeConfig(),
    projectName: "SNPM",
    workspaceClient: makeFakeClient({
      childrenMap: makeBaseChildrenMap(),
      pageMap: makeBasePageMap(),
    }),
  });

  assert.equal(result.authMode, "workspace-token");
  assert.equal(result.projectTokenChecked, false);
  assert.equal(result.issues.length, 0);
  assert.equal(result.surfaces.runbooks.present, true);
  assert.equal(result.surfaces.runbooks.empty, true);
  assert.equal(result.surfaces.builds.present, false);
  assert.equal(result.surfaces.validationSessions.initialized, false);
  assert.equal(result.surfaces.access.empty, true);
  assert.ok(result.recommendations.some((entry) => entry.surface === "builds" && /build-record-create/.test(entry.command)));
  assert.ok(result.recommendations.some((entry) => entry.surface === "validation-sessions" && /validation-sessions-init/.test(entry.command)));
  assert.ok(result.recommendations.some((entry) => entry.surface === "project-token-scope"));
});

test("doctor reports unmanaged runbooks and access descendants as adoptable", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("runbooks", [
    childPage("legacy-runbook", "Legacy Runbook"),
    paragraph("Canonical Source: Projects > SNPM > Runbooks"),
  ]);
  childrenMap.set("access", [
    childPage("app-backend", "App & Backend"),
    paragraph("Canonical Source: Projects > SNPM > Access"),
  ]);
  childrenMap.set("app-backend", [
    childPage("gemini-key", "GEMINI_API_KEY"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("legacy-runbook", { icon: null });
  pageMap.set("app-backend", { icon: null });
  pageMap.set("gemini-key", { icon: SECRET_RECORD_ICON });

  const result = await diagnoseProject({
    config: makeConfig(),
    projectName: "SNPM",
    workspaceClient: makeFakeClient({ childrenMap, pageMap }),
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    verifyScopeImpl: async () => [],
  });

  assert.equal(result.issues.length, 0);
  assert.deepEqual(
    result.adoptable.map((entry) => entry.type).sort(),
    ["access-domain", "runbook", "secret-record"],
  );
  assert.ok(result.adoptable.some((entry) => /runbook-adopt/.test(entry.command)));
  assert.ok(result.adoptable.some((entry) => /access-domain-adopt/.test(entry.command)));
  assert.ok(result.adoptable.some((entry) => /secret-record-adopt/.test(entry.command)));
});

test("doctor surfaces validation-session health failures as hard issues", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("validation", [
    childDatabase("validation-db", "Validation Sessions"),
    paragraph("Canonical Source: Projects > SNPM > Ops > Validation"),
  ]);
  childrenMap.set("session-row", [
    paragraph("Canonical Source: Projects > SNPM > Ops > Validation > Validation Sessions > Regression Pass"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("session-row", { icon: VALIDATION_SESSION_ICON });

  const databaseMap = new Map([
    ["validation-db", {
      id: "validation-db",
      title: [{ plain_text: "Validation Sessions" }],
      icon: { type: "emoji", emoji: "🧪" },
      data_sources: [{ id: "validation-ds" }],
    }],
  ]);
  const queryMap = new Map([
    ["validation-ds", [{
      id: "session-row",
      properties: {
        Name: { title: [{ plain_text: "Regression Pass" }] },
      },
    }]],
  ]);

  const result = await diagnoseProject({
    config: makeConfig(),
    projectName: "SNPM",
    workspaceClient: makeFakeClient({ childrenMap, pageMap, databaseMap, queryMap }),
    verifyValidationSessionsSurfaceImpl: async () => ({
      targetPath: "Projects > SNPM > Ops > Validation > Validation Sessions",
      initialized: true,
      failures: ["Validation Sessions schema mismatch."],
      rowCount: 1,
      authMode: "workspace-token",
    }),
  });

  assert.ok(result.issues.some((issue) => issue.surface === "validation-sessions"));
  assert.equal(result.surfaces.validationSessions.initialized, true);
  assert.equal(result.surfaces.validationSessions.failureCount, 1);
  assert.equal(result.surfaces.validationSessions.managedCount, 1);
  assert.equal(result.surfaces.validationSessions.unmanagedCount, 0);
});

test("doctor includes project-token scope only when requested", async () => {
  const client = makeFakeClient({
    childrenMap: makeBaseChildrenMap("Tall Man Training"),
    pageMap: makeBasePageMap(),
  });

  const withoutToken = await diagnoseProject({
    config: makeConfig(),
    projectName: "Tall Man Training",
    workspaceClient: client,
  });
  const withToken = await diagnoseProject({
    config: makeConfig(),
    projectName: "Tall Man Training",
    workspaceClient: client,
    projectTokenEnv: "TALLMAN_NOTION_TOKEN",
    verifyScopeImpl: async () => ['Project token unexpectedly read forbidden page "Access Index".'],
  });

  assert.equal(withoutToken.projectTokenChecked, false);
  assert.equal("projectTokenScope" in withoutToken.surfaces, false);
  assert.equal(withToken.projectTokenChecked, true);
  assert.equal(withToken.surfaces.projectTokenScope.checked, true);
  assert.equal(withToken.surfaces.projectTokenScope.ok, false);
  assert.ok(withToken.issues.some((issue) => issue.surface === "project-token-scope"));
});
