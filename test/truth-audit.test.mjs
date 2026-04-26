import test from "node:test";
import assert from "node:assert/strict";

import {
  auditTruthPages,
  computeAgeDays,
  isPlaceholderOnlyMarkdown,
  parseLastUpdated,
  parseManagedTruthHeader,
  summarizeTruthAudit,
} from "../src/notion/truth-audit.mjs";

const NOW = "2026-04-25T12:00:00.000Z";

function managedMarkdown({ canonical = "Projects > SNPM > Planning > Roadmap", lastUpdated = "2026-04-20", sensitive = "no", body = "## Source Of Truth\n- Current.\n\n## Milestones\n- Active.\n" } = {}) {
  return [
    "Purpose: Test page",
    canonical === null ? null : `Canonical Source: ${canonical}`,
    "Read This When: Testing",
    lastUpdated === null ? null : `Last Updated: ${lastUpdated}`,
    `Sensitive: ${sensitive}`,
    "---",
    body,
  ].filter((line) => line !== null).join("\n");
}

function basePage(overrides = {}) {
  return {
    surface: "planning",
    targetPath: "Projects > SNPM > Planning > Roadmap",
    pageId: "page-roadmap",
    projectName: "SNPM",
    commandFamily: "page",
    markdown: managedMarkdown(),
    ...overrides,
  };
}

test("parseLastUpdated accepts managed timestamp formats and computeAgeDays uses injectable now", () => {
  assert.equal(parseLastUpdated("2026-04-24").toISOString(), "2026-04-24T00:00:00.000Z");
  assert.equal(parseLastUpdated("04-24-2026 10:30:00").toISOString(), "2026-04-24T10:30:00.000Z");
  assert.equal(parseLastUpdated("2026-04-24T10:30:00.000Z").toISOString(), "2026-04-24T10:30:00.000Z");
  assert.equal(computeAgeDays(parseLastUpdated("2026-04-20"), new Date(NOW)), 5);
});

test("auditTruthPages flags stale pages only after the staleAfterDays threshold", () => {
  const fresh = auditTruthPages([
    basePage({ pageId: "age-30", markdown: managedMarkdown({ lastUpdated: "2026-03-26" }) }),
  ], { now: NOW, staleAfterDays: 30 });
  const stale = auditTruthPages([
    basePage({ pageId: "age-31", markdown: managedMarkdown({ lastUpdated: "2026-03-25" }) }),
  ], { now: NOW, staleAfterDays: 30 });

  assert.equal(fresh.staleCount, 0);
  assert.equal(stale.staleCount, 1);
  assert.equal(stale.findings[0].code, "truth-audit.stale-page");
  assert.equal(stale.findings[0].ageDays, 31);
  assert.equal(stale.findings[0].lastUpdated, "2026-03-25");
});

test("parseManagedTruthHeader and audit findings cover missing and unparseable headers", () => {
  const parsed = parseManagedTruthHeader(managedMarkdown({ canonical: null, lastUpdated: "[YYYY-MM-DD]" }));
  assert.equal(parsed.canonicalSource, null);
  assert.equal(parsed.lastUpdated, "[YYYY-MM-DD]");

  const result = auditTruthPages([
    basePage({
      markdown: managedMarkdown({ canonical: null, lastUpdated: "[YYYY-MM-DD]" }),
    }),
    basePage({
      pageId: "unmanaged",
      targetPath: "Projects > SNPM > Docs > Legacy",
      surface: "project-doc",
      markdown: "## Legacy\n- Content without managed header.\n",
    }),
  ], { now: NOW });

  assert.deepEqual(result.findings.map((finding) => finding.code), [
    "truth-audit.missing-canonical-source",
    "truth-audit.invalid-last-updated",
    "truth-audit.missing-canonical-source",
    "truth-audit.missing-last-updated",
    "truth-audit.empty-body",
  ]);
  assert.equal(result.findings.filter((finding) => finding.severity === "error").length, 4);
});

test("auditTruthPages detects empty managed bodies", () => {
  const result = auditTruthPages([
    basePage({ markdown: managedMarkdown({ body: "" }) }),
  ], { now: NOW });

  assert.equal(result.placeholderCount, 1);
  assert.equal(result.findings[0].code, "truth-audit.empty-body");
  assert.match(result.findings[0].safeNextCommand, /npm run page-pull -- --project "SNPM" --page "Planning > Roadmap"/);
});

test("placeholder-only markdown and bodies are detected", () => {
  assert.equal(isPlaceholderOnlyMarkdown("- Replace this placeholder with current content."), true);
  assert.equal(isPlaceholderOnlyMarkdown("- Current owner: Platform Team"), false);

  const result = auditTruthPages([
    basePage({
      targetPath: "Projects > SNPM > Docs > Overview",
      surface: "project-doc",
      commandFamily: "doc",
      markdown: managedMarkdown({
        canonical: "Projects > SNPM > Docs > Overview",
        body: [
          "## Purpose",
          "- Replace this placeholder with the current reference content.",
          "",
        ].join("\n"),
      }),
    }),
  ], { now: NOW });

  assert.equal(result.placeholderCount, 1);
  assert.equal(result.findings[0].code, "truth-audit.placeholder-body");
  assert.match(result.findings[0].safeNextCommand, /npm run doc-pull -- (?:--project "SNPM" )?--path "Projects > SNPM > Docs > Overview"/);
});

test("roadmap and current-cycle important sections are checked", () => {
  const result = auditTruthPages([
    basePage({
      markdown: managedMarkdown({
        body: [
          "## Source Of Truth",
          "- Replace this placeholder.",
          "",
        ].join("\n"),
      }),
    }),
    basePage({
      pageId: "current-cycle",
      targetPath: "Projects > SNPM > Planning > Current Cycle",
      markdown: managedMarkdown({
        canonical: "Projects > SNPM > Planning > Current Cycle",
        body: [
          "## Current Focus",
          "- Shipping drift audit.",
          "",
          "## Active Work",
          "- TBD",
          "",
        ].join("\n"),
      }),
    }),
  ], { now: NOW });

  assert.deepEqual(result.findings.map((finding) => finding.code), [
    "truth-audit.placeholder-important-section",
    "truth-audit.placeholder-body",
    "truth-audit.missing-important-section",
    "truth-audit.placeholder-important-section",
  ]);
  assert.equal(result.placeholderCount, 4);
  assert.ok(result.findings.some((finding) => /Milestones/.test(finding.message)));
  assert.ok(result.findings.some((finding) => /Active Work/.test(finding.message)));
});

test("secret-bearing pages skip body inspection by design", () => {
  const result = auditTruthPages([
    basePage({
      surface: "access",
      targetPath: "Projects > SNPM > Access > App & Backend > API_KEY",
      pageId: "secret-page",
      commandFamily: "secret-record",
      secretBearing: true,
      markdown: managedMarkdown({
        canonical: "Projects > SNPM > Access > App & Backend > API_KEY",
        lastUpdated: "2026-03-01",
        sensitive: "yes",
        body: "",
      }),
    }),
  ], { now: NOW });

  assert.equal(result.placeholderCount, 0);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].code, "truth-audit.stale-page");
  assert.match(result.findings[0].safeNextCommand, /npm run secret-record-pull -- --project "SNPM" --domain "App & Backend" --title "API_KEY" --output "-"/);
});

test("summary helpers return deterministic findings, recommendations, and commands", () => {
  const result = auditTruthPages([
    basePage({
      pageId: "b",
      targetPath: "Projects > SNPM > Planning > Current Cycle",
      markdown: managedMarkdown({
        canonical: "Projects > SNPM > Planning > Current Cycle",
        lastUpdated: "2026-03-01",
        body: "## Current Focus\n- Current.\n\n## Active Work\n- Active.\n",
      }),
    }),
    basePage({
      pageId: "a",
      targetPath: "Projects > SNPM > Planning > Roadmap",
      markdown: managedMarkdown({ lastUpdated: "bad-date", body: "" }),
    }),
  ], { now: NOW, staleAfterDays: 30 });

  assert.equal(result.checkedCount, 2);
  assert.equal(result.staleCount, 1);
  assert.equal(result.placeholderCount, 1);
  assert.deepEqual(result.findings.map((finding) => finding.code), [
    "truth-audit.stale-page",
    "truth-audit.invalid-last-updated",
    "truth-audit.empty-body",
  ]);
  assert.deepEqual(result.safeNextCommands, [
    "npm run page-pull -- --project \"SNPM\" --page \"Planning > Current Cycle\"",
    "npm run page-pull -- --project \"SNPM\" --page \"Planning > Roadmap\"",
  ]);
  assert.equal(result.recommendations.length, 3);

  const { staleAfterDays, ...summaryWithoutThreshold } = result;
  assert.equal(staleAfterDays, 30);
  assert.deepEqual(summarizeTruthAudit([...result.findings].reverse(), 2), summaryWithoutThreshold);
});
