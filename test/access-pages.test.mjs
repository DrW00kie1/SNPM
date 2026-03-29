import test from "node:test";
import assert from "node:assert/strict";

import {
  adoptAccessDomain,
  createAccessDomain,
  createAccessToken,
  createSecretRecord,
  pullAccessTokenBody,
  pullSecretRecordBody,
  pushAccessTokenBody,
  pushSecretRecordBody,
} from "../src/notion/project-pages.mjs";

function makePageFixture({
  childrenMap,
  markdownByPageId = {},
  pageMeta = {},
}) {
  const requestLog = [];
  let nextId = 1;

  const resolveClient = {
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  const syncClient = {
    async request(method, apiPath, body) {
      requestLog.push({ method, apiPath, body });

      if (method === "POST" && apiPath === "pages") {
        const pageId = `created-${nextId += 1}`;
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
        pageMeta[pageId] = { ...(pageMeta[pageId] || {}), icon: body.icon || pageMeta[pageId]?.icon || null };
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
        return { id: pageId, icon: pageMeta[pageId]?.icon || null };
      }

      throw new Error(`Unexpected request: ${method} ${apiPath}`);
    },
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  return { resolveClient, syncClient, requestLog, markdownByPageId, pageMeta };
}

test("createAccessDomain previews and creates a managed access domain page", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", []],
  ]);
  const fixture = makePageFixture({ childrenMap });

  const preview = await createAccessDomain({
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    fileBodyMarkdown: "## System\n- Backend services\n",
    projectName: "SNPM",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    title: "App & Backend",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(preview.applied, false);
  assert.match(preview.diff, /App & Backend/);
  assert.equal(fixture.requestLog.length, 0);

  const applied = await createAccessDomain({
    apply: true,
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    fileBodyMarkdown: "## System\n- Backend services\n",
    projectName: "SNPM",
    title: "App & Backend",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(applied.applied, true);
  assert.ok(applied.pageId);
  assert.match(fixture.markdownByPageId[applied.pageId], /Canonical Source: Projects \\> SNPM \\> Access \\> App & Backend/);
});

test("adoptAccessDomain preserves the existing domain body while adding the managed header", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "legacy-domain", child_page: { title: "App & Backend" } }]],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      "legacy-domain": "## System\n- Existing domain content\n",
    },
    pageMeta: {
      "legacy-domain": { icon: null },
    },
  });

  const result = await adoptAccessDomain({
    apply: true,
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    projectName: "SNPM",
    title: "App & Backend",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
    timestamp: "03-29-2026 12:00:00",
  });

  assert.equal(result.applied, true);
  assert.match(fixture.markdownByPageId["legacy-domain"], /Purpose: App & Backend is the SNPM-managed access domain page/);
  assert.match(fixture.markdownByPageId["legacy-domain"], /## System\n- Existing domain content/);
});

test("createSecretRecord requires an existing access domain", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", []],
  ]);
  const fixture = makePageFixture({ childrenMap });

  await assert.rejects(
    () => createSecretRecord({
      config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
      domainTitle: "App & Backend",
      fileBodyMarkdown: "## Secret Record\n- Secret Name: GEMINI_API_KEY\n",
      projectName: "SNPM",
      title: "GEMINI_API_KEY",
      resolveClient: fixture.resolveClient,
      syncClient: fixture.syncClient,
    }),
    /Use "access-domain create" or "access-domain adopt" first/,
  );
});

test("pullSecretRecordBody rejects unmanaged secret pages with adopt guidance", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "domain", child_page: { title: "App & Backend" } }]],
    ["domain", [{ type: "child_page", id: "secret", child_page: { title: "GEMINI_API_KEY" } }]],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      secret: "## Raw Value\n```plain text\nsecret\n```\n",
    },
  });

  await assert.rejects(
    () => pullSecretRecordBody({
      config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
      domainTitle: "App & Backend",
      projectName: "SNPM",
      title: "GEMINI_API_KEY",
      resolveClient: fixture.resolveClient,
      syncClient: fixture.syncClient,
    }),
    /Use "secret-record adopt" first/,
  );
});

test("secret-record pull and push work on managed secret pages", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "domain", child_page: { title: "App & Backend" } }]],
    ["domain", []],
  ]);
  const fixture = makePageFixture({ childrenMap });
  const created = await createSecretRecord({
    apply: true,
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    domainTitle: "App & Backend",
    fileBodyMarkdown: "## Secret Record\n- Secret Name: GEMINI_API_KEY\n",
    projectName: "SNPM",
    title: "GEMINI_API_KEY",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  const pulled = await pullSecretRecordBody({
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    domainTitle: "App & Backend",
    projectName: "SNPM",
    title: "GEMINI_API_KEY",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });
  assert.match(pulled.bodyMarkdown, /## Secret Record/);

  const pushed = await pushSecretRecordBody({
    apply: true,
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    domainTitle: "App & Backend",
    fileBodyMarkdown: "## Secret Record\n- Secret Name: GEMINI_API_KEY\n- System: Gemini\n",
    projectName: "SNPM",
    title: "GEMINI_API_KEY",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
    timestamp: "03-29-2026 12:30:00",
  });

  assert.equal(pushed.applied, true);
  assert.equal(created.pageId, pushed.pageId);
  assert.match(fixture.markdownByPageId[pushed.pageId], /Last Updated: 03-29-2026 12:30:00/);
  assert.match(fixture.markdownByPageId[pushed.pageId], /System: Gemini/);
});

test("access-token pull and push work on managed token pages", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "domain", child_page: { title: "App & Backend" } }]],
    ["domain", []],
  ]);
  const fixture = makePageFixture({ childrenMap });

  const created = await createAccessToken({
    apply: true,
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    domainTitle: "App & Backend",
    fileBodyMarkdown: "## Token Record\n- Token Name: SNPM_NOTION_TOKEN\n",
    projectName: "SNPM",
    title: "SNPM_NOTION_TOKEN",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  const pulled = await pullAccessTokenBody({
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    domainTitle: "App & Backend",
    projectName: "SNPM",
    title: "SNPM_NOTION_TOKEN",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });
  assert.match(pulled.bodyMarkdown, /## Token Record/);

  const pushed = await pushAccessTokenBody({
    apply: true,
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    domainTitle: "App & Backend",
    fileBodyMarkdown: "## Token Record\n- Token Name: SNPM_NOTION_TOKEN\n- System: Notion\n",
    projectName: "SNPM",
    title: "SNPM_NOTION_TOKEN",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
    timestamp: "03-29-2026 12:45:00",
  });

  assert.equal(pushed.applied, true);
  assert.equal(created.pageId, pushed.pageId);
  assert.match(fixture.markdownByPageId[pushed.pageId], /Last Updated: 03-29-2026 12:45:00/);
  assert.match(fixture.markdownByPageId[pushed.pageId], /System: Notion/);
});
