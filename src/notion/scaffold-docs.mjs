import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import * as managedDocPolicy from "./managed-doc-policy.mjs";
import * as projectPolicy from "./project-policy.mjs";
import { makeNotionClient } from "./client.mjs";
import {
  findProjectManagedDocTarget,
  normalizeProjectManagedDocPath,
  prepareProjectManagedDocCreateTarget,
} from "./doc-targets.mjs";
import { getProjectToken, getWorkspaceToken } from "./env.mjs";
import { buildPullPageMetadata, fetchLivePageMetadata } from "./page-metadata.mjs";
import { findProjectPathTarget, parseApprovedPlanningPagePath } from "./page-targets.mjs";
import {
  fetchPageMarkdown,
  normalizeEditableBodyMarkdown,
  splitManagedPageMarkdownIfPresent,
} from "./page-markdown.mjs";
import { projectPath } from "./project-model.mjs";
import { buildCommand } from "./routing-policy.mjs";

const DEFAULT_STARTER_DOC_SCAFFOLD = [
  {
    id: "root-overview",
    kind: "project-doc",
    target: "Root > Overview",
    file: "docs/project-overview.md",
    templateId: "project-overview",
  },
  {
    id: "root-operating-model",
    kind: "project-doc",
    target: "Root > Operating Model",
    file: "docs/operating-model.md",
    templateId: "project-operating-model",
  },
  {
    id: "planning-roadmap",
    kind: "planning-page",
    target: "Planning > Roadmap",
    file: "planning/roadmap.md",
    templateId: "planning-roadmap",
  },
  {
    id: "planning-current-cycle",
    kind: "planning-page",
    target: "Planning > Current Cycle",
    file: "planning/current-cycle.md",
    templateId: "planning-current-cycle",
  },
];

function renderProjectOperatingModelTemplate({ projectName }) {
  return [
    `> Starter content for ${projectName}. Replace placeholders during review before publishing to Notion.`,
    "",
    "Last Updated: [YYYY-MM-DD]",
    "",
    "## Source Of Truth",
    "- Notion owns durable operating state, planning, runbooks, and access records.",
    "- The repo owns implementation detail, generated artifacts, and fast-changing engineering notes.",
    "",
    "## Operating Principles",
    "- Define the source-of-truth split between Notion-owned operations and repo-owned implementation detail.",
    "",
    "## Standard Workflow",
    "- Describe the normal path for planning, implementation, validation, release, and follow-up.",
    "",
    "## Verification",
    "- Record the required checks before work is considered done.",
    "- Verify the live project with `verify-project` and `doctor` after publishing starter content.",
    "",
    "## Escalation",
    "- Capture who to involve when access, validation, or operational state is blocked.",
    "",
  ].join("\n");
}

const TEMPLATE_RENDERERS = new Map([
  ["project-overview", ({ projectName }) => [
    `> Starter content for ${projectName}. Replace placeholders during review before publishing to Notion.`,
    "",
    "Last Updated: [YYYY-MM-DD]",
    "",
    "## Purpose",
    `- Summarize what ${projectName} exists to deliver.`,
    "",
    "## Current Status",
    "- Capture the active lifecycle state, owner, and current operating focus.",
    "",
    "## Canonical Surfaces",
    "- Notion: link the durable planning, runbook, and access surfaces that operators should use.",
    "- Repo: link the code-coupled docs, issue tracker, and release artifacts that should remain repo-owned.",
    "",
    "## Source Of Truth",
    "- Keep durable planning and operator state in Notion.",
    "- Keep implementation detail, generated artifacts, and transient investigation notes in the repo.",
    "",
    "## Verification",
    "- Run `verify-project` and `doctor` before treating this overview as current.",
    "",
    "## Open Questions",
    "- List decisions that need a durable answer before the next milestone.",
    "",
  ].join("\n")],
  ["project-operating-model", renderProjectOperatingModelTemplate],
  ["operating-model", renderProjectOperatingModelTemplate],
  ["planning-roadmap", ({ projectName }) => [
    `> Starter content for ${projectName}. Replace placeholders during review before publishing to Notion.`,
    "",
    "Last Updated: [YYYY-MM-DD]",
    "",
    "## Source Of Truth",
    "- This page owns durable milestone sequencing and operator-visible roadmap state.",
    "- Keep implementation notes and task-level scratch work in the repo.",
    "",
    "## Now",
    "- Identify the current milestone and the user-visible outcome it should produce.",
    "",
    "## Next",
    "- List the next bounded milestones after the active cycle.",
    "",
    "## Later",
    "- Keep deferred ideas here until they have an owner and a validation path.",
    "",
    "## Risks",
    "- Track risks that could change sequencing or scope.",
    "",
    "## Verification",
    "- Run `page-diff` before publishing roadmap edits.",
    "- Run `verify-project` and `doctor` after publishing.",
    "",
  ].join("\n")],
  ["planning-current-cycle", ({ projectName }) => [
    `> Starter content for ${projectName}. Replace placeholders during review before publishing to Notion.`,
    "",
    "Last Updated: [YYYY-MM-DD]",
    "",
    "## Source Of Truth",
    "- This page owns the active cycle summary and durable closeout state.",
    "- Keep implementation scratch notes, branch-specific research, and generated artifacts in the repo.",
    "",
    "## Objective",
    "- State the single active objective for this cycle.",
    "",
    "## Success Gates",
    "- [ ] Define the concrete behavior or artifact that proves this cycle is complete.",
    "- [ ] Run the required SNPM verification before closeout.",
    "",
    "## Active Work",
    "- List the current work items, owners, and blocking dependencies.",
    "",
    "## Closeout Notes",
    "- Record what changed in Notion, what remained local-only, and which commands verified it.",
    "",
  ].join("\n")],
]);

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Provide ${label}.`);
  }

  return value.trim();
}

function normalizeRelativeFilePath(filePath, label) {
  const normalizedInput = requireNonEmptyString(filePath, label).replaceAll("\\", "/");
  if (
    path.isAbsolute(normalizedInput)
    || path.win32.isAbsolute(normalizedInput)
    || path.posix.isAbsolute(normalizedInput)
  ) {
    throw new Error(`${label} must be a relative file path.`);
  }

  if (/[*?[\]{}!]/.test(normalizedInput)) {
    throw new Error(`${label} must not include glob characters.`);
  }

  const normalized = path.posix.normalize(normalizedInput);
  if (
    normalized === "."
    || normalized === ".."
    || normalized.startsWith("../")
    || normalized.split("/").includes("..")
  ) {
    throw new Error(`${label} must not escape the scaffold output directory.`);
  }

  return normalized;
}

function assertUnique(value, label, seen) {
  if (seen.has(value)) {
    throw new Error(`Duplicate scaffold ${label}: "${value}".`);
  }
  seen.add(value);
}

function normalizeScaffoldSpec(rawSpec, index, config) {
  if (!rawSpec || typeof rawSpec !== "object" || Array.isArray(rawSpec)) {
    throw new Error(`starterDocScaffold[${index}] must be an object.`);
  }

  const id = requireNonEmptyString(rawSpec.id, `starterDocScaffold[${index}].id`);
  const kind = requireNonEmptyString(rawSpec.kind, `starterDocScaffold[${index}].kind`);
  const target = requireNonEmptyString(
    rawSpec.target || rawSpec.path || rawSpec.docPath || rawSpec.pagePath,
    `starterDocScaffold[${index}].target`,
  );
  const file = normalizeRelativeFilePath(rawSpec.file, `starterDocScaffold[${index}].file`);
  const templateId = requireNonEmptyString(
    rawSpec.templateId || rawSpec.template || rawSpec.builtInTemplateId,
    `starterDocScaffold[${index}].templateId`,
  );

  if (!TEMPLATE_RENDERERS.has(templateId)) {
    throw new Error(`Unsupported starterDocScaffold[${index}].templateId "${templateId}".`);
  }

  if (kind !== "project-doc" && kind !== "planning-page") {
    throw new Error(`Unsupported starterDocScaffold[${index}].kind "${kind}".`);
  }

  if (kind === "project-doc") {
    const parsed = normalizeProjectDocScaffoldTarget(target, config);
    return {
      id,
      kind,
      target: parsed.normalizedPath,
      file,
      templateId,
    };
  }

  const pageSegments = parseApprovedPlanningPagePath(target);
  return {
    id,
    kind,
    target: pageSegments.join(" > "),
    file,
    templateId,
  };
}

function normalizeProjectDocScaffoldTarget(target, config) {
  try {
    const parsed = normalizeProjectManagedDocPath(target, config);
    if (parsed.family !== "project-doc" || !parsed.createAllowed) {
      throw new Error('project-doc targets must use "Root > <Doc Title>".');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid project-doc scaffold target "${target}": ${error.message}`);
  }
}

function normalizeScaffoldSpecs(rawSpecs, config) {
  const seenIds = new Set();
  const seenFiles = new Set();
  const seenTargets = new Set();
  return rawSpecs.map((rawSpec, index) => {
    const spec = normalizeScaffoldSpec(rawSpec, index, config);
    assertUnique(spec.id, "id", seenIds);
    assertUnique(spec.file, "file", seenFiles);
    assertUnique(`${spec.kind}:${spec.target}`, "target", seenTargets);
    return spec;
  });
}

function callOptionalPolicyGetter(config) {
  const candidates = [
    managedDocPolicy.getProjectPolicyStarterDocScaffold,
    managedDocPolicy.getStarterDocScaffold,
    projectPolicy.getProjectPolicyStarterDocScaffold,
    projectPolicy.getStarterDocScaffold,
  ];

  for (const getter of candidates) {
    if (typeof getter !== "function") {
      continue;
    }

    const value = getter(config);
    if (Array.isArray(value)) {
      return {
        specs: value,
        source: "policy-getter",
        integrationNeeds: [],
      };
    }
  }

  if (Array.isArray(config?.policyPack?.starterDocScaffold)) {
    return {
      specs: config.policyPack.starterDocScaffold,
      source: "policy-pack",
      integrationNeeds: [],
    };
  }

  return {
    specs: DEFAULT_STARTER_DOC_SCAFFOLD,
    source: "default-fallback",
    integrationNeeds: [
      "No exported starterDocScaffold policy getter was available; using Sprint 4.2 fallback scaffold defaults.",
    ],
  };
}

function renderDraftMarkdown(spec, projectName) {
  return normalizeEditableBodyMarkdown(TEMPLATE_RENDERERS.get(spec.templateId)({ projectName }));
}

function commandStep(command, reason, cwd = null) {
  return {
    kind: "command",
    command,
    reason,
    ...(cwd ? { cwd } : {}),
  };
}

function buildVerifyCommands(projectName, projectTokenEnv) {
  return [
    commandStep(
      buildCommand("verify-project", [["name", projectName]], projectTokenEnv),
      "Verify the project starter tree and approved managed descendants after applying scaffold drafts.",
    ),
    commandStep(
      buildCommand("doctor", [["project", projectName]], projectTokenEnv),
      "Run the read-only project health scan after scaffold follow-up commands.",
    ),
  ];
}

function buildDocCreateCommand({ projectName, spec, projectTokenEnv, commandCwd }) {
  return commandStep(
    buildCommand("doc-create", [
      ["project", projectName],
      ["path", spec.target],
      ["file", spec.file],
    ], projectTokenEnv),
    "Create the missing managed project doc from the generated local draft.",
    commandCwd,
  );
}

function buildDocReviewCommands({ projectName, spec, projectTokenEnv, commandCwd }) {
  return [
    commandStep(
      buildCommand("doc-pull", [
        ["project", projectName],
        ["path", spec.target],
        ["output", spec.file],
      ], projectTokenEnv),
      "Pull the existing managed project doc before deciding whether to edit it.",
      commandCwd,
    ),
    commandStep(
      buildCommand("doc-diff", [
        ["project", projectName],
        ["path", spec.target],
        ["file", spec.file],
      ], projectTokenEnv),
      "Review local changes against the existing managed project doc after editing the pulled file.",
      commandCwd,
    ),
  ];
}

function buildPagePushCommand({ projectName, spec, projectTokenEnv, commandCwd }) {
  return commandStep(
    buildCommand("page-push", [
      ["project", projectName],
      ["page", spec.target],
      ["file", spec.file],
    ], projectTokenEnv),
    "Preview or apply the approved planning-page body update from the generated local draft.",
    commandCwd,
  );
}

function dedupeCommands(commands) {
  const seen = new Set();
  const deduped = [];
  for (const step of commands) {
    const key = `${step.cwd || ""}\n${step.command}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(step);
  }
  return deduped;
}

function outputPathFor(outputRoot, relativeFile) {
  const resolvedRoot = path.resolve(outputRoot);
  const resolvedPath = path.resolve(resolvedRoot, ...relativeFile.split("/"));

  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Scaffold file "${relativeFile}" escapes outputDir.`);
  }

  return resolvedPath;
}

function writeTextFile(filePath, text, { mkdirSyncImpl, writeFileSyncImpl }) {
  mkdirSyncImpl(path.dirname(filePath), { recursive: true });
  writeFileSyncImpl(filePath, text, "utf8");
}

function planEntry(entry) {
  const {
    draftMarkdown,
    metadata,
    ...rest
  } = entry;

  return {
    ...rest,
    hasDraftMarkdown: Boolean(draftMarkdown),
    hasMetadata: Boolean(metadata),
  };
}

function scaffoldPlanForResult(result) {
  return {
    ...result,
    entries: result.entries.map(planEntry),
  };
}

async function maybeBuildPlanningMetadata({
  authMode,
  client,
  projectId,
  target,
  workspaceName,
}) {
  if (!client || typeof client.request !== "function") {
    return {
      metadata: null,
      warning: "Live page metadata is unavailable because the provided client does not support request(method, apiPath).",
    };
  }

  try {
    const liveMetadata = await fetchLivePageMetadata(target.pageId, client);
    if (liveMetadata.archived) {
      return {
        metadata: null,
        warning: `Planning page "${target.targetPath}" is archived or in trash; metadata sidecar was not generated.`,
      };
    }

    return {
      metadata: buildPullPageMetadata({
        commandFamily: "page",
        workspaceName,
        targetPath: target.targetPath,
        pageId: target.pageId,
        projectId,
        authMode,
        lastEditedTime: liveMetadata.lastEditedTime,
      }),
      warning: null,
    };
  } catch (error) {
    return {
      metadata: null,
      warning: `Live page metadata is unavailable for "${target.targetPath}": ${error.message}`,
    };
  }
}

async function maybeBuildPlanningContentWarning({ client, target }) {
  if (!client || typeof client.request !== "function") {
    return "Live planning-page content is unavailable because the provided client does not support request(method, apiPath).";
  }

  try {
    const markdown = await fetchPageMarkdown(target.pageId, target.targetPath, client);
    const managedParts = splitManagedPageMarkdownIfPresent(markdown);
    const bodyMarkdown = managedParts ? managedParts.bodyMarkdown : normalizeEditableBodyMarkdown(markdown);
    return bodyMarkdown.trim().length > 0
      ? `Planning page "${target.targetPath}" already has body content; review page-diff before any page-push --apply.`
      : null;
  } catch (error) {
    return `Live planning-page content is unavailable for "${target.targetPath}": ${error.message}`;
  }
}

async function scaffoldProjectDocEntry({
  client,
  commandCwd,
  config,
  outputRoot,
  projectName,
  projectTokenEnv,
  spec,
}) {
  const existing = await findProjectManagedDocTarget(projectName, spec.target, config, client);
  if (existing) {
    return {
      id: spec.id,
      kind: spec.kind,
      target: spec.target,
      targetPath: existing.targetPath,
      file: spec.file,
      status: "already-exists",
      pageId: existing.pageId,
      projectId: existing.projectId || null,
      outputPath: null,
      metadataPath: null,
      warnings: [
        `Project doc "${existing.targetPath}" already exists; scaffold-docs will not overwrite it.`,
      ],
      nextCommands: buildDocReviewCommands({
        projectName,
        spec,
        projectTokenEnv,
        commandCwd,
      }),
    };
  }

  const createTarget = await prepareProjectManagedDocCreateTarget(projectName, spec.target, config, client);
  const draftMarkdown = renderDraftMarkdown(spec, projectName);
  return {
    id: spec.id,
    kind: spec.kind,
    target: spec.target,
    targetPath: createTarget.targetPath,
    file: spec.file,
    status: "create-ready",
    pageId: null,
    projectId: createTarget.projectId || null,
    outputPath: outputRoot ? outputPathFor(outputRoot, spec.file) : null,
    metadataPath: null,
    draftMarkdown,
    warnings: [],
    nextCommands: [
      buildDocCreateCommand({
        projectName,
        spec,
        projectTokenEnv,
        commandCwd,
      }),
    ],
  };
}

async function scaffoldPlanningPageEntry({
  authMode,
  client,
  commandCwd,
  metadataClient,
  outputRoot,
  projectName,
  projectTokenEnv,
  spec,
  workspaceName,
  config,
}) {
  const pageSegments = parseApprovedPlanningPagePath(spec.target);
  const target = await findProjectPathTarget(projectName, pageSegments, config, client);
  const targetPath = projectPath(projectName, pageSegments);

  if (!target) {
    return {
      id: spec.id,
      kind: spec.kind,
      target: spec.target,
      targetPath,
      file: spec.file,
      status: "missing-target",
      pageId: null,
      projectId: null,
      outputPath: null,
      metadataPath: null,
      warnings: [
        `Approved planning page "${targetPath}" is missing; scaffold-docs cannot prepare a safe page-push draft for it.`,
      ],
      nextCommands: buildVerifyCommands(projectName, projectTokenEnv),
    };
  }

  const draftMarkdown = renderDraftMarkdown(spec, projectName);
  const outputPath = outputRoot ? outputPathFor(outputRoot, spec.file) : null;
  const metadataResult = outputPath
    ? await maybeBuildPlanningMetadata({
      authMode,
      client: metadataClient,
      projectId: target.projectId,
      target,
      workspaceName,
    })
    : { metadata: null, warning: null };
  const metadataPath = outputPath && metadataResult.metadata
    ? `${outputPath}.snpm-meta.json`
    : null;
  const contentWarning = outputPath
    ? await maybeBuildPlanningContentWarning({ client: metadataClient, target })
    : null;
  const warnings = [
    metadataResult.warning,
    contentWarning,
  ].filter(Boolean);

  return {
    id: spec.id,
    kind: spec.kind,
    target: spec.target,
    targetPath: target.targetPath,
    file: spec.file,
    status: "update-ready",
    pageId: target.pageId,
    projectId: target.projectId,
    outputPath,
    metadataPath,
    draftMarkdown,
    metadata: metadataResult.metadata,
    warnings,
    nextCommands: [
      buildPagePushCommand({
        projectName,
        spec,
        projectTokenEnv,
        commandCwd,
      }),
    ],
  };
}

function writeScaffoldOutputs({
  entries,
  result,
  outputRoot,
  mkdirSyncImpl,
  writeFileSyncImpl,
}) {
  if (!outputRoot) {
    return [];
  }

  const writes = [];
  for (const entry of entries) {
    if (!entry.outputPath || !entry.draftMarkdown) {
      continue;
    }

    writeTextFile(entry.outputPath, entry.draftMarkdown, { mkdirSyncImpl, writeFileSyncImpl });
    writes.push({ kind: "draft", path: entry.outputPath });

    if (entry.metadataPath && entry.metadata) {
      writeTextFile(
        entry.metadataPath,
        `${JSON.stringify(entry.metadata, null, 2)}\n`,
        { mkdirSyncImpl, writeFileSyncImpl },
      );
      writes.push({ kind: "metadata", path: entry.metadataPath });
    }
  }

  const planPath = path.join(path.resolve(outputRoot), "scaffold-plan.json");
  writeTextFile(
    planPath,
    `${JSON.stringify(scaffoldPlanForResult({ ...result, writes: [] }), null, 2)}\n`,
    { mkdirSyncImpl, writeFileSyncImpl },
  );
  writes.push({ kind: "scaffold-plan", path: planPath });
  return writes;
}

export function getDefaultStarterDocScaffold() {
  return DEFAULT_STARTER_DOC_SCAFFOLD.map((spec) => ({ ...spec }));
}

export function resolveStarterDocScaffold(config) {
  const resolved = callOptionalPolicyGetter(config);
  return {
    specs: normalizeScaffoldSpecs(resolved.specs, config),
    source: resolved.source,
    integrationNeeds: resolved.integrationNeeds,
  };
}

export async function scaffoldProjectStarterDocs({
  apply = false,
  config,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
  outputDir,
  client,
  makeNotionClientImpl = makeNotionClient,
  getProjectTokenImpl = getProjectToken,
  getWorkspaceTokenImpl = getWorkspaceToken,
  mkdirSyncImpl = mkdirSync,
  writeFileSyncImpl = writeFileSync,
} = {}) {
  if (apply === true) {
    throw new Error("scaffold-docs is preview-first and never mutates Notion. Use --output-dir to write local drafts, then run the generated doc-create/page-push commands explicitly.");
  }

  if (!config || typeof config !== "object") {
    throw new Error("A workspace config object is required.");
  }

  const normalizedProjectName = requireNonEmptyString(projectName, '--project "<Project Name>"');
  const outputRoot = outputDir ? path.resolve(requireNonEmptyString(outputDir, "--output-dir <path>")) : null;
  const commandCwd = outputRoot || null;
  const authMode = projectTokenEnv ? "project-token" : "workspace-token";
  const readClient = client || makeNotionClientImpl(getWorkspaceTokenImpl(), config.notionVersion);
  const metadataClient = client || (
    projectTokenEnv
      ? makeNotionClientImpl(getProjectTokenImpl(projectTokenEnv), config.notionVersion)
      : readClient
  );
  const scaffold = resolveStarterDocScaffold(config);

  const entries = [];
  for (const spec of scaffold.specs) {
    if (spec.kind === "project-doc") {
      entries.push(await scaffoldProjectDocEntry({
        client: readClient,
        commandCwd,
        config,
        outputRoot,
        projectName: normalizedProjectName,
        projectTokenEnv,
        spec,
      }));
      continue;
    }

    entries.push(await scaffoldPlanningPageEntry({
      authMode,
      client: readClient,
      commandCwd,
      config,
      metadataClient,
      outputRoot,
      projectName: normalizedProjectName,
      projectTokenEnv,
      spec,
      workspaceName,
    }));
  }

  const result = {
    ok: entries.every((entry) => entry.status !== "missing-target"),
    command: "scaffold-docs",
    applied: false,
    mutatesNotion: false,
    workspaceName,
    projectName: normalizedProjectName,
    outputDir: outputRoot,
    scaffoldPlanPath: outputRoot ? path.join(outputRoot, "scaffold-plan.json") : null,
    policySource: scaffold.source,
    integrationNeeds: scaffold.integrationNeeds,
    entries,
    nextCommands: dedupeCommands([
      ...entries.flatMap((entry) => entry.nextCommands),
      ...buildVerifyCommands(normalizedProjectName, projectTokenEnv),
    ]),
    writes: [],
  };

  const writes = writeScaffoldOutputs({
    entries,
    result,
    outputRoot,
    mkdirSyncImpl,
    writeFileSyncImpl,
  });

  return {
    ...result,
    writes,
  };
}
