import test from "node:test";
import assert from "node:assert/strict";

import {
  adoptValidationSession,
  createValidationSession,
  diffValidationSessionFile,
  initializeValidationSessions,
  pullValidationSessionFile,
  pushValidationSessionFile,
  verifyValidationSessionsSurface,
} from "../src/notion/validation-sessions.mjs";

function makeValidationFixture({
  childrenMap,
  pageMeta = {},
  markdownByPageId = {},
  databases = {},
  dataSources = {},
  rowsByDataSource = {},
}) {
  const requestLog = [];
  let nextId = 1;

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const syncClient = {
    async request(method, apiPath, body) {
      requestLog.push({ method, apiPath, body });

      if (method === "GET" && /^pages\/[^/]+\/markdown$/.test(apiPath)) {
        const pageId = apiPath.slice("pages/".length, -"/markdown".length);
        return {
          markdown: markdownByPageId[pageId] || "",
          truncated: false,
          unknown_block_ids: [],
        };
      }

      if (method === "PATCH" && /^pages\/[^/]+\/markdown$/.test(apiPath)) {
        const pageId = apiPath.slice("pages/".length, -"/markdown".length);
        markdownByPageId[pageId] = body.replace_content.new_str;
        return {
          markdown: body.replace_content.new_str,
          truncated: false,
          unknown_block_ids: [],
        };
      }

      if (method === "GET" && /^pages\/[^/]+$/.test(apiPath)) {
        const pageId = apiPath.slice("pages/".length);
        return { id: pageId, icon: pageMeta[pageId]?.icon || null };
      }

      if (method === "PATCH" && /^pages\/[^/]+$/.test(apiPath)) {
        const pageId = apiPath.slice("pages/".length);
        if (body.icon) {
          pageMeta[pageId] = { ...(pageMeta[pageId] || {}), icon: body.icon };
        }
        if (body.properties) {
          const row = Object.values(rowsByDataSource).flat().find((entry) => entry.id === pageId);
          if (row) {
            row.properties = clone(body.properties);
          }
        }
        return { id: pageId };
      }

      if (method === "POST" && apiPath === "databases") {
        const databaseId = `database-${nextId += 1}`;
        const dataSourceId = `data-source-${nextId += 1}`;
        const parentId = body.parent.page_id;
        const title = body.title[0].text.content;
        const siblings = childrenMap.get(parentId) || [];
        siblings.push({ type: "child_database", id: databaseId, child_database: { title } });
        childrenMap.set(parentId, siblings);
        databases[databaseId] = {
          id: databaseId,
          title: clone(body.title),
          icon: body.icon || null,
          data_sources: [{ id: dataSourceId }],
        };
        dataSources[dataSourceId] = {
          id: dataSourceId,
          properties: clone(body.initial_data_source.properties),
        };
        rowsByDataSource[dataSourceId] = [];
        return { id: databaseId };
      }

      if (method === "GET" && /^databases\/[^/]+$/.test(apiPath)) {
        const databaseId = apiPath.slice("databases/".length);
        return clone(databases[databaseId]);
      }

      if (method === "PATCH" && /^databases\/[^/]+$/.test(apiPath)) {
        const databaseId = apiPath.slice("databases/".length);
        databases[databaseId] = {
          ...databases[databaseId],
          title: body.title ? clone(body.title) : databases[databaseId].title,
          icon: body.icon || databases[databaseId].icon,
        };
        return clone(databases[databaseId]);
      }

      if (method === "GET" && /^data_sources\/[^/]+$/.test(apiPath)) {
        const dataSourceId = apiPath.slice("data_sources/".length);
        return clone(dataSources[dataSourceId]);
      }

      if (method === "PATCH" && /^data_sources\/[^/]+$/.test(apiPath)) {
        const dataSourceId = apiPath.slice("data_sources/".length);
        dataSources[dataSourceId] = {
          ...dataSources[dataSourceId],
          properties: clone(body.properties),
        };
        return clone(dataSources[dataSourceId]);
      }

      if (method === "POST" && /^data_sources\/[^/]+\/query$/.test(apiPath)) {
        const dataSourceId = apiPath.slice("data_sources/".length, -"/query".length);
        return {
          results: clone(rowsByDataSource[dataSourceId] || []),
          has_more: false,
          next_cursor: null,
        };
      }

      if (method === "POST" && apiPath === "pages") {
        const pageId = `row-${nextId += 1}`;
        const dataSourceId = body.parent.data_source_id;
        const row = {
          id: pageId,
          properties: clone(body.properties),
        };
        rowsByDataSource[dataSourceId].push(row);
        pageMeta[pageId] = { icon: null };
        markdownByPageId[pageId] = "";
        return { id: pageId };
      }

      throw new Error(`Unexpected request: ${method} ${apiPath}`);
    },
    async getChildren(pageId) {
      return clone(childrenMap.get(pageId) || []);
    },
  };

  return {
    requestLog,
    syncClient,
    resolveClient: syncClient,
    databases,
    dataSources,
    rowsByDataSource,
    markdownByPageId,
    pageMeta,
  };
}

function baseConfig() {
  return {
    notionVersion: "2026-03-11",
    workspace: { projectsPageId: "projects" },
  };
}

function makeBaseChildren() {
  return new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "ops", child_page: { title: "Ops" } }]],
    ["ops", [{ type: "child_page", id: "validation", child_page: { title: "Validation" } }]],
    ["validation", []],
  ]);
}

test("initializeValidationSessions previews and creates the managed database", async () => {
  const fixture = makeValidationFixture({ childrenMap: makeBaseChildren() });

  const preview = await initializeValidationSessions({
    config: baseConfig(),
    projectName: "SNPM",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });
  assert.equal(preview.applied, false);
  assert.equal(preview.authMode, "project-token");
  assert.match(preview.diff, /Validation Sessions/);

  const applied = await initializeValidationSessions({
    apply: true,
    config: baseConfig(),
    projectName: "SNPM",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });
  assert.equal(applied.applied, true);
  assert.equal(applied.createdDatabase, true);
  assert.ok(applied.databaseId);
  assert.ok(applied.dataSourceId);
  assert.match(applied.nextStep, /UI-only step/i);
});

test("createValidationSession creates a managed row from front matter plus markdown body", async () => {
  const childrenMap = makeBaseChildren();
  const fixture = makeValidationFixture({ childrenMap });
  await initializeValidationSessions({
    apply: true,
    config: baseConfig(),
    projectName: "SNPM",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  const result = await createValidationSession({
    apply: true,
    config: baseConfig(),
    projectName: "SNPM",
    title: "Regression Pass 1",
    fileMarkdown: [
      "---",
      "Platform: Web",
      "Session State: Planned",
      "Tester: Sean",
      "Build Label: v0.3.0-rc1",
      "Runbook URL: https://example.com/runbook",
      "Started On: 2026-03-28",
      "Completed On: 2026-03-29",
      "---",
      "## Findings",
      "- Pending",
      "",
    ].join("\n"),
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
    timestamp: "03-29-2026 11:00:00",
  });

  assert.equal(result.applied, true);
  assert.ok(result.pageId);
  assert.match(result.nextStep, /validation-session-pull/i);
  assert.match(fixture.markdownByPageId[result.pageId], /Canonical Source: Projects \\> SNPM \\> Ops \\> Validation \\> Validation Sessions \\> Regression Pass 1/);
  const row = Object.values(fixture.rowsByDataSource).flat().find((entry) => entry.id === result.pageId);
  assert.equal(row.properties.Platform.select.name, "Web");
  assert.equal(row.properties["Runbook URL"].url, "https://example.com/runbook");
});

test("pull, diff, and push operate on managed validation-session rows", async () => {
  const childrenMap = makeBaseChildren();
  childrenMap.set("validation", [{ type: "child_database", id: "validation-db", child_database: { title: "Validation Sessions" } }]);
  const fixture = makeValidationFixture({
    childrenMap,
    databases: {
      "validation-db": {
        id: "validation-db",
        title: [{ plain_text: "Validation Sessions" }],
        icon: { type: "emoji", emoji: "🧪" },
        data_sources: [{ id: "validation-ds" }],
      },
    },
    dataSources: {
      "validation-ds": {
        id: "validation-ds",
        properties: {
          Name: { type: "title" },
          Platform: { type: "select", select: { options: [{ name: "Web" }, { name: "Android" }, { name: "iPhone" }, { name: "Cross-Platform" }] } },
          "Session State": { type: "select", select: { options: [{ name: "Planned" }, { name: "In Progress" }, { name: "Passed" }, { name: "Failed" }, { name: "Blocked" }] } },
          Tester: { type: "rich_text" },
          "Build Label": { type: "rich_text" },
          "Runbook URL": { type: "url" },
          "Started On": { type: "date" },
          "Completed On": { type: "date" },
        },
      },
    },
    rowsByDataSource: {
      "validation-ds": [{
        id: "session-row",
        properties: {
          Name: { title: [{ plain_text: "Regression Pass 2" }] },
          Platform: { type: "select", select: { name: "Web" } },
          "Session State": { type: "select", select: { name: "Passed" } },
          Tester: { type: "rich_text", rich_text: [{ plain_text: "Sean" }] },
          "Build Label": { type: "rich_text", rich_text: [{ plain_text: "v0.3.0-rc2" }] },
          "Runbook URL": { type: "url", url: "https://example.com/runbook" },
          "Started On": { type: "date", date: { start: "2026-03-28" } },
          "Completed On": { type: "date", date: { start: "2026-03-28" } },
        },
      }],
    },
    markdownByPageId: {
      "session-row": [
        "Purpose: Validation session",
        "Canonical Source: Projects \\> SNPM \\> Ops \\> Validation \\> Validation Sessions \\> Regression Pass 2",
        "Read This When: Session details",
        "Last Updated: 03-28-2026 20:00:00",
        "Sensitive: no",
        "---",
        "## Findings",
        "- Existing",
        "",
      ].join("\n"),
    },
    pageMeta: {
      "session-row": { icon: { type: "emoji", emoji: "🧾" } },
    },
  });

  const pulled = await pullValidationSessionFile({
    config: baseConfig(),
    projectName: "SNPM",
    title: "Regression Pass 2",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });
  assert.match(pulled.fileMarkdown, /Platform: Web/);
  assert.match(pulled.fileMarkdown, /## Findings/);

  const diff = await diffValidationSessionFile({
    config: baseConfig(),
    projectName: "SNPM",
    title: "Regression Pass 2",
    fileMarkdown: pulled.fileMarkdown,
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });
  assert.equal(diff.hasDiff, false);

  const pushed = await pushValidationSessionFile({
    apply: true,
    config: baseConfig(),
    projectName: "SNPM",
    title: "Regression Pass 2",
    fileMarkdown: pulled.fileMarkdown.replace("Session State: Passed", "Session State: Failed").replace("- Existing", "- Updated"),
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
    timestamp: "03-29-2026 11:30:00",
  });
  assert.equal(pushed.applied, true);
  assert.match(fixture.markdownByPageId["session-row"], /Last Updated: 03-29-2026 11:30:00/);
  const row = fixture.rowsByDataSource["validation-ds"][0];
  assert.equal(row.properties["Session State"].select.name, "Failed");
});

test("adoptValidationSession preserves existing row body while standardizing the page", async () => {
  const childrenMap = makeBaseChildren();
  childrenMap.set("validation", [{ type: "child_database", id: "validation-db", child_database: { title: "Validation Sessions" } }]);
  const fixture = makeValidationFixture({
    childrenMap,
    databases: {
      "validation-db": {
        id: "validation-db",
        title: [{ plain_text: "Validation Sessions" }],
        icon: { type: "emoji", emoji: "🧪" },
        data_sources: [{ id: "validation-ds" }],
      },
    },
    dataSources: {
      "validation-ds": {
        id: "validation-ds",
        properties: {
          Name: { type: "title" },
          Platform: { type: "select", select: { options: [{ name: "Web" }] } },
          "Session State": { type: "select", select: { options: [{ name: "Planned" }] } },
          Tester: { type: "rich_text" },
          "Build Label": { type: "rich_text" },
          "Runbook URL": { type: "url" },
          "Started On": { type: "date" },
          "Completed On": { type: "date" },
        },
      },
    },
    rowsByDataSource: {
      "validation-ds": [{
        id: "legacy-session",
        properties: {
          Name: { title: [{ plain_text: "Legacy Session" }] },
          Platform: { type: "select", select: { name: "Web" } },
          "Session State": { type: "select", select: { name: "Planned" } },
          Tester: { type: "rich_text", rich_text: [] },
          "Build Label": { type: "rich_text", rich_text: [] },
          "Runbook URL": { type: "url", url: null },
          "Started On": { type: "date", date: null },
          "Completed On": { type: "date", date: null },
        },
      }],
    },
    markdownByPageId: {
      "legacy-session": "## Manual Notes\n- Keep this body\n",
    },
    pageMeta: {
      "legacy-session": { icon: null },
    },
  });

  const result = await adoptValidationSession({
    apply: true,
    config: baseConfig(),
    projectName: "SNPM",
    title: "Legacy Session",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
    timestamp: "03-29-2026 12:00:00",
  });

  assert.equal(result.applied, true);
  assert.match(result.nextStep, /validation-session-pull/i);
  assert.match(fixture.markdownByPageId["legacy-session"], /Purpose: Legacy Session is the SNPM-managed validation-session report/);
  assert.match(fixture.markdownByPageId["legacy-session"], /## Manual Notes\n- Keep this body/);
});

test("verifyValidationSessionsSurface reports missing initialization without unrelated project drift", async () => {
  const childrenMap = makeBaseChildren();
  childrenMap.set("project-root", [
    { type: "child_page", id: "ops", child_page: { title: "Ops" } },
    { type: "child_page", id: "unexpected", child_page: { title: "Unexpected" } },
  ]);
  const fixture = makeValidationFixture({ childrenMap });

  const result = await verifyValidationSessionsSurface({
    config: baseConfig(),
    projectName: "SNPM",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(result.initialized, false);
  assert.equal(result.rowCount, 0);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /Validation Sessions does not exist/);
  assert.doesNotMatch(result.failures[0], /Unexpected/);
});

test("verifyValidationSessionsSurface reports title, icon, and schema mismatches", async () => {
  const childrenMap = makeBaseChildren();
  childrenMap.set("validation", [{ type: "child_database", id: "validation-db", child_database: { title: "Validation Sessions" } }]);
  const fixture = makeValidationFixture({
    childrenMap,
    databases: {
      "validation-db": {
        id: "validation-db",
        title: [{ plain_text: "Wrong Title" }],
        icon: { type: "emoji", emoji: "📁" },
        data_sources: [{ id: "validation-ds" }],
      },
    },
    dataSources: {
      "validation-ds": {
        id: "validation-ds",
        properties: {
          Name: { type: "title" },
          Platform: { type: "rich_text" },
        },
      },
    },
    rowsByDataSource: {
      "validation-ds": [],
    },
  });

  const result = await verifyValidationSessionsSurface({
    config: baseConfig(),
    projectName: "SNPM",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(result.initialized, true);
  assert.equal(result.rowCount, 0);
  assert.match(result.failures.join("\n"), /Database title mismatch/);
  assert.match(result.failures.join("\n"), /Icon mismatch/);
  assert.match(result.failures.join("\n"), /Missing property "Session State"/);
});

test("verifyValidationSessionsSurface passes on a healthy managed surface and ignores unrelated project extras", async () => {
  const childrenMap = makeBaseChildren();
  childrenMap.set("project-root", [
    { type: "child_page", id: "ops", child_page: { title: "Ops" } },
    { type: "child_page", id: "unexpected", child_page: { title: "Unexpected" } },
  ]);
  childrenMap.set("validation", [{ type: "child_database", id: "validation-db", child_database: { title: "Validation Sessions" } }]);
  const fixture = makeValidationFixture({
    childrenMap,
    databases: {
      "validation-db": {
        id: "validation-db",
        title: [{ plain_text: "Validation Sessions" }],
        icon: { type: "emoji", emoji: "🧪" },
        data_sources: [{ id: "validation-ds" }],
      },
    },
    dataSources: {
      "validation-ds": {
        id: "validation-ds",
        properties: {
          Name: { type: "title" },
          Platform: { type: "select", select: { options: [{ name: "Web" }, { name: "Android" }, { name: "iPhone" }, { name: "Cross-Platform" }] } },
          "Session State": { type: "select", select: { options: [{ name: "Planned" }, { name: "In Progress" }, { name: "Passed" }, { name: "Failed" }, { name: "Blocked" }] } },
          Tester: { type: "rich_text" },
          "Build Label": { type: "rich_text" },
          "Runbook URL": { type: "url" },
          "Started On": { type: "date" },
          "Completed On": { type: "date" },
        },
      },
    },
    rowsByDataSource: {
      "validation-ds": [{
        id: "session-row",
        properties: {
          Name: { title: [{ plain_text: "Regression Pass 2" }] },
          Platform: { type: "select", select: { name: "Web" } },
          "Session State": { type: "select", select: { name: "Passed" } },
          Tester: { type: "rich_text", rich_text: [{ plain_text: "Sean" }] },
          "Build Label": { type: "rich_text", rich_text: [{ plain_text: "v0.3.0-rc2" }] },
          "Runbook URL": { type: "url", url: "https://example.com/runbook" },
          "Started On": { type: "date", date: { start: "2026-03-28" } },
          "Completed On": { type: "date", date: { start: "2026-03-28" } },
        },
      }],
    },
    markdownByPageId: {
      "session-row": [
        "Purpose: Validation session",
        "Canonical Source: Projects \\> SNPM \\> Ops \\> Validation \\> Validation Sessions \\> Regression Pass 2",
        "Read This When: Session details",
        "Last Updated: 03-28-2026 20:00:00",
        "Sensitive: no",
        "---",
        "## Findings",
        "- Existing",
        "",
      ].join("\n"),
    },
    pageMeta: {
      "session-row": { icon: { type: "emoji", emoji: "🧾" } },
    },
  });

  const result = await verifyValidationSessionsSurface({
    config: baseConfig(),
    projectName: "SNPM",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(result.authMode, "project-token");
  assert.equal(result.initialized, true);
  assert.equal(result.rowCount, 1);
  assert.deepEqual(result.failures, []);
});
