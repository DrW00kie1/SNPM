import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { nowTimestamp } from "../notion/env.mjs";

export const SNPM_JOURNAL_PATH_ENV = "SNPM_JOURNAL_PATH";
export const MUTATION_JOURNAL_SCHEMA = "snpm.mutation-journal.v1";

export const MUTATION_JOURNAL_INTEGRATION_CONTRACT = {
  wrapper: "withMutationJournal(result, { command, surface })",
  behavior: "Only record applied mutations. Preserve the original successful result when journal writing fails.",
  successShape: "Attach result.journal = { path } after a successful journal append.",
  failureShape: "Append formatMutationJournalWarning(error) to result.warnings without changing result.applied.",
};

const REVISION_METADATA_KEYS = new Set([
  "schema",
  "commandFamily",
  "workspaceName",
  "targetPath",
  "pageId",
  "projectId",
  "authMode",
  "lastEditedTime",
  "pulledAt",
]);

function defaultLocalRoot(env = process.env) {
  return env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
}

export function getMutationJournalPath({ env = process.env } = {}) {
  const override = env[SNPM_JOURNAL_PATH_ENV];
  if (override && override.trim()) {
    return override.trim();
  }

  return path.join(defaultLocalRoot(env), "SNPM", "journal.ndjson");
}

export function summarizeDiff(diff) {
  const text = typeof diff === "string" ? diff : "";
  const hash = createHash("sha256").update(text).digest("hex");
  const lines = text.split("\n");
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      additions += 1;
    } else if (line.startsWith("-")) {
      deletions += 1;
    }
  }

  return {
    hash,
    additions,
    deletions,
  };
}

function pickStringField(source, fieldName) {
  return typeof source?.[fieldName] === "string" && source[fieldName].trim() !== ""
    ? source[fieldName]
    : null;
}

export function summarizeRevisionMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const summary = {};
  for (const key of REVISION_METADATA_KEYS) {
    if (typeof metadata[key] === "string" && metadata[key].trim() !== "") {
      summary[key] = metadata[key];
    }
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

export function formatMutationJournalWarning(error) {
  return `Mutation journal write failed: ${error instanceof Error ? error.message : String(error)}`;
}

export function buildMutationJournalEntry({
  command,
  surface,
  result,
  timestamp = nowTimestamp(),
}) {
  const revisionMetadata = summarizeRevisionMetadata(result?.metadata || result?.pullMetadata);

  return {
    schema: MUTATION_JOURNAL_SCHEMA,
    command,
    surface,
    targetPath: pickStringField(result, "targetPath") || pickStringField(revisionMetadata, "targetPath"),
    pageId: pickStringField(result, "pageId") || pickStringField(revisionMetadata, "pageId"),
    authMode: pickStringField(result, "authMode") || pickStringField(revisionMetadata, "authMode"),
    timestamp: pickStringField(result, "timestamp") || timestamp,
    revision: revisionMetadata,
    diff: summarizeDiff(result?.diff),
  };
}

export function appendMutationJournalEntry(entry, {
  journalPath = getMutationJournalPath(),
  appendFileSyncImpl = appendFileSync,
  mkdirSyncImpl = mkdirSync,
} = {}) {
  mkdirSyncImpl(path.dirname(journalPath), { recursive: true });
  appendFileSyncImpl(journalPath, `${JSON.stringify(entry)}\n`, "utf8");
  return journalPath;
}

export function recordMutationJournalEntry(args, options = {}) {
  const entry = buildMutationJournalEntry(args);
  const journalPath = appendMutationJournalEntry(entry, options);
  return {
    journalPath,
    entry,
  };
}

export function tryRecordMutationJournalEntry(args, options = {}) {
  try {
    const recorded = recordMutationJournalEntry(args, options);
    return {
      ok: true,
      ...recorded,
    };
  } catch (error) {
    return {
      ok: false,
      entry: buildMutationJournalEntry(args),
      journalPath: options.journalPath || getMutationJournalPath(options),
      warning: formatMutationJournalWarning(error),
      error,
    };
  }
}

function normalizeLimit(limit) {
  const parsed = typeof limit === "number" ? limit : Number.parseInt(limit, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 20;
}

export function readMutationJournalEntries({
  journalPath = getMutationJournalPath(),
  limit = 20,
  readFileSyncImpl = readFileSync,
} = {}) {
  let raw;
  try {
    raw = readFileSyncImpl(journalPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const entries = raw
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });

  return entries.slice(-normalizeLimit(limit));
}
