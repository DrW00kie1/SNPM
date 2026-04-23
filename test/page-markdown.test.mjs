import test from "node:test";
import assert from "node:assert/strict";

import {
  buildManagedPageMarkdown,
  canonicalizeManagedBodyMarkdown,
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

test("canonicalizeManagedBodyMarkdown rewrites only the known equivalent authoring patterns", () => {
  const input = [
    "Path: [docs/live-notion-docs.md](docs/live-notion-docs.md)",
    "Split path: docs/[live-notion-docs.md](http://live-notion-docs.md)",
    "Workspace: [Templates > Project Templates](Templates > Project Templates)",
    "Escaped workspace path: Planning \\> Roadmap",
    "Drive root: C:\\SNPM",
    "Nested drive path: C:\\Users\\Sean\\repo",
    "Space path: C:\\Program Files\\Git\\bin",
    "Angle: \\<PROJECT_NAME\\>",
    "Square: \\[PROJECT_TOKEN_ENV\\]",
    "Link: [Live Docs](docs/live-notion-docs.md)",
    "URL: [https://example.com](https://example.com)",
    "<details>",
    "<summary>Detail</summary>",
    "</details>",
    "Inline code: `[docs/live-notion-docs.md](docs/live-notion-docs.md)` and `\\<PROJECT_NAME\\>` and `C:\\SNPM`",
    "```md",
    "[docs/live-notion-docs.md](docs/live-notion-docs.md)",
    "\\<PROJECT_NAME\\>",
    "C:\\SNPM",
    "```",
  ].join("\n");

  const result = canonicalizeManagedBodyMarkdown(input);

  assert.match(result, /Path: docs\/live-notion-docs\.md/);
  assert.match(result, /Split path: docs\/live-notion-docs\.md/);
  assert.match(result, /Workspace: Templates > Project Templates/);
  assert.match(result, /Escaped workspace path: Planning > Roadmap/);
  assert.match(result, /Drive root: C:\/SNPM/);
  assert.match(result, /Nested drive path: C:\/Users\/Sean\/repo/);
  assert.match(result, /Space path: C:\/Program Files\/Git\/bin/);
  assert.match(result, /Angle: <PROJECT_NAME>/);
  assert.match(result, /Square: \[PROJECT_TOKEN_ENV\]/);
  assert.match(result, /Link: \[Live Docs\]\(docs\/live-notion-docs\.md\)/);
  assert.match(result, /URL: \[https:\/\/example\.com\]\(https:\/\/example\.com\)/);
  assert.match(result, /<details>\n<summary>Detail<\/summary>\n<\/details>/);
  assert.match(result, /Inline code: `\[docs\/live-notion-docs\.md\]\(docs\/live-notion-docs\.md\)` and `\\<PROJECT_NAME\\>` and `C:\\SNPM`/);
  assert.match(result, /```md\n\[docs\/live-notion-docs\.md\]\(docs\/live-notion-docs\.md\)\n\\<PROJECT_NAME\\>\nC:\\SNPM\n```/);
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

test("diffMarkdownBodies treats equivalent markdown normalization artifacts as unchanged", () => {
  const diff = diffMarkdownBodies(
    "Path: [docs/live-notion-docs.md](docs/live-notion-docs.md)\nSplit path: docs/[live-notion-docs.md](http://live-notion-docs.md)\nWorkspace: Planning \\> Roadmap\nDrive root: C:\\SNPM\nNested drive path: C:\\Users\\Sean\\repo\nSpace path: C:\\Program Files\\Git\\bin\nAngle: \\<PROJECT_NAME\\>\nSquare: \\[PROJECT_TOKEN_ENV\\]\n",
    "Path: docs/live-notion-docs.md\nSplit path: docs/live-notion-docs.md\nWorkspace: Planning > Roadmap\nDrive root: C:/SNPM\nNested drive path: C:/Users/Sean/repo\nSpace path: C:/Program Files/Git/bin\nAngle: <PROJECT_NAME>\nSquare: [PROJECT_TOKEN_ENV]\n",
  );

  assert.equal(diff, "");
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
    async request(method, apiPath) {
      if (method === "GET" && apiPath.endsWith("/markdown")) {
        return { markdown: SAMPLE_MARKDOWN, truncated: false, unknown_block_ids: [] };
      }
      return {
        id: "roadmap",
        last_edited_time: "2026-04-23T20:00:00.000Z",
        archived: false,
        in_trash: false,
      };
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
        async request(method, apiPath) {
          if (method === "GET" && apiPath.endsWith("/markdown")) {
            return { markdown: SAMPLE_MARKDOWN, truncated: true, unknown_block_ids: [] };
          }
          return {
            id: "roadmap",
            last_edited_time: "2026-04-23T20:00:00.000Z",
            archived: false,
            in_trash: false,
          };
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
    async request(method, apiPath) {
      if (method === "GET" && !apiPath.endsWith("/markdown")) {
        return {
          id: "roadmap",
          last_edited_time: "2026-04-23T20:00:00.000Z",
          archived: false,
          in_trash: false,
        };
      }
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
      if (method === "GET" && apiPath.endsWith("/markdown")) {
        return { markdown: SAMPLE_MARKDOWN, truncated: false, unknown_block_ids: [] };
      }
      if (method === "GET") {
        return {
          id: "backlog",
          last_edited_time: "2026-04-23T20:00:00.000Z",
          archived: false,
          in_trash: false,
        };
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
    metadata: {
      schema: "snpm.pull-metadata.v1",
      commandFamily: "page",
      workspaceName: "infrastructure-hq",
      targetPath: "Projects > SNPM > Planning > Backlog",
      pageId: "backlog",
      projectId: "project-root",
      authMode: "project-token",
      lastEditedTime: "2026-04-23T20:00:00.000Z",
      pulledAt: "2026-04-23T20:01:00.000Z",
    },
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

test("loadResolvedPageContext rejects pull-time metadata drift with retry guidance", async () => {
  let pageMetadataReads = 0;
  const syncClient = {
    async request(method, apiPath) {
      if (method === "GET" && apiPath.endsWith("/markdown")) {
        return { markdown: SAMPLE_MARKDOWN, truncated: false, unknown_block_ids: [] };
      }

      pageMetadataReads += 1;
      return {
        id: "roadmap",
        last_edited_time: pageMetadataReads === 1
          ? "2026-04-23T20:00:00.000Z"
          : "2026-04-23T20:05:00.000Z",
        archived: false,
        in_trash: false,
      };
    },
  };

  await assert.rejects(
    () => loadResolvedPageContext({
      target: {
        pageId: "roadmap",
        projectId: "project-root",
        targetPath: "Projects > SNPM > Planning > Roadmap",
      },
      config: { notionVersion: "2026-03-11" },
      syncClient,
    }),
    /Retry the pull/,
  );
});

test("pushApprovedPageBody rejects stale apply metadata before mutation", async () => {
  const requests = [];
  let pageMetadataReads = 0;
  const syncClient = {
    async request(method, apiPath, body) {
      requests.push({ method, apiPath, body });
      if (method === "GET" && apiPath.endsWith("/markdown")) {
        return { markdown: SAMPLE_MARKDOWN, truncated: false, unknown_block_ids: [] };
      }
      if (method === "GET") {
        pageMetadataReads += 1;
        return {
          id: "backlog",
          last_edited_time: pageMetadataReads < 3
            ? "2026-04-23T20:00:00.000Z"
            : "2026-04-23T20:05:00.000Z",
          archived: false,
          in_trash: false,
        };
      }
      return { markdown: body.replace_content.new_str, truncated: false, unknown_block_ids: [] };
    },
  };

  await assert.rejects(
    () => pushApprovedPageBody({
      projectName: "SNPM",
      pagePath: "Planning > Backlog",
      config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
      fileBodyMarkdown: "## Current Phase\n- Updated bullet\n",
      apply: true,
      metadata: {
        schema: "snpm.pull-metadata.v1",
        commandFamily: "page",
        workspaceName: "infrastructure-hq",
        targetPath: "Projects > SNPM > Planning > Backlog",
        pageId: "backlog",
        projectId: "project-root",
        lastEditedTime: "2026-04-23T20:00:00.000Z",
        pulledAt: "2026-04-23T20:01:00.000Z",
      },
      resolveClient: {
        async getChildren(pageId) {
          if (pageId === "projects") return [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }];
          if (pageId === "project-root") return [{ type: "child_page", id: "planning", child_page: { title: "Planning" } }];
          if (pageId === "planning") return [{ type: "child_page", id: "backlog", child_page: { title: "Backlog" } }];
          return [];
        },
      },
      syncClient,
    }),
    /Stale metadata/,
  );

  assert.equal(requests.some((request) => request.method === "PATCH"), false);
});

test("pushApprovedPageBody requires apply metadata before mutation", async () => {
  const requests = [];
  const syncClient = {
    async request(method, apiPath, body) {
      requests.push({ method, apiPath, body });
      if (method === "GET" && apiPath.endsWith("/markdown")) {
        return { markdown: SAMPLE_MARKDOWN, truncated: false, unknown_block_ids: [] };
      }
      if (method === "GET") {
        return {
          id: "backlog",
          last_edited_time: "2026-04-23T20:00:00.000Z",
          archived: false,
          in_trash: false,
        };
      }
      return { markdown: body.replace_content.new_str, truncated: false, unknown_block_ids: [] };
    },
  };

  await assert.rejects(
    () => pushApprovedPageBody({
      projectName: "SNPM",
      pagePath: "Planning > Backlog",
      config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
      fileBodyMarkdown: "## Current Phase\n- Updated bullet\n",
      apply: true,
      resolveClient: {
        async getChildren(pageId) {
          if (pageId === "projects") return [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }];
          if (pageId === "project-root") return [{ type: "child_page", id: "planning", child_page: { title: "Planning" } }];
          if (pageId === "planning") return [{ type: "child_page", id: "backlog", child_page: { title: "Backlog" } }];
          return [];
        },
      },
      syncClient,
    }),
    /Metadata sidecar must be a JSON object/,
  );

  assert.equal(requests.some((request) => request.method === "PATCH"), false);
});

test("pushApprovedPageBody rejects target mismatch before mutation", async () => {
  const requests = [];
  const syncClient = {
    async request(method, apiPath, body) {
      requests.push({ method, apiPath, body });
      if (method === "GET" && apiPath.endsWith("/markdown")) {
        return { markdown: SAMPLE_MARKDOWN, truncated: false, unknown_block_ids: [] };
      }
      if (method === "GET") {
        return {
          id: "backlog",
          last_edited_time: "2026-04-23T20:00:00.000Z",
          archived: false,
          in_trash: false,
        };
      }
      return { markdown: body.replace_content.new_str, truncated: false, unknown_block_ids: [] };
    },
  };

  await assert.rejects(
    () => pushApprovedPageBody({
      projectName: "SNPM",
      pagePath: "Planning > Backlog",
      config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
      fileBodyMarkdown: "## Current Phase\n- Updated bullet\n",
      apply: true,
      metadata: {
        schema: "snpm.pull-metadata.v1",
        commandFamily: "page",
        workspaceName: "infrastructure-hq",
        targetPath: "Projects > SNPM > Planning > Roadmap",
        pageId: "backlog",
        projectId: "project-root",
        lastEditedTime: "2026-04-23T20:00:00.000Z",
        pulledAt: "2026-04-23T20:01:00.000Z",
      },
      resolveClient: {
        async getChildren(pageId) {
          if (pageId === "projects") return [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }];
          if (pageId === "project-root") return [{ type: "child_page", id: "planning", child_page: { title: "Planning" } }];
          if (pageId === "planning") return [{ type: "child_page", id: "backlog", child_page: { title: "Backlog" } }];
          return [];
        },
      },
      syncClient,
    }),
    /targetPath mismatch/,
  );

  assert.equal(requests.some((request) => request.method === "PATCH"), false);
});

test("pushApprovedPageBody rejects archived and trashed pages before mutation", async () => {
  for (const fieldName of ["archived", "in_trash"]) {
    const requests = [];
    const syncClient = {
      async request(method, apiPath, body) {
        requests.push({ method, apiPath, body });
        if (method === "GET" && apiPath.endsWith("/markdown")) {
          return { markdown: SAMPLE_MARKDOWN, truncated: false, unknown_block_ids: [] };
        }
        if (method === "GET") {
          return {
            id: "backlog",
            last_edited_time: "2026-04-23T20:00:00.000Z",
            archived: fieldName === "archived",
            in_trash: fieldName === "in_trash",
          };
        }
        return { markdown: body.replace_content.new_str, truncated: false, unknown_block_ids: [] };
      },
    };

    await assert.rejects(
      () => pushApprovedPageBody({
        projectName: "SNPM",
        pagePath: "Planning > Backlog",
        config: { notionVersion: "2026-03-11", workspace: { projectsPageId: "projects" } },
        fileBodyMarkdown: "## Current Phase\n- Updated bullet\n",
        apply: true,
        metadata: {
          schema: "snpm.pull-metadata.v1",
          commandFamily: "page",
          workspaceName: "infrastructure-hq",
          targetPath: "Projects > SNPM > Planning > Backlog",
          pageId: "backlog",
          projectId: "project-root",
          lastEditedTime: "2026-04-23T20:00:00.000Z",
          pulledAt: "2026-04-23T20:01:00.000Z",
        },
        resolveClient: {
          async getChildren(pageId) {
            if (pageId === "projects") return [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }];
            if (pageId === "project-root") return [{ type: "child_page", id: "planning", child_page: { title: "Planning" } }];
            if (pageId === "planning") return [{ type: "child_page", id: "backlog", child_page: { title: "Backlog" } }];
            return [];
          },
        },
        syncClient,
      }),
      /archived or in trash/,
    );

    assert.equal(requests.some((request) => request.method === "PATCH"), false);
  }
});
