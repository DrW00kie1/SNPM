import {
  NotionApiError,
  NotionParseError,
  NotionTransportError,
  parseRetryMetadata,
} from "../notion/errors.mjs";
import { buildNotionOperationPolicy } from "../notion/operation-policy.mjs";
import { runChildCommand } from "../infrastructure/child-runner.mjs";
import { resolveNotionCliChildArgs } from "./probe.mjs";

const METHOD = "GET";
const DISPLAY_COMMAND = "ntn pages get <resolved-page> --json --notion-version <version>";
const DEFAULT_SAFE_NEXT_COMMANDS = [
  'node src/cli.mjs doctor --project "Project Name" --notion-cli-pages --page "Planning > Roadmap" --project-token-env PROJECT_NAME_NOTION_TOKEN',
  'node src/cli.mjs doctor --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN',
];

function apiPathForPage(pageId) {
  return `pages/${pageId}/markdown`;
}

function buildPolicy(apiPath, retryable = false, retryAfterMs) {
  return buildNotionOperationPolicy({
    method: METHOD,
    apiPath,
    retryable,
    retryAfterMs,
  });
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

function parseJsonStdout(pageId, stdout) {
  const apiPath = apiPathForPage(pageId);
  try {
    return stdout ? JSON.parse(stdout) : null;
  } catch (error) {
    throw new NotionParseError("ntn pages get returned invalid JSON.", {
      method: METHOD,
      apiPath,
      code: "notion_cli_pages_invalid_json",
      responseTextLength: stdout?.length ?? 0,
      operationPolicy: buildPolicy(apiPath, false),
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

function apiErrorFromParsed(pageId, parsed) {
  const apiPath = apiPathForPage(pageId);
  const status = statusFromParsed(parsed) ?? 500;
  const retryAfter = typeof parsed?.retry_after === "string" ? parsed.retry_after : null;
  const retryMetadata = parseRetryMetadata({
    status,
    headers: toHeaders(retryAfter),
  });
  return new NotionApiError(`ntn pages get failed: ${status} ${codeFromParsed(parsed) || "Notion API error."}`.trim(), {
    method: METHOD,
    apiPath,
    status,
    code: codeFromParsed(parsed),
    body: "",
    details: null,
    operationPolicy: buildPolicy(apiPath, retryMetadata.retryable, retryMetadata.retryAfterMs),
    ...retryMetadata,
  });
}

function transportErrorFromChild(pageId, result) {
  const apiPath = apiPathForPage(pageId);
  const code = result.spawnError ? "notion_cli_pages_spawn_error" : "notion_cli_pages_nonzero_exit";
  return new NotionTransportError("ntn pages get failed before a safe JSON response was available.", {
    method: METHOD,
    apiPath,
    code,
    retryable: true,
    operationPolicy: buildPolicy(apiPath, true),
    cause: result.spawnError || undefined,
  });
}

function extractMarkdownPayload(pageId, parsed) {
  const apiPath = apiPathForPage(pageId);
  const markdown = typeof parsed?.markdown === "string"
    ? parsed.markdown
    : typeof parsed?.page?.markdown === "string"
      ? parsed.page.markdown
      : typeof parsed?.content === "string"
        ? parsed.content
        : null;

  if (typeof markdown !== "string") {
    throw new NotionParseError("ntn pages get JSON did not include a Markdown string.", {
      method: METHOD,
      apiPath,
      code: "notion_cli_pages_missing_markdown",
      responseTextLength: JSON.stringify(parsed || {}).length,
      operationPolicy: buildPolicy(apiPath, false),
    });
  }

  const unknownBlockIds = Array.isArray(parsed?.unknown_block_ids)
    ? parsed.unknown_block_ids
    : Array.isArray(parsed?.unknownBlockIds)
      ? parsed.unknownBlockIds
      : Array.isArray(parsed?.page?.unknown_block_ids)
        ? parsed.page.unknown_block_ids
        : [];

  return {
    markdown,
    truncated: parsed?.truncated === true || parsed?.page?.truncated === true,
    unknownBlockCount: unknownBlockIds.length,
  };
}

function buildChildArgs({ pageId, notionVersion, env, nodeExecPath, platform }) {
  return resolveNotionCliChildArgs({
    args: ["pages", "get", pageId, "--json", "--notion-version", notionVersion],
    env,
    nodeExecPath,
    platform,
  });
}

export function makeNotionCliPageMarkdownClient(token, notionVersion, {
  runChildCommandImpl = runChildCommand,
  env = process.env,
  nodeExecPath = process.execPath,
  platform = process.platform,
} = {}) {
  async function getPageMarkdown(pageId) {
    const childArgs = buildChildArgs({
      pageId,
      notionVersion,
      env,
      nodeExecPath,
      platform,
    });
    const result = runChildCommandImpl({
      childArgs,
      env: buildEnv({ token, notionVersion, env }),
    });
    const parsed = parseJsonStdout(pageId, result.stdout);

    if (!result.ok) {
      if (parsed && (statusFromParsed(parsed) || codeFromParsed(parsed))) {
        throw apiErrorFromParsed(pageId, parsed);
      }
      throw transportErrorFromChild(pageId, result);
    }

    return extractMarkdownPayload(pageId, parsed);
  }

  return {
    getPageMarkdown,
  };
}

export function summarizeNotionCliPagesProbe({
  available,
  targetPath,
  matches = false,
  hasDiff = null,
  normalizationNotes = [],
  warnings = [],
  recommendation,
}) {
  return {
    checked: true,
    available: Boolean(available),
    targetPath,
    command: DISPLAY_COMMAND,
    matches,
    hasDiff,
    normalizationNotes,
    warnings,
    safeNextCommands: DEFAULT_SAFE_NEXT_COMMANDS,
    recommendation: recommendation || (matches
      ? "ntn-pages-get-is-compatible-for-this-approved-page"
      : "keep-snpm-page-markdown-transport-until-parity-is-proven"),
  };
}
