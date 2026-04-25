import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  SECRET_REDACTION_MARKER,
  assertNoSecretRedactionMarkers,
  redactSecretDiff,
  redactSecretMarkdown,
  validateSecretPullOutputPolicy,
} from "../src/commands/secret-output-safety.mjs";

test("redactSecretMarkdown removes raw-value fenced content and sensitive assignments", () => {
  const markdown = [
    "## Secret Record",
    "- Secret Name: GEMINI_API_KEY",
    "- API Key: super-secret-value",
    "",
    "Environment Variable",
    "```plain text",
    "GEMINI_API_KEY",
    "```",
    "",
    "## Raw Value",
    "Raw Value",
    "```plain text",
    "sk-live-secret",
    "```",
    "",
    "## Rotation / Reset",
    "- Rotation / Reset: rotate in provider",
    "",
  ].join("\n");

  const redacted = redactSecretMarkdown(markdown);

  assert.match(redacted, /Secret Name: GEMINI_API_KEY/);
  assert.match(redacted, /GEMINI_API_KEY/);
  assert.doesNotMatch(redacted, /super-secret-value/);
  assert.doesNotMatch(redacted, /sk-live-secret/);
  assert.match(redacted, new RegExp(SECRET_REDACTION_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("redactSecretDiff redacts raw-value diff lines", () => {
  const diff = [
    "diff --git a/current.md b/next.md",
    "@@ -1,5 +1,5 @@",
    " ## Raw Value",
    " ```plain text",
    "-old-secret",
    "+new-secret",
    " ```",
    "",
  ].join("\n");

  const redacted = redactSecretDiff(diff);

  assert.doesNotMatch(redacted, /old-secret/);
  assert.doesNotMatch(redacted, /new-secret/);
  assert.match(redacted, /\[SNPM REDACTED SECRET OUTPUT\]/);
});

test("validateSecretPullOutputPolicy rejects redacted metadata sidecars", () => {
  assert.throws(
    () => validateSecretPullOutputPolicy({
      outputPath: "secret.md",
      metadataOutputPath: "secret.md.snpm-meta.json",
    }),
    /metadata-output requires --raw-secret-output/i,
  );
});

test("validateSecretPullOutputPolicy refuses raw repo output outside .snpm secrets without override", () => {
  const repoDir = path.join(tmpdir(), `snpm-secret-policy-${Date.now()}`);
  mkdirSync(path.join(repoDir, ".git"), { recursive: true });

  try {
    assert.throws(
      () => validateSecretPullOutputPolicy({
        outputPath: "secret.md",
        rawSecretOutput: true,
        cwd: repoDir,
      }),
      /Refusing raw secret output inside repo/i,
    );

    assert.equal(validateSecretPullOutputPolicy({
      outputPath: ".snpm/secrets/secret.md",
      rawSecretOutput: true,
      cwd: repoDir,
    }).raw, true);

    assert.equal(validateSecretPullOutputPolicy({
      outputPath: "secret.md",
      rawSecretOutput: true,
      allowRepoSecretOutput: true,
      cwd: repoDir,
    }).raw, true);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test("assertNoSecretRedactionMarkers rejects redacted markdown input", () => {
  assert.throws(
    () => assertNoSecretRedactionMarkers(`## Raw Value\n${SECRET_REDACTION_MARKER}\n`, { command: "secret-record push" }),
    /Refusing to use redacted secret output for secret-record push/i,
  );
});
