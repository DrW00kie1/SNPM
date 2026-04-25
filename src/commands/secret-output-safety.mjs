import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { diffMarkdownText } from "../notion/page-markdown.mjs";

export const SECRET_REDACTION_MARKER = "[SNPM REDACTED SECRET OUTPUT]";
export const SECRET_REDACTION_WARNING = "Secret-bearing Access output was redacted by default. Use --raw-secret-output only when an explicit local raw copy is required.";

const SECRET_BEARING_SURFACES = new Set(["secret-record", "access-token"]);
const SAFE_LABELS = new Set([
  "auth method",
  "boundary rule",
  "capabilities",
  "purpose",
  "related access domain",
  "related runbook or environment page",
  "related secret record pages if any",
  "related surfaces",
  "related vendor page",
  "related workspace or project page",
  "rotation / reset",
  "scope",
  "secret name",
  "shared root page",
  "system",
  "token name",
  "used by",
]);

function normalizeNewlines(text) {
  return String(text || "").replace(/\r\n/g, "\n");
}

export function isSecretBearingSurface(surface) {
  return SECRET_BEARING_SURFACES.has(surface);
}

export function containsSecretRedactionMarker(text) {
  return normalizeNewlines(text).includes(SECRET_REDACTION_MARKER);
}

export function assertNoSecretRedactionMarkers(text, { command } = {}) {
  if (!containsSecretRedactionMarker(text)) {
    return;
  }

  const commandLabel = command ? ` for ${command}` : "";
  throw new Error(
    `Refusing to use redacted secret output${commandLabel}. Re-pull with --raw-secret-output into .snpm/secrets/ when a push-ready raw editing base is required.`,
  );
}

function labelFromLine(line) {
  const match = /^\s*(?:[-*]\s*)?([^:=]+?)\s*[:=]/.exec(line);
  return match ? match[1].trim().toLowerCase() : null;
}

function shouldRedactSensitiveAssignment(line) {
  const label = labelFromLine(line);
  if (label && SAFE_LABELS.has(label)) {
    return false;
  }

  return /^\s*(?:[-*]\s*)?(?:export\s+)?[A-Za-z0-9_. -]*(?:api[_ -]?key|authorization|bearer|client[_ -]?secret|password|private[_ -]?key|secret|token)[A-Za-z0-9_. -]*\s*[:=]\s*\S/i.test(line);
}

function redactSensitiveAssignment(line) {
  return line.replace(/^(\s*(?:[-*]\s*)?(?:export\s+)?[^:=]+?\s*[:=]\s*).+$/i, `$1${SECRET_REDACTION_MARKER}`);
}

function isSectionHeading(line) {
  return /^#{1,6}\s+/.test(line);
}

function isRawValueHeading(line) {
  return /^#{1,6}\s+Raw Value\s*$/i.test(line);
}

function isFence(line) {
  return /^\s*(`{3,}|~{3,})/.test(line);
}

function redactContentLines(lines, { diffMode = false } = {}) {
  const output = [];
  let inRawValueSection = false;
  let inRawValueFence = false;

  for (const originalLine of lines) {
    let diffPrefix = "";
    let line = originalLine;

    if (diffMode && /^[+\- ]/.test(originalLine) && !/^(?:\+\+\+|---)/.test(originalLine)) {
      diffPrefix = originalLine[0];
      line = originalLine.slice(1);
    }

    if (isRawValueHeading(line)) {
      inRawValueSection = true;
      inRawValueFence = false;
      output.push(`${diffPrefix}${line}`);
      continue;
    }

    if (inRawValueSection && isSectionHeading(line) && !isRawValueHeading(line)) {
      inRawValueSection = false;
      inRawValueFence = false;
    }

    if (inRawValueSection) {
      if (isFence(line)) {
        inRawValueFence = !inRawValueFence;
        output.push(`${diffPrefix}${line}`);
        continue;
      }

      if (inRawValueFence) {
        output.push(`${diffPrefix}${SECRET_REDACTION_MARKER}`);
        continue;
      }

      if (line.trim() && !/^Raw Value\s*$/i.test(line.trim())) {
        output.push(`${diffPrefix}${SECRET_REDACTION_MARKER}`);
        continue;
      }
    }

    if (shouldRedactSensitiveAssignment(line)) {
      output.push(`${diffPrefix}${redactSensitiveAssignment(line)}`);
      continue;
    }

    output.push(`${diffPrefix}${line}`);
  }

  return output;
}

export function redactSecretMarkdown(markdown) {
  const normalized = normalizeNewlines(markdown);
  const redacted = redactContentLines(normalized.split("\n")).join("\n");
  return markdown && !normalized.endsWith("\n") ? redacted.replace(/\n$/, "") : redacted;
}

export function redactSecretDiff(diff) {
  const normalized = normalizeNewlines(diff);
  if (!normalized.trim()) {
    return normalized;
  }

  const lines = normalized.split("\n");
  const contentLines = [];
  const output = [];

  for (const line of lines) {
    if (/^(?:diff --git|index |@@|\+\+\+|---)/.test(line)) {
      if (contentLines.length > 0) {
        output.push(...redactContentLines(contentLines, { diffMode: true }));
        contentLines.length = 0;
      }
      output.push(line);
      continue;
    }

    contentLines.push(line);
  }

  if (contentLines.length > 0) {
    output.push(...redactContentLines(contentLines, { diffMode: true }));
  }

  return output.join("\n");
}

export function redactSecretResultForOutput(result, { surface } = {}) {
  if (!isSecretBearingSurface(surface) || !result || typeof result !== "object") {
    return result;
  }

  const redacted = {
    ...result,
    warnings: [
      ...new Set([
        ...(Array.isArray(result.warnings) ? result.warnings : []),
        SECRET_REDACTION_WARNING,
      ]),
    ],
    redaction: {
      applied: true,
      marker: SECRET_REDACTION_MARKER,
      reason: "secret-bearing-access-surface",
    },
  };

  if (typeof result.bodyMarkdown === "string") {
    redacted.bodyMarkdown = redactSecretMarkdown(result.bodyMarkdown);
  }
  if (typeof result.currentBodyMarkdown === "string") {
    redacted.currentBodyMarkdown = redactSecretMarkdown(result.currentBodyMarkdown);
  }
  if (typeof result.nextBodyMarkdown === "string") {
    redacted.nextBodyMarkdown = redactSecretMarkdown(result.nextBodyMarkdown);
  }
  if (typeof result.diff === "string") {
    redacted.diff = typeof redacted.currentBodyMarkdown === "string" && typeof redacted.nextBodyMarkdown === "string"
      ? diffMarkdownText(redacted.currentBodyMarkdown, redacted.nextBodyMarkdown)
      : redactSecretDiff(result.diff);
  }

  return redacted;
}

function existingParent(candidatePath, { existsSyncImpl = existsSync, statSyncImpl = statSync } = {}) {
  let cursor = path.resolve(candidatePath);

  while (!existsSyncImpl(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      return cursor;
    }
    cursor = parent;
  }

  try {
    return statSyncImpl(cursor).isDirectory() ? cursor : path.dirname(cursor);
  } catch {
    return path.dirname(cursor);
  }
}

function findGitRoot(startPath, options = {}) {
  const { existsSyncImpl = existsSync } = options;
  let cursor = existingParent(startPath, options);

  while (true) {
    if (existsSyncImpl(path.join(cursor, ".git"))) {
      return cursor;
    }

    const parent = path.dirname(cursor);
    if (parent === cursor) {
      return null;
    }
    cursor = parent;
  }
}

function isPathInside(candidatePath, rootPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function validateSecretPullOutputPolicy({
  outputPath,
  metadataOutputPath,
  rawSecretOutput = false,
  allowRepoSecretOutput = false,
  cwd = process.cwd(),
  existsSyncImpl = existsSync,
  statSyncImpl = statSync,
} = {}) {
  if (!rawSecretOutput) {
    if (metadataOutputPath) {
      throw new Error("--metadata-output requires --raw-secret-output for secret-bearing Access pulls; redacted pull output is not a push-ready editing base.");
    }

    return {
      raw: false,
      redacted: true,
      warnings: [SECRET_REDACTION_WARNING],
    };
  }

  if (outputPath === "-") {
    return {
      raw: true,
      redacted: false,
      warnings: [],
    };
  }

  const resolvedOutputPath = path.resolve(cwd, outputPath);
  const cwdRepoRoot = findGitRoot(cwd, { existsSyncImpl, statSyncImpl });
  const outputRepoRoot = findGitRoot(path.dirname(resolvedOutputPath), { existsSyncImpl, statSyncImpl });
  const repoRoots = [...new Set([cwdRepoRoot, outputRepoRoot].filter(Boolean).map((root) => path.resolve(root)))];

  for (const repoRoot of repoRoots) {
    if (!isPathInside(resolvedOutputPath, repoRoot)) {
      continue;
    }

    const quarantineRoot = path.join(repoRoot, ".snpm", "secrets");
    if (isPathInside(resolvedOutputPath, quarantineRoot)) {
      return {
        raw: true,
        redacted: false,
        warnings: [],
      };
    }

    if (!allowRepoSecretOutput) {
      throw new Error(
        `Refusing raw secret output inside repo "${repoRoot}". Write under .snpm/secrets/ or add --allow-repo-secret-output with --raw-secret-output.`,
      );
    }
  }

  return {
    raw: true,
    redacted: false,
    warnings: [],
  };
}
