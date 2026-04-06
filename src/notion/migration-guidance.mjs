import { buildCommand } from "./routing-policy.mjs";

const SUPPORT_TIER_ORDER = new Map([
  ["rc", 0],
  ["conditional", 1],
]);

function createMigrationGuidance({
  patternId,
  surface,
  supportTier,
  targetPath,
  summary,
  manualSteps = [],
  nextCommands = [],
}) {
  return {
    patternId,
    surface,
    supportTier,
    targetPath,
    summary,
    manualSteps,
    nextCommands,
  };
}

export function pushMigrationGuidance(list, keySet, entry) {
  const key = `${entry.patternId}:${entry.targetPath}`;
  if (keySet.has(key)) {
    return;
  }

  keySet.add(key);
  list.push(entry);
}

export function sortMigrationGuidance(entries) {
  return [...entries].sort((left, right) => {
    const tierOrder = (SUPPORT_TIER_ORDER.get(left.supportTier) ?? 99) - (SUPPORT_TIER_ORDER.get(right.supportTier) ?? 99);
    if (tierOrder !== 0) {
      return tierOrder;
    }

    const pathOrder = left.targetPath.localeCompare(right.targetPath);
    if (pathOrder !== 0) {
      return pathOrder;
    }

    return left.patternId.localeCompare(right.patternId);
  });
}

export function buildUnmanagedRunbookGuidance({ projectName, projectTokenEnv, targetPath, title }) {
  return createMigrationGuidance({
    patternId: "unmanaged-runbook",
    surface: "runbooks",
    supportTier: "rc",
    targetPath,
    summary: `Runbook "${title}" already exists on the approved Runbooks surface, but it is not managed by SNPM yet.`,
    manualSteps: [],
    nextCommands: [
      buildCommand("runbook-adopt", [
        ["project", projectName],
        ["title", title],
      ], projectTokenEnv),
    ],
  });
}

export function buildUnmanagedAccessDomainGuidance({ projectName, projectTokenEnv, targetPath, title }) {
  return createMigrationGuidance({
    patternId: "unmanaged-access-domain",
    surface: "access",
    supportTier: "rc",
    targetPath,
    summary: `Access domain "${title}" already exists under the approved Access surface, but it is not managed by SNPM yet.`,
    manualSteps: [],
    nextCommands: [
      buildCommand("access-domain-adopt", [
        ["project", projectName],
        ["title", title],
      ], projectTokenEnv),
    ],
  });
}

export function buildMissingAccessDomainGuidance({ projectName, projectTokenEnv, targetPath, title }) {
  return createMigrationGuidance({
    patternId: "missing-access-domain",
    surface: "access",
    supportTier: "rc",
    targetPath,
    summary: `Access domain "${title}" does not exist yet. Create the domain before creating or standardizing nested records.`,
    manualSteps: [],
    nextCommands: [
      buildCommand("access-domain-create", [
        ["project", projectName],
        ["title", title],
        ["file", "access-domain.md"],
      ], projectTokenEnv),
    ],
  });
}

export function buildUnmanagedAccessRecordGuidance({
  projectName,
  projectTokenEnv,
  targetPath,
  domainTitle,
  title,
  recordType,
}) {
  const patternId = recordType === "access-token" ? "unmanaged-access-token" : "unmanaged-secret-record";
  const recordLabel = recordType === "access-token" ? "Access token" : "Secret record";
  const scriptName = recordType === "access-token" ? "access-token-adopt" : "secret-record-adopt";

  return createMigrationGuidance({
    patternId,
    surface: "access",
    supportTier: "rc",
    targetPath,
    summary: `${recordLabel} "${title}" already exists under Access, but it is not managed by SNPM yet.`,
    manualSteps: [],
    nextCommands: [
      buildCommand(scriptName, [
        ["project", projectName],
        ["domain", domainTitle],
        ["title", title],
      ], projectTokenEnv),
    ],
  });
}

export function buildMissingBuildsSurfaceGuidance({ projectName, projectTokenEnv, targetPath }) {
  return createMigrationGuidance({
    patternId: "missing-builds-surface",
    surface: "builds",
    supportTier: "conditional",
    targetPath,
    summary: "The optional Builds surface is missing. Initialize it only when the project is ready to standardize build records through SNPM.",
    manualSteps: [
      "Leave the surface absent if the project is not ready to standardize build records yet.",
    ],
    nextCommands: [
      buildCommand("build-record-create", [
        ["project", projectName],
        ["title", "<Build Record Title>"],
        ["file", "build-record.md"],
      ], projectTokenEnv),
    ],
  });
}

export function buildUnmanagedBuildRecordGuidance({ projectName, projectTokenEnv, targetPath, title }) {
  return createMigrationGuidance({
    patternId: "unmanaged-build-record",
    surface: "builds",
    supportTier: "conditional",
    targetPath,
    summary: `Build record "${title}" exists, but SNPM does not have an adopt path for build records yet.`,
    manualSteps: [
      "Create a new managed build record and migrate the legacy content manually if you want this surface standardized.",
    ],
    nextCommands: [
      buildCommand("build-record-create", [
        ["project", projectName],
        ["title", title],
        ["file", "build-record.md"],
      ], projectTokenEnv),
    ],
  });
}

export function buildMissingValidationSessionsSurfaceGuidance({ projectName, projectTokenEnv, targetPath }) {
  return createMigrationGuidance({
    patternId: "missing-validation-sessions-surface",
    surface: "validation-sessions",
    supportTier: "conditional",
    targetPath,
    summary: "The optional Validation Sessions surface is missing. Initialize it only when the project is ready to use managed validation-session reporting.",
    manualSteps: [
      "Leave the surface absent if validation-session reporting is not part of the current project workflow.",
    ],
    nextCommands: [
      buildCommand("validation-sessions-init", [
        ["project", projectName],
      ], projectTokenEnv),
    ],
  });
}

export function buildUntitledValidationSessionRowGuidance({ projectName, projectTokenEnv, targetPath }) {
  return createMigrationGuidance({
    patternId: "untitled-validation-session-row",
    surface: "validation-sessions",
    supportTier: "conditional",
    targetPath,
    summary: "A validation-session row exists without a Name title, so SNPM cannot generate a stable adopt command for it yet.",
    manualSteps: [
      "Set a Name title on the row in Notion before trying to standardize it.",
    ],
    nextCommands: [
      buildCommand("doctor", [
        ["project", projectName],
      ], projectTokenEnv || "<PROJECT_TOKEN_ENV>"),
    ],
  });
}

export function buildProjectTokenNotCheckedGuidance({ projectName, targetPath }) {
  return createMigrationGuidance({
    patternId: "project-token-not-checked",
    surface: "project-token-scope",
    supportTier: "rc",
    targetPath,
    summary: "Project-token scope was not evaluated, so project-local mutation safety has not been confirmed yet.",
    manualSteps: [
      "Share the project-local Notion integration with the project subtree before relying on project-local mutation workflows.",
    ],
    nextCommands: [
      buildCommand("doctor", [
        ["project", projectName],
      ], "<PROJECT_TOKEN_ENV>"),
    ],
  });
}
