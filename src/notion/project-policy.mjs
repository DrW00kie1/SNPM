export const PROJECT_POLICY_PACK_VERSION = 1;

const DEFAULT_OPTIONAL_SURFACES = [
  {
    surface: "build-records",
    path: "Ops > Builds",
    kind: "page",
    reason: "Build records are an optional managed Ops extension.",
  },
  {
    surface: "validation-sessions",
    path: "Ops > Validation > Validation Sessions",
    kind: "database",
    reason: "Validation Sessions are an optional managed Ops extension.",
  },
];

const DEFAULT_TRUTH_BOUNDARIES = [
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

function requireObject(value, label, sourceLabel) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${sourceLabel} must include an object for ${label}.`);
  }
}

function requireArray(value, label, sourceLabel) {
  if (!Array.isArray(value)) {
    throw new Error(`${sourceLabel} must include an array for ${label}.`);
  }
}

function normalizeNonEmptyString(value, label, sourceLabel) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${sourceLabel} must include a non-empty string for ${label}.`);
  }

  return value.trim();
}

function normalizeStringList(values, label, sourceLabel) {
  requireArray(values, label, sourceLabel);

  const normalized = values.map((value, index) => normalizeNonEmptyString(value, `${label}[${index}]`, sourceLabel));
  const seen = new Set();
  for (const value of normalized) {
    if (seen.has(value)) {
      throw new Error(`${sourceLabel} must not include duplicate values in ${label}: "${value}".`);
    }
    seen.add(value);
  }

  return normalized;
}

function normalizeDocEntries(entries, label, sourceLabel) {
  requireArray(entries, label, sourceLabel);

  const normalized = entries.map((entry, index) => {
    const entryLabel = `${label}[${index}]`;
    requireObject(entry, entryLabel, sourceLabel);
    return {
      path: normalizeNonEmptyString(entry.path, `${entryLabel}.path`, sourceLabel),
      pageId: normalizeNonEmptyString(entry.pageId, `${entryLabel}.pageId`, sourceLabel),
    };
  });

  const seenPaths = new Set();
  for (const entry of normalized) {
    if (seenPaths.has(entry.path)) {
      throw new Error(`${sourceLabel} must not include duplicate doc paths in ${label}: "${entry.path}".`);
    }
    seenPaths.add(entry.path);
  }

  return normalized;
}

function normalizeStarterNodes(nodes, label, sourceLabel) {
  requireArray(nodes, label, sourceLabel);

  const normalized = nodes.map((node, index) => {
    const nodeLabel = `${label}[${index}]`;
    requireObject(node, nodeLabel, sourceLabel);
    return {
      title: normalizeNonEmptyString(node.title, `${nodeLabel}.title`, sourceLabel),
      children: normalizeStarterNodes(node.children, `${nodeLabel}.children`, sourceLabel),
    };
  });

  const seenTitles = new Set();
  for (const node of normalized) {
    if (seenTitles.has(node.title)) {
      throw new Error(`${sourceLabel} must not include duplicate starter root titles in ${label}: "${node.title}".`);
    }
    seenTitles.add(node.title);
  }

  return normalized;
}

function normalizeOptionalSurfaces(surfaces, label, sourceLabel) {
  requireArray(surfaces, label, sourceLabel);

  const normalized = surfaces.map((surface, index) => {
    const surfaceLabel = `${label}[${index}]`;
    requireObject(surface, surfaceLabel, sourceLabel);
    return {
      surface: normalizeNonEmptyString(surface.surface, `${surfaceLabel}.surface`, sourceLabel),
      path: normalizeNonEmptyString(surface.path, `${surfaceLabel}.path`, sourceLabel),
      kind: normalizeNonEmptyString(surface.kind, `${surfaceLabel}.kind`, sourceLabel),
      reason: normalizeNonEmptyString(surface.reason, `${surfaceLabel}.reason`, sourceLabel),
    };
  });

  return ensureUniqueSurfaces(normalized, label, sourceLabel);
}

function normalizeTruthBoundaries(boundaries, label, sourceLabel) {
  requireArray(boundaries, label, sourceLabel);

  const normalized = boundaries.map((boundary, index) => {
    const boundaryLabel = `${label}[${index}]`;
    requireObject(boundary, boundaryLabel, sourceLabel);
    return {
      surface: normalizeNonEmptyString(boundary.surface, `${boundaryLabel}.surface`, sourceLabel),
      recommendedHome: normalizeNonEmptyString(boundary.recommendedHome, `${boundaryLabel}.recommendedHome`, sourceLabel),
      reason: normalizeNonEmptyString(boundary.reason, `${boundaryLabel}.reason`, sourceLabel),
    };
  });

  return ensureUniqueSurfaces(normalized, label, sourceLabel);
}

function ensureUniqueSurfaces(entries, label, sourceLabel) {
  const seenSurfaces = new Set();
  for (const entry of entries) {
    if (seenSurfaces.has(entry.surface)) {
      throw new Error(`${sourceLabel} must not include duplicate surfaces in ${label}: "${entry.surface}".`);
    }
    seenSurfaces.add(entry.surface);
  }

  return entries;
}

function deriveApprovedPlanningPages(config) {
  const planningRoot = config.projectStarter.children.find((node) => node.title === "Planning");
  return planningRoot ? planningRoot.children.map((node) => node.title) : [];
}

function assertStarterRootsReserved(policyPack, sourceLabel) {
  const reservedRoots = new Set(policyPack.reservedProjectRoots);
  const missingRoots = policyPack.projectStarterRoots
    .map((node) => node.title)
    .filter((title) => !reservedRoots.has(title));

  if (missingRoots.length > 0) {
    throw new Error(`${sourceLabel} policyPack.reservedProjectRoots must include every policyPack.projectStarterRoots title. Missing: ${missingRoots.map((title) => `"${title}"`).join(", ")}.`);
  }
}

export function buildDefaultProjectPolicyPack(config) {
  return normalizeProjectPolicyPackValue({
    version: PROJECT_POLICY_PACK_VERSION,
    reservedProjectRoots: config.projectStarter.children.map((node) => node.title),
    approvedPlanningPages: deriveApprovedPlanningPages(config),
    curatedWorkspaceDocs: config.workspace.managedDocs.exactPages,
    curatedTemplateDocs: config.workspace.managedDocs.subtreeRoots,
    projectStarterRoots: config.projectStarter.children,
    optionalSurfaces: DEFAULT_OPTIONAL_SURFACES,
    truthBoundaries: DEFAULT_TRUTH_BOUNDARIES,
  });
}

export function normalizeProjectPolicyPackValue(policyPack, sourceLabel = "workspace config") {
  requireObject(policyPack, "policyPack", sourceLabel);

  if (policyPack.version !== PROJECT_POLICY_PACK_VERSION) {
    throw new Error(`${sourceLabel} policyPack.version must be ${PROJECT_POLICY_PACK_VERSION}.`);
  }

  const normalized = {
    version: PROJECT_POLICY_PACK_VERSION,
    reservedProjectRoots: normalizeStringList(policyPack.reservedProjectRoots, "policyPack.reservedProjectRoots", sourceLabel),
    approvedPlanningPages: normalizeStringList(policyPack.approvedPlanningPages, "policyPack.approvedPlanningPages", sourceLabel),
    curatedWorkspaceDocs: normalizeDocEntries(policyPack.curatedWorkspaceDocs, "policyPack.curatedWorkspaceDocs", sourceLabel),
    curatedTemplateDocs: normalizeDocEntries(policyPack.curatedTemplateDocs, "policyPack.curatedTemplateDocs", sourceLabel),
    projectStarterRoots: normalizeStarterNodes(policyPack.projectStarterRoots, "policyPack.projectStarterRoots", sourceLabel),
    optionalSurfaces: normalizeOptionalSurfaces(policyPack.optionalSurfaces, "policyPack.optionalSurfaces", sourceLabel),
    truthBoundaries: normalizeTruthBoundaries(policyPack.truthBoundaries, "policyPack.truthBoundaries", sourceLabel),
  };

  assertStarterRootsReserved(normalized, sourceLabel);
  return normalized;
}

export function normalizeProjectPolicyPack(config, sourceLabel = "workspace config") {
  if (config?.policyPack === undefined) {
    return buildDefaultProjectPolicyPack(config);
  }

  return normalizeProjectPolicyPackValue(config.policyPack, sourceLabel);
}
