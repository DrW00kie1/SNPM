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

export function buildTruthBoundaries() {
  return [
    {
      surface: "planning",
      recommendedHome: "notion",
      reason: "Approved planning pages are living project coordination state and use the constrained planning-page sync path.",
    },
    {
      surface: "runbooks",
      recommendedHome: "notion",
      reason: "Runbooks are operator-state pages owned in Notion and standardized through managed runbook commands.",
    },
    {
      surface: "access",
      recommendedHome: "notion",
      reason: "Canonical project-local secrets and tokens live under Projects > <Project> > Access.",
    },
    {
      surface: "project-docs",
      recommendedHome: "notion",
      reason: "Curated project root docs belong in Notion under the managed project-doc surface instead of drifting into arbitrary page edits.",
    },
    {
      surface: "template-docs",
      recommendedHome: "notion",
      reason: "Curated template docs belong in Notion under Templates > Project Templates and stay inside the managed doc registry.",
    },
    {
      surface: "workspace-docs",
      recommendedHome: "notion",
      reason: "A small named set of workspace-global operator docs belong in Notion and stay constrained to the managed doc registry.",
    },
    {
      surface: "implementation-truth",
      recommendedHome: "repo",
      reason: "Fast-changing implementation notes, design specs, investigations, and task breakdowns belong in the repo instead of managed Notion pages.",
    },
    {
      surface: "repo-doc",
      recommendedHome: "repo",
      reason: "Code-coupled documentation should stay in the repo and be linked from Notion rather than mirrored into it.",
    },
    {
      surface: "generated-output",
      recommendedHome: "repo",
      reason: "Machine-owned outputs and generated artifacts belong in the repo or build outputs, not in Notion pages.",
    },
    {
      surface: "validation-session-artifact",
      recommendedHome: "hybrid",
      reason: "Use hybrid routing only when a validation artifact needs durable repo backing in addition to Notion reporting.",
    },
  ];
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
