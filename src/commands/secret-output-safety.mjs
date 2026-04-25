import { diffMarkdownText } from "../notion/page-markdown.mjs";

export const SECRET_REDACTION_MARKER = "[SNPM REDACTED SECRET OUTPUT]";
export const SECRET_REDACTION_WARNING = "Secret-bearing Access output was redacted by default. Raw local export is unsupported; use secret-record exec/access-token exec for runtime consumption.";
export const RAW_SECRET_EXPORT_UNSUPPORTED_MESSAGE = "raw secret export is unsupported; use secret-record exec/access-token exec.";
export const SECRET_MARKDOWN_MUTATION_UNSUPPORTED_MESSAGE = "Local Markdown edit/diff/push is disabled for secret-bearing Access records. Update raw values in Notion and use secret-record exec/access-token exec for runtime consumption.";
export const DEFAULT_GENERATED_SECRET_MAX_BYTES = 8192;

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

function stringifyOutput(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
}

export function isSecretBearingSurface(surface) {
  return SECRET_BEARING_SURFACES.has(surface);
}

export function containsSecretRedactionMarker(text) {
  return normalizeNewlines(text).includes(SECRET_REDACTION_MARKER);
}

export function redactExactSecretValue(text, secretValue) {
  const input = stringifyOutput(text);
  if (typeof secretValue !== "string" || secretValue === "" || !input.includes(secretValue)) {
    return {
      text: input,
      redacted: false,
    };
  }

  return {
    text: input.split(secretValue).join(SECRET_REDACTION_MARKER),
    redacted: true,
  };
}

export function createExactSecretRedactor(secretValue) {
  if (typeof secretValue !== "string" || secretValue === "") {
    throw new Error("createExactSecretRedactor requires a non-empty secret value.");
  }

  return Object.freeze({
    marker: SECRET_REDACTION_MARKER,
    redact(text) {
      return redactExactSecretValue(text, secretValue);
    },
    redactText(text) {
      return redactExactSecretValue(text, secretValue).text;
    },
  });
}

export function assertNoSecretRedactionMarkers(text, { command } = {}) {
  if (!containsSecretRedactionMarker(text)) {
    return;
  }

  const commandLabel = command ? ` for ${command}` : "";
  throw new Error(
    `Refusing to use redacted secret output${commandLabel}. Redacted local files are not push-ready; update raw values in Notion and use secret-record exec/access-token exec for runtime consumption.`,
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

export function validateSecretPullOutputPolicy({
  metadataOutputPath,
  rawSecretOutput = false,
  allowRepoSecretOutput = false,
} = {}) {
  if (rawSecretOutput || allowRepoSecretOutput) {
    throw new Error(RAW_SECRET_EXPORT_UNSUPPORTED_MESSAGE);
  }

  if (metadataOutputPath) {
    throw new Error("--metadata-output is unsupported for secret-bearing Access pulls; redacted pull output is not a push-ready editing base.");
  }

  return {
    raw: false,
    redacted: true,
    warnings: [SECRET_REDACTION_WARNING],
  };
}

function findRawValueSections(markdown) {
  const lines = normalizeNewlines(markdown).split("\n");
  const sections = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!isRawValueHeading(lines[index])) {
      continue;
    }

    let end = index + 1;
    while (end < lines.length && !isSectionHeading(lines[end])) {
      end += 1;
    }
    sections.push(lines.slice(index + 1, end).join("\n"));
  }

  return sections;
}

function parseFenceOpen(line) {
  const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) {
    return null;
  }

  return {
    char: match[1][0],
    length: match[1].length,
    info: match[2].trim(),
  };
}

function isFenceClose(line, opener) {
  const trimmed = line.trim();
  const match = /^(`+|~+)/.exec(trimmed);
  if (!match) {
    return false;
  }

  return match[1][0] === opener.char
    && match[1].length >= opener.length
    && trimmed.slice(match[1].length).trim() === "";
}

function isAllowedRawValueSectionText(line) {
  return line.trim() === "" || /^Raw Value\s*$/i.test(line.trim());
}

function plaintextRawValue(sectionMarkdown) {
  return sectionMarkdown
    .split("\n")
    .filter((line) => !isAllowedRawValueSectionText(line))
    .join("\n")
    .trim();
}

function extractFencedValues(sectionMarkdown, { rejectPlaintext = false } = {}) {
  const lines = sectionMarkdown.split("\n");
  const values = [];

  for (let index = 0; index < lines.length; index += 1) {
    const opening = parseFenceOpen(lines[index]);
    if (!opening) {
      if (rejectPlaintext && !isAllowedRawValueSectionText(lines[index])) {
        throw new Error("Raw Value must contain exactly one fenced code block and no additional plaintext value.");
      }
      continue;
    }

    const contentStart = index + 1;
    let close = contentStart;
    while (close < lines.length && !isFenceClose(lines[close], opening)) {
      close += 1;
    }

    if (close >= lines.length) {
      values.push(null);
      break;
    }

    values.push(lines.slice(contentStart, close).join("\n"));
    index = close;
  }

  return values;
}

export function isPlaceholderRawSecretValue(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return true;
  }

  const lower = trimmed.toLowerCase();
  return lower === "<paste secret here>"
    || lower === "<paste scoped token here>"
    || (/^<[^>\n]+>$/.test(trimmed) && /(api\s*key|client\s*secret|paste|password|scoped\s*token|secret|token|value)/i.test(trimmed))
    || /^(?:change[-_ ]?me|example[-_ ]?(?:secret|token|value)|n\/a|none|null|placeholder|replace[-_ ]?me|tbd|todo)$/i.test(trimmed);
}

function isRedactedRawSecretValue(value) {
  const raw = String(value || "");
  const trimmed = raw.trim();
  if (raw.includes(SECRET_REDACTION_MARKER)) {
    return true;
  }

  if (/^(?:\[?redacted\]?|<redacted>|hidden|masked|secret redacted|token redacted)$/i.test(trimmed)) {
    return true;
  }

  return /^[*xX]{6,}$/.test(trimmed);
}

function stripOneFinalNewline(value) {
  if (value.endsWith("\r\n")) {
    return value.slice(0, -2);
  }
  if (value.endsWith("\n") || value.endsWith("\r")) {
    return value.slice(0, -1);
  }

  return value;
}

function generatedValueAppearsInArgv(value, childArgs = []) {
  if (!Array.isArray(childArgs) || typeof value !== "string" || value === "") {
    return false;
  }

  return childArgs.some((arg) => {
    if (typeof arg !== "string") {
      return false;
    }

    return arg === value || (value.length >= 8 && arg.includes(value));
  });
}

export function validateGeneratedSecretValue(rawValue, {
  childArgs = [],
  command = "secret generate",
  maxBytes = DEFAULT_GENERATED_SECRET_MAX_BYTES,
} = {}) {
  if (typeof rawValue !== "string" && !Buffer.isBuffer(rawValue)) {
    throw new Error(`${command} generator must produce a string stdout value.`);
  }

  const value = stripOneFinalNewline(stringifyOutput(rawValue));
  if (!value.trim()) {
    throw new Error(`${command} generator produced an empty value.`);
  }

  if (value.includes("\0")) {
    throw new Error(`${command} generator produced an invalid value.`);
  }

  if (value.includes("\n") || value.includes("\r")) {
    throw new Error(`${command} generator produced a multiline value; v1 supports single-line generated secrets only.`);
  }

  if (Buffer.byteLength(value, "utf8") > maxBytes) {
    throw new Error(`${command} generator produced a value larger than ${maxBytes} bytes.`);
  }

  if (isRedactedRawSecretValue(value)) {
    throw new Error(`${command} generator produced a redacted value.`);
  }

  if (isPlaceholderRawSecretValue(value)) {
    throw new Error(`${command} generator produced a placeholder value.`);
  }

  if (generatedValueAppearsInArgv(value, childArgs)) {
    throw new Error(`${command} generator output appears in the generator argv; refusing chat/history-visible secret material.`);
  }

  return value;
}

export function extractRawSecretValueFromMarkdown(markdown, { command = "secret exec" } = {}) {
  const sections = findRawValueSections(markdown);
  if (sections.length !== 1) {
    throw new Error(`${command} requires exactly one ## Raw Value section with one fenced value.`);
  }

  let fencedValues;
  try {
    fencedValues = extractFencedValues(sections[0], { rejectPlaintext: true });
  } catch (error) {
    throw new Error(`${command} ${error.message}`);
  }

  if (fencedValues.length !== 1 || fencedValues[0] === null) {
    throw new Error(`${command} requires exactly one fenced value under ## Raw Value.`);
  }

  const value = String(fencedValues[0]);
  if (!value.trim()) {
    throw new Error(`${command} cannot consume an empty Raw Value.`);
  }

  if (isRedactedRawSecretValue(value)) {
    throw new Error(`${command} cannot consume redacted Raw Value output.`);
  }

  if (isPlaceholderRawSecretValue(value)) {
    throw new Error(`${command} cannot consume a placeholder Raw Value.`);
  }

  return value;
}

export function assertNoLocalRawSecretValue(markdown, { command = "secret-record create" } = {}) {
  assertNoSecretRedactionMarkers(markdown, { command });

  const sections = findRawValueSections(markdown);
  if (sections.length === 0) {
    return;
  }

  if (sections.length !== 1) {
    throw new Error(`Refusing local raw secret value for ${command}: expected at most one ## Raw Value section.`);
  }

  const fencedValues = extractFencedValues(sections[0]);
  if (fencedValues.some((value) => value === null)) {
    throw new Error(`Refusing local raw secret value for ${command}: ambiguous ## Raw Value blocks are not supported.`);
  }

  if (fencedValues.length === 0) {
    const plaintextValue = plaintextRawValue(sections[0]);
    if (plaintextValue && !isPlaceholderRawSecretValue(plaintextValue)) {
      throw new Error(`Refusing local raw secret value for ${command}. Paste raw values directly into Notion and use secret-record exec/access-token exec for runtime consumption.`);
    }
    return;
  }

  if (fencedValues.length !== 1) {
    throw new Error(`Refusing local raw secret value for ${command}: ambiguous ## Raw Value blocks are not supported.`);
  }

  const value = String(fencedValues[0]).trim();
  if (!value || isPlaceholderRawSecretValue(value)) {
    return;
  }

  throw new Error(`Refusing local raw secret value for ${command}. Paste raw values directly into Notion and use secret-record exec/access-token exec for runtime consumption.`);
}
