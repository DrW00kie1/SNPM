export class NotionApiError extends Error {
  constructor(message, {
    method,
    apiPath,
    status,
    code,
    body,
    details,
    retryAfter,
    retryAfterMs,
    retryable,
    attempts = 1,
  } = {}) {
    super(message);
    this.name = "NotionApiError";
    this.kind = "api";
    this.method = method;
    this.apiPath = apiPath;
    this.status = status;
    this.code = code || null;
    this.retryAfter = retryAfter || null;
    this.retryAfterMs = retryAfterMs ?? null;
    this.retryable = Boolean(retryable);
    this.attempts = attempts;
    Object.defineProperties(this, {
      body: {
        value: body || "",
        enumerable: false,
      },
      details: {
        value: details || null,
        enumerable: false,
      },
    });
  }
}

export class NotionTransportError extends Error {
  constructor(message, {
    method,
    apiPath,
    code = "network_error",
    retryable = true,
    attempts = 1,
    cause,
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "NotionTransportError";
    this.kind = "transport";
    this.method = method;
    this.apiPath = apiPath;
    this.code = code;
    this.retryable = Boolean(retryable);
    this.attempts = attempts;
  }
}

export class NotionParseError extends Error {
  constructor(message, {
    method,
    apiPath,
    status,
    code = "invalid_json_response",
    contentType,
    responseTextLength,
    retryable = false,
    attempts = 1,
    cause,
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "NotionParseError";
    this.kind = "parse";
    this.method = method;
    this.apiPath = apiPath;
    this.status = status;
    this.code = code;
    this.contentType = contentType || null;
    this.responseTextLength = responseTextLength ?? null;
    this.retryable = Boolean(retryable);
    this.attempts = attempts;
  }
}

function copySafeField(target, source, key) {
  const value = source?.[key];
  if (value !== undefined) {
    target[key] = value;
  }
}

function serializeKnownNotionError(error, kind) {
  const serialized = {
    name: error.name,
    kind,
    message: error.message,
  };

  for (const key of ["method", "apiPath", "status", "code", "retryAfter", "retryAfterMs", "retryable", "attempts"]) {
    copySafeField(serialized, error, key);
  }

  if (kind === "parse") {
    copySafeField(serialized, error, "contentType");
    copySafeField(serialized, error, "responseTextLength");
  }

  return serialized;
}

export function serializeSafeNotionError(error) {
  if (error instanceof NotionApiError) {
    return serializeKnownNotionError(error, "api");
  }

  if (error instanceof NotionTransportError) {
    return serializeKnownNotionError(error, "transport");
  }

  if (error instanceof NotionParseError) {
    return serializeKnownNotionError(error, "parse");
  }

  return {
    name: "Error",
    kind: "generic",
    message: "Unexpected error.",
  };
}

function toMessage(method, apiPath, status, code) {
  const suffix = code ? `${code} Notion API error.` : "Notion API error.";
  return `${method} ${apiPath} failed: ${status} ${suffix}`.trim();
}

const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function parseRetryAfterMs(value) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }

  return null;
}

export function parseRetryMetadata(response) {
  const retryAfter = response.headers?.get?.("retry-after") || null;
  const retryAfterMs = parseRetryAfterMs(retryAfter);
  return {
    retryAfter,
    retryAfterMs,
    retryable: Boolean(retryAfter) || RETRYABLE_HTTP_STATUSES.has(response.status),
    attempts: 1,
  };
}

export async function parseNotionError(method, apiPath, response) {
  const body = await response.text();

  let parsed = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }

  const code = parsed?.code || null;
  const retryMetadata = parseRetryMetadata(response);

  return new NotionApiError(toMessage(method, apiPath, response.status, code), {
    method,
    apiPath,
    status: response.status,
    code,
    body,
    details: parsed,
    ...retryMetadata,
  });
}
