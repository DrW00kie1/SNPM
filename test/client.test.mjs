import test from "node:test";
import assert from "node:assert/strict";

import { NotionApiError } from "../src/notion/errors.mjs";
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
