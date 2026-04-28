import test from "node:test";
import assert from "node:assert/strict";

import {
  NotionApiError,
  NotionParseError,
  NotionTransportError,
  serializeSafeNotionError,
} from "../src/notion/errors.mjs";

test("serializeSafeNotionError returns safe Notion API error fields only", () => {
  const error = new NotionApiError("POST pages failed: 400 validation_error Notion API error.", {
    method: "POST",
    apiPath: "pages",
    status: 400,
    code: "validation_error",
    body: "raw body contains ntn_secret_body",
    details: { message: "detail contains PROJECT_NOTION_TOKEN" },
    retryAfter: "2",
    retryAfterMs: 2000,
    retryable: true,
    attempts: 3,
  });
  error.requestBody = { secret: "request-body-secret" };
  error.stack = "stack with SNPM_NOTION_TOKEN";
  error.stdout = "child stdout secret";
  error.stderr = "child stderr secret";

  assert.deepEqual(serializeSafeNotionError(error), {
    name: "NotionApiError",
    kind: "api",
    message: "POST pages failed: 400 validation_error Notion API error.",
    method: "POST",
    apiPath: "pages",
    status: 400,
    code: "validation_error",
    retryAfter: "2",
    retryAfterMs: 2000,
    retryable: true,
    attempts: 3,
  });

  const serialized = JSON.stringify(serializeSafeNotionError(error));
  assert.equal(serialized.includes("ntn_secret_body"), false);
  assert.equal(serialized.includes("PROJECT_NOTION_TOKEN"), false);
  assert.equal(serialized.includes("request-body-secret"), false);
  assert.equal(serialized.includes("SNPM_NOTION_TOKEN"), false);
  assert.equal(serialized.includes("child stdout secret"), false);
  assert.equal(serialized.includes("child stderr secret"), false);
});

test("serializeSafeNotionError returns safe transport error fields without cause text", () => {
  const error = new NotionTransportError("GET pages/network failed before response.", {
    method: "GET",
    apiPath: "pages/network",
    code: "network_error",
    retryable: true,
    attempts: 2,
    cause: new Error("cause contains token/env/generated-secret"),
  });

  assert.deepEqual(serializeSafeNotionError(error), {
    name: "NotionTransportError",
    kind: "transport",
    message: "GET pages/network failed before response.",
    method: "GET",
    apiPath: "pages/network",
    code: "network_error",
    retryable: true,
    attempts: 2,
  });

  assert.equal(JSON.stringify(serializeSafeNotionError(error)).includes("token/env/generated-secret"), false);
});

test("serializeSafeNotionError returns safe parse error fields without response text", () => {
  const error = new NotionParseError("GET pages/bad-json returned invalid JSON.", {
    method: "GET",
    apiPath: "pages/bad-json",
    status: 200,
    contentType: "application/json",
    responseTextLength: 31,
    cause: new SyntaxError("raw response had generated-secret"),
  });
  error.responseText = "{ generated-secret body";

  assert.deepEqual(serializeSafeNotionError(error), {
    name: "NotionParseError",
    kind: "parse",
    message: "GET pages/bad-json returned invalid JSON.",
    method: "GET",
    apiPath: "pages/bad-json",
    status: 200,
    code: "invalid_json_response",
    retryable: false,
    attempts: 1,
    contentType: "application/json",
    responseTextLength: 31,
  });

  const serialized = JSON.stringify(serializeSafeNotionError(error));
  assert.equal(serialized.includes("generated-secret"), false);
  assert.equal(Object.hasOwn(serializeSafeNotionError(error), "responseText"), false);
});

test("serializeSafeNotionError redacts generic error messages and arbitrary fields", () => {
  const error = new Error("generic message includes ntn_secret and SNPM_NOTION_TOKEN");
  error.code = "PROJECT_NOTION_TOKEN";
  error.body = "raw body";
  error.cause = new Error("cause text");
  error.stdout = "child stdout";
  error.stderr = "child stderr";

  assert.deepEqual(serializeSafeNotionError(error), {
    name: "Error",
    kind: "generic",
    message: "Unexpected error.",
  });

  const serialized = JSON.stringify(serializeSafeNotionError(error));
  assert.equal(serialized.includes("ntn_secret"), false);
  assert.equal(serialized.includes("SNPM_NOTION_TOKEN"), false);
  assert.equal(serialized.includes("PROJECT_NOTION_TOKEN"), false);
  assert.equal(serialized.includes("raw body"), false);
  assert.equal(serialized.includes("cause text"), false);
  assert.equal(serialized.includes("child stdout"), false);
  assert.equal(serialized.includes("child stderr"), false);
});

test("serializeSafeNotionError treats spoofed Notion-shaped objects as generic", () => {
  const error = {
    name: "NotionApiError",
    message: "spoofed message includes ntn_secret",
    body: "raw body",
  };

  assert.deepEqual(serializeSafeNotionError(error), {
    name: "Error",
    kind: "generic",
    message: "Unexpected error.",
  });
});
