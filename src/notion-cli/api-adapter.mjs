import {
  NotionApiError,
  NotionParseError,
  NotionTransportError,
  parseRetryMetadata,
} from "../notion/errors.mjs";
import { buildNotionOperationPolicy } from "../notion/operation-policy.mjs";
import { runChildCommand } from "../infrastructure/child-runner.mjs";
import { resolveNotionCliChildArgs } from "./probe.mjs";

const READ_QUERY_PATTERN = /^data_sources\/[^/]+\/query(?:\?.*)?$/;

function normalizeApiPath(apiPath) {
  return String(apiPath || "").replace(/^\/+/, "").replace(/^v1\//, "");
}

function isAllowedRead(method, apiPath, body) {
  const normalizedMethod = String(method || "").toUpperCase();
  const normalizedPath = normalizeApiPath(apiPath);
  if (normalizedMethod === "GET" && body === undefined) return true;
  if (normalizedMethod === "POST" && READ_QUERY_PATTERN.test(normalizedPath)) return true;
  return false;
}

function buildPolicy(method, apiPath, retryable = false) {
  return buildNotionOperationPolicy({ method, apiPath, retryable });
}

function assertReadOnly(method, apiPath, body) {
  const normalizedMethod = String(method || "").toUpperCase();
  const normalizedPath = normalizeApiPath(apiPath);

  if (!isAllowedRead(normalizedMethod, normalizedPath, body)) {
    const operationPolicy = buildPolicy(normalizedMethod, normalizedPath, false);
    const error = new NotionTransportError(`${normalizedMethod} ${normalizedPath} is not allowed through the read-only Notion CLI adapter.`, {
      method: normalizedMethod,
      apiPath: normalizedPath,
      code: "notion_cli_read_only_violation",
      retryable: false,
      operationPolicy,
    });
    error.blockedBeforeSpawn = true;
    throw error;
  }
}

function buildEnv({ token, notionVersion, env = process.env }) {
  return {
    PATH: env.PATH,
    Path: env.Path,
    SystemRoot: env.SystemRoot,
    WINDIR: env.WINDIR,
    COMSPEC: env.COMSPEC,
    PATHEXT: env.PATHEXT,
    NOTION_API_TOKEN: token,
    NOTION_API_VERSION: notionVersion,
    NOTION_KEYRING: "0",
  };
}

function parseJsonStdout(method, apiPath, stdout) {
  try {
    return stdout ? JSON.parse(stdout) : null;
  } catch (error) {
    throw new NotionParseError(`${method} ${apiPath} returned invalid JSON from ntn api.`, {
      method,
      apiPath,
      code: "notion_cli_invalid_json",
      responseTextLength: stdout?.length ?? 0,
      operationPolicy: buildPolicy(method, apiPath, false),
      cause: error,
    });
  }
}

function statusFromParsed(parsed) {
  return Number.isInteger(parsed?.status) ? parsed.status : null;
}

function codeFromParsed(parsed) {
  return typeof parsed?.code === "string" ? parsed.code : null;
}

function toHeaders(retryAfter) {
  return {
    get(name) {
      return String(name || "").toLowerCase() === "retry-after" ? retryAfter || null : null;
    },
  };
}

function apiErrorFromParsed(method, apiPath, parsed) {
  const status = statusFromParsed(parsed) ?? 500;
  const retryAfter = typeof parsed?.retry_after === "string" ? parsed.retry_after : null;
  const retryMetadata = parseRetryMetadata({
    status,
    headers: toHeaders(retryAfter),
  });
  const operationPolicy = buildNotionOperationPolicy({
    method,
    apiPath,
    retryable: retryMetadata.retryable,
    retryAfterMs: retryMetadata.retryAfterMs,
  });
  return new NotionApiError(`${method} ${apiPath} failed through ntn api: ${status} ${codeFromParsed(parsed) || "Notion API error."}`.trim(), {
    method,
    apiPath,
    status,
    code: codeFromParsed(parsed),
    body: "",
    details: null,
    operationPolicy,
    ...retryMetadata,
  });
}

function transportErrorFromChild(method, apiPath, result) {
  const operationPolicy = buildPolicy(method, apiPath, true);
  const code = result.spawnError ? "notion_cli_spawn_error" : "notion_cli_nonzero_exit";
  return new NotionTransportError(`${method} ${apiPath} failed before a safe ntn api JSON response was available.`, {
    method,
    apiPath,
    code,
    retryable: true,
    operationPolicy,
    cause: result.spawnError || undefined,
  });
}

function buildChildArgs({ method, apiPath, body, env, nodeExecPath, platform }) {
  const normalizedPath = normalizeApiPath(apiPath);
  const args = ["api", "--method", String(method).toUpperCase(), `/v1/${normalizedPath}`];
  if (body !== undefined) {
    args.push("--data", JSON.stringify(body));
  }
  return resolveNotionCliChildArgs({ args, env, nodeExecPath, platform });
}

function executeNtnApi({
  method,
  apiPath,
  body,
  token,
  notionVersion,
  runChildCommandImpl,
  env,
  nodeExecPath,
  platform,
}) {
  const normalizedMethod = String(method || "").toUpperCase();
  const normalizedPath = normalizeApiPath(apiPath);
  assertReadOnly(normalizedMethod, normalizedPath, body);
  const childArgs = buildChildArgs({
    method: normalizedMethod,
    apiPath: normalizedPath,
    body,
    env,
    nodeExecPath,
    platform,
  });
  const result = runChildCommandImpl({
    childArgs,
    env: buildEnv({ token, notionVersion, env }),
  });
  const parsed = parseJsonStdout(normalizedMethod, normalizedPath, result.stdout);

  if (!result.ok) {
    if (parsed && (statusFromParsed(parsed) || codeFromParsed(parsed))) {
      throw apiErrorFromParsed(normalizedMethod, normalizedPath, parsed);
    }
    throw transportErrorFromChild(normalizedMethod, normalizedPath, result);
  }

  return parsed;
}

export function makeNotionCliApiClient(token, notionVersion, {
  runChildCommandImpl = runChildCommand,
  env = process.env,
  nodeExecPath = process.execPath,
  platform = process.platform,
} = {}) {
  async function request(method, apiPath, body) {
    return executeNtnApi({
      method,
      apiPath,
      body,
      token,
      notionVersion,
      runChildCommandImpl,
      env,
      nodeExecPath,
      platform,
    });
  }

  async function requestMaybe(method, apiPath, body) {
    try {
      return {
        ok: true,
        json: await request(method, apiPath, body),
      };
    } catch (error) {
      if (error instanceof NotionApiError) {
        return {
          ok: false,
          status: error.status,
          body: "",
          error,
          retryAfter: error.retryAfter,
          retryAfterMs: error.retryAfterMs,
          retryable: error.retryable,
          attempts: error.attempts,
          operationKind: error.operationKind,
          operationClass: error.operationClass,
          idempotency: error.idempotency,
          safeToAutoRetry: error.safeToAutoRetry,
          manualRetryOnly: error.manualRetryOnly,
          retryPolicyReason: error.retryPolicyReason,
        };
      }
      throw error;
    }
  }

  async function getChildren(blockId) {
    const results = [];
    let cursor = null;

    do {
      const query = cursor
        ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
        : "?page_size=100";
      const response = await request("GET", `blocks/${blockId}/children${query}`);
      results.push(...(response?.results || []));
      cursor = response?.has_more ? response.next_cursor : null;
    } while (cursor);

    return results;
  }

  return {
    request,
    requestMaybe,
    getChildren,
  };
}

export function summarizeNotionCliApiProbe({
  ok,
  object,
  warnings = [],
}) {
  return {
    checked: true,
    available: ok,
    ok,
    command: "ntn api --method GET pages/<project-page>",
    target: "project-page",
    object: object || null,
    warnings,
    safeNextCommands: [
      "node src/cli.mjs doctor --project \"Project Name\" --notion-cli-api --project-token-env PROJECT_NAME_NOTION_TOKEN",
      "node src/cli.mjs doctor --project \"Project Name\" --project-token-env PROJECT_NAME_NOTION_TOKEN",
    ],
  };
}
