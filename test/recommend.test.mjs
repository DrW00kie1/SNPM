import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCESS_DOMAIN_ICON,
  ACCESS_TOKEN_ICON,
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
  assert.equal(result.nextCommands.length, 3);
  assert.match(result.nextCommands[0].command, /npm run access-token-pull/);
  assert.match(result.nextCommands[1].command, /npm run access-token-diff/);
  assert.match(result.nextCommands[2].command, /npm run access-token-push/);
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
