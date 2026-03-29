import { normalizeMarkdownNewlines, escapeManagedHeaderText } from "./page-markdown.mjs";

export const RUNBOOK_ICON = { type: "emoji", emoji: "📘" };
export const BUILD_RECORD_ICON = { type: "emoji", emoji: "📦" };
export const BUILDS_CONTAINER_ICON = { type: "emoji", emoji: "🏗️" };
export const VALIDATION_SESSIONS_DATABASE_ICON = { type: "emoji", emoji: "🧪" };
export const VALIDATION_SESSION_ICON = { type: "emoji", emoji: "🧾" };

function ensureTrailingNewline(markdown) {
  const normalized = normalizeMarkdownNewlines(markdown || "");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

export function buildManagedHeaderMarkdown({
  purpose,
  canonicalPath,
  readThisWhen,
  sensitive = "no",
  timestamp,
}) {
  return [
    `Purpose: ${purpose}`,
    `Canonical Source: ${escapeManagedHeaderText(canonicalPath)}`,
    `Read This When: ${readThisWhen}`,
    `Last Updated: ${timestamp}`,
    `Sensitive: ${sensitive}`,
    "---",
    "",
  ].join("\n");
}

export function buildDefaultRunbookBody(title) {
  return ensureTrailingNewline([
    "> Use this runbook for repeatable operator steps and update it when the process changes.",
    "",
    "## Purpose",
    `- Describe what "${title}" is for.`,
    "",
    "## Preconditions",
    "- List any access, tooling, or environmental checks needed before starting.",
    "",
    "## Procedure",
    "1. Replace this checklist with the validated steps.",
    "",
    "## Validation",
    "- Describe how to confirm the work succeeded.",
    "",
    "## Rollback",
    "- Capture the safest recovery path if the procedure fails.",
    "",
  ].join("\n"));
}

export function buildDefaultBuildRecordBody(title) {
  return ensureTrailingNewline([
    "> Use this build record to capture what shipped, how it was validated, and any follow-up needed.",
    "",
    "## Build Summary",
    `- Describe what "${title}" contains and why it exists.`,
    "",
    "## Inputs",
    "- Commit or ref:",
    "- Environment:",
    "- Build target:",
    "",
    "## Validation",
    "- Record the checks that were run and their result.",
    "",
    "## Follow-Up",
    "- Note any remaining risk, approvals, or next actions.",
    "",
  ].join("\n"));
}

export function buildDefaultBuildsContainerBody(projectName) {
  return ensureTrailingNewline([
    `> Use this page as the build-record index for ${projectName}. Add one child page per build or release validation pass.`,
    "",
    "## Usage",
    "- Keep build records as child pages under this container.",
    "- Prefer one page per meaningful build, release candidate, or audit pass.",
    "",
  ].join("\n"));
}

export function buildDefaultValidationSessionBody(title) {
  return ensureTrailingNewline([
    "> Use this validation-session report to capture one human validation run and its outcome.",
    "",
    "## Session Summary",
    `- Describe what "${title}" covered and why this validation run happened.`,
    "",
    "## Findings",
    "- Record the observed behavior, defects, or notable checks.",
    "",
    "## Follow-Up",
    "- Capture fixes, owners, or next validation steps.",
    "",
  ].join("\n"));
}

export function buildManagedRunbookMarkdown({ projectName, title, bodyMarkdown, timestamp }) {
  const canonicalPath = `Projects > ${projectName} > Runbooks > ${title}`;
  const headerMarkdown = buildManagedHeaderMarkdown({
    purpose: `${title} is the SNPM-managed runbook for this project workflow.`,
    canonicalPath,
    readThisWhen: "You need the validated procedure, validation steps, or rollback path for this workflow.",
    timestamp,
  });

  return headerMarkdown + ensureTrailingNewline(bodyMarkdown?.trim() ? bodyMarkdown : buildDefaultRunbookBody(title));
}

export function buildManagedBuildRecordMarkdown({ projectName, title, bodyMarkdown, timestamp }) {
  const canonicalPath = `Projects > ${projectName} > Ops > Builds > ${title}`;
  const headerMarkdown = buildManagedHeaderMarkdown({
    purpose: `${title} is the SNPM-managed build record for this project.`,
    canonicalPath,
    readThisWhen: "You need the build summary, validation evidence, or follow-up status for this build.",
    timestamp,
  });

  return headerMarkdown + ensureTrailingNewline(
    bodyMarkdown?.trim() ? bodyMarkdown : buildDefaultBuildRecordBody(title),
  );
}

export function buildManagedBuildsContainerMarkdown({ projectName, timestamp }) {
  const canonicalPath = `Projects > ${projectName} > Ops > Builds`;
  const headerMarkdown = buildManagedHeaderMarkdown({
    purpose: `Builds is the SNPM-managed build record index for ${projectName}.`,
    canonicalPath,
    readThisWhen: "You need the project build history or a place to create a new build record.",
    timestamp,
  });

  return headerMarkdown + buildDefaultBuildsContainerBody(projectName);
}

export function buildManagedValidationSessionMarkdown({ projectName, title, bodyMarkdown, timestamp }) {
  const canonicalPath = `Projects > ${projectName} > Ops > Validation > Validation Sessions > ${title}`;
  const headerMarkdown = buildManagedHeaderMarkdown({
    purpose: `${title} is the SNPM-managed validation-session report for this project.`,
    canonicalPath,
    readThisWhen: "You need the session outcome, findings, or follow-up from this validation run.",
    timestamp,
  });

  return headerMarkdown + ensureTrailingNewline(
    bodyMarkdown?.trim() ? bodyMarkdown : buildDefaultValidationSessionBody(title),
  );
}
