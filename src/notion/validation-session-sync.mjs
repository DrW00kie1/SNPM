import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { diffMarkdownText, normalizeMarkdownNewlines } from "./page-markdown.mjs";
import {
  diffValidationSessionFile,
  pullValidationSessionFile,
  pushValidationSessionFile,
} from "./validation-sessions.mjs";

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function buildEntryBase(entry) {
  return {
    kind: entry.kind,
    title: entry.title,
    file: entry.file,
    absoluteFilePath: entry.absoluteFilePath,
  };
}

function buildTopLevelFailure(entry, error) {
  return `${entry.kind} "${entry.title}" (${entry.file}): ${toErrorMessage(error)}`;
}

function readLocalFile(absoluteFilePath, { readFileSyncImpl = readFileSync } = {}) {
  try {
    return {
      exists: true,
      markdown: normalizeMarkdownNewlines(readFileSyncImpl(absoluteFilePath, "utf8")),
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        exists: false,
        markdown: "",
      };
    }

    throw error;
  }
}

function buildSummary({ command, manifest, authMode, entries, failures }) {
  const driftCount = entries.filter((entry) => entry.hasDiff).length;
  const appliedCount = entries.filter((entry) => entry.applied).length;

  return {
    command,
    manifestPath: manifest.manifestPath,
    projectName: manifest.projectName,
    workspaceName: manifest.workspaceName,
    authMode,
    hasDiff: driftCount > 0,
    driftCount,
    appliedCount,
    failures,
    entries,
  };
}

async function checkEntry({
  config,
  entry,
  manifest,
  projectTokenEnv,
  diffValidationSessionFileImpl = diffValidationSessionFile,
  pullValidationSessionFileImpl = pullValidationSessionFile,
  readFileSyncImpl = readFileSync,
}) {
  const localFile = readLocalFile(entry.absoluteFilePath, { readFileSyncImpl });

  if (!localFile.exists) {
    const pulled = await pullValidationSessionFileImpl({
      config,
      projectName: manifest.projectName,
      projectTokenEnv,
      title: entry.title,
    });
    const diff = diffMarkdownText("", pulled.fileMarkdown);

    return {
      ...buildEntryBase(entry),
      targetPath: pulled.targetPath,
      status: "missing-local-file",
      hasDiff: true,
      diff,
      applied: false,
    };
  }

  const result = await diffValidationSessionFileImpl({
    config,
    fileMarkdown: localFile.markdown,
    projectName: manifest.projectName,
    projectTokenEnv,
    title: entry.title,
  });

  return {
    ...buildEntryBase(entry),
    targetPath: result.targetPath,
    status: result.hasDiff ? "drift" : "in-sync",
    hasDiff: result.hasDiff,
    diff: result.diff,
    applied: false,
  };
}

async function pullEntry({
  apply,
  config,
  entry,
  manifest,
  projectTokenEnv,
  pullValidationSessionFileImpl = pullValidationSessionFile,
  readFileSyncImpl = readFileSync,
  writeFileSyncImpl = writeFileSync,
  mkdirSyncImpl = mkdirSync,
}) {
  const pulled = await pullValidationSessionFileImpl({
    config,
    projectName: manifest.projectName,
    projectTokenEnv,
    title: entry.title,
  });
  const localFile = readLocalFile(entry.absoluteFilePath, { readFileSyncImpl });
  const diff = diffMarkdownText(localFile.markdown, pulled.fileMarkdown);
  const hasDiff = diff.length > 0;
  let applied = false;
  let status = "in-sync";

  if (hasDiff) {
    status = localFile.exists ? "pull-preview" : "pull-create-preview";
  }

  if (apply && hasDiff) {
    mkdirSyncImpl(path.dirname(entry.absoluteFilePath), { recursive: true });
    writeFileSyncImpl(entry.absoluteFilePath, pulled.fileMarkdown, "utf8");
    applied = true;
    status = localFile.exists ? "pulled" : "pulled-created";
  }

  return {
    ...buildEntryBase(entry),
    targetPath: pulled.targetPath,
    status,
    hasDiff,
    diff,
    applied,
  };
}

async function pushEntry({
  apply,
  config,
  entry,
  manifest,
  projectTokenEnv,
  pushValidationSessionFileImpl = pushValidationSessionFile,
  readFileSyncImpl = readFileSync,
}) {
  const localFile = readLocalFile(entry.absoluteFilePath, { readFileSyncImpl });
  if (!localFile.exists) {
    throw new Error(`Local sync file "${entry.file}" does not exist. Run "sync pull --apply" first.`);
  }

  const result = await pushValidationSessionFileImpl({
    apply,
    config,
    fileMarkdown: localFile.markdown,
    projectName: manifest.projectName,
    projectTokenEnv,
    title: entry.title,
  });

  return {
    ...buildEntryBase(entry),
    targetPath: result.targetPath,
    status: result.applied ? "pushed" : (result.hasDiff ? "push-preview" : "in-sync"),
    hasDiff: result.hasDiff,
    diff: result.diff,
    applied: result.applied,
  };
}

async function processEntries(entries, processEntry) {
  const results = [];
  const failures = [];

  for (const entry of entries) {
    try {
      results.push(await processEntry(entry));
    } catch (error) {
      results.push({
        ...buildEntryBase(entry),
        targetPath: null,
        status: "error",
        hasDiff: false,
        diff: "",
        applied: false,
        failure: toErrorMessage(error),
      });
      failures.push(buildTopLevelFailure(entry, error));
    }
  }

  return { results, failures };
}

export async function checkValidationSessionSyncManifest({
  config,
  manifest,
  projectTokenEnv,
  diffValidationSessionFileImpl = diffValidationSessionFile,
  pullValidationSessionFileImpl = pullValidationSessionFile,
  readFileSyncImpl = readFileSync,
}) {
  const { results, failures } = await processEntries(
    manifest.entries,
    (entry) => checkEntry({
      config,
      entry,
      manifest,
      projectTokenEnv,
      diffValidationSessionFileImpl,
      pullValidationSessionFileImpl,
      readFileSyncImpl,
    }),
  );

  return buildSummary({
    command: "sync-check",
    manifest,
    authMode: projectTokenEnv ? "project-token" : "workspace-token",
    entries: results,
    failures,
  });
}

export async function pullValidationSessionSyncManifest({
  apply = false,
  config,
  manifest,
  projectTokenEnv,
  pullValidationSessionFileImpl = pullValidationSessionFile,
  readFileSyncImpl = readFileSync,
  writeFileSyncImpl = writeFileSync,
  mkdirSyncImpl = mkdirSync,
}) {
  const { results, failures } = await processEntries(
    manifest.entries,
    (entry) => pullEntry({
      apply,
      config,
      entry,
      manifest,
      projectTokenEnv,
      pullValidationSessionFileImpl,
      readFileSyncImpl,
      writeFileSyncImpl,
      mkdirSyncImpl,
    }),
  );

  return buildSummary({
    command: "sync-pull",
    manifest,
    authMode: projectTokenEnv ? "project-token" : "workspace-token",
    entries: results,
    failures,
  });
}

export async function pushValidationSessionSyncManifest({
  apply = false,
  config,
  manifest,
  projectTokenEnv,
  pushValidationSessionFileImpl = pushValidationSessionFile,
  readFileSyncImpl = readFileSync,
}) {
  const { results, failures } = await processEntries(
    manifest.entries,
    (entry) => pushEntry({
      apply,
      config,
      entry,
      manifest,
      projectTokenEnv,
      pushValidationSessionFileImpl,
      readFileSyncImpl,
    }),
  );

  return buildSummary({
    command: "sync-push",
    manifest,
    authMode: projectTokenEnv ? "project-token" : "workspace-token",
    entries: results,
    failures,
  });
}
