import test from "node:test";
import assert from "node:assert/strict";

import {
  auditConsistency,
  extractAccessReferences,
  extractActiveMarkers,
  extractRunbookReferences,
} from "../src/notion/consistency-audit.mjs";

function managed(body) {
  return `Canonical Source: Projects > SNPM\nLast Updated: 2026-04-25\n---\n${body}`;
}

function page({ title, path, body, surface = "planning", pageId = title.toLowerCase().replace(/\s+/g, "-") }) {
  return {
    surface,
    type: surface === "planning" ? "planning-page" : "project-doc",
    title,
    pageId,
    targetPath: `Projects > SNPM > ${path}`,
    projectName: "SNPM",
    commandFamily: surface === "planning" ? "page" : "doc",
    commandTarget: path,
    markdown: managed(body),
  };
}

function baseInventory() {
  return {
    runbookInventory: {
      present: true,
      runbooks: [
        {
          title: "Notion Workspace Workflow",
          pageId: "runbook-workflow",
          targetPath: "Projects > SNPM > Runbooks > Notion Workspace Workflow",
          managed: true,
        },
      ],
    },
    accessInventory: {
      present: true,
      domains: [
        {
          title: "App & Backend",
          pageId: "access-app",
          targetPath: "Projects > SNPM > Access > App & Backend",
          managed: true,
          records: [
            {
              title: "DATABASE_URL",
              pageId: "secret-db",
              targetPath: "Projects > SNPM > Access > App & Backend > DATABASE_URL",
              kind: "secret-record",
              managed: true,
            },
          ],
        },
      ],
    },
  };
}

test("extractActiveMarkers uses explicit active fields and stable sprint markers", () => {
  const markers = extractActiveMarkers(managed(`
## Current Focus
- Active Sprint: Sprint 5.2A
- Active Branch: feature/consistency-audit
`));

  assert.deepEqual(
    markers.map((marker) => `${marker.type}:${marker.value}`),
    [
      "sprint:Sprint 5.2A",
      "branch:feature/consistency-audit",
    ],
  );
});

test("extract reference helpers find only explicit runbook and Access references", () => {
  const markdown = managed(`
Use \`Runbooks > Notion Workspace Workflow\` before mutation.
Runtime credential lives at \`Access > App & Backend > DATABASE_URL\`.
This paragraph mentions runbooks and access generally but is not a reference.
`);

  assert.deepEqual(extractRunbookReferences(markdown).map((ref) => ref.title), ["Notion Workspace Workflow"]);
  assert.deepEqual(extractAccessReferences(markdown).map((ref) => `${ref.domainTitle} > ${ref.title}`), ["App & Backend > DATABASE_URL"]);
});

test("consistency audit is clean for matching roadmap/current-cycle markers and existing references", () => {
  const inventory = baseInventory();
  const result = auditConsistency({
    projectName: "SNPM",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    pages: [
      page({
        title: "Roadmap",
        path: "Planning > Roadmap",
        body: "## Milestones\n- Active Sprint: Sprint 5.2A\n- See `Runbooks > Notion Workspace Workflow`",
      }),
      page({
        title: "Current Cycle",
        path: "Planning > Current Cycle",
        body: "## Current Focus\n- Active Sprint: Sprint 5.2A\n- `Access > App & Backend > DATABASE_URL`",
      }),
    ],
    ...inventory,
  });

  assert.equal(result.advisory, true);
  assert.equal(result.status, "clean");
  assert.equal(result.findingCount, 0);
  assert.equal(result.checkedCount, 2);
  assert.deepEqual(result.findings, []);
});

test("consistency audit flags roadmap/current-cycle active marker mismatches", () => {
  const result = auditConsistency({
    projectName: "SNPM",
    pages: [
      page({
        title: "Roadmap",
        path: "Planning > Roadmap",
        body: "## Milestones\n- Active Sprint: Sprint 5.2A",
      }),
      page({
        title: "Current Cycle",
        path: "Planning > Current Cycle",
        body: "## Current Focus\n- Active Sprint: Sprint 5.3A",
      }),
    ],
    ...baseInventory(),
  });

  assert.equal(result.status, "findings");
  assert.equal(result.findingCount, 1);
  assert.equal(result.findings[0].code, "consistency.roadmap-current-cycle.active-marker-mismatch");
  assert.equal(result.findings[0].markerType, "sprint");
  assert.match(result.findings[0].safeNextCommands.join("\n"), /page-pull/);
});

test("consistency audit ignores ambiguous roadmap/current-cycle prose", () => {
  const result = auditConsistency({
    projectName: "SNPM",
    pages: [
      page({
        title: "Roadmap",
        path: "Planning > Roadmap",
        body: "## Milestones\nThe next effort concerns consistency work.",
      }),
      page({
        title: "Current Cycle",
        path: "Planning > Current Cycle",
        body: "## Current Focus\nThe active work concerns project quality.",
      }),
    ],
    ...baseInventory(),
  });

  assert.equal(result.status, "clean");
  assert.equal(result.findingCount, 0);
});

test("consistency audit flags missing runbook references", () => {
  const result = auditConsistency({
    projectName: "SNPM",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    pages: [
      page({
        title: "Overview",
        path: "Overview",
        surface: "project-docs",
        body: "Follow `Runbooks > Missing Deployment` before release.",
      }),
    ],
    ...baseInventory(),
  });

  assert.equal(result.findingCount, 1);
  assert.equal(result.findings[0].code, "consistency.runbook-reference.missing");
  assert.equal(result.findings[0].referencedTitle, "Missing Deployment");
  assert.match(result.findings[0].safeNextCommand, /recommend/);
  assert.match(result.findings[0].safeNextCommand, /SNPM_NOTION_TOKEN/);
});

test("consistency audit flags missing Access domains and records from structural inventory only", () => {
  const missingDomain = auditConsistency({
    projectName: "SNPM",
    pages: [
      page({
        title: "Overview",
        path: "Overview",
        surface: "project-docs",
        body: "Needs `Access > Missing Domain > DATABASE_URL`.",
      }),
    ],
    ...baseInventory(),
  });
  const missingRecord = auditConsistency({
    projectName: "SNPM",
    pages: [
      page({
        title: "Overview",
        path: "Overview",
        surface: "project-docs",
        body: "Needs `Access > App & Backend > REDIS_URL`.",
      }),
    ],
    ...baseInventory(),
  });

  assert.equal(missingDomain.findings[0].code, "consistency.access-reference.missing-domain");
  assert.equal(missingDomain.findings[0].referencedDomainTitle, "Missing Domain");
  assert.equal(missingRecord.findings[0].code, "consistency.access-reference.missing-record");
  assert.equal(missingRecord.findings[0].referencedTitle, "REDIS_URL");
  assert.doesNotMatch(JSON.stringify(missingRecord), /Raw Value|sk-live|super-secret/i);
});

test("consistency audit reports read failures without changing advisory shape", () => {
  const result = auditConsistency({
    projectName: "SNPM",
    pages: [
      {
        surface: "project-docs",
        type: "project-doc",
        title: "Overview",
        pageId: "overview",
        targetPath: "Projects > SNPM > Overview",
        readFailure: "GET pages/overview/markdown failed: 502 <html><body>Cloudflare Bad gateway with noisy body</body></html>",
        safeNextCommand: "npm run doc-pull -- --project \"SNPM\" --path \"Root > Overview\" --output -",
      },
    ],
    ...baseInventory(),
  });

  assert.equal(result.advisory, true);
  assert.equal(result.status, "findings");
  assert.equal(result.findings[0].code, "consistency.page-read-failed");
  assert.match(result.findings[0].message, /HTTP 502/);
  assert.doesNotMatch(JSON.stringify(result.findings[0]), /Cloudflare Bad gateway/);
  assert.equal(result.findings[0].safeNextCommand, "npm run doc-pull -- --project \"SNPM\" --path \"Root > Overview\" --output -");
  assert.equal(result.bySeverity.warning, 1);
});
