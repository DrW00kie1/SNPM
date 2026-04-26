import { splitManagedPageMarkdownIfPresent } from "./page-markdown.mjs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_STALE_AFTER_DAYS = 30;

export const DEFAULT_TRUTH_AUDIT_STALE_AFTER_DAYS = DEFAULT_STALE_AFTER_DAYS;

const FINDING_ORDER = new Map([
  ["truth-audit.missing-canonical-source", 10],
  ["truth-audit.missing-last-updated", 20],
  ["truth-audit.invalid-last-updated", 30],
  ["truth-audit.stale-page", 40],
  ["truth-audit.empty-body", 50],
  ["truth-audit.placeholder-body", 60],
  ["truth-audit.missing-important-section", 70],
  ["truth-audit.placeholder-important-section", 80],
  ["truth-audit.read-failed", 90],
]);

const PLACEHOLDER_PATTERNS = [
  /\bstarter content\b/i,
  /\bplaceholder\b/i,
  /\breplace this\b/i,
  /\breplace me\b/i,
  /\bdescribe\b/i,
  /\btodo\b/i,
  /\btbd\b/i,
  /\bn\/a\b/i,
  /\bcoming soon\b/i,
  /^<[^>\n]+>$/,
  /^\[[^\]\n]+\]$/,
  /^[-*]\s*(?:<[^>\n]+>|\[[^\]\n]+\]|todo|tbd|placeholder|replace this.*|describe .*)\.?$/i,
];

const DEFAULT_IMPORTANT_SECTIONS = [
  { match: /(?:^| > )Planning > Roadmap$/i, sections: ["Source Of Truth", "Milestones"] },
  { match: /(?:^| > )Planning > Current Cycle$/i, sections: ["Current Focus", "Active Work"] },
];

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function quoteArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function extractHeaderField(headerMarkdown, fieldName) {
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escapedName}:\\s*(.*)$`, "im").exec(headerMarkdown || "");
  return match ? match[1].trim() : null;
}

function parseLocalDateTime(value) {
  const match = /^(\d{1,2})-(\d{1,2})-(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (!match) {
    return null;
  }

  const [, month, day, year, hour = "0", minute = "0", second = "0"] = match;
  const date = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ));

  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return date;
}

export function parseLastUpdated(value) {
  const trimmed = normalizeString(value);
  if (!trimmed || /^\[[^\]]+\]$/.test(trimmed)) {
    return null;
  }

  const markdownDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (markdownDate) {
    const [, year, month, day] = markdownDate;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() === Number(year)
      && date.getUTCMonth() === Number(month) - 1
      && date.getUTCDate() === Number(day)
    ) {
      return date;
    }
    return null;
  }

  const localDateTime = parseLocalDateTime(trimmed);
  if (localDateTime) {
    return localDateTime;
  }

  const parsedTime = Date.parse(trimmed);
  if (Number.isNaN(parsedTime)) {
    return null;
  }

  return new Date(parsedTime);
}

export function computeAgeDays(lastUpdated, now) {
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!(lastUpdated instanceof Date) || Number.isNaN(lastUpdated.getTime()) || Number.isNaN(nowDate.getTime())) {
    return null;
  }

  return Math.max(0, Math.floor((nowDate.getTime() - lastUpdated.getTime()) / MS_PER_DAY));
}

export function parseManagedTruthHeader(markdown) {
  const managedParts = splitManagedPageMarkdownIfPresent(markdown || "");
  const headerMarkdown = managedParts?.headerMarkdown || "";
  const bodyMarkdown = managedParts?.bodyMarkdown || "";
  const canonicalSource = extractHeaderField(headerMarkdown, "Canonical Source");
  const lastUpdated = extractHeaderField(headerMarkdown, "Last Updated");
  const sensitive = extractHeaderField(headerMarkdown, "Sensitive");

  return {
    managed: Boolean(managedParts),
    headerMarkdown,
    bodyMarkdown,
    canonicalSource,
    lastUpdated,
    sensitive,
  };
}

function normalizeBodyLine(line) {
  return line
    .replace(/^>\s*/, "")
    .replace(/^[-*]\s+(?:\[[ x]\]\s*)?/i, "")
    .replace(/^\d+\.\s+/, "")
    .trim();
}

function isPlaceholderLine(line) {
  const normalized = normalizeBodyLine(line);
  if (!normalized || /^#+\s+/.test(normalized) || /^```/.test(normalized)) {
    return true;
  }

  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isPlaceholderOnlyMarkdown(markdown) {
  const lines = String(markdown || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return false;
  }

  return lines.every(isPlaceholderLine);
}

function collectSections(markdown) {
  const sections = new Map();
  const lines = String(markdown || "").split(/\r?\n/);
  let currentSection = null;
  let buffer = [];

  function flush() {
    if (currentSection) {
      sections.set(currentSection.toLowerCase(), buffer.join("\n").trim());
    }
  }

  for (const line of lines) {
    const heading = /^##+\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      currentSection = heading[1].trim();
      buffer = [];
      continue;
    }

    if (currentSection) {
      buffer.push(line);
    }
  }

  flush();
  return sections;
}

function importantSectionsForPage(page, options) {
  if (Array.isArray(page.importantSections)) {
    return page.importantSections;
  }

  const targetPath = page.targetPath || "";
  const match = DEFAULT_IMPORTANT_SECTIONS.find((entry) => entry.match.test(targetPath));
  if (match) {
    return match.sections;
  }

  return options.importantSections || [];
}

function inferCommandFamily(page) {
  if (page.commandFamily) {
    return page.commandFamily;
  }

  if (/Planning > /i.test(page.targetPath || "") || page.surface === "planning") {
    return "page";
  }

  if (page.surface === "runbook" || / > Runbooks > /i.test(page.targetPath || "")) {
    return "runbook";
  }

  return "doc";
}

function targetFlag(commandFamily) {
  if (commandFamily === "page") {
    return "page";
  }

  if (commandFamily === "runbook") {
    return "title";
  }

  return "path";
}

function commandTarget(page, commandFamily) {
  if (page.commandTarget) {
    return page.commandTarget;
  }

  if (commandFamily === "page" && page.targetPath) {
    const marker = "Planning > ";
    const index = page.targetPath.indexOf(marker);
    if (index !== -1) {
      return page.targetPath.slice(index);
    }
  }

  if (commandFamily === "runbook" && page.targetPath) {
    return page.targetPath.split(" > ").at(-1);
  }

  return page.targetPath || page.canonicalSource || page.pageId || "unknown";
}

function accessRecordCommandArgs(page) {
  const pathParts = String(page.targetPath || "").split(" > ").map((part) => part.trim()).filter(Boolean);
  const accessIndex = pathParts.findIndex((part) => part === "Access");
  const domainTitle = page.domainTitle || (accessIndex >= 0 ? pathParts[accessIndex + 1] : null);
  const title = page.title || (accessIndex >= 0 ? pathParts[accessIndex + 2] : null);
  const args = [];

  if (page.projectName) {
    args.push(["project", page.projectName]);
  }
  if (domainTitle) {
    args.push(["domain", domainTitle]);
  }
  if (title) {
    args.push(["title", title]);
  }

  args.push(["output", "-"]);
  return args;
}

function buildSafeNextCommand(page) {
  if (page.safeNextCommand) {
    return page.safeNextCommand;
  }

  const commandFamily = inferCommandFamily(page);
  const args = commandFamily === "secret-record" || commandFamily === "access-token"
    ? accessRecordCommandArgs(page)
    : [];

  if (args.length === 0 && page.projectName) {
    args.push(["project", page.projectName]);
  }

  if (commandFamily !== "secret-record" && commandFamily !== "access-token") {
    args.push([targetFlag(commandFamily), commandTarget(page, commandFamily)]);
  }

  const parts = [`npm run ${commandFamily}-pull --`];
  for (const [flag, value] of args) {
    parts.push(`--${flag}`, quoteArg(value));
  }

  return parts.join(" ");
}

function buildFinding(page, code, message, recoveryAction, extra = {}) {
  return {
    code,
    severity: extra.severity || "warning",
    surface: page.surface || "unknown",
    targetPath: page.targetPath || null,
    pageId: page.pageId || null,
    lastUpdated: extra.lastUpdated ?? null,
    ageDays: extra.ageDays ?? null,
    message,
    safeNextCommand: buildSafeNextCommand(page),
    recoveryAction,
  };
}

function isSecretBearing(page, header) {
  return Boolean(page.secretBearing || page.excludeBodyInspection || /^yes$/i.test(header.sensitive || ""));
}

function inspectBody(page, header, options) {
  if (isSecretBearing(page, header) || options.inspectBodies === false) {
    return [];
  }

  const bodyMarkdown = header.bodyMarkdown || "";
  const trimmedBody = bodyMarkdown.trim();
  const findings = [];

  if (!trimmedBody) {
    findings.push(buildFinding(
      page,
      "truth-audit.empty-body",
      `${page.targetPath || page.pageId || "Page"} has an empty managed body.`,
      "Pull the page, add current durable content, diff it, then push with the owning command family.",
    ));
    return findings;
  }

  if (isPlaceholderOnlyMarkdown(trimmedBody)) {
    findings.push(buildFinding(
      page,
      "truth-audit.placeholder-body",
      `${page.targetPath || page.pageId || "Page"} only contains placeholder body content.`,
      "Replace starter placeholders with current durable content through the owning pull/diff/push loop.",
    ));
  }

  const sections = collectSections(bodyMarkdown);
  for (const sectionName of importantSectionsForPage(page, options)) {
    const sectionBody = sections.get(String(sectionName).toLowerCase());
    if (sectionBody === undefined) {
      findings.push(buildFinding(
        page,
        "truth-audit.missing-important-section",
        `${page.targetPath || page.pageId || "Page"} is missing important section "${sectionName}".`,
        `Add a current "${sectionName}" section through the owning pull/diff/push loop.`,
      ));
      continue;
    }

    if (!sectionBody.trim() || isPlaceholderOnlyMarkdown(sectionBody)) {
      findings.push(buildFinding(
        page,
        "truth-audit.placeholder-important-section",
        `${page.targetPath || page.pageId || "Page"} has placeholder-only content in "${sectionName}".`,
        `Replace "${sectionName}" placeholders with current durable content through the owning pull/diff/push loop.`,
      ));
    }
  }

  return findings;
}

function inspectPage(page, options) {
  if (page.readFailure) {
    return [
      buildFinding(
        page,
        "truth-audit.read-failed",
        `${page.targetPath || page.pageId || "Page"} could not be read for truth audit: ${page.readFailure}`,
        "Confirm the selected Notion token can read the page, then rerun doctor --truth-audit.",
        { severity: "warning" },
      ),
    ];
  }

  const header = parseManagedTruthHeader(page.markdown || "");
  const findings = [];
  const auditPage = {
    ...page,
    canonicalSource: header.canonicalSource,
  };

  if (!header.canonicalSource) {
    findings.push(buildFinding(
      auditPage,
      "truth-audit.missing-canonical-source",
      `${page.targetPath || page.pageId || "Page"} is missing a managed Canonical Source header.`,
      "Adopt or recreate the page with the owning SNPM command family before using it as durable truth.",
      { severity: "error" },
    ));
  }

  const parsedLastUpdated = parseLastUpdated(header.lastUpdated);
  const ageDays = computeAgeDays(parsedLastUpdated, options.now);

  if (!header.lastUpdated) {
    findings.push(buildFinding(
      auditPage,
      "truth-audit.missing-last-updated",
      `${page.targetPath || page.pageId || "Page"} is missing a managed Last Updated header.`,
      "Pull the page and publish a reviewed update so the managed header records the refresh time.",
      { severity: "error" },
    ));
  } else if (!parsedLastUpdated) {
    findings.push(buildFinding(
      auditPage,
      "truth-audit.invalid-last-updated",
      `${page.targetPath || page.pageId || "Page"} has an unparseable Last Updated header.`,
      "Rewrite the page through the owning SNPM command family so Last Updated uses a supported timestamp.",
      { severity: "error", lastUpdated: header.lastUpdated },
    ));
  } else if (ageDays > options.staleAfterDays) {
    findings.push(buildFinding(
      auditPage,
      "truth-audit.stale-page",
      `${page.targetPath || page.pageId || "Page"} is ${ageDays} days old; threshold is ${options.staleAfterDays} days.`,
      "Review the page against the current source of truth and publish a no-op or content update through the owning command family.",
      { lastUpdated: header.lastUpdated, ageDays },
    ));
  }

  findings.push(...inspectBody(auditPage, header, options));
  return findings;
}

function statusForFindings(findings) {
  if (findings.length === 0) {
    return "clean";
  }

  if (findings.some((finding) => finding.code === "truth-audit.stale-page")) {
    return "stale";
  }

  if (findings.some((finding) => (
    finding.code === "truth-audit.empty-body"
    || finding.code === "truth-audit.placeholder-body"
    || finding.code === "truth-audit.missing-important-section"
    || finding.code === "truth-audit.placeholder-important-section"
  ))) {
    return "placeholder";
  }

  return "header";
}

export async function analyzeManagedPageTruth(page, options = {}) {
  const auditOptions = {
    now: options.now ? new Date(options.now) : new Date(),
    staleAfterDays: Number.isFinite(options.staleAfterDays) ? options.staleAfterDays : DEFAULT_STALE_AFTER_DAYS,
    inspectBodies: options.inspectBodies,
    importantSections: options.importantSections,
  };
  const findings = inspectPage(page, auditOptions);

  return {
    ...page,
    status: statusForFindings(findings),
    findings,
  };
}

function compareFindings(a, b) {
  return (a.surface || "").localeCompare(b.surface || "")
    || (a.targetPath || "").localeCompare(b.targetPath || "")
    || (a.pageId || "").localeCompare(b.pageId || "")
    || ((FINDING_ORDER.get(a.code) || 999) - (FINDING_ORDER.get(b.code) || 999))
    || a.code.localeCompare(b.code)
    || a.message.localeCompare(b.message);
}

export function summarizeTruthAudit(findings, checkedCount = 0) {
  const sortedFindings = [...findings].sort(compareFindings);
  const recommendations = [...new Set(sortedFindings.map((finding) => finding.recoveryAction))].sort();
  const safeNextCommands = [...new Set(sortedFindings.map((finding) => finding.safeNextCommand))].sort();

  return {
    checkedCount,
    cleanCount: Math.max(0, checkedCount - new Set(sortedFindings.map((finding) => `${finding.surface}:${finding.targetPath}:${finding.pageId}`)).size),
    staleCount: sortedFindings.filter((finding) => finding.code === "truth-audit.stale-page").length,
    placeholderCount: sortedFindings.filter((finding) => (
      finding.code === "truth-audit.empty-body"
      || finding.code === "truth-audit.placeholder-body"
      || finding.code === "truth-audit.missing-important-section"
      || finding.code === "truth-audit.placeholder-important-section"
    )).length,
    missingHeaderCount: sortedFindings.filter((finding) => (
      finding.code === "truth-audit.missing-canonical-source"
      || finding.code === "truth-audit.missing-last-updated"
      || finding.code === "truth-audit.invalid-last-updated"
    )).length,
    findings: sortedFindings,
    recommendations,
    safeNextCommands,
  };
}

export function buildTruthAuditSummary(analyses, options = {}) {
  const checkedAnalyses = Array.isArray(analyses) ? analyses : [];
  return {
    ...summarizeTruthAudit(checkedAnalyses.flatMap((entry) => entry.findings || []), checkedAnalyses.length),
    cleanCount: checkedAnalyses.filter((entry) => entry.status === "clean").length,
    staleAfterDays: Number.isFinite(options.staleAfterDays) ? options.staleAfterDays : DEFAULT_STALE_AFTER_DAYS,
  };
}

export function auditTruthPages(pages, options = {}) {
  const auditOptions = {
    now: options.now ? new Date(options.now) : new Date(),
    staleAfterDays: Number.isFinite(options.staleAfterDays) ? options.staleAfterDays : DEFAULT_STALE_AFTER_DAYS,
    inspectBodies: options.inspectBodies,
    importantSections: options.importantSections,
  };
  const checkedPages = Array.isArray(pages) ? pages : [];
  const findings = checkedPages.flatMap((page) => inspectPage(page, auditOptions));

  return {
    staleAfterDays: auditOptions.staleAfterDays,
    ...summarizeTruthAudit(findings, checkedPages.length),
  };
}
