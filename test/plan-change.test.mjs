import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizePlanChangeInput,
  planChange,
} from "../src/commands/plan-change.mjs";
import { validateSyncManifest } from "../src/notion/sync-manifest.mjs";

test("normalizePlanChangeInput validates and normalizes explicit targets", () => {
  const result = normalizePlanChangeInput({
    goal: "  Update release planning  ",
    projectName: "SNPM",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    workspaceName: "infrastructure-hq",
    targets: [
      {
        type: "planning",
        pagePath: " Roadmap ",
      },
      {
        type: "project-doc",
        docPath: " Root > Overview ",
        projectName: "Other Project",
      },
      {
        type: "implementation-note",
        repoPath: " notes/change.md ",
      },
    ],
  });

  assert.equal(result.goal, "Update release planning");
  assert.deepEqual(result.targets, [
    {
      index: 0,
      type: "planning",
      projectName: "SNPM",
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      workspaceName: "infrastructure-hq",
      pagePath: "Roadmap",
    },
    {
      index: 1,
      type: "project-doc",
      projectName: "Other Project",
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      workspaceName: "infrastructure-hq",
      docPath: "Root > Overview",
    },
    {
      index: 2,
      type: "implementation-note",
      projectName: "SNPM",
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      workspaceName: "infrastructure-hq",
      repoPath: "notes/change.md",
    },
  ]);
});

test("planChange maps targets into injected recommend calls and aggregates output", async () => {
  const calls = [];
  const result = await planChange({
    goal: "Plan milestone change",
    projectName: "SNPM",
    targets: [
      {
        type: "planning",
        pagePath: "Roadmap",
      },
      {
        type: "runbook",
        title: "Release Runbook",
        projectTokenEnv: "RUNBOOK_TOKEN",
      },
      {
        type: "generated-output",
        repoPath: "artifacts/release.json",
      },
    ],
  }, {
    async recommendImpl(args) {
      calls.push(args);
      return {
        ok: args.intent !== "runbook",
        recommendedHome: args.intent === "generated-output" ? "repo" : "notion",
        surface: args.intent === "generated-output" ? "generated-output" : args.intent,
        targetPath: args.intent === "generated-output" ? undefined : `Projects > ${args.projectName}`,
        repoPath: args.repoPath,
        reason: `Route ${args.intent}`,
        warnings: args.intent === "runbook" ? ["Runbook warning"] : [],
        nextCommands: [{
          kind: args.intent === "generated-output" ? "repo" : "command",
          command: `next:${args.intent}`,
          reason: `Next ${args.intent}`,
        }],
      };
    },
  });

  assert.deepEqual(calls, [
    {
      projectName: "SNPM",
      projectTokenEnv: undefined,
      intent: "planning",
      pagePath: "Roadmap",
      docPath: undefined,
      title: undefined,
      domainTitle: undefined,
      repoPath: undefined,
      workspaceName: undefined,
    },
    {
      projectName: "SNPM",
      projectTokenEnv: "RUNBOOK_TOKEN",
      intent: "runbook",
      pagePath: undefined,
      docPath: undefined,
      title: "Release Runbook",
      domainTitle: undefined,
      repoPath: undefined,
      workspaceName: undefined,
    },
    {
      projectName: "SNPM",
      projectTokenEnv: undefined,
      intent: "generated-output",
      pagePath: undefined,
      docPath: undefined,
      title: undefined,
      domainTitle: undefined,
      repoPath: "artifacts/release.json",
      workspaceName: undefined,
    },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.command, "plan-change");
  assert.equal(result.goal, "Plan milestone change");
  assert.equal(result.projectName, "SNPM");
  assert.equal(result.recommendations.length, 3);
  assert.deepEqual(result.nextCommands.map((entry) => entry.command), [
    "next:planning",
    "next:runbook",
    "next:generated-output",
  ]);
  assert.deepEqual(result.warnings, ["Runbook warning"]);
});

test("planChange supports workspace and template docs without projectName", async () => {
  const calls = [];
  const result = await planChange({
    goal: "Update workspace docs",
    targets: [
      {
        type: "template-doc",
        docPath: "Templates > Project Templates > Overview",
      },
      {
        type: "workspace-doc",
        docPath: "Runbooks > Notion Workspace Workflow",
      },
    ],
  }, {
    async recommendImpl(args) {
      calls.push(args);
      return {
        ok: true,
        recommendedHome: "notion",
        surface: args.intent,
        targetPath: args.docPath,
        warnings: [],
        nextCommands: [],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.projectName, null);
  assert.deepEqual(calls.map((entry) => ({
    intent: entry.intent,
    projectName: entry.projectName,
    docPath: entry.docPath,
  })), [
    {
      intent: "template-doc",
      projectName: undefined,
      docPath: "Templates > Project Templates > Overview",
    },
    {
      intent: "workspace-doc",
      projectName: undefined,
      docPath: "Runbooks > Notion Workspace Workflow",
    },
  ]);
});

test("planChange omits manifestDraft from baseline output unless requested", async () => {
  const result = await planChange({
    goal: "Plan baseline output",
    projectName: "SNPM",
    targets: [{
      type: "planning",
      pagePath: "Planning > Roadmap",
    }],
  }, {
    async recommendImpl() {
      return {
        ok: true,
        recommendedHome: "notion",
        surface: "planning",
        targetPath: "Planning > Roadmap",
        warnings: [],
        nextCommands: [],
      };
    },
  });

  assert.equal(Object.hasOwn(result, "manifestDraft"), false);
  assert.deepEqual(Object.keys(result), [
    "ok",
    "command",
    "goal",
    "projectName",
    "targets",
    "recommendations",
    "nextCommands",
    "warnings",
  ]);
});

test("planChange manifestDraft maps supported targets to manifest v2 entries", async () => {
  const result = await planChange({
    goal: "Plan manifest draft",
    projectName: "SNPM",
    workspaceName: "infrastructure-hq",
    targets: [
      {
        type: "planning",
        pagePath: "Planning > Roadmap",
      },
      {
        type: "project-doc",
        docPath: "Root > Overview",
      },
      {
        type: "template-doc",
        docPath: "Templates > Project Templates > Overview",
      },
      {
        type: "workspace-doc",
        docPath: "Runbooks > Notion Workspace Workflow",
      },
      {
        type: "runbook",
        title: "Release Smoke Test",
      },
    ],
  }, {
    manifestDraft: true,
    async recommendImpl() {
      return {
        ok: true,
        warnings: [],
        nextCommands: [],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.manifestUnsupportedTargets, []);
  assert.deepEqual(result.manifestDraft, {
    version: 2,
    workspace: "infrastructure-hq",
    project: "SNPM",
    entries: [
      {
        kind: "planning-page",
        pagePath: "Planning > Roadmap",
        file: "notion/planning/roadmap.md",
      },
      {
        kind: "project-doc",
        docPath: "Root > Overview",
        file: "notion/root/overview.md",
      },
      {
        kind: "template-doc",
        docPath: "Templates > Project Templates > Overview",
        file: "notion/templates/project-templates/overview.md",
      },
      {
        kind: "workspace-doc",
        docPath: "Runbooks > Notion Workspace Workflow",
        file: "notion/runbooks/notion-workspace-workflow.md",
      },
      {
        kind: "runbook",
        title: "Release Smoke Test",
        file: "notion/runbooks/release-smoke-test.md",
      },
    ],
  });
});

test("planChange manifestDraft reports unsupported manifest targets separately", async () => {
  const result = await planChange({
    goal: "Plan partial manifest draft",
    projectName: "SNPM",
    targets: [
      {
        type: "planning",
        pagePath: "Planning > Roadmap",
      },
      {
        type: "secret",
        domainTitle: "Production",
        title: "API Key",
      },
      {
        type: "repo-doc",
        repoPath: "docs/local-only.md",
      },
    ],
  }, {
    manifestDraft: true,
    async recommendImpl() {
      return {
        ok: true,
        warnings: [],
        nextCommands: [],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.manifestDraft.entries, [{
    kind: "planning-page",
    pagePath: "Planning > Roadmap",
    file: "notion/planning/roadmap.md",
  }]);
  assert.deepEqual(result.manifestUnsupportedTargets, [
    {
      index: 1,
      type: "secret",
      projectName: "SNPM",
      title: "API Key",
      domainTitle: "Production",
      reason: "Access secret and token records are excluded from manifest v2 drafts; use the Access command family.",
    },
    {
      index: 2,
      type: "repo-doc",
      projectName: "SNPM",
      repoPath: "docs/local-only.md",
      reason: "Repo-owned targets are not Notion manifest entries.",
    },
  ]);
});

test("planChange manifestDraft generates deterministic unique safe notion paths", async () => {
  const input = {
    goal: "Plan safe manifest paths",
    projectName: "SNPM",
    targets: [
      {
        type: "runbook",
        title: "Release: Smoke/Test?",
      },
      {
        type: "runbook",
        title: "Release Smoke Test!",
      },
      {
        type: "runbook",
        title: "..\\Release Smoke Test",
      },
      {
        type: "runbook",
        title: "CON",
      },
    ],
  };
  const options = {
    manifestDraft: true,
    async recommendImpl() {
      return {
        ok: true,
        warnings: [],
        nextCommands: [],
      };
    },
  };

  const first = await planChange(input, options);
  const second = await planChange(input, options);
  const files = first.manifestDraft.entries.map((entry) => entry.file);

  assert.deepEqual(first.manifestDraft.entries, second.manifestDraft.entries);
  assert.deepEqual(files, [
    "notion/runbooks/release-smoke-test.md",
    "notion/runbooks/release-smoke-test-2.md",
    "notion/runbooks/release-smoke-test-3.md",
    "notion/runbooks/con-target.md",
  ]);
  assert.ok(files.every((file) => file.startsWith("notion/")));
  assert.ok(files.every((file) => !file.includes("..")));
  assert.equal(new Set(files).size, files.length);
});

test("planChange requires injected recommend implementation", async () => {
  await assert.rejects(
    planChange({
      goal: "Plan",
      projectName: "SNPM",
      targets: [{ type: "planning", pagePath: "Roadmap" }],
    }),
    /recommendImpl function/,
  );
});

test("planChange manifest draft excludes Access, repo-owned, and generated-output targets", async () => {
  const result = await planChange({
    goal: "Draft safe manifest",
    projectName: "SNPM",
    workspaceName: "infrastructure-hq",
    targets: [
      {
        type: "planning",
        pagePath: "Planning > Roadmap",
      },
      {
        type: "project-doc",
        docPath: "Root > Overview",
      },
      {
        type: "template-doc",
        docPath: "Templates > Project Templates > Overview",
      },
      {
        type: "workspace-doc",
        docPath: "Runbooks > Notion Workspace Workflow",
      },
      {
        type: "runbook",
        title: "Release Smoke Test",
      },
      {
        type: "secret",
        domainTitle: "App & Backend",
        title: "DATABASE_URL",
      },
      {
        type: "token",
        domainTitle: "App & Backend",
        title: "SNPM_NOTION_TOKEN",
      },
      {
        type: "generated-secret",
        domainTitle: "App & Backend",
        title: "Generated Webhook Secret",
      },
      {
        type: "generated-token",
        domainTitle: "App & Backend",
        title: "Generated Deploy Token",
      },
      {
        type: "repo-doc",
        repoPath: "docs/local-only.md",
      },
      {
        type: "generated-output",
        repoPath: "artifacts/build.json",
      },
    ],
  }, {
    manifestDraft: true,
    async recommendImpl(args) {
      return {
        ok: true,
        recommendedHome: ["repo-doc", "generated-output"].includes(args.intent) ? "repo" : "notion",
        surface: args.intent,
        targetPath: args.pagePath || args.docPath || args.title,
        repoPath: args.repoPath,
        reason: `Route ${args.intent}`,
        warnings: [],
        nextCommands: [],
      };
    },
  });

  assert.ok(result.manifestDraft, "manifest-draft opt-in should return manifestDraft");
  assert.ok(Array.isArray(result.manifestUnsupportedTargets), "manifest-draft opt-in should return unsupported targets");
  assert.ok(Array.isArray(result.manifestNextCommands), "manifest-draft opt-in should return manifestNextCommands");
  assert.deepEqual(result.manifestDraft.entries.map((entry) => entry.kind), [
    "planning-page",
    "project-doc",
    "template-doc",
    "workspace-doc",
    "runbook",
  ]);
  assert.deepEqual(result.manifestUnsupportedTargets.map((target) => ({
    index: target.index,
    type: target.type,
  })), [
    { index: 5, type: "secret" },
    { index: 6, type: "token" },
    { index: 7, type: "generated-secret" },
    { index: 8, type: "generated-token" },
    { index: 9, type: "repo-doc" },
    { index: 10, type: "generated-output" },
  ]);
  assert.doesNotMatch(
    JSON.stringify(result.manifestDraft),
    /secret-record|access-token|DATABASE_URL|SNPM_NOTION_TOKEN|Generated Webhook Secret|Generated Deploy Token|artifacts\/build\.json|docs\/local-only\.md/,
  );
  assert.ok(result.manifestDraft.entries.every((entry) => entry.file.startsWith("notion/")));

  const validated = validateSyncManifest(result.manifestDraft, {
    manifestPath: "C:\\repo\\snpm.sync.json",
  });
  assert.equal(validated.version, 2);
  assert.equal(validated.workspaceName, "infrastructure-hq");
  assert.equal(validated.projectName, "SNPM");
});

test("planChange omits manifest draft fields unless explicitly requested", async () => {
  const result = await planChange({
    goal: "No manifest draft",
    projectName: "SNPM",
    targets: [{
      type: "planning",
      pagePath: "Planning > Roadmap",
    }],
  }, {
    async recommendImpl(args) {
      return {
        ok: true,
        recommendedHome: "notion",
        surface: args.intent,
        targetPath: args.pagePath,
        warnings: [],
        nextCommands: [],
      };
    },
  });

  assert.equal(result.manifestDraft, undefined);
  assert.equal(result.manifestUnsupportedTargets, undefined);
  assert.equal(result.manifestNextCommands, undefined);
});

test("planChange manifest draft is read-only and does not call write or mutation hooks", async () => {
  const forbiddenHook = () => {
    throw new Error("manifest-draft must not write files, sidecars, journals, or mutate Notion");
  };

  const result = await planChange({
    goal: "Read-only manifest draft",
    projectName: "SNPM",
    targets: [{
      type: "planning",
      pagePath: "Planning > Current Cycle",
    }],
  }, {
    manifestDraft: true,
    writeFileImpl: forbiddenHook,
    writeSidecarImpl: forbiddenHook,
    writeJournalImpl: forbiddenHook,
    mutateNotionImpl: forbiddenHook,
    async recommendImpl(args) {
      return {
        ok: true,
        recommendedHome: "notion",
        surface: args.intent,
        targetPath: args.pagePath,
        warnings: [],
        nextCommands: [],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.ok(result.manifestDraft, "manifest-draft opt-in should return manifestDraft");
  assert.equal(result.manifestDraft.entries.length, 1);
  assert.equal(result.manifestDraft.entries[0].kind, "planning-page");
});

test("normalizePlanChangeInput rejects invalid top-level input clearly", () => {
  assert.throws(() => normalizePlanChangeInput(null), /input must be a JSON object/);
  assert.throws(() => normalizePlanChangeInput({ goal: "", targets: [] }), /goal must be a non-empty string/);
  assert.throws(() => normalizePlanChangeInput({ goal: "Plan", targets: [] }), /targets must be a non-empty array/);
  assert.throws(() => normalizePlanChangeInput({ goal: "Plan", targets: ["planning"] }), /targets\[0\] must be an object/);
});

test("normalizePlanChangeInput rejects unsupported target type clearly", () => {
  assert.throws(
    () => normalizePlanChangeInput({
      goal: "Plan",
      projectName: "SNPM",
      targets: [{ type: "validation-session", title: "Regression" }],
    }),
    /targets\[0\]\.type "validation-session" is unsupported/,
  );
});

test("normalizePlanChangeInput validates type-specific required fields", () => {
  const cases = [
    [{ type: "planning", projectName: "SNPM" }, /targets\[0\]\.pagePath/],
    [{ type: "project-doc", projectName: "SNPM" }, /targets\[0\]\.docPath/],
    [{ type: "runbook", projectName: "SNPM" }, /targets\[0\]\.title/],
    [{ type: "secret", projectName: "SNPM", title: "API Key" }, /targets\[0\]\.domainTitle/],
    [{ type: "token", projectName: "SNPM", domainTitle: "App" }, /targets\[0\]\.title/],
    [{ type: "template-doc" }, /targets\[0\]\.docPath/],
    [{ type: "workspace-doc" }, /targets\[0\]\.docPath/],
    [{ type: "repo-doc", projectName: "SNPM" }, /targets\[0\]\.repoPath/],
  ];

  for (const [target, expected] of cases) {
    assert.throws(
      () => normalizePlanChangeInput({
        goal: "Plan",
        targets: [target],
      }),
      expected,
    );
  }
});

test("normalizePlanChangeInput requires projectName for project-scoped target types", () => {
  for (const type of [
    "planning",
    "project-doc",
    "runbook",
    "secret",
    "token",
    "implementation-note",
    "design-spec",
    "task-breakdown",
    "investigation",
    "repo-doc",
    "generated-output",
  ]) {
    assert.throws(
      () => normalizePlanChangeInput({
        goal: "Plan",
        targets: [{
          type,
          pagePath: "Roadmap",
          docPath: "Root > Overview",
          title: "Title",
          domainTitle: "Domain",
          repoPath: "notes/change.md",
        }],
      }),
      new RegExp(`projectName is required for ${type}`),
    );
  }
});
