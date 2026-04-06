import { makeNotionClient } from "./client.mjs";
import { getWorkspaceToken } from "./env.mjs";
import { diagnoseProject } from "./doctor.mjs";
import {
  buildMissingAccessDomainGuidance,
  buildUnmanagedAccessDomainGuidance,
  buildUnmanagedAccessRecordGuidance,
  buildUnmanagedRunbookGuidance,
} from "./migration-guidance.mjs";
import {
  findAccessDomainTarget,
  findAccessRecordTarget,
  findProjectPathTarget,
  findRunbookTarget,
} from "./page-targets.mjs";
import { projectPath } from "./project-model.mjs";
import { buildCommand, normalizePlanningIntentPage } from "./routing-policy.mjs";

const SUPPORTED_INTENTS = new Set([
  "planning",
  "runbook",
  "secret",
  "token",
  "repo-doc",
  "generated-output",
]);

function buildCommandStep(command, reason) {
  return {
    kind: "command",
    command,
    reason,
  };
}

function buildRepoStep(repoPath, reason) {
  return {
    kind: "repo",
    repoPath,
    reason,
  };
}

function createBaseResult({
  diagnosis,
  intent,
  recommendedHome,
  surface,
  reason,
  supported = true,
  ok = true,
  targetPath = null,
  repoPath = null,
  warnings = [],
  nextCommands = [],
  migrationGuidance = [],
}) {
  return {
    ok,
    projectId: diagnosis.projectId,
    intent,
    recommendedHome,
    surface,
    supported,
    reason,
    ...(targetPath ? { targetPath } : {}),
    ...(repoPath ? { repoPath } : {}),
    warnings,
    nextCommands,
    ...(migrationGuidance.length > 0 ? { migrationGuidance } : {}),
  };
}

function getProjectTokenWarnings(diagnosis, recommendedHome) {
  if (recommendedHome === "repo") {
    return [];
  }

  const scope = diagnosis.surfaces.projectTokenScope;
  if (!scope || scope.ok) {
    return [];
  }

  return scope.failures.slice();
}

function findAdoptableEntry(diagnosis, predicate) {
  return diagnosis.adoptable.find(predicate) || null;
}

function routePlanning({ diagnosis, projectName, pagePath, projectTokenEnv, config, client }) {
  const normalizedPagePath = normalizePlanningIntentPage(pagePath);
  const pageSegments = normalizedPagePath.split(" > ");
  const target = findProjectPathTarget(projectName, pageSegments, config, client);
  const targetPath = projectPath(projectName, pageSegments);
  const baseWarnings = getProjectTokenWarnings(diagnosis, "notion");

  return Promise.resolve(target).then((resolvedTarget) => {
    if (!resolvedTarget) {
      return createBaseResult({
        diagnosis,
        intent: "planning",
        recommendedHome: "notion",
        surface: "planning",
        reason: "Approved planning pages are living project coordination state and belong in Notion.",
        ok: false,
        targetPath,
        warnings: [
          ...baseWarnings,
          `Approved planning page "${targetPath}" is missing from the project tree.`,
        ],
        nextCommands: [
          buildCommandStep(
            buildCommand("verify-project", [["name", projectName]], projectTokenEnv),
            "Re-verify the project tree before attempting planning-page updates.",
          ),
        ],
      });
    }

    return createBaseResult({
      diagnosis,
      intent: "planning",
      recommendedHome: "notion",
      surface: "planning",
      reason: "Approved planning pages are living project coordination state and belong in Notion.",
      targetPath,
      warnings: baseWarnings,
      nextCommands: [
        buildCommandStep(
          buildCommand("page-pull", [
            ["project", projectName],
            ["page", normalizedPagePath],
            ["output", "page.md"],
          ], projectTokenEnv),
          "Pull the current approved planning-page body before editing.",
        ),
        buildCommandStep(
          buildCommand("page-diff", [
            ["project", projectName],
            ["page", normalizedPagePath],
            ["file", "page.md"],
          ], projectTokenEnv),
          "Diff a proposed planning-page body against the current Notion body.",
        ),
        buildCommandStep(
          buildCommand("page-push", [
            ["project", projectName],
            ["page", normalizedPagePath],
            ["file", "page.md"],
          ], projectTokenEnv),
          "Preview or apply the approved planning-page update through SNPM.",
        ),
      ],
    });
  });
}

function routeRunbook({ diagnosis, projectName, title, projectTokenEnv, config, client }) {
  const targetPath = projectPath(projectName, ["Runbooks", title]);
  const baseWarnings = getProjectTokenWarnings(diagnosis, "notion");

  if (!diagnosis.surfaces.runbooks?.present) {
    return createBaseResult({
      diagnosis,
      intent: "runbook",
      recommendedHome: "notion",
      surface: "runbooks",
      reason: "Runbooks are operator-state pages and belong in Notion.",
      ok: false,
      targetPath,
      warnings: [
        ...baseWarnings,
        `Required runbook surface "${diagnosis.surfaces.runbooks?.targetPath || projectPath(projectName, ["Runbooks"])}" is missing.`,
      ],
      nextCommands: [
        buildCommandStep(
          buildCommand("verify-project", [["name", projectName]], projectTokenEnv),
          "Re-verify the project tree before attempting runbook updates.",
        ),
      ],
    });
  }

  const adoptable = findAdoptableEntry(diagnosis, (entry) => entry.type === "runbook" && entry.title === title);
  if (adoptable) {
    return createBaseResult({
      diagnosis,
      intent: "runbook",
      recommendedHome: "notion",
      surface: "runbooks",
      reason: "Runbooks are operator-state pages and belong in Notion.",
      targetPath: adoptable.targetPath,
      warnings: [
        ...baseWarnings,
        `Runbook "${title}" exists but is not managed by SNPM yet.`,
      ],
      nextCommands: [
        buildCommandStep(adoptable.command, "Standardize the existing unmanaged runbook first."),
      ],
      migrationGuidance: [
        buildUnmanagedRunbookGuidance({
          projectName,
          projectTokenEnv,
          targetPath: adoptable.targetPath,
          title,
        }),
      ],
    });
  }

  return Promise.resolve(findRunbookTarget(projectName, title, config, client)).then((target) => {
    if (!target) {
      return createBaseResult({
        diagnosis,
        intent: "runbook",
        recommendedHome: "notion",
        surface: "runbooks",
        reason: "Runbooks are operator-state pages and belong in Notion.",
        targetPath,
        warnings: baseWarnings,
        nextCommands: [
          buildCommandStep(
            buildCommand("runbook-create", [
              ["project", projectName],
              ["title", title],
              ["file", "runbook.md"],
            ], projectTokenEnv),
            "Create a new managed runbook at the approved Runbooks surface.",
          ),
        ],
      });
    }

    return createBaseResult({
      diagnosis,
      intent: "runbook",
      recommendedHome: "notion",
      surface: "runbooks",
      reason: "Runbooks are operator-state pages and belong in Notion.",
      targetPath: target.targetPath,
      warnings: baseWarnings,
      nextCommands: [
        buildCommandStep(
          buildCommand("runbook-pull", [
            ["project", projectName],
            ["title", title],
            ["output", "runbook.md"],
          ], projectTokenEnv),
          "Pull the current managed runbook body before editing.",
        ),
        buildCommandStep(
          buildCommand("runbook-diff", [
            ["project", projectName],
            ["title", title],
            ["file", "runbook.md"],
          ], projectTokenEnv),
          "Diff a proposed managed runbook body against Notion.",
        ),
        buildCommandStep(
          buildCommand("runbook-push", [
            ["project", projectName],
            ["title", title],
            ["file", "runbook.md"],
          ], projectTokenEnv),
          "Preview or apply the managed runbook update through SNPM.",
        ),
      ],
    });
  });
}

function routeAccessRecord({
  diagnosis,
  projectName,
  domainTitle,
  title,
  projectTokenEnv,
  config,
  client,
  recordType,
}) {
  const baseWarnings = getProjectTokenWarnings(diagnosis, "notion");
  const targetPath = projectPath(projectName, ["Access", domainTitle, title]);
  const surfaceReason = "Canonical project-local secrets and tokens belong under the project Access surface in Notion.";

  if (!diagnosis.surfaces.access?.present) {
    return createBaseResult({
      diagnosis,
      intent: recordType,
      recommendedHome: "notion",
      surface: "access",
      reason: surfaceReason,
      ok: false,
      targetPath,
      warnings: [
        ...baseWarnings,
        `Required Access surface "${diagnosis.surfaces.access?.targetPath || projectPath(projectName, ["Access"])}" is missing.`,
      ],
      nextCommands: [
        buildCommandStep(
          buildCommand("verify-project", [["name", projectName]], projectTokenEnv),
          "Re-verify the project tree before attempting Access updates.",
        ),
      ],
    });
  }

  const adoptableDomain = findAdoptableEntry(
    diagnosis,
    (entry) => entry.type === "access-domain" && entry.title === domainTitle,
  );
  if (adoptableDomain) {
    return createBaseResult({
      diagnosis,
      intent: recordType,
      recommendedHome: "notion",
      surface: "access",
      reason: surfaceReason,
      targetPath: adoptableDomain.targetPath,
      warnings: [
        ...baseWarnings,
        `Access domain "${domainTitle}" exists but is not managed by SNPM yet.`,
      ],
      nextCommands: [
        buildCommandStep(adoptableDomain.command, "Standardize the Access domain before creating or updating nested records."),
      ],
      migrationGuidance: [
        buildUnmanagedAccessDomainGuidance({
          projectName,
          projectTokenEnv,
          targetPath: adoptableDomain.targetPath,
          title: domainTitle,
        }),
      ],
    });
  }

  return Promise.resolve(findAccessDomainTarget(projectName, domainTitle, config, client)).then((domainTarget) => {
    if (!domainTarget) {
      return createBaseResult({
        diagnosis,
        intent: recordType,
        recommendedHome: "notion",
        surface: "access",
        reason: surfaceReason,
        targetPath: projectPath(projectName, ["Access", domainTitle]),
        warnings: baseWarnings,
        nextCommands: [
          buildCommandStep(
            buildCommand("access-domain-create", [
              ["project", projectName],
              ["title", domainTitle],
              ["file", "access-domain.md"],
            ], projectTokenEnv),
            "Create the Access domain before creating nested records.",
          ),
        ],
        migrationGuidance: [
          buildMissingAccessDomainGuidance({
            projectName,
            projectTokenEnv,
            targetPath: projectPath(projectName, ["Access", domainTitle]),
            title: domainTitle,
          }),
        ],
      });
    }

    const expectedType = recordType === "token" ? "access-token" : "secret-record";
    const adoptableRecord = findAdoptableEntry(
      diagnosis,
      (entry) => entry.type === expectedType && entry.title === title && entry.targetPath === targetPath,
    );
    if (adoptableRecord) {
      return createBaseResult({
        diagnosis,
        intent: recordType,
        recommendedHome: "notion",
        surface: "access",
        reason: surfaceReason,
        targetPath: adoptableRecord.targetPath,
        warnings: [
          ...baseWarnings,
          `${recordType === "token" ? "Access token" : "Secret record"} "${title}" exists but is not managed by SNPM yet.`,
        ],
        nextCommands: [
          buildCommandStep(
            adoptableRecord.command,
            `Standardize the existing unmanaged ${recordType === "token" ? "access token" : "secret record"} first.`,
          ),
        ],
        migrationGuidance: [
          buildUnmanagedAccessRecordGuidance({
            projectName,
            projectTokenEnv,
            targetPath: adoptableRecord.targetPath,
            domainTitle,
            title,
            recordType: expectedType,
          }),
        ],
      });
    }

    return Promise.resolve(findAccessRecordTarget(projectName, domainTitle, title, config, client)).then((recordTarget) => {
      if (!recordTarget) {
        const scriptName = recordType === "token" ? "access-token-create" : "secret-record-create";
        const fileName = recordType === "token" ? "access-token.md" : "secret-record.md";
        return createBaseResult({
          diagnosis,
          intent: recordType,
          recommendedHome: "notion",
          surface: "access",
          reason: surfaceReason,
          targetPath,
          warnings: baseWarnings,
          nextCommands: [
            buildCommandStep(
              buildCommand(scriptName, [
                ["project", projectName],
                ["domain", domainTitle],
                ["title", title],
                ["file", fileName],
              ], projectTokenEnv),
              `Create a new managed ${recordType === "token" ? "access token" : "secret record"} under the Access domain.`,
            ),
          ],
        });
      }

      const prefix = recordType === "token" ? "access-token" : "secret-record";
      const fileName = recordType === "token" ? "access-token.md" : "secret-record.md";
      return createBaseResult({
        diagnosis,
        intent: recordType,
        recommendedHome: "notion",
        surface: "access",
        reason: surfaceReason,
        targetPath: recordTarget.targetPath,
        warnings: baseWarnings,
        nextCommands: [
          buildCommandStep(
            buildCommand(`${prefix}-pull`, [
              ["project", projectName],
              ["domain", domainTitle],
              ["title", title],
              ["output", fileName],
            ], projectTokenEnv),
            `Pull the current managed ${recordType === "token" ? "access token" : "secret record"} body before editing.`,
          ),
          buildCommandStep(
            buildCommand(`${prefix}-diff`, [
              ["project", projectName],
              ["domain", domainTitle],
              ["title", title],
              ["file", fileName],
            ], projectTokenEnv),
            `Diff a proposed ${recordType === "token" ? "access token" : "secret record"} body against Notion.`,
          ),
          buildCommandStep(
            buildCommand(`${prefix}-push`, [
              ["project", projectName],
              ["domain", domainTitle],
              ["title", title],
              ["file", fileName],
            ], projectTokenEnv),
            `Preview or apply the managed ${recordType === "token" ? "access token" : "secret record"} update through SNPM.`,
          ),
        ],
      });
    });
  });
}

function routeRepoOwned({ diagnosis, intent, repoPath }) {
  const reason = intent === "repo-doc"
    ? "Code-coupled documentation belongs in the repo instead of being mirrored into Notion."
    : "Machine-owned outputs and generated artifacts belong in the repo or build outputs, not in Notion.";

  return createBaseResult({
    diagnosis,
    intent,
    recommendedHome: "repo",
    surface: intent,
    reason,
    repoPath,
    nextCommands: [
      buildRepoStep(repoPath, "Update this repo-owned artifact directly and avoid duplicating it into Notion."),
    ],
  });
}

export async function recommendProjectUpdate({
  config,
  projectName,
  projectTokenEnv,
  intent,
  pagePath,
  title,
  domainTitle,
  repoPath,
  workspaceClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  diagnoseProjectImpl = diagnoseProject,
}) {
  if (!SUPPORTED_INTENTS.has(intent)) {
    throw new Error(`Unsupported --intent "${intent}". Supported intents are: planning, runbook, secret, token, repo-doc, generated-output.`);
  }

  const client = workspaceClient || makeNotionClientImpl(getWorkspaceTokenImpl(), config.notionVersion);
  const diagnosis = await diagnoseProjectImpl({
    config,
    projectName,
    projectTokenEnv,
    workspaceClient: client,
  });

  if (intent === "planning") {
    return routePlanning({
      diagnosis,
      projectName,
      pagePath,
      projectTokenEnv,
      config,
      client,
    });
  }

  if (intent === "runbook") {
    return routeRunbook({
      diagnosis,
      projectName,
      title,
      projectTokenEnv,
      config,
      client,
    });
  }

  if (intent === "secret" || intent === "token") {
    return routeAccessRecord({
      diagnosis,
      projectName,
      domainTitle,
      title,
      projectTokenEnv,
      config,
      client,
      recordType: intent,
    });
  }

  return routeRepoOwned({
    diagnosis,
    intent,
    repoPath,
  });
}
