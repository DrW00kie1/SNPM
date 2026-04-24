import test from "node:test";
import assert from "node:assert/strict";

import {
  MANIFEST_V2_SELECTOR_KINDS,
  parseManifestSelector,
  parseManifestSelectorList,
  selectManifestEntries,
} from "../src/notion/manifest-selection.mjs";

function makeEntry(kind, target, file = `${kind}.md`) {
  const entry = {
    kind,
    target,
    file,
  };

  if (kind === "planning-page") {
    entry.pagePath = target;
  } else if (["project-doc", "template-doc", "workspace-doc"].includes(kind)) {
    entry.docPath = target;
  } else {
    entry.title = target;
  }

  return entry;
}

function manifestV2(entries) {
  return {
    version: 2,
    workspaceName: "infrastructure-hq",
    projectName: "SNPM",
    entries,
  };
}

function mixedEntries() {
  return [
    makeEntry("planning-page", "Planning > Roadmap", "planning/roadmap.md"),
    makeEntry("project-doc", "Root > Overview", "docs/project-overview.md"),
    makeEntry("template-doc", "Templates > Project Templates > Overview", "templates/project-overview.md"),
    makeEntry("workspace-doc", "Runbooks > Notion Workspace Workflow", "workspace/notion-workflow.md"),
    makeEntry("runbook", "Release Smoke Test", "runbooks/release-smoke.md"),
    makeEntry("validation-session", "SNPM Validation Session Fixture", "ops/validation/session.md"),
  ];
}

test("parseManifestSelector normalizes exact string and object selectors", () => {
  assert.deepEqual(parseManifestSelector(" project-doc: Root  >  Overview "), {
    kind: "project-doc",
    target: "Root > Overview",
    key: "project-doc:Root > Overview",
    label: "project-doc: Root  >  Overview",
  });

  assert.deepEqual(parseManifestSelector({ kind: "runbook", target: " Release Smoke Test " }), {
    kind: "runbook",
    target: "Release Smoke Test",
    key: "runbook:Release Smoke Test",
    label: "runbook:Release Smoke Test",
  });
});

test("parseManifestSelectorList supports all manifest v2 selector kinds", () => {
  const selectors = parseManifestSelectorList(MANIFEST_V2_SELECTOR_KINDS.map((kind) => `${kind}:Target`));

  assert.deepEqual(selectors.map((selector) => selector.kind), [
    "planning-page",
    "project-doc",
    "template-doc",
    "workspace-doc",
    "runbook",
    "validation-session",
  ]);
});

test("parseManifestSelectorList rejects malformed, unsupported, and duplicate selectors", () => {
  assert.throws(() => parseManifestSelector("project-doc"), /kind:target/);
  assert.throws(() => parseManifestSelector("project-doc:"), /kind:target/);
  assert.throws(() => parseManifestSelector(":Root > Overview"), /kind:target/);
  assert.throws(() => parseManifestSelector("secret-record:Production API"), /unsupported kind/);
  assert.throws(() => parseManifestSelectorList(["project-doc:Root > Overview", "project-doc: Root  > Overview "]), /duplicated/);
  assert.throws(() => parseManifestSelectorList({ kind: "runbook", target: "Release Smoke Test" }), /array/);
});

test("selectManifestEntries preserves whole-manifest behavior without selectors", () => {
  const entries = mixedEntries();
  const result = selectManifestEntries(manifestV2(entries));

  assert.equal(result.selectedCount, entries.length);
  assert.equal(result.skippedCount, 0);
  assert.equal(result.selectedEntries, entries);
  assert.deepEqual(result.skippedEntries, []);
  assert.deepEqual(result.selectorLabels, []);
});

test("selectManifestEntries selects repeatable exact selectors and reports skipped entries", () => {
  const entries = mixedEntries();
  const result = selectManifestEntries(manifestV2(entries), [
    "project-doc: Root > Overview",
    "runbook:Release Smoke Test",
  ]);

  assert.deepEqual(result.selectedEntries.map((entry) => `${entry.kind}:${entry.target}`), [
    "project-doc:Root > Overview",
    "runbook:Release Smoke Test",
  ]);
  assert.deepEqual(result.skippedEntries.map((entry) => `${entry.kind}:${entry.target}`), [
    "planning-page:Planning > Roadmap",
    "template-doc:Templates > Project Templates > Overview",
    "workspace-doc:Runbooks > Notion Workspace Workflow",
    "validation-session:SNPM Validation Session Fixture",
  ]);
  assert.equal(result.selectedCount, 2);
  assert.equal(result.skippedCount, 4);
  assert.deepEqual(result.selectorLabels, [
    "project-doc: Root > Overview",
    "runbook:Release Smoke Test",
  ]);
});

test("selectManifestEntries rejects no-match and ambiguous selectors before work", () => {
  assert.throws(() => selectManifestEntries(manifestV2(mixedEntries()), [
    "project-doc:Root > Missing",
  ]), /did not match any entry/);

  assert.throws(() => selectManifestEntries(manifestV2([
    makeEntry("runbook", "Release Smoke Test", "one.md"),
    makeEntry("runbook", "Release Smoke Test", "two.md"),
  ]), [
    "runbook:Release Smoke Test",
  ]), /matched multiple entries/);
});

test("selectManifestEntries keeps manifest v1 unsupported when selectors are provided", () => {
  const manifest = {
    version: 1,
    entries: [makeEntry("validation-session", "Legacy Session", "legacy.md")],
  };

  assert.equal(selectManifestEntries(manifest).selectedCount, 1);
  assert.throws(() => selectManifestEntries(manifest, [
    "validation-session:Legacy Session",
  ]), /only supported for manifest v2/);
});
