import test from "node:test";
import assert from "node:assert/strict";

import {
  NotionApiError,
  NotionParseError,
  NotionTransportError,
} from "../../src/notion/errors.mjs";
import { makeNotionCliPageMarkdownClient } from "../../src/notion-cli/page-markdown-adapter.mjs";

function makeClientWithRunner(runner, options = {}) {
  return makeNotionCliPageMarkdownClient("project-token", "2026-03-11", {
    runChildCommandImpl: runner,
    env: {
      PATH: "C:\\bin",
      USERPROFILE: "C:\\Users\\Agent",
      APPDATA: "C:\\Users\\Agent\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\Agent\\AppData\\Local",
      NOTION_API_TOKEN: "wrong-token",
      NOTION_KEYRING: "1",
      SNPM_NOTION_TOKEN: "secret-env-value",
    },
    platform: "linux",
    ...options,
  });
}

test("getPageMarkdown runs only ntn pages get with explicit token env and keychain disabled", async () => {
  const calls = [];
  const client = makeClientWithRunner(({ childArgs, env }) => {
    calls.push({ childArgs, env });
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({
        markdown: "# Roadmap\n",
        truncated: false,
        unknown_block_ids: [],
      }),
      stderr: "",
    };
  });

  const result = await client.getPageMarkdown("page-id");

  assert.deepEqual(result, {
    markdown: "# Roadmap\n",
    truncated: false,
    unknownBlockCount: 0,
  });
  assert.deepEqual(calls[0].childArgs, [
    "ntn",
    "pages",
    "get",
    "page-id",
    "--json",
    "--notion-version",
    "2026-03-11",
  ]);
  assert.equal(calls[0].env.NOTION_API_TOKEN, "project-token");
  assert.equal(calls[0].env.NOTION_API_VERSION, "2026-03-11");
  assert.equal(calls[0].env.NOTION_KEYRING, "0");
  assert.equal(calls[0].env.USERPROFILE, undefined);
  assert.equal(calls[0].env.APPDATA, undefined);
  assert.equal(calls[0].env.LOCALAPPDATA, undefined);
  assert.equal(calls[0].env.SNPM_NOTION_TOKEN, undefined);
  assert.equal(calls[0].childArgs.includes("edit"), false);
  assert.equal(calls[0].childArgs.includes("create"), false);
  assert.equal(calls[0].childArgs.includes("trash"), false);
  assert.equal(calls[0].childArgs.includes("login"), false);
  assert.equal(calls[0].childArgs.includes("--verbose"), false);
  assert.equal(calls[0].childArgs.includes("--unsafe-verbose"), false);
});

test("getPageMarkdown reports truncated and unknown-block metadata without exposing block ids", async () => {
  const client = makeClientWithRunner(() => ({
    ok: true,
    status: 0,
    stdout: JSON.stringify({
      markdown: "# Roadmap\n",
      truncated: true,
      unknown_block_ids: ["block-secret-1", "block-secret-2"],
    }),
    stderr: "",
  }));

  const result = await client.getPageMarkdown("page-id");

  assert.equal(result.truncated, true);
  assert.equal(result.unknownBlockCount, 2);
  assert.doesNotMatch(JSON.stringify(result), /block-secret/);
});

test("getPageMarkdown converts ntn JSON API errors to safe NotionApiError", async () => {
  const client = makeClientWithRunner(() => ({
    ok: false,
    status: 1,
    stdout: JSON.stringify({
      object: "error",
      status: 404,
      code: "object_not_found",
      message: "raw markdown and project-token",
    }),
    stderr: "stderr has project-token",
  }));

  await assert.rejects(
    () => client.getPageMarkdown("page-id"),
    (error) => {
      assert.ok(error instanceof NotionApiError);
      assert.equal(error.status, 404);
      assert.equal(error.code, "object_not_found");
      assert.doesNotMatch(error.message, /project-token|raw markdown|stderr/);
      assert.equal(error.body, "");
      assert.equal(error.details, null);
      return true;
    },
  );
});

test("getPageMarkdown converts missing ntn or non-json child failure to safe transport errors", async () => {
  const client = makeClientWithRunner(() => ({
    ok: false,
    status: 1,
    stdout: "",
    stderr: "token=project-token",
    spawnError: new Error("spawn ntn ENOENT"),
  }));

  await assert.rejects(
    () => client.getPageMarkdown("page-id"),
    (error) => {
      assert.ok(error instanceof NotionTransportError);
      assert.equal(error.code, "notion_cli_pages_spawn_error");
      assert.doesNotMatch(error.message, /project-token/);
      return true;
    },
  );
});

test("getPageMarkdown rejects malformed or unsupported JSON without raw child-output leakage", async () => {
  const invalidJsonClient = makeClientWithRunner(() => ({
    ok: true,
    status: 0,
    stdout: "{ token=project-token",
    stderr: "",
  }));

  await assert.rejects(
    () => invalidJsonClient.getPageMarkdown("page-id"),
    (error) => {
      assert.ok(error instanceof NotionParseError);
      assert.equal(error.code, "notion_cli_pages_invalid_json");
      assert.doesNotMatch(error.message, /project-token/);
      return true;
    },
  );

  const missingMarkdownClient = makeClientWithRunner(() => ({
    ok: true,
    status: 0,
    stdout: JSON.stringify({ page: { title: "Roadmap" } }),
    stderr: "raw stderr",
  }));

  await assert.rejects(
    () => missingMarkdownClient.getPageMarkdown("page-id"),
    (error) => {
      assert.ok(error instanceof NotionParseError);
      assert.equal(error.code, "notion_cli_pages_missing_markdown");
      assert.doesNotMatch(error.message, /raw stderr/);
      return true;
    },
  );
});
