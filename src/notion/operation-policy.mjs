const READ_OPERATION = {
  operationKind: "read",
  operationClass: "read",
  idempotency: "idempotent",
};

const QUERY_OPERATION = {
  operationKind: "query",
  operationClass: "read",
  idempotency: "idempotent",
};

const CREATE_OPERATION = {
  operationKind: "create",
  operationClass: "write",
  idempotency: "non-idempotent",
};

const UPDATE_OPERATION = {
  operationKind: "update",
  operationClass: "write",
  idempotency: "conditional",
};

const REPLACE_OPERATION = {
  operationKind: "replace",
  operationClass: "write",
  idempotency: "conditional",
};

const APPEND_OPERATION = {
  operationKind: "append",
  operationClass: "write",
  idempotency: "non-idempotent",
};

const DESTRUCTIVE_OPERATION = {
  operationKind: "delete",
  operationClass: "destructive",
  idempotency: "non-idempotent",
};

const UNKNOWN_OPERATION = {
  operationKind: "unknown",
  operationClass: "unknown",
  idempotency: "unknown",
};

function normalizeMethod(method) {
  return String(method || "").trim().toUpperCase();
}

function normalizeApiPath(apiPath) {
  return String(apiPath || "").split("?")[0].replace(/^\/+|\/+$/g, "");
}

function isDataSourceQuery(method, path) {
  return method === "POST" && /^data_sources\/[^/]+\/query$/.test(path);
}

function classifyWrite(method, path) {
  if (method === "POST") {
    if (path === "pages" || path === "databases") {
      return CREATE_OPERATION;
    }

    return CREATE_OPERATION;
  }

  if (method === "PATCH") {
    if (/^pages\/[^/]+\/markdown$/.test(path)) {
      return REPLACE_OPERATION;
    }

    if (/^blocks\/[^/]+\/children$/.test(path)) {
      return APPEND_OPERATION;
    }

    return UPDATE_OPERATION;
  }

  if (method === "PUT") {
    return REPLACE_OPERATION;
  }

  return UNKNOWN_OPERATION;
}

export function classifyNotionOperation(method, apiPath) {
  const normalizedMethod = normalizeMethod(method);
  const normalizedPath = normalizeApiPath(apiPath);

  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") {
    return { ...READ_OPERATION };
  }

  if (isDataSourceQuery(normalizedMethod, normalizedPath)) {
    return { ...QUERY_OPERATION };
  }

  if (normalizedMethod === "DELETE") {
    return { ...DESTRUCTIVE_OPERATION };
  }

  if (["POST", "PATCH", "PUT"].includes(normalizedMethod)) {
    return { ...classifyWrite(normalizedMethod, normalizedPath) };
  }

  return { ...UNKNOWN_OPERATION };
}

export function buildNotionOperationPolicy({
  method,
  apiPath,
  retryable = false,
  retryAfterMs = null,
} = {}) {
  const classification = classifyNotionOperation(method, apiPath);
  const protocolRetryable = Boolean(retryable);
  const safeToAutoRetry = classification.operationClass === "read" && protocolRetryable;
  const manualRetryOnly = classification.operationClass !== "read" && protocolRetryable;
  let retryPolicyReason;

  if (safeToAutoRetry) {
    retryPolicyReason = "Read/query request is protocol-retryable, but this sprint records policy metadata only and still performs one attempt.";
  } else if (manualRetryOnly) {
    retryPolicyReason = "Mutation-like request is manual-retry-only to avoid duplicate or stale side effects.";
  } else if (classification.operationClass === "read") {
    retryPolicyReason = "Read/query request is not protocol-retryable for this failure.";
  } else if (classification.operationClass === "unknown") {
    retryPolicyReason = "Operation kind is unknown, so SNPM will not classify it as safe for automatic retry.";
  } else {
    retryPolicyReason = "Mutation-like request is not protocol-retryable for this failure and remains manual recovery only.";
  }

  return {
    ...classification,
    safeToAutoRetry,
    manualRetryOnly,
    retryPolicyReason,
    ...(retryAfterMs !== null && retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}

export const NOTION_OPERATION_POLICY_FIELDS = [
  "operationKind",
  "operationClass",
  "idempotency",
  "safeToAutoRetry",
  "manualRetryOnly",
  "retryPolicyReason",
];
