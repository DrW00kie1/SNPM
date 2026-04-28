import test from "node:test";
import assert from "node:assert/strict";

import {
  NotionApiError,
  NotionParseError,
  NotionTransportError,
} from "../src/notion/errors.mjs";
import { makeNotionClient } from "../src/notion/client.mjs";

test("request throws a normalized NotionApiError", async () => {
  const client = makeNotionClient("token", "2026-03-11", {
    fetchImpl: async () => new Response(JSON.stringify({
      object: "error",
      status: 404,
      code: "object_not_found",
      message: "Missing page.",
    }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }),
  });

  await assert.rejects(
    () => client.request("GET", "pages/missing"),
    (error) => {
      assert.ok(error instanceof NotionApiError);
      assert.equal(error.status, 404);
      assert.equal(error.code, "object_not_found");
      assert.match(error.message, /pages\/missing/);
      assert.doesNotMatch(error.message, /Missing page/);
      assert.doesNotMatch(JSON.stringify(error), /Missing page/);
      assert.equal(error.body.includes("Missing page"), true);
      return true;
    },
  );
});

test("requestMaybe preserves normalized error details", async () => {
  const client = makeNotionClient("token", "2026-03-11", {
    fetchImpl: async () => new Response("plain failure", { status: 500 }),
  });

  const response = await client.requestMaybe("GET", "pages/fail");
  assert.equal(response.ok, false);
  assert.equal(response.status, 500);
  assert.equal(response.error.body, "plain failure");
  assert.doesNotMatch(response.error.message, /plain failure/);
  assert.doesNotMatch(JSON.stringify(response.error), /plain failure/);
});

test("request sends shared Notion headers and JSON body", async () => {
  const seen = [];
  const client = makeNotionClient("token", "2026-03-11", {
    fetchImpl: async (url, options) => {
      seen.push({ url, options });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    timeoutMs: 0,
  });

  const response = await client.request("POST", "pages", { title: "Example" });

  assert.deepEqual(response, { ok: true });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://api.notion.com/v1/pages");
  assert.equal(seen[0].options.method, "POST");
  assert.equal(seen[0].options.headers.Authorization, "Bearer token");
  assert.equal(seen[0].options.headers["Notion-Version"], "2026-03-11");
  assert.equal(seen[0].options.headers["Content-Type"], "application/json");
  assert.equal(seen[0].options.body, JSON.stringify({ title: "Example" }));
  assert.equal(seen[0].options.signal, undefined);
});

test("request parses retry metadata without retrying", async () => {
  let calls = 0;
  const client = makeNotionClient("token", "2026-03-11", {
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        object: "error",
        status: 429,
        code: "rate_limited",
        message: "Slow down.",
      }), {
        status: 429,
        headers: { "Retry-After": "2" },
      });
    },
  });

  await assert.rejects(
    () => client.request("POST", "pages", { title: "Example" }),
    (error) => {
      assert.ok(error instanceof NotionApiError);
      assert.equal(error.retryAfter, "2");
      assert.equal(error.retryAfterMs, 2000);
      assert.equal(error.retryable, true);
      assert.equal(error.attempts, 1);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("request does not retry mutation-like PATCH failures", async () => {
  let calls = 0;
  const client = makeNotionClient("token", "2026-03-11", {
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        object: "error",
        status: 503,
        code: "service_unavailable",
        message: "Try later.",
      }), {
        status: 503,
        headers: { "Retry-After": "1" },
      });
    },
  });

  await assert.rejects(
    () => client.request("PATCH", "pages/page-id/markdown", { replace_content: { new_str: "body" } }),
    (error) => {
      assert.ok(error instanceof NotionApiError);
      assert.equal(error.retryable, true);
      assert.equal(error.attempts, 1);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("requestMaybe preserves HTTP failures as ok false with retry metadata", async () => {
  const client = makeNotionClient("token", "2026-03-11", {
    fetchImpl: async () => new Response(JSON.stringify({
      object: "error",
      status: 503,
      code: "service_unavailable",
      message: "Unavailable.",
    }), {
      status: 503,
      headers: { "Retry-After": "4" },
    }),
  });

  const response = await client.requestMaybe("GET", "pages/flaky");
  assert.equal(response.ok, false);
  assert.equal(response.status, 503);
  assert.equal(response.retryAfter, "4");
  assert.equal(response.retryAfterMs, 4000);
  assert.equal(response.retryable, true);
  assert.equal(response.attempts, 1);
  assert.ok(response.error instanceof NotionApiError);
});

test("network failures throw a normalized transport error", async () => {
  const cause = new TypeError("fetch failed with secret token");
  const client = makeNotionClient("token", "2026-03-11", {
    fetchImpl: async () => {
      throw cause;
    },
  });

  await assert.rejects(
    () => client.request("GET", "pages/network"),
    (error) => {
      assert.ok(error instanceof NotionTransportError);
      assert.equal(error.kind, "transport");
      assert.equal(error.code, "network_error");
      assert.equal(error.method, "GET");
      assert.equal(error.apiPath, "pages/network");
      assert.equal(error.retryable, true);
      assert.equal(error.attempts, 1);
      assert.equal(error.cause, cause);
      assert.doesNotMatch(error.message, /secret token/);
      return true;
    },
  );
});

test("requestMaybe throws transport failures instead of permission-style ok false", async () => {
  const client = makeNotionClient("token", "2026-03-11", {
    fetchImpl: async () => {
      throw new TypeError("fetch failed with private detail");
    },
  });

  await assert.rejects(
    () => client.requestMaybe("GET", "pages/network"),
    (error) => {
      assert.ok(error instanceof NotionTransportError);
      assert.equal(error.kind, "transport");
      assert.doesNotMatch(error.message, /private detail/);
      return true;
    },
  );
});

test("timeouts abort the request and throw a normalized transport error", async () => {
  const client = makeNotionClient("token", "2026-03-11", {
    fetchImpl: async (_url, options) => {
      assert.equal(options.signal.aborted, true);
      throw Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    },
    timeoutMs: 5,
    setTimeoutImpl: (callback, ms) => {
      assert.equal(ms, 5);
      callback();
      return "timer-1";
    },
    clearTimeoutImpl: (timerId) => {
      assert.equal(timerId, "timer-1");
    },
  });

  await assert.rejects(
    () => client.request("GET", "pages/slow"),
    (error) => {
      assert.ok(error instanceof NotionTransportError);
      assert.equal(error.code, "request_timeout");
      assert.equal(error.kind, "transport");
      assert.equal(error.method, "GET");
      assert.equal(error.apiPath, "pages/slow");
      return true;
    },
  );
});

test("invalid success JSON throws a normalized parse error", async () => {
  const client = makeNotionClient("token", "2026-03-11", {
    fetchImpl: async () => new Response("{ secret body", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  });

  await assert.rejects(
    () => client.request("GET", "pages/bad-json"),
    (error) => {
      assert.ok(error instanceof NotionParseError);
      assert.equal(error.kind, "parse");
      assert.equal(error.code, "invalid_json_response");
      assert.equal(error.status, 200);
      assert.equal(error.contentType, "application/json");
      assert.equal(error.responseTextLength, "{ secret body".length);
      assert.equal(error.retryable, false);
      assert.equal(error.attempts, 1);
      assert.doesNotMatch(error.message, /secret body/);
      return true;
    },
  );
});

test("requestMaybe throws parse errors for successful invalid JSON", async () => {
  const client = makeNotionClient("token", "2026-03-11", {
    fetchImpl: async () => new Response("{", { status: 200 }),
  });

  await assert.rejects(
    () => client.requestMaybe("GET", "pages/bad-json"),
    NotionParseError,
  );
});

test("getChildren paginates through multiple result pages", async () => {
  const seen = [];
  const client = makeNotionClient("token", "2026-03-11", {
    fetchImpl: async (url) => {
      seen.push(url);
      if (url.includes("start_cursor=cursor-2")) {
        return new Response(JSON.stringify({
          results: [{ id: "page-2" }],
          has_more: false,
          next_cursor: null,
        }), { status: 200 });
      }

      return new Response(JSON.stringify({
        results: [{ id: "page-1" }],
        has_more: true,
        next_cursor: "cursor-2",
      }), { status: 200 });
    },
  });

  const results = await client.getChildren("root");
  assert.deepEqual(results.map((item) => item.id), ["page-1", "page-2"]);
  assert.equal(seen.length, 2);
});
