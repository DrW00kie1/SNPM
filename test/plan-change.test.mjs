import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizePlanChangeInput,
  planChange,
} from "../src/commands/plan-change.mjs";

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
