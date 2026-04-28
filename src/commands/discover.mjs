const SNPM_RUN_CONTEXT = "C:\\SNPM";
const DEFAULT_WORKSPACE = "infrastructure-hq";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function quote(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function deriveProjectTokenEnv(projectName) {
  const normalized = normalizeString(projectName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${normalized || "PROJECT"}_NOTION_TOKEN`;
}

function tokenFlag(projectTokenEnv) {
  return projectTokenEnv ? ` --project-token-env ${projectTokenEnv}` : "";
}

export function buildDiscoverPayload({
  projectName,
  projectTokenEnv,
  workspaceName = DEFAULT_WORKSPACE,
} = {}) {
  const normalizedProjectName = normalizeString(projectName);
  if (!normalizedProjectName) {
    throw new Error('Provide --project "Project Name".');
  }

  const normalizedWorkspaceName = normalizeString(workspaceName) || DEFAULT_WORKSPACE;
  const normalizedProjectTokenEnv = normalizeString(projectTokenEnv);
  const recommendedProjectTokenEnv = normalizedProjectTokenEnv || deriveProjectTokenEnv(normalizedProjectName);
  const projectFlag = `--project ${quote(normalizedProjectName)}`;
  const nameFlag = `--name ${quote(normalizedProjectName)}`;
  const envFlag = tokenFlag(normalizedProjectTokenEnv);
  const recommendedEnvFlag = tokenFlag(recommendedProjectTokenEnv);
  const sourceDiscoverCommand = `npm run discover -- ${projectFlag}${envFlag}`;
  const installedDiscoverCommand = `snpm discover ${projectFlag}${envFlag}`;

  return {
    ok: true,
    schemaVersion: 1,
    command: "discover",
    snpm: {
      identity: "SNPM is the Infrastructure HQ Notion control repo for project bootstrap, verification, routing, and approved live mutations.",
      runContext: SNPM_RUN_CONTEXT,
      workspace: normalizedWorkspaceName,
      project: normalizedProjectName,
      projectTokenEnv: normalizedProjectTokenEnv || null,
      recommendedProjectTokenEnv,
    },
    boundaries: {
      useControlRepo: `Use ${SNPM_RUN_CONTEXT} for source-checkout npm-script operation; installed snpm CLI commands may run from a caller repo without vendoring SNPM internals.`,
      noVendoring: "Do not vendor SNPM scripts, workspace ids, workspace config, starter-tree config, or Notion page ids into consumer repos.",
      consumerRepoOwns: [
        "source code",
        "code-coupled docs",
        "tests and shipped behavior",
        "repo-local implementation notes",
      ],
      notionOwns: [
        "approved planning pages",
        "managed project docs",
        "managed runbooks",
        "Access records",
        "durable project operations state",
      ],
    },
    commandForms: {
      sourceCheckout: {
        context: `Use this form when you have the SNPM source checkout at ${SNPM_RUN_CONTEXT}.`,
        firstContactCommand: sourceDiscoverCommand,
        setupCommands: [
          {
            command: `Set-Location ${SNPM_RUN_CONTEXT}`,
            reason: "Switch the shell to the SNPM control repo before invoking npm scripts.",
          },
        ],
        safeFirstCommands: [
          {
            command: `npm run doctor -- ${projectFlag}${envFlag}`,
            reason: "Read-only project health and managed-surface scan.",
          },
          {
            command: `npm run recommend -- ${projectFlag} --intent <intent>${envFlag}`,
            reason: "Resolve Notion-vs-repo ownership when the target surface is unclear.",
          },
          {
            command: `npm run plan-change -- --targets-file <path|-> ${projectFlag}${envFlag}`,
            reason: "Plan coordinated multi-target documentation changes before mutation.",
          },
        ],
      },
      installedCli: {
        context: "Use this form when SNPM is installed as the snpm CLI on PATH.",
        firstContactCommand: installedDiscoverCommand,
        safeFirstCommands: [
          {
            command: `snpm doctor ${projectFlag}${envFlag}`,
            reason: "Read-only project health and managed-surface scan.",
          },
          {
            command: `snpm recommend ${projectFlag} --intent <intent>${envFlag}`,
            reason: "Resolve Notion-vs-repo ownership when the target surface is unclear.",
          },
          {
            command: `snpm plan-change --targets-file <path|-> ${projectFlag}${envFlag}`,
            reason: "Plan coordinated multi-target documentation changes before mutation.",
          },
        ],
      },
    },
    safeFirstCommands: [
      {
        command: `Set-Location ${SNPM_RUN_CONTEXT}`,
        reason: "Switch the shell to the SNPM control repo before invoking npm scripts.",
      },
      {
        command: `npm run doctor -- --project ${quote(normalizedProjectName)}${envFlag}`,
        reason: "Read-only project health and managed-surface scan.",
      },
      {
        command: `npm run recommend -- --project ${quote(normalizedProjectName)} --intent <intent>${envFlag}`,
        reason: "Resolve Notion-vs-repo ownership when the target surface is unclear.",
      },
      {
        command: `npm run plan-change -- --targets-file <path|-> --project ${quote(normalizedProjectName)}${envFlag}`,
        reason: "Plan coordinated multi-target documentation changes before mutation.",
      },
    ],
    optionalSetupCommands: [
      {
        command: `npm run verify-project -- --name ${quote(normalizedProjectName)}${recommendedEnvFlag}`,
        reason: "Use once a project-scoped Notion token exists and is shared to the project subtree.",
      },
      {
        command: "npm run capabilities",
        reason: "Use only after first contact when full machine-readable command discovery is needed.",
      },
    ],
    mutationLoop: [
      "Run doctor/recommend/plan-change first to choose the owning command family.",
      "Pull the managed body to a local file when editing is needed.",
      "Review changes with the matching diff command.",
      "Apply only with the owning push --apply command and fresh metadata.",
      "Rerun verify-project, doctor, and any relevant audits after live Notion mutation.",
    ],
    notes: [
      "discover is static first-contact guidance; it does not read Notion, write files, write sidecars, or append mutation journal entries.",
      "Project-token setup is optional until repo-local Notion automation is needed.",
      "Use recommend or plan-change when the owning surface is unclear.",
    ],
  };
}
