import { getProjectPolicyTruthBoundaries } from "./managed-doc-policy.mjs";
import { APPROVED_PLANNING_PAGE_TITLES, parseApprovedPlanningPagePath } from "./page-targets.mjs";

const APPROVED_PLANNING_PAGE_SET = new Set(APPROVED_PLANNING_PAGE_TITLES);

function quoteArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

export function buildCommand(scriptName, args, projectTokenEnv) {
  const parts = [`npm run ${scriptName} --`];

  for (const [flag, value] of args) {
    parts.push(`--${flag}`, quoteArg(value));
  }

  if (projectTokenEnv) {
    parts.push("--project-token-env", projectTokenEnv);
  }

  return parts.join(" ");
}

export function buildTruthBoundaries(config) {
  return getProjectPolicyTruthBoundaries(config);
}

export function normalizePlanningIntentPage(pageValue) {
  if (typeof pageValue !== "string" || pageValue.trim() === "") {
    throw new Error('Provide --page "Roadmap" or --page "Planning > Roadmap".');
  }

  const normalized = pageValue.trim();
  if (APPROVED_PLANNING_PAGE_SET.has(normalized)) {
    return `Planning > ${normalized}`;
  }

  return parseApprovedPlanningPagePath(normalized).join(" > ");
}
