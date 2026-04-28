import test from "node:test";
import assert from "node:assert/strict";

import { loadWorkspaceConfig } from "../src/notion/config.mjs";
import { normalizeProjectPolicyPackValue } from "../src/notion/project-policy.mjs";
import { getProjectPolicyStarterDocScaffold } from "../src/notion/managed-doc-policy.mjs";

function withClearedWorkspaceConfigDir(fn) {
  const previous = process.env.SNPM_WORKSPACE_CONFIG_DIR;
  try {
    delete process.env.SNPM_WORKSPACE_CONFIG_DIR;
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.SNPM_WORKSPACE_CONFIG_DIR;
    } else {
      process.env.SNPM_WORKSPACE_CONFIG_DIR = previous;
    }
  }
}

function makePolicyPack(overrides = {}) {
  return {
    version: 1,
    reservedProjectRoots: ["Ops", "Planning", "Access"],
    approvedPlanningPages: ["Roadmap", "Current Cycle", "Backlog"],
    curatedWorkspaceDocs: [
      { path: "Templates", pageId: "templates" },
    ],
    curatedTemplateDocs: [
      { path: "Templates > Project Templates", pageId: "project-templates" },
    ],
    projectStarterRoots: [
      {
        title: "Ops",
        children: [],
      },
      {
        title: "Planning",
        children: [
          { title: "Roadmap", children: [] },
          { title: "Current Cycle", children: [] },
          { title: "Backlog", children: [] },
        ],
      },
      {
        title: "Access",
        children: [],
      },
    ],
    optionalSurfaces: [
      {
        surface: "build-records",
        path: "Ops > Builds",
        kind: "page",
        reason: "Build records are optional.",
      },
    ],
    truthBoundaries: [
      {
        surface: "planning",
        recommendedHome: "notion",
        reason: "Planning state belongs in Notion.",
      },
      {
        surface: "repo-doc",
        recommendedHome: "repo",
        reason: "Code-coupled docs stay in the repo.",
      },
    ],
    ...overrides,
  };
}

test("default project policy pack matches the current Infrastructure HQ config", () => {
  const config = withClearedWorkspaceConfigDir(() => loadWorkspaceConfig("infrastructure-hq.example"));

  assert.equal(config.policyPack.version, 1);
  assert.deepEqual(
    config.policyPack.reservedProjectRoots,
    config.projectStarter.children.map((child) => child.title),
  );
  assert.deepEqual(config.policyPack.approvedPlanningPages, [
    "Roadmap",
    "Current Cycle",
    "Backlog",
    "Decision Log",
  ]);
  assert.deepEqual(config.policyPack.curatedWorkspaceDocs, config.workspace.managedDocs.exactPages);
  assert.deepEqual(config.policyPack.curatedTemplateDocs, config.workspace.managedDocs.subtreeRoots);
  assert.deepEqual(config.policyPack.projectStarterRoots, config.projectStarter.children);
  assert.ok(config.policyPack.optionalSurfaces.some((surface) => surface.surface === "build-records"));
  assert.ok(config.policyPack.optionalSurfaces.some((surface) => surface.surface === "validation-sessions"));
  assert.ok(config.policyPack.truthBoundaries.some((boundary) => boundary.surface === "planning"));
  assert.ok(config.policyPack.truthBoundaries.some((boundary) => boundary.surface === "generated-output"));
  assert.deepEqual(config.policyPack.starterDocScaffold, [
    {
      id: "root-overview",
      kind: "project-doc",
      target: "Root > Overview",
      file: "docs/project-overview.md",
      templateId: "project-overview",
    },
    {
      id: "root-operating-model",
      kind: "project-doc",
      target: "Root > Operating Model",
      file: "docs/operating-model.md",
      templateId: "project-operating-model",
    },
    {
      id: "planning-roadmap",
      kind: "planning-page",
      target: "Planning > Roadmap",
      file: "planning/roadmap.md",
      templateId: "planning-roadmap",
    },
    {
      id: "planning-current-cycle",
      kind: "planning-page",
      target: "Planning > Current Cycle",
      file: "planning/current-cycle.md",
      templateId: "planning-current-cycle",
    },
  ]);
  assert.deepEqual(getProjectPolicyStarterDocScaffold(config), config.policyPack.starterDocScaffold);
});

test("explicit project policy pack v1 validates and normalizes", () => {
  const policyPack = normalizeProjectPolicyPackValue(makePolicyPack({
    reservedProjectRoots: [" Ops ", "Planning", "Access"],
  }), "inline config");

  assert.deepEqual(policyPack.reservedProjectRoots, ["Ops", "Planning", "Access"]);
  assert.equal(policyPack.curatedTemplateDocs[0].path, "Templates > Project Templates");
  assert.equal(policyPack.truthBoundaries[0].recommendedHome, "notion");
  assert.deepEqual(policyPack.starterDocScaffold.map((entry) => entry.target), [
    "Root > Overview",
    "Root > Operating Model",
    "Planning > Roadmap",
    "Planning > Current Cycle",
  ]);
});

test("project policy pack accepts explicit starter doc scaffold entries", () => {
  const policyPack = normalizeProjectPolicyPackValue(makePolicyPack({
    starterDocScaffold: [
      {
        id: " overview ",
        kind: "project-doc",
        target: " Root > Overview ",
        file: " docs/overview.md ",
        templateId: "project-overview",
      },
      {
        id: "cycle",
        kind: "planning-page",
        target: " Planning > Current Cycle ",
        file: "planning/current-cycle.md",
        templateId: "planning-current-cycle",
      },
    ],
  }), "inline config");

  assert.deepEqual(policyPack.starterDocScaffold, [
    {
      id: "overview",
      kind: "project-doc",
      target: "Root > Overview",
      file: "docs/overview.md",
      templateId: "project-overview",
    },
    {
      id: "cycle",
      kind: "planning-page",
      target: "Planning > Current Cycle",
      file: "planning/current-cycle.md",
      templateId: "planning-current-cycle",
    },
  ]);
});

test("project policy pack rejects malformed reserved project roots", () => {
  assert.throws(
    () => normalizeProjectPolicyPackValue(makePolicyPack({
      reservedProjectRoots: ["Ops", ""],
    }), "inline config"),
    /policyPack\.reservedProjectRoots\[1\]/,
  );
});

test("project policy pack rejects malformed starter roots", () => {
  assert.throws(
    () => normalizeProjectPolicyPackValue(makePolicyPack({
      projectStarterRoots: [{ title: "Ops" }],
    }), "inline config"),
    /policyPack\.projectStarterRoots\[0\]\.children/,
  );
});

test("project policy pack rejects starter roots that are not reserved roots", () => {
  assert.throws(
    () => normalizeProjectPolicyPackValue(makePolicyPack({
      reservedProjectRoots: ["Planning"],
    }), "inline config"),
    /reservedProjectRoots must include every policyPack\.projectStarterRoots title\. Missing: "Ops", "Access"/,
  );
});

test("project policy pack rejects duplicate surfaces", () => {
  assert.throws(
    () => normalizeProjectPolicyPackValue(makePolicyPack({
      optionalSurfaces: [
        {
          surface: "build-records",
          path: "Ops > Builds",
          kind: "page",
          reason: "Build records are optional.",
        },
        {
          surface: "build-records",
          path: "Ops > Builds Archive",
          kind: "page",
          reason: "Duplicate surface.",
        },
      ],
    }), "inline config"),
    /duplicate surfaces in policyPack\.optionalSurfaces: "build-records"/,
  );

  assert.throws(
    () => normalizeProjectPolicyPackValue(makePolicyPack({
      truthBoundaries: [
        {
          surface: "planning",
          recommendedHome: "notion",
          reason: "Planning state belongs in Notion.",
        },
        {
          surface: "planning",
          recommendedHome: "repo",
          reason: "Duplicate surface.",
        },
      ],
    }), "inline config"),
    /duplicate surfaces in policyPack\.truthBoundaries: "planning"/,
  );
});

test("project policy pack rejects duplicate starter doc scaffold identifiers", () => {
  for (const [overrides, pattern] of [
    [
      {
        starterDocScaffold: [
          {
            id: "overview",
            kind: "project-doc",
            target: "Root > Overview",
            file: "docs/overview.md",
            templateId: "project-overview",
          },
          {
            id: "overview",
            kind: "project-doc",
            target: "Root > Operating Model",
            file: "docs/operating-model.md",
            templateId: "project-operating-model",
          },
        ],
      },
      /duplicate starter doc scaffold ids/,
    ],
    [
      {
        starterDocScaffold: [
          {
            id: "overview",
            kind: "project-doc",
            target: "Root > Overview",
            file: "docs/shared.md",
            templateId: "project-overview",
          },
          {
            id: "operating-model",
            kind: "project-doc",
            target: "Root > Operating Model",
            file: "docs\\shared.md",
            templateId: "project-operating-model",
          },
        ],
      },
      /duplicate starter doc scaffold files/,
    ],
    [
      {
        starterDocScaffold: [
          {
            id: "overview",
            kind: "project-doc",
            target: "Root > Overview",
            file: "docs/overview.md",
            templateId: "project-overview",
          },
          {
            id: "overview-copy",
            kind: "project-doc",
            target: " Root > Overview ",
            file: "docs/overview-copy.md",
            templateId: "project-overview",
          },
        ],
      },
      /duplicate starter doc scaffold targets/,
    ],
  ]) {
    assert.throws(
      () => normalizeProjectPolicyPackValue(makePolicyPack(overrides), "inline config"),
      pattern,
    );
  }
});

test("project policy pack rejects unsafe starter doc scaffold entries", () => {
  const baseEntry = {
    id: "overview",
    kind: "project-doc",
    target: "Root > Overview",
    file: "docs/overview.md",
    templateId: "project-overview",
  };

  for (const [entryOverride, pattern] of [
    [{ kind: "template-doc" }, /kind must be project-doc or planning-page/],
    [{ target: "Root > Arbitrary" }, /approved starter doc scaffold targets/],
    [{ target: "Planning > Current Cycle", kind: "project-doc" }, /approved starter doc scaffold targets/],
    [{ target: "Planning > Current Cycle", kind: "planning-page" }, /approved planning page/],
    [{ file: "../overview.md" }, /path escapes/],
    [{ file: "C:\\outside\\overview.md" }, /relative file path/],
    [{ file: "docs/*.md" }, /glob patterns/],
    [{ templateId: "custom-template" }, /built-in starter doc scaffold template id/],
    [{ templateId: "planning-roadmap" }, /templateId must be "project-overview"/],
    [{ target: "Root > 12345678-1234-1234-1234-123456789abc" }, /raw Notion page id/],
  ]) {
    assert.throws(
      () => normalizeProjectPolicyPackValue(makePolicyPack({
        approvedPlanningPages: ["Roadmap"],
        starterDocScaffold: [{ ...baseEntry, ...entryOverride }],
      }), "inline config"),
      pattern,
    );
  }
});

test("project policy pack rejects unsupported versions", () => {
  assert.throws(
    () => normalizeProjectPolicyPackValue(makePolicyPack({
      version: 2,
    }), "inline config"),
    /policyPack\.version must be 1/,
  );
});
