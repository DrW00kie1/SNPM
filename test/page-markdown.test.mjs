import test from "node:test";
import assert from "node:assert/strict";

import {
  buildManagedPageMarkdown,
  choosePageSyncAuth,
  diffApprovedPageBody,
  diffMarkdownText,
  diffMarkdownBodies,
  fetchPageMarkdown,
  loadResolvedPageContext,
  normalizeEditableBodyMarkdown,
  normalizeMarkdownNewlines,
  pullApprovedPageBody,
  replacePageMarkdown,
  pushApprovedPageBody,
  rewriteManagedHeaderMarkdown,
  splitManagedPageMarkdown,
  splitManagedPageMarkdownIfPresent,
  validatePageMarkdownResponse,
} from "../src/notion/page-markdown.mjs";

const SAMPLE_MARKDOWN = [
  "Purpose: Sample page",
  "Canonical Source: Projects \\> SNPM \\> Planning \\> Roadmap",
  "Read This When: Sample",
  "Last Updated: 03-28-2026 20:34:16",
  "Sensitive: no",
  "---",
  "## Current Phase",
  "- First bullet",
  "",
].join("\n");

test("splitManagedPageMarkdown preserves the managed header boundary", () => {
  const parts = splitManagedPageMarkdown(SAMPLE_MARKDOWN);
  assert.match(parts.headerMarkdown, /Sensitive: no\n---\n$/);
  assert.equal(parts.bodyMarkdown, "## Current Phase\n- First bullet\n");
});

test("splitManagedPageMarkdownIfPresent returns null for headerless pages", () => {
  assert.equal(splitManagedPageMarkdownIfPresent("## Legacy Runbook\n- Step one\n"), null);
});

test("rewriteManagedHeaderMarkdown refreshes canonical source and timestamp", () => {
  const rewritten = rewriteManagedHeaderMarkdown(
    splitManagedPageMarkdown(SAMPLE_MARKDOWN).headerMarkdown,
    "Projects > SNPM > Planning > Backlog",
    "03-29-2026 09:00:00",
  );

  assert.match(rewritten, /Canonical Source: Projects \\> SNPM \\> Planning \\> Backlog/);
  assert.match(rewritten, /Last Updated: 03-29-2026 09:00:00/);
});

test("buildManagedPageMarkdown preserves the body under a rewritten header", () => {
  const rebuilt = buildManagedPageMarkdown({
    headerMarkdown: splitManagedPageMarkdown(SAMPLE_MARKDOWN).headerMarkdown,
    bodyMarkdown: "## Current Phase\n- Updated bullet\n",
    canonicalPath: "Projects > SNPM > Planning > Roadmap",
    timestamp: "03-29-2026 09:00:00",
  });

  assert.match(rebuilt, /Last Updated: 03-29-2026 09:00:00/);
  assert.match(rebuilt, /## Current Phase\n- Updated bullet\n$/);
});

test("validatePageMarkdownResponse rejects truncated responses and unknown blocks", () => {
  assert.throws(
    () => validatePageMarkdownResponse({ truncated: true, unknown_block_ids: [] }, "Projects > SNPM > Planning > Roadmap"),
    /is truncated/,
  );

  assert.throws(
    () => validatePageMarkdownResponse({ truncated: false, unknown_block_ids: ["abc"] }, "Projects > SNPM > Planning > Roadmap"),
    /includes unsupported blocks/,
  );
});

test("choosePageSyncAuth prefers the project token when provided", () => {
  const auth = choosePageSyncAuth("SNPM_NOTION_TOKEN", {
    getProjectTokenImpl: (name) => `project:${name}`,
    getWorkspaceTokenImpl: () => "workspace",
  });

  assert.equal(auth.authMode, "project-token");
  assert.equal(auth.token, "project:SNPM_NOTION_TOKEN");
});

test("normalizeMarkdownNewlines collapses CRLF to LF", () => {
  assert.equal(normalizeMarkdownNewlines("one\r\ntwo\r\n"), "one\ntwo\n");
});

test("normalizeEditableBodyMarkdown adds one missing final newline without collapsing extra blank lines", () => {
  assert.equal(normalizeEditableBodyMarkdown("body"), "body\n");
  assert.equal(normalizeEditableBodyMarkdown("body\n"), "body\n");
  assert.equal(normalizeEditableBodyMarkdown("body\n\n"), "body\n\n");
});

test("diffMarkdownBodies returns a unified diff only when content changes", () => {
  const spawnSyncImpl = (_command, _args) => ({
    status: 1,
    stdout: "diff --git a/current.md b/next.md\n@@\n-old\n+new\n",
    stderr: "",
  });

  const diff = diffMarkdownBodies("old\n", "new\n", { spawnSyncImpl });
  assert.match(diff, /^diff --git/);
});

test("diffMarkdownText can compare full page markdown", () => {
  const spawnSyncImpl = (_command, _args) => ({
    status: 1,
    stdout: "diff --git a/current.md b/next.md\n@@\n-old\n+new\n",
    stderr: "",
  });

  const diff = diffMarkdownText("old\n", "new\n", { spawnSyncImpl });
  assert.match(diff, /^\diff --git|^diff --git/);
});

test("fetchPageMarkdown and replacePageMarkdown wrap the markdown endpoints safely", async () => {
  const requests = [];
  const client = {
    async request(method, apiPath, body) {
      requests.push({ method, apiPath, body });
      if (method === "GET") {
        return { markdown: SAMPLE_MARKDOWN, truncated: false, unknown_block_ids: [] };
      }
      return { markdown: body.replace_content.new_str, truncated: false, unknown_block_ids: [] };
    },
  };

  const markdown = await fetchPageMarkdown("roadmap", "Projects > SNPM > Planning > Roadmap", client);
  await replacePageMarkdown("roadmap", "Projects > SNPM > Planning > Roadmap", markdown, client);

  assert.equal(markdown, SAMPLE_MARKDOWN);
  assert.equal(requests[0].apiPath, "pages/roadmap/markdown");
  assert.equal(requests[1].method, "PATCH");
  assert.equal(requests[1].body.type, "replace_content");
});

test("loadResolvedPageContext resolves auth and returns managed header/body parts", async () => {
  const syncClient = {
    async request() {
      return { markdown: SAMPLE_MARKDOWN, truncated: false, unknown_block_ids: [] };
    },
  };

  const context = await loadResolvedPageContext({
    target: {
      pageId: "roadmap",
      projectId: "project-root",
      targetPath: "Projects > SNPM > Planning > Roadmap",
    },
    config: { notionVersion: "2026-03-11" },
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    syncClient,
  });

  assert.equal(context.authMode, "project-token");
  assert.match(context.headerMarkdown, /Canonical Source:/);
  assert.match(context.bodyMarkdown, /## Current Phase/);
});

test("pullApprovedPageBody rejects unsupported markdown payloads", async () => {
  await assert.rejects(
    () => pullApprovedPageBody({
      projectName: "SNPM",
      pagePath: "Planning > Roadmap",
      config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
      resolveClient: {
        async getChildren(pageId) {
          if (pageId === "projects") return [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }];
          if (pageId === "project-root") return [{ type: "child_page", id: "planning", child_page: { title: "Planning" } }];
          if (pageId === "planning") return [{ type: "child_page", id: "roadmap", child_page: { title: "Roadmap" } }];
          return [];
        },
      },
      syncClient: {
        async request() {
          return { markdown: SAMPLE_MARKDOWN, truncated: true, unknown_block_ids: [] };
        },
      },
    }),
    /truncated/,
  );
});

test("diffApprovedPageBody ignores EOF-only missing newline drift", async () => {
  const resolveClient = {
    async getChildren(pageId) {
      if (pageId === "projects") return [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }];
      if (pageId === "project-root") return [{ type: "child_page", id: "planning", child_page: { title: "Planning" } }];
      if (pageId === "planning") return [{ type: "child_page", id: "roadmap", child_page: { title: "Roadmap" } }];
      return [];
    },
  };
  const syncClient = {
    async request() {
      return {
        markdown: [
          "Purpose: Sample page",
          "Canonical Source: Projects \\> SNPM \\> Planning \\> Roadmap",
          "Read This When: Sample",
          "Last Updated: 03-28-2026 20:34:16",
          "Sensitive: no",
          "---",
          "## Current Phase",
          "- First bullet",
        ].join("\n"),
        truncated: false,
        unknown_block_ids: [],
      };
    },
  };

  const result = await diffApprovedPageBody({
    projectName: "SNPM",
    pagePath: "Planning > Roadmap",
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    fileBodyMarkdown: "## Current Phase\n- First bullet",
    resolveClient,
    syncClient,
  });

  assert.equal(result.hasDiff, false);
  assert.equal(result.diff, "");
});

test("pushApprovedPageBody rewrites the managed header before replace_content", async () => {
  const requests = [];
  const resolveClient = {
    async getChildren(pageId) {
      if (pageId === "projects") return [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }];
      if (pageId === "project-root") return [{ type: "child_page", id: "planning", child_page: { title: "Planning" } }];
      if (pageId === "planning") return [{ type: "child_page", id: "backlog", child_page: { title: "Backlog" } }];
      return [];
    },
  };
  const syncClient = {
    async request(method, apiPath, body) {
      requests.push({ method, apiPath, body });
      if (method === "GET") {
        return { markdown: SAMPLE_MARKDOWN, truncated: false, unknown_block_ids: [] };
      }
      return { markdown: body.replace_content.new_str, truncated: false, unknown_block_ids: [] };
    },
  };

  const result = await pushApprovedPageBody({
    projectName: "SNPM",
    pagePath: "Planning > Backlog",
    config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
    fileBodyMarkdown: "## Current Phase\n- Updated bullet\n",
    apply: true,
    timestamp: "03-29-2026 10:00:00",
    resolveClient,
    syncClient,
  });

  const patchRequest = requests.find((request) => request.method === "PATCH");
  assert.equal(result.applied, true);
  assert.equal(patchRequest.apiPath, "pages/backlog/markdown");
  assert.equal(patchRequest.body.type, "replace_content");
  assert.match(
    patchRequest.body.replace_content.new_str,
    /Canonical Source: Projects \\> SNPM \\> Planning \\> Backlog/,
  );
  assert.match(patchRequest.body.replace_content.new_str, /Last Updated: 03-29-2026 10:00:00/);
});
