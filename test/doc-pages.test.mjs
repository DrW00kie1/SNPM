import test from "node:test";
import assert from "node:assert/strict";

import {
  adoptDoc,
  createDoc,
  diffDocBody,
  pullDocBody,
  pushDocBody,
  verifyWorkspaceDocs,
} from "../src/notion/doc-pages.mjs";

function makeConfig() {
  return {
    notionVersion: "2026-03-11",
    workspace: {
      projectsPageId: "projects",
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

function makeFixture({
  childrenMap,
  markdownByPageId = {},
  pageMeta = {},
}) {
  const requestLog = [];
  let nextId = 0;

  const resolveClient = {
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  const syncClient = {
    async request(method, apiPath, body) {
      requestLog.push({ method, apiPath, body });

      if (method === "POST" && apiPath === "pages") {
        nextId += 1;
        const pageId = `created-${nextId}`;
        const parentId = body.parent.page_id;
        const title = body.properties.title.title[0].text.content;
        const siblings = childrenMap.get(parentId) || [];
        siblings.push({ type: "child_page", id: pageId, child_page: { title } });
        childrenMap.set(parentId, siblings);
        pageMeta[pageId] = { icon: null };
        return { id: pageId };
      }

      if (method === "PATCH" && /^pages\/[^/]+$/.test(apiPath)) {
        const pageId = apiPath.slice("pages/".length);
        pageMeta[pageId] = { ...(pageMeta[pageId] || {}), icon: body.icon || null };
        return { id: pageId };
      }

      if (method === "PATCH" && apiPath.endsWith("/markdown")) {
        const pageId = apiPath.slice("pages/".length, -"/markdown".length);
        markdownByPageId[pageId] = body.replace_content.new_str;
        return {
          markdown: body.replace_content.new_str,
          truncated: false,
          unknown_block_ids: [],
        };
      }

      if (method === "GET" && /^pages\/[^/]+\/markdown$/.test(apiPath)) {
        const pageId = apiPath.slice("pages/".length, -"/markdown".length);
        return {
          markdown: markdownByPageId[pageId] || "",
          truncated: false,
          unknown_block_ids: [],
        };
      }

      if (method === "GET" && /^pages\/[^/]+$/.test(apiPath)) {
        const pageId = apiPath.slice("pages/".length);
        return {
          id: pageId,
          icon: pageMeta[pageId]?.icon || null,
          last_edited_time: pageMeta[pageId]?.last_edited_time || "2026-04-23T20:00:00.000Z",
          archived: pageMeta[pageId]?.archived === true,
          in_trash: pageMeta[pageId]?.in_trash === true,
        };
      }

      throw new Error(`Unexpected request: ${method} ${apiPath}`);
    },
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  return { resolveClient, syncClient, requestLog, markdownByPageId, pageMeta };
}

test("createDoc previews a new managed project root doc without mutating", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", []],
  ]);
  const fixture = makeFixture({ childrenMap });

  const result = await createDoc({
    config: makeConfig(),
    docPath: "Root > Overview",
    fileBodyMarkdown: "## Purpose\n- Existing\n",
    projectName: "SNPM",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(result.applied, false);
  assert.equal(result.authMode, "project-token");
  assert.match(result.diff, /Projects \\> SNPM \\> Overview/);
  assert.equal(fixture.requestLog.length, 0);
});

test("createDoc apply creates a managed template doc", async () => {
  const childrenMap = new Map([
    ["project-templates", []],
  ]);
  const fixture = makeFixture({ childrenMap });

  const result = await createDoc({
    apply: true,
    config: makeConfig(),
    docPath: "Templates > Project Templates > Overview",
    fileBodyMarkdown: "## Purpose\n- Template guidance\n",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(result.applied, true);
  assert.match(fixture.markdownByPageId[result.pageId], /Canonical Source: Templates \\> Project Templates \\> Overview/);
});

test("adoptDoc wraps a dividerless page with the managed doc header", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "overview", child_page: { title: "Overview" } }]],
  ]);
  const fixture = makeFixture({
    childrenMap,
    markdownByPageId: {
      overview: "## Existing Section\n- Keep this content\n",
    },
  });

  const result = await adoptDoc({
    apply: true,
    config: makeConfig(),
    docPath: "Root > Overview",
    projectName: "SNPM",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
    timestamp: "04-06-2026 10:00:00",
  });

  assert.equal(result.applied, true);
  assert.match(fixture.markdownByPageId.overview, /Purpose: Overview is the SNPM-managed doc/);
  assert.match(fixture.markdownByPageId.overview, /## Existing Section\n- Keep this content/);
});

test("pullDocBody and pushDocBody use the managed body for an existing workspace doc", async () => {
  const childrenMap = new Map();
  const fixture = makeFixture({
    childrenMap,
    markdownByPageId: {
      "workflow-runbook": [
        "Purpose: Workflow doc",
        "Canonical Source: Runbooks \\> Notion Workspace Workflow",
        "Read This When: Current workflow",
        "Last Updated: 04-06-2026 10:00:00",
        "Sensitive: no",
        "---",
        "## Steps",
        "- Existing",
        "",
      ].join("\n"),
    },
  });

  const pulled = await pullDocBody({
    config: makeConfig(),
    docPath: "Runbooks > Notion Workspace Workflow",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });
  assert.equal(pulled.bodyMarkdown, "## Steps\n- Existing\n");

  const pushed = await pushDocBody({
    apply: true,
    config: makeConfig(),
    docPath: "Runbooks > Notion Workspace Workflow",
    fileBodyMarkdown: "## Steps\n- Updated\n",
    metadata: pulled.metadata,
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
    timestamp: "04-06-2026 11:00:00",
  });

  assert.equal(pushed.applied, true);
  assert.match(fixture.markdownByPageId["workflow-runbook"], /## Steps\n- Updated/);
});

test("diffDocBody ignores EOF-only newline drift on managed docs", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "overview", child_page: { title: "Overview" } }]],
  ]);
  const fixture = makeFixture({
    childrenMap,
    markdownByPageId: {
      overview: [
        "Purpose: Overview is the SNPM-managed doc for this curated Notion surface.",
        "Canonical Source: Projects \\> SNPM \\> Overview",
        "Read This When: You need the current reference content for this page.",
        "Last Updated: 04-06-2026 10:00:00",
        "Sensitive: no",
        "---",
        "## Summary",
        "- Existing",
      ].join("\n"),
    },
  });

  const result = await diffDocBody({
    config: makeConfig(),
    docPath: "Root > Overview",
    fileBodyMarkdown: "## Summary\n- Existing",
    projectName: "SNPM",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(result.hasDiff, false);
  assert.equal(result.diff, "");
});

test("diffDocBody ignores managed-doc normalization artifacts for paths and placeholders", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "overview", child_page: { title: "Overview" } }]],
  ]);
  const fixture = makeFixture({
    childrenMap,
    markdownByPageId: {
      overview: [
        "Purpose: Overview is the SNPM-managed doc for this curated Notion surface.",
        "Canonical Source: Projects \\> SNPM \\> Overview",
        "Read This When: You need the current reference content for this page.",
        "Last Updated: 04-06-2026 10:00:00",
        "Sensitive: no",
        "---",
        "Path: docs/[live-notion-docs.md](http://live-notion-docs.md)",
        "Repo root: C:\\SNPM",
        "Workspace: Templates \\> Project Templates",
        "Placeholder: \\<PROJECT_NAME\\>",
        "Token: \\[PROJECT_TOKEN_ENV\\]",
      ].join("\n"),
    },
  });

  const result = await diffDocBody({
    config: makeConfig(),
    docPath: "Root > Overview",
    fileBodyMarkdown: [
      "Path: docs/live-notion-docs.md",
      "Repo root: C:/SNPM",
      "Workspace: Templates > Project Templates",
      "Placeholder: <PROJECT_NAME>",
      "Token: [PROJECT_TOKEN_ENV]",
      "",
    ].join("\n"),
    projectName: "SNPM",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(result.hasDiff, false);
  assert.equal(result.diff, "");
});

test("verifyWorkspaceDocs checks curated exact pages and template descendants", async () => {
  const childrenMap = new Map([
    ["project-templates", [{ type: "child_page", id: "overview", child_page: { title: "Overview" } }]],
  ]);
  const fixture = makeFixture({
    childrenMap,
    markdownByPageId: {
      "templates-root": [
        "Purpose: Templates",
        "Canonical Source: Templates",
        "Read This When: Template index",
        "Last Updated: 04-06-2026 10:00:00",
        "Sensitive: no",
        "---",
        "## Content",
        "- Existing",
        "",
      ].join("\n"),
      "workflow-runbook": [
        "Purpose: Workflow doc",
        "Canonical Source: Runbooks \\> Notion Workspace Workflow",
        "Read This When: Workflow",
        "Last Updated: 04-06-2026 10:00:00",
        "Sensitive: no",
        "---",
        "## Content",
        "- Existing",
        "",
      ].join("\n"),
      "project-templates": [
        "Purpose: Templates",
        "Canonical Source: Templates \\> Project Templates",
        "Read This When: Template root",
        "Last Updated: 04-06-2026 10:00:00",
        "Sensitive: no",
        "---",
        "## Content",
        "- Existing",
        "",
      ].join("\n"),
      overview: [
        "Purpose: Overview",
        "Canonical Source: Templates \\> Project Templates \\> Overview",
        "Read This When: Template overview",
        "Last Updated: 04-06-2026 10:00:00",
        "Sensitive: no",
        "---",
        "## Content",
        "- Existing",
        "",
      ].join("\n"),
    },
  });

  const result = await verifyWorkspaceDocs({
    config: makeConfig(),
    client: fixture.syncClient,
  });

  assert.equal(result.failures.length, 0);
  assert.ok(result.checkedPaths.includes("Templates > Project Templates > Overview"));
});
