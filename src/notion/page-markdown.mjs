import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { getProjectToken, getWorkspaceToken, nowTimestamp } from "./env.mjs";
import { makeNotionClient } from "./client.mjs";
import {
  assertLivePageMetadataStable,
  assertPullPageMetadataFreshFromNotion,
  buildPullPageMetadata,
  fetchLivePageMetadata,
} from "./page-metadata.mjs";
import { resolveApprovedPlanningPageTarget } from "./page-targets.mjs";

export function choosePageSyncAuth(
  projectTokenEnv,
  {
    getProjectTokenImpl = getProjectToken,
    getWorkspaceTokenImpl = getWorkspaceToken,
  } = {},
) {
  if (projectTokenEnv) {
    return {
      authMode: "project-token",
      token: getProjectTokenImpl(projectTokenEnv),
    };
  }

  return {
    authMode: "workspace-token",
    token: getWorkspaceTokenImpl(),
  };
}

export function normalizeMarkdownNewlines(markdown) {
  return markdown.replace(/\r\n/g, "\n");
}

export const MANAGED_BODY_NORMALIZATIONS = [
  "lf-newlines",
  "single-final-newline",
  "self-link-literal-paths",
  "basename-auto-link-paths",
  "workspace-separator-unescaping",
  "windows-absolute-paths",
  "escaped-angle-placeholders",
  "escaped-square-placeholders",
];

function isRepoOrWorkspaceLiteralPath(text) {
  const candidate = (text || "").trim();
  if (!candidate) {
    return false;
  }

  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(candidate)) {
    return false;
  }

  if (candidate.includes(" > ")) {
    return true;
  }

  if (/[\\/]/.test(candidate)) {
    return true;
  }

  return /^[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+$/.test(candidate);
}

function isPlaceholderLiteral(text) {
  return /[A-Z]/.test(text || "") && /^[A-Z0-9 _./:-]+$/.test(text || "");
}

function canonicalizeSelfLinks(text) {
  return text.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (match, label, destination) => {
    if (label !== destination) {
      return match;
    }

    return isRepoOrWorkspaceLiteralPath(destination) ? destination : match;
  });
}

function canonicalizeAutoLinkedFileNames(text) {
  return text.replace(
    /\[([A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)\]\((https?:\/\/)\1\)/g,
    (_match, fileName) => fileName,
  );
}

function canonicalizeEscapedWorkspaceSeparators(text) {
  return text.replace(/ \\> /g, " > ");
}

function canonicalizeWindowsAbsolutePaths(text) {
  return text.replace(
    /(^|[\s(>:"'])([A-Za-z]):\\((?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]+)/g,
    (match, prefix, driveLetter, remainder, offset, source) => {
      if (prefix === "(" && offset > 0 && source[offset - 1] === "]") {
        return match;
      }
      const normalizedRemainder = remainder.replace(/\\/g, "/");
      return `${prefix}${driveLetter}:/${normalizedRemainder}`;
    },
  );
}

function canonicalizeEscapedPlaceholders(text) {
  return text
    .replace(/\\<([^>\n]+)\\>/g, (match, placeholderText) => (
      isPlaceholderLiteral(placeholderText) ? `<${placeholderText}>` : match
    ))
    .replace(/\\\[([^\]\n]+)\\\]/g, (match, placeholderText) => (
      isPlaceholderLiteral(placeholderText) ? `[${placeholderText}]` : match
    ));
}

function canonicalizeMarkdownSegment(text) {
  return canonicalizeEscapedPlaceholders(
    canonicalizeEscapedWorkspaceSeparators(
      canonicalizeWindowsAbsolutePaths(
        canonicalizeAutoLinkedFileNames(
          canonicalizeSelfLinks(text),
        ),
      ),
    ),
  );
}

function rewriteOutsideInlineCode(line, transform) {
  let output = "";
  let cursor = 0;

  while (cursor < line.length) {
    const backtickIndex = line.indexOf("`", cursor);
    if (backtickIndex === -1) {
      output += transform(line.slice(cursor));
      break;
    }

    output += transform(line.slice(cursor, backtickIndex));

    let delimiterEnd = backtickIndex;
    while (delimiterEnd < line.length && line[delimiterEnd] === "`") {
      delimiterEnd += 1;
    }

    const delimiter = line.slice(backtickIndex, delimiterEnd);
    const closingIndex = line.indexOf(delimiter, delimiterEnd);
    if (closingIndex === -1) {
      output += line.slice(backtickIndex);
      break;
    }

    output += line.slice(backtickIndex, closingIndex + delimiter.length);
    cursor = closingIndex + delimiter.length;
  }

  return output;
}

export function canonicalizeManagedBodyMarkdown(markdown) {
  const normalized = normalizeMarkdownNewlines(markdown || "");
  const lines = normalized.split("\n");
  const output = [];
  let openFence = null;

  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);

    if (fenceMatch) {
      const fence = fenceMatch[1];
      if (!openFence) {
        openFence = fence;
      } else if (fence[0] === openFence[0] && fence.length >= openFence.length) {
        openFence = null;
      }

      output.push(line);
      continue;
    }

    if (openFence) {
      output.push(line);
      continue;
    }

    output.push(rewriteOutsideInlineCode(line, canonicalizeMarkdownSegment));
  }

  return output.join("\n");
}

export function normalizeEditableBodyMarkdown(markdown) {
  const normalized = canonicalizeManagedBodyMarkdown(markdown || "");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

export function validatePageMarkdownResponse(response, targetPath) {
  if (response.truncated) {
    throw new Error(`Page markdown for "${targetPath}" is truncated and cannot be synced safely.`);
  }

  if (Array.isArray(response.unknown_block_ids) && response.unknown_block_ids.length > 0) {
    throw new Error(
      `Page markdown for "${targetPath}" includes unsupported blocks: ${response.unknown_block_ids.join(", ")}`,
    );
  }
}

export function splitManagedPageMarkdown(markdown) {
  const normalized = normalizeMarkdownNewlines(markdown);
  const dividerMatch = /\n---\n/.exec(normalized);

  if (!dividerMatch || dividerMatch.index === undefined) {
    throw new Error("Managed page markdown is missing the standard header divider.");
  }

  const dividerStart = dividerMatch.index;
  const dividerText = dividerMatch[0];
  const headerMarkdown = normalized.slice(0, dividerStart) + dividerText;
  const bodyMarkdown = normalized.slice(dividerStart + dividerText.length);

  return {
    headerMarkdown,
    bodyMarkdown: normalizeEditableBodyMarkdown(bodyMarkdown),
  };
}

export function splitManagedPageMarkdownIfPresent(markdown) {
  try {
    return splitManagedPageMarkdown(markdown);
  } catch (error) {
    if (error instanceof Error && error.message.includes("standard header divider")) {
      return null;
    }
    throw error;
  }
}

export function escapeManagedHeaderText(text) {
  return text.replaceAll("\\", "\\\\").replaceAll(">", "\\>");
}

export function rewriteManagedHeaderMarkdown(headerMarkdown, canonicalPath, timestamp) {
  if (!/^Canonical Source:/m.test(headerMarkdown)) {
    throw new Error("Managed page header is missing Canonical Source.");
  }

  if (!/^Last Updated:/m.test(headerMarkdown)) {
    throw new Error("Managed page header is missing Last Updated.");
  }

  return headerMarkdown
    .replace(/^Canonical Source:.*$/m, `Canonical Source: ${escapeManagedHeaderText(canonicalPath)}`)
    .replace(/^Last Updated:.*$/m, `Last Updated: ${timestamp}`);
}

export function buildManagedPageMarkdown({ headerMarkdown, bodyMarkdown, canonicalPath, timestamp }) {
  return rewriteManagedHeaderMarkdown(headerMarkdown, canonicalPath, timestamp)
    + normalizeEditableBodyMarkdown(bodyMarkdown);
}

export function diffMarkdownText(currentMarkdown, nextMarkdown, { spawnSyncImpl = spawnSync } = {}) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "snpm-page-diff-"));
  const currentPath = path.join(tempDir, "current.md");
  const nextPath = path.join(tempDir, "next.md");

  try {
    writeFileSync(currentPath, normalizeMarkdownNewlines(currentMarkdown), "utf8");
    writeFileSync(nextPath, normalizeMarkdownNewlines(nextMarkdown), "utf8");

    const result = spawnSyncImpl(
      "git",
      ["diff", "--no-index", "--no-color", "--", currentPath, nextPath],
      {
        encoding: "utf8",
      },
    );

    if (result.error) {
      throw result.error;
    }

    if (![0, 1].includes(result.status ?? 0)) {
      const stderr = result.stderr?.trim();
      throw new Error(stderr || `git diff failed with status ${result.status}.`);
    }

    return normalizeMarkdownNewlines(result.stdout || "");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function diffMarkdownBodies(currentBodyMarkdown, fileBodyMarkdown, options) {
  return diffMarkdownText(
    normalizeEditableBodyMarkdown(currentBodyMarkdown),
    normalizeEditableBodyMarkdown(fileBodyMarkdown),
    options,
  );
}

export async function fetchPageMarkdown(pageId, targetPath, client) {
  const response = await client.request("GET", `pages/${pageId}/markdown`);
  validatePageMarkdownResponse(response, targetPath);
  return response.markdown;
}

export async function replacePageMarkdown(pageId, targetPath, markdown, client) {
  const response = await client.request("PATCH", `pages/${pageId}/markdown`, {
    type: "replace_content",
    replace_content: {
      new_str: normalizeMarkdownNewlines(markdown),
    },
  });
  validatePageMarkdownResponse(response, targetPath);
  return response;
}

export async function loadResolvedPageContext({
  target,
  config,
  projectTokenEnv,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const auth = syncClient
    ? { authMode: projectTokenEnv ? "project-token" : "workspace-token", client: syncClient }
    : (() => {
      const selected = choosePageSyncAuth(projectTokenEnv, {
        getProjectTokenImpl,
        getWorkspaceTokenImpl,
      });
      return {
        authMode: selected.authMode,
        client: makeNotionClientImpl(selected.token, config.notionVersion),
      };
    })();

  const initialLiveMetadata = await fetchLivePageMetadata(target.pageId, auth.client);
  const markdown = await fetchPageMarkdown(target.pageId, target.targetPath, auth.client);
  const liveMetadata = assertLivePageMetadataStable({
    before: initialLiveMetadata,
    after: await fetchLivePageMetadata(target.pageId, auth.client),
    targetPath: target.targetPath,
  });
  const managedParts = splitManagedPageMarkdown(markdown);

  return {
    ...target,
    authMode: auth.authMode,
    client: auth.client,
    markdown,
    liveMetadata,
    managedParts,
    headerMarkdown: managedParts.headerMarkdown,
    bodyMarkdown: managedParts.bodyMarkdown,
  };
}

async function loadApprovedPlanningPageContext({
  projectName,
  pagePath,
  config,
  resolveClient,
  makeNotionClientImpl = makeNotionClient,
  ...options
}) {
  const workspaceClient = resolveClient
    || makeNotionClientImpl(
      options.getWorkspaceTokenImpl ? options.getWorkspaceTokenImpl() : getWorkspaceToken(),
      config.notionVersion,
    );
  const target = await resolveApprovedPlanningPageTarget(projectName, pagePath, config, workspaceClient);
  return loadResolvedPageContext({
    target,
    config,
    makeNotionClientImpl,
    ...options,
  });
}

export async function pullApprovedPageBody(options) {
  const context = await loadApprovedPlanningPageContext(options);
  const metadata = buildPullPageMetadata({
    commandFamily: "page",
    workspaceName: options.workspaceName || "infrastructure-hq",
    targetPath: context.targetPath,
    pageId: context.pageId,
    projectId: context.projectId,
    authMode: context.authMode,
    lastEditedTime: context.liveMetadata.lastEditedTime,
  });
  return {
    pageId: context.pageId,
    projectId: context.projectId,
    targetPath: context.targetPath,
    authMode: context.authMode,
    bodyMarkdown: context.bodyMarkdown,
    liveMetadata: context.liveMetadata,
    metadata,
  };
}

export async function diffApprovedPageBody({
  fileBodyMarkdown,
  ...options
}) {
  const context = await loadApprovedPlanningPageContext(options);
  const normalizedFileBody = normalizeEditableBodyMarkdown(fileBodyMarkdown);
  const diff = diffMarkdownBodies(context.bodyMarkdown, normalizedFileBody);

  return {
    pageId: context.pageId,
    projectId: context.projectId,
    targetPath: context.targetPath,
    authMode: context.authMode,
    authScope: "project-or-workspace",
    managedState: "managed",
    preserveChildren: true,
    normalizationsApplied: MANAGED_BODY_NORMALIZATIONS.slice(),
    warnings: [],
    currentBodyMarkdown: context.bodyMarkdown,
    nextBodyMarkdown: normalizedFileBody,
    hasDiff: diff.length > 0,
    diff,
  };
}

export async function pushApprovedPageBody({
  fileBodyMarkdown,
  apply = false,
  metadata,
  timestamp = nowTimestamp(),
  ...options
}) {
  const context = await loadApprovedPlanningPageContext(options);
  const normalizedFileBody = normalizeEditableBodyMarkdown(fileBodyMarkdown);
  const diff = diffMarkdownBodies(context.bodyMarkdown, normalizedFileBody);

  if (!apply || diff.length === 0) {
    return {
      pageId: context.pageId,
      projectId: context.projectId,
      targetPath: context.targetPath,
      authMode: context.authMode,
      authScope: "project-or-workspace",
      managedState: "managed",
      preserveChildren: true,
      normalizationsApplied: MANAGED_BODY_NORMALIZATIONS.slice(),
      warnings: [],
      currentBodyMarkdown: context.bodyMarkdown,
      nextBodyMarkdown: normalizedFileBody,
      hasDiff: diff.length > 0,
      diff,
      applied: false,
      timestamp: null,
    };
  }

  const validatedMetadata = await assertPullPageMetadataFreshFromNotion({
    metadata,
    client: context.client,
    commandFamily: "page",
    workspaceName: options.workspaceName || "infrastructure-hq",
    targetPath: context.targetPath,
    pageId: context.pageId,
    projectId: context.projectId,
  });

  const replacementMarkdown = buildManagedPageMarkdown({
    headerMarkdown: context.headerMarkdown,
    bodyMarkdown: normalizedFileBody,
    canonicalPath: context.targetPath,
    timestamp,
  });

  await replacePageMarkdown(context.pageId, context.targetPath, replacementMarkdown, context.client);

  return {
    pageId: context.pageId,
    projectId: context.projectId,
    targetPath: context.targetPath,
    authMode: context.authMode,
    authScope: "project-or-workspace",
    managedState: "managed",
    preserveChildren: true,
    normalizationsApplied: MANAGED_BODY_NORMALIZATIONS.slice(),
    warnings: [],
    metadata: validatedMetadata,
    currentBodyMarkdown: context.bodyMarkdown,
    nextBodyMarkdown: normalizedFileBody,
    hasDiff: true,
    diff,
    applied: true,
    timestamp,
  };
}
