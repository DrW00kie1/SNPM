import { projectPath } from "./project-model.mjs";
import { findChildDatabase } from "./data-sources.mjs";
import { findChildPage } from "./project-service.mjs";

export const APPROVED_PLANNING_PAGE_TITLES = [
  "Roadmap",
  "Current Cycle",
  "Backlog",
  "Decision Log",
];

export const APPROVED_PLANNING_PAGE_PATHS = APPROVED_PLANNING_PAGE_TITLES.map(
  (title) => `Planning > ${title}`,
);

const APPROVED_PLANNING_PAGE_SET = new Set(APPROVED_PLANNING_PAGE_TITLES);

function approvedPageList() {
  return APPROVED_PLANNING_PAGE_PATHS.map((path) => `"${path}"`).join(", ");
}

function normalizePageSegments(pageSegments) {
  if (!Array.isArray(pageSegments) || pageSegments.length === 0) {
    throw new Error("Provide a non-empty project page path.");
  }

  const normalized = pageSegments
    .map((segment) => (typeof segment === "string" ? segment.trim() : ""))
    .filter(Boolean);

  if (normalized.length === 0) {
    throw new Error("Provide a non-empty project page path.");
  }

  return normalized;
}

export async function resolveProjectRootTarget(projectName, config, client) {
  const projectRoot = await findChildPage(config.workspace.projectsPageId, projectName, client);

  if (!projectRoot) {
    throw new Error(`Project "${projectName}" does not exist under Projects.`);
  }

  return {
    projectId: projectRoot.id,
    pageId: projectRoot.id,
    pageSegments: [],
    targetPath: projectPath(projectName),
  };
}

export async function findProjectPathTarget(projectName, pageSegments, config, client) {
  const normalizedSegments = normalizePageSegments(pageSegments);
  const projectRoot = await findChildPage(config.workspace.projectsPageId, projectName, client);

  if (!projectRoot) {
    return null;
  }

  let currentPageId = projectRoot.id;

  for (const segment of normalizedSegments) {
    const childPage = await findChildPage(currentPageId, segment, client);
    if (!childPage) {
      return null;
    }
    currentPageId = childPage.id;
  }

  return {
    projectId: projectRoot.id,
    pageId: currentPageId,
    pageSegments: normalizedSegments,
    targetPath: projectPath(projectName, normalizedSegments),
  };
}

export async function resolveProjectPathTarget(projectName, pageSegments, config, client) {
  const normalizedSegments = normalizePageSegments(pageSegments);
  const target = await findProjectPathTarget(projectName, normalizedSegments, config, client);

  if (!target) {
    const projectRoot = await findChildPage(config.workspace.projectsPageId, projectName, client);
    if (!projectRoot) {
      throw new Error(`Project "${projectName}" does not exist under Projects.`);
    }

    throw new Error(`Page "${projectPath(projectName, normalizedSegments)}" does not exist.`);
  }

  return target;
}

export function parseApprovedPlanningPagePath(pagePath) {
  if (typeof pagePath !== "string" || pagePath.trim() === "") {
    throw new Error('Provide --page "Planning > <Page Name>".');
  }

  const pageSegments = pagePath
    .split(">")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (
    pageSegments.length !== 2
    || pageSegments[0] !== "Planning"
    || !APPROVED_PLANNING_PAGE_SET.has(pageSegments[1])
  ) {
    throw new Error(`Approved page targets are limited to ${approvedPageList()}.`);
  }

  return pageSegments;
}

export async function resolveApprovedPlanningPageTarget(projectName, pagePath, config, client) {
  const pageSegments = parseApprovedPlanningPagePath(pagePath);
  return resolveProjectPathTarget(projectName, pageSegments, config, client);
}

function requireSurfaceTitle(title, label) {
  if (typeof title !== "string" || title.trim() === "") {
    throw new Error(`Provide --title "${label}".`);
  }

  return title.trim();
}

export async function resolveRunbooksContainerTarget(projectName, config, client) {
  return resolveProjectPathTarget(projectName, ["Runbooks"], config, client);
}

export async function resolveAccessTarget(projectName, config, client) {
  return resolveProjectPathTarget(projectName, ["Access"], config, client);
}

export async function findAccessDomainTarget(projectName, title, config, client) {
  const normalizedTitle = requireSurfaceTitle(title, "<Access Domain Title>");
  return findProjectPathTarget(projectName, ["Access", normalizedTitle], config, client);
}

export async function resolveAccessDomainTarget(projectName, title, config, client) {
  const normalizedTitle = requireSurfaceTitle(title, "<Access Domain Title>");
  return resolveProjectPathTarget(projectName, ["Access", normalizedTitle], config, client);
}

export async function findAccessRecordTarget(projectName, domainTitle, title, config, client) {
  const normalizedDomainTitle = requireSurfaceTitle(domainTitle, "<Access Domain Title>");
  const normalizedTitle = requireSurfaceTitle(title, "<Record Title>");
  return findProjectPathTarget(projectName, ["Access", normalizedDomainTitle, normalizedTitle], config, client);
}

export async function resolveAccessRecordTarget(projectName, domainTitle, title, config, client) {
  const normalizedDomainTitle = requireSurfaceTitle(domainTitle, "<Access Domain Title>");
  const normalizedTitle = requireSurfaceTitle(title, "<Record Title>");
  return resolveProjectPathTarget(projectName, ["Access", normalizedDomainTitle, normalizedTitle], config, client);
}

export async function findRunbookTarget(projectName, title, config, client) {
  const normalizedTitle = requireSurfaceTitle(title, "<Runbook Title>");
  return findProjectPathTarget(projectName, ["Runbooks", normalizedTitle], config, client);
}

export async function resolveRunbookTarget(projectName, title, config, client) {
  const normalizedTitle = requireSurfaceTitle(title, "<Runbook Title>");
  return resolveProjectPathTarget(projectName, ["Runbooks", normalizedTitle], config, client);
}

export async function resolveOpsTarget(projectName, config, client) {
  return resolveProjectPathTarget(projectName, ["Ops"], config, client);
}

export async function resolveValidationTarget(projectName, config, client) {
  return resolveProjectPathTarget(projectName, ["Ops", "Validation"], config, client);
}

export async function findValidationSessionsDatabaseTarget(projectName, config, client) {
  const validationTarget = await resolveValidationTarget(projectName, config, client);
  const database = await findChildDatabase(validationTarget.pageId, "Validation Sessions", client);

  if (!database) {
    return null;
  }

  return {
    projectId: validationTarget.projectId,
    pageId: database.id,
    pageSegments: ["Ops", "Validation", "Validation Sessions"],
    targetPath: `${validationTarget.targetPath} > Validation Sessions`,
  };
}

export async function resolveValidationSessionsDatabaseTarget(projectName, config, client) {
  const target = await findValidationSessionsDatabaseTarget(projectName, config, client);

  if (!target) {
    throw new Error(`Validation Sessions does not exist at Projects > ${projectName} > Ops > Validation. Run "validation-sessions init" first.`);
  }

  return target;
}

export async function findBuildsContainerTarget(projectName, config, client) {
  return findProjectPathTarget(projectName, ["Ops", "Builds"], config, client);
}

export async function resolveBuildsContainerTarget(projectName, config, client) {
  return resolveProjectPathTarget(projectName, ["Ops", "Builds"], config, client);
}

export async function findBuildRecordTarget(projectName, title, config, client) {
  const normalizedTitle = requireSurfaceTitle(title, "<Build Record Title>");
  return findProjectPathTarget(projectName, ["Ops", "Builds", normalizedTitle], config, client);
}

export async function resolveBuildRecordTarget(projectName, title, config, client) {
  const normalizedTitle = requireSurfaceTitle(title, "<Build Record Title>");
  return resolveProjectPathTarget(projectName, ["Ops", "Builds", normalizedTitle], config, client);
}
