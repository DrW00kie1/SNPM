import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { nowTimestamp } from "../notion/env.mjs";

const TARGET_RESOLUTION_DETAILS = {
  planning: "Approved planning pages resolve only under Projects > <Project> > Planning and stay limited to the four planning pages.",
  runbooks: "Runbook targets resolve only under Projects > <Project> > Runbooks.",
  "access-domain": "Access domains resolve only under Projects > <Project> > Access.",
  "secret-record": "Secret records resolve only under a managed Access domain page.",
  "access-token": "Access tokens resolve only under a managed Access domain page.",
  "project-docs": "Project docs resolve only at Root / Root > ... and still reject reserved structural roots.",
  "template-docs": "Template docs resolve only inside Templates > Project Templates and its curated descendants.",
  "workspace-docs": "Workspace docs resolve only inside the curated workspace-doc registry.",
};

function buildAuthSelectionDetail({ authMode, authScope }) {
  if (authScope === "workspace-only") {
    return "This target is workspace-scoped, so SNPM always uses the workspace token.";
  }

  if (authMode === "project-token") {
    return "SNPM used the project token because --project-token-env was provided for this project-scoped operation.";
  }

  return "SNPM used the workspace token because no project token env was provided for this project-scoped operation.";
}

export function inferDocSurface({ projectName, docPath }) {
  if (projectName) {
    return "project-docs";
  }

  return docPath?.startsWith("Templates > Project Templates")
    ? "template-docs"
    : "workspace-docs";
}

export function buildOperationalExplanation({
  surface,
  targetPath,
  authMode,
  authScope = "project-or-workspace",
  managedState = "managed",
  preserveChildren = true,
  normalizationsApplied = [],
  warnings = [],
  includeDetails = false,
}) {
  const explanation = {
    surface,
    targetPath,
    authMode,
    managedState,
    preserveChildren,
    normalizationsApplied,
    warnings,
  };

  if (!includeDetails) {
    return explanation;
  }

  return {
    ...explanation,
    details: {
      targetResolution: TARGET_RESOLUTION_DETAILS[surface] || "This command uses the approved SNPM target resolver for the selected operational surface.",
      authSelection: buildAuthSelectionDetail({ authMode, authScope }),
      childPagePolicy: preserveChildren
        ? "SNPM replaces managed page bodies without restructuring child pages. Use explicit create/adopt commands for structural changes."
        : "This operation may restructure child pages.",
      normalizationPolicy: normalizationsApplied.length > 0
        ? `SNPM compares normalized managed bodies before diff/push: ${normalizationsApplied.join(", ")}.`
        : "No managed-body normalization applies to this surface.",
    },
  };
}

export function writeReviewArtifacts({
  reviewOutput,
  command,
  surface,
  result,
  explanation,
  mkdirSyncImpl = mkdirSync,
  writeFileSyncImpl = writeFileSync,
  nowTimestampImpl = nowTimestamp,
}) {
  mkdirSyncImpl(reviewOutput, { recursive: true });

  const currentPath = path.join(reviewOutput, "current.md");
  const nextPath = path.join(reviewOutput, "next.md");
  const diffPath = path.join(reviewOutput, "diff.patch");
  const metadataPath = path.join(reviewOutput, "metadata.json");

  writeFileSyncImpl(currentPath, result.currentBodyMarkdown || "", "utf8");
  writeFileSyncImpl(nextPath, result.nextBodyMarkdown || result.currentBodyMarkdown || "", "utf8");
  writeFileSyncImpl(diffPath, result.diff || "", "utf8");
  writeFileSyncImpl(metadataPath, `${JSON.stringify({
    command,
    surface,
    targetPath: result.targetPath,
    authMode: result.authMode,
    managedState: explanation.managedState,
    timestamp: result.timestamp || nowTimestampImpl(),
    normalizationsApplied: explanation.normalizationsApplied,
    preserveChildren: explanation.preserveChildren,
    warnings: explanation.warnings,
    hasDiff: result.hasDiff,
    applied: result.applied || false,
  }, null, 2)}\n`, "utf8");

  return {
    directory: reviewOutput,
    files: [
      currentPath,
      nextPath,
      diffPath,
      metadataPath,
    ],
  };
}

export function buildOperationalPayload({
  command,
  surface,
  result,
  explain = false,
  reviewArtifacts = null,
  explanation: providedExplanation = null,
}) {
  const explanation = providedExplanation || buildOperationalExplanation({
    surface,
    targetPath: result.targetPath,
    authMode: result.authMode,
    authScope: result.authScope,
    managedState: result.managedState,
    preserveChildren: result.preserveChildren,
    normalizationsApplied: result.normalizationsApplied || [],
    warnings: result.warnings || [],
    includeDetails: explain,
  });

  return {
    ok: true,
    command,
    ...("applied" in result ? { applied: result.applied } : {}),
    ...("hasDiff" in result ? { hasDiff: result.hasDiff } : {}),
    targetPath: result.targetPath,
    authMode: result.authMode,
    ...("pageId" in result ? { pageId: result.pageId } : {}),
    ...("projectId" in result ? { projectId: result.projectId } : {}),
    ...("timestamp" in result ? { timestamp: result.timestamp } : {}),
    ...(reviewArtifacts ? { reviewOutput: reviewArtifacts } : {}),
    ...(result.journal ? { journal: result.journal } : {}),
    explanation,
  };
}
