import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  resolveStarterDocScaffold,
  scaffoldProjectStarterDocs,
} from "../src/notion/scaffold-docs.mjs";

function makeConfig() {
  return {
    notionVersion: "2026-03-11",
    workspace: {
      projectsPageId: "projects",
      projectTemplatesPageId: "project-templates",
      managedDocs: {
        exactPages: [],
        subtreeRoots: [],
      },
      forbiddenScopePageIds: {
        home: "home",
      },
    },
    projectStarter: {
      children: [
        {
          title: "Ops",
          children: [
            { title: "Environments", children: [] },
            { title: "Validation", children: [] },
          ],
        },
        {
          title: "Planning",
          children: [
            { title: "Roadmap", children: [] },
            { title: "Current Cycle", children: [] },
            { title: "Backlog", children: [] },
            { title: "Decision Log", children: [] },
          ],
        },
        { title: "Access", children: [] },
        { title: "Vendors", children: [] },
        { title: "Runbooks", children: [] },
        { title: "Incidents", children: [] },
      ],
    },
  };
}

function childPage(title, id) {
  return {
    type: "child_page",
    id,
    child_page: { title },
  };
}

function makeChildrenMap({ existingRootDocs = [] } = {}) {
  return new Map([
    ["projects", [childPage("SNPM", "project-root")]],
    ["project-root", [
      childPage("Ops", "ops"),
      childPage("Planning", "planning"),
      childPage("Access", "access"),
      childPage("Vendors", "vendors"),
      childPage("Runbooks", "runbooks"),
      childPage("Incidents", "incidents"),
      ...existingRootDocs,
    ]],
    ["planning", [
      childPage("Roadmap", "roadmap"),
      childPage("Current Cycle", "current-cycle"),
      childPage("Backlog", "backlog"),
      childPage("Decision Log", "decision-log"),
    ]],
  ]);
}

function makeClient({
  childrenMap = makeChildrenMap(),
  pageMarkdown = {},
  pageMeta = {},
  includeRequest = true,
} = {}) {
  const requestLog = [];
  const client = {
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  if (includeRequest) {
    client.request = async (method, apiPath, body) => {
      requestLog.push({ method, apiPath, body });
      if (method === "GET" && /^pages\/[^/]+$/.test(apiPath)) {
        const pageId = apiPath.slice("pages/".length);
        return {
          id: pageId,
          last_edited_time: pageMeta[pageId]?.last_edited_time || "2026-04-24T18:00:00.000Z",
          archived: pageMeta[pageId]?.archived === true,
          in_trash: pageMeta[pageId]?.in_trash === true,
        };
      }
      if (method === "GET" && /^pages\/[^/]+\/markdown$/.test(apiPath)) {
        const pageId = apiPath.slice("pages/".length, -"/markdown".length);
        return {
          markdown: pageMarkdown[pageId] || [
            `# ${pageId}`,
            "Canonical Source: Projects > SNPM > Planning",
            "Last Updated: 2026-04-24T18:00:00.000Z",
            "---",
            "",
          ].join("\n"),
          truncated: false,
          unknown_block_ids: [],
        };
      }

      throw new Error(`Unexpected request: ${method} ${apiPath}`);
    };
  }

  return { client, requestLog };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

test("resolveStarterDocScaffold uses the exported policy getter when present", () => {
  const result = resolveStarterDocScaffold(makeConfig());

  assert.equal(result.source, "policy-getter");
  assert.deepEqual(
    result.specs.map((spec) => [spec.id, spec.target, spec.file, spec.templateId]),
    [
      ["root-overview", "Root > Overview", "docs/project-overview.md", "project-overview"],
      ["root-operating-model", "Root > Operating Model", "docs/operating-model.md", "project-operating-model"],
      ["planning-roadmap", "Planning > Roadmap", "planning/roadmap.md", "planning-roadmap"],
      ["planning-current-cycle", "Planning > Current Cycle", "planning/current-cycle.md", "planning-current-cycle"],
    ],
  );
  assert.deepEqual(result.integrationNeeds, []);
});

test("scaffoldProjectStarterDocs previews JSON without local writes or Notion mutation", async () => {
  const fixture = makeClient();
  const writes = [];
  const result = await scaffoldProjectStarterDocs({
    config: makeConfig(),
    projectName: "SNPM",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    client: fixture.client,
    mkdirSyncImpl: () => {
      throw new Error("mkdir should not be called without outputDir");
    },
    writeFileSyncImpl: (...args) => writes.push(args),
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.equal(result.mutatesNotion, false);
  assert.equal(result.outputDir, null);
  assert.deepEqual(result.writes, []);
  assert.equal(writes.length, 0);
  assert.deepEqual(
    result.entries.map((entry) => [entry.id, entry.status]),
    [
      ["root-overview", "create-ready"],
      ["root-operating-model", "create-ready"],
      ["planning-roadmap", "update-ready"],
      ["planning-current-cycle", "update-ready"],
    ],
  );
  assert.ok(result.nextCommands.some((step) => step.command.includes("npm run doc-create")));
  assert.ok(result.nextCommands.some((step) => step.command.includes("npm run page-push")));
  assert.ok(result.nextCommands.some((step) => step.command.includes("npm run verify-project")));
  assert.ok(result.nextCommands.some((step) => step.command.includes("npm run doctor")));
  assert.ok(fixture.requestLog.every((entry) => entry.method === "GET"));
});

test("scaffoldProjectStarterDocs rejects apply because scaffolding never mutates Notion", async () => {
  await assert.rejects(
    () => scaffoldProjectStarterDocs({
      apply: true,
      config: makeConfig(),
      projectName: "SNPM",
      client: makeClient().client,
    }),
    /never mutates Notion/,
  );
});

test("scaffoldProjectStarterDocs writes drafts, metadata sidecars, and scaffold-plan when outputDir is provided", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "snpm-scaffold-"));
  const fixture = makeClient({
    pageMeta: {
      roadmap: { last_edited_time: "2026-04-24T18:10:00.000Z" },
      "current-cycle": { last_edited_time: "2026-04-24T18:20:00.000Z" },
    },
  });

  try {
    const result = await scaffoldProjectStarterDocs({
      config: makeConfig(),
      projectName: "SNPM",
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      outputDir: tempDir,
      client: fixture.client,
    });

    const overviewPath = path.join(tempDir, "docs", "project-overview.md");
    const operatingModelPath = path.join(tempDir, "docs", "operating-model.md");
    const roadmapPath = path.join(tempDir, "planning", "roadmap.md");
    const currentCyclePath = path.join(tempDir, "planning", "current-cycle.md");
    const roadmapMetadataPath = `${roadmapPath}.snpm-meta.json`;
    const planPath = path.join(tempDir, "scaffold-plan.json");

    assert.match(readFileSync(overviewPath, "utf8"), /Starter content for SNPM/);
    assert.match(readFileSync(overviewPath, "utf8"), /Last Updated: \[YYYY-MM-DD\]/);
    assert.match(readFileSync(overviewPath, "utf8"), /## Source Of Truth/);
    assert.match(readFileSync(overviewPath, "utf8"), /## Verification/);
    assert.match(readFileSync(operatingModelPath, "utf8"), /Starter content for SNPM/);
    assert.match(readFileSync(operatingModelPath, "utf8"), /## Verification/);
    assert.match(readFileSync(roadmapPath, "utf8"), /Starter content for SNPM/);
    assert.match(readFileSync(roadmapPath, "utf8"), /## Source Of Truth/);
    assert.match(readFileSync(currentCyclePath, "utf8"), /Starter content for SNPM/);
    assert.match(readFileSync(currentCyclePath, "utf8"), /## Source Of Truth/);
    assert.equal(readJson(roadmapMetadataPath).commandFamily, "page");
    assert.equal(readJson(roadmapMetadataPath).authMode, "project-token");
    assert.equal(readJson(roadmapMetadataPath).targetPath, "Projects > SNPM > Planning > Roadmap");
    assert.equal(readJson(roadmapMetadataPath).lastEditedTime, "2026-04-24T18:10:00.000Z");

    const plan = readJson(planPath);
    assert.equal(plan.command, "scaffold-docs");
    assert.equal(plan.entries.find((entry) => entry.id === "planning-roadmap").hasMetadata, true);
    assert.equal(plan.entries.find((entry) => entry.id === "root-overview").hasDraftMarkdown, true);
    assert.equal("draftMarkdown" in plan.entries[0], false);
    assert.ok(result.writes.some((write) => write.kind === "scaffold-plan" && write.path === planPath));
    assert.ok(result.nextCommands.every((step) => step.cwd === tempDir || !step.cwd));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("existing project docs are reported as already-exists and are not overwritten", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "snpm-scaffold-"));
  const fixture = makeClient({
    childrenMap: makeChildrenMap({
      existingRootDocs: [childPage("Overview", "existing-overview")],
    }),
  });

  try {
    const result = await scaffoldProjectStarterDocs({
      config: makeConfig(),
      projectName: "SNPM",
      outputDir: tempDir,
      client: fixture.client,
    });
    const overview = result.entries.find((entry) => entry.id === "root-overview");
    const operatingModel = result.entries.find((entry) => entry.id === "root-operating-model");

    assert.equal(overview.status, "already-exists");
    assert.equal(overview.pageId, "existing-overview");
    assert.equal(overview.outputPath, null);
    assert.match(overview.warnings[0], /already exists/);
    assert.equal(existsSync(path.join(tempDir, "docs", "project-overview.md")), false);
    assert.equal(operatingModel.status, "create-ready");
    assert.equal(existsSync(path.join(tempDir, "docs", "operating-model.md")), true);
    assert.ok(!overview.nextCommands.some((step) => step.command.includes("doc-create")));
    assert.ok(overview.nextCommands.some((step) => step.command.includes("npm run doc-pull")));
    assert.ok(overview.nextCommands.some((step) => step.command.includes("npm run doc-diff")));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("planning drafts are still written without sidecars when live metadata is unavailable", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "snpm-scaffold-"));
  const fixture = makeClient({ includeRequest: false });

  try {
    const result = await scaffoldProjectStarterDocs({
      config: makeConfig(),
      projectName: "SNPM",
      outputDir: tempDir,
      client: fixture.client,
    });
    const roadmap = result.entries.find((entry) => entry.id === "planning-roadmap");
    const roadmapPath = path.join(tempDir, "planning", "roadmap.md");

    assert.equal(roadmap.status, "update-ready");
    assert.equal(roadmap.metadataPath, null);
    assert.equal(existsSync(roadmapPath), true);
    assert.equal(existsSync(`${roadmapPath}.snpm-meta.json`), false);
    assert.match(roadmap.warnings[0], /Live page metadata is unavailable/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("planning drafts warn before replacing non-empty target content", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "snpm-scaffold-"));
  const fixture = makeClient({
    pageMarkdown: {
      roadmap: [
        "# Roadmap",
        "Canonical Source: Projects > SNPM > Planning > Roadmap",
        "Last Updated: 2026-04-24T18:00:00.000Z",
        "---",
        "Existing roadmap content.",
        "",
      ].join("\n"),
    },
  });

  try {
    const result = await scaffoldProjectStarterDocs({
      config: makeConfig(),
      projectName: "SNPM",
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      outputDir: tempDir,
      client: fixture.client,
    });
    const roadmap = result.entries.find((entry) => entry.id === "planning-roadmap");
    const currentCycle = result.entries.find((entry) => entry.id === "planning-current-cycle");

    assert.match(roadmap.warnings.join("\n"), /already has body content/);
    assert.doesNotMatch(currentCycle.warnings.join("\n"), /already has body content/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
