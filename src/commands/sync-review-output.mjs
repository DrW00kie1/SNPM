import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const REVIEW_ENTRIES_DIR = "entries";
const SECRET_PATTERNS = [
  /\bntn_[A-Za-z0-9_=-]{8,}\b/g,
  /\bsecret[_-]?[A-Za-z0-9_=-]{6,}\b/gi,
  /\b(token|secret|password)\s*[:=]\s*[^,\s"'}]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/g,
  /\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\b/g,
];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function redactString(value) {
  if (!isNonEmptyString(value)) {
    return value;
  }

  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, (match, label) => (
      typeof label === "string" ? `${label}: [redacted]` : "[redacted]"
    )),
    value,
  );
}

function redactValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item)]));
  }

  return typeof value === "string" ? redactString(value) : value;
}

function includeDefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function commandFamilyForEntry(entry) {
  if (entry.commandFamily) {
    return entry.commandFamily;
  }

  if (entry.metadata?.commandFamily) {
    return entry.metadata.commandFamily;
  }

  if (entry.kind === "planning-page") {
    return "page";
  }

  if (["project-doc", "template-doc", "workspace-doc"].includes(entry.kind)) {
    return "doc";
  }

  if (entry.kind === "validation-session") {
    return "validation-session";
  }

  return entry.kind;
}

function surfaceForEntry(entry) {
  if (entry.surface) {
    return entry.surface;
  }

  if (entry.kind === "planning-page") {
    return "planning";
  }

  if (entry.kind === "project-doc") {
    return "project-docs";
  }

  if (entry.kind === "template-doc") {
    return "template-docs";
  }

  if (entry.kind === "workspace-doc") {
    return "workspace-docs";
  }

  if (entry.kind === "runbook") {
    return "runbooks";
  }

  if (entry.kind === "validation-session") {
    return "validation-session";
  }

  return entry.kind || "sync-entry";
}

function safeFilenamePart(value) {
  const normalized = String(value || "entry")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/[-_.]{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized.slice(0, 80) || "entry";
}

function entryBasename(entry, index) {
  const ordinal = String(index + 1).padStart(3, "0");
  return `${ordinal}-${safeFilenamePart(entry.kind)}-${safeFilenamePart(entry.target || entry.targetPath || entry.file)}`;
}

function normalizeReviewDir(reviewOutputDir) {
  if (!isNonEmptyString(reviewOutputDir)) {
    return null;
  }

  return path.resolve(reviewOutputDir);
}

function assertInside(parentDir, candidatePath) {
  const parent = path.resolve(parentDir);
  const candidate = path.resolve(candidatePath);
  if (candidate !== parent && !candidate.startsWith(`${parent}${path.sep}`)) {
    throw new Error(`Refusing to write review artifact outside output directory: ${candidate}`);
  }
}

function resetEntriesDir(reviewDir, {
  mkdirSyncImpl = mkdirSync,
  readdirSyncImpl = readdirSync,
  rmSyncImpl = rmSync,
} = {}) {
  mkdirSyncImpl(reviewDir, { recursive: true });

  const entriesDir = path.join(reviewDir, REVIEW_ENTRIES_DIR);
  assertInside(reviewDir, entriesDir);

  if (existsSync(entriesDir)) {
    for (const child of readdirSyncImpl(entriesDir)) {
      const childPath = path.join(entriesDir, child);
      assertInside(entriesDir, childPath);
      rmSyncImpl(childPath, { recursive: true, force: true });
    }
  }

  mkdirSyncImpl(entriesDir, { recursive: true });
  return entriesDir;
}

function isPreviewResult(result) {
  if (!result || typeof result !== "object") {
    return false;
  }

  if (!Array.isArray(result.entries)) {
    return false;
  }

  if (typeof result.appliedCount === "number" && result.appliedCount > 0) {
    return false;
  }

  return result.entries.every((entry) => entry?.applied !== true);
}

function sidecarStateForEntry(entry) {
  if (!entry.metadataPath && entry.sidecarRefreshed === undefined && entry.metadata === undefined) {
    return undefined;
  }

  return includeDefined({
    metadataPath: entry.metadataPath,
    sidecarRefreshed: entry.sidecarRefreshed,
    metadataPresent: entry.metadata !== undefined,
    schema: entry.metadata?.schema,
    lastEditedTime: entry.metadata?.lastEditedTime,
    pulledAt: entry.metadata?.pulledAt,
  });
}

function safeEntryMetadata(entry, index, diffPath) {
  return redactValue(includeDefined({
    index,
    kind: entry.kind,
    target: entry.target,
    file: entry.file,
    targetPath: entry.targetPath,
    status: entry.status,
    selected: entry.applied !== true && entry.status !== "skipped",
    skipped: entry.status === "skipped",
    hasDiff: entry.hasDiff,
    applied: entry.applied === true,
    commandFamily: commandFamilyForEntry(entry),
    surface: surfaceForEntry(entry),
    authMode: entry.authMode,
    pageId: entry.pageId,
    projectId: entry.projectId,
    sidecar: sidecarStateForEntry(entry),
    failure: entry.failure,
    warnings: Array.isArray(entry.warnings) ? entry.warnings : undefined,
    diffFile: diffPath ? path.basename(diffPath) : undefined,
  }));
}

function buildSummary(result, entryArtifacts) {
  const selectedEntries = entryArtifacts.filter((entry) => entry.metadata.selected).length;
  const skippedEntries = entryArtifacts.filter((entry) => entry.metadata.skipped).length;

  return redactValue(includeDefined({
    command: result.command,
    manifestPath: result.manifestPath,
    projectName: result.projectName,
    workspaceName: result.workspaceName,
    authMode: result.authMode,
    hasDiff: result.hasDiff,
    driftCount: result.driftCount,
    appliedCount: result.appliedCount,
    selectedEntries,
    skippedEntries,
    entryCount: entryArtifacts.length,
    targetPaths: entryArtifacts.map((entry) => entry.metadata.targetPath).filter(Boolean),
    entries: entryArtifacts.map((entry) => includeDefined({
      index: entry.metadata.index,
      kind: entry.metadata.kind,
      target: entry.metadata.target,
      file: entry.metadata.file,
      targetPath: entry.metadata.targetPath,
      status: entry.metadata.status,
      selected: entry.metadata.selected,
      skipped: entry.metadata.skipped,
      hasDiff: entry.metadata.hasDiff,
      commandFamily: entry.metadata.commandFamily,
      surface: entry.metadata.surface,
      reviewFile: path.basename(entry.reviewPath),
      diffFile: entry.diffPath ? path.basename(entry.diffPath) : undefined,
    })),
    journal: result.journal,
    journalExpectation: result.journalExpectation,
    mutationBudget: result.mutationBudget,
    failures: Array.isArray(result.failures) ? result.failures : undefined,
    recovery: result.recovery,
    warnings: Array.isArray(result.warnings) ? result.warnings : undefined,
  }));
}

export function writeManifestV2PreviewReviewArtifacts({
  result,
  reviewOutputDir,
  mkdirSyncImpl = mkdirSync,
  readdirSyncImpl = readdirSync,
  rmSyncImpl = rmSync,
  writeFileSyncImpl = writeFileSync,
} = {}) {
  const reviewDir = normalizeReviewDir(reviewOutputDir);
  if (!reviewDir) {
    return {
      written: false,
      reason: "review-output-dir-not-provided",
    };
  }

  if (!isPreviewResult(result)) {
    throw new Error("Manifest v2 review artifacts can only be written for preview results with no applied entries.");
  }

  const entriesDir = resetEntriesDir(reviewDir, {
    mkdirSyncImpl,
    readdirSyncImpl,
    rmSyncImpl,
  });
  const artifacts = [];

  for (const [index, entry] of result.entries.entries()) {
    const basename = entryBasename(entry, index);
    const reviewPath = path.join(entriesDir, `${basename}.review.json`);
    const diffPath = isNonEmptyString(entry.diff) ? path.join(entriesDir, `${basename}.diff`) : null;
    assertInside(entriesDir, reviewPath);
    if (diffPath) {
      assertInside(entriesDir, diffPath);
      writeFileSyncImpl(diffPath, entry.diff, "utf8");
    }

    const metadata = safeEntryMetadata(entry, index, diffPath);
    writeFileSyncImpl(reviewPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    artifacts.push({
      metadata,
      reviewPath,
      diffPath,
    });
  }

  const summaryPath = path.join(reviewDir, "summary.json");
  assertInside(reviewDir, summaryPath);
  const summary = buildSummary(result, artifacts);
  writeFileSyncImpl(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  return {
    written: true,
    directory: reviewDir,
    summaryPath,
    entriesDirectory: entriesDir,
    files: [
      summaryPath,
      ...artifacts.flatMap((artifact) => [
        artifact.reviewPath,
        ...(artifact.diffPath ? [artifact.diffPath] : []),
      ]),
    ],
    entryCount: artifacts.length,
    diffCount: artifacts.filter((artifact) => artifact.diffPath).length,
  };
}
