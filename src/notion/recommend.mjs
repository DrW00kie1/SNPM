import { makeNotionClient } from "./client.mjs";
import {
  findProjectManagedDocTarget,
  findWorkspaceManagedDocTarget,
  normalizeProjectManagedDocPath,
  normalizeWorkspaceManagedDocPath,
  prepareProjectManagedDocCreateTarget,
  prepareWorkspaceManagedDocCreateTarget,
} from "./doc-targets.mjs";
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
import { fetchPageMarkdown, splitManagedPageMarkdownIfPresent } from "./page-markdown.mjs";
import { projectPath } from "./project-model.mjs";
import { buildCommand, normalizePlanningIntentPage } from "./routing-policy.mjs";

const SUPPORTED_INTENTS = new Set([
  "planning",
  "runbook",
  "secret",
  "token",
  "generated-secret",
  "generated-token",
  "project-doc",
  "template-doc",
  "workspace-doc",
  "implementation-note",
  "design-spec",
  "task-breakdown",
  "investigation",
  "repo-doc",
  "generated-output",
]);

const REPO_OWNED_INTENTS = new Set([
  "implementation-note",
  "design-spec",
  "task-breakdown",
  "investigation",
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

function envNameFromRecordTitle(title, fallback) {
  const normalized = String(title || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  if (!normalized) {
    return fallback;
  }
  return /^[A-Z_]/.test(normalized) ? normalized : `${fallback}_${normalized}`;
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
    ...(diagnosis?.projectId ? { projectId: diagnosis.projectId } : {}),
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
  if (!diagnosis) {
    return [];
  }

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

async function isManagedDocTarget(target, client) {
  const markdown = await fetchPageMarkdown(target.pageId, target.targetPath, client);
  const parts = splitManagedPageMarkdownIfPresent(markdown);
  return Boolean(parts)
    && /^Canonical Source:/m.test(parts.headerMarkdown)
    && /^Last Updated:/m.test(parts.headerMarkdown);
}

function buildDocPullDiffPushSteps({ commandArgs, projectTokenEnv, fileName }) {
  return [
    buildCommandStep(
      buildCommand("doc-pull", [...commandArgs, ["output", fileName]], projectTokenEnv),
      "Pull the current managed doc body before editing.",
    ),
    buildCommandStep(
      buildCommand("doc-diff", [...commandArgs, ["file", fileName]], projectTokenEnv),
      "Diff a proposed managed doc body against Notion.",
    ),
    buildCommandStep(
      buildCommand("doc-push", [...commandArgs, ["file", fileName]], projectTokenEnv),
      "Preview or apply the managed doc update through SNPM.",
    ),
  ];
}

async function routeProjectDoc({
  diagnosis,
  projectName,
  docPath,
  projectTokenEnv,
  config,
  client,
}) {
  const normalized = normalizeProjectManagedDocPath(docPath, config);
  if (!["project-root", "project-doc"].includes(normalized.family)) {
    throw new Error('Project doc routing is limited to "Root" and "Root > ..." paths. Use --intent planning for approved planning pages.');
  }

  const baseWarnings = getProjectTokenWarnings(diagnosis, "notion");
  const target = await findProjectManagedDocTarget(projectName, docPath, config, client);

  if (!target) {
    const createTarget = await prepareProjectManagedDocCreateTarget(projectName, docPath, config, client);
    return createBaseResult({
      diagnosis,
      intent: "project-doc",
      recommendedHome: "notion",
      surface: "project-docs",
      reason: "Curated project root docs belong in Notion under the managed project-doc surface.",
      targetPath: createTarget.targetPath,
      warnings: baseWarnings,
      nextCommands: [
        buildCommandStep(
          buildCommand("doc-create", [
            ["project", projectName],
            ["path", createTarget.docPath],
            ["file", "doc.md"],
          ], projectTokenEnv),
          "Create a new managed project doc under the curated project root doc surface.",
        ),
      ],
    });
  }

  const adoptable = findAdoptableEntry(
    diagnosis,
    (entry) => entry.type === "project-doc" && entry.targetPath === target.targetPath,
  );
  if (adoptable) {
    return createBaseResult({
      diagnosis,
      intent: "project-doc",
      recommendedHome: "notion",
      surface: "project-docs",
      reason: "Curated project root docs belong in Notion under the managed project-doc surface.",
      targetPath: target.targetPath,
      warnings: [
        ...baseWarnings,
        `Doc "${target.targetPath}" exists but is not managed by SNPM yet.`,
      ],
      nextCommands: [
        buildCommandStep(adoptable.command, "Standardize the existing unmanaged project doc first."),
      ],
    });
  }

  return createBaseResult({
    diagnosis,
    intent: "project-doc",
    recommendedHome: "notion",
    surface: "project-docs",
    reason: "Curated project root docs belong in Notion under the managed project-doc surface.",
    targetPath: target.targetPath,
    warnings: baseWarnings,
    nextCommands: buildDocPullDiffPushSteps({
      commandArgs: [
        ["project", projectName],
        ["path", normalized.normalizedPath],
      ],
      projectTokenEnv,
      fileName: "doc.md",
    }),
  });
}

async function routeWorkspaceDocFamily({
  intent,
  docPath,
  config,
  client,
}) {
  const normalized = normalizeWorkspaceManagedDocPath(docPath, config);
  const isTemplateIntent = intent === "template-doc";

  if (isTemplateIntent && !["workspace-subtree-root", "workspace-subtree-doc"].includes(normalized.family)) {
    throw new Error('Template doc routing is limited to "Templates > Project Templates" and descendants under it.');
  }

  if (!isTemplateIntent && normalized.family !== "workspace-exact") {
    throw new Error("Workspace doc routing is limited to the curated exact workspace-global doc paths.");
  }

  const target = await findWorkspaceManagedDocTarget(docPath, config, client);
  const reason = isTemplateIntent
    ? "Curated template docs belong in Notion under Templates > Project Templates."
    : "Curated workspace-global operator docs belong in Notion on the managed workspace-doc surface.";
  const surface = isTemplateIntent ? "template-docs" : "workspace-docs";

  if (!target) {
    if (!normalized.createAllowed) {
      return createBaseResult({
        diagnosis: null,
        intent,
        recommendedHome: "notion",
        surface,
        reason,
        ok: false,
        targetPath: normalized.normalizedPath,
        warnings: [
          `Curated doc "${normalized.normalizedPath}" is missing and cannot be created through doc-create.`,
        ],
        nextCommands: [],
      });
    }

    const createTarget = await prepareWorkspaceManagedDocCreateTarget(docPath, config, client);
    return createBaseResult({
      diagnosis: null,
      intent,
      recommendedHome: "notion",
      surface,
      reason,
      targetPath: createTarget.targetPath,
      warnings: [],
      nextCommands: [
        buildCommandStep(
          buildCommand("doc-create", [
            ["path", createTarget.docPath],
            ["file", "doc.md"],
          ]),
          "Create a new managed curated doc at this workspace/template path.",
        ),
      ],
    });
  }

  if (!(await isManagedDocTarget(target, client))) {
    return createBaseResult({
      diagnosis: null,
      intent,
      recommendedHome: "notion",
      surface,
      reason,
      targetPath: target.targetPath,
      warnings: [
        `Doc "${target.targetPath}" exists but is not managed by SNPM yet.`,
      ],
      nextCommands: [
        buildCommandStep(
          buildCommand("doc-adopt", [["path", normalized.normalizedPath]]),
          "Standardize the existing unmanaged curated doc first.",
        ),
      ],
    });
  }

  return createBaseResult({
    diagnosis: null,
    intent,
    recommendedHome: "notion",
    surface,
    reason,
    targetPath: target.targetPath,
    warnings: [],
    nextCommands: buildDocPullDiffPushSteps({
      commandArgs: [["path", normalized.normalizedPath]],
      fileName: "doc.md",
    }),
  });
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
  generated = false,
  intent = recordType,
}) {
  const baseWarnings = getProjectTokenWarnings(diagnosis, "notion");
  const targetPath = projectPath(projectName, ["Access", domainTitle, title]);
  const surfaceReason = "Canonical project-local secrets and tokens belong under the project Access surface in Notion.";

  if (!diagnosis.surfaces.access?.present) {
    return createBaseResult({
      diagnosis,
      intent,
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
      intent,
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
        intent,
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
        intent,
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
        const generateScriptName = recordType === "token" ? "access-token-generate" : "secret-record-generate";
        const generatorLabel = recordType === "token" ? "token" : "secret";
        if (generated) {
          return createBaseResult({
            diagnosis,
            intent,
            recommendedHome: "notion",
            surface: "access",
            reason: surfaceReason,
            targetPath,
            warnings: baseWarnings,
            nextCommands: [
              buildCommandStep(
                `${buildCommand(generateScriptName, [
                  ["project", projectName],
                  ["domain", domainTitle],
                  ["title", title],
                  ["mode", "create"],
                ], projectTokenEnv)} --apply -- <generator-command> [args...]`,
                `Generate the raw ${generatorLabel} in a child process and store it directly in Notion without local raw output.`,
              ),
            ],
          });
        }

        return createBaseResult({
          diagnosis,
          intent,
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
              ], projectTokenEnv),
              `Create a new managed ${recordType === "token" ? "access token" : "secret record"} shell under the Access domain, then paste the raw value directly into Notion.`,
            ),
          ],
        });
      }

      const prefix = recordType === "token" ? "access-token" : "secret-record";
      const fileName = recordType === "token" ? "access-token-redacted.md" : "secret-record-redacted.md";
      const envName = envNameFromRecordTitle(title, recordType === "token" ? "ACCESS_TOKEN" : "SECRET_VALUE");
      if (generated) {
        const generatorLabel = recordType === "token" ? "token" : "secret";
        return createBaseResult({
          diagnosis,
          intent,
          recommendedHome: "notion",
          surface: "access",
          reason: surfaceReason,
          targetPath: recordTarget.targetPath,
          warnings: baseWarnings,
          nextCommands: [
            buildCommandStep(
              `${buildCommand(`${prefix}-generate`, [
                ["project", projectName],
                ["domain", domainTitle],
                ["title", title],
                ["mode", "update"],
              ], projectTokenEnv)} --apply -- <generator-command> [args...]`,
              `Generate a replacement raw ${generatorLabel} in a child process and store it directly in Notion without local raw output.`,
            ),
            buildCommandStep(
              `${buildCommand(`${prefix}-exec`, [
                ["project", projectName],
                ["domain", domainTitle],
                ["title", title],
                ["env-name", envName],
              ], projectTokenEnv)} -- <command> [args...]`,
              `Consume the managed ${recordType === "token" ? "access token" : "secret record"} at runtime without exporting the raw value.`,
            ),
          ],
        });
      }

      return createBaseResult({
        diagnosis,
        intent,
        recommendedHome: "notion",
        surface: "access",
        reason: surfaceReason,
        targetPath: recordTarget.targetPath,
        warnings: baseWarnings,
        nextCommands: [
          buildCommandStep(
            `${buildCommand(`${prefix}-exec`, [
              ["project", projectName],
              ["domain", domainTitle],
              ["title", title],
              ["env-name", envName],
            ], projectTokenEnv)} -- <command> [args...]`,
            `Consume the managed ${recordType === "token" ? "access token" : "secret record"} at runtime without exporting the raw value.`,
          ),
          buildCommandStep(
            buildCommand(`${prefix}-pull`, [
              ["project", projectName],
              ["domain", domainTitle],
              ["title", title],
              ["output", fileName],
            ], projectTokenEnv),
            "Pull a redacted inspection copy only; it is not a push-ready editing base and writes no raw secret value.",
          ),
        ],
      });
    });
  });
}

function routeRepoOwned({ diagnosis, intent, repoPath }) {
  const reason = {
    "implementation-note": "Fast-changing implementation notes belong in the repo instead of managed Notion pages.",
    "design-spec": "Design specs belong in the repo where they can be reviewed alongside code and related artifacts.",
    "task-breakdown": "Task breakdowns belong in the repo when they are tightly coupled to implementation detail and code review.",
    investigation: "Investigations belong in the repo so evolving technical findings stay reviewable and versioned with code truth.",
    "repo-doc": "Code-coupled documentation belongs in the repo instead of being mirrored into Notion.",
    "generated-output": "Machine-owned outputs and generated artifacts belong in the repo or build outputs, not in Notion.",
  }[intent];

  return createBaseResult({
    diagnosis,
    intent,
    recommendedHome: "repo",
    surface: ["implementation-note", "design-spec", "task-breakdown", "investigation"].includes(intent)
      ? "implementation-truth"
      : intent,
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
  docPath,
  title,
  domainTitle,
  repoPath,
  workspaceClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  diagnoseProjectImpl = diagnoseProject,
}) {
  if (!SUPPORTED_INTENTS.has(intent)) {
    throw new Error(`Unsupported --intent "${intent}". Supported intents are: planning, runbook, secret, token, generated-secret, generated-token, project-doc, template-doc, workspace-doc, implementation-note, design-spec, task-breakdown, investigation, repo-doc, generated-output.`);
  }

  const needsWorkspaceClient = !REPO_OWNED_INTENTS.has(intent);
  const client = needsWorkspaceClient
    ? workspaceClient || makeNotionClientImpl(getWorkspaceTokenImpl(), config.notionVersion)
    : workspaceClient;
  const needsProjectDiagnosis = !["template-doc", "workspace-doc"].includes(intent)
    && !REPO_OWNED_INTENTS.has(intent);
  const diagnosis = needsProjectDiagnosis
    ? await diagnoseProjectImpl({
      config,
      projectName,
      projectTokenEnv,
      workspaceClient: client,
    })
    : null;

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

  if (intent === "secret" || intent === "token" || intent === "generated-secret" || intent === "generated-token") {
    return routeAccessRecord({
      diagnosis,
      projectName,
      domainTitle,
      title,
      projectTokenEnv,
      config,
      client,
      recordType: intent === "generated-token" ? "token" : intent === "generated-secret" ? "secret" : intent,
      generated: intent === "generated-secret" || intent === "generated-token",
      intent,
    });
  }

  if (intent === "project-doc") {
    return routeProjectDoc({
      diagnosis,
      projectName,
      docPath,
      projectTokenEnv,
      config,
      client,
    });
  }

  if (intent === "template-doc" || intent === "workspace-doc") {
    return routeWorkspaceDocFamily({
      intent,
      docPath,
      config,
      client,
    });
  }

  return routeRepoOwned({
    diagnosis,
    intent,
    repoPath,
  });
}
