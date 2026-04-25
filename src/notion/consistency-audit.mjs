import { splitManagedPageMarkdownIfPresent } from "./page-markdown.mjs";

const RULESET = Object.freeze({
  id: "snpm.project-consistency.v1",
  version: 1,
  rules: [
    "roadmap-current-cycle-active-marker",
    "runbook-reference-resolution",
    "access-structural-reference-resolution",
  ],
});

const SEVERITIES = ["error", "warning", "info"];

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value) {
  return normalizeString(value).replace(/\s+/g, " ").toLowerCase();
}

function quoteArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function stripTrailingReferencePunctuation(value) {
  return normalizeString(value)
    .replace(/\]\([^)]*\)$/g, "")
    .replace(/[`*_]+$/g, "")
    .replace(/[.,;:)]+$/g, "")
    .trim();
}

function managedBodyMarkdown(page) {
  const markdown = normalizeString(page?.markdown);
  const managedParts = splitManagedPageMarkdownIfPresent(markdown);
  return managedParts ? managedParts.bodyMarkdown : markdown;
}

function pageDescriptor(page) {
  return {
    surface: page.surface || "managed-page",
    type: page.type || null,
    title: page.title || null,
    pageId: page.pageId || null,
    targetPath: page.targetPath || null,
  };
}

function buildPagePullCommand(page, projectName, projectTokenEnv) {
  if (page.safeNextCommand) {
    return page.safeNextCommand;
  }
  const commandFamily = page.commandFamily || (page.surface === "planning" ? "page" : "doc");
  const commandTarget = page.commandTarget || page.targetPath || page.title || page.pageId || "unknown";
  const flag = commandFamily === "page" ? "page" : commandFamily === "runbook" ? "title" : "path";
  const parts = [`npm run ${commandFamily}-pull --`];
  if (projectName) {
    parts.push("--project", quoteArg(projectName));
  }
  parts.push(`--${flag}`, quoteArg(commandTarget), "--output", "-");
  if (projectTokenEnv) {
    parts.push("--project-token-env", projectTokenEnv);
  }
  return parts.join(" ");
}

function summarizeReadFailure(readFailure) {
  const text = normalizeString(readFailure);
  const statusMatch = /\bfailed:\s*(\d{3})\b/i.exec(text);
  if (statusMatch) {
    return {
      message: `Notion read failed with HTTP ${statusMatch[1]}.`,
      state: {
        category: "remote-read",
        statusCode: Number(statusMatch[1]),
      },
    };
  }

  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "unknown read failure";
  return {
    message: firstLine.length > 160 ? `${firstLine.slice(0, 157)}...` : firstLine,
    state: {
      category: "remote-read",
    },
  };
}

function buildRecommendCommand({ projectName, projectTokenEnv, intent, title, domainTitle }) {
  const parts = ["npm run recommend --"];
  if (projectName) {
    parts.push("--project", quoteArg(projectName));
  }
  parts.push("--intent", intent);
  if (domainTitle) {
    parts.push("--domain", quoteArg(domainTitle));
  }
  if (title) {
    parts.push("--title", quoteArg(title));
  }
  if (projectTokenEnv) {
    parts.push("--project-token-env", projectTokenEnv);
  }
  return parts.join(" ");
}

function findPageByPathEnding(pages, suffix) {
  const normalizedSuffix = normalizeKey(suffix);
  return pages.find((page) => normalizeKey(page.targetPath || "").endsWith(normalizedSuffix));
}

function collectSections(markdown) {
  const sections = [];
  const lines = String(markdown || "").split(/\r?\n/);
  let current = { heading: "", body: [] };

  for (const line of lines) {
    const headingMatch = /^(#{2,6})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      sections.push(current);
      current = { heading: headingMatch[2].trim(), body: [] };
      continue;
    }
    current.body.push(line);
  }
  sections.push(current);
  return sections
    .filter((section) => section.body.join("\n").trim())
    .map((section) => ({
      heading: section.heading,
      body: section.body.join("\n"),
    }));
}

function relevantActiveSections(markdown) {
  return collectSections(markdown).filter((section) => (
    !section.heading
    || /\b(active|current|cycle|milestones?|sprints?|focus|status)\b/i.test(section.heading)
  ));
}

function addMarker(markers, type, value, evidence) {
  const normalizedValue = normalizeString(value).replace(/\s+/g, " ");
  if (!normalizedValue) {
    return;
  }
  const key = `${type}:${normalizeKey(normalizedValue)}`;
  if (!markers.some((marker) => marker.key === key)) {
    markers.push({
      type,
      value: normalizedValue,
      key,
      evidence,
    });
  }
}

export function extractActiveMarkers(markdown) {
  const body = managedBodyMarkdown({ markdown });
  const markers = [];
  const explicitMarkerPattern = /<!--\s*snpm:active-(sprint|milestone|branch)\s*=\s*([^>\n-][^>\n]*?)\s*-->/gi;
  for (const match of body.matchAll(explicitMarkerPattern)) {
    addMarker(markers, match[1].toLowerCase(), match[2], "snpm active marker");
  }

  for (const section of relevantActiveSections(body)) {
    const selector = section.heading ? `## ${section.heading}` : "document body";
    const lines = section.body.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const explicitField = /(?:^|[-*]\s+|\|\s*)(?:active|current)\s+(sprint|milestone|branch)\s*[:=-]\s*([^|#\n]+)/i.exec(trimmed);
      if (explicitField) {
        addMarker(markers, explicitField[1].toLowerCase(), explicitField[2], selector);
      }

      for (const sprintMatch of trimmed.matchAll(/\bSprint\s+\d+(?:\.\d+)?[A-Z]?\b/gi)) {
        addMarker(markers, "sprint", sprintMatch[0], selector);
      }

      for (const branchMatch of trimmed.matchAll(/\bcodex\/[A-Za-z0-9._/-]+\b/g)) {
        addMarker(markers, "branch", branchMatch[0], selector);
      }
    }
  }

  return markers;
}

function extractReferenceLines(markdown) {
  return managedBodyMarkdown({ markdown }).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function extractRunbookReferences(markdown) {
  const references = [];
  for (const line of extractReferenceLines(markdown)) {
    for (const match of line.matchAll(/(?:^|[\s([`])Runbooks\s*>\s*([^`\]\n|]+)/gi)) {
      const title = stripTrailingReferencePunctuation(match[1]);
      if (title) {
        references.push({ title, raw: match[0].trim() });
      }
    }
    for (const match of line.matchAll(/\brunbook:\s*([^`\]\n|]+)/gi)) {
      const title = stripTrailingReferencePunctuation(match[1]);
      if (title) {
        references.push({ title, raw: match[0].trim() });
      }
    }
  }
  return dedupeReferences(references, (ref) => normalizeKey(ref.title));
}

export function extractAccessReferences(markdown) {
  const references = [];
  for (const line of extractReferenceLines(markdown)) {
    for (const match of line.matchAll(/(?:^|[\s([`])Access\s*>\s*([^>`\]\n|]+?)\s*>\s*([^`\]\n|]+)/gi)) {
      const domainTitle = stripTrailingReferencePunctuation(match[1]);
      const title = stripTrailingReferencePunctuation(match[2]);
      if (domainTitle && title) {
        references.push({ domainTitle, title, raw: match[0].trim() });
      }
    }
    for (const match of line.matchAll(/\baccess:\s*([^>`\]\n|]+?)\s*>\s*([^`\]\n|]+)/gi)) {
      const domainTitle = stripTrailingReferencePunctuation(match[1]);
      const title = stripTrailingReferencePunctuation(match[2]);
      if (domainTitle && title) {
        references.push({ domainTitle, title, raw: match[0].trim() });
      }
    }
  }
  return dedupeReferences(references, (ref) => `${normalizeKey(ref.domainTitle)}>${normalizeKey(ref.title)}`);
}

function dedupeReferences(references, keyFn) {
  const seen = new Set();
  const output = [];
  for (const reference of references) {
    const key = keyFn(reference);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(reference);
  }
  return output;
}

function severityCounts(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const finding of findings) {
    counts[finding.severity] = (counts[finding.severity] || 0) + 1;
  }
  return counts;
}

function compareFindings(a, b) {
  return (a.code || "").localeCompare(b.code || "")
    || (a.targetPath || "").localeCompare(b.targetPath || "")
    || (a.referencedTargetPath || "").localeCompare(b.referencedTargetPath || "")
    || (a.message || "").localeCompare(b.message || "");
}

function makeFinding({
  code,
  severity = "warning",
  confidence = 0.9,
  message,
  page,
  targetPath,
  referencedTargetPath,
  evidence,
  safeNextCommand,
  safeNextCommands,
  recoveryAction,
  extra = {},
}) {
  const commands = safeNextCommands || (safeNextCommand ? [safeNextCommand] : []);
  return {
    code,
    severity,
    confidence,
    message,
    entry: page ? pageDescriptor(page) : undefined,
    surface: page?.surface || extra.surface || "project",
    targetPath: targetPath || page?.targetPath || null,
    pageId: page?.pageId || null,
    referencedTargetPath: referencedTargetPath || null,
    evidence: evidence || [],
    safeNextCommand: commands[0] || null,
    safeNextCommands: commands,
    recoveryAction,
    ...extra,
  };
}

function markerValues(markers, type) {
  return markers.filter((marker) => marker.type === type);
}

function markerSetsOverlap(left, right) {
  const rightKeys = new Set(right.map((marker) => marker.key));
  return left.some((marker) => rightKeys.has(marker.key));
}

function buildRoadmapCurrentCycleFindings({ pages, projectName, projectTokenEnv }) {
  const roadmap = findPageByPathEnding(pages, "Planning > Roadmap");
  const currentCycle = findPageByPathEnding(pages, "Planning > Current Cycle");
  if (!roadmap || !currentCycle || roadmap.readFailure || currentCycle.readFailure) {
    return [];
  }

  const roadmapMarkers = extractActiveMarkers(roadmap.markdown || "");
  const currentCycleMarkers = extractActiveMarkers(currentCycle.markdown || "");
  const findings = [];
  for (const type of ["sprint", "milestone", "branch"]) {
    const roadmapTypeMarkers = markerValues(roadmapMarkers, type);
    const currentTypeMarkers = markerValues(currentCycleMarkers, type);
    if (roadmapTypeMarkers.length === 0 || currentTypeMarkers.length === 0 || markerSetsOverlap(roadmapTypeMarkers, currentTypeMarkers)) {
      continue;
    }

    findings.push(makeFinding({
      code: "consistency.roadmap-current-cycle.active-marker-mismatch",
      severity: "warning",
      confidence: 0.82,
      message: `Roadmap and Current Cycle explicit active ${type} markers do not match.`,
      page: roadmap,
      referencedTargetPath: currentCycle.targetPath,
      evidence: [
        {
          targetPath: roadmap.targetPath,
          selector: roadmapTypeMarkers[0]?.evidence || "active marker",
          markers: roadmapTypeMarkers.map((marker) => marker.value),
        },
        {
          targetPath: currentCycle.targetPath,
          selector: currentTypeMarkers[0]?.evidence || "active marker",
          markers: currentTypeMarkers.map((marker) => marker.value),
        },
      ],
      safeNextCommands: [
        buildPagePullCommand(roadmap, projectName, projectTokenEnv),
        buildPagePullCommand(currentCycle, projectName, projectTokenEnv),
      ],
      recoveryAction: "Review Roadmap and Current Cycle, then update the stale page through the page pull/diff/push loop.",
      extra: {
        markerType: type,
        targets: [pageDescriptor(roadmap), pageDescriptor(currentCycle)],
      },
    }));
    break;
  }
  return findings;
}

function runbookMap(inventory) {
  const entries = Array.isArray(inventory?.runbooks) ? inventory.runbooks : [];
  return new Map(entries.map((entry) => [normalizeKey(entry.title), entry]));
}

function accessDomainMap(inventory) {
  const entries = Array.isArray(inventory?.domains) ? inventory.domains : [];
  return new Map(entries.map((domain) => [normalizeKey(domain.title), {
    ...domain,
    recordsByTitle: new Map((domain.records || []).map((record) => [normalizeKey(record.title), record])),
  }]));
}

function buildReferenceFindings({ pages, projectName, projectTokenEnv, runbookInventory, accessInventory }) {
  const findings = [];
  const runbooksByTitle = runbookMap(runbookInventory);
  const accessByDomain = accessDomainMap(accessInventory);

  for (const page of pages) {
    if (page.readFailure) {
      const failure = summarizeReadFailure(page.readFailure);
      findings.push(makeFinding({
        code: "consistency.page-read-failed",
        severity: "warning",
        confidence: 1,
        message: `${page.targetPath || page.pageId || "Page"} could not be read for consistency audit. ${failure.message}`,
        page,
        safeNextCommand: buildPagePullCommand(page, projectName, projectTokenEnv),
        recoveryAction: "Confirm the selected Notion token can read the page, then rerun doctor --consistency-audit.",
        extra: {
          failure: failure.state,
        },
      }));
      continue;
    }

    for (const reference of extractRunbookReferences(page.markdown || "")) {
      if (runbooksByTitle.has(normalizeKey(reference.title))) {
        continue;
      }
      findings.push(makeFinding({
        code: "consistency.runbook-reference.missing",
        severity: "warning",
        confidence: 0.88,
        message: `${page.targetPath || "Managed page"} references missing runbook "${reference.title}".`,
        page,
        referencedTargetPath: `Projects > ${projectName} > Runbooks > ${reference.title}`,
        evidence: [{ reference: reference.raw, title: reference.title }],
        safeNextCommand: buildRecommendCommand({
          projectName,
          projectTokenEnv,
          intent: "runbook",
          title: reference.title,
        }),
        recoveryAction: "Create, adopt, or correct the referenced runbook through the runbook command family.",
        extra: {
          referencedSurface: "runbook",
          referencedTitle: reference.title,
        },
      }));
    }

    for (const reference of extractAccessReferences(page.markdown || "")) {
      const domain = accessByDomain.get(normalizeKey(reference.domainTitle));
      if (!domain) {
        findings.push(makeFinding({
          code: "consistency.access-reference.missing-domain",
          severity: "warning",
          confidence: 0.88,
          message: `${page.targetPath || "Managed page"} references missing Access domain "${reference.domainTitle}".`,
          page,
          referencedTargetPath: `Projects > ${projectName} > Access > ${reference.domainTitle}`,
          evidence: [{ reference: reference.raw, domainTitle: reference.domainTitle, title: reference.title }],
          safeNextCommand: buildRecommendCommand({
            projectName,
            projectTokenEnv,
            intent: "secret",
            domainTitle: reference.domainTitle,
            title: reference.title,
          }),
          recoveryAction: "Create, adopt, or correct the referenced Access domain before relying on the record reference.",
          extra: {
            referencedSurface: "access",
            referencedDomainTitle: reference.domainTitle,
            referencedTitle: reference.title,
          },
        }));
        continue;
      }

      if (domain.recordsByTitle.has(normalizeKey(reference.title))) {
        continue;
      }

      findings.push(makeFinding({
        code: "consistency.access-reference.missing-record",
        severity: "warning",
        confidence: 0.88,
        message: `${page.targetPath || "Managed page"} references missing Access record "${reference.domainTitle} > ${reference.title}".`,
        page,
        referencedTargetPath: `${domain.targetPath || `Projects > ${projectName} > Access > ${reference.domainTitle}`} > ${reference.title}`,
        evidence: [{ reference: reference.raw, domainTitle: reference.domainTitle, title: reference.title }],
        safeNextCommand: buildRecommendCommand({
          projectName,
          projectTokenEnv,
          intent: "secret",
          domainTitle: reference.domainTitle,
          title: reference.title,
        }),
        recoveryAction: "Create, adopt, generate, or correct the referenced Access record through the Access command family.",
        extra: {
          referencedSurface: "access",
          referencedDomainTitle: reference.domainTitle,
          referencedTitle: reference.title,
        },
      }));
    }
  }

  return findings;
}

export function buildConsistencyAuditSummary(analysis) {
  if (analysis?.advisory === true && Array.isArray(analysis.findings)) {
    return analysis;
  }

  const findings = Array.isArray(analysis) ? analysis : analysis?.findings || [];
  const sortedFindings = [...findings].sort(compareFindings);
  const checkedCount = Number.isFinite(analysis?.checkedCount) ? analysis.checkedCount : 0;
  const affectedTargets = new Set(sortedFindings.map((finding) => finding.targetPath || finding.pageId || finding.code));
  return {
    advisory: true,
    status: sortedFindings.length > 0 ? "findings" : "clean",
    ruleset: RULESET,
    checkedCount,
    cleanCount: Math.max(0, checkedCount - affectedTargets.size),
    findingCount: sortedFindings.length,
    severityCounts: severityCounts(sortedFindings),
    bySeverity: severityCounts(sortedFindings),
    findings: sortedFindings,
    recommendations: [...new Set(sortedFindings.map((finding) => finding.recoveryAction).filter(Boolean))].sort(),
    safeNextCommands: [...new Set(sortedFindings.flatMap((finding) => finding.safeNextCommands || []).filter(Boolean))].sort(),
  };
}

export function auditConsistency(context = {}) {
  const pages = Array.isArray(context.pages) ? context.pages : Array.isArray(context.managedPages) ? context.managedPages : [];
  const projectName = context.projectName || "Project";
  const projectTokenEnv = context.projectTokenEnv;
  const findings = [
    ...buildRoadmapCurrentCycleFindings({
      pages,
      projectName,
      projectTokenEnv,
    }),
    ...buildReferenceFindings({
      pages,
      projectName,
      projectTokenEnv,
      runbookInventory: context.runbookInventory || context.inventory?.runbooks,
      accessInventory: context.accessInventory || context.inventory?.access,
    }),
  ];

  return buildConsistencyAuditSummary({
    checkedCount: pages.length,
    findings,
  });
}

export const analyzeConsistencyAudit = auditConsistency;
