import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  runAccessTokenPull,
  runSecretRecordDiff,
  runSecretRecordPull,
} from "../src/commands/access.mjs";
import { SECRET_REDACTION_MARKER } from "../src/commands/secret-output-safety.mjs";

const BODY_WITH_SECRET = [
  "## Secret Record",
  "- Secret Name: GEMINI_API_KEY",
  "",
  "## Raw Value",
  "Raw Value",
  "```plain text",
  "sk-live-secret",
  "```",
  "",
].join("\n");

const PULL_RESULT = {
  pageId: "secret-page",
  projectId: "project-page",
  targetPath: "Projects > SNPM > Access > App & Backend > GEMINI_API_KEY",
  authMode: "project-token",
  bodyMarkdown: BODY_WITH_SECRET,
  metadata: {
    schema: "snpm.pull-metadata.v1",
    commandFamily: "secret-record",
    workspaceName: "infrastructure-hq",
    targetPath: "Projects > SNPM > Access > App & Backend > GEMINI_API_KEY",
    pageId: "secret-page",
    projectId: "project-page",
    authMode: "project-token",
    lastEditedTime: "2026-04-25T12:00:00.000Z",
    pulledAt: "2026-04-25T12:01:00.000Z",
  },
};

test("secret-record pull writes redacted output by default and no metadata sidecar", async () => {
  const writes = [];
  const metadataWrites = [];

  const result = await runSecretRecordPull({
    domainTitle: "App & Backend",
    outputPath: "secret.md",
    projectName: "SNPM",
    title: "GEMINI_API_KEY",
    workspaceConfig: {},
    pullSecretRecordBodyImpl: async () => PULL_RESULT,
    writeCommandOutputImpl: (outputPath, bodyText) => {
      writes.push({ outputPath, bodyText });
      return { outputPath, wroteToStdout: false };
    },
    writeCommandMetadataSidecarImpl: (...args) => {
      metadataWrites.push(args);
      return { metadataPath: "unexpected" };
    },
  });

  assert.equal(result.redacted, true);
  assert.equal(result.rawSecretOutput, false);
  assert.equal(result.metadataPath, null);
  assert.equal(writes.length, 1);
  assert.match(writes[0].bodyText, new RegExp(SECRET_REDACTION_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(writes[0].bodyText, /sk-live-secret/);
  assert.equal(metadataWrites.length, 0);
});

test("secret-record raw stdout pull can write explicit metadata sidecar", async () => {
  const writes = [];
  const metadataWrites = [];

  const result = await runSecretRecordPull({
    domainTitle: "App & Backend",
    outputPath: "-",
    metadataOutputPath: "secret.md.snpm-meta.json",
    projectName: "SNPM",
    rawSecretOutput: true,
    title: "GEMINI_API_KEY",
    workspaceConfig: {},
    pullSecretRecordBodyImpl: async () => PULL_RESULT,
    writeCommandOutputImpl: (outputPath, bodyText) => {
      writes.push({ outputPath, bodyText });
      return { outputPath, wroteToStdout: true };
    },
    writeCommandMetadataSidecarImpl: (outputPath, metadata, options) => {
      metadataWrites.push({ outputPath, metadata, options });
      return { metadataPath: options.metadataPath };
    },
  });

  assert.equal(result.redacted, false);
  assert.equal(result.rawSecretOutput, true);
  assert.equal(result.metadataPath, "secret.md.snpm-meta.json");
  assert.match(writes[0].bodyText, /sk-live-secret/);
  assert.equal(metadataWrites.length, 1);
  assert.deepEqual(metadataWrites[0].metadata, PULL_RESULT.metadata);
});

test("access-token redacted pull rejects metadata sidecar request", async () => {
  await assert.rejects(
    () => runAccessTokenPull({
      domainTitle: "App & Backend",
      outputPath: "token.md",
      metadataOutputPath: "token.md.snpm-meta.json",
      projectName: "SNPM",
      title: "Project Token",
      workspaceConfig: {},
      pullAccessTokenBodyImpl: async () => PULL_RESULT,
    }),
    /metadata-output requires --raw-secret-output/i,
  );
});

test("secret-record diff rejects redacted-marker input before Notion work", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "snpm-redacted-input-"));
  const filePath = path.join(tempDir, "secret.md");

  try {
    writeFileSync(filePath, `## Raw Value\n${SECRET_REDACTION_MARKER}\n`, "utf8");

    await assert.rejects(
      () => runSecretRecordDiff({
        domainTitle: "App & Backend",
        filePath,
        projectName: "SNPM",
        title: "GEMINI_API_KEY",
      }),
      /Refusing to use redacted secret output for secret-record diff/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
