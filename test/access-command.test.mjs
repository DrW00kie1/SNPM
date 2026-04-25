import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  runAccessTokenCreate,
  runAccessTokenDiff,
  runAccessTokenEdit,
  runAccessTokenPull,
  runAccessTokenPush,
  runSecretRecordCreate,
  runSecretRecordDiff,
  runSecretRecordEdit,
  runSecretRecordPull,
  runSecretRecordPush,
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

test("secret-record pull writes redacted output only and no metadata sidecar", async () => {
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

test("secret-bearing pull rejects metadata sidecars and deprecated raw output flags before pulling", async () => {
  let pulled = false;
  const pullImpl = async () => {
    pulled = true;
    return PULL_RESULT;
  };

  await assert.rejects(
    () => runAccessTokenPull({
      domainTitle: "App & Backend",
      outputPath: "token.md",
      metadataOutputPath: "token.md.snpm-meta.json",
      projectName: "SNPM",
      title: "Project Token",
      workspaceConfig: {},
      pullAccessTokenBodyImpl: pullImpl,
    }),
    /metadata-output is unsupported/i,
  );
  assert.equal(pulled, false);

  await assert.rejects(
    () => runSecretRecordPull({
      domainTitle: "App & Backend",
      outputPath: "-",
      projectName: "SNPM",
      rawSecretOutput: true,
      allowRepoSecretOutput: true,
      title: "GEMINI_API_KEY",
      workspaceConfig: {},
      pullSecretRecordBodyImpl: pullImpl,
    }),
    /raw secret export is unsupported/i,
  );
  assert.equal(pulled, false);
});

test("secret-record and access-token diff push edit are disabled before local file or Notion work", async () => {
  const disabledCases = [
    ["secret-record diff", () => runSecretRecordDiff({ filePath: "missing.md" })],
    ["secret-record push", () => runSecretRecordPush({ apply: true, filePath: "missing.md" })],
    ["secret-record edit", () => runSecretRecordEdit({
      openEditorImpl: () => {
        throw new Error("editor should not open");
      },
    })],
    ["access-token diff", () => runAccessTokenDiff({ filePath: "missing.md" })],
    ["access-token push", () => runAccessTokenPush({ apply: true, filePath: "missing.md" })],
    ["access-token edit", () => runAccessTokenEdit({
      openEditorImpl: () => {
        throw new Error("editor should not open");
      },
    })],
  ];

  for (const [command, run] of disabledCases) {
    await assert.rejects(
      run,
      new RegExp(`${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} is disabled\\..*Local Markdown edit/diff/push is disabled`, "i"),
    );
  }
});

test("secret-bearing create rejects non-placeholder local Raw Value input", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "snpm-raw-secret-create-"));
  const secretPath = path.join(tempDir, "secret.md");
  const tokenPath = path.join(tempDir, "token.md");

  try {
    writeFileSync(secretPath, "## Raw Value\n```plain text\nsk-live-secret\n```\n", "utf8");
    writeFileSync(tokenPath, "## Raw Value\n```plain text\nntn_live_secret\n```\n", "utf8");

    await assert.rejects(
      () => runSecretRecordCreate({
        domainTitle: "App & Backend",
        filePath: secretPath,
        projectName: "SNPM",
        title: "GEMINI_API_KEY",
      }),
      (error) => /Refusing local raw secret value for secret-record create/i.test(error.message)
        && !error.message.includes("sk-live-secret"),
    );

    await assert.rejects(
      () => runAccessTokenCreate({
        domainTitle: "App & Backend",
        filePath: tokenPath,
        projectName: "SNPM",
        title: "Project Token",
      }),
      (error) => /Refusing local raw secret value for access-token create/i.test(error.message)
        && !error.message.includes("ntn_live_secret"),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
