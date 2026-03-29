import path from "node:path";
import { readFileSync } from "node:fs";

export const SYNC_MANIFEST_VERSION = 1;
export const VALIDATION_SESSION_SYNC_KIND = "validation-session";

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

export function parseSyncManifest(rawManifest, manifestPath, { workspaceOverride } = {}) {
  const manifest = requireObject(rawManifest, "Sync manifest must be a JSON object.");
  const manifestFilePath = path.resolve(manifestPath);
  const manifestDir = path.dirname(manifestFilePath);

  if (manifest.version !== SYNC_MANIFEST_VERSION) {
    throw new Error(`Sync manifest version must be ${SYNC_MANIFEST_VERSION}.`);
  }

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

  const normalizedEntries = manifest.entries.map((entry, index) => {
    const entryObject = requireObject(entry, `Manifest entry ${index + 1} must be an object.`);
    const kind = requireNonEmptyString(
      entryObject.kind,
      `Manifest entry ${index + 1} requires a non-empty "kind".`,
    );
    if (kind !== VALIDATION_SESSION_SYNC_KIND) {
      throw new Error(`Manifest entry ${index + 1} has unsupported kind "${kind}". Supported kinds: ${VALIDATION_SESSION_SYNC_KIND}.`);
    }

    const title = requireNonEmptyString(
      entryObject.title,
      `Manifest entry ${index + 1} requires a non-empty "title".`,
    );
    const normalizedFile = normalizeRelativeFilePath(entryObject.file, manifestDir);

    return {
      kind,
      title,
      file: normalizedFile.file,
      absoluteFilePath: normalizedFile.absoluteFilePath,
    };
  });

  const titleKeys = new Set();
  const fileKeys = new Set();
  for (const entry of normalizedEntries) {
    const titleKey = `${entry.kind}:${entry.title}`;
    if (titleKeys.has(titleKey)) {
      throw new Error(`Sync manifest includes duplicate ${entry.kind} title "${entry.title}".`);
    }
    titleKeys.add(titleKey);

    const fileKey = entry.absoluteFilePath.toLowerCase();
    if (fileKeys.has(fileKey)) {
      throw new Error(`Sync manifest maps multiple entries to the same file "${entry.file}".`);
    }
    fileKeys.add(fileKey);
  }

  return {
    manifestPath: manifestFilePath,
    manifestDir,
    workspaceName,
    projectName,
    entries: normalizedEntries,
  };
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
