import { normalizeProjectPolicyPack } from "./project-policy.mjs";

const DEFAULT_PROJECT_STARTER_ROOTS = ["Ops", "Planning", "Access", "Vendors", "Runbooks", "Incidents"]
  .map((title) => ({ title, children: [] }));

function getStarterRoots(config) {
  const children = config?.projectStarter?.children;
  if (Array.isArray(children) && children.length > 0) {
    return children;
  }

  return DEFAULT_PROJECT_STARTER_ROOTS;
}

function getManagedDocs(config) {
  return {
    exactPages: Array.isArray(config?.workspace?.managedDocs?.exactPages)
      ? config.workspace.managedDocs.exactPages
      : [],
    subtreeRoots: Array.isArray(config?.workspace?.managedDocs?.subtreeRoots)
      ? config.workspace.managedDocs.subtreeRoots
      : [],
  };
}

function withPolicyDefaults(config) {
  if (config?.policyPack !== undefined) {
    return config;
  }

  return {
    ...config,
    workspace: {
      ...config?.workspace,
      managedDocs: getManagedDocs(config),
    },
    projectStarter: {
      ...config?.projectStarter,
      children: getStarterRoots(config),
    },
  };
}

export function normalizeProjectPolicy(config) {
  const policyPack = normalizeProjectPolicyPack(withPolicyDefaults(config));

  return {
    policyPack,
    starterChildren: policyPack.projectStarterRoots,
    starterDocScaffold: policyPack.starterDocScaffold,
    reservedRootTitles: policyPack.reservedProjectRoots,
    truthBoundaries: policyPack.truthBoundaries,
  };
}

export function getProjectPolicyStarterChildren(config) {
  return normalizeProjectPolicy(config).starterChildren;
}

export function getProjectPolicyStarterDocScaffold(config) {
  return normalizeProjectPolicy(config).starterDocScaffold;
}

export function getProjectPolicyReservedRootTitles(config) {
  return normalizeProjectPolicy(config).reservedRootTitles;
}

export function getProjectPolicyTruthBoundaries(config) {
  return normalizeProjectPolicy(config).truthBoundaries;
}

export function getManagedDocReservedRootTitles(config) {
  return getProjectPolicyReservedRootTitles(config);
}

export function getManagedDocStarterDocScaffold(config) {
  return getProjectPolicyStarterDocScaffold(config);
}
