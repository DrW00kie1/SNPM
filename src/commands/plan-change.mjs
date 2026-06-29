import { createHash } from "node:crypto";

import { validateSyncManifest } from "../notion/sync-manifest.mjs";

const SUPPORTED_TARGET_TYPES = new Set([
  "planning",
  "project-doc",
  "runbook",
  "secret",
  "token",
  "generated-secret",
  "generated-token",
  "template-doc",
  "workspace-doc",
  "implementation-note",
  "design-spec",
  "task-breakdown",
  "investigation",
  "repo-doc",
  "generated-output",
]);

const REPO_OWNED_TARGET_TYPES = new Set([
  "implementation-note",
  "design-spec",
  "task-breakdown",
  "investigation",
  "repo-doc",
  "generated-output",
]);

const MANIFEST_DRAFT_VERSION = 2;
const MANIFEST_DRAFT_TARGETS = new Map([
  ["planning", { kind: "planning-page", targetField: "pagePath", fileDir: "planning", dropLeadingSegment: "planning" }],
  ["project-doc", { kind: "project-doc", targetField: "docPath", fileDir: null }],
  ["template-doc", { kind: "template-doc", targetField: "docPath", fileDir: null }],
  ["workspace-doc", { kind: "workspace-doc", targetField: "docPath", fileDir: null }],
  ["runbook", { kind: "runbook", targetField: "title", fileDir: "runbooks" }],
]);

const RESERVED_FILE_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requireString(value, path) {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new Error(`${path} must be a non-empty string.`);
  }
  return normalized;
}

function optionalString(value, path) {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requireString(value, path);
}

function normalizeTarget(rawTarget, index, defaultProjectName) {
  const targetPath = `targets[${index}]`;
  if (!isPlainObject(rawTarget)) {
    throw new Error(`${targetPath} must be an object.`);
  }

  const type = requireString(rawTarget.type, `${targetPath}.type`);
  if (!SUPPORTED_TARGET_TYPES.has(type)) {
    throw new Error(`${targetPath}.type "${type}" is unsupported. Supported target types are: ${[...SUPPORTED_TARGET_TYPES].join(", ")}.`);
  }

  const projectName = optionalString(rawTarget.projectName, `${targetPath}.projectName`) || defaultProjectName;
  const projectTokenEnv = optionalString(rawTarget.projectTokenEnv, `${targetPath}.projectTokenEnv`);
  const workspaceName = optionalString(rawTarget.workspaceName, `${targetPath}.workspaceName`);
  const plan = {
    index,
    type,
    ...(projectName ? { projectName } : {}),
    ...(projectTokenEnv ? { projectTokenEnv } : {}),
    ...(workspaceName ? { workspaceName } : {}),
  };

  if (type === "planning") {
    if (!projectName) {
      throw new Error(`${targetPath}.projectName is required for planning targets.`);
    }
    plan.pagePath = requireString(rawTarget.pagePath, `${targetPath}.pagePath`);
    return plan;
  }

  if (type === "project-doc") {
    if (!projectName) {
      throw new Error(`${targetPath}.projectName is required for project-doc targets.`);
    }
    plan.docPath = requireString(rawTarget.docPath, `${targetPath}.docPath`);
    return plan;
  }

  if (type === "runbook") {
    if (!projectName) {
      throw new Error(`${targetPath}.projectName is required for runbook targets.`);
    }
    plan.title = requireString(rawTarget.title, `${targetPath}.title`);
    return plan;
  }

  if (type === "secret" || type === "token" || type === "generated-secret" || type === "generated-token") {
    if (!projectName) {
      throw new Error(`${targetPath}.projectName is required for ${type} targets.`);
    }
    plan.domainTitle = requireString(rawTarget.domainTitle, `${targetPath}.domainTitle`);
    plan.title = requireString(rawTarget.title, `${targetPath}.title`);
    return plan;
  }

  if (type === "template-doc" || type === "workspace-doc") {
    plan.docPath = requireString(rawTarget.docPath, `${targetPath}.docPath`);
    return plan;
  }

  if (REPO_OWNED_TARGET_TYPES.has(type)) {
    if (!projectName) {
      throw new Error(`${targetPath}.projectName is required for ${type} targets.`);
    }
    plan.repoPath = requireString(rawTarget.repoPath, `${targetPath}.repoPath`);
    return plan;
  }

  throw new Error(`${targetPath}.type "${type}" is unsupported.`);
}

function recommendationArgsForTarget(target) {
  return {
    projectName: target.projectName,
    projectTokenEnv: target.projectTokenEnv,
    intent: target.type,
    pagePath: target.pagePath,
    docPath: target.docPath,
    title: target.title,
    domainTitle: target.domainTitle,
    repoPath: target.repoPath,
    workspaceName: target.workspaceName,
  };
}

function compactRecommendation(recommendation, target) {
  return {
    index: target.index,
    type: target.type,
    ok: recommendation.ok !== false,
    recommendedHome: recommendation.recommendedHome,
    surface: recommendation.surface,
    targetPath: recommendation.targetPath,
    repoPath: recommendation.repoPath,
    reason: recommendation.reason,
    warnings: Array.isArray(recommendation.warnings) ? recommendation.warnings : [],
    nextCommands: Array.isArray(recommendation.nextCommands) ? recommendation.nextCommands : [],
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function buildPlanReference(normalized) {
  const hash = createHash("sha256")
    .update(stableStringify({
      goal: normalized.goal,
      projectName: normalized.projectName || null,
      workspaceName: normalized.workspaceName || "infrastructure-hq",
      targets: normalized.targets,
    }))
    .digest("hex");

  return {
    id: `plan_${hash.slice(0, 16)}`,
  };
}

function compactAuditFinding(finding) {
  return {
    code: finding.code,
    severity: finding.severity,
    surface: finding.surface,
    targetPath: finding.targetPath,
    message: finding.message,
    safeNextCommand: finding.safeNextCommand,
    recoveryAction: finding.recoveryAction,
  };
}

function findingsFromAudit(audit) {
  return Array.isArray(audit?.findings) ? audit.findings.map(compactAuditFinding) : [];
}

function matchFindingToRecommendation(finding, recommendation) {
  if (!finding || !recommendation) {
    return false;
  }

  if (finding.targetPath && recommendation.targetPath) {
    return finding.targetPath === recommendation.targetPath
      || finding.targetPath.endsWith(` > ${recommendation.targetPath}`)
      || recommendation.targetPath.endsWith(` > ${finding.targetPath}`);
  }

  return Boolean(finding.surface && recommendation.surface && finding.surface === recommendation.surface);
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim() !== ""))];
}

export function buildPlanQualityGates({ auditResult, recommendations }) {
  const truthFindings = findingsFromAudit(auditResult?.truthAudit);
  const consistencyFindings = findingsFromAudit(auditResult?.consistencyAudit);
  const allFindings = [...truthFindings, ...consistencyFindings];
  const targetFindings = recommendations.map((recommendation) => ({
    index: recommendation.index,
    type: recommendation.type,
    surface: recommendation.surface,
    targetPath: recommendation.targetPath,
    findings: allFindings.filter((finding) => matchFindingToRecommendation(finding, recommendation)),
  }));

  return {
    advisory: true,
    checked: true,
    status: allFindings.length > 0 ? "advisory-findings" : "pass",
    findingsCount: allFindings.length,
    truthAudit: {
      checkedCount: auditResult?.truthAudit?.checkedCount || 0,
      findingCount: truthFindings.length,
      staleCount: auditResult?.truthAudit?.staleCount || 0,
      placeholderCount: auditResult?.truthAudit?.placeholderCount || 0,
      missingHeaderCount: auditResult?.truthAudit?.missingHeaderCount || 0,
    },
    consistencyAudit: {
      checkedCount: auditResult?.consistencyAudit?.checkedCount || 0,
      findingCount: auditResult?.consistencyAudit?.findingCount || consistencyFindings.length,
      severityCounts: auditResult?.consistencyAudit?.severityCounts || { error: 0, warning: 0, info: 0 },
    },
    targetFindings,
    safeNextCommands: uniqueStrings([
      ...(Array.isArray(auditResult?.truthAudit?.safeNextCommands) ? auditResult.truthAudit.safeNextCommands : []),
      ...(Array.isArray(auditResult?.consistencyAudit?.safeNextCommands) ? auditResult.consistencyAudit.safeNextCommands : []),
      ...allFindings.map((finding) => finding.safeNextCommand),
    ]),
    recoveryActions: uniqueStrings(allFindings.map((finding) => finding.recoveryAction)),
  };
}

function manifestUnsupportedReason(type) {
  if (type === "secret" || type === "token" || type === "generated-secret" || type === "generated-token") {
    return "Access secret and token records are excluded from manifest v2 drafts; use the Access command family.";
  }

  if (REPO_OWNED_TARGET_TYPES.has(type)) {
    return "Repo-owned targets are not Notion manifest entries.";
  }

  return "Target type is not supported by manifest v2 drafts.";
}

function summarizeUnsupportedTarget(target) {
  return {
    index: target.index,
    type: target.type,
    reason: manifestUnsupportedReason(target.type),
    ...(target.pagePath ? { pagePath: target.pagePath } : {}),
    ...(target.docPath ? { docPath: target.docPath } : {}),
    ...(target.title ? { title: target.title } : {}),
    ...(target.domainTitle ? { domainTitle: target.domainTitle } : {}),
    ...(target.repoPath ? { repoPath: target.repoPath } : {}),
    ...(target.projectName ? { projectName: target.projectName } : {}),
  };
}

function safeSlug(value) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeValue = slug || "target";
  return RESERVED_FILE_NAMES.has(safeValue) ? `${safeValue}-target` : safeValue;
}

function manifestFileSegments(config, targetValue) {
  if (config.targetField === "title") {
    return [safeSlug(targetValue)];
  }

  const segments = targetValue
    .split(">")
    .map((segment) => safeSlug(segment.trim()))
    .filter(Boolean);

  if (config.dropLeadingSegment && segments[0] === config.dropLeadingSegment) {
    segments.shift();
  }

  return segments.length > 0 ? segments : ["target"];
}

function uniqueManifestFile(config, targetValue, usedFiles) {
  const pathSegments = config.fileDir
    ? ["notion", config.fileDir, ...manifestFileSegments(config, targetValue)]
    : ["notion", ...manifestFileSegments(config, targetValue)];
  const baseFile = `${pathSegments.join("/")}.md`;
  let file = baseFile;
  let suffix = 2;

  while (usedFiles.has(file.toLowerCase())) {
    file = baseFile.replace(/\.md$/u, `-${suffix}.md`);
    suffix += 1;
  }

  usedFiles.add(file.toLowerCase());
  return file;
}

function buildManifestNextCommands({ projectName }) {
  const projectFlag = projectName ? ` --project "${projectName}"` : "";
  return [
    {
      kind: "manual",
      command: "Save manifestDraft JSON to a reviewed manifest file such as snpm.manifest.json.",
      reason: "plan-change returns a draft object only and does not write files.",
    },
    {
      kind: "command",
      command: `node src/cli.mjs sync check --manifest snpm.manifest.json${projectFlag}`,
      reason: "Read the approved Notion targets and compare them with local files before editing.",
    },
    {
      kind: "command",
      command: `node src/cli.mjs sync pull --manifest snpm.manifest.json${projectFlag} --apply`,
      reason: "Create or refresh local editing files and sidecars before making changes.",
    },
    {
      kind: "command",
      command: `node src/cli.mjs sync push --manifest snpm.manifest.json${projectFlag}`,
      reason: "Preview Notion mutations before any apply.",
    },
    {
      kind: "command",
      command: `node src/cli.mjs sync push --manifest snpm.manifest.json${projectFlag} --apply`,
      reason: "Apply remains explicit and is governed by existing manifest v2 mutation-budget rules.",
    },
    {
      kind: "command",
      command: `node src/cli.mjs doctor --truth-audit --consistency-audit${projectFlag}`,
      reason: "Optional advisory audit before coordinated documentation edits.",
    },
  ];
}

export function buildPlanChangeManifestDraft(normalized) {
  const entries = [];
  const manifestUnsupportedTargets = [];
  const usedFiles = new Set();

  for (const target of normalized.targets) {
    const config = MANIFEST_DRAFT_TARGETS.get(target.type);
    if (!config) {
      manifestUnsupportedTargets.push(summarizeUnsupportedTarget(target));
      continue;
    }

    const targetValue = target[config.targetField];
    entries.push({
      kind: config.kind,
      [config.targetField]: targetValue,
      file: uniqueManifestFile(config, targetValue, usedFiles),
    });
  }

  const manifestDraft = {
    version: MANIFEST_DRAFT_VERSION,
    workspace: normalized.workspaceName || "infrastructure-hq",
    project: normalized.projectName || null,
    entries,
  };

  if (entries.length > 0) {
    validateSyncManifest(manifestDraft, { manifestPath: "snpm.manifest.json" });
  }

  return {
    manifestDraft,
    manifestUnsupportedTargets,
    manifestNextCommands: buildManifestNextCommands({ projectName: normalized.projectName }),
  };
}

export function normalizePlanChangeInput(input) {
  if (!isPlainObject(input)) {
    throw new Error("plan-change input must be a JSON object.");
  }

  const goal = requireString(input.goal, "goal");
  if (!Array.isArray(input.targets) || input.targets.length === 0) {
    throw new Error("targets must be a non-empty array.");
  }

  const projectName = optionalString(input.projectName, "projectName");
  const projectTokenEnv = optionalString(input.projectTokenEnv, "projectTokenEnv");
  const workspaceName = optionalString(input.workspaceName, "workspaceName");
  const targets = input.targets.map((target, index) => {
    const normalized = normalizeTarget(target, index, projectName);
    return {
      ...normalized,
      ...(normalized.projectTokenEnv ? {} : projectTokenEnv ? { projectTokenEnv } : {}),
      ...(normalized.workspaceName ? {} : workspaceName ? { workspaceName } : {}),
    };
  });

  return {
    goal,
    ...(projectName ? { projectName } : {}),
    ...(projectTokenEnv ? { projectTokenEnv } : {}),
    ...(workspaceName ? { workspaceName } : {}),
    targets,
  };
}

export async function planChange(input, {
  qualityGates = false,
  qualityGateImpl,
  recommendImpl,
  manifestDraft = false,
  staleAfterDays,
} = {}) {
  if (typeof recommendImpl !== "function") {
    throw new Error("planChange requires a recommendImpl function.");
  }
  if (typeof manifestDraft !== "boolean") {
    throw new Error("planChange manifestDraft option must be a boolean when provided.");
  }
  if (typeof qualityGates !== "boolean") {
    throw new Error("planChange qualityGates option must be a boolean when provided.");
  }
  if (qualityGates && typeof qualityGateImpl !== "function") {
    throw new Error("planChange qualityGates requires a qualityGateImpl function.");
  }

  const normalized = normalizePlanChangeInput(input);
  if (qualityGates && !normalized.projectName) {
    throw new Error('plan-change --quality-gates requires --project "Project Name" or top-level projectName.');
  }
  if (qualityGates && !normalized.projectTokenEnv) {
    throw new Error("plan-change --quality-gates requires --project-token-env PROJECT_NAME_NOTION_TOKEN or top-level projectTokenEnv.");
  }
  const recommendations = [];

  for (const target of normalized.targets) {
    const recommendation = await recommendImpl(recommendationArgsForTarget(target));
    recommendations.push(compactRecommendation(recommendation, target));
  }

  const nextCommands = recommendations.flatMap((entry) => entry.nextCommands);
  const warnings = recommendations.flatMap((entry) => entry.warnings);
  const ok = recommendations.every((entry) => entry.ok);
  const result = {
    ok,
    command: "plan-change",
    goal: normalized.goal,
    projectName: normalized.projectName || null,
    targets: normalized.targets,
    recommendations,
    nextCommands,
    warnings,
  };

  if (manifestDraft) {
    Object.assign(result, buildPlanChangeManifestDraft(normalized));
  }

  if (qualityGates) {
    const auditResult = await qualityGateImpl({
      projectName: normalized.projectName,
      projectTokenEnv: normalized.projectTokenEnv,
      staleAfterDays,
      workspaceName: normalized.workspaceName || "infrastructure-hq",
    });
    result.planReference = buildPlanReference(normalized);
    result.qualityGates = buildPlanQualityGates({ auditResult, recommendations });
  }

  return result;
}
