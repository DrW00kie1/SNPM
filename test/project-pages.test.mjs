import test from "node:test";
import assert from "node:assert/strict";

import {
  adoptRunbook,
  createBuildRecord,
  createRunbook,
  diffBuildRecordBody,
  diffRunbookBody,
  pullBuildRecordBody,
  pullRunbookBody,
  pushBuildRecordBody,
} from "../src/notion/project-pages.mjs";

const MANAGED_BUILD_RECORD_MARKDOWN = [
  "Purpose: Build record",
  "Canonical Source: Projects \\> SNPM \\> Ops \\> Builds \\> Validation Build",
  "Read This When: Build state",
  "Last Updated: 03-28-2026 20:00:00",
  "Sensitive: no",
  "---",
  "## Build Summary",
  "- Existing body",
  "",
].join("\n");

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

test("createRunbook previews a managed page diff without mutating", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "runbooks", child_page: { title: "Runbooks" } }]],
    ["runbooks", []],
  ]);
  const fixture = makePageFixture({ childrenMap });

  const result = await createRunbook({
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    fileBodyMarkdown: "## Procedure\n- Step one\n",
    projectName: "SNPM",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    title: "Validation Runbook",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(result.applied, false);
  assert.equal(result.authMode, "project-token");
  assert.match(result.diff, /Validation Runbook/);
  assert.equal(fixture.requestLog.length, 0);
});

test("createRunbook apply creates the page, icon, and managed markdown", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "runbooks", child_page: { title: "Runbooks" } }]],
    ["runbooks", []],
  ]);
  const fixture = makePageFixture({ childrenMap });

  const result = await createRunbook({
    apply: true,
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    fileBodyMarkdown: "## Procedure\n- Step one\n",
    projectName: "SNPM",
    title: "Validation Runbook",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(result.applied, true);
  assert.ok(result.pageId);
  assert.equal(fixture.requestLog.filter((entry) => entry.method === "POST").length, 1);
  assert.equal(fixture.requestLog.filter((entry) => entry.apiPath.endsWith("/markdown")).length, 1);
  assert.match(fixture.markdownByPageId[result.pageId], /Canonical Source: Projects \\> SNPM \\> Runbooks \\> Validation Runbook/);
});

test("adoptRunbook preserves the existing body while adding the managed header", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "runbooks", child_page: { title: "Runbooks" } }]],
    ["runbooks", [{ type: "child_page", id: "legacy-runbook", child_page: { title: "Legacy Runbook" } }]],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      "legacy-runbook": "## Legacy Procedure\n- Keep this content\n",
    },
    pageMeta: {
      "legacy-runbook": { icon: null },
    },
  });

  const result = await adoptRunbook({
    apply: true,
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    projectName: "SNPM",
    title: "Legacy Runbook",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
    timestamp: "03-29-2026 08:00:00",
  });

  assert.equal(result.applied, true);
  assert.match(fixture.markdownByPageId["legacy-runbook"], /Purpose: Legacy Runbook is the SNPM-managed runbook/);
  assert.match(fixture.markdownByPageId["legacy-runbook"], /## Legacy Procedure\n- Keep this content/);
});

test("adoptRunbook rejects pages that are already managed", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "runbooks", child_page: { title: "Runbooks" } }]],
    ["runbooks", [{ type: "child_page", id: "managed-runbook", child_page: { title: "Managed Runbook" } }]],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      "managed-runbook": MANAGED_BUILD_RECORD_MARKDOWN.replace("Ops \\\\> Builds \\\\> Validation Build", "Runbooks \\\\> Managed Runbook"),
    },
  });

  await assert.rejects(
    () => adoptRunbook({
      config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
      projectName: "SNPM",
      title: "Managed Runbook",
      resolveClient: fixture.resolveClient,
      syncClient: fixture.syncClient,
    }),
    /already managed by SNPM/,
  );
});

test("pullRunbookBody rejects unmanaged runbooks with adopt guidance", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "runbooks", child_page: { title: "Runbooks" } }]],
    ["runbooks", [{ type: "child_page", id: "legacy-runbook", child_page: { title: "Legacy Runbook" } }]],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      "legacy-runbook": "## Legacy Procedure\n- Keep this content\n",
    },
  });

  await assert.rejects(
    () => pullRunbookBody({
      config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
      projectName: "SNPM",
      title: "Legacy Runbook",
      resolveClient: fixture.resolveClient,
      syncClient: fixture.syncClient,
    }),
    /Use "runbook adopt" first/,
  );
});

test("diffRunbookBody ignores EOF-only missing newline drift", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "runbooks", child_page: { title: "Runbooks" } }]],
    ["runbooks", [{ type: "child_page", id: "managed-runbook", child_page: { title: "Managed Runbook" } }]],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      "managed-runbook": [
        "Purpose: Managed Runbook is the SNPM-managed runbook for this project workflow.",
        "Canonical Source: Projects \\> SNPM \\> Runbooks \\> Managed Runbook",
        "Read This When: You need the validated procedure, validation steps, or rollback path for this workflow.",
        "Last Updated: 03-29-2026 09:00:00",
        "Sensitive: no",
        "---",
        "## Procedure",
        "- Step one",
      ].join("\n"),
    },
  });

  const result = await diffRunbookBody({
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    fileBodyMarkdown: "## Procedure\n- Step one",
    projectName: "SNPM",
    title: "Managed Runbook",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(result.hasDiff, false);
  assert.equal(result.diff, "");
});

test("diffRunbookBody ignores managed-page normalization artifacts for paths and placeholders", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "runbooks", child_page: { title: "Runbooks" } }]],
    ["runbooks", [{ type: "child_page", id: "managed-runbook", child_page: { title: "Managed Runbook" } }]],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      "managed-runbook": [
        "Purpose: Managed Runbook is the SNPM-managed runbook for this project workflow.",
        "Canonical Source: Projects \\> SNPM \\> Runbooks \\> Managed Runbook",
        "Read This When: You need the validated procedure, validation steps, or rollback path for this workflow.",
        "Last Updated: 03-29-2026 09:00:00",
        "Sensitive: no",
        "---",
        "Path: docs/[operator-roadmap.md](http://operator-roadmap.md)",
        "Repo root: C:\\SNPM",
        "Workspace: Templates \\> Project Templates",
        "Placeholder: \\<PROJECT_NAME\\>",
      ].join("\n"),
    },
  });

  const result = await diffRunbookBody({
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    fileBodyMarkdown: "Path: docs/operator-roadmap.md\nRepo root: C:/SNPM\nWorkspace: Templates > Project Templates\nPlaceholder: <PROJECT_NAME>\n",
    projectName: "SNPM",
    title: "Managed Runbook",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(result.hasDiff, false);
  assert.equal(result.diff, "");
});

test("createBuildRecord can create the Builds container on demand", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "ops", child_page: { title: "Ops" } }]],
    ["ops", []],
  ]);
  const fixture = makePageFixture({ childrenMap });

  const preview = await createBuildRecord({
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    fileBodyMarkdown: "## Build Summary\n- Preview\n",
    projectName: "SNPM",
    title: "Validation Build",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(preview.needsContainer, true);
  assert.equal(preview.applied, false);

  const applied = await createBuildRecord({
    apply: true,
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    fileBodyMarkdown: "## Build Summary\n- Preview\n",
    projectName: "SNPM",
    title: "Validation Build",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(applied.applied, true);
  assert.equal(applied.containerCreated, true);
  assert.equal(fixture.requestLog.filter((entry) => entry.method === "POST").length, 2);
});

test("build-record pull and push work on managed pages", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "ops", child_page: { title: "Ops" } }]],
    ["ops", [{ type: "child_page", id: "builds", child_page: { title: "Builds" } }]],
    ["builds", [{ type: "child_page", id: "build-record", child_page: { title: "Validation Build" } }]],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      "build-record": MANAGED_BUILD_RECORD_MARKDOWN,
    },
    pageMeta: {
      "build-record": { icon: { type: "emoji", emoji: "📦" } },
    },
  });

  const pulled = await pullBuildRecordBody({
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    projectName: "SNPM",
    title: "Validation Build",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });
  assert.match(pulled.bodyMarkdown, /## Build Summary/);

  const pushed = await pushBuildRecordBody({
    apply: true,
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    fileBodyMarkdown: "## Build Summary\n- Updated body\n",
    projectName: "SNPM",
    title: "Validation Build",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
    timestamp: "03-29-2026 09:10:00",
  });

  assert.equal(pushed.applied, true);
  assert.match(fixture.markdownByPageId["build-record"], /Last Updated: 03-29-2026 09:10:00/);
  assert.match(fixture.markdownByPageId["build-record"], /## Build Summary\n- Updated body/);
});

test("diffBuildRecordBody ignores EOF-only missing newline drift", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "ops", child_page: { title: "Ops" } }]],
    ["ops", [{ type: "child_page", id: "builds", child_page: { title: "Builds" } }]],
    ["builds", [{ type: "child_page", id: "build-record", child_page: { title: "Validation Build" } }]],
  ]);
  const fixture = makePageFixture({
    childrenMap,
    markdownByPageId: {
      "build-record": [
        "Purpose: Build record",
        "Canonical Source: Projects \\> SNPM \\> Ops \\> Builds \\> Validation Build",
        "Read This When: Build state",
        "Last Updated: 03-28-2026 20:00:00",
        "Sensitive: no",
        "---",
        "## Build Summary",
        "- Existing body",
      ].join("\n"),
    },
    pageMeta: {
      "build-record": { icon: { type: "emoji", emoji: "📦" } },
    },
  });

  const result = await diffBuildRecordBody({
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    fileBodyMarkdown: "## Build Summary\n- Existing body",
    projectName: "SNPM",
    title: "Validation Build",
    resolveClient: fixture.resolveClient,
    syncClient: fixture.syncClient,
  });

  assert.equal(result.hasDiff, false);
  assert.equal(result.diff, "");
});
