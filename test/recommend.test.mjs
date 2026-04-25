import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCESS_DOMAIN_ICON,
  ACCESS_TOKEN_ICON,
  SECRET_RECORD_ICON,
} from "../src/notion/managed-page-templates.mjs";
import { recommendProjectUpdate } from "../src/notion/recommend.mjs";

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

function makeConfig() {
  return {
    notionVersion: "2026-03-11",
    workspace: {
      projectsPageId: "projects-root",
      managedDocs: {
        exactPages: [
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
      childPage("planning", "Planning"),
      childPage("runbooks", "Runbooks"),
    ]],
    ["access", [paragraph(`Canonical Source: Projects > ${projectName} > Access`)]],
    ["runbooks", [paragraph(`Canonical Source: Projects > ${projectName} > Runbooks`)]],
    ["planning", [
      childPage("roadmap", "Roadmap"),
      childPage("current-cycle", "Current Cycle"),
      childPage("backlog", "Backlog"),
      childPage("decision-log", "Decision Log"),
    ]],
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
    ["planning", { icon: { type: "emoji", emoji: "🗺️" } }],
    ["runbooks", { icon: { type: "emoji", emoji: "📚" } }],
    ["validation", { icon: { type: "emoji", emoji: "🧪" } }],
  ]);
}

test("recommend routes approved planning updates to Notion", async () => {
  const result = await recommendProjectUpdate({
    config: makeConfig(),
    projectName: "SNPM",
    intent: "planning",
    pagePath: "Roadmap",
    workspaceClient: makeFakeClient({
      childrenMap: makeBaseChildrenMap(),
      pageMap: makeBasePageMap(),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.recommendedHome, "notion");
  assert.equal(result.surface, "planning");
  assert.equal(result.targetPath, "Projects > SNPM > Planning > Roadmap");
  assert.equal(result.nextCommands[0].kind, "command");
  assert.match(result.nextCommands[0].command, /npm run page-pull/);
});

test("recommend routes unmanaged runbooks to adopt first", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("runbooks", [
    childPage("legacy-runbook", "Legacy Runbook"),
    paragraph("Canonical Source: Projects > SNPM > Runbooks"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("legacy-runbook", { icon: null });

  const result = await recommendProjectUpdate({
    config: makeConfig(),
    projectName: "SNPM",
    intent: "runbook",
    title: "Legacy Runbook",
    workspaceClient: makeFakeClient({ childrenMap, pageMap }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.recommendedHome, "notion");
  assert.match(result.warnings.join("\n"), /not managed by SNPM/i);
  assert.match(result.nextCommands[0].command, /npm run runbook-adopt/);
  assert.equal(result.migrationGuidance[0].patternId, "unmanaged-runbook");
});

test("recommend routes missing Access domains to domain creation first", async () => {
  const result = await recommendProjectUpdate({
    config: makeConfig(),
    projectName: "SNPM",
    intent: "secret",
    domainTitle: "App & Backend",
    title: "GEMINI_API_KEY",
    workspaceClient: makeFakeClient({
      childrenMap: makeBaseChildrenMap(),
      pageMap: makeBasePageMap(),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.recommendedHome, "notion");
  assert.equal(result.surface, "access");
  assert.equal(result.targetPath, "Projects > SNPM > Access > App & Backend");
  assert.match(result.nextCommands[0].command, /npm run access-domain-create/);
  assert.equal(result.migrationGuidance[0].patternId, "missing-access-domain");
});

test("recommend routes unmanaged Access domains to adopt first with migration guidance", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("access", [
    childPage("app-backend", "App & Backend"),
    paragraph("Canonical Source: Projects > SNPM > Access"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("app-backend", { icon: null });

  const result = await recommendProjectUpdate({
    config: makeConfig(),
    projectName: "SNPM",
    intent: "secret",
    domainTitle: "App & Backend",
    title: "GEMINI_API_KEY",
    workspaceClient: makeFakeClient({ childrenMap, pageMap }),
  });

  assert.equal(result.ok, true);
  assert.match(result.nextCommands[0].command, /npm run access-domain-adopt/);
  assert.equal(result.migrationGuidance[0].patternId, "unmanaged-access-domain");
});

test("recommend routes unmanaged secret records to adopt first with migration guidance", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("access", [
    childPage("app-backend", "App & Backend"),
    paragraph("Canonical Source: Projects > SNPM > Access"),
  ]);
  childrenMap.set("app-backend", [
    childPage("gemini-key", "GEMINI_API_KEY"),
    paragraph("Canonical Source: Projects > SNPM > Access > App & Backend"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("app-backend", { icon: ACCESS_DOMAIN_ICON });
  pageMap.set("gemini-key", { icon: SECRET_RECORD_ICON });

  const result = await recommendProjectUpdate({
    config: makeConfig(),
    projectName: "SNPM",
    intent: "secret",
    domainTitle: "App & Backend",
    title: "GEMINI_API_KEY",
    workspaceClient: makeFakeClient({ childrenMap, pageMap }),
  });

  assert.equal(result.ok, true);
  assert.match(result.nextCommands[0].command, /npm run secret-record-adopt/);
  assert.equal(result.migrationGuidance[0].patternId, "unmanaged-secret-record");
});

test("recommend routes managed access tokens to pull diff push commands", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("access", [
    childPage("app-backend", "App & Backend"),
    paragraph("Canonical Source: Projects > SNPM > Access"),
  ]);
  childrenMap.set("app-backend", [
    childPage("project-token", "Project Token"),
    paragraph("Canonical Source: Projects > SNPM > Access > App & Backend"),
  ]);
  childrenMap.set("project-token", [
    paragraph("Canonical Source: Projects > SNPM > Access > App & Backend > Project Token"),
  ]);

  const pageMap = makeBasePageMap();
  pageMap.set("app-backend", { icon: ACCESS_DOMAIN_ICON });
  pageMap.set("project-token", { icon: ACCESS_TOKEN_ICON });

  const result = await recommendProjectUpdate({
    config: makeConfig(),
    projectName: "SNPM",
    intent: "token",
    domainTitle: "App & Backend",
    title: "Project Token",
    workspaceClient: makeFakeClient({ childrenMap, pageMap }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.recommendedHome, "notion");
  assert.equal(result.targetPath, "Projects > SNPM > Access > App & Backend > Project Token");
  assert.equal(result.nextCommands.length, 4);
  assert.match(result.nextCommands[0].command, /npm run access-token-edit/);
  assert.match(result.nextCommands[1].command, /npm run access-token-pull/);
  assert.match(result.nextCommands[1].command, /\.snpm\/secrets\/access-token\.md/);
  assert.match(result.nextCommands[1].command, /--raw-secret-output/);
  assert.match(result.nextCommands[2].command, /npm run access-token-diff/);
  assert.match(result.nextCommands[3].command, /npm run access-token-push/);
  assert.equal("migrationGuidance" in result, false);
});

test("recommend routes repo docs away from Notion", async () => {
  const result = await recommendProjectUpdate({
    config: makeConfig(),
    projectName: "SNPM",
    intent: "repo-doc",
    repoPath: "docs/operator-roadmap.md",
    workspaceClient: makeFakeClient({
      childrenMap: makeBaseChildrenMap(),
      pageMap: makeBasePageMap(),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.recommendedHome, "repo");
  assert.equal(result.repoPath, "docs/operator-roadmap.md");
  assert.equal(result.nextCommands[0].kind, "repo");
  assert.equal("migrationGuidance" in result, false);
});

test("recommend routes missing project docs to managed doc creation", async () => {
  const result = await recommendProjectUpdate({
    config: makeConfig(),
    projectName: "SNPM",
    intent: "project-doc",
    docPath: "Root > Overview",
    workspaceClient: makeFakeClient({
      childrenMap: makeBaseChildrenMap(),
      pageMap: makeBasePageMap(),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.recommendedHome, "notion");
  assert.equal(result.surface, "project-docs");
  assert.equal(result.targetPath, "Projects > SNPM > Overview");
  assert.match(result.nextCommands[0].command, /npm run doc-create/);
});

test("recommend routes managed template docs to doc pull diff push", async () => {
  const childrenMap = makeBaseChildrenMap();
  childrenMap.set("project-templates", [{ type: "child_page", id: "template-overview", child_page: { title: "Overview" } }]);
  const pageMap = makeBasePageMap();
  const result = await recommendProjectUpdate({
    config: makeConfig(),
    intent: "template-doc",
    docPath: "Templates > Project Templates > Overview",
    workspaceClient: makeFakeClient({
      childrenMap,
      pageMap,
      markdownMap: new Map([
        ["template-overview", [
          "Purpose: Overview",
          "Canonical Source: Templates \\> Project Templates \\> Overview",
          "Read This When: Template overview",
          "Last Updated: 04-06-2026 10:00:00",
          "Sensitive: no",
          "---",
          "## Content",
          "- Existing",
          "",
        ].join("\n")],
      ]),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.recommendedHome, "notion");
  assert.equal(result.targetPath, "Templates > Project Templates > Overview");
  assert.match(result.nextCommands[0].command, /npm run doc-pull/);
  assert.match(result.nextCommands[1].command, /npm run doc-diff/);
  assert.match(result.nextCommands[2].command, /npm run doc-push/);
});

test("recommend routes exact workspace docs to doc adoption when unmanaged", async () => {
  const result = await recommendProjectUpdate({
    config: makeConfig(),
    intent: "workspace-doc",
    docPath: "Runbooks > Notion Workspace Workflow",
    workspaceClient: makeFakeClient({
      childrenMap: makeBaseChildrenMap(),
      pageMap: makeBasePageMap(),
      markdownMap: new Map([
        ["workflow-runbook", "## Existing workflow\n- Keep this\n"],
      ]),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.recommendedHome, "notion");
  assert.match(result.nextCommands[0].command, /npm run doc-adopt/);
});

test("recommend routes generated outputs away from Notion", async () => {
  const result = await recommendProjectUpdate({
    config: makeConfig(),
    projectName: "SNPM",
    intent: "generated-output",
    repoPath: "artifacts/build.json",
    workspaceClient: makeFakeClient({
      childrenMap: makeBaseChildrenMap(),
      pageMap: makeBasePageMap(),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.recommendedHome, "repo");
  assert.equal(result.repoPath, "artifacts/build.json");
  assert.equal(result.nextCommands[0].kind, "repo");
});

test("recommend routes implementation-oriented intents to the repo", async () => {
  for (const intent of ["implementation-note", "design-spec", "task-breakdown", "investigation"]) {
    const result = await recommendProjectUpdate({
      config: makeConfig(),
      projectName: "SNPM",
      intent,
      repoPath: `docs/${intent}.md`,
      workspaceClient: makeFakeClient({
        childrenMap: makeBaseChildrenMap(),
        pageMap: makeBasePageMap(),
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.recommendedHome, "repo");
    assert.equal(result.surface, "implementation-truth");
    assert.equal(result.repoPath, `docs/${intent}.md`);
    assert.equal(result.nextCommands[0].kind, "repo");
  }
});

test("recommend rejects unsupported intents clearly", async () => {
  await assert.rejects(
    recommendProjectUpdate({
      config: makeConfig(),
      projectName: "SNPM",
      intent: "validation-session",
      workspaceClient: makeFakeClient({
        childrenMap: makeBaseChildrenMap(),
        pageMap: makeBasePageMap(),
      }),
    }),
    /Unsupported --intent "validation-session"/,
  );
});
