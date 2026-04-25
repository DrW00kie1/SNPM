import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildOperationalExplanation,
  buildOperationalPayload,
  inferDocSurface,
  writeReviewArtifacts,
} from "../src/commands/operational-output.mjs";
import { SECRET_REDACTION_MARKER } from "../src/commands/secret-output-safety.mjs";

test("inferDocSurface distinguishes project, template, and workspace docs", () => {
  assert.equal(inferDocSurface({ projectName: "SNPM", docPath: "Root > Overview" }), "project-docs");
  assert.equal(inferDocSurface({ docPath: "Templates > Project Templates > Overview" }), "template-docs");
  assert.equal(inferDocSurface({ docPath: "Runbooks > Notion Workspace Workflow" }), "workspace-docs");
});

test("buildOperationalExplanation includes stable fields and optional details", () => {
  const explanation = buildOperationalExplanation({
    surface: "planning",
    targetPath: "Projects > SNPM > Planning > Roadmap",
    authMode: "project-token",
    authScope: "project-or-workspace",
    managedState: "managed",
    preserveChildren: true,
    normalizationsApplied: ["lf-newlines", "single-final-newline"],
    warnings: [],
    includeDetails: true,
  });

  assert.equal(explanation.surface, "planning");
  assert.equal(explanation.targetPath, "Projects > SNPM > Planning > Roadmap");
  assert.equal(explanation.authMode, "project-token");
  assert.equal(explanation.managedState, "managed");
  assert.equal(explanation.preserveChildren, true);
  assert.deepEqual(explanation.normalizationsApplied, ["lf-newlines", "single-final-newline"]);
  assert.match(explanation.details.authSelection, /project token/i);
  assert.match(explanation.details.childPagePolicy, /without restructuring child pages/i);
});

test("writeReviewArtifacts writes markdown snapshots plus metadata", () => {
  const reviewDir = mkdtempSync(path.join(tmpdir(), "snpm-review-"));

  try {
    const explanation = buildOperationalExplanation({
      surface: "runbooks",
      targetPath: "Projects > SNPM > Runbooks > Release Smoke Test",
      authMode: "project-token",
      managedState: "managed",
      preserveChildren: true,
      normalizationsApplied: ["lf-newlines"],
      warnings: [],
    });

    const written = writeReviewArtifacts({
      reviewOutput: reviewDir,
      command: "runbook-diff",
      surface: "runbooks",
      result: {
        targetPath: "Projects > SNPM > Runbooks > Release Smoke Test",
        authMode: "project-token",
        currentBodyMarkdown: "old\n",
        nextBodyMarkdown: "new\n",
        diff: "diff --git a/current.md b/next.md\n",
        hasDiff: true,
        applied: false,
      },
      explanation,
      nowTimestampImpl: () => "04-06-2026 18:00:00",
    });

    assert.equal(written.files.length, 4);
    assert.equal(readFileSync(path.join(reviewDir, "current.md"), "utf8"), "old\n");
    assert.equal(readFileSync(path.join(reviewDir, "next.md"), "utf8"), "new\n");
    assert.match(readFileSync(path.join(reviewDir, "diff.patch"), "utf8"), /^diff --git/);
    const metadata = JSON.parse(readFileSync(path.join(reviewDir, "metadata.json"), "utf8"));
    assert.equal(metadata.command, "runbook-diff");
    assert.equal(metadata.surface, "runbooks");
    assert.equal(metadata.authMode, "project-token");
    assert.equal(metadata.managedState, "managed");
    assert.equal(metadata.timestamp, "04-06-2026 18:00:00");
  } finally {
    rmSync(reviewDir, { recursive: true, force: true });
  }
});

test("writeReviewArtifacts redacts secret-bearing access snapshots and diffs", () => {
  const reviewDir = mkdtempSync(path.join(tmpdir(), "snpm-secret-review-"));

  try {
    const explanation = buildOperationalExplanation({
      surface: "secret-record",
      targetPath: "Projects > SNPM > Access > App & Backend > GEMINI_API_KEY",
      authMode: "project-token",
      managedState: "managed",
      preserveChildren: true,
      normalizationsApplied: ["lf-newlines"],
      warnings: [],
    });

    writeReviewArtifacts({
      reviewOutput: reviewDir,
      command: "secret-record-diff",
      surface: "secret-record",
      result: {
        targetPath: "Projects > SNPM > Access > App & Backend > GEMINI_API_KEY",
        authMode: "project-token",
        currentBodyMarkdown: "## Raw Value\n```plain text\nold-secret\n```\n",
        nextBodyMarkdown: "## Raw Value\n```plain text\nnew-secret\n```\n",
        diff: "diff --git a/current.md b/next.md\n@@\n-old-secret\n+new-secret\n",
        hasDiff: true,
        applied: false,
      },
      explanation,
      nowTimestampImpl: () => "04-25-2026 12:00:00",
    });

    assert.doesNotMatch(readFileSync(path.join(reviewDir, "current.md"), "utf8"), /old-secret/);
    assert.doesNotMatch(readFileSync(path.join(reviewDir, "next.md"), "utf8"), /new-secret/);
    assert.doesNotMatch(readFileSync(path.join(reviewDir, "diff.patch"), "utf8"), /old-secret|new-secret/);
    assert.match(readFileSync(path.join(reviewDir, "current.md"), "utf8"), new RegExp(SECRET_REDACTION_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const metadata = JSON.parse(readFileSync(path.join(reviewDir, "metadata.json"), "utf8"));
    assert.equal(metadata.redaction.applied, true);
    assert.equal(metadata.redaction.marker, SECRET_REDACTION_MARKER);
  } finally {
    rmSync(reviewDir, { recursive: true, force: true });
  }
});

test("buildOperationalPayload includes explanation and review artifacts", () => {
  const payload = buildOperationalPayload({
    command: "page-diff",
    surface: "planning",
    result: {
      targetPath: "Projects > SNPM > Planning > Roadmap",
      authMode: "workspace-token",
      authScope: "project-or-workspace",
      managedState: "managed",
      preserveChildren: true,
      normalizationsApplied: ["lf-newlines"],
      warnings: [],
      pageId: "roadmap",
      hasDiff: false,
    },
    explain: false,
    reviewArtifacts: { directory: "review", files: ["current.md"] },
  });

  assert.equal(payload.command, "page-diff");
  assert.equal(payload.explanation.surface, "planning");
  assert.equal(payload.reviewOutput.directory, "review");
});
