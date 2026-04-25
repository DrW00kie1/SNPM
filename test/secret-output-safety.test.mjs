import test from "node:test";
import assert from "node:assert/strict";

import {
  RAW_SECRET_EXPORT_UNSUPPORTED_MESSAGE,
  SECRET_REDACTION_MARKER,
  assertNoLocalRawSecretValue,
  assertNoSecretRedactionMarkers,
  extractRawSecretValueFromMarkdown,
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
    /metadata-output is unsupported/i,
  );
});

test("validateSecretPullOutputPolicy rejects deprecated raw export flags", () => {
  assert.throws(
    () => validateSecretPullOutputPolicy({ rawSecretOutput: true }),
    new RegExp(RAW_SECRET_EXPORT_UNSUPPORTED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );

  assert.throws(
    () => validateSecretPullOutputPolicy({ allowRepoSecretOutput: true }),
    new RegExp(RAW_SECRET_EXPORT_UNSUPPORTED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("assertNoSecretRedactionMarkers rejects redacted markdown input", () => {
  assert.throws(
    () => assertNoSecretRedactionMarkers(`## Raw Value\n${SECRET_REDACTION_MARKER}\n`, { command: "secret-record push" }),
    /Refusing to use redacted secret output for secret-record push/i,
  );
});

test("assertNoLocalRawSecretValue allows omitted and placeholder Raw Value sections", () => {
  assert.doesNotThrow(() => assertNoLocalRawSecretValue("## Secret Record\n- Secret Name: GEMINI_API_KEY\n", {
    command: "secret-record create",
  }));

  assert.doesNotThrow(() => assertNoLocalRawSecretValue([
    "## Raw Value",
    "Raw Value",
    "```plain text",
    "<paste secret here>",
    "```",
    "",
  ].join("\n"), {
    command: "secret-record create",
  }));
});

test("assertNoLocalRawSecretValue rejects non-placeholder Raw Value without echoing it", () => {
  const rawSecret = "sk-live-secret";

  assert.throws(
    () => assertNoLocalRawSecretValue([
      "## Raw Value",
      "```plain text",
      rawSecret,
      "```",
      "",
    ].join("\n"), {
      command: "secret-record create",
    }),
    (error) => /Refusing local raw secret value for secret-record create/i.test(error.message)
      && !error.message.includes(rawSecret),
  );
});

test("extractRawSecretValueFromMarkdown returns exact fenced value content", () => {
  const markdown = [
    "Purpose: test",
    "---",
    "",
    "## Raw Value",
    "Raw Value",
    "```plain text",
    "line-one",
    "line-two",
    "",
    "```",
    "",
    "## Rotation / Reset",
    "- rotate",
  ].join("\n");

  assert.equal(
    extractRawSecretValueFromMarkdown(markdown, { command: "secret-record exec" }),
    "line-one\nline-two\n",
  );
});

test("extractRawSecretValueFromMarkdown rejects missing or ambiguous fenced Raw Value blocks", () => {
  assert.throws(
    () => extractRawSecretValueFromMarkdown("## Purpose\nnone\n", { command: "secret-record exec" }),
    /requires exactly one ## Raw Value section/i,
  );

  assert.throws(
    () => extractRawSecretValueFromMarkdown("## Raw Value\n```text\none\n```\n## Raw Value\n```text\ntwo\n```\n"),
    /requires exactly one ## Raw Value section/i,
  );

  assert.throws(
    () => extractRawSecretValueFromMarkdown("## Raw Value\n```text\none\n```\n```text\ntwo\n```\n"),
    /requires exactly one fenced value/i,
  );

  assert.throws(
    () => extractRawSecretValueFromMarkdown("## Raw Value\nRaw Value\nplaintext-secret\n```text\none\n```\n"),
    /no additional plaintext value/i,
  );
});

test("extractRawSecretValueFromMarkdown rejects empty placeholder and redacted values", () => {
  assert.throws(
    () => extractRawSecretValueFromMarkdown("## Raw Value\n```text\n\n```\n"),
    /empty Raw Value/i,
  );

  assert.throws(
    () => extractRawSecretValueFromMarkdown("## Raw Value\n```text\n<paste secret here>\n```\n"),
    /placeholder Raw Value/i,
  );

  assert.throws(
    () => extractRawSecretValueFromMarkdown(`## Raw Value\n\`\`\`text\n${SECRET_REDACTION_MARKER}\n\`\`\`\n`),
    /redacted Raw Value/i,
  );

  assert.throws(
    () => extractRawSecretValueFromMarkdown("## Raw Value\n```text\n[redacted]\n```\n"),
    /redacted Raw Value/i,
  );
});
