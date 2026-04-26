import path from "node:path";
import { readFileSync } from "node:fs";

export const SYNC_MANIFEST_V1_VERSION = 1;
export const SYNC_MANIFEST_VERSION = 2;
export const VALIDATION_SESSION_SYNC_KIND = "validation-session";

const SUPPORTED_SYNC_MANIFEST_VERSIONS = new Set([
  SYNC_MANIFEST_V1_VERSION,
  SYNC_MANIFEST_VERSION,
]);

const V1_TARGET_FIELDS_BY_KIND = new Map([
  [VALIDATION_SESSION_SYNC_KIND, "title"],
]);

const V2_TARGET_FIELDS_BY_KIND = new Map([
  ["planning-page", "pagePath"],
  ["project-doc", "docPath"],
  ["template-doc", "docPath"],
  ["workspace-doc", "docPath"],
  ["runbook", "title"],
  [VALIDATION_SESSION_SYNC_KIND, "title"],
]);

const NOTION_PAGE_ID_PATTERN = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function requireObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value;
}

function requireNonEmptyString(value, message) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function normalizeManifestVersion(version) {
  if (!SUPPORTED_SYNC_MANIFEST_VERSIONS.has(version)) {
    throw new Error(`Sync manifest version must be ${SYNC_MANIFEST_V1_VERSION} or ${SYNC_MANIFEST_VERSION}.`);
  }

  return version;
}

function normalizeRelativeFilePath(file, manifestDir) {
  const value = requireNonEmptyString(file, 'Manifest entries require a non-empty "file" path.');
  if (path.isAbsolute(value)) {
    throw new Error(`Manifest entry file "${value}" must be relative to the manifest directory.`);
  }

  if (/[*?\[\]]/.test(value)) {
    throw new Error(`Manifest entry file "${value}" must not use glob patterns.`);
  }

  const absoluteFilePath = path.resolve(manifestDir, value);
  const relativeToManifest = path.relative(manifestDir, absoluteFilePath);
  if (relativeToManifest.startsWith("..") || path.isAbsolute(relativeToManifest)) {
    throw new Error(`Manifest entry file "${value}" must stay within the manifest directory tree.`);
  }

  return {
    file: value.replaceAll("/", path.sep),
    absoluteFilePath,
  };
}

function normalizeTargetPath(value, message) {
  const rawValue = requireNonEmptyString(value, message);
  const normalizedPath = rawValue
    .split(">")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(" > ");

  if (normalizedPath === "") {
    throw new Error(message);
  }

  return normalizedPath;
}

function containsRawNotionPageId(target, targetField) {
  const values = targetField === "title"
    ? [target]
    : target.split(">").map((segment) => segment.trim()).filter(Boolean);

  return values.find((value) => NOTION_PAGE_ID_PATTERN.test(value));
}

function getTargetFieldsByKind(version) {
  return version === SYNC_MANIFEST_V1_VERSION
    ? V1_TARGET_FIELDS_BY_KIND
    : V2_TARGET_FIELDS_BY_KIND;
}

function formatSupportedKinds(targetFieldsByKind) {
  return Array.from(targetFieldsByKind.keys()).join(", ");
}

function normalizeEntryTarget(entryObject, index, targetField) {
  const message = `Manifest entry ${index + 1} requires a non-empty "${targetField}".`;
  const target = targetField === "pagePath" || targetField === "docPath"
    ? normalizeTargetPath(entryObject[targetField], message)
    : requireNonEmptyString(entryObject[targetField], message);
  const rawPageId = containsRawNotionPageId(target, targetField);
  if (rawPageId) {
    throw new Error(`Manifest entry ${index + 1} "${targetField}" must use a title or path, not raw Notion page id "${rawPageId}".`);
  }

  return target;
}

function normalizeManifestEntry(entry, index, manifestDir, version) {
  const entryObject = requireObject(entry, `Manifest entry ${index + 1} must be an object.`);
  const kind = requireNonEmptyString(
    entryObject.kind,
    `Manifest entry ${index + 1} requires a non-empty "kind".`,
  );
  const targetFieldsByKind = getTargetFieldsByKind(version);
  const targetField = targetFieldsByKind.get(kind);
  if (!targetField) {
    throw new Error(`Manifest entry ${index + 1} has unsupported kind "${kind}". Supported kinds: ${formatSupportedKinds(targetFieldsByKind)}.`);
  }

  const target = normalizeEntryTarget(entryObject, index, targetField);
  const normalizedFile = normalizeRelativeFilePath(entryObject.file, manifestDir);

  return {
    kind,
    target,
    targetField,
    [targetField]: target,
    file: normalizedFile.file,
    absoluteFilePath: normalizedFile.absoluteFilePath,
  };
}

function ensureUniqueEntries(entries, version) {
  const targetKeys = new Set();
  const fileKeys = new Set();
  for (const entry of entries) {
    const targetKey = `${entry.kind}:${entry.target}`;
    if (targetKeys.has(targetKey)) {
      if (version === SYNC_MANIFEST_V1_VERSION && entry.targetField === "title") {
        throw new Error(`Sync manifest includes duplicate ${entry.kind} title "${entry.title}".`);
      }

      throw new Error(`Sync manifest includes duplicate ${entry.kind} target "${entry.target}".`);
    }
    targetKeys.add(targetKey);

    const fileKey = entry.absoluteFilePath.toLowerCase();
    if (fileKeys.has(fileKey)) {
      throw new Error(`Sync manifest maps multiple entries to the same file "${entry.file}".`);
    }
    fileKeys.add(fileKey);
  }
}

export function parseSyncManifest(rawManifest, manifestPath, { workspaceOverride } = {}) {
  const manifest = requireObject(rawManifest, "Sync manifest must be a JSON object.");
  const manifestFilePath = path.resolve(manifestPath);
  const manifestDir = path.dirname(manifestFilePath);
  const version = normalizeManifestVersion(manifest.version);

  const workspaceName = workspaceOverride || requireNonEmptyString(
    manifest.workspace,
    'Sync manifest requires a non-empty "workspace" string.',
  );
  const projectName = requireNonEmptyString(
    manifest.project,
    'Sync manifest requires a non-empty "project" string.',
  );

  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new Error('Sync manifest requires a non-empty "entries" array.');
  }

  const normalizedEntries = manifest.entries.map((entry, index) => normalizeManifestEntry(
    entry,
    index,
    manifestDir,
    version,
  ));
  ensureUniqueEntries(normalizedEntries, version);

  return {
    version,
    manifestPath: manifestFilePath,
    manifestDir,
    workspaceName,
    projectName,
    entries: normalizedEntries,
  };
}

export function validateSyncManifest(rawManifest, {
  manifestPath,
  workspaceOverride,
} = {}) {
  const manifestFilePath = requireNonEmptyString(
    manifestPath,
    'validateSyncManifest requires a non-empty "manifestPath" string.',
  );

  return parseSyncManifest(rawManifest, manifestFilePath, { workspaceOverride });
}

export function loadSyncManifest(manifestPath, options = {}) {
  const rawText = readFileSync(manifestPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Sync manifest "${path.resolve(manifestPath)}" is not valid JSON.`);
  }

  return parseSyncManifest(parsed, manifestPath, options);
}
