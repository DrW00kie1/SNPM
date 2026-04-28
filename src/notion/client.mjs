import {
  NotionParseError,
  NotionTransportError,
  parseNotionError,
} from "./errors.mjs";

export const DEFAULT_NOTION_REQUEST_TIMEOUT_MS = 60_000;

async function readJsonResponse(method, apiPath, response) {
  if (response.status === 204) return null;

  let text;
  try {
    text = await response.text();
  } catch (error) {
    throw new NotionParseError(`${method} ${apiPath} failed while reading the response body.`, {
      method,
      apiPath,
      status: response.status,
      code: "response_body_read_failed",
      contentType: response.headers?.get?.("content-type"),
      cause: error,
    });
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new NotionParseError(`${method} ${apiPath} returned invalid JSON.`, {
      method,
      apiPath,
      status: response.status,
      contentType: response.headers?.get?.("content-type"),
      responseTextLength: text.length,
      cause: error,
    });
  }
}

function normalizeTimeoutMs(timeoutMs) {
  if (timeoutMs === null || timeoutMs === false || timeoutMs === 0) return null;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new Error("Notion request timeout must be a non-negative finite number.");
  }
  return timeoutMs;
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

function toTransportError(method, apiPath, error, didTimeout) {
  const code = didTimeout ? "request_timeout" : isAbortError(error) ? "request_aborted" : "network_error";
  const reason = didTimeout ? "timed out" : isAbortError(error) ? "was aborted" : "failed before response";
  return new NotionTransportError(`${method} ${apiPath} ${reason}.`, {
    method,
    apiPath,
    code,
    cause: error,
  });
}

export function makeNotionClient(token, notionVersion, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_NOTION_REQUEST_TIMEOUT_MS,
  AbortControllerImpl = globalThis.AbortController,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required to create the Notion client.");
  }

  const defaultTimeoutMs = normalizeTimeoutMs(timeoutMs);

  async function sendNotionRequest(method, apiPath, body, { timeoutMs: requestTimeoutMs = defaultTimeoutMs } = {}) {
    const resolvedTimeoutMs = normalizeTimeoutMs(requestTimeoutMs);
    let controller = null;
    let timeoutId = null;
    let didTimeout = false;

    if (resolvedTimeoutMs !== null) {
      if (typeof AbortControllerImpl !== "function") {
        throw new Error("AbortController support is required when Notion request timeouts are enabled.");
      }
      if (typeof setTimeoutImpl !== "function" || typeof clearTimeoutImpl !== "function") {
        throw new Error("Timer hooks are required when Notion request timeouts are enabled.");
      }

      controller = new AbortControllerImpl();
      timeoutId = setTimeoutImpl(() => {
        didTimeout = true;
        controller.abort();
      }, resolvedTimeoutMs);
    }

    try {
      return await fetchImpl(`https://api.notion.com/v1/${apiPath}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": notionVersion,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller?.signal,
      });
    } catch (error) {
      throw toTransportError(method, apiPath, error, didTimeout);
    } finally {
      if (timeoutId !== null) {
        clearTimeoutImpl(timeoutId);
      }
    }
  }

  async function request(method, apiPath, body, options) {
    const response = await sendNotionRequest(method, apiPath, body, options);

    if (!response.ok) {
      throw await parseNotionError(method, apiPath, response);
    }

    return readJsonResponse(method, apiPath, response);
  }

  async function requestMaybe(method, apiPath, body, options) {
    const response = await sendNotionRequest(method, apiPath, body, options);

    if (response.ok) {
      return { ok: true, json: await readJsonResponse(method, apiPath, response) };
    }

    const error = await parseNotionError(method, apiPath, response);
    return {
      ok: false,
      status: error.status,
      body: error.body,
      error,
      retryAfter: error.retryAfter,
      retryAfterMs: error.retryAfterMs,
      retryable: error.retryable,
      attempts: error.attempts,
    };
  }

  async function getChildren(blockId) {
    const results = [];
    let cursor = null;

    do {
      const query = cursor
        ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
        : "?page_size=100";
      const response = await request("GET", `blocks/${blockId}/children${query}`);
      results.push(...response.results);
      cursor = response.has_more ? response.next_cursor : null;
    } while (cursor);

    return results;
  }

  return {
    request,
    requestMaybe,
    getChildren,
  };
}
