import {
  escapeManagedHeaderText,
  normalizeEditableBodyMarkdown,
  normalizeMarkdownNewlines,
} from "./page-markdown.mjs";
import { buildValidationSessionTemplateCanonicalPath } from "../notion-ui/validation-bundle-spec.mjs";

export const RUNBOOK_ICON = { type: "emoji", emoji: "📘" };
export const BUILD_RECORD_ICON = { type: "emoji", emoji: "📦" };
export const BUILDS_CONTAINER_ICON = { type: "emoji", emoji: "🏗️" };
export const VALIDATION_SESSIONS_DATABASE_ICON = { type: "emoji", emoji: "🧪" };
export const VALIDATION_SESSION_ICON = { type: "emoji", emoji: "🧾" };
export const ACCESS_DOMAIN_ICON = { type: "emoji", emoji: "🗃️" };
export const SECRET_RECORD_ICON = { type: "emoji", emoji: "🔑" };
export const ACCESS_TOKEN_ICON = { type: "emoji", emoji: "🪪" };
export const MANAGED_DOC_ICON = { type: "emoji", emoji: "📝" };

function ensureTrailingNewline(markdown) {
  return normalizeEditableBodyMarkdown(markdown || "");
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
    "> Use this validation-session report to execute one human validation run with a checkbox-first checklist and a structured triage log.",
    "",
    "## Session Summary",
    `- Goal: Describe what "${title}" is validating and why this run exists.`,
    "- Scope: Record the environment, account, or delivery lane in scope for this run.",
    "- Tester context: Capture any device, build, or setup detail that changes how the checklist should be interpreted.",
    "",
    "## Checklist",
    "- [ ] Confirm the exact validation target, environment, and account for this run.",
    "- [ ] Execute the primary happy-path flow for this session.",
    "- [ ] Re-check any recent fixes, high-risk areas, or release blockers tied to this run.",
    "",
    "## Findings",
    "<callout>",
    "Blocker / Issue / Note: Summarize the finding in one line.",
    "</callout>",
    "",
    "<details>",
    "<summary>Optional finding detail</summary>",
    "",
    "Area:",
    "Expected:",
    "Actual:",
    "Evidence:",
    "</details>",
    "",
    "## Follow-Up",
    "- [ ] Capture the concrete next action, owner, and retest trigger.",
    "- [ ] Link the follow-up issue, PR, or runbook update if one exists.",
    "",
  ].join("\n"));
}

export function buildDefaultValidationSessionTemplateBody() {
  return ensureTrailingNewline([
    "> Use this validation-session template to create one human validation run with a checkbox-first checklist and a structured triage log.",
    "",
    "## Session Summary",
    "- Goal: Describe what this run is validating and why it exists.",
    "- Scope: Record the environment, account, or delivery lane in scope for this run.",
    "- Tester context: Capture any device, build, or setup detail that changes how the checklist should be interpreted.",
    "",
    "## Checklist",
    "- [ ] Confirm the exact validation target, environment, and account for this run.",
    "- [ ] Execute the primary happy-path flow for this session.",
    "- [ ] Re-check any recent fixes, high-risk areas, or release blockers tied to this run.",
    "",
    "## Findings",
    "<callout>",
    "Blocker / Issue / Note: Summarize the finding in one line.",
    "</callout>",
    "",
    "<details>",
    "<summary>Optional finding detail</summary>",
    "",
    "Area:",
    "Expected:",
    "Actual:",
    "Evidence:",
    "</details>",
    "",
    "## Follow-Up",
    "- [ ] Capture the concrete next action, owner, and retest trigger.",
    "- [ ] Link the follow-up issue, PR, or runbook update if one exists.",
    "",
  ].join("\n"));
}

export function buildDefaultAccessDomainBody() {
  return ensureTrailingNewline([
    "> Use this page for one access domain. Summarize the systems in scope and point to child secret pages instead of making this the default raw-value paste target.",
    "",
    "## System",
    "- <Service, vendor, or system group this domain covers>",
    "",
    "## Purpose",
    "- <What this domain page is for and what kind of access it owns>",
    "",
    "## Auth Method",
    "- <How access is generally obtained or used across this domain>",
    "",
    "## Where The Secret Lives",
    "- Canonical raw values live on child Secret Record pages or other dedicated child records below this domain page.",
    "- This page should summarize where to look next, not hold every value inline by default.",
    "",
    "## Owner",
    "- <Primary owner>",
    "",
    "## Environments Used",
    "- <Production | Test | Shared | Native | etc.>",
    "",
    "## Child Secret Records",
    "Child Secret Naming Format",
    "```plain text",
    "<System> - <Credential>",
    "```",
    "- <Secret page 1 - what it covers>",
    "- <Secret page 2 - what it covers>",
    "",
    "## Rotation / Reset",
    "- <What triggers rotation or replacement across this domain>",
    "",
    "## Related Surfaces",
    "- Related Access Root",
    "- Related Vendor Pages",
    "- Related Runbooks",
    "",
  ].join("\n"));
}

export function buildDefaultSecretRecordBody(title) {
  return ensureTrailingNewline([
    "> Use this page for one project-scoped secret. Store one canonical raw value here and describe its scope, owner, and rotation path.",
    "",
    "## Secret Record",
    `- Secret Name: ${title}`,
    "- System: <Provider or service>",
    "- Purpose: <Why this secret exists>",
    "- Auth Method: <API key / client secret / password / signing secret / etc.>",
    "",
    "## Usage & Scope",
    "- Scope: <Project-scoped / environment-scoped / limited scope>",
    "- Used By: <Service, app, workflow, or operator path>",
    "",
    "Environment Variable",
    "```plain text",
    "EXAMPLE_SECRET_NAME",
    "```",
    "",
    "## Raw Value",
    "Raw Value",
    "```plain text",
    "<paste secret here>",
    "```",
    "",
    "## Rotation / Reset",
    "- Rotation / Reset: <How to rotate or recreate this secret if exposed or invalid>",
    "",
    "## Related Surfaces",
    "- Related Access Domain",
    "- Related Vendor Page",
    "- Related Runbook or Environment Page",
    "",
  ].join("\n"));
}

export function buildDefaultAccessTokenBody() {
  return ensureTrailingNewline([
    "> Use this template for scoped token pages where the record must explain what the token can access, where it is shared, and how it is stored.",
    "",
    "## Token Record",
    "- Token Name: <Short token record name>",
    "- System: <Provider or integration>",
    "- Purpose: <Why this token exists>",
    "- Auth Method: <Integration token / PAT / service token / etc.>",
    "",
    "## Usage & Scope",
    "- Scope: <Project-scoped / workspace admin / limited scope>",
    "- Shared Root Page: <Which page root the token is shared to>",
    "",
    "Environment Variable",
    "```plain text",
    "EXAMPLE_PROJECT_NOTION_TOKEN",
    "```",
    "",
    "## Capabilities",
    "- Capabilities: <read content | update content | insert content | etc.>",
    "- Boundary Rule: <What this token must not be shared with>",
    "",
    "## Raw Value",
    "Raw Value",
    "```plain text",
    "<paste scoped token here>",
    "```",
    "",
    "## Rotation / Reset",
    "- Rotation / Reset: <How to rotate or recreate this token if exposed or invalid>",
    "",
    "## Related Surfaces",
    "- Related Access Domain",
    "- Related Secret Record Pages if any",
    "- Related Workspace or Project Page",
    "",
  ].join("\n"));
}

export function buildDefaultManagedDocBody(title) {
  return ensureTrailingNewline([
    `> Use this page as the managed source for "${title}". Keep actionable reference content here and let SNPM preserve the standard header.`,
    "",
    "## Purpose",
    `- Describe what "${title}" is for and who should read it.`,
    "",
    "## Content",
    "- Replace this placeholder with the current reference content for the page.",
    "",
  ].join("\n"));
}

export function buildManagedDocMarkdown({
  canonicalPath,
  title,
  bodyMarkdown,
  timestamp,
  sensitive = "no",
}) {
  const headerMarkdown = buildManagedHeaderMarkdown({
    purpose: `${title} is the SNPM-managed doc for this curated Notion surface.`,
    canonicalPath,
    readThisWhen: "You need the current reference content for this page.",
    sensitive,
    timestamp,
  });

  return headerMarkdown + ensureTrailingNewline(
    bodyMarkdown?.trim() ? bodyMarkdown : buildDefaultManagedDocBody(title),
  );
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

export function buildManagedValidationSessionTemplateMarkdown({ projectName, bodyMarkdown, timestamp }) {
  const canonicalPath = buildValidationSessionTemplateCanonicalPath(projectName);
  const headerMarkdown = buildManagedHeaderMarkdown({
    purpose: "This page is the SNPM-managed validation-session template for this project.",
    canonicalPath,
    readThisWhen: "You are creating a new validation-session row from the blessed validation-session UI bundle.",
    timestamp,
  });

  return headerMarkdown + ensureTrailingNewline(
    bodyMarkdown?.trim() ? bodyMarkdown : buildDefaultValidationSessionTemplateBody(),
  );
}

export function buildManagedAccessDomainMarkdown({ projectName, title, bodyMarkdown, timestamp }) {
  const canonicalPath = `Projects > ${projectName} > Access > ${title}`;
  const headerMarkdown = buildManagedHeaderMarkdown({
    purpose: `${title} is the SNPM-managed access domain page for this project.`,
    canonicalPath,
    readThisWhen: "You need the systems, owners, or child secret/token records for this access domain.",
    sensitive: "yes",
    timestamp,
  });

  return headerMarkdown + ensureTrailingNewline(
    bodyMarkdown?.trim() ? bodyMarkdown : buildDefaultAccessDomainBody(title),
  );
}

export function buildManagedSecretRecordMarkdown({ projectName, domainTitle, title, bodyMarkdown, timestamp }) {
  const canonicalPath = `Projects > ${projectName} > Access > ${domainTitle} > ${title}`;
  const headerMarkdown = buildManagedHeaderMarkdown({
    purpose: `${title} is the SNPM-managed secret record for this project access domain.`,
    canonicalPath,
    readThisWhen: "You need the canonical raw value, scope, owner, or rotation path for this secret.",
    sensitive: "yes",
    timestamp,
  });

  return headerMarkdown + ensureTrailingNewline(
    bodyMarkdown?.trim() ? bodyMarkdown : buildDefaultSecretRecordBody(title),
  );
}

export function buildManagedAccessTokenMarkdown({ projectName, domainTitle, title, bodyMarkdown, timestamp }) {
  const canonicalPath = `Projects > ${projectName} > Access > ${domainTitle} > ${title}`;
  const headerMarkdown = buildManagedHeaderMarkdown({
    purpose: `${title} is the SNPM-managed access token record for this project access domain.`,
    canonicalPath,
    readThisWhen: "You need the token scope, storage rule, or rotation path for this project token.",
    sensitive: "yes",
    timestamp,
  });

  return headerMarkdown + ensureTrailingNewline(
    bodyMarkdown?.trim() ? bodyMarkdown : buildDefaultAccessTokenBody(title),
  );
}
