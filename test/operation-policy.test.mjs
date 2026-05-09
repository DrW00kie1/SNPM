import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNotionOperationPolicy,
  classifyNotionOperation,
} from "../src/notion/operation-policy.mjs";

test("classifyNotionOperation distinguishes reads, queries, and mutation kinds", () => {
  assert.deepEqual(classifyNotionOperation("GET", "pages/page-id"), {
    operationKind: "read",
    operationClass: "read",
    idempotency: "idempotent",
  });

  assert.deepEqual(classifyNotionOperation("POST", "data_sources/source-id/query"), {
    operationKind: "query",
    operationClass: "read",
    idempotency: "idempotent",
  });

  assert.deepEqual(classifyNotionOperation("POST", "pages"), {
    operationKind: "create",
    operationClass: "write",
    idempotency: "non-idempotent",
  });

  assert.deepEqual(classifyNotionOperation("PATCH", "pages/page-id/markdown"), {
    operationKind: "replace",
    operationClass: "write",
    idempotency: "conditional",
  });

  assert.deepEqual(classifyNotionOperation("PATCH", "blocks/block-id/children"), {
    operationKind: "append",
    operationClass: "write",
    idempotency: "non-idempotent",
  });

  assert.deepEqual(classifyNotionOperation("DELETE", "blocks/block-id"), {
    operationKind: "delete",
    operationClass: "destructive",
    idempotency: "non-idempotent",
  });
});

test("buildNotionOperationPolicy separates protocol retryability from safe auto retry", () => {
  const readPolicy = buildNotionOperationPolicy({
    method: "GET",
    apiPath: "pages/page-id",
    retryable: true,
    retryAfterMs: 2000,
  });

  assert.equal(readPolicy.safeToAutoRetry, true);
  assert.equal(readPolicy.manualRetryOnly, false);
  assert.match(readPolicy.retryPolicyReason, /metadata only/i);

  const writePolicy = buildNotionOperationPolicy({
    method: "PATCH",
    apiPath: "pages/page-id/markdown",
    retryable: true,
    retryAfterMs: 2000,
  });

  assert.equal(writePolicy.safeToAutoRetry, false);
  assert.equal(writePolicy.manualRetryOnly, true);
  assert.match(writePolicy.retryPolicyReason, /manual-retry-only/i);

  const nonRetryableReadPolicy = buildNotionOperationPolicy({
    method: "GET",
    apiPath: "pages/page-id",
    retryable: false,
  });

  assert.equal(nonRetryableReadPolicy.safeToAutoRetry, false);
  assert.equal(nonRetryableReadPolicy.manualRetryOnly, false);
});
