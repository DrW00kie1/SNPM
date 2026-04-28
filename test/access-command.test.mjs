import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  runAccessTokenCreate,
  runAccessTokenDiff,
  runAccessTokenEdit,
  runAccessTokenExec,
  runAccessTokenGenerate,
  runAccessTokenPull,
  runAccessTokenPush,
  runSecretRecordCreate,
  runSecretRecordDiff,
  runSecretRecordEdit,
  runSecretRecordExec,
  runSecretRecordGenerate,
  runSecretRecordPull,
  runSecretRecordPush,
} from "../src/commands/access.mjs";
import { createGeneratedSecretMaterial } from "../src/commands/secret-generate.mjs";
import {
  SECRET_REDACTION_MARKER,
  createExactSecretRedactor,
} from "../src/commands/secret-output-safety.mjs";

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

test("secret-record and access-token generate wrappers preflight before generator and keep generated value out of results", async () => {
  const calls = [];
  const secretResult = await runSecretRecordGenerate({
    apply: true,
    childArgs: ["node", "scripts/generate-dsn.mjs"],
    createGeneratedSecretRecordImpl: async (args) => {
      calls.push(["secret", args]);
      return {
        applied: args.apply === true,
        authMode: "project-token",
        generatedSecretStored: args.apply === true,
        mode: "create",
        pageId: args.apply ? "secret-page" : null,
        projectId: "project-page",
        targetPath: "Projects > SNPM > Access > App & Backend > DATABASE_URL",
      };
    },
    cwd: process.cwd(),
    domainTitle: "App & Backend",
    mode: "create",
    projectName: "SNPM",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    runGeneratedSecretCommandImpl: () => ({
      ok: true,
      secretMaterial: createGeneratedSecretMaterial("postgres://sentinel-secret"),
      redactor: createExactSecretRedactor("postgres://sentinel-secret"),
    }),
    title: "DATABASE_URL",
    workspaceConfig: { workspace: "fake" },
    workspaceName: "infrastructure-hq",
  });
  let generatorRan = false;
  const tokenResult = await runAccessTokenGenerate({
    apply: false,
    childArgs: ["node", "scripts/generate-token.mjs"],
    domainTitle: "App & Backend",
    runGeneratedSecretCommandImpl: () => {
      generatorRan = true;
      throw new Error("generator should not run in preview");
    },
    updateGeneratedAccessTokenImpl: async (args) => {
      calls.push(["token", args]);
      return {
        applied: false,
        authMode: "project-token",
        targetPath: "Projects > SNPM > Access > App & Backend > Project Token",
      };
    },
    mode: "update",
    projectName: "SNPM",
    title: "Project Token",
    workspaceConfig: { workspace: "fake" },
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[0][0], "secret");
  assert.equal(calls[0][1].apply, false);
  assert.equal(calls[0][1].generatedRawValue, undefined);
  assert.equal(calls[1][0], "secret");
  assert.equal(calls[1][1].apply, true);
  assert.equal(calls[1][1].generatedRawValue, "postgres://sentinel-secret");
  assert.equal(calls[1][1].config.workspace, "fake");
  assert.equal(calls[1][1].projectTokenEnv, "SNPM_NOTION_TOKEN");
  assert.equal(secretResult.generatedSecretStored, true);
  assert.doesNotMatch(JSON.stringify(secretResult), /sentinel-secret/);
  assert.equal(calls[2][0], "token");
  assert.equal(calls[2][1].apply, false);
  assert.equal(calls[2][1].generatedRawValue, undefined);
  assert.equal(generatorRan, false);
  assert.equal(tokenResult.generatorWillRun, false);
});

test("secret-record generate wrapper does not serialize generator failure payloads", async () => {
  const childStdout = "child-stdout-generated-secret";
  const childStderr = "child-stderr-token";
  const envValue = "PROJECT_TOKEN_ENV_VALUE";
  const rawNotionBody = "## Raw Value\nnotion-body-secret";
  const stackValue = "Error: stack sentinel\n    at secretGenerator";

  await assert.rejects(
    () => runSecretRecordGenerate({
      apply: true,
      childArgs: ["node", "scripts/generate-dsn.mjs"],
      createGeneratedSecretRecordImpl: async () => ({
        applied: false,
        authMode: "project-token",
        bodyMarkdown: rawNotionBody,
        targetPath: "Projects > SNPM > Access > App & Backend > DATABASE_URL",
      }),
      cwd: process.cwd(),
      domainTitle: "App & Backend",
      mode: "create",
      projectName: "SNPM",
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      runGeneratedSecretCommandImpl: () => ({
        ok: false,
        failure: "Generator command failed to start.",
        stdout: "",
        stderr: "",
        outputSuppressed: true,
        diagnostics: {
          stdout: childStdout,
          stderr: childStderr,
          envValue,
          stack: stackValue,
        },
      }),
      title: "DATABASE_URL",
      workspaceConfig: { workspace: "fake" },
    }),
    (error) => {
      const serialized = JSON.stringify({
        message: error.message,
        name: error.name,
      });
      assert.match(serialized, /Generator command failed to start/);
      for (const value of [
        childStdout,
        childStderr,
        envValue,
        rawNotionBody,
        stackValue,
        "secretGenerator",
        "SNPM_NOTION_TOKEN",
      ]) {
        assert.equal(serialized.includes(value), false);
      }
      return true;
    },
  );
});

test("secret-bearing exec wrappers reject invalid cwd before config load, pull, or spawn", async () => {
  const calls = [];

  await assert.rejects(
    () => runSecretRecordExec({
      childArgs: ["child-bin"],
      cwd: path.join(process.cwd(), ".missing-secret-record-exec-cwd"),
      domainTitle: "App & Backend",
      env: {},
      envName: "SECRET_VALUE",
      loadWorkspaceConfigImpl: () => {
        calls.push("load-config");
        return {};
      },
      projectName: "SNPM",
      pullSecretRecordBodyImpl: async () => {
        calls.push("pull-secret");
        return PULL_RESULT;
      },
      spawnSyncImpl: () => {
        calls.push("spawn");
        return { status: 0, stdout: "", stderr: "" };
      },
      title: "GEMINI_API_KEY",
    }),
    /--cwd must point to an existing directory/i,
  );

  await assert.rejects(
    () => runAccessTokenExec({
      childArgs: ["child-bin"],
      cwd: path.join(process.cwd(), ".missing-access-token-exec-cwd"),
      domainTitle: "App & Backend",
      env: {},
      envName: "TOKEN_VALUE",
      loadWorkspaceConfigImpl: () => {
        calls.push("load-config");
        return {};
      },
      projectName: "SNPM",
      pullAccessTokenBodyImpl: async () => {
        calls.push("pull-token");
        return PULL_RESULT;
      },
      spawnSyncImpl: () => {
        calls.push("spawn");
        return { status: 0, stdout: "", stderr: "" };
      },
      title: "Project Token",
    }),
    /--cwd must point to an existing directory/i,
  );

  assert.deepEqual(calls, []);
});

test("secret-bearing generate wrappers reject invalid cwd before preview mutation or generator spawn", async () => {
  const calls = [];

  await assert.rejects(
    () => runSecretRecordGenerate({
      apply: true,
      childArgs: ["node", "scripts/generate-dsn.mjs"],
      createGeneratedSecretRecordImpl: async () => {
        calls.push("preview-or-create");
        return {};
      },
      cwd: path.join(process.cwd(), ".missing-secret-record-generate-cwd"),
      domainTitle: "App & Backend",
      mode: "create",
      projectName: "SNPM",
      runGeneratedSecretCommandImpl: () => {
        calls.push("generator");
        return { ok: true };
      },
      title: "DATABASE_URL",
    }),
    /--cwd must point to an existing directory/i,
  );

  await assert.rejects(
    () => runAccessTokenGenerate({
      apply: false,
      childArgs: ["node", "scripts/generate-token.mjs"],
      cwd: path.join(process.cwd(), ".missing-access-token-generate-cwd"),
      domainTitle: "App & Backend",
      mode: "update",
      projectName: "SNPM",
      runGeneratedSecretCommandImpl: () => {
        calls.push("generator");
        return { ok: true };
      },
      title: "Project Token",
      updateGeneratedAccessTokenImpl: async () => {
        calls.push("preview-or-update");
        return {};
      },
    }),
    /--cwd must point to an existing directory/i,
  );

  assert.deepEqual(calls, []);
});

test("secret-record generate wrapper rejects invalid mode and missing child generator", async () => {
  await assert.rejects(
    () => runSecretRecordGenerate({
      childArgs: ["node", "scripts/generate-dsn.mjs"],
      domainTitle: "App & Backend",
      createGeneratedSecretRecordImpl: async () => {
        throw new Error("helper should not run");
      },
      mode: "upsert",
      projectName: "SNPM",
      title: "DATABASE_URL",
      workspaceConfig: {},
    }),
    /secret-record generate requires --mode create or --mode update/i,
  );

  await assert.rejects(
    () => runAccessTokenGenerate({
      childArgs: [],
      domainTitle: "App & Backend",
      createGeneratedAccessTokenImpl: async () => {
        throw new Error("helper should not run");
      },
      mode: "create",
      projectName: "SNPM",
      title: "Project Token",
      workspaceConfig: {},
    }),
    /Provide a generator command after -- for access-token generate/i,
  );
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
