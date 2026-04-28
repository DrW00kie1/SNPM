import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { writeManifestV2PreviewReviewArtifacts } from "../src/commands/sync-review-output.mjs";
import { assertJsonContract } from "../src/contracts/json-contracts.mjs";

function tempReviewDir() {
  return mkdtempSync(path.join(os.tmpdir(), "snpm-sync-review-"));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function baseResult(overrides = {}) {
  return {
    command: "sync-push",
    manifestPath: "C:\\repo\\snpm.sync.json",
    projectName: "SNPM",
    workspaceName: "infrastructure-hq",
    authMode: "project-token",
    hasDiff: true,
    driftCount: 2,
    appliedCount: 0,
    diagnostics: {
      generatedBy: "manifest-v2-preview",
      recoveryHint: "review generated artifacts before apply",
    },
    failures: [],
    warnings: ["preview only"],
    entries: [
      {
        kind: "planning-page",
        target: "Planning > Roadmap",
        file: "planning/roadmap.md",
        targetPath: "Projects > SNPM > Planning > Roadmap",
        status: "push-preview",
        hasDiff: true,
        diagnostics: {
          sidecarState: "fresh",
          driftReason: "body-changed",
        },
        recovery: "Run page pull before retry if sidecar freshness changes.",
        recoveryContext: {
          command: "npm run page-pull -- --path \"Projects > SNPM > Planning > Roadmap\"",
          reason: "sidecar-aware review recovery",
        },
        diff: "diff --git a/planning/roadmap.md b/planning/roadmap.md\n@@\n-old\n+new\n",
        applied: false,
        metadataPath: "C:\\repo\\planning\\roadmap.md.snpm-meta.json",
        metadata: {
          schema: "snpm.pull-metadata.v1",
          commandFamily: "page",
          lastEditedTime: "2026-04-23T20:00:00.000Z",
          pulledAt: "2026-04-23T20:01:00.000Z",
          bodyMarkdown: "# must not leak",
        },
      },
      {
        kind: "runbook",
        target: "Release Smoke Test",
        file: "runbooks/release.md",
        targetPath: "Projects > SNPM > Runbooks > Release Smoke Test",
        status: "in-sync",
        hasDiff: false,
        diff: "",
        applied: false,
      },
    ],
    ...overrides,
  };
}

test("writeManifestV2PreviewReviewArtifacts writes deterministic summary and entry artifacts", () => {
  const reviewDir = tempReviewDir();

  try {
    const first = writeManifestV2PreviewReviewArtifacts({
      result: baseResult(),
      reviewOutputDir: reviewDir,
    });
    const firstSnapshot = new Map(first.files.map((filePath) => [path.relative(reviewDir, filePath), readFileSync(filePath, "utf8")]));

    const second = writeManifestV2PreviewReviewArtifacts({
      result: baseResult(),
      reviewOutputDir: reviewDir,
    });
    const secondSnapshot = new Map(second.files.map((filePath) => [path.relative(reviewDir, filePath), readFileSync(filePath, "utf8")]));

    assert.equal(first.written, true);
    assert.equal(first.entryCount, 2);
    assert.equal(first.diffCount, 1);
    assertJsonContract("snpm.manifest-v2.review-output.v1", first);
    assert.deepEqual(secondSnapshot, firstSnapshot);

    const summary = readJson(path.join(reviewDir, "summary.json"));
    assert.equal(summary.command, "sync-push");
    assert.equal(summary.manifestPath, "C:\\repo\\snpm.sync.json");
    assert.equal(summary.projectName, "SNPM");
    assert.equal(summary.workspaceName, "infrastructure-hq");
    assert.equal(summary.selectedEntries, 2);
    assert.equal(summary.selectedCount, 2);
    assert.equal(summary.skippedEntryCount, 0);
    assert.equal(summary.skippedCount, 0);
    assert.equal(summary.skippedEntries, 0);
    assert.deepEqual(summary.skippedEntryDetails, []);
    assert.deepEqual(summary.diagnostics, {
      generatedBy: "manifest-v2-preview",
      recoveryHint: "review generated artifacts before apply",
    });
    assert.deepEqual(summary.targetPaths, [
      "Projects > SNPM > Planning > Roadmap",
      "Projects > SNPM > Runbooks > Release Smoke Test",
    ]);
    assert.deepEqual(summary.entries.map((entry) => ({
      kind: entry.kind,
      surface: entry.surface,
      commandFamily: entry.commandFamily,
      hasDiff: entry.hasDiff,
      diagnostics: entry.diagnostics,
      recovery: entry.recovery,
      recoveryContext: entry.recoveryContext,
      diffFile: entry.diffFile,
    })), [
      {
        kind: "planning-page",
        surface: "planning",
        commandFamily: "page",
        hasDiff: true,
        diagnostics: {
          sidecarState: "fresh",
          driftReason: "body-changed",
        },
        recovery: "Run page pull before retry if sidecar freshness changes.",
        recoveryContext: {
          command: "npm run page-pull -- --path \"Projects > SNPM > Planning > Roadmap\"",
          reason: "sidecar-aware review recovery",
        },
        diffFile: "001-planning-page-planning-roadmap.diff",
      },
      {
        kind: "runbook",
        surface: "runbooks",
        commandFamily: "runbook",
        hasDiff: false,
        diagnostics: undefined,
        recovery: undefined,
        recoveryContext: undefined,
        diffFile: undefined,
      },
    ]);

    const entry = readJson(path.join(reviewDir, "entries", "001-planning-page-planning-roadmap.review.json"));
    assert.equal(entry.sidecar.metadataPresent, true);
    assert.equal(entry.sidecar.schema, "snpm.pull-metadata.v1");
    assert.equal(entry.sidecar.lastEditedTime, "2026-04-23T20:00:00.000Z");
    assert.deepEqual(entry.diagnostics, {
      sidecarState: "fresh",
      driftReason: "body-changed",
    });
    assert.equal(entry.recovery, "Run page pull before retry if sidecar freshness changes.");
    assert.deepEqual(entry.recoveryContext, {
      command: "npm run page-pull -- --path \"Projects > SNPM > Planning > Roadmap\"",
      reason: "sidecar-aware review recovery",
    });
    assert.equal("diff" in entry, false);
    assert.equal(readFileSync(path.join(reviewDir, "entries", "001-planning-page-planning-roadmap.diff"), "utf8"), baseResult().entries[0].diff);
  } finally {
    rmSync(reviewDir, { recursive: true, force: true });
  }
});

test("writeManifestV2PreviewReviewArtifacts redacts metadata and does not leak secrets or page bodies", () => {
  const reviewDir = tempReviewDir();
  const secretDiff = "diff --git a b\n@@\n-ntn_secret_allowed_in_diff\n+secret_value_allowed_in_diff\n";

  try {
    const result = baseResult({
      failures: ["failed with ntn_secret_failure_value and password=hunter2"],
      warnings: ["Bearer abc.def.ghi from SNPM_NOTION_TOKEN"],
      diagnostics: {
        token: "ntn_secret_summary_diagnostic",
        message: "password=summary-password",
      },
      journalExpectation: {
        expected: true,
        token: "ntn_secret_journal_value",
      },
      mutationBudget: {
        state: "preview",
        secret: "secret_mutation_budget_value",
      },
      entries: [{
        kind: "project-doc",
        target: "Root > Overview",
        file: "docs/overview.md",
        targetPath: "Projects > SNPM > Root > Overview",
        status: "push-preview",
        hasDiff: true,
        diff: secretDiff,
        applied: false,
        diagnostics: {
          token: "ntn_secret_entry_diagnostic",
          env: "SNPM_NOTION_TOKEN",
        },
        failure: "token=ntn_secret_entry_failure",
        recovery: "Use Bearer entry.secret.token before retry",
        recoveryContext: {
          token: "ntn_secret_entry_recovery",
          password: "password=recovery-password",
        },
        warnings: ["secret warning secret_warning_value"],
        projectTokenEnv: "SNPM_NOTION_TOKEN",
        currentBodyMarkdown: "# current must not leak\n",
        nextBodyMarkdown: "# next must not leak\n",
        metadata: {
          commandFamily: "doc",
          bodyMarkdown: "# metadata body must not leak\n",
          token: "ntn_secret_metadata_value",
        },
      }],
    });

    const artifacts = writeManifestV2PreviewReviewArtifacts({
      result,
      reviewOutputDir: reviewDir,
    });

    const nonDiffText = artifacts.files
      .filter((filePath) => !filePath.endsWith(".diff"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    assert.equal(nonDiffText.includes("SNPM_NOTION_TOKEN"), false);
    assert.equal(nonDiffText.includes("current must not leak"), false);
    assert.equal(nonDiffText.includes("next must not leak"), false);
    assert.equal(nonDiffText.includes("metadata body must not leak"), false);
    assert.equal(nonDiffText.includes("ntn_secret"), false);
    assert.equal(nonDiffText.includes("hunter2"), false);
    assert.equal(nonDiffText.includes("abc.def.ghi"), false);
    assert.equal(nonDiffText.includes("SNPM_NOTION_TOKEN"), false);
    assert.equal(nonDiffText.includes("secret_mutation_budget_value"), false);
    assert.equal(nonDiffText.includes("summary-password"), false);
    assert.equal(nonDiffText.includes("recovery-password"), false);
    assert.equal(nonDiffText.includes("entry.secret.token"), false);
    assert.equal(readFileSync(artifacts.files.find((filePath) => filePath.endsWith(".diff")), "utf8"), secretDiff);
  } finally {
    rmSync(reviewDir, { recursive: true, force: true });
  }
});

test("writeManifestV2PreviewReviewArtifacts uses top-level manifest v2 selection metadata", () => {
  const reviewDir = tempReviewDir();

  try {
    const result = baseResult({
      selectedCount: 1,
      skippedCount: 2,
      skippedEntries: [
        {
          kind: "runbook",
          target: "Release Smoke Test",
          file: "runbooks/release.md",
          targetPath: null,
          metadataPath: "C:\\repo\\runbooks\\release.md.snpm-meta.json",
        },
        {
          kind: "project-doc",
          target: "Root > Overview",
          file: "docs/overview.md",
          targetPath: null,
          metadataPath: "C:\\repo\\docs\\overview.md.snpm-meta.json",
        },
      ],
      selection: {
        selectorLabels: ["planning-page:Planning > Roadmap"],
        selectors: [{
          kind: "planning-page",
          target: "Planning > Roadmap",
        }],
      },
      entries: [{
        kind: "planning-page",
        target: "Planning > Roadmap",
        file: "planning/roadmap.md",
        targetPath: "Projects > SNPM > Planning > Roadmap",
        status: "drift",
        selected: true,
        hasDiff: true,
        diff: "+selected roadmap\n",
        applied: false,
      }],
    });

    writeManifestV2PreviewReviewArtifacts({
      result,
      reviewOutputDir: reviewDir,
    });

    const summary = readJson(path.join(reviewDir, "summary.json"));
    assert.equal(summary.entryCount, 1);
    assert.equal(summary.selectedEntries, 1);
    assert.equal(summary.selectedCount, 1);
    assert.equal(summary.skippedEntryCount, 2);
    assert.equal(summary.skippedCount, 2);
    assert.equal(summary.skippedEntries, 2);
    assert.deepEqual(summary.skippedEntryDetails, result.skippedEntries);
    assert.deepEqual(summary.selection, result.selection);
    assert.deepEqual(summary.entries.map((entry) => ({
      target: entry.target,
      selected: entry.selected,
      skipped: entry.skipped,
      reviewFile: entry.reviewFile,
      diffFile: entry.diffFile,
    })), [{
      target: "Planning > Roadmap",
      selected: true,
      skipped: false,
      reviewFile: "001-planning-page-planning-roadmap.review.json",
      diffFile: "001-planning-page-planning-roadmap.diff",
    }]);

    const entryNames = readdirSync(path.join(reviewDir, "entries")).sort();
    assert.deepEqual(entryNames, [
      "001-planning-page-planning-roadmap.diff",
      "001-planning-page-planning-roadmap.review.json",
    ]);
  } finally {
    rmSync(reviewDir, { recursive: true, force: true });
  }
});

test("writeManifestV2PreviewReviewArtifacts preserves diagnostics, recovery, sidecar, and skipped selection metadata", () => {
  const reviewDir = tempReviewDir();

  try {
    const result = baseResult({
      diagnostics: [{
        code: "manifest-v2-push-sidecar-stale-after-apply",
        severity: "warning",
        safeNextCommand: "sync pull --apply",
        recoveryAction: "Refresh sidecars before the next push.",
      }],
      recovery: "Review diagnostics before applying.",
      recoveryContext: {
        command: "npm run sync-push -- --manifest snpm.sync.json",
        selectorCount: 1,
      },
      entries: [
        {
          kind: "planning-page",
          target: "Planning > Roadmap",
          file: "planning/roadmap.md",
          targetPath: "Projects > SNPM > Planning > Roadmap",
          status: "push-preview",
          selected: true,
          hasDiff: true,
          diff: "+local roadmap\n",
          applied: false,
          sidecarRefreshed: false,
          metadataPath: "C:\\repo\\planning\\roadmap.md.snpm-meta.json",
          metadata: {
            schema: "snpm.pull-metadata.v1",
            commandFamily: "page",
            lastEditedTime: "2026-04-23T20:00:00.000Z",
            pulledAt: "2026-04-23T20:01:00.000Z",
          },
          diagnostics: [{
            code: "manifest-v2-push-sidecar-stale-after-apply",
            severity: "warning",
            safeNextCommand: "sync pull --apply",
            recoveryAction: "Refresh sidecars before retrying.",
            entry: {
              kind: "planning-page",
              target: "Planning > Roadmap",
            },
          }],
          recovery: "Pull fresh sidecars before retrying.",
          recoveryContext: {
            command: "npm run sync-pull -- --manifest snpm.sync.json --apply",
            reason: "stale-sidecar",
          },
        },
        {
          kind: "runbook",
          target: "Release Smoke Test",
          file: "runbooks/release.md",
          targetPath: "Projects > SNPM > Runbooks > Release Smoke Test",
          status: "skipped",
          hasDiff: false,
          diff: "",
          applied: false,
          diagnostics: [{
            code: "manifest-v2-selection-skipped",
            severity: "info",
          }],
        },
      ],
    });

    writeManifestV2PreviewReviewArtifacts({
      result,
      reviewOutputDir: reviewDir,
    });

    const summary = readJson(path.join(reviewDir, "summary.json"));
    assert.equal(summary.selectedEntries, 1);
    assert.equal(summary.selectedCount, 1);
    assert.equal(summary.skippedEntryCount, 1);
    assert.equal(summary.skippedCount, 1);
    assert.equal(summary.skippedEntries, 1);
    assert.deepEqual(summary.skippedEntryDetails, [{
      index: 1,
      kind: "runbook",
      target: "Release Smoke Test",
      file: "runbooks/release.md",
      targetPath: "Projects > SNPM > Runbooks > Release Smoke Test",
      status: "skipped",
      commandFamily: "runbook",
      surface: "runbooks",
    }]);
    assert.deepEqual(summary.diagnostics, [{
      code: "manifest-v2-push-sidecar-stale-after-apply",
      severity: "warning",
      safeNextCommand: "sync pull --apply",
      recoveryAction: "Refresh sidecars before the next push.",
    }]);
    assert.equal(summary.recovery, "Review diagnostics before applying.");
    assert.deepEqual(summary.recoveryContext, {
      command: "npm run sync-push -- --manifest snpm.sync.json",
      selectorCount: 1,
    });
    assert.deepEqual(summary.entries.map((entry) => ({
      target: entry.target,
      selected: entry.selected,
      skipped: entry.skipped,
      diagnostics: entry.diagnostics,
      recovery: entry.recovery,
      recoveryContext: entry.recoveryContext,
    })), [
      {
        target: "Planning > Roadmap",
        selected: true,
        skipped: false,
        diagnostics: [{
          code: "manifest-v2-push-sidecar-stale-after-apply",
          severity: "warning",
          safeNextCommand: "sync pull --apply",
          recoveryAction: "Refresh sidecars before retrying.",
          entry: {
            kind: "planning-page",
            target: "Planning > Roadmap",
          },
        }],
        recovery: "Pull fresh sidecars before retrying.",
        recoveryContext: {
          command: "npm run sync-pull -- --manifest snpm.sync.json --apply",
          reason: "stale-sidecar",
        },
      },
      {
        target: "Release Smoke Test",
        selected: false,
        skipped: true,
        diagnostics: [{
          code: "manifest-v2-selection-skipped",
          severity: "info",
        }],
        recovery: undefined,
        recoveryContext: undefined,
      },
    ]);

    const selectedEntry = readJson(path.join(reviewDir, "entries", "001-planning-page-planning-roadmap.review.json"));
    assert.deepEqual(selectedEntry.sidecar, {
      metadataPath: "C:\\repo\\planning\\roadmap.md.snpm-meta.json",
      sidecarRefreshed: false,
      metadataPresent: true,
      schema: "snpm.pull-metadata.v1",
      lastEditedTime: "2026-04-23T20:00:00.000Z",
      pulledAt: "2026-04-23T20:01:00.000Z",
    });
    assert.deepEqual(selectedEntry.diagnostics, result.entries[0].diagnostics);

    const skippedEntry = readJson(path.join(reviewDir, "entries", "002-runbook-release-smoke-test.review.json"));
    assert.equal(skippedEntry.selected, false);
    assert.equal(skippedEntry.skipped, true);
    assert.deepEqual(skippedEntry.diagnostics, result.entries[1].diagnostics);
  } finally {
    rmSync(reviewDir, { recursive: true, force: true });
  }
});

test("writeManifestV2PreviewReviewArtifacts handles unsafe target names with safe filenames", () => {
  const reviewDir = tempReviewDir();

  try {
    const artifacts = writeManifestV2PreviewReviewArtifacts({
      result: baseResult({
        entries: [{
          kind: "workspace-doc",
          target: "..\\Unsafe / Target: Name? * <x>",
          file: "docs/workspace.md",
          targetPath: "Runbooks > Unsafe / Target",
          status: "pull-preview",
          hasDiff: true,
          diff: "+safe\n",
          applied: false,
        }],
      }),
      reviewOutputDir: reviewDir,
    });

    const entryNames = readdirSync(path.join(reviewDir, "entries")).sort();
    assert.deepEqual(entryNames, [
      "001-workspace-doc-unsafe-target-name-x.diff",
      "001-workspace-doc-unsafe-target-name-x.review.json",
    ]);
    for (const filePath of artifacts.files) {
      assert.equal(path.resolve(filePath).startsWith(path.resolve(reviewDir)), true);
    }
  } finally {
    rmSync(reviewDir, { recursive: true, force: true });
  }
});

test("writeManifestV2PreviewReviewArtifacts does not write without a review output directory", () => {
  const reviewDir = tempReviewDir();
  const sentinel = path.join(reviewDir, "sentinel.txt");
  writeFileSync(sentinel, "keep\n", "utf8");

  try {
    const result = writeManifestV2PreviewReviewArtifacts({
      result: baseResult(),
      reviewOutputDir: "",
    });

    assert.deepEqual(result, {
      written: false,
      reason: "review-output-dir-not-provided",
    });
    assert.equal(existsSync(sentinel), true);
    assert.equal(existsSync(path.join(reviewDir, "summary.json")), false);
    assert.equal(existsSync(path.join(reviewDir, "entries")), false);
  } finally {
    rmSync(reviewDir, { recursive: true, force: true });
  }
});

test("writeManifestV2PreviewReviewArtifacts rejects applied results when output is requested", () => {
  const reviewDir = tempReviewDir();

  try {
    assert.throws(() => writeManifestV2PreviewReviewArtifacts({
      result: baseResult({
        appliedCount: 1,
        entries: [{
          kind: "planning-page",
          target: "Planning > Roadmap",
          status: "pushed",
          applied: true,
        }],
      }),
      reviewOutputDir: reviewDir,
    }), /preview results/i);
  } finally {
    rmSync(reviewDir, { recursive: true, force: true });
  }
});
