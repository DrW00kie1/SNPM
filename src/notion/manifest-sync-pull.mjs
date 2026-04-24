import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { pullDocBody } from "./doc-pages.mjs";
import {
  createManifestV2SyncCheckAdapters,
  targetForManifestV2SyncEntry,
} from "./manifest-sync-check.mjs";
import {
  diffMarkdownText,
  normalizeMarkdownNewlines,
  pullApprovedPageBody,
} from "./page-markdown.mjs";
import { pullRunbookBody } from "./project-pages.mjs";
import { buildPullPageMetadata } from "./page-metadata.mjs";
import { pullValidationSessionFile } from "./validation-sessions.mjs";
import { selectManifestEntries } from "./manifest-selection.mjs";

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingLocalFileError(error) {
  return error && typeof error === "object" && "code" in error && error.code === "ENOENT";
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

function entryFilePath(entry, manifest) {
  const candidate = entry.absoluteFilePath
    || (entry.file && manifest.manifestDir ? path.resolve(manifest.manifestDir, entry.file) : entry.file);

  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new Error(`Manifest ${entry.kind} entry "${targetForManifestV2SyncEntry(entry)}" is missing an absolute file path.`);
  }

  return path.resolve(candidate);
}

function entryMetadataPath(filePath) {
  return `${filePath}.snpm-meta.json`;
}

function buildEntryDescriptor(entry, manifest) {
  const filePath = entryFilePath(entry, manifest);

  return {
    entry,
    filePath,
    metadataPath: entryMetadataPath(filePath),
  };
}

function buildEntryBase(descriptor) {
  return {
    kind: descriptor.entry.kind,
    target: targetForManifestV2SyncEntry(descriptor.entry),
    file: descriptor.entry.file,
    targetPath: null,
    metadataPath: descriptor.metadataPath || null,
  };
}

function buildSkippedEntry(entry, manifest) {
  const descriptor = buildEntryDescriptor(entry, manifest);
  return buildEntryBase(descriptor);
}

function hasSelectionInput({ selectedEntries, selectionOptions }) {
  return selectedEntries !== undefined || selectionOptions !== undefined;
}

function selectorValuesFromOptions(selectionOptions) {
  if (Array.isArray(selectionOptions)) {
    return selectionOptions;
  }

  if (selectionOptions && typeof selectionOptions === "object") {
    return selectionOptions.selectors || selectionOptions.selectorValues || [];
  }

  return [];
}

function resolveSyncSelection({ manifest, selectedEntries, selectionOptions }) {
  if (!hasSelectionInput({ selectedEntries, selectionOptions })) {
    return {
      entries: manifest.entries,
      metadata: null,
    };
  }

  const resolved = selectedEntries !== undefined
    ? {
      selectedEntries,
      skippedEntries: manifest.entries.filter((entry) => !selectedEntries.includes(entry)),
      selectedCount: selectedEntries.length,
      skippedCount: manifest.entries.length - selectedEntries.length,
      selectorLabels: [],
      selectors: [],
    }
    : selectManifestEntries(manifest, selectorValuesFromOptions(selectionOptions));
  const entries = resolved.selectedEntries || [];
  const skippedEntries = resolved.skippedEntries.map((entry) => buildSkippedEntry(entry, manifest));

  return {
    entries,
    metadata: {
      selection: {
        selectorLabels: resolved.selectorLabels || [],
        selectors: resolved.selectors || [],
      },
      selectedCount: resolved.selectedCount ?? entries.length,
      skippedCount: resolved.skippedCount ?? skippedEntries.length,
      skippedEntries,
    },
  };
}

function buildTopLevelFailure(entry, error) {
  const target = targetForManifestV2SyncEntry(entry);
  return `${entry.kind} "${target}" (${entry.file}): ${toErrorMessage(error)}`;
}

function buildErrorEntry(descriptor, error) {
  return {
    ...buildEntryBase(descriptor),
    status: "error",
    hasDiff: false,
    diff: "",
    applied: false,
    failure: toErrorMessage(error),
  };
}

function readLocalMarkdown(filePath, { readFileSyncImpl = readFileSync } = {}) {
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
    return normalizeMarkdownNewlines(result.markdown);
  }

  if (result && typeof result.bodyMarkdown === "string") {
    return normalizeMarkdownNewlines(result.bodyMarkdown);
  }

  if (result && typeof result.fileMarkdown === "string") {
    return normalizeMarkdownNewlines(result.fileMarkdown);
  }

  throw new Error(`${entry.kind} adapter readRemote must return markdown, bodyMarkdown, or fileMarkdown.`);
}

function commandFamilyForEntry(entry) {
  if (entry.kind === "planning-page") {
    return "page";
  }

  if (entry.kind === "project-doc" || entry.kind === "template-doc" || entry.kind === "workspace-doc") {
    return "doc";
  }

  if (entry.kind === "validation-session") {
    return "validation-session";
  }

  return entry.kind;
}

function metadataFromReadResult({
  entry,
  manifest,
  remote,
  targetPath,
  required = false,
}) {
  if (remote?.metadata) {
    return remote.metadata;
  }

  const lastEditedTime = remote?.liveMetadata?.lastEditedTime
    || remote?.liveMetadata?.last_edited_time
    || remote?.lastEditedTime
    || remote?.last_edited_time;
  if (remote?.pageId && lastEditedTime) {
    return buildPullPageMetadata({
      commandFamily: commandFamilyForEntry(entry),
      workspaceName: manifest.workspaceName,
      targetPath,
      pageId: remote.pageId,
      projectId: remote.projectId || undefined,
      authMode: remote.authMode,
      lastEditedTime,
    });
  }

  if (!required) {
    return null;
  }

  throw new Error(`${entry.kind} adapter readRemote must return metadata, or pageId with live metadata, for pull apply.`);
}

function normalizeDiff(diff) {
  return typeof diff === "string" ? normalizeMarkdownNewlines(diff) : "";
}

function buildPreviewStatus(localExists, hasDiff) {
  if (!hasDiff) {
    return "in-sync";
  }

  return localExists ? "pull-preview" : "pull-create-preview";
}

function buildAppliedStatus(localExists, hasDiff) {
  if (!hasDiff) {
    return "in-sync";
  }

  return localExists ? "pulled" : "pulled-created";
}

function buildSummary({ manifest, authMode, entries, failures, selectionMetadata }) {
  const driftCount = entries.filter((entry) => entry.hasDiff).length;
  const appliedCount = entries.filter((entry) => entry.applied).length;

  const summary = {
    command: "sync-pull",
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

  if (selectionMetadata) {
    Object.assign(summary, selectionMetadata);
  }

  return summary;
}

function requireAdapter(entry, adapters) {
  const adapter = adapters?.[entry.kind];
  if (!adapter) {
    throw new Error(`Unsupported manifest v2 sync pull kind "${entry.kind}".`);
  }

  if (typeof adapter.readRemote !== "function") {
    throw new Error(`Manifest v2 sync pull adapter "${entry.kind}" is missing readRemote.`);
  }

  return adapter;
}

function pathCollisionKey(filePath) {
  return path.resolve(filePath).toLowerCase();
}

function addCollision(collisions, owner, message) {
  if (!collisions.has(owner.index)) {
    collisions.set(owner.index, new Set());
  }

  collisions.get(owner.index).add(message);
}

function findPathCollisions(descriptors) {
  const ownersByPath = new Map();

  for (const [index, descriptor] of descriptors.entries()) {
    for (const [role, filePath] of [["output", descriptor.filePath], ["sidecar", descriptor.metadataPath]]) {
      const key = pathCollisionKey(filePath);
      const owners = ownersByPath.get(key) || [];
      owners.push({
        index,
        role,
        filePath,
        entry: descriptor.entry,
      });
      ownersByPath.set(key, owners);
    }
  }

  const collisions = new Map();
  for (const owners of ownersByPath.values()) {
    if (owners.length < 2) {
      continue;
    }

    const pathLabel = owners[0].filePath;
    const ownerLabels = owners
      .map((owner) => `${owner.role} for ${owner.entry.kind} "${targetForManifestV2SyncEntry(owner.entry)}"`)
      .join(", ");
    const message = `Output/sidecar path collision at "${pathLabel}": ${ownerLabels}.`;

    for (const owner of owners) {
      addCollision(collisions, owner, message);
    }
  }

  return collisions;
}

async function preflightEntry({
  adapter,
  config,
  descriptor,
  diffMarkdownTextImpl,
  manifest,
  projectTokenEnv,
  readFileSyncImpl,
  requireMetadata,
}) {
  const { entry, filePath, metadataPath } = descriptor;
  const remote = await adapter.readRemote({
    config,
    entry,
    manifest,
    projectTokenEnv,
  });
  const remoteMarkdown = remoteMarkdownFromReadResult(entry, remote);
  const targetPath = remote?.targetPath || null;
  const metadata = metadataFromReadResult({
    entry,
    manifest,
    remote,
    targetPath,
    required: requireMetadata,
  });
  const localFile = readLocalMarkdown(filePath, { readFileSyncImpl });
  const diff = normalizeDiff(diffMarkdownTextImpl(localFile.markdown, remoteMarkdown));
  const hasDiff = diff.length > 0;

  return {
    ...buildEntryBase(descriptor),
    targetPath,
    metadataPath,
    status: buildPreviewStatus(localFile.exists, hasDiff),
    hasDiff,
    diff,
    applied: false,
    localExists: localFile.exists,
    remoteMarkdown,
    metadata,
  };
}

function stripPreflightState(entry) {
  const {
    localExists,
    metadata,
    remoteMarkdown,
    ...summaryEntry
  } = entry;

  return summaryEntry;
}

function applyEntryWrites({
  descriptor,
  entry,
  mkdirSyncImpl,
  partialWrites,
  writeFileSyncImpl,
}) {
  if (entry.hasDiff) {
    mkdirSyncImpl(path.dirname(descriptor.filePath), { recursive: true });
    writeFileSyncImpl(descriptor.filePath, entry.remoteMarkdown, "utf8");
    partialWrites.push(descriptor.filePath);
  }

  mkdirSyncImpl(path.dirname(descriptor.metadataPath), { recursive: true });
  writeFileSyncImpl(descriptor.metadataPath, `${JSON.stringify(entry.metadata, null, 2)}\n`, "utf8");
  partialWrites.push(descriptor.metadataPath);

  return {
    ...stripPreflightState(entry),
    status: buildAppliedStatus(entry.localExists, entry.hasDiff),
    applied: true,
  };
}

function buildWriteFailureMessage({ descriptor, error, partialWrites }) {
  const partialLabel = partialWrites.length > 0
    ? partialWrites.join(", ")
    : "none";

  return `Filesystem write failed for ${descriptor.entry.kind} "${targetForManifestV2SyncEntry(descriptor.entry)}": ${toErrorMessage(error)}. Partial local writes: ${partialLabel}.`;
}

function adapterPullKey(kind, args) {
  if (kind === "planning-page") {
    return `page\0${args.workspaceName || ""}\0${args.projectName || ""}\0${args.pagePath || ""}`;
  }

  if (kind === "doc") {
    return `doc\0${args.workspaceName || ""}\0${args.projectName || ""}\0${args.docPath || ""}`;
  }

  return `${kind}\0${args.workspaceName || ""}\0${args.projectName || ""}\0${args.title || ""}`;
}

function entryPullKey(entry, manifest) {
  if (entry.kind === "planning-page") {
    return adapterPullKey(entry.kind, {
      workspaceName: manifest.workspaceName,
      projectName: projectNameForEntry(entry, manifest),
      pagePath: entry.pagePath,
    });
  }

  if (entry.kind === "project-doc" || entry.kind === "template-doc" || entry.kind === "workspace-doc") {
    return adapterPullKey("doc", {
      workspaceName: manifest.workspaceName,
      projectName: docProjectNameForEntry(entry, manifest),
      docPath: entry.docPath,
    });
  }

  return adapterPullKey(entry.kind, {
    workspaceName: manifest.workspaceName,
    projectName: projectNameForEntry(entry, manifest),
    title: entry.title,
  });
}

function mergeCapturedPullResult(remote, captured) {
  if (!captured) {
    return remote;
  }

  return {
    ...remote,
    pageId: captured.pageId ?? remote.pageId,
    projectId: captured.projectId ?? remote.projectId,
    authMode: captured.authMode ?? remote.authMode,
    liveMetadata: captured.liveMetadata ?? remote.liveMetadata,
    metadata: captured.metadata ?? remote.metadata,
  };
}

export function createManifestV2SyncPullAdapters({
  createManifestV2SyncCheckAdaptersImpl = createManifestV2SyncCheckAdapters,
  pullApprovedPageBodyImpl = pullApprovedPageBody,
  pullDocBodyImpl = pullDocBody,
  pullRunbookBodyImpl = pullRunbookBody,
  pullValidationSessionFileImpl = pullValidationSessionFile,
} = {}) {
  const capturedPullResults = new Map();
  const capturePull = (kind, pullImpl) => async (args) => {
    const result = await pullImpl(args);
    capturedPullResults.set(adapterPullKey(kind, args), result);
    return result;
  };

  const checkAdapters = createManifestV2SyncCheckAdaptersImpl({
    pullApprovedPageBodyImpl: capturePull("planning-page", pullApprovedPageBodyImpl),
    pullDocBodyImpl: capturePull("doc", pullDocBodyImpl),
    pullRunbookBodyImpl: capturePull("runbook", pullRunbookBodyImpl),
    pullValidationSessionFileImpl: capturePull("validation-session", pullValidationSessionFileImpl),
  });

  return Object.fromEntries(Object.entries(checkAdapters).map(([kind, adapter]) => [kind, {
    ...adapter,
    async readRemote(input) {
      const remote = await adapter.readRemote(input);
      const key = entryPullKey(input.entry, input.manifest);
      const captured = capturedPullResults.get(key);
      capturedPullResults.delete(key);

      return mergeCapturedPullResult(remote, captured);
    },
  }]));
}

async function preflightManifestEntries({
  adapters,
  config,
  descriptors,
  diffMarkdownTextImpl,
  manifest,
  projectTokenEnv,
  readFileSyncImpl,
  requireMetadata,
}) {
  const entries = [];
  const failures = [];
  const collisions = findPathCollisions(descriptors);

  for (const [index, descriptor] of descriptors.entries()) {
    try {
      const collisionFailures = collisions.get(index);
      if (collisionFailures?.size > 0) {
        throw new Error(Array.from(collisionFailures).join(" "));
      }

      const adapter = requireAdapter(descriptor.entry, adapters);
      entries.push(await preflightEntry({
        adapter,
        config,
        descriptor,
        diffMarkdownTextImpl,
        manifest,
        projectTokenEnv,
        readFileSyncImpl,
        requireMetadata,
      }));
    } catch (error) {
      entries.push(buildErrorEntry(descriptor, error));
      failures.push(buildTopLevelFailure(descriptor.entry, error));
    }
  }

  return {
    entries,
    failures,
  };
}

function buildDescriptors(manifest, entries = manifest.entries) {
  return entries.map((entry) => buildEntryDescriptor(entry, manifest));
}

export async function pullManifestV2SyncManifest({
  adapters = createManifestV2SyncPullAdapters(),
  apply = false,
  config,
  diffMarkdownTextImpl = diffMarkdownText,
  manifest,
  mkdirSyncImpl = mkdirSync,
  projectTokenEnv,
  readFileSyncImpl = readFileSync,
  selectedEntries,
  selectionOptions,
  writeFileSyncImpl = writeFileSync,
}) {
  const selection = resolveSyncSelection({
    manifest,
    selectedEntries,
    selectionOptions,
  });
  const descriptors = buildDescriptors(manifest, selection.entries);
  const preflight = await preflightManifestEntries({
    adapters,
    config,
    descriptors,
    diffMarkdownTextImpl,
    manifest,
    projectTokenEnv,
    readFileSyncImpl,
    requireMetadata: apply,
  });

  if (!apply || preflight.failures.length > 0) {
    return buildSummary({
      manifest,
      authMode: projectTokenEnv ? "project-token" : "workspace-token",
      entries: preflight.entries.map(stripPreflightState),
      failures: preflight.failures,
      selectionMetadata: selection.metadata,
    });
  }

  const entries = [];
  const failures = [];
  const partialWrites = [];

  for (const [index, entry] of preflight.entries.entries()) {
    const descriptor = descriptors[index];
    try {
      entries.push(applyEntryWrites({
        descriptor,
        entry,
        mkdirSyncImpl,
        partialWrites,
        writeFileSyncImpl,
      }));
    } catch (error) {
      const failure = buildWriteFailureMessage({
        descriptor,
        error,
        partialWrites,
      });
      entries.push({
        ...stripPreflightState(entry),
        status: "error",
        applied: false,
        failure,
      });
      failures.push(buildTopLevelFailure(descriptor.entry, new Error(failure)));

      for (const remainingEntry of preflight.entries.slice(index + 1)) {
        entries.push(stripPreflightState(remainingEntry));
      }
      break;
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
