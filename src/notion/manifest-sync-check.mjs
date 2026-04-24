import { readFileSync } from "node:fs";

import { diffDocBody, pullDocBody } from "./doc-pages.mjs";
import {
  diffApprovedPageBody,
  diffMarkdownText,
  normalizeMarkdownNewlines,
  pullApprovedPageBody,
} from "./page-markdown.mjs";
import { diffRunbookBody, pullRunbookBody } from "./project-pages.mjs";
import {
  diffValidationSessionFile,
  pullValidationSessionFile,
} from "./validation-sessions.mjs";
import {
  buildManifestV2CheckRemoteFailureDiagnostic,
  buildManifestV2LocalFileFailureDiagnostic,
  buildManifestV2PreflightFailureDiagnostic,
} from "./manifest-sync-diagnostics.mjs";
import { resolveManifestSyncSelection } from "./manifest-selection.mjs";

export const MANIFEST_V2_SYNC_CHECK_KINDS = Object.freeze([
  "planning-page",
  "project-doc",
  "template-doc",
  "workspace-doc",
  "runbook",
  "validation-session",
]);

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingLocalFileError(error) {
  return error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

function entryLocalFilePath(entry) {
  return entry.absoluteFilePath || entry.file;
}

function projectNameForEntry(entry, manifest) {
  return entry.projectName || manifest.projectName;
}

function docProjectNameForEntry(entry, manifest) {
  if (entry.kind === "project-doc") {
    return projectNameForEntry(entry, manifest);
  }

  return entry.projectName || undefined;
}

export function targetForManifestV2SyncEntry(entry) {
  const target = entry.target || entry.pagePath || entry.docPath || entry.title;
  return typeof target === "string" ? target : "";
}

function buildEntryBase(entry) {
  return {
    kind: entry.kind,
    target: targetForManifestV2SyncEntry(entry),
    file: entry.file,
  };
}

function buildTopLevelFailure(entry, error) {
  const target = targetForManifestV2SyncEntry(entry);
  return `${entry.kind} "${target}" (${entry.file}): ${toErrorMessage(error)}`;
}

function buildCheckFailureDiagnostic(entry, error, { phase = "check", targetPath } = {}) {
  if (error && typeof error === "object" && "code" in error) {
    return buildManifestV2LocalFileFailureDiagnostic({
      command: "sync-check",
      entry,
      error,
      state: { phase },
      targetPath,
    });
  }

  if (/Unsupported manifest v2 sync check kind|missing (diffLocal|readRemote)|must return/i.test(toErrorMessage(error))) {
    return buildManifestV2PreflightFailureDiagnostic({
      command: "sync-check",
      entry,
      error,
      state: { phase },
      targetPath,
    });
  }

  return buildManifestV2CheckRemoteFailureDiagnostic({
    entry,
    error,
    state: { phase },
    targetPath,
  });
}

function readLocalMarkdown(entry, { readFileSyncImpl = readFileSync } = {}) {
  const filePath = entryLocalFilePath(entry);
  if (!filePath) {
    throw new Error(`Manifest ${entry.kind} entry "${targetForManifestV2SyncEntry(entry)}" is missing an absolute file path.`);
  }

  try {
    return {
      exists: true,
      markdown: normalizeMarkdownNewlines(readFileSyncImpl(filePath, "utf8")),
    };
  } catch (error) {
    if (isMissingLocalFileError(error)) {
      return {
        exists: false,
        markdown: "",
      };
    }

    throw error;
  }
}

function remoteMarkdownFromReadResult(entry, result) {
  if (result && typeof result.markdown === "string") {
    return result.markdown;
  }

  if (result && typeof result.bodyMarkdown === "string") {
    return result.bodyMarkdown;
  }

  if (result && typeof result.fileMarkdown === "string") {
    return result.fileMarkdown;
  }

  throw new Error(`${entry.kind} adapter readRemote must return markdown, bodyMarkdown, or fileMarkdown.`);
}

function buildReadRemoteResult(result, markdown) {
  const remote = {
    targetPath: result.targetPath,
    markdown,
  };

  for (const field of ["pageId", "projectId", "authMode", "authScope", "liveMetadata", "metadata"]) {
    if (Object.hasOwn(result, field)) {
      remote[field] = result[field];
    }
  }

  return remote;
}

function normalizeDiffResult(result) {
  const diff = typeof result?.diff === "string" ? result.diff : "";
  const hasDiff = typeof result?.hasDiff === "boolean" ? result.hasDiff : diff.length > 0;

  return {
    targetPath: result?.targetPath || null,
    status: hasDiff ? "drift" : "in-sync",
    hasDiff,
    diff,
  };
}

function buildSummary({ manifest, authMode, entries, failures, selectionMetadata }) {
  const driftCount = entries.filter((entry) => entry.hasDiff).length;

  const summary = {
    command: "sync-check",
    manifestPath: manifest.manifestPath,
    projectName: manifest.projectName,
    workspaceName: manifest.workspaceName,
    authMode,
    hasDiff: driftCount > 0,
    driftCount,
    appliedCount: 0,
    failures,
    entries,
  };

  const diagnostics = entries.flatMap((entry) => Array.isArray(entry.diagnostics) ? entry.diagnostics : []);
  if (diagnostics.length > 0) {
    summary.diagnostics = diagnostics;
  }

  if (selectionMetadata) {
    Object.assign(summary, selectionMetadata);
  }

  return summary;
}

function requireAdapter(entry, adapters) {
  const adapter = adapters?.[entry.kind];
  if (!adapter) {
    throw new Error(`Unsupported manifest v2 sync check kind "${entry.kind}".`);
  }

  if (typeof adapter.diffLocal !== "function") {
    throw new Error(`Manifest v2 sync check adapter "${entry.kind}" is missing diffLocal.`);
  }

  if (typeof adapter.readRemote !== "function") {
    throw new Error(`Manifest v2 sync check adapter "${entry.kind}" is missing readRemote.`);
  }

  return adapter;
}

async function checkEntry({
  adapter,
  config,
  diffMarkdownTextImpl,
  entry,
  manifest,
  projectTokenEnv,
  readFileSyncImpl,
}) {
  const localFile = readLocalMarkdown(entry, { readFileSyncImpl });
  const adapterInput = {
    config,
    entry,
    manifest,
    projectTokenEnv,
  };

  if (!localFile.exists) {
    const remote = await adapter.readRemote(adapterInput);
    const remoteMarkdown = remoteMarkdownFromReadResult(entry, remote);
    return {
      ...buildEntryBase(entry),
      targetPath: remote.targetPath || null,
      status: "missing-local-file",
      hasDiff: true,
      diff: diffMarkdownTextImpl("", remoteMarkdown),
      applied: false,
    };
  }

  const result = normalizeDiffResult(await adapter.diffLocal({
    ...adapterInput,
    localMarkdown: localFile.markdown,
  }));

  return {
    ...buildEntryBase(entry),
    targetPath: result.targetPath,
    status: result.status,
    hasDiff: result.hasDiff,
    diff: result.diff,
    applied: false,
  };
}

export function createManifestV2SyncCheckAdapters({
  diffApprovedPageBodyImpl = diffApprovedPageBody,
  pullApprovedPageBodyImpl = pullApprovedPageBody,
  diffDocBodyImpl = diffDocBody,
  pullDocBodyImpl = pullDocBody,
  diffRunbookBodyImpl = diffRunbookBody,
  pullRunbookBodyImpl = pullRunbookBody,
  diffValidationSessionFileImpl = diffValidationSessionFile,
  pullValidationSessionFileImpl = pullValidationSessionFile,
} = {}) {
  return {
    "planning-page": {
      async diffLocal({ config, entry, localMarkdown, manifest, projectTokenEnv }) {
        return diffApprovedPageBodyImpl({
          config,
          fileBodyMarkdown: localMarkdown,
          pagePath: entry.pagePath,
          projectName: projectNameForEntry(entry, manifest),
          projectTokenEnv,
          workspaceName: manifest.workspaceName,
        });
      },
      async readRemote({ config, entry, manifest, projectTokenEnv }) {
        const result = await pullApprovedPageBodyImpl({
          config,
          pagePath: entry.pagePath,
          projectName: projectNameForEntry(entry, manifest),
          projectTokenEnv,
          workspaceName: manifest.workspaceName,
        });

        return buildReadRemoteResult(result, result.bodyMarkdown);
      },
    },
    "project-doc": {
      async diffLocal({ config, entry, localMarkdown, manifest, projectTokenEnv }) {
        return diffDocBodyImpl({
          config,
          docPath: entry.docPath,
          fileBodyMarkdown: localMarkdown,
          projectName: docProjectNameForEntry(entry, manifest),
          projectTokenEnv,
          workspaceName: manifest.workspaceName,
        });
      },
      async readRemote({ config, entry, manifest, projectTokenEnv }) {
        const result = await pullDocBodyImpl({
          config,
          docPath: entry.docPath,
          projectName: docProjectNameForEntry(entry, manifest),
          projectTokenEnv,
          workspaceName: manifest.workspaceName,
        });

        return buildReadRemoteResult(result, result.bodyMarkdown);
      },
    },
    "template-doc": {
      async diffLocal({ config, entry, localMarkdown, manifest, projectTokenEnv }) {
        return diffDocBodyImpl({
          config,
          docPath: entry.docPath,
          fileBodyMarkdown: localMarkdown,
          projectName: docProjectNameForEntry(entry, manifest),
          projectTokenEnv,
          workspaceName: manifest.workspaceName,
        });
      },
      async readRemote({ config, entry, manifest, projectTokenEnv }) {
        const result = await pullDocBodyImpl({
          config,
          docPath: entry.docPath,
          projectName: docProjectNameForEntry(entry, manifest),
          projectTokenEnv,
          workspaceName: manifest.workspaceName,
        });

        return buildReadRemoteResult(result, result.bodyMarkdown);
      },
    },
    "workspace-doc": {
      async diffLocal({ config, entry, localMarkdown, manifest, projectTokenEnv }) {
        return diffDocBodyImpl({
          config,
          docPath: entry.docPath,
          fileBodyMarkdown: localMarkdown,
          projectName: docProjectNameForEntry(entry, manifest),
          projectTokenEnv,
          workspaceName: manifest.workspaceName,
        });
      },
      async readRemote({ config, entry, manifest, projectTokenEnv }) {
        const result = await pullDocBodyImpl({
          config,
          docPath: entry.docPath,
          projectName: docProjectNameForEntry(entry, manifest),
          projectTokenEnv,
          workspaceName: manifest.workspaceName,
        });

        return buildReadRemoteResult(result, result.bodyMarkdown);
      },
    },
    runbook: {
      async diffLocal({ config, entry, localMarkdown, manifest, projectTokenEnv }) {
        return diffRunbookBodyImpl({
          commandFamily: "runbook",
          config,
          fileBodyMarkdown: localMarkdown,
          projectName: projectNameForEntry(entry, manifest),
          projectTokenEnv,
          title: entry.title,
          workspaceName: manifest.workspaceName,
        });
      },
      async readRemote({ config, entry, manifest, projectTokenEnv }) {
        const result = await pullRunbookBodyImpl({
          commandFamily: "runbook",
          config,
          projectName: projectNameForEntry(entry, manifest),
          projectTokenEnv,
          title: entry.title,
          workspaceName: manifest.workspaceName,
        });

        return buildReadRemoteResult(result, result.bodyMarkdown);
      },
    },
    "validation-session": {
      async diffLocal({ config, entry, localMarkdown, manifest, projectTokenEnv }) {
        return diffValidationSessionFileImpl({
          config,
          fileMarkdown: localMarkdown,
          projectName: projectNameForEntry(entry, manifest),
          projectTokenEnv,
          title: entry.title,
          workspaceName: manifest.workspaceName,
        });
      },
      async readRemote({ config, entry, manifest, projectTokenEnv }) {
        const result = await pullValidationSessionFileImpl({
          config,
          projectName: projectNameForEntry(entry, manifest),
          projectTokenEnv,
          title: entry.title,
          workspaceName: manifest.workspaceName,
        });

        return buildReadRemoteResult(result, result.fileMarkdown);
      },
    },
  };
}

export async function checkManifestV2SyncManifest({
  adapters = createManifestV2SyncCheckAdapters(),
  config,
  diffMarkdownTextImpl = diffMarkdownText,
  manifest,
  projectTokenEnv,
  readFileSyncImpl = readFileSync,
  selectedEntries,
  selectionOptions,
}) {
  const selection = resolveManifestSyncSelection({
    buildSkippedEntry: buildEntryBase,
    manifest,
    selectedEntries,
    selectionOptions,
  });
  const entries = [];
  const failures = [];

  for (const entry of selection.entries) {
    try {
      const adapter = requireAdapter(entry, adapters);
      entries.push(await checkEntry({
        adapter,
        config,
        diffMarkdownTextImpl,
        entry,
        manifest,
        projectTokenEnv,
        readFileSyncImpl,
      }));
    } catch (error) {
      const diagnostic = buildCheckFailureDiagnostic(entry, error);
      entries.push({
        ...buildEntryBase(entry),
        targetPath: null,
        status: "error",
        hasDiff: false,
        diff: "",
        applied: false,
        failure: toErrorMessage(error),
        diagnostics: [diagnostic],
      });
      failures.push(buildTopLevelFailure(entry, error));
    }
  }

  return buildSummary({
    manifest,
    authMode: projectTokenEnv ? "project-token" : "workspace-token",
    entries,
    failures,
    selectionMetadata: selection.metadata,
  });
}
