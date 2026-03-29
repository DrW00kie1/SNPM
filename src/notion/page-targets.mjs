import { projectPath } from "./project-model.mjs";
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
  const projectRoot = await findChildPage(config.workspace.projectsPageId, projectName, client);

  if (!projectRoot) {
    throw new Error(`Project "${projectName}" does not exist under Projects.`);
  }

  let currentPageId = projectRoot.id;

  for (let index = 0; index < pageSegments.length; index += 1) {
    const segment = pageSegments[index];
    const childPage = await findChildPage(currentPageId, segment, client);

    if (!childPage) {
      throw new Error(
        `Page "${projectPath(projectName, pageSegments.slice(0, index + 1))}" does not exist.`,
      );
    }

    currentPageId = childPage.id;
  }

  return {
    projectId: projectRoot.id,
    pageId: currentPageId,
    pageSegments,
    targetPath: projectPath(projectName, pageSegments),
  };
}
