import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCESS_DOMAIN_ICON,
  ACCESS_TOKEN_ICON,
  BUILDS_CONTAINER_ICON,
  RUNBOOK_ICON,
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

function makeFakeClient({
  childrenMap,
  pageMap = new Map(),
  databaseMap = new Map(),
  dataSourceMap = new Map(),
  queryMap = new Map(),
  markdownMap = new Map(),
  markdownRequests,
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
        markdownRequests?.push(pageId);
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
      paragraph(`Canonical Source: Projects > ${projectName}`),
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
  assert.equal("truthAudit" in result, false);
  assert.equal("consistencyAudit" in result, false);
  assert.ok(result.truthBoundaries.some((entry) => entry.surface === "planning" && entry.recommendedHome === "notion"));
  assert.ok(result.truthBoundaries.some((entry) => entry.surface === "project-docs" && entry.recommendedHome === "notion"));
  assert.ok(result.truthBoundaries.some((entry) => entry.surface === "implementation-truth" && entry.recommendedHome === "repo"));
  assert.ok(result.truthBoundaries.some((entry) => entry.surface === "repo-doc" && entry.recommendedHome === "repo"));
  assert.equal(result.issues.length, 0);
  assert.equal(result.surfaces.projectDocs.rootStatus, "managed");
  assert.equal(result.surfaces.projectDocs.totalCount, 0);
  assert.equal(result.surfaces.runbooks.present, true);
  assert.equal(result.surfaces.runbooks.empty, true);
  assert.equal(result.surfaces.builds.present, false);
  assert.equal(result.surfaces.validationSessions.initialized, false);
  assert.equal(result.surfaces.access.empty, true);
  assert.ok(result.recommendations.some((entry) => entry.surface === "builds" && /build-record-create/.test(entry.command)));
  assert.ok(result.recommendations.some((entry) => entry.surface === "validation-sessions" && /validation-sessions-init/.test(entry.command)));
  assert.ok(result.recommendations.some((entry) => entry.surface === "project-token-scope"));
  assert.deepEqual(
    result.migrationGuidance.map((entry) => entry.patternId),
    ["project-token-not-checked", "missing-builds-surface", "missing-validation-sessions-surface"],
  );
});

test("doctor truth audit is opt-in and summarizes mixed managed surfaces with safe next commands", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("project", [
    childPage("access", "Access"),
    childPage("ops", "Ops"),
    childPage("planning", "Planning"),
    childPage("runbooks", "Runbooks"),
    childPage("overview", "Overview"),
    paragraph("Canonical Source: Projects > SNPM"),
  ]);
  childrenMap.set("planning", [
    childPage("current-cycle", "Current Cycle"),
    paragraph("Canonical Source: Projects > SNPM > Planning"),
  ]);
  childrenMap.set("current-cycle", [
    paragraph("Canonical Source: Projects > SNPM > Planning > Current Cycle"),
  ]);
  childrenMap.set("overview", [
    paragraph("Canonical Source: Projects > SNPM > Overview"),
  ]);
  childrenMap.set("runbooks", [
    childPage("release-runbook", "Release"),
    paragraph("Canonical Source: Projects > SNPM > Runbooks"),
  ]);
  childrenMap.set("release-runbook", [
    paragraph("Canonical Source: Projects > SNPM > Runbooks > Release"),
  ]);
  childrenMap.set("access", [
    childPage("prod-domain", "Production"),
    paragraph("Canonical Source: Projects > SNPM > Access"),
  ]);
  childrenMap.set("prod-domain", [
    childPage("prod-secret", "PROD_SECRET"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("planning", { icon: { type: "emoji", emoji: "🗓️" } });
  pageMap.set("current-cycle", { icon: { type: "emoji", emoji: "🗓️" } });
  pageMap.set("overview", { icon: { type: "emoji", emoji: "📄" } });
  pageMap.set("release-runbook", { icon: RUNBOOK_ICON });
  pageMap.set("prod-domain", { icon: ACCESS_DOMAIN_ICON });
  pageMap.set("prod-secret", { icon: SECRET_RECORD_ICON });

  const markdownMap = new Map([
    ["project", "Canonical Source: Projects > SNPM\nLast Updated: 2026-04-24\n---\nCurrent project summary."],
    ["overview", "Canonical Source: Projects > SNPM > Overview\nLast Updated: 2026-04-24\n---\nTODO: replace placeholder."],
    ["planning", "Canonical Source: Projects > SNPM > Planning\nLast Updated: 2026-04-24\n---\nPlanning archive."],
    ["current-cycle", "Canonical Source: Projects > SNPM > Planning > Current Cycle\nLast Updated: 2026-01-01\n---\nActive cycle notes."],
    ["release-runbook", "Canonical Source: Projects > SNPM > Runbooks > Release\n---\nRelease steps."],
    ["prod-secret", "Canonical Source: Projects > SNPM > Access > Production > PROD_SECRET\nLast Updated: 2026-04-24\n---\n## Raw Value\n```text\nsuper-secret\n```"],
  ]);
  const markdownRequests = [];

  const analyzeManagedPageTruthImpl = async (candidate, options) => {
    const findingBase = {
      severity: "warning",
      surface: candidate.surface,
      targetPath: candidate.targetPath,
      pageId: candidate.pageId,
      lastUpdated: null,
      ageDays: null,
      safeNextCommand: candidate.safeNextCommand,
      recoveryAction: candidate.recoveryAction,
    };

    if (!/Last Updated:/i.test(candidate.markdown)) {
      return {
        ...candidate,
        status: "missing-header",
        findings: [{
          ...findingBase,
          code: "missing-last-updated",
          message: `${candidate.targetPath} is missing Last Updated.`,
        }],
      };
    }

    if (/2026-01-01/.test(candidate.markdown)) {
      return {
        ...candidate,
        status: "stale",
        findings: [{
          ...findingBase,
          code: "stale-last-updated",
          lastUpdated: "2026-01-01",
          ageDays: options.staleAfterDays + 1,
          message: `${candidate.targetPath} is stale.`,
        }],
      };
    }

    if (/TODO: replace placeholder/i.test(candidate.markdown)) {
      return {
        ...candidate,
        status: "placeholder",
        findings: [{
          ...findingBase,
          code: "placeholder-content",
          lastUpdated: "2026-04-24",
          ageDays: 0,
          message: `${candidate.targetPath} contains placeholder content.`,
        }],
      };
    }

    return {
      ...candidate,
      status: "clean",
      findings: [],
    };
  };
  const buildTruthAuditSummaryImpl = (analyses, options) => {
    const findings = analyses.flatMap((entry) => entry.findings);
    return {
      checkedCount: analyses.length,
      cleanCount: analyses.filter((entry) => entry.status === "clean").length,
      staleCount: analyses.filter((entry) => entry.status === "stale").length,
      placeholderCount: analyses.filter((entry) => entry.status === "placeholder").length,
      missingHeaderCount: analyses.filter((entry) => entry.status === "missing-header").length,
      staleAfterDays: options.staleAfterDays,
      findings,
      recommendations: findings.map((finding) => ({
        targetPath: finding.targetPath,
        command: finding.safeNextCommand,
      })),
    };
  };

  const result = await diagnoseProject({
    config: makeConfig(),
    projectName: "SNPM",
    workspaceClient: makeFakeClient({
      childrenMap,
      pageMap,
      markdownMap,
      markdownRequests,
    }),
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    truthAudit: true,
    staleAfterDays: 30,
    verifyScopeImpl: async () => [],
    analyzeManagedPageTruthImpl,
    buildTruthAuditSummaryImpl,
  });

  assert.equal(
    result.truthAudit.checkedCount,
    result.truthAudit.cleanCount
      + result.truthAudit.staleCount
      + result.truthAudit.placeholderCount
      + result.truthAudit.missingHeaderCount,
  );
  assert.ok(result.truthAudit.cleanCount >= 1);
  assert.equal(result.truthAudit.staleCount, 1);
  assert.equal(result.truthAudit.placeholderCount, 1);
  assert.equal(result.truthAudit.missingHeaderCount, 1);
  assert.deepEqual(
    result.truthAudit.findings.map((finding) => finding.code).sort(),
    ["missing-last-updated", "placeholder-content", "stale-last-updated"],
  );
  assert.ok(result.truthAudit.findings.every((finding) => /-pull/.test(finding.safeNextCommand)));
  assert.ok(result.truthAudit.findings.every((finding) => /--output/.test(finding.safeNextCommand)));
  assert.ok(result.truthAudit.findings.every((finding) => /SNPM_NOTION_TOKEN/.test(finding.safeNextCommand)));
  assert.equal(markdownRequests.includes("prod-secret"), false);
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
    childPage("project-token", "PROJECT_TOKEN"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("legacy-runbook", { icon: null });
  pageMap.set("app-backend", { icon: null });
  pageMap.set("gemini-key", { icon: SECRET_RECORD_ICON });
  pageMap.set("project-token", { icon: ACCESS_TOKEN_ICON });

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
    ["access-domain", "access-token", "runbook", "secret-record"],
  );
  assert.ok(result.adoptable.some((entry) => /runbook-adopt/.test(entry.command)));
  assert.ok(result.adoptable.some((entry) => /access-domain-adopt/.test(entry.command)));
  assert.ok(result.adoptable.some((entry) => /secret-record-adopt/.test(entry.command)));
  assert.ok(result.adoptable.some((entry) => /access-token-adopt/.test(entry.command)));
  const patternIds = new Set(result.migrationGuidance.map((entry) => entry.patternId));
  assert.equal(patternIds.has("unmanaged-access-domain"), true);
  assert.equal(patternIds.has("unmanaged-secret-record"), true);
  assert.equal(patternIds.has("unmanaged-access-token"), true);
  assert.equal(patternIds.has("unmanaged-runbook"), true);
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

test("doctor summarizes unmanaged build records and untitled validation rows as conditional migration guidance", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("ops", [
    childPage("builds", "Builds"),
    childPage("validation", "Validation"),
    paragraph("Canonical Source: Projects > SNPM > Ops"),
  ]);
  childrenMap.set("builds", [
    childPage("legacy-build", "Legacy Build"),
    paragraph("Canonical Source: Projects > SNPM > Ops > Builds"),
  ]);
  childrenMap.set("validation", [
    childDatabase("validation-db", "Validation Sessions"),
    paragraph("Canonical Source: Projects > SNPM > Ops > Validation"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("builds", { icon: BUILDS_CONTAINER_ICON });
  pageMap.set("legacy-build", { icon: null });

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
      id: "row-without-title",
      properties: {
        Name: { title: [] },
      },
    }]],
  ]);

  const result = await diagnoseProject({
    config: makeConfig(),
    projectName: "SNPM",
    workspaceClient: makeFakeClient({ childrenMap, pageMap, databaseMap, queryMap }),
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    verifyScopeImpl: async () => [],
    verifyValidationSessionsSurfaceImpl: async () => ({
      targetPath: "Projects > SNPM > Ops > Validation > Validation Sessions",
      initialized: true,
      failures: [],
      rowCount: 1,
      authMode: "project-token",
    }),
  });

  assert.deepEqual(
    result.migrationGuidance.map((entry) => entry.patternId),
    ["unmanaged-build-record", "untitled-validation-session-row"],
  );
  assert.ok(result.migrationGuidance.every((entry) => entry.supportTier === "conditional"));
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
  assert.equal(withToken.migrationGuidance.some((entry) => entry.patternId === "project-token-not-checked"), false);
});

test("doctor consistency audit is opt-in, advisory, and avoids raw Access record markdown", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("project", [
    childPage("access", "Access"),
    childPage("ops", "Ops"),
    childPage("planning", "Planning"),
    childPage("runbooks", "Runbooks"),
    childPage("overview", "Overview"),
    paragraph("Canonical Source: Projects > SNPM"),
  ]);
  childrenMap.set("planning", [
    childPage("roadmap", "Roadmap"),
    childPage("current-cycle", "Current Cycle"),
    paragraph("Canonical Source: Projects > SNPM > Planning"),
  ]);
  childrenMap.set("roadmap", [
    paragraph("Canonical Source: Projects > SNPM > Planning > Roadmap"),
  ]);
  childrenMap.set("current-cycle", [
    paragraph("Canonical Source: Projects > SNPM > Planning > Current Cycle"),
  ]);
  childrenMap.set("overview", [
    paragraph("Canonical Source: Projects > SNPM > Overview"),
  ]);
  childrenMap.set("runbooks", [
    childPage("release-runbook", "Release"),
    paragraph("Canonical Source: Projects > SNPM > Runbooks"),
  ]);
  childrenMap.set("release-runbook", [
    paragraph("Canonical Source: Projects > SNPM > Runbooks > Release"),
  ]);
  childrenMap.set("access", [
    childPage("app-backend", "App & Backend"),
    paragraph("Canonical Source: Projects > SNPM > Access"),
  ]);
  childrenMap.set("app-backend", [
    childPage("database-url", "DATABASE_URL"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("planning", { icon: { type: "emoji", emoji: "🗓️" } });
  pageMap.set("roadmap", { icon: { type: "emoji", emoji: "🗓️" } });
  pageMap.set("current-cycle", { icon: { type: "emoji", emoji: "🗓️" } });
  pageMap.set("overview", { icon: { type: "emoji", emoji: "📄" } });
  pageMap.set("release-runbook", { icon: RUNBOOK_ICON });
  pageMap.set("app-backend", { icon: ACCESS_DOMAIN_ICON });
  pageMap.set("database-url", { icon: SECRET_RECORD_ICON });

  const markdownMap = new Map([
    ["project", "Canonical Source: Projects > SNPM\nLast Updated: 2026-04-25\n---\nProject summary."],
    ["overview", "Canonical Source: Projects > SNPM > Overview\nLast Updated: 2026-04-25\n---\nUse `Access > App & Backend > DATABASE_URL`."],
    ["planning", "Canonical Source: Projects > SNPM > Planning\nLast Updated: 2026-04-25\n---\nPlanning index."],
    ["roadmap", "Canonical Source: Projects > SNPM > Planning > Roadmap\nLast Updated: 2026-04-25\n---\n## Milestones\n- Active Sprint: Sprint 5.2A\n- See `Runbooks > Missing Release Runbook`."],
    ["current-cycle", "Canonical Source: Projects > SNPM > Planning > Current Cycle\nLast Updated: 2026-04-25\n---\n## Current Focus\n- Active Sprint: Sprint 5.3A"],
    ["release-runbook", "Canonical Source: Projects > SNPM > Runbooks > Release\nLast Updated: 2026-04-25\n---\nRelease steps."],
    ["database-url", "Canonical Source: Projects > SNPM > Access > App & Backend > DATABASE_URL\nLast Updated: 2026-04-25\n---\n## Raw Value\n```text\nsuper-secret\n```"],
  ]);
  const markdownRequests = [];

  const result = await diagnoseProject({
    config: makeConfig(),
    projectName: "SNPM",
    workspaceClient: makeFakeClient({
      childrenMap,
      pageMap,
      markdownMap,
      markdownRequests,
    }),
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    verifyScopeImpl: async () => [],
    consistencyAudit: true,
  });

  assert.equal(result.issues.length, 0);
  assert.equal(result.consistencyAudit.advisory, true);
  assert.equal(result.consistencyAudit.status, "findings");
  assert.deepEqual(
    result.consistencyAudit.findings.map((finding) => finding.code).sort(),
    [
      "consistency.roadmap-current-cycle.active-marker-mismatch",
      "consistency.runbook-reference.missing",
    ],
  );
  assert.equal(markdownRequests.includes("database-url"), false);
  assert.doesNotMatch(JSON.stringify(result.consistencyAudit), /super-secret/);
});

test("doctor can run truth audit and consistency audit together from one managed-page fetch set", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("project", [
    childPage("planning", "Planning"),
    childPage("access", "Access"),
    childPage("ops", "Ops"),
    childPage("runbooks", "Runbooks"),
    paragraph("Canonical Source: Projects > SNPM"),
  ]);
  childrenMap.set("planning", [
    childPage("roadmap", "Roadmap"),
    childPage("current-cycle", "Current Cycle"),
    paragraph("Canonical Source: Projects > SNPM > Planning"),
  ]);
  childrenMap.set("roadmap", [
    paragraph("Canonical Source: Projects > SNPM > Planning > Roadmap"),
  ]);
  childrenMap.set("current-cycle", [
    paragraph("Canonical Source: Projects > SNPM > Planning > Current Cycle"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("planning", { icon: { type: "emoji", emoji: "🗓️" } });
  pageMap.set("roadmap", { icon: { type: "emoji", emoji: "🗓️" } });
  pageMap.set("current-cycle", { icon: { type: "emoji", emoji: "🗓️" } });
  const markdownMap = new Map([
    ["project", "Canonical Source: Projects > SNPM\nLast Updated: 2026-04-25\n---\nProject summary."],
    ["planning", "Canonical Source: Projects > SNPM > Planning\nLast Updated: 2026-04-25\n---\nPlanning index."],
    ["roadmap", "Canonical Source: Projects > SNPM > Planning > Roadmap\nLast Updated: 2026-04-25\n---\n## Milestones\n- Active Sprint: Sprint 5.2A"],
    ["current-cycle", "Canonical Source: Projects > SNPM > Planning > Current Cycle\nLast Updated: 2026-04-25\n---\n## Current Focus\n- Active Sprint: Sprint 5.2A"],
  ]);
  const markdownRequests = [];

  const result = await diagnoseProject({
    config: makeConfig(),
    projectName: "SNPM",
    workspaceClient: makeFakeClient({
      childrenMap,
      pageMap,
      markdownMap,
      markdownRequests,
    }),
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    verifyScopeImpl: async () => [],
    truthAudit: true,
    consistencyAudit: true,
  });

  assert.ok(result.truthAudit);
  assert.ok(result.consistencyAudit);
  assert.equal(result.consistencyAudit.status, "clean");
  assert.equal(new Set(markdownRequests).size, markdownRequests.length);
});

test("doctor consistency audit is opt-in and receives managed pages plus structural inventories", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("project", [
    childPage("access", "Access"),
    childPage("ops", "Ops"),
    childPage("runbooks", "Runbooks"),
    childPage("overview", "Overview"),
    paragraph("Canonical Source: Projects > SNPM"),
  ]);
  childrenMap.set("overview", [
    paragraph("Canonical Source: Projects > SNPM > Overview"),
  ]);
  childrenMap.set("runbooks", [
    childPage("release-runbook", "Release"),
    paragraph("Canonical Source: Projects > SNPM > Runbooks"),
  ]);
  childrenMap.set("release-runbook", [
    paragraph("Canonical Source: Projects > SNPM > Runbooks > Release"),
  ]);
  childrenMap.set("access", [
    childPage("prod-domain", "Production"),
    paragraph("Canonical Source: Projects > SNPM > Access"),
  ]);
  childrenMap.set("prod-domain", [
    childPage("prod-secret", "PROD_SECRET"),
    childPage("project-token", "PROJECT_TOKEN"),
    paragraph("Canonical Source: Projects > SNPM > Access > Production"),
  ]);
  childrenMap.set("prod-secret", [
    paragraph("Canonical Source: Projects > SNPM > Access > Production > PROD_SECRET"),
  ]);
  childrenMap.set("project-token", [
    paragraph("Canonical Source: Projects > SNPM > Access > Production > PROJECT_TOKEN"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("overview", { icon: { type: "emoji", emoji: "📄" } });
  pageMap.set("release-runbook", { icon: RUNBOOK_ICON });
  pageMap.set("prod-domain", { icon: ACCESS_DOMAIN_ICON });
  pageMap.set("prod-secret", { icon: SECRET_RECORD_ICON });
  pageMap.set("project-token", { icon: ACCESS_TOKEN_ICON });

  const markdownMap = new Map([
    ["project", "Canonical Source: Projects > SNPM\nLast Updated: 2026-04-24\n---\nProject body."],
    ["overview", "Canonical Source: Projects > SNPM > Overview\nLast Updated: 2026-04-24\n---\nOverview body."],
    ["release-runbook", "Canonical Source: Projects > SNPM > Runbooks > Release\nLast Updated: 2026-04-24\n---\nRelease body."],
  ]);
  const markdownRequests = [];
  let capturedContext = null;

  const result = await diagnoseProject({
    config: makeConfig(),
    projectName: "SNPM",
    workspaceClient: makeFakeClient({
      childrenMap,
      pageMap,
      markdownMap,
      markdownRequests,
    }),
    consistencyAudit: true,
    auditConsistencyImpl: async (context) => {
      capturedContext = context;
      return {
        advisory: true,
        ruleset: { id: "test-consistency" },
        checkedCount: context.pages.length,
        cleanCount: context.pages.length,
        findingCount: 0,
        severityCounts: {},
        findings: [],
      };
    },
  });

  assert.equal("truthAudit" in result, false);
  assert.equal(result.consistencyAudit.advisory, true);
  assert.ok(capturedContext.pages.some((page) => page.targetPath === "Projects > SNPM > Overview"));
  assert.ok(capturedContext.pages.every((page) => typeof page.markdown === "string" || typeof page.readFailure === "string"));
  assert.deepEqual(capturedContext.runbookInventory.runbooks.map((entry) => entry.title), ["Release"]);
  assert.equal(capturedContext.runbookInventory.runbooks[0].managed, true);
  assert.equal(capturedContext.accessInventory.domains[0].title, "Production");
  assert.deepEqual(
    capturedContext.accessInventory.domains[0].records.map((entry) => [entry.title, entry.kind, entry.managed]),
    [
      ["PROD_SECRET", "secret-record", true],
      ["PROJECT_TOKEN", "access-token", true],
    ],
  );
  assert.deepEqual(markdownRequests.sort(), ["overview", "project", "release-runbook"]);
});

test("doctor truth audit and consistency audit reuse managed markdown fetches", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("project", [
    childPage("access", "Access"),
    childPage("ops", "Ops"),
    childPage("runbooks", "Runbooks"),
    childPage("overview", "Overview"),
    paragraph("Canonical Source: Projects > SNPM"),
  ]);
  childrenMap.set("overview", [
    paragraph("Canonical Source: Projects > SNPM > Overview"),
  ]);
  childrenMap.set("runbooks", [
    childPage("release-runbook", "Release"),
    paragraph("Canonical Source: Projects > SNPM > Runbooks"),
  ]);
  childrenMap.set("release-runbook", [
    paragraph("Canonical Source: Projects > SNPM > Runbooks > Release"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("overview", { icon: { type: "emoji", emoji: "📄" } });
  pageMap.set("release-runbook", { icon: RUNBOOK_ICON });

  const markdownMap = new Map([
    ["project", "Canonical Source: Projects > SNPM\nLast Updated: 2026-04-24\n---\nProject body."],
    ["overview", "Canonical Source: Projects > SNPM > Overview\nLast Updated: 2026-04-24\n---\nOverview body."],
    ["release-runbook", "Canonical Source: Projects > SNPM > Runbooks > Release\nLast Updated: 2026-04-24\n---\nRelease body."],
  ]);
  const markdownRequests = [];
  let consistencyPageCount = 0;

  const result = await diagnoseProject({
    config: makeConfig(),
    projectName: "SNPM",
    workspaceClient: makeFakeClient({
      childrenMap,
      pageMap,
      markdownMap,
      markdownRequests,
    }),
    truthAudit: true,
    consistencyAudit: true,
    analyzeManagedPageTruthImpl: async (page) => ({
      ...page,
      status: "clean",
      findings: [],
    }),
    buildTruthAuditSummaryImpl: (analyses) => ({
      checkedCount: analyses.length,
      cleanCount: analyses.length,
      staleCount: 0,
      placeholderCount: 0,
      missingHeaderCount: 0,
      findings: [],
      recommendations: [],
    }),
    auditConsistencyImpl: async (context) => {
      consistencyPageCount = context.pages.length;
      return {
        advisory: true,
        checkedCount: context.pages.length,
        cleanCount: context.pages.length,
        findingCount: 0,
        severityCounts: {},
        findings: [],
      };
    },
  });

  assert.equal(result.truthAudit.checkedCount, 3);
  assert.equal(result.consistencyAudit.checkedCount, 3);
  assert.equal(consistencyPageCount, result.truthAudit.checkedCount);
  assert.deepEqual(markdownRequests.sort(), ["overview", "project", "release-runbook"]);
});

test("doctor consistency audit findings remain advisory and do not add structural issues", async () => {
  const result = await diagnoseProject({
    config: makeConfig(),
    projectName: "SNPM",
    workspaceClient: makeFakeClient({
      childrenMap: makeBaseChildrenMap(),
      pageMap: makeBasePageMap(),
      markdownMap: new Map([
        ["project", "Canonical Source: Projects > SNPM\nLast Updated: 2026-04-24\n---\nProject body."],
      ]),
    }),
    consistencyAudit: true,
    auditConsistencyImpl: async () => ({
      advisory: true,
      checkedCount: 1,
      cleanCount: 0,
      findingCount: 1,
      severityCounts: { warning: 1 },
      findings: [{
        code: "consistency-audit.test-warning",
        severity: "warning",
        surface: "planning",
        targetPath: "Projects > SNPM > Planning > Current Cycle",
        message: "Advisory mismatch.",
        safeNextCommand: "npm run page-pull -- --project \"SNPM\" --page \"Planning > Current Cycle\" --output current-cycle.md",
        recoveryAction: "Review the referenced pages before updating.",
      }],
    }),
  });

  assert.equal(result.issues.length, 0);
  assert.equal(result.consistencyAudit.findingCount, 1);
  assert.equal(result.consistencyAudit.findings[0].severity, "warning");
});

test("doctor consistency audit does not fetch raw secret or token bodies for Access inventory", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("access", [
    childPage("app-backend", "App & Backend"),
    paragraph("Canonical Source: Projects > SNPM > Access"),
  ]);
  childrenMap.set("app-backend", [
    childPage("api-key", "API_KEY"),
    childPage("project-token", "PROJECT_TOKEN"),
    paragraph("Canonical Source: Projects > SNPM > Access > App & Backend"),
  ]);
  childrenMap.set("api-key", [
    paragraph("Canonical Source: Projects > SNPM > Access > App & Backend > API_KEY"),
  ]);
  childrenMap.set("project-token", [
    paragraph("Canonical Source: Projects > SNPM > Access > App & Backend > PROJECT_TOKEN"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("app-backend", { icon: ACCESS_DOMAIN_ICON });
  pageMap.set("api-key", { icon: null });
  pageMap.set("project-token", { icon: null });

  const markdownRequests = [];
  let accessInventory = null;
  const result = await diagnoseProject({
    config: makeConfig(),
    projectName: "SNPM",
    workspaceClient: makeFakeClient({
      childrenMap,
      pageMap,
      markdownRequests,
      markdownMap: new Map([
        ["project", "Canonical Source: Projects > SNPM\nLast Updated: 2026-04-24\n---\nProject body."],
        ["api-key", "## Secret Record\n## Raw Value\n```text\nsuper-secret\n```"],
        ["project-token", "## Token Record\n## Raw Value\n```text\nntn_live_secret\n```"],
      ]),
    }),
    consistencyAudit: true,
    auditConsistencyImpl: async (context) => {
      accessInventory = context.accessInventory;
      return {
        advisory: true,
        checkedCount: context.pages.length,
        cleanCount: context.pages.length,
        findingCount: 0,
        severityCounts: {},
        findings: [],
      };
    },
  });

  assert.equal("consistencyAudit" in result, true);
  assert.equal(markdownRequests.includes("api-key"), false);
  assert.equal(markdownRequests.includes("project-token"), false);
  assert.deepEqual(
    accessInventory.domains[0].records.map((entry) => [entry.title, entry.kind]),
    [
      ["API_KEY", "secret-record"],
      ["PROJECT_TOKEN", "access-token"],
    ],
  );
});
