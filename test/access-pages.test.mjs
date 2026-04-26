import test from "node:test";
import assert from "node:assert/strict";

import {
  adoptAccessDomain,
  createAccessDomain,
  createAccessToken,
  createGeneratedAccessToken,
  createGeneratedSecretRecord,
  createSecretRecord,
  diffSecretRecordBody,
  pullAccessTokenBody,
  pullSecretRecordBody,
  pushAccessTokenBody,
  pushSecretRecordBody,
  updateGeneratedAccessToken,
  updateGeneratedSecretRecord,
} from "../src/notion/project-pages.mjs";

const CONFIG = { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } };

function makePageFixture({
  childrenMap,
  markdownByPageId = {},
  pageMeta = {},
  onRequest,
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
      const override = await onRequest?.({
        method,
        apiPath,
        body,
        requestLog,
        markdownByPageId,
        pageMeta,
      });
      if (override !== undefined) {
        return override;
      }

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
    metadata: pulled.metadata,
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
    metadata: pulled.metadata,
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

test("createGeneratedSecretRecord previews without local diffs and applies raw value only to Notion", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "domain", child_page: { title: "App & Backend" } }]],
    ["domain", []],
  ]);
  const fixture = makePageFixture({ childrenMap });
  const generatedValue = "postgres://agent-generated-value@example.invalid/db";

  const preview = await createGeneratedSecretRecord({
    config: CONFIG,
    domainTitle: "App & Backend",
    projectName: "SNPM",
    title: "DATABASE_URL",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(preview.applied, false);
  assert.equal(preview.action, "would-create");
  assert.equal(preview.diff, undefined);
  assert.equal(fixture.requestLog.length, 0);

  const result = await createGeneratedSecretRecord({
    apply: true,
    config: CONFIG,
    domainTitle: "App & Backend",
    generatedValue,
    projectName: "SNPM",
    title: "DATABASE_URL",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
    timestamp: "04-24-2026 10:00:00",
  });

  assert.equal(result.applied, true);
  assert.equal(result.action, "created");
  assert.equal(result.diff, undefined);
  assert.equal(JSON.stringify(result).includes(generatedValue), false);
  assert.match(fixture.markdownByPageId[result.pageId], /## Raw Value/);
  assert.match(fixture.markdownByPageId[result.pageId], /postgres:\/\/agent-generated-value@example.invalid\/db/);
});

test("createGeneratedAccessToken rejects existing records before Notion writes", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "domain", child_page: { title: "App & Backend" } }]],
    ["domain", [{ type: "child_page", id: "token", child_page: { title: "SNPM_NOTION_TOKEN" } }]],
  ]);
  const fixture = makePageFixture({ childrenMap });

  await assert.rejects(
    () => createGeneratedAccessToken({
      apply: true,
      config: CONFIG,
      domainTitle: "App & Backend",
      generatedValue: "ntn_generated_value",
      projectName: "SNPM",
      title: "SNPM_NOTION_TOKEN",
      resolveClient: fixture.resolveClient,
      syncClient: fixture.syncClient,
    }),
    /already exists/,
  );

  assert.equal(fixture.requestLog.some((request) => request.method === "POST" && request.apiPath === "pages"), false);
  assert.equal(fixture.requestLog.some((request) => request.apiPath.endsWith("/markdown")), false);
});

test("createGeneratedSecretRecord rejects invalid generated values before Notion writes", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "domain", child_page: { title: "App & Backend" } }]],
    ["domain", []],
  ]);
  const fixture = makePageFixture({ childrenMap });

  await assert.rejects(
    () => createGeneratedSecretRecord({
      apply: true,
      config: CONFIG,
      domainTitle: "App & Backend",
      generatedValue: "<paste secret here>",
      projectName: "SNPM",
      title: "DATABASE_URL",
      resolveClient: fixture.resolveClient,
      syncClient: fixture.syncClient,
    }),
    /cannot be a placeholder/,
  );

  assert.equal(fixture.requestLog.some((request) => request.method === "POST" && request.apiPath === "pages"), false);
  assert.equal(fixture.requestLog.some((request) => request.apiPath.endsWith("/markdown")), false);
});

test("generated secret helpers redact direct Notion write errors", async () => {
  const sentinel = "postgres://sentinel-secret@example.invalid/db";
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "domain", child_page: { title: "App & Backend" } }]],
    ["domain", []],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    onRequest({ method, apiPath, body }) {
      if (method === "PATCH" && apiPath.endsWith("/markdown")) {
        throw new Error(`Notion echoed ${body.replace_content.new_str}`);
      }
      return undefined;
    },
  });

  await assert.rejects(
    () => createGeneratedSecretRecord({
      apply: true,
      config: CONFIG,
      domainTitle: "App & Backend",
      generatedValue: sentinel,
      projectName: "SNPM",
      title: "DATABASE_URL",
      resolveClient: fixture.resolveClient,
      syncClient: fixture.syncClient,
    }),
    (error) => /\[SNPM REDACTED SECRET OUTPUT\]/.test(error.message)
      && !error.message.includes("sentinel-secret"),
  );
});

test("updateGeneratedSecretRecord replaces only the managed Raw Value in memory", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "domain", child_page: { title: "App & Backend" } }]],
    ["domain", [{ type: "child_page", id: "secret", child_page: { title: "DATABASE_URL" } }]],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      secret: [
        "Purpose: DATABASE_URL is the SNPM-managed secret record for this project access domain.",
        "Canonical Source: Projects \\> SNPM \\> Access \\> App & Backend \\> DATABASE_URL",
        "Read This When: You need the canonical raw value, scope, owner, or rotation path for this secret.",
        "Last Updated: 04-24-2026 09:00:00",
        "Sensitive: yes",
        "---",
        "",
        "## Secret Record",
        "- Secret Name: DATABASE_URL",
        "- System: PostgreSQL",
        "",
        "## Raw Value",
        "Raw Value",
        "```plain text",
        "postgres://old@example.invalid/db",
        "```",
        "",
        "## Rotation / Reset",
        "- Rotate from provider console.",
        "",
      ].join("\n"),
    },
    pageMeta: {
      secret: { last_edited_time: "2026-04-24T16:00:00.000Z" },
    },
  });
  const generatedValue = "postgres://new@example.invalid/db";

  const preview = await updateGeneratedSecretRecord({
    config: CONFIG,
    domainTitle: "App & Backend",
    projectName: "SNPM",
    title: "DATABASE_URL",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });
  assert.equal(preview.applied, false);
  assert.equal(preview.action, "would-update");
  assert.equal(preview.diff, undefined);

  const result = await updateGeneratedSecretRecord({
    apply: true,
    config: CONFIG,
    domainTitle: "App & Backend",
    generatedValue,
    projectName: "SNPM",
    title: "DATABASE_URL",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
    timestamp: "04-24-2026 10:05:00",
  });

  assert.equal(result.applied, true);
  assert.equal(result.action, "updated");
  assert.equal(result.diff, undefined);
  assert.equal(JSON.stringify(result).includes(generatedValue), false);
  assert.match(fixture.markdownByPageId.secret, /postgres:\/\/new@example.invalid\/db/);
  assert.doesNotMatch(fixture.markdownByPageId.secret, /postgres:\/\/old@example.invalid\/db/);
  assert.match(fixture.markdownByPageId.secret, /System: PostgreSQL/);
  assert.match(fixture.markdownByPageId.secret, /Last Updated: 04-24-2026 10:05:00/);
});

test("updateGeneratedAccessToken rejects malformed Raw Value blocks without mutation", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "domain", child_page: { title: "App & Backend" } }]],
    ["domain", [{ type: "child_page", id: "token", child_page: { title: "SNPM_NOTION_TOKEN" } }]],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      token: [
        "Purpose: SNPM_NOTION_TOKEN is the SNPM-managed access token record for this project access domain.",
        "Canonical Source: Projects \\> SNPM \\> Access \\> App & Backend \\> SNPM_NOTION_TOKEN",
        "Read This When: You need the token scope, storage rule, or rotation path for this project token.",
        "Last Updated: 04-24-2026 09:00:00",
        "Sensitive: yes",
        "---",
        "",
        "## Token Record",
        "- Token Name: SNPM_NOTION_TOKEN",
        "",
        "## Raw Value",
        "Raw Value",
        "```plain text",
        "ntn_old",
        "```",
        "```plain text",
        "ntn_second",
        "```",
        "",
      ].join("\n"),
    },
    pageMeta: {
      token: { last_edited_time: "2026-04-24T16:00:00.000Z" },
    },
  });

  await assert.rejects(
    () => updateGeneratedAccessToken({
      apply: true,
      config: CONFIG,
      domainTitle: "App & Backend",
      generatedValue: "ntn_generated_value",
      projectName: "SNPM",
      title: "SNPM_NOTION_TOKEN",
      resolveClient: fixture.resolveClient,
      syncClient: fixture.syncClient,
    }),
    /exactly one fenced value/,
  );

  assert.equal(fixture.requestLog.some((request) => request.method === "PATCH" && request.apiPath.endsWith("/markdown")), false);
});

test("updateGeneratedSecretRecord fails before PATCH when live metadata is stale", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "domain", child_page: { title: "App & Backend" } }]],
    ["domain", [{ type: "child_page", id: "secret", child_page: { title: "DATABASE_URL" } }]],
  ]);
  let pageMetadataReads = 0;
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      secret: [
        "Purpose: DATABASE_URL is the SNPM-managed secret record for this project access domain.",
        "Canonical Source: Projects \\> SNPM \\> Access \\> App & Backend \\> DATABASE_URL",
        "Read This When: You need the canonical raw value, scope, owner, or rotation path for this secret.",
        "Last Updated: 04-24-2026 09:00:00",
        "Sensitive: yes",
        "---",
        "",
        "## Secret Record",
        "- Secret Name: DATABASE_URL",
        "",
        "## Raw Value",
        "Raw Value",
        "```plain text",
        "postgres://old@example.invalid/db",
        "```",
        "",
      ].join("\n"),
    },
    pageMeta: {
      secret: { last_edited_time: "2026-04-24T16:00:00.000Z" },
    },
    onRequest: ({ method, apiPath, pageMeta }) => {
      if (method === "GET" && apiPath === "pages/secret") {
        pageMetadataReads += 1;
        if (pageMetadataReads === 3) {
          pageMeta.secret.last_edited_time = "2026-04-24T16:01:00.000Z";
        }
      }
    },
  });

  await assert.rejects(
    () => updateGeneratedSecretRecord({
      apply: true,
      config: CONFIG,
      domainTitle: "App & Backend",
      generatedValue: "postgres://new@example.invalid/db",
      projectName: "SNPM",
      title: "DATABASE_URL",
      resolveClient: fixture.resolveClient,
      syncClient: fixture.syncClient,
    }),
    /Live page changed while pulling/,
  );

  assert.equal(fixture.requestLog.some((request) => request.method === "PATCH" && request.apiPath.endsWith("/markdown")), false);
  assert.doesNotMatch(fixture.markdownByPageId.secret, /postgres:\/\/new@example.invalid\/db/);
});

test("updateGeneratedAccessToken fails before PATCH when target is archived", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "domain", child_page: { title: "App & Backend" } }]],
    ["domain", [{ type: "child_page", id: "token", child_page: { title: "SNPM_NOTION_TOKEN" } }]],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      token: [
        "Purpose: SNPM_NOTION_TOKEN is the SNPM-managed access token record for this project access domain.",
        "Canonical Source: Projects \\> SNPM \\> Access \\> App & Backend \\> SNPM_NOTION_TOKEN",
        "Read This When: You need the token scope, storage rule, or rotation path for this project token.",
        "Last Updated: 04-24-2026 09:00:00",
        "Sensitive: yes",
        "---",
        "",
        "## Token Record",
        "- Token Name: SNPM_NOTION_TOKEN",
        "",
        "## Raw Value",
        "Raw Value",
        "```plain text",
        "ntn_old",
        "```",
        "",
      ].join("\n"),
    },
    pageMeta: {
      token: {
        archived: true,
        last_edited_time: "2026-04-24T16:00:00.000Z",
      },
    },
  });

  await assert.rejects(
    () => updateGeneratedAccessToken({
      apply: true,
      config: CONFIG,
      domainTitle: "App & Backend",
      generatedValue: "ntn_generated_value",
      projectName: "SNPM",
      title: "SNPM_NOTION_TOKEN",
      resolveClient: fixture.resolveClient,
      syncClient: fixture.syncClient,
    }),
    /archived or in trash/,
  );

  assert.equal(fixture.requestLog.some((request) => request.method === "PATCH" && request.apiPath.endsWith("/markdown")), false);
});

test("diffSecretRecordBody ignores EOF-only missing newline drift", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "domain", child_page: { title: "App & Backend" } }]],
    ["domain", [{ type: "child_page", id: "secret", child_page: { title: "GEMINI_API_KEY" } }]],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      secret: [
        "Purpose: GEMINI_API_KEY is the SNPM-managed secret record for this project access domain.",
        "Canonical Source: Projects \\> SNPM \\> Access \\> App & Backend \\> GEMINI_API_KEY",
        "Read This When: You need the canonical raw value, scope, owner, or rotation path for this secret.",
        "Last Updated: 03-29-2026 12:30:00",
        "Sensitive: yes",
        "---",
        "## Secret Record",
        "- Secret Name: GEMINI_API_KEY",
      ].join("\n"),
    },
    pageMeta: {
      secret: { icon: { type: "emoji", emoji: "🔑" } },
    },
  });

  const result = await diffSecretRecordBody({
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    domainTitle: "App & Backend",
    fileBodyMarkdown: "## Secret Record\n- Secret Name: GEMINI_API_KEY",
    projectName: "SNPM",
    title: "GEMINI_API_KEY",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(result.hasDiff, false);
  assert.equal(result.diff, "");
});
