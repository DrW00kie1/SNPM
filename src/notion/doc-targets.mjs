import {
  findProjectPathTarget,
  parseApprovedPlanningPagePath,
  resolveApprovedPlanningPageTarget,
  resolveProjectPathTarget,
  resolveProjectRootTarget,
} from "./page-targets.mjs";
import { getManagedDocReservedRootTitles } from "./managed-doc-policy.mjs";
import { findChildPage } from "./project-service.mjs";
import { projectPath } from "./project-model.mjs";

function normalizePathSegments(pathValue, optionLabel = "--path") {
  if (typeof pathValue !== "string" || pathValue.trim() === "") {
    throw new Error(`Provide ${optionLabel} "<path>".`);
  }

  const segments = pathValue
    .split(">")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error(`Provide ${optionLabel} "<path>".`);
  }

  return segments;
}

function formatSupportedWorkspaceDocPaths(config) {
  const exactPaths = config.workspace.managedDocs.exactPages.map((entry) => `"${entry.path}"`);
  const subtreePaths = config.workspace.managedDocs.subtreeRoots.map((entry) => `"${entry.path}" or descendants under it`);
  return [...exactPaths, ...subtreePaths].join(", ");
}

function buildReservedRootError(rootTitle) {
  if (rootTitle === "Planning") {
    return 'Planning docs stay on the fixed planning surface. Use --path "Planning > Roadmap", "Planning > Current Cycle", "Planning > Backlog", or "Planning > Decision Log" through "page-*" or "doc-*".';
  }

  if (rootTitle === "Runbooks") {
    return 'Runbooks stay on the runbook surface. Use "runbook-*" commands instead.';
  }

  if (rootTitle === "Access") {
    return 'Access stays on the Access surface. Use "access-domain-*", "secret-record-*", or "access-token-*" commands instead.';
  }

  if (rootTitle === "Ops") {
    return 'Ops is a reserved structural root. Use "build-record-*" or "validation-session-*" for the supported managed Ops descendants.';
  }

  return `"${rootTitle}" is a reserved structural root and is out of scope for the managed doc surface.`;
}

function ensureAllowedProjectDocPath(docPath, config) {
  const segments = normalizePathSegments(docPath);
  const reservedRoots = new Set(getManagedDocReservedRootTitles(config));

  if (segments[0] === "Planning") {
    return {
      family: "planning-compat",
      createAllowed: false,
      pageSegments: parseApprovedPlanningPagePath(docPath),
      normalizedPath: parseApprovedPlanningPagePath(docPath).join(" > "),
    };
  }

  if (reservedRoots.has(segments[0])) {
    throw new Error(buildReservedRootError(segments[0]));
  }

  if (segments[0] !== "Root") {
    throw new Error('Project doc paths are limited to "Root", "Root > ...", or the four approved planning pages under "Planning > ...".');
  }

  if (segments.length === 1) {
    return {
      family: "project-root",
      createAllowed: false,
      pageSegments: [],
      normalizedPath: "Root",
    };
  }

  const rootTitle = segments[1];
  if (reservedRoots.has(rootTitle)) {
    throw new Error(buildReservedRootError(rootTitle));
  }

  return {
    family: "project-doc",
    createAllowed: true,
    pageSegments: segments.slice(1),
    normalizedPath: `Root > ${segments.slice(1).join(" > ")}`,
  };
}

function ensureAllowedWorkspaceDocPath(docPath, config) {
  const segments = normalizePathSegments(docPath);
  const normalizedPath = segments.join(" > ");
  const registry = config.workspace.managedDocs;
  const reservedRoots = new Set(getManagedDocReservedRootTitles(config));

  const exactEntry = registry.exactPages.find((entry) => entry.path === normalizedPath);
  if (exactEntry) {
    return {
      family: "workspace-exact",
      createAllowed: false,
      normalizedPath,
      registryEntry: exactEntry,
      pageSegments: [],
    };
  }

  for (const subtreeEntry of registry.subtreeRoots) {
    const rootSegments = subtreeEntry.path.split(" > ");
    const prefixMatches = rootSegments.every((segment, index) => segments[index] === segment);
    if (!prefixMatches) {
      continue;
    }

    const childSegments = segments.slice(rootSegments.length);
    if (childSegments.length === 0) {
      return {
        family: "workspace-subtree-root",
        createAllowed: false,
        normalizedPath,
        registryEntry: subtreeEntry,
        pageSegments: [],
      };
    }

    if (reservedRoots.has(childSegments[0])) {
      throw new Error(buildReservedRootError(childSegments[0]));
    }

    return {
      family: "workspace-subtree-doc",
      createAllowed: true,
      normalizedPath,
      registryEntry: subtreeEntry,
      pageSegments: childSegments,
    };
  }

  throw new Error(`Managed workspace doc paths are limited to ${formatSupportedWorkspaceDocPaths(config)}.`);
}

async function findChildPathFromRoot(rootPageId, pathSegments, client) {
  let currentPageId = rootPageId;

  for (const segment of pathSegments) {
    const childPage = await findChildPage(currentPageId, segment, client);
    if (!childPage) {
      return null;
    }
    currentPageId = childPage.id;
  }

  return currentPageId;
}

async function resolveChildPathFromRoot(rootPageId, rootPath, pathSegments, client) {
  const pageId = await findChildPathFromRoot(rootPageId, pathSegments, client);
  if (!pageId) {
    throw new Error(`Page "${[rootPath, ...pathSegments].join(" > ")}" does not exist.`);
  }
  return pageId;
}

export function normalizeProjectManagedDocPath(docPath, config) {
  return ensureAllowedProjectDocPath(docPath, config);
}

export function normalizeWorkspaceManagedDocPath(docPath, config) {
  return ensureAllowedWorkspaceDocPath(docPath, config);
}

export async function findProjectManagedDocTarget(projectName, docPath, config, client) {
  const parsed = ensureAllowedProjectDocPath(docPath, config);

  if (parsed.family === "project-root") {
    const rootTarget = await resolveProjectRootTarget(projectName, config, client);
    return {
      ...rootTarget,
      family: parsed.family,
      scope: "project",
      createAllowed: parsed.createAllowed,
      docPath: parsed.normalizedPath,
      title: projectName,
      authScope: "project-or-workspace",
    };
  }

  const target = parsed.family === "planning-compat"
    ? await findProjectPathTarget(projectName, parsed.pageSegments, config, client)
    : await findProjectPathTarget(projectName, parsed.pageSegments, config, client);

  if (!target) {
    return null;
  }

  return {
    ...target,
    family: parsed.family,
    scope: "project",
    createAllowed: parsed.createAllowed,
    docPath: parsed.normalizedPath,
    title: parsed.pageSegments.at(-1) || projectName,
    authScope: "project-or-workspace",
  };
}

export async function resolveProjectManagedDocTarget(projectName, docPath, config, client) {
  const parsed = ensureAllowedProjectDocPath(docPath, config);

  if (parsed.family === "project-root") {
    const rootTarget = await resolveProjectRootTarget(projectName, config, client);
    return {
      ...rootTarget,
      family: parsed.family,
      scope: "project",
      createAllowed: parsed.createAllowed,
      docPath: parsed.normalizedPath,
      title: projectName,
      authScope: "project-or-workspace",
    };
  }

  const target = parsed.family === "planning-compat"
    ? await resolveApprovedPlanningPageTarget(projectName, parsed.normalizedPath, config, client)
    : await resolveProjectPathTarget(projectName, parsed.pageSegments, config, client);

  return {
    ...target,
    family: parsed.family,
    scope: "project",
    createAllowed: parsed.createAllowed,
    docPath: parsed.normalizedPath,
    title: parsed.pageSegments.at(-1) || projectName,
    authScope: "project-or-workspace",
  };
}

export async function prepareProjectManagedDocCreateTarget(projectName, docPath, config, client) {
  const parsed = ensureAllowedProjectDocPath(docPath, config);
  if (!parsed.createAllowed) {
    throw new Error(`doc-create is not allowed for "${parsed.normalizedPath}".`);
  }

  const existing = await findProjectPathTarget(projectName, parsed.pageSegments, config, client);
  if (existing) {
    throw new Error(`Page "${existing.targetPath}" already exists.`);
  }

  const parentSegments = parsed.pageSegments.slice(0, -1);
  const parentTarget = parentSegments.length === 0
    ? await resolveProjectRootTarget(projectName, config, client)
    : await resolveProjectPathTarget(projectName, parentSegments, config, client);

  return {
    scope: "project",
    family: parsed.family,
    projectId: parentTarget.projectId,
    parentPageId: parentTarget.pageId,
    parentTargetPath: parentTarget.targetPath,
    pageSegments: parsed.pageSegments,
    targetPath: projectPath(projectName, parsed.pageSegments),
    title: parsed.pageSegments.at(-1),
    docPath: parsed.normalizedPath,
    authScope: "project-or-workspace",
  };
}

export async function findWorkspaceManagedDocTarget(docPath, config, client) {
  const parsed = ensureAllowedWorkspaceDocPath(docPath, config);

  if (parsed.family === "workspace-exact" || parsed.family === "workspace-subtree-root") {
    return {
      scope: "workspace",
      family: parsed.family,
      pageId: parsed.registryEntry.pageId,
      pageSegments: parsed.pageSegments,
      targetPath: parsed.registryEntry.path,
      docPath: parsed.normalizedPath,
      title: parsed.registryEntry.path.split(" > ").at(-1),
      authScope: "workspace-only",
      createAllowed: parsed.createAllowed,
    };
  }

  const pageId = await findChildPathFromRoot(parsed.registryEntry.pageId, parsed.pageSegments, client);
  if (!pageId) {
    return null;
  }

  return {
    scope: "workspace",
    family: parsed.family,
    pageId,
    pageSegments: parsed.pageSegments,
    targetPath: parsed.normalizedPath,
    docPath: parsed.normalizedPath,
    title: parsed.pageSegments.at(-1),
    authScope: "workspace-only",
    createAllowed: parsed.createAllowed,
    rootPageId: parsed.registryEntry.pageId,
    rootTargetPath: parsed.registryEntry.path,
  };
}

export async function resolveWorkspaceManagedDocTarget(docPath, config, client) {
  const parsed = ensureAllowedWorkspaceDocPath(docPath, config);

  if (parsed.family === "workspace-exact" || parsed.family === "workspace-subtree-root") {
    return {
      scope: "workspace",
      family: parsed.family,
      pageId: parsed.registryEntry.pageId,
      pageSegments: parsed.pageSegments,
      targetPath: parsed.registryEntry.path,
      docPath: parsed.normalizedPath,
      title: parsed.registryEntry.path.split(" > ").at(-1),
      authScope: "workspace-only",
      createAllowed: parsed.createAllowed,
    };
  }

  const pageId = await resolveChildPathFromRoot(
    parsed.registryEntry.pageId,
    parsed.registryEntry.path,
    parsed.pageSegments,
    client,
  );

  return {
    scope: "workspace",
    family: parsed.family,
    pageId,
    pageSegments: parsed.pageSegments,
    targetPath: parsed.normalizedPath,
    docPath: parsed.normalizedPath,
    title: parsed.pageSegments.at(-1),
    authScope: "workspace-only",
    createAllowed: parsed.createAllowed,
    rootPageId: parsed.registryEntry.pageId,
    rootTargetPath: parsed.registryEntry.path,
  };
}

export async function prepareWorkspaceManagedDocCreateTarget(docPath, config, client) {
  const parsed = ensureAllowedWorkspaceDocPath(docPath, config);
  if (!parsed.createAllowed) {
    throw new Error(`doc-create is not allowed for "${parsed.normalizedPath}".`);
  }

  const existing = await findChildPathFromRoot(parsed.registryEntry.pageId, parsed.pageSegments, client);
  if (existing) {
    throw new Error(`Page "${parsed.normalizedPath}" already exists.`);
  }

  const parentSegments = parsed.pageSegments.slice(0, -1);
  const parentPageId = parentSegments.length === 0
    ? parsed.registryEntry.pageId
    : await resolveChildPathFromRoot(parsed.registryEntry.pageId, parsed.registryEntry.path, parentSegments, client);

  return {
    scope: "workspace",
    family: parsed.family,
    parentPageId,
    parentTargetPath: parentSegments.length === 0
      ? parsed.registryEntry.path
      : `${parsed.registryEntry.path} > ${parentSegments.join(" > ")}`,
    pageSegments: parsed.pageSegments,
    targetPath: parsed.normalizedPath,
    title: parsed.pageSegments.at(-1),
    docPath: parsed.normalizedPath,
    authScope: "workspace-only",
  };
}
