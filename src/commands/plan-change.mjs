const SUPPORTED_TARGET_TYPES = new Set([
  "planning",
  "project-doc",
  "runbook",
  "secret",
  "token",
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

  if (type === "secret" || type === "token") {
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

export async function planChange(input, { recommendImpl } = {}) {
  if (typeof recommendImpl !== "function") {
    throw new Error("planChange requires a recommendImpl function.");
  }

  const normalized = normalizePlanChangeInput(input);
  const recommendations = [];

  for (const target of normalized.targets) {
    const recommendation = await recommendImpl(recommendationArgsForTarget(target));
    recommendations.push(compactRecommendation(recommendation, target));
  }

  const nextCommands = recommendations.flatMap((entry) => entry.nextCommands);
  const warnings = recommendations.flatMap((entry) => entry.warnings);
  const ok = recommendations.every((entry) => entry.ok);

  return {
    ok,
    command: "plan-change",
    goal: normalized.goal,
    projectName: normalized.projectName || null,
    targets: normalized.targets,
    recommendations,
    nextCommands,
    warnings,
  };
}
