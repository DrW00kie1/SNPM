import test from "node:test";
import assert from "node:assert/strict";

import {
  NotionApiError,
  NotionParseError,
  NotionTransportError,
} from "../src/notion/errors.mjs";
import { makeNotionCliApiClient } from "../src/notion-cli/api-adapter.mjs";

function makeClientWithRunner(runner, options = {}) {
  return makeNotionCliApiClient("project-token", "2026-03-11", {
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

test("request executes ntn api reads with explicit token env and no keychain fallback env", async () => {
  const calls = [];
  const client = makeClientWithRunner(({ childArgs, env }) => {
    calls.push({ childArgs, env });
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({ object: "page", id: "page-id" }),
      stderr: "",
    };
  });

  const result = await client.request("GET", "pages/page-id");

  assert.deepEqual(result, { object: "page", id: "page-id" });
  assert.deepEqual(calls[0].childArgs, ["ntn", "api", "--method", "GET", "/v1/pages/page-id"]);
  assert.equal(calls[0].env.NOTION_API_TOKEN, "project-token");
  assert.equal(calls[0].env.NOTION_API_VERSION, "2026-03-11");
  assert.equal(calls[0].env.NOTION_KEYRING, "0");
  assert.equal(calls[0].env.USERPROFILE, undefined);
  assert.equal(calls[0].env.APPDATA, undefined);
  assert.equal(calls[0].env.LOCALAPPDATA, undefined);
  assert.equal(calls[0].env.SNPM_NOTION_TOKEN, undefined);
});

test("request supports read-style data source query and serializes body through --data", async () => {
  let seenArgs = null;
  const client = makeClientWithRunner(({ childArgs }) => {
    seenArgs = childArgs;
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({ results: [] }),
      stderr: "",
    };
  });

  const result = await client.request("POST", "data_sources/source-id/query", { page_size: 1 });

  assert.deepEqual(result, { results: [] });
  assert.deepEqual(seenArgs, [
    "ntn",
    "api",
    "--method",
    "POST",
    "/v1/data_sources/source-id/query",
    "--data",
    JSON.stringify({ page_size: 1 }),
  ]);
});

test("request rejects mutation-like calls before spawning ntn", async () => {
  let spawned = false;
  const client = makeClientWithRunner(() => {
    spawned = true;
    return { ok: true, status: 0, stdout: "{}", stderr: "" };
  });

  await assert.rejects(
    () => client.request("PATCH", "pages/page-id", { archived: true }),
    (error) => {
      assert.ok(error instanceof NotionTransportError);
      assert.equal(error.code, "notion_cli_read_only_violation");
      assert.equal(error.retryable, false);
      assert.equal(error.blockedBeforeSpawn, true);
      assert.equal(error.operationClass, "write");
      return true;
    },
  );
  assert.equal(spawned, false);
});

test("request converts ntn api JSON errors to safe NotionApiError", async () => {
  const client = makeClientWithRunner(() => ({
    ok: false,
    status: 1,
    stdout: JSON.stringify({
      object: "error",
      status: 404,
      code: "object_not_found",
      message: "raw page body and project-token",
    }),
    stderr: "stderr has project-token",
  }));

  await assert.rejects(
    () => client.request("GET", "pages/page-id"),
    (error) => {
      assert.ok(error instanceof NotionApiError);
      assert.equal(error.status, 404);
      assert.equal(error.code, "object_not_found");
      assert.doesNotMatch(error.message, /project-token|raw page body|stderr/);
      assert.equal(error.body, "");
      assert.equal(error.details, null);
      return true;
    },
  );
});

test("request converts non-json child failures to transport errors without stderr leakage", async () => {
  const client = makeClientWithRunner(() => ({
    ok: false,
    status: 1,
    stdout: "",
    stderr: "token=project-token",
    spawnError: null,
  }));

  await assert.rejects(
    () => client.request("GET", "pages/page-id"),
    (error) => {
      assert.ok(error instanceof NotionTransportError);
      assert.equal(error.code, "notion_cli_nonzero_exit");
      assert.doesNotMatch(error.message, /project-token/);
      return true;
    },
  );
});

test("request throws parse error for invalid success JSON without raw stdout leakage", async () => {
  const client = makeClientWithRunner(() => ({
    ok: true,
    status: 0,
    stdout: "{ token=project-token",
    stderr: "",
  }));

  await assert.rejects(
    () => client.request("GET", "pages/page-id"),
    (error) => {
      assert.ok(error instanceof NotionParseError);
      assert.equal(error.code, "notion_cli_invalid_json");
      assert.equal(error.responseTextLength, "{ token=project-token".length);
      assert.doesNotMatch(error.message, /project-token/);
      return true;
    },
  );
});

test("requestMaybe preserves HTTP-style errors as ok false", async () => {
  const client = makeClientWithRunner(() => ({
    ok: false,
    status: 1,
    stdout: JSON.stringify({
      object: "error",
      status: 503,
      code: "service_unavailable",
      retry_after: "2",
    }),
    stderr: "",
  }));

  const result = await client.requestMaybe("GET", "pages/flaky");

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.retryAfter, "2");
  assert.equal(result.retryAfterMs, 2000);
  assert.equal(result.retryable, true);
  assert.ok(result.error instanceof NotionApiError);
});

test("getChildren paginates via ntn api read requests", async () => {
  const seen = [];
  const client = makeClientWithRunner(({ childArgs }) => {
    seen.push(childArgs.at(-1));
    const second = childArgs.at(-1).includes("start_cursor=cursor-2");
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify(second
        ? { results: [{ id: "page-2" }], has_more: false, next_cursor: null }
        : { results: [{ id: "page-1" }], has_more: true, next_cursor: "cursor-2" }),
      stderr: "",
    };
  });

  const result = await client.getChildren("root");

  assert.deepEqual(result.map((item) => item.id), ["page-1", "page-2"]);
  assert.equal(seen.length, 2);
  assert.match(seen[0], /^\/v1\/blocks\/root\/children\?page_size=100$/);
  assert.match(seen[1], /start_cursor=cursor-2/);
});
