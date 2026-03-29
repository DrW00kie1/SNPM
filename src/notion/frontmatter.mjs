import { normalizeMarkdownNewlines } from "./page-markdown.mjs";

function unquoteValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    const inner = value.slice(1, -1);
    if (value.startsWith('"')) {
      return JSON.parse(`"${inner.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`);
    }
    return inner.replaceAll("\\'", "'");
  }

  return value;
}

function quoteValue(value) {
  if (value === "") {
    return "";
  }

  if (/[:#\n\r]/.test(value) || /^\s|\s$/.test(value)) {
    return JSON.stringify(value);
  }

  return value;
}

export function parseFrontMatterFile(markdown) {
  const normalized = normalizeMarkdownNewlines(markdown || "");

  if (!normalized.startsWith("---\n")) {
    throw new Error("Validation-session files must start with YAML front matter.");
  }

  const endMarker = normalized.indexOf("\n---\n", 4);
  if (endMarker === -1) {
    throw new Error("Validation-session files are missing the closing YAML front matter delimiter.");
  }

  const frontMatterText = normalized.slice(4, endMarker);
  const bodyMarkdown = normalized.slice(endMarker + "\n---\n".length);
  const fields = {};

  if (frontMatterText.trim()) {
    for (const line of frontMatterText.split("\n")) {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        throw new Error(`Invalid front matter line: ${line}`);
      }

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      fields[key] = unquoteValue(rawValue);
    }
  }

  return {
    fields,
    bodyMarkdown,
  };
}

export function renderFrontMatterFile(fields, fieldOrder, bodyMarkdown) {
  const lines = ["---"];

  for (const key of fieldOrder) {
    const rawValue = fields[key];
    const value = typeof rawValue === "string" ? rawValue : "";
    lines.push(`${key}: ${quoteValue(value)}`);
  }

  lines.push("---");
  lines.push(normalizeMarkdownNewlines(bodyMarkdown || "").replace(/^\n*/, ""));

  return normalizeMarkdownNewlines(lines.join("\n"));
}
