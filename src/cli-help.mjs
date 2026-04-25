const OPT_WORKSPACE = "--workspace infrastructure-hq";
const OPT_PROJECT = '--project "Project Name"';
const OPT_PROJECT_TOKEN = "--project-token-env PROJECT_NAME_NOTION_TOKEN";
const OPT_APPLY = "--apply";
const OPT_EXPLAIN = "--explain";
const OPT_REVIEW_OUTPUT = "--review-output <dir>";
const OPT_OUTPUT_DIR = "--output-dir <dir>";
const OPT_METADATA_OUTPUT = "--metadata-output <path>";
const OPT_METADATA = "--metadata <path>";
const OPT_ENV_NAME = "--env-name ENV_NAME";
const OPT_STDIN_SECRET = "--stdin-secret";
const OPT_CWD = "--cwd <dir>";
const OPT_BUNDLE = "--bundle";
const OPT_REFRESH_SIDECARS = "--refresh-sidecars";
const OPT_TRUTH_AUDIT = "--truth-audit";
const OPT_STALE_AFTER_DAYS = "--stale-after-days <positive integer>";
const OPT_SYNC_ENTRY = "--entry <kind:target>";
const OPT_SYNC_ENTRIES_FILE = "--entries-file <path|->";
const OPT_MAX_MUTATIONS = "--max-mutations <n|all>";
const HELP_TOKENS = new Set(["--help", "-h"]);
const SYNC_MANIFEST_VERSIONS = [1, 2];
const SYNC_MANIFEST_V2_ENTRY_KINDS = [
  "planning-page",
  "project-doc",
  "template-doc",
  "workspace-doc",
  "runbook",
  "validation-session",
];
const SYNC_CAPABILITY_METADATA = {
  check: {
    notionMutation: "none",
    localFileWrites: "none",
    journalWrites: "none",
    supportedManifestVersions: SYNC_MANIFEST_VERSIONS,
    supportedManifestV2EntryKinds: SYNC_MANIFEST_V2_ENTRY_KINDS,
    manifestV2Selection: "entry-or-entries-file",
    reviewOutput: "manifest-v2-only",
    structuredDiagnostics: "manifest-v2-result-and-review-metadata",
    diagnosticFields: ["code", "severity", "entry", "target", "safeNextCommand", "recoveryAction"],
    diagnosticScope: "manifest-v2-only",
    diagnosticPurpose: "operator-recovery-metadata",
    diagnosticNonGoals: ["rollback", "automatic-retries", "semantic-consistency-checks", "transaction-semantics", "generic-batch-apply"],
  },
  pull: {
    notionMutation: "none",
    localFileWrites: "apply-gated",
    journalWrites: "none",
    supportedManifestVersions: SYNC_MANIFEST_VERSIONS,
    supportedManifestV2EntryKinds: SYNC_MANIFEST_V2_ENTRY_KINDS,
    manifestV2Selection: "entry-or-entries-file",
    reviewOutput: "unsupported",
    structuredDiagnostics: "manifest-v2-result-metadata",
    diagnosticFields: ["code", "severity", "entry", "target", "safeNextCommand", "recoveryAction"],
    diagnosticScope: "manifest-v2-only",
    diagnosticPurpose: "operator-recovery-metadata",
    diagnosticNonGoals: ["rollback", "automatic-retries", "semantic-consistency-checks", "transaction-semantics", "generic-batch-apply"],
  },
  push: {
    notionMutation: "apply-gated",
    localFileWrites: "opt-in-refresh-sidecars-apply-gated",
    journalWrites: "apply-gated",
    sidecarRefresh: "opt-in-apply-gated",
    supportedManifestVersions: SYNC_MANIFEST_VERSIONS,
    supportedManifestV2EntryKinds: SYNC_MANIFEST_V2_ENTRY_KINDS,
    manifestV2Selection: "entry-or-entries-file",
    reviewOutput: "manifest-v2-preview-only",
    maxMutations: "manifest-v2-apply-default-1",
    structuredDiagnostics: "manifest-v2-result-and-review-metadata",
    diagnosticFields: ["code", "severity", "entry", "target", "safeNextCommand", "recoveryAction"],
    diagnosticScope: "manifest-v2-only",
    diagnosticPurpose: "operator-recovery-metadata",
    diagnosticNonGoals: ["rollback", "automatic-retries", "semantic-consistency-checks", "transaction-semantics", "generic-batch-apply"],
  },
};

const SECRET_CONSUME_ONLY_CAPABILITY_METADATA = {
  secretOutput: "redacted-only",
  rawSecretExport: "unsupported",
  localSecretPersistence: "unsupported",
  reviewOutputRedaction: "secret-bearing-surfaces-redacted",
  secretConsumption: "exec-only",
};

const SECRET_EXEC_CAPABILITY_METADATA = {
  notionMutation: "none",
  localFileWrites: "none",
  journalWrites: "none",
  secretConsumption: "exec-only",
  secretDeliveryModes: ["env", "stdin"],
  rawSecretExport: "unsupported",
  localSecretPersistence: "none",
  childProcessExecution: "shell-false",
  childOutputRedaction: "exact-secret-redaction-fail-closed",
};

const SECRET_UNSUPPORTED_LOCAL_MARKDOWN_METADATA = {
  supported: false,
  supportStatus: "unsupported-secret-consume-only",
  rawSecretExport: "unsupported",
  localSecretPersistence: "unsupported",
  secretConsumption: "exec-only",
};

const SECRET_REVIEW_NOTES = [
  "Secret-bearing Access output is redacted in terminal diffs and review artifacts by default.",
  "Inputs containing the SNPM redaction marker are rejected so redacted pull output cannot overwrite a live secret.",
  "Raw local secret export is unsupported; use the exec subcommand for runtime consumption.",
];

const SECRET_PULL_NOTES = [
  "Secret-bearing Access pulls are redacted-only and do not write metadata sidecars because redacted files are not push-ready editing bases.",
  "Raw local secret export is unsupported; deprecated raw-output flags fail with exec-only guidance.",
  "When a pull command uses --output -, the markdown body is written to stdout and the structured metadata is written to stderr.",
  "Use the exec subcommand to consume the raw value in a child process without persisting it to a local markdown file.",
];

const SECRET_EXEC_NOTES = [
  "Exec extracts exactly one raw value from the managed Notion record in memory and injects it into one child process.",
  "Use --env-name ENV_NAME to inject the value into the child environment, or --stdin-secret to pass it on stdin.",
  "The child command must appear after a literal -- delimiter and runs with shell: false.",
  "SNPM redacts exact secret values from child stdout and stderr and fails closed if redaction was required.",
  "Exec does not mutate Notion, write local secret files, or append mutation journal entries.",
];

const SECRET_UNSUPPORTED_LOCAL_MARKDOWN_NOTES = [
  "Unsupported for secret-bearing Access records under the consume-only model.",
  "Raw local markdown edit, diff, and push flows are disabled until a metadata-only edit design exists.",
  "Use the exec subcommand for runtime secret consumption.",
];

function createCommandSpec({
  canonical,
  aliases = [],
  summary,
  usageLines,
  requiredFlags = [],
  optionalFlags = [],
  examples = [],
  notes = [],
  surface,
  authScope,
  mutationMode,
  stability,
  capabilityMetadata = {},
}) {
  const normalizedCanonical = normalizeCommandName(canonical);
  const hyphenAlias = normalizedCanonical.includes(" ")
    ? normalizedCanonical.replace(/\s+/g, "-")
    : null;
  const metadata = inferCommandMetadata(normalizedCanonical, {
    surface,
    authScope,
    mutationMode,
    stability,
  });

  return {
    canonical: normalizedCanonical,
    aliases: [...new Set([hyphenAlias, ...aliases].filter(Boolean).map(normalizeCommandName))],
    summary,
    usageLines,
    requiredFlags,
    optionalFlags,
    examples,
    notes,
    ...metadata,
    ...capabilityMetadata,
  };
}

function compoundFamilySpecs({ family, subcommands }) {
  return subcommands.map((subcommand) => createCommandSpec({
    canonical: `${family} ${subcommand.name}`,
    aliases: subcommand.aliases || [],
    summary: subcommand.summary,
    usageLines: subcommand.usageLines,
    requiredFlags: subcommand.requiredFlags,
    optionalFlags: subcommand.optionalFlags,
    examples: subcommand.examples,
    notes: subcommand.notes,
    surface: subcommand.surface,
    authScope: subcommand.authScope,
    mutationMode: subcommand.mutationMode,
    stability: subcommand.stability,
    capabilityMetadata: subcommand.capabilityMetadata,
  }));
}

function commandRoot(canonical) {
  return canonical.split(" ")[0];
}

function commandVerb(canonical) {
  const parts = canonical.split(" ");
  return parts.length > 1 ? parts[1] : parts[0];
}

function inferCommandSurface(canonical) {
  const root = commandRoot(canonical);
  const surfaces = {
    "access-domain": "access",
    "access-token": "access",
    "build-record": "builds",
    capabilities: "cli",
    "create-project": "project-bootstrap",
    doc: "managed-docs",
    doctor: "project-health",
    journal: "mutation-journal",
    page: "planning",
    "plan-change": "planning",
    recommend: "routing",
    runbook: "runbooks",
    "scaffold-docs": "project-doc-scaffold",
    "secret-record": "access",
    sync: "manifest-sync",
    "validation-bundle": "validation-bundle",
    "validation-session": "validation-sessions",
    "validation-sessions": "validation-sessions",
    "verify-project": "project-verification",
    "verify-workspace-docs": "workspace-doc-verification",
  };

  return surfaces[root] || root;
}

function inferAuthScope(canonical) {
  const root = commandRoot(canonical);

  if (root === "capabilities") {
    return "none";
  }

  if (root === "journal") {
    return "local-filesystem";
  }

  if (canonical === "validation-bundle login") {
    return "local-browser-session";
  }

  if (root === "create-project" || root === "verify-workspace-docs") {
    return "workspace-token";
  }

  if (root === "doc") {
    return "workspace-or-project-token";
  }

  if (root === "sync") {
    return "project-token";
  }

  return "project-token-optional";
}

function inferMutationMode(canonical) {
  const root = commandRoot(canonical);
  const verb = commandVerb(canonical);
  const readOnlyVerbs = new Set(["capabilities", "check", "diff", "doctor", "help", "list", "plan-change", "preview", "pull", "recommend", "verify", "verify-project", "verify-workspace-docs"]);

  if (canonical === "validation-bundle login") {
    return "local-session";
  }

  if (root === "create-project") {
    return "live-mutation";
  }

  if (readOnlyVerbs.has(verb)) {
    return "read-only";
  }

  return "apply-gated";
}

function inferStability(canonical) {
  const root = commandRoot(canonical);

  if (root === "validation-bundle") {
    return "experimental";
  }

  return "stable";
}

function inferCommandMetadata(canonical, overrides = {}) {
  return {
    surface: overrides.surface || inferCommandSurface(canonical),
    authScope: overrides.authScope || inferAuthScope(canonical),
    mutationMode: overrides.mutationMode || inferMutationMode(canonical),
    stability: overrides.stability || inferStability(canonical),
  };
}

const SINGLE_COMMAND_SPECS = [
  createCommandSpec({
    canonical: "create-project",
    aliases: ["create"],
    summary: "Bootstrap a new project subtree in Notion.",
    usageLines: [
      'node src/cli.mjs create-project --name "Project Name" [--workspace infrastructure-hq]',
    ],
    requiredFlags: [
      '--name "Project Name"',
    ],
    optionalFlags: [
      OPT_WORKSPACE,
    ],
    examples: [
      'node src/cli.mjs create-project --name "Contour"',
      'npm run create-project -- --name "Contour"',
    ],
    notes: [
      "Bootstrap only needs the workspace token. Project-token verification stays optional until a repo-local Notion integration exists.",
    ],
  }),
  createCommandSpec({
    canonical: "doctor",
    summary: "Run the read-only project health scan, managed-surface inventory, and optional truth-quality audit.",
    usageLines: [
      'node src/cli.mjs doctor --project "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
      'node src/cli.mjs doctor --project "Project Name" --truth-audit [--stale-after-days 30] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
    ],
    requiredFlags: [
      OPT_PROJECT,
    ],
    optionalFlags: [
      OPT_TRUTH_AUDIT,
      OPT_STALE_AFTER_DAYS,
      OPT_PROJECT_TOKEN,
      OPT_WORKSPACE,
    ],
    examples: [
      'node src/cli.mjs doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
      'npm run doctor -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
      'npm run truth-audit -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
    ],
    notes: [
      "Doctoring is read-only and project-scoped; it summarizes managed surfaces, adoptable content, truth boundaries, and next-step recommendations.",
      "Use --truth-audit to add the read-only truth-quality audit for stale Last Updated metadata and placeholder or empty managed content.",
      "--stale-after-days defaults to 30 when --truth-audit is enabled and must be a positive integer.",
      "Truth audit checks approved managed planning pages, project docs, managed runbooks, and curated workspace/template docs where applicable.",
      "Truth audit excludes raw secret/token body inspection and preserves consume-only Access behavior.",
      "Truth audit does not mutate Notion, write local files, write sidecars, append mutation journal entries, auto-fix content, detect semantic contradictions, or add rollback/retry/batch-apply behavior.",
    ],
    capabilityMetadata: {
      notionMutation: "none",
      localFileWrites: "none",
      journalWrites: "none",
      truthAudit: "optional-read-only",
      staleAfterDaysDefault: 30,
      supportedTruthAuditSurfaces: ["planning-page", "project-doc", "runbook", "workspace-doc", "template-doc"],
      truthAuditExclusions: ["secret-record-body", "access-token-body"],
      truthAuditNonGoals: ["notion-mutation", "local-file-output", "sidecar-writes", "mutation-journal", "auto-fix", "semantic-contradiction-detection", "rollback", "retries", "generic-batch-apply"],
    },
  }),
  createCommandSpec({
    canonical: "recommend",
    summary: "Return the read-only project scan or an intent-specific Notion-vs-repo routing answer.",
    usageLines: [
      'node src/cli.mjs recommend --project "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
      'node src/cli.mjs recommend --project "Project Name" --intent planning --page "Roadmap" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
      'node src/cli.mjs recommend --project "Project Name" --intent runbook --title "Runbook Title" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
      'node src/cli.mjs recommend --project "Project Name" --intent secret --domain "App & Backend" --title "Record Title" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
      'node src/cli.mjs recommend --project "Project Name" --intent project-doc --path "Root > Overview" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
      'node src/cli.mjs recommend --intent template-doc --path "Templates > Project Templates > Overview" [--workspace infrastructure-hq]',
      'node src/cli.mjs recommend --intent workspace-doc --path "Runbooks > Notion Workspace Workflow" [--workspace infrastructure-hq]',
      'node src/cli.mjs recommend --project "Project Name" --intent implementation-note --repo-path "notes/implementation.md" [--workspace infrastructure-hq]',
    ],
    requiredFlags: [
      '--project "Project Name" for the read-only scan and project-backed intents',
      '--intent <planning|runbook|secret|token|project-doc|template-doc|workspace-doc|implementation-note|design-spec|task-breakdown|investigation|repo-doc|generated-output> for routed recommendations',
      '--page "Roadmap" for the planning intent',
      '--path "<doc path>" for project-doc, template-doc, and workspace-doc intents',
      '--title "Title" for runbook, secret, and token intents',
      '--domain "Access Domain Title" for secret and token intents',
      "--repo-path <path> for repo-owned intents",
    ],
    optionalFlags: [
      OPT_PROJECT_TOKEN,
      OPT_WORKSPACE,
    ],
    examples: [
      'node src/cli.mjs recommend --project "SNPM" --intent planning --page "Roadmap" --project-token-env SNPM_NOTION_TOKEN',
      'node src/cli.mjs recommend --project "SNPM" --intent implementation-note --repo-path "notes/implementation.md"',
      'npm run recommend -- --project "SNPM" --intent project-doc --path "Root > Overview" --project-token-env SNPM_NOTION_TOKEN',
    ],
    notes: [
      "Recommend stays an alias for the read-only scan unless --intent is provided, in which case it returns a deterministic Notion-vs-repo routing answer.",
      "Implementation notes, design specs, task breakdowns, and investigations are repo-first intents and should not be stored as managed Notion docs.",
    ],
  }),
  createCommandSpec({
    canonical: "verify-project",
    aliases: ["verify"],
    summary: "Verify the project subtree shape and optional project-token scope.",
    usageLines: [
      'node src/cli.mjs verify-project --name "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
    ],
    requiredFlags: [
      '--name "Project Name"',
    ],
    optionalFlags: [
      OPT_PROJECT_TOKEN,
      OPT_WORKSPACE,
    ],
    examples: [
      'node src/cli.mjs verify-project --name "SNPM" --project-token-env SNPM_NOTION_TOKEN',
      'npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN',
    ],
  }),
  createCommandSpec({
    canonical: "verify-workspace-docs",
    summary: "Verify the curated workspace and template doc registry with the workspace token.",
    usageLines: [
      "node src/cli.mjs verify-workspace-docs [--workspace infrastructure-hq]",
    ],
    optionalFlags: [
      OPT_WORKSPACE,
    ],
    examples: [
      "node src/cli.mjs verify-workspace-docs",
      "npm run verify-workspace-docs",
    ],
    notes: [
      "verify-workspace-docs is workspace-token only and checks the curated workspace/template doc registry.",
    ],
  }),
  createCommandSpec({
    canonical: "capabilities",
    summary: "Print the registry-derived CLI capability map as JSON.",
    usageLines: [
      "node src/cli.mjs capabilities",
    ],
    examples: [
      "node src/cli.mjs capabilities",
      "npm run capabilities",
    ],
    notes: [
      "The capability map is generated from the same registry that powers CLI help.",
      "The command prints JSON only and is safe for automation discovery.",
    ],
  }),
  createCommandSpec({
    canonical: "scaffold-docs",
    summary: "Preview starter managed-doc drafts for an existing project and optionally write local files.",
    usageLines: [
      'node src/cli.mjs scaffold-docs --project "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--output-dir <dir>] [--workspace infrastructure-hq]',
    ],
    requiredFlags: [
      OPT_PROJECT,
    ],
    optionalFlags: [
      OPT_PROJECT_TOKEN,
      OPT_OUTPUT_DIR,
      OPT_WORKSPACE,
    ],
    examples: [
      'node src/cli.mjs scaffold-docs --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
      'npm run scaffold-docs -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN --output-dir .snpm-scaffold',
    ],
    notes: [
      "Preview-first bootstrap doc scaffolding prepares starter managed docs such as Root overview, operating model, and first planning-page bodies.",
      "Without --output-dir this command prints JSON only and performs no file writes.",
      "--output-dir writes local draft markdown files, a scaffold-plan.json, and planning-page metadata sidecars when live metadata is available.",
      "scaffold-docs never mutates Notion directly; run the generated doc-create or page-push commands explicitly after review.",
      "It is not a drift audit, cross-document consistency checker, manifest create/adopt surface, rollback system, retry system, transaction layer, or generic batch apply.",
    ],
    mutationMode: "local-file-output",
    capabilityMetadata: {
      notionMutation: "none",
      localFileWrites: "output-dir-gated",
      journalWrites: "none",
      supportedScaffoldKinds: ["project-doc", "planning-page"],
      scaffoldTargets: [
        "Root > Overview",
        "Root > Operating Model",
        "Planning > Roadmap",
        "Planning > Current Cycle",
      ],
    },
  }),
  createCommandSpec({
    canonical: "plan-change",
    summary: "Return JSON routing recommendations for a proposed multi-surface plan change.",
    usageLines: [
      'node src/cli.mjs plan-change --targets-file <path|-> [--project "Project Name"] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
    ],
    requiredFlags: [
      "--targets-file <path|->",
    ],
    optionalFlags: [
      OPT_PROJECT,
      OPT_PROJECT_TOKEN,
      OPT_WORKSPACE,
    ],
    examples: [
      "node src/cli.mjs plan-change --targets-file plan-targets.json",
      'npm run plan-change -- --targets-file - --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
    ],
    notes: [
      "Input must be a JSON object with goal and targets fields; the command prints JSON only.",
      "This is a read-only routing surface built on recommend; it does not apply Notion mutations.",
    ],
  }),
];

const COMPOUND_COMMAND_SPECS = [
  ...compoundFamilySpecs({
    family: "journal",
    subcommands: [
      {
        name: "list",
        summary: "Print recent local mutation journal entries as JSON.",
        usageLines: [
          "node src/cli.mjs journal list [--limit 20]",
        ],
        optionalFlags: [
          "--limit <positive integer>",
        ],
        examples: [
          "node src/cli.mjs journal list --limit 10",
          "npm run journal-list -- --limit 10",
        ],
        notes: [
          "Reads the local mutation journal only; it does not contact Notion.",
          "The command prints JSON only and returns an empty entries array when no journal exists.",
        ],
        authScope: "local-filesystem",
        mutationMode: "read-only",
        stability: "stable",
      },
    ],
  }),
  ...compoundFamilySpecs({
    family: "doc",
    subcommands: [
      {
        name: "create",
        summary: "Create a managed doc or preview the body diff from a local markdown file.",
        usageLines: [
          'node src/cli.mjs doc create --path "<doc path>" --file <file|-> [--project "Project Name"] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          '--path "<doc path>"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT,
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs doc create --project "SNPM" --path "Root > Overview" --file overview.md',
          'npm run doc-create -- --project "SNPM" --path "Root > Overview" --file overview.md --apply',
        ],
        notes: [
          "Project docs require --project; template and workspace docs do not.",
          "The managed doc surface uses doc-* commands for curated project root docs, Templates > Project Templates docs, and a small named set of workspace-global docs.",
        ],
      },
      {
        name: "adopt",
        summary: "Adopt an existing curated doc into the managed doc format.",
        usageLines: [
          'node src/cli.mjs doc adopt --path "<doc path>" [--project "Project Name"] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          '--path "<doc path>"',
        ],
        optionalFlags: [
          OPT_PROJECT,
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs doc adopt --project "SNPM" --path "Root > Overview"',
          'npm run doc-adopt -- --project "SNPM" --path "Root > Overview" --apply',
        ],
        notes: [
          "Project docs require --project; template and workspace docs do not.",
        ],
      },
      {
        name: "pull",
        summary: "Pull a managed doc to a file or stream the markdown body to stdout.",
        usageLines: [
          'node src/cli.mjs doc pull --path "<doc path>" --output <file|-> [--metadata-output <path>] [--project "Project Name"] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          '--path "<doc path>"',
          "--output <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT,
          OPT_PROJECT_TOKEN,
          OPT_METADATA_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs doc pull --project "SNPM" --path "Root > Overview" --output -',
          'npm run doc-pull -- --path "Templates > Project Templates" --output template-root.md',
        ],
        notes: [
          "When a pull command uses --output -, the markdown body is written to stdout and the structured metadata is written to stderr.",
          "Pull writes <output>.snpm-meta.json by default; use --metadata-output to override or when streaming markdown to stdout.",
        ],
      },
      {
        name: "diff",
        summary: "Diff a managed doc against a local markdown file.",
        usageLines: [
          'node src/cli.mjs doc diff --path "<doc path>" --file <file|-> [--project "Project Name"] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          '--path "<doc path>"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT,
          OPT_PROJECT_TOKEN,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs doc diff --project "SNPM" --path "Root > Overview" --file overview.md --explain',
          'npm run doc-diff -- --project "SNPM" --path "Root > Overview" --file overview.md --review-output review',
        ],
        notes: [
          "Operational diff, push, and edit commands support --explain for explicit auth/target/normalization reasoning and --review-output <dir> for review artifacts.",
        ],
      },
      {
        name: "push",
        summary: "Preview or apply managed doc body updates from a local markdown file.",
        usageLines: [
          'node src/cli.mjs doc push --path "<doc path>" --file <file|-> [--metadata <path>] [--project "Project Name"] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          '--path "<doc path>"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT,
          OPT_PROJECT_TOKEN,
          OPT_METADATA,
          OPT_APPLY,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs doc push --project "SNPM" --path "Root > Overview" --file overview.md',
          'npm run doc-push -- --project "SNPM" --path "Root > Overview" --file overview.md --apply',
        ],
        notes: [
          "Project docs require --project; template and workspace docs do not.",
          "Apply reads <file>.snpm-meta.json by default; use --metadata to override or when reading markdown from stdin.",
        ],
      },
      {
        name: "edit",
        summary: "Open a managed doc in the editor-backed review loop.",
        usageLines: [
          'node src/cli.mjs doc edit --path "<doc path>" [--project "Project Name"] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          '--path "<doc path>"',
        ],
        optionalFlags: [
          OPT_PROJECT,
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs doc edit --project "SNPM" --path "Root > Overview"',
          'npm run doc-edit -- --project "SNPM" --path "Root > Overview" --apply',
        ],
        notes: [
          "Project docs require --project; template and workspace docs do not.",
        ],
      },
    ],
  }),
  ...compoundFamilySpecs({
    family: "page",
    subcommands: [
      {
        name: "pull",
        summary: "Pull an approved planning page to a file or stream the markdown body to stdout.",
        usageLines: [
          'node src/cli.mjs page pull --project "Project Name" --page "Planning > Roadmap" --output <file|-> [--metadata-output <path>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--page "Planning > <Page Name>"',
          "--output <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_METADATA_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs page pull --project "SNPM" --page "Planning > Roadmap" --output -',
          'npm run page-pull -- --project "SNPM" --page "Planning > Backlog" --output backlog.md',
        ],
        notes: [
          "Planning-page sync is limited to Planning > Roadmap, Planning > Current Cycle, Planning > Backlog, and Planning > Decision Log.",
          "When a pull command uses --output -, the markdown body is written to stdout and the structured metadata is written to stderr.",
          "Pull writes <output>.snpm-meta.json by default; use --metadata-output to override or when streaming markdown to stdout.",
        ],
      },
      {
        name: "diff",
        summary: "Diff an approved planning page against a local markdown file.",
        usageLines: [
          'node src/cli.mjs page diff --project "Project Name" --page "Planning > Roadmap" --file <file|-> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--page "Planning > <Page Name>"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs page diff --project "SNPM" --page "Planning > Roadmap" --file roadmap.md --explain',
          'npm run page-diff -- --project "SNPM" --page "Planning > Roadmap" --file roadmap.md --review-output review',
        ],
        notes: [
          "Operational diff, push, and edit commands support --explain for explicit auth/target/normalization reasoning and --review-output <dir> for review artifacts.",
        ],
      },
      {
        name: "push",
        summary: "Preview or apply managed planning-page body updates from a local markdown file.",
        usageLines: [
          'node src/cli.mjs page push --project "Project Name" --page "Planning > Roadmap" --file <file|-> [--metadata <path>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--page "Planning > <Page Name>"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_METADATA,
          OPT_APPLY,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs page push --project "SNPM" --page "Planning > Roadmap" --file roadmap.md',
          'npm run page-push -- --project "SNPM" --page "Planning > Roadmap" --file roadmap.md --apply',
        ],
        notes: [
          "Apply reads <file>.snpm-meta.json by default; use --metadata to override or when reading markdown from stdin.",
        ],
      },
      {
        name: "edit",
        summary: "Open a planning page in the editor-backed review loop.",
        usageLines: [
          'node src/cli.mjs page edit --project "Project Name" --page "Planning > Roadmap" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--page "Planning > <Page Name>"',
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs page edit --project "SNPM" --page "Planning > Roadmap"',
          'npm run page-edit -- --project "SNPM" --page "Planning > Roadmap" --apply',
        ],
      },
    ],
  }),
  ...compoundFamilySpecs({
    family: "access-domain",
    subcommands: [
      {
        name: "create",
        summary: "Create a managed Access domain page or preview the body diff from a local markdown file.",
        usageLines: [
          'node src/cli.mjs access-domain create --project "Project Name" --title "App & Backend" --file <file|-> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Access Domain Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs access-domain create --project "SNPM" --title "App & Backend" --file access-domain.md',
          'npm run access-domain-create -- --project "SNPM" --title "App & Backend" --file access-domain.md --apply',
        ],
        notes: [
          "Access operations are limited to project-owned Access domain pages plus secret/token records nested under those domains.",
        ],
      },
      {
        name: "adopt",
        summary: "Adopt an existing Access domain page into the managed format.",
        usageLines: [
          'node src/cli.mjs access-domain adopt --project "Project Name" --title "App & Backend" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Access Domain Title"',
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs access-domain adopt --project "SNPM" --title "App & Backend"',
          'npm run access-domain-adopt -- --project "SNPM" --title "App & Backend" --apply',
        ],
      },
      {
        name: "pull",
        summary: "Pull a managed Access domain page to a file or stream the markdown body to stdout.",
        usageLines: [
          'node src/cli.mjs access-domain pull --project "Project Name" --title "App & Backend" --output <file|-> [--metadata-output <path>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Access Domain Title"',
          "--output <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_METADATA_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs access-domain pull --project "SNPM" --title "App & Backend" --output -',
          'npm run access-domain-pull -- --project "SNPM" --title "App & Backend" --output access-domain.md',
        ],
        notes: [
          "When a pull command uses --output -, the markdown body is written to stdout and the structured metadata is written to stderr.",
          "Pull writes <output>.snpm-meta.json by default; use --metadata-output to override or when streaming markdown to stdout.",
        ],
      },
      {
        name: "diff",
        summary: "Diff an Access domain page against a local markdown file.",
        usageLines: [
          'node src/cli.mjs access-domain diff --project "Project Name" --title "App & Backend" --file <file|-> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Access Domain Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs access-domain diff --project "SNPM" --title "App & Backend" --file access-domain.md --explain',
          'npm run access-domain-diff -- --project "SNPM" --title "App & Backend" --file access-domain.md --review-output review',
        ],
      },
      {
        name: "push",
        summary: "Preview or apply Access domain updates from a local markdown file.",
        usageLines: [
          'node src/cli.mjs access-domain push --project "Project Name" --title "App & Backend" --file <file|-> [--metadata <path>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Access Domain Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_METADATA,
          OPT_APPLY,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs access-domain push --project "SNPM" --title "App & Backend" --file access-domain.md',
          'npm run access-domain-push -- --project "SNPM" --title "App & Backend" --file access-domain.md --apply',
        ],
        notes: [
          "Apply reads <file>.snpm-meta.json by default; use --metadata to override or when reading markdown from stdin.",
        ],
      },
      {
        name: "edit",
        summary: "Open an Access domain page in the editor-backed review loop.",
        usageLines: [
          'node src/cli.mjs access-domain edit --project "Project Name" --title "App & Backend" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Access Domain Title"',
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs access-domain edit --project "SNPM" --title "App & Backend"',
          'npm run access-domain-edit -- --project "SNPM" --title "App & Backend" --apply',
        ],
      },
    ],
  }),
  ...compoundFamilySpecs({
    family: "secret-record",
    subcommands: [
      {
        name: "create",
        summary: "Create a managed project secret-record shell from local markdown without persisting raw secret values.",
        usageLines: [
          'node src/cli.mjs secret-record create --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" [--file <file|->] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
        ],
        optionalFlags: [
          "--file <file|->",
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs secret-record create --project "SNPM" --domain "App & Backend" --title "GEMINI_API_KEY" --file -',
          'npm run secret-record-create -- --project "SNPM" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record-shell.md --apply',
        ],
        notes: [
          "Create is for record shells or placeholder raw-value content only; non-placeholder local raw values are rejected.",
          ...SECRET_REVIEW_NOTES,
        ],
        capabilityMetadata: SECRET_CONSUME_ONLY_CAPABILITY_METADATA,
      },
      {
        name: "adopt",
        summary: "Adopt an existing project secret record into the managed format.",
        usageLines: [
          'node src/cli.mjs secret-record adopt --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs secret-record adopt --project "SNPM" --domain "App & Backend" --title "GEMINI_API_KEY"',
          'npm run secret-record-adopt -- --project "SNPM" --domain "App & Backend" --title "GEMINI_API_KEY" --apply',
        ],
        notes: SECRET_REVIEW_NOTES,
        capabilityMetadata: SECRET_CONSUME_ONLY_CAPABILITY_METADATA,
      },
      {
        name: "pull",
        summary: "Pull a redacted managed project secret record to a file or stream the redacted markdown body to stdout.",
        usageLines: [
          'node src/cli.mjs secret-record pull --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --output <file|-> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
          "--output <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs secret-record pull --project "SNPM" --domain "App & Backend" --title "GEMINI_API_KEY" --output -',
          'npm run secret-record-pull -- --project "SNPM" --domain "App & Backend" --title "GEMINI_API_KEY" --output secret-record-redacted.md',
        ],
        notes: SECRET_PULL_NOTES,
        capabilityMetadata: SECRET_CONSUME_ONLY_CAPABILITY_METADATA,
      },
      {
        name: "exec",
        summary: "Consume a managed project secret record by injecting its raw value into one child process without local export.",
        usageLines: [
          'node src/cli.mjs secret-record exec --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" (--env-name ENV_NAME | --stdin-secret) [--cwd <dir>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq] -- <command> [args...]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
          `${OPT_ENV_NAME} or ${OPT_STDIN_SECRET}`,
          "-- <command> [args...]",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_CWD,
          OPT_WORKSPACE,
        ],
        examples: [
          'npm run secret-record-exec -- --project "SNPM" --domain "App & Backend" --title "GEMINI_API_KEY" --env-name GEMINI_API_KEY -- node scripts/check-gemini.mjs',
          'node src/cli.mjs secret-record exec --project "SNPM" --domain "App & Backend" --title "GEMINI_API_KEY" --stdin-secret -- node scripts/read-secret-from-stdin.mjs',
        ],
        notes: SECRET_EXEC_NOTES,
        mutationMode: "read-only",
        capabilityMetadata: SECRET_EXEC_CAPABILITY_METADATA,
      },
      {
        name: "diff",
        summary: "Unsupported for secret-bearing consume-only records; local markdown diff is disabled.",
        usageLines: [
          'node src/cli.mjs secret-record diff --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file <file|-> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [],
        notes: SECRET_UNSUPPORTED_LOCAL_MARKDOWN_NOTES,
        mutationMode: "unsupported",
        stability: "deprecated",
        capabilityMetadata: {
          ...SECRET_UNSUPPORTED_LOCAL_MARKDOWN_METADATA,
          replacementCommand: "secret-record exec",
        },
      },
      {
        name: "push",
        summary: "Unsupported for secret-bearing consume-only records; local markdown push is disabled.",
        usageLines: [
          'node src/cli.mjs secret-record push --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file <file|-> [--metadata <path>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_METADATA,
          OPT_APPLY,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [],
        notes: SECRET_UNSUPPORTED_LOCAL_MARKDOWN_NOTES,
        mutationMode: "unsupported",
        stability: "deprecated",
        capabilityMetadata: {
          ...SECRET_UNSUPPORTED_LOCAL_MARKDOWN_METADATA,
          replacementCommand: "secret-record exec",
        },
      },
      {
        name: "edit",
        summary: "Unsupported for secret-bearing consume-only records; local markdown edit is disabled.",
        usageLines: [
          'node src/cli.mjs secret-record edit --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [],
        notes: SECRET_UNSUPPORTED_LOCAL_MARKDOWN_NOTES,
        mutationMode: "unsupported",
        stability: "deprecated",
        capabilityMetadata: {
          ...SECRET_UNSUPPORTED_LOCAL_MARKDOWN_METADATA,
          replacementCommand: "secret-record exec",
        },
      },
    ],
  }),
  ...compoundFamilySpecs({
    family: "access-token",
    subcommands: [
      {
        name: "create",
        summary: "Create a managed project access-token shell from local markdown without persisting raw token values.",
        usageLines: [
          'node src/cli.mjs access-token create --project "Project Name" --domain "App & Backend" --title "Project Token" [--file <file|->] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
        ],
        optionalFlags: [
          "--file <file|->",
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs access-token create --project "SNPM" --domain "App & Backend" --title "Project Token" --file -',
          'npm run access-token-create -- --project "SNPM" --domain "App & Backend" --title "Project Token" --file access-token-shell.md --apply',
        ],
        notes: [
          "Create is for record shells or placeholder raw-value content only; non-placeholder local raw values are rejected.",
          ...SECRET_REVIEW_NOTES,
        ],
        capabilityMetadata: SECRET_CONSUME_ONLY_CAPABILITY_METADATA,
      },
      {
        name: "adopt",
        summary: "Adopt an existing project access-token record into the managed format.",
        usageLines: [
          'node src/cli.mjs access-token adopt --project "Project Name" --domain "App & Backend" --title "Project Token" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs access-token adopt --project "SNPM" --domain "App & Backend" --title "Project Token"',
          'npm run access-token-adopt -- --project "SNPM" --domain "App & Backend" --title "Project Token" --apply',
        ],
        notes: SECRET_REVIEW_NOTES,
        capabilityMetadata: SECRET_CONSUME_ONLY_CAPABILITY_METADATA,
      },
      {
        name: "pull",
        summary: "Pull a redacted managed project access-token record to a file or stream the redacted markdown body to stdout.",
        usageLines: [
          'node src/cli.mjs access-token pull --project "Project Name" --domain "App & Backend" --title "Project Token" --output <file|-> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
          "--output <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs access-token pull --project "SNPM" --domain "App & Backend" --title "Project Token" --output -',
          'npm run access-token-pull -- --project "SNPM" --domain "App & Backend" --title "Project Token" --output access-token-redacted.md',
        ],
        notes: SECRET_PULL_NOTES,
        capabilityMetadata: SECRET_CONSUME_ONLY_CAPABILITY_METADATA,
      },
      {
        name: "exec",
        summary: "Consume a managed project access-token record by injecting its raw value into one child process without local export.",
        usageLines: [
          'node src/cli.mjs access-token exec --project "Project Name" --domain "App & Backend" --title "Project Token" (--env-name ENV_NAME | --stdin-secret) [--cwd <dir>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq] -- <command> [args...]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
          `${OPT_ENV_NAME} or ${OPT_STDIN_SECRET}`,
          "-- <command> [args...]",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_CWD,
          OPT_WORKSPACE,
        ],
        examples: [
          'npm run access-token-exec -- --project "SNPM" --domain "App & Backend" --title "Project Token" --env-name PROJECT_TOKEN -- node scripts/check-project-token.mjs',
          'node src/cli.mjs access-token exec --project "SNPM" --domain "App & Backend" --title "Project Token" --stdin-secret -- node scripts/read-token-from-stdin.mjs',
        ],
        notes: SECRET_EXEC_NOTES,
        mutationMode: "read-only",
        capabilityMetadata: SECRET_EXEC_CAPABILITY_METADATA,
      },
      {
        name: "diff",
        summary: "Unsupported for secret-bearing consume-only records; local markdown diff is disabled.",
        usageLines: [
          'node src/cli.mjs access-token diff --project "Project Name" --domain "App & Backend" --title "Project Token" --file <file|-> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [],
        notes: SECRET_UNSUPPORTED_LOCAL_MARKDOWN_NOTES,
        mutationMode: "unsupported",
        stability: "deprecated",
        capabilityMetadata: {
          ...SECRET_UNSUPPORTED_LOCAL_MARKDOWN_METADATA,
          replacementCommand: "access-token exec",
        },
      },
      {
        name: "push",
        summary: "Unsupported for secret-bearing consume-only records; local markdown push is disabled.",
        usageLines: [
          'node src/cli.mjs access-token push --project "Project Name" --domain "App & Backend" --title "Project Token" --file <file|-> [--metadata <path>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_METADATA,
          OPT_APPLY,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [],
        notes: SECRET_UNSUPPORTED_LOCAL_MARKDOWN_NOTES,
        mutationMode: "unsupported",
        stability: "deprecated",
        capabilityMetadata: {
          ...SECRET_UNSUPPORTED_LOCAL_MARKDOWN_METADATA,
          replacementCommand: "access-token exec",
        },
      },
      {
        name: "edit",
        summary: "Unsupported for secret-bearing consume-only records; local markdown edit is disabled.",
        usageLines: [
          'node src/cli.mjs access-token edit --project "Project Name" --domain "App & Backend" --title "Project Token" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--domain "Access Domain Title"',
          '--title "Record Title"',
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [],
        notes: SECRET_UNSUPPORTED_LOCAL_MARKDOWN_NOTES,
        mutationMode: "unsupported",
        stability: "deprecated",
        capabilityMetadata: {
          ...SECRET_UNSUPPORTED_LOCAL_MARKDOWN_METADATA,
          replacementCommand: "access-token exec",
        },
      },
    ],
  }),
  ...compoundFamilySpecs({
    family: "runbook",
    subcommands: [
      {
        name: "create",
        summary: "Create a managed runbook page or preview the body diff from a local markdown file.",
        usageLines: [
          'node src/cli.mjs runbook create --project "Project Name" --title "Runbook Title" --file <file|-> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Runbook Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs runbook create --project "SNPM" --title "SNPM Operator Validation Runbook" --file runbook.md',
          'npm run runbook-create -- --project "SNPM" --title "SNPM Operator Validation Runbook" --file runbook.md --apply',
        ],
        notes: [
          "Runbook and build-record operations are limited to project-owned surfaces under Runbooks and Ops > Builds.",
        ],
      },
      {
        name: "adopt",
        summary: "Adopt an existing runbook page into the managed format.",
        usageLines: [
          'node src/cli.mjs runbook adopt --project "Project Name" --title "Runbook Title" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Runbook Title"',
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs runbook adopt --project "SNPM" --title "SNPM Operator Validation Runbook"',
          'npm run runbook-adopt -- --project "SNPM" --title "SNPM Operator Validation Runbook" --apply',
        ],
      },
      {
        name: "pull",
        summary: "Pull a managed runbook to a file or stream the markdown body to stdout.",
        usageLines: [
          'node src/cli.mjs runbook pull --project "Project Name" --title "Runbook Title" --output <file|-> [--metadata-output <path>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Runbook Title"',
          "--output <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_METADATA_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs runbook pull --project "SNPM" --title "SNPM Operator Validation Runbook" --output -',
          'npm run runbook-pull -- --project "SNPM" --title "SNPM Operator Validation Runbook" --output runbook.md',
        ],
        notes: [
          "When a pull command uses --output -, the markdown body is written to stdout and the structured metadata is written to stderr.",
          "Pull writes <output>.snpm-meta.json by default; use --metadata-output to override or when streaming markdown to stdout.",
        ],
      },
      {
        name: "diff",
        summary: "Diff a managed runbook against a local markdown file.",
        usageLines: [
          'node src/cli.mjs runbook diff --project "Project Name" --title "Runbook Title" --file <file|-> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Runbook Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs runbook diff --project "SNPM" --title "SNPM Operator Validation Runbook" --file runbook.md --explain',
          'npm run runbook-diff -- --project "SNPM" --title "SNPM Operator Validation Runbook" --file runbook.md --review-output review',
        ],
      },
      {
        name: "push",
        summary: "Preview or apply managed runbook updates from a local markdown file.",
        usageLines: [
          'node src/cli.mjs runbook push --project "Project Name" --title "Runbook Title" --file <file|-> [--metadata <path>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Runbook Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_METADATA,
          OPT_APPLY,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs runbook push --project "SNPM" --title "SNPM Operator Validation Runbook" --file runbook.md',
          'npm run runbook-push -- --project "SNPM" --title "SNPM Operator Validation Runbook" --file runbook.md --apply',
        ],
        notes: [
          "Apply reads <file>.snpm-meta.json by default; use --metadata to override or when reading markdown from stdin.",
        ],
      },
      {
        name: "edit",
        summary: "Open a runbook in the editor-backed review loop.",
        usageLines: [
          'node src/cli.mjs runbook edit --project "Project Name" --title "Runbook Title" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--explain] [--review-output <dir>] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Runbook Title"',
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_EXPLAIN,
          OPT_REVIEW_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs runbook edit --project "SNPM" --title "SNPM Operator Validation Runbook"',
          'npm run runbook-edit -- --project "SNPM" --title "SNPM Operator Validation Runbook" --apply',
        ],
      },
    ],
  }),
  ...compoundFamilySpecs({
    family: "build-record",
    subcommands: [
      {
        name: "create",
        summary: "Create a managed build record or preview the body diff from a local markdown file.",
        usageLines: [
          'node src/cli.mjs build-record create --project "Project Name" --title "Build Record Title" --file <file|-> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Build Record Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs build-record create --project "SNPM" --title "Validation Build" --file build-record.md',
          'npm run build-record-create -- --project "SNPM" --title "Validation Build" --file build-record.md --apply',
        ],
      },
      {
        name: "pull",
        summary: "Pull a managed build record to a local file.",
        usageLines: [
          'node src/cli.mjs build-record pull --project "Project Name" --title "Build Record Title" --output <file|-> [--metadata-output <path>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Build Record Title"',
          "--output <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_METADATA_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs build-record pull --project "SNPM" --title "Validation Build" --output build-record.md',
          'npm run build-record-pull -- --project "SNPM" --title "Validation Build" --output build-record.md',
        ],
        notes: [
          "When a pull command uses --output -, the markdown body is written to stdout and the structured metadata is written to stderr.",
          "Pull writes <output>.snpm-meta.json by default; use --metadata-output to override or when streaming markdown to stdout.",
        ],
      },
      {
        name: "diff",
        summary: "Diff a managed build record against a local file.",
        usageLines: [
          'node src/cli.mjs build-record diff --project "Project Name" --title "Build Record Title" --file <file|-> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Build Record Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs build-record diff --project "SNPM" --title "Validation Build" --file build-record.md',
          'npm run build-record-diff -- --project "SNPM" --title "Validation Build" --file build-record.md',
        ],
      },
      {
        name: "push",
        summary: "Preview or apply managed build-record updates from a local file.",
        usageLines: [
          'node src/cli.mjs build-record push --project "Project Name" --title "Build Record Title" --file <file|-> [--metadata <path>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Build Record Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_METADATA,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs build-record push --project "SNPM" --title "Validation Build" --file build-record.md',
          'npm run build-record-push -- --project "SNPM" --title "Validation Build" --file build-record.md --apply',
        ],
        notes: [
          "Apply reads <file>.snpm-meta.json by default; use --metadata to override or when reading markdown from stdin.",
        ],
      },
    ],
  }),
  ...compoundFamilySpecs({
    family: "validation-sessions",
    subcommands: [
      {
        name: "init",
        summary: "Initialize the optional Validation Sessions surface for a project.",
        usageLines: [
          'node src/cli.mjs validation-sessions init --project "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs validation-sessions init --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
          'npm run validation-sessions-init -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN --apply',
        ],
        notes: [
          "Validation-session operations are limited to Ops > Validation > Validation Sessions.",
        ],
      },
      {
        name: "verify",
        summary: "Verify the optional Validation Sessions surface, with optional bundle checks.",
        usageLines: [
          'node src/cli.mjs validation-sessions verify --project "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--bundle] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_BUNDLE,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs validation-sessions verify --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
          'npm run validation-sessions-verify -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN --bundle',
        ],
        notes: [
          "Validation-session bundle verification remains the API-visible check; validation-bundle adds an experimental Chromium-only UI lane for the surrounding Notion bundle.",
        ],
      },
    ],
  }),
  ...compoundFamilySpecs({
    family: "validation-bundle",
    subcommands: [
      {
        name: "login",
        summary: "Seed or refresh the local Chromium Notion session used by the validation-bundle lane.",
        usageLines: [
          "node src/cli.mjs validation-bundle login",
        ],
        examples: [
          "node src/cli.mjs validation-bundle login",
          "npm run validation-bundle-login",
        ],
        notes: [
          "This opens a headed Playwright Chromium window and stores the local session state outside the repo.",
          "Use this only when you are explicitly testing or repairing the experimental validation-bundle UI lane.",
        ],
      },
      {
        name: "preview",
        summary: "Inspect the experimental validation-session UI bundle without mutating the workspace.",
        usageLines: [
          'node src/cli.mjs validation-bundle preview --project "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs validation-bundle preview --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
          'npm run validation-bundle-preview -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
        ],
        notes: [
          "Preview requires a seeded Chromium session from validation-bundle login.",
          "This lane is experimental and complements, but does not replace, validation-sessions verify --bundle.",
        ],
      },
      {
        name: "apply",
        summary: "Preview or apply experimental validation-session UI bundle reconciliation.",
        usageLines: [
          'node src/cli.mjs validation-bundle apply --project "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs validation-bundle apply --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
          'npm run validation-bundle-apply -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN --apply',
        ],
        notes: [
          "Without --apply this stays preview-only.",
          "Use this only when the surrounding Notion UI bundle matters and the stable API-visible lane is already healthy.",
        ],
      },
      {
        name: "verify",
        summary: "Verify the experimental Chromium-only validation-session UI bundle lane.",
        usageLines: [
          'node src/cli.mjs validation-bundle verify --project "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs validation-bundle verify --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
          'npm run validation-bundle-verify -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN',
        ],
        notes: [
          "Verify requires a seeded Chromium session from validation-bundle login.",
          "This is the experimental UI-layer companion to validation-sessions verify --bundle.",
        ],
      },
    ],
  }),
  ...compoundFamilySpecs({
    family: "validation-session",
    subcommands: [
      {
        name: "create",
        summary: "Create a managed validation-session report or preview the body diff from a local file.",
        usageLines: [
          'node src/cli.mjs validation-session create --project "Project Name" --title "Session Title" --file <file|-> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Session Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs validation-session create --project "SNPM" --title "Regression Pass 1" --file session.md',
          'npm run validation-session-create -- --project "SNPM" --title "Regression Pass 1" --file session.md --apply',
        ],
      },
      {
        name: "adopt",
        summary: "Adopt an existing validation-session page into the managed format.",
        usageLines: [
          'node src/cli.mjs validation-session adopt --project "Project Name" --title "Session Title" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Session Title"',
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs validation-session adopt --project "SNPM" --title "Regression Pass 1"',
          'npm run validation-session-adopt -- --project "SNPM" --title "Regression Pass 1" --apply',
        ],
      },
      {
        name: "pull",
        summary: "Pull a managed validation-session report to a local file.",
        usageLines: [
          'node src/cli.mjs validation-session pull --project "Project Name" --title "Session Title" --output <file|-> [--metadata-output <path>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Session Title"',
          "--output <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_METADATA_OUTPUT,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs validation-session pull --project "SNPM" --title "Regression Pass 1" --output session.md',
          'npm run validation-session-pull -- --project "SNPM" --title "Regression Pass 1" --output session.md',
        ],
        notes: [
          "When a pull command uses --output -, the markdown body is written to stdout and the structured metadata is written to stderr.",
          "Pull writes <output>.snpm-meta.json by default; use --metadata-output to override or when streaming markdown to stdout.",
        ],
      },
      {
        name: "diff",
        summary: "Diff a managed validation-session report against a local file.",
        usageLines: [
          'node src/cli.mjs validation-session diff --project "Project Name" --title "Session Title" --file <file|-> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Session Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs validation-session diff --project "SNPM" --title "Regression Pass 1" --file session.md',
          'npm run validation-session-diff -- --project "SNPM" --title "Regression Pass 1" --file session.md',
        ],
      },
      {
        name: "push",
        summary: "Preview or apply managed validation-session updates from a local file.",
        usageLines: [
          'node src/cli.mjs validation-session push --project "Project Name" --title "Session Title" --file <file|-> [--metadata <path>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          OPT_PROJECT,
          '--title "Session Title"',
          "--file <file|->",
        ],
        optionalFlags: [
          OPT_PROJECT_TOKEN,
          OPT_METADATA,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs validation-session push --project "SNPM" --title "Regression Pass 1" --file session.md',
          'npm run validation-session-push -- --project "SNPM" --title "Regression Pass 1" --file session.md --apply',
        ],
        notes: [
          "Apply reads <file>.snpm-meta.json by default; use --metadata to override or when reading markdown from stdin.",
        ],
      },
    ],
  }),
  ...compoundFamilySpecs({
    family: "sync",
    subcommands: [
      {
        name: "check",
        summary: "Check manifest-backed sync state without mutating Notion or local files.",
        usageLines: [
          'node src/cli.mjs sync check --manifest <path> [--entry <kind:target> ...] [--entries-file <path|->] [--review-output <dir>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          "--manifest <path>",
        ],
        optionalFlags: [
          OPT_SYNC_ENTRY,
          OPT_SYNC_ENTRIES_FILE,
          OPT_REVIEW_OUTPUT,
          OPT_PROJECT_TOKEN,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs sync check --manifest C:\\repo\\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN',
          'npm run sync-check -- --manifest C:\\repo\\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN',
        ],
        notes: [
          "sync check supports validation-session v1 manifests and manifest v2 mixed-surface manifests.",
          "Manifest v2 check entries may cover planning pages, project docs, template docs, workspace docs, runbooks, and validation sessions.",
          "--entry and JSON --entries-file select manifest v2 entries only; manifest v1 remains full-manifest validation-session sync.",
          "--review-output writes per-entry review artifacts for manifest v2 sync check only.",
          "Manifest v2 diagnostics are structured result/review metadata with stable codes, severity, entry/target context, a safe next command, and a recovery action for operator recovery.",
          "Diagnostics are manifest v2 metadata only and do not add rollback, automatic retries, semantic consistency checks, transaction semantics, or generic batch apply.",
        ],
        capabilityMetadata: SYNC_CAPABILITY_METADATA.check,
      },
      {
        name: "pull",
        summary: "Pull manifest-backed files from Notion to the repo.",
        usageLines: [
          'node src/cli.mjs sync pull --manifest <path> [--entry <kind:target> ...] [--entries-file <path|->] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          "--manifest <path>",
        ],
        optionalFlags: [
          OPT_SYNC_ENTRY,
          OPT_SYNC_ENTRIES_FILE,
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs sync pull --manifest C:\\repo\\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN',
          'npm run sync-pull -- --manifest C:\\repo\\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --apply',
        ],
        notes: [
          "sync pull preserves manifest v1 validation-session artifact-sync behavior.",
          "Manifest v2 sync pull previews or applies local file refreshes for approved mixed-surface entries and writes <file>.snpm-meta.json sidecars.",
          "Manifest v2 sync pull does not mutate Notion and does not append local mutation journal entries.",
          "--entry and JSON --entries-file select manifest v2 entries only; manifest v1 remains full-manifest validation-session sync.",
          "Manifest v2 diagnostics are structured result metadata with stable codes, severity, entry/target context, a safe next command, and a recovery action for operator recovery.",
          "Diagnostics are manifest v2 metadata only and do not add rollback, automatic retries, semantic consistency checks, transaction semantics, or generic batch apply.",
        ],
        capabilityMetadata: SYNC_CAPABILITY_METADATA.pull,
      },
      {
        name: "push",
        summary: "Push manifest-backed files from the repo to Notion.",
        usageLines: [
          'node src/cli.mjs sync push --manifest <path> [--entry <kind:target> ...] [--entries-file <path|->] [--review-output <dir>] [--max-mutations <n|all>] [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply] [--refresh-sidecars] [--workspace infrastructure-hq]',
        ],
        requiredFlags: [
          "--manifest <path>",
        ],
        optionalFlags: [
          OPT_SYNC_ENTRY,
          OPT_SYNC_ENTRIES_FILE,
          OPT_REVIEW_OUTPUT,
          OPT_MAX_MUTATIONS,
          OPT_PROJECT_TOKEN,
          OPT_APPLY,
          OPT_REFRESH_SIDECARS,
          OPT_WORKSPACE,
        ],
        examples: [
          'node src/cli.mjs sync push --manifest C:\\repo\\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN',
          'npm run sync-push -- --manifest C:\\repo\\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --apply --refresh-sidecars',
        ],
        notes: [
          "sync push preserves manifest v1 validation-session artifact-sync behavior.",
          "Manifest v2 sync push previews or applies guarded Notion updates for existing approved targets only.",
          "Manifest v2 push entries may cover planning pages, project docs, template docs, workspace docs, runbooks, and validation sessions.",
          "--entry and JSON --entries-file select manifest v2 entries only; manifest v1 remains full-manifest validation-session sync.",
          "--review-output writes per-entry review artifacts for manifest v2 sync push preview only; apply mode exits with a clear error when review output is requested.",
          "--max-mutations caps manifest v2 apply mutations; sync push --apply defaults to 1 unless a value or all is provided, while preview is not budget-blocked.",
          "--refresh-sidecars is manifest v2 only, requires --apply, and opts into local .snpm-meta.json sidecar refresh writes after successful push mutations.",
          "Without --refresh-sidecars, applied manifest v2 sync push appends redacted local mutation journal entries and leaves local sidecar metadata unchanged; run sync pull --apply after a successful push when you do not opt in.",
          "Manifest v2 diagnostics are structured result/review metadata with stable codes, severity, entry/target context, a safe next command, and a recovery action for operator recovery.",
          "Diagnostics are manifest v2 metadata only and do not add rollback, automatic retries, semantic consistency checks, transaction semantics, or generic batch apply.",
        ],
        capabilityMetadata: SYNC_CAPABILITY_METADATA.push,
      },
    ],
  }),
];

const FAMILY_COMMAND_SPECS = [
  createCommandSpec({
    canonical: "doc",
    summary: "Show the managed-doc command family and its create/adopt/pull/diff/push/edit subcommands.",
    usageLines: [
      'node src/cli.mjs doc <create|adopt|pull|diff|push|edit> --path "<doc path>" [options]',
      "node src/cli.mjs doc --help",
      "node src/cli.mjs help doc",
    ],
    optionalFlags: [
      OPT_PROJECT,
      OPT_PROJECT_TOKEN,
      OPT_WORKSPACE,
    ],
    examples: [
      "node src/cli.mjs doc pull --help",
      'npm run doc-pull -- --project "SNPM" --path "Root > Overview" --output overview.md',
    ],
    notes: [
      "Use doc create/adopt/pull/diff/push/edit for curated project root docs, Templates > Project Templates docs, and the approved workspace-global docs.",
      "Project docs require --project; template and workspace docs do not.",
      "Use the subcommand help for exact required flags and mutation boundaries.",
    ],
    mutationMode: "mixed",
  }),
  createCommandSpec({
    canonical: "page",
    summary: "Show the planning-page command family and its pull/diff/push/edit subcommands.",
    usageLines: [
      'node src/cli.mjs page <pull|diff|push|edit> --project "Project Name" --page "Planning > <Page Name>" [options]',
      "node src/cli.mjs page --help",
      "node src/cli.mjs help page",
    ],
    requiredFlags: [
      OPT_PROJECT,
      '--page "Planning > <Page Name>"',
    ],
    optionalFlags: [
      OPT_PROJECT_TOKEN,
      OPT_WORKSPACE,
    ],
    examples: [
      "node src/cli.mjs page push --help",
      'npm run page-push -- --project "SNPM" --page "Planning > Roadmap" --file roadmap.md',
    ],
    notes: [
      "Planning-page sync is limited to Planning > Roadmap, Planning > Current Cycle, Planning > Backlog, and Planning > Decision Log.",
      "Use page pull for local refresh, page diff for review, and page push/edit for apply-gated Notion updates.",
      "Use the subcommand help for exact required flags and mutation boundaries.",
    ],
    mutationMode: "mixed",
  }),
  createCommandSpec({
    canonical: "runbook",
    summary: "Show the runbook command family and its create/adopt/pull/diff/push/edit subcommands.",
    usageLines: [
      'node src/cli.mjs runbook <create|adopt|pull|diff|push|edit> --project "Project Name" --title "Runbook Title" [options]',
      "node src/cli.mjs runbook --help",
      "node src/cli.mjs help runbook",
    ],
    requiredFlags: [
      OPT_PROJECT,
      '--title "Runbook Title"',
    ],
    optionalFlags: [
      OPT_PROJECT_TOKEN,
      OPT_WORKSPACE,
    ],
    examples: [
      "node src/cli.mjs runbook diff --help",
      'npm run runbook-pull -- --project "SNPM" --title "Deployment" --output deployment.md',
    ],
    notes: [
      "Runbook operations are limited to project-owned runbooks under the Runbooks surface.",
      "Use runbook pull for local refresh, runbook diff for review, and runbook create/adopt/push/edit for apply-gated Notion updates.",
      "Use the subcommand help for exact required flags and mutation boundaries.",
    ],
    mutationMode: "mixed",
  }),
  createCommandSpec({
    canonical: "validation-session",
    summary: "Show the validation-session command family and its create/adopt/pull/diff/push subcommands.",
    usageLines: [
      'node src/cli.mjs validation-session <create|adopt|pull|diff|push> --project "Project Name" --title "Session Title" [options]',
      "node src/cli.mjs validation-session --help",
      "node src/cli.mjs help validation-session",
    ],
    requiredFlags: [
      OPT_PROJECT,
      '--title "Session Title"',
    ],
    optionalFlags: [
      OPT_PROJECT_TOKEN,
      OPT_WORKSPACE,
    ],
    examples: [
      "node src/cli.mjs validation-session push --help",
      'npm run validation-session-pull -- --project "SNPM" --title "Regression Pass 1" --output session.md',
    ],
    notes: [
      "Validation-session operations are limited to Ops > Validation > Validation Sessions.",
      "Use validation-session pull for local refresh, validation-session diff for review, and validation-session create/adopt/push for apply-gated Notion updates.",
      "Use the subcommand help for exact required flags and mutation boundaries.",
    ],
    mutationMode: "mixed",
  }),
  createCommandSpec({
    canonical: "sync",
    summary: "Show the manifest-sync command family and its check/pull/push subcommands.",
    usageLines: [
      "node src/cli.mjs sync <check|pull|push> --manifest <path> [options]",
      "node src/cli.mjs sync --help",
      "node src/cli.mjs help sync",
    ],
    requiredFlags: [
      "--manifest <path>",
    ],
    optionalFlags: [
      OPT_SYNC_ENTRY,
      OPT_SYNC_ENTRIES_FILE,
      OPT_PROJECT_TOKEN,
      OPT_WORKSPACE,
    ],
    examples: [
      "node src/cli.mjs sync check --help",
      'npm run sync-check -- --manifest C:\\repo\\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN',
    ],
    notes: [
      "Manifest v2 supports check, local-file pull with sidecar metadata, and guarded push for existing approved targets.",
      "Manifest v1 remains the validation-session artifact-sync lane.",
      "Use the subcommand help for exact required flags and mutation boundaries.",
    ],
    mutationMode: "mixed",
  }),
];

const COMMAND_SPECS = [...SINGLE_COMMAND_SPECS, ...FAMILY_COMMAND_SPECS, ...COMPOUND_COMMAND_SPECS];

const COMMAND_SPEC_INDEX = new Map();
for (const spec of COMMAND_SPECS) {
  COMMAND_SPEC_INDEX.set(spec.canonical, spec);
  for (const alias of spec.aliases) {
    COMMAND_SPEC_INDEX.set(alias, spec);
  }
}

const GLOBAL_COMMAND_GROUPS = [
  {
    title: "Core Commands:",
    entries: [
      ["create-project", "Bootstrap a new project subtree in Notion."],
      ["doctor", "Run the read-only project health scan and optional truth-quality audit."],
      ["recommend", "Run the read-only scan or route an intent to Notion vs repo."],
      ["verify-project", "Verify project structure and optional project-token scope."],
      ["verify-workspace-docs", "Verify curated workspace and template docs."],
      ["capabilities", "Print the registry-derived CLI capability map as JSON."],
      ["plan-change", "Return JSON routing recommendations for a proposed plan change."],
    ],
  },
  {
    title: "Managed Docs And Planning:",
    entries: [
      ["scaffold-docs", "Preview starter managed-doc drafts and optional local scaffold files."],
      ["doc <create|adopt|pull|diff|push|edit>", "Curated project, template, and workspace docs."],
      ["page <pull|diff|push|edit>", "Approved planning pages only."],
    ],
  },
  {
    title: "Project Operations:",
    entries: [
      ["access-domain <create|adopt|pull|diff|push|edit>", "Managed Access domain pages."],
      ["secret-record <create|adopt|pull|exec>", "Managed consume-only secret records under an Access domain."],
      ["access-token <create|adopt|pull|exec>", "Managed consume-only access-token records under an Access domain."],
      ["runbook <create|adopt|pull|diff|push|edit>", "Managed project runbooks."],
      ["build-record <create|pull|diff|push>", "Managed project build records."],
      ["journal <list>", "Read recent local mutation journal entries as JSON."],
    ],
  },
  {
    title: "Validation And Sync:",
    entries: [
      ["validation-sessions <init|verify>", "Initialize or verify the Validation Sessions surface."],
      ["validation-bundle <login|preview|apply|verify>", "Experimental Chromium-only UI bundle commands."],
      ["validation-session <create|adopt|pull|diff|push>", "Managed validation-session reports."],
      ["sync <check|pull|push>", "Manifest-backed sync; v2 supports check, local-file pull, and guarded push."],
    ],
  },
];

function formatSection(title, lines) {
  if (!lines || lines.length === 0) {
    return [];
  }

  return [title, ...lines.map((line) => `  ${line}`), ""];
}

function formatOverviewEntry(label, summary) {
  return `${label.padEnd(50)} ${summary}`;
}

function extractCommandTokens(tokens) {
  const commandTokens = [];
  let index = 0;

  while (index < tokens.length && !tokens[index].startsWith("--") && commandTokens.length < 2) {
    commandTokens.push(tokens[index]);
    index += 1;
  }

  return commandTokens;
}

function isHelpToken(token) {
  return HELP_TOKENS.has(token);
}

export function normalizeCommandName(command) {
  return command.trim().replace(/\s+/g, " ").toLowerCase();
}

export function findCommandHelp(command) {
  return COMMAND_SPEC_INDEX.get(normalizeCommandName(command)) || null;
}

function copyOptionalCapabilityFields(target, spec) {
  const optionalFields = [
    "notionMutation",
    "localFileWrites",
    "journalWrites",
    "truthAudit",
    "staleAfterDaysDefault",
    "supportedTruthAuditSurfaces",
    "truthAuditExclusions",
    "truthAuditNonGoals",
    "sidecarRefresh",
    "supportedManifestVersions",
    "supportedManifestV2EntryKinds",
    "manifestV2Selection",
    "reviewOutput",
    "maxMutations",
    "structuredDiagnostics",
    "diagnosticFields",
    "diagnosticScope",
    "diagnosticPurpose",
    "diagnosticNonGoals",
    "supportedScaffoldKinds",
    "scaffoldTargets",
    "secretOutput",
    "rawSecretExport",
    "localSecretPersistence",
    "reviewOutputRedaction",
    "secretConsumption",
    "secretDeliveryModes",
    "childProcessExecution",
    "childOutputRedaction",
    "supported",
    "supportStatus",
    "replacementCommand",
  ];

  for (const field of optionalFields) {
    if (!(field in spec)) {
      continue;
    }

    target[field] = Array.isArray(spec[field]) ? [...spec[field]] : spec[field];
  }

  return target;
}

function commandCapability(spec) {
  return copyOptionalCapabilityFields({
    canonical: spec.canonical,
    aliases: [...spec.aliases],
    summary: spec.summary,
    usageLines: [...spec.usageLines],
    requiredFlags: [...spec.requiredFlags],
    optionalFlags: [...spec.optionalFlags],
    examples: [...spec.examples],
    notes: [...spec.notes],
    surface: spec.surface,
    authScope: spec.authScope,
    mutationMode: spec.mutationMode,
    stability: spec.stability,
  }, spec);
}

export function buildCapabilityMap() {
  const commands = COMMAND_SPECS.map(commandCapability);

  return {
    schemaVersion: 1,
    commandGroups: GLOBAL_COMMAND_GROUPS.map((group) => ({
      title: group.title.replace(/:$/, ""),
      entries: group.entries.map(([label, summary]) => ({
        label,
        summary,
      })),
    })),
    canonicalCommands: commands.map((command) => command.canonical),
    commands,
  };
}

export function capabilityJson() {
  return `${JSON.stringify(buildCapabilityMap(), null, 2)}\n`;
}

export function commandUsage(command) {
  const spec = findCommandHelp(command);
  if (!spec) {
    return null;
  }

  const lines = [
    `Command: ${spec.canonical}`,
    "",
    ...formatSection("Summary:", [spec.summary]),
    ...formatSection("Usage:", spec.usageLines),
    ...formatSection("Aliases:", spec.aliases),
    ...formatSection("Required Flags:", spec.requiredFlags),
    ...formatSection("Optional Flags:", spec.optionalFlags),
    ...formatSection("Examples:", spec.examples),
    ...formatSection("Notes:", spec.notes),
    'See `node src/cli.mjs --help` for the full command surface.',
  ];

  return lines.join("\n");
}

export function usage() {
  const lines = [
    "Usage:",
    "  node src/cli.mjs <command> [options]",
    "  node src/cli.mjs --help",
    "  node src/cli.mjs help <command>",
    "",
    "Use `node src/cli.mjs <command> --help` or `node src/cli.mjs help <command>` for exact flags and examples.",
    "",
  ];

  for (const group of GLOBAL_COMMAND_GROUPS) {
    lines.push(group.title);
    lines.push(...group.entries.map(([label, summary]) => `  ${formatOverviewEntry(label, summary)}`));
    lines.push("");
  }

  lines.push(
    "Examples:",
    "  node src/cli.mjs verify-project --help",
    "  node src/cli.mjs page push -h",
    "  node src/cli.mjs sync --help",
    '  npm run verify-project -- --name "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run scaffold-docs -- --project "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--output-dir <dir>]',
    '  npm run doc-create -- --project "Project Name" --path "Root > Overview" --file <file|-> [--apply]',
    '  npm run page-push -- --project "Project Name" --page "Planning > Roadmap" --file <file|-> [--metadata <path>] [--apply]',
    "",
    "Notes:",
    "  Run from the SNPM checkout (for example C:\\SNPM), even when the active Codex thread is attached to a different repo.",
    "  Bootstrap only needs the workspace token. Project-token verification stays optional until a repo-local Notion integration exists.",
    "  Doctoring is read-only and project-scoped; it summarizes managed surfaces, adoptable content, truth boundaries, and next-step recommendations.",
    "  Recommend stays an alias for the read-only scan unless --intent is provided, in which case it returns a deterministic Notion-vs-repo routing answer.",
    "  Implementation notes, design specs, task breakdowns, and investigations are repo-first intents and should not be stored as managed Notion docs.",
    "  scaffold-docs is preview-first bootstrap doc scaffolding for starter managed docs; it writes local drafts only with --output-dir and never mutates Notion directly.",
    "  The managed doc surface uses doc-* commands for curated project root docs, Templates > Project Templates docs, and a small named set of workspace-global docs.",
    "  Planning-page sync is limited to Planning > Roadmap, Planning > Current Cycle, Planning > Backlog, and Planning > Decision Log.",
    '  Project-scoped doc paths are limited to "Root", "Root > ...", and the four approved planning pages. Reserved structural roots stay on their owning surfaces.',
    '  Workspace-scoped doc paths are limited to the curated exact pages plus "Templates > Project Templates" and descendants under it.',
    "  Access operations are limited to project-owned Access domain pages plus secret/token records nested under those domains.",
    "  Secret-bearing Access records are consume-only: pull output is redacted-only, raw local export is unsupported, and runtime use goes through secret-record exec or access-token exec.",
    "  Runbook and build-record operations are limited to project-owned surfaces under Runbooks and Ops > Builds.",
    "  Validation-session operations are limited to Ops > Validation > Validation Sessions.",
    "  Validation-session bundle verification remains the API-visible check; validation-bundle adds an experimental Chromium-only UI lane for the surrounding Notion bundle.",
    "  Manifest v2 mixed-surface support includes sync check, local-file sync pull with sidecar metadata, and guarded sync push for existing approved targets.",
    "  Manifest v2 sync pull does not mutate Notion and does not append local mutation journal entries.",
    "  Manifest v2 sync push mutates Notion only with --apply, appends redacted local mutation journal entries on applied changes, and writes local sidecars only when --refresh-sidecars is also provided.",
    "  Manifest v2 diagnostics are structured result metadata, plus review metadata where supported, for operator recovery; they do not add rollback, automatic retries, semantic consistency checks, transaction semantics, or generic batch apply.",
    "  Validation-session manifest v1 sync remains a separate artifact lane with sync check, sync pull, and sync push.",
    "  Validation-bundle automation launches Playwright Chromium directly and does not use Edge or the machine default browser.",
    "  verify-workspace-docs is workspace-token only and checks the curated workspace/template doc registry.",
    "  For the core band, use --output - on pull commands to stream markdown to stdout and --file - on create/diff/push commands to read markdown from stdin.",
    "  When a pull command uses --output -, the markdown body is written to stdout and the structured metadata is written to stderr.",
    "  Pull commands write <output>.snpm-meta.json by default; use --metadata-output to override or when streaming markdown to stdout.",
    "  Apply push commands read <file>.snpm-meta.json by default; use --metadata to override or when reading markdown from stdin.",
    "  Applied mutations append redacted operational entries to the local mutation journal.",
    "  Operational diff, push, and edit commands support --explain for explicit auth/target/normalization reasoning and --review-output <dir> for review artifacts.",
    "",
    "Global Options:",
    `  ${OPT_WORKSPACE}`,
    `  ${OPT_PROJECT_TOKEN}`,
    `  ${OPT_APPLY}`,
    "",
    "Environment:",
    "  Workspace token: NOTION_TOKEN or INFRASTRUCTURE_HQ_NOTION_TOKEN",
  );

  return lines.join("\n");
}

export function resolveHelpRequest(argv) {
  if (argv.length === 0) {
    return { type: "global" };
  }

  if (argv[0] === "help") {
    const targetTokens = extractCommandTokens(argv.slice(1).filter((token) => !isHelpToken(token)));
    if (targetTokens.length === 0) {
      return { type: "global" };
    }

    const command = normalizeCommandName(targetTokens.join(" "));
    const spec = findCommandHelp(command);
    if (spec) {
      return { type: "command", command: spec.canonical };
    }

    return { type: "unknown", command };
  }

  if (isHelpToken(argv[0])) {
    return { type: "global" };
  }

  if (!argv.some(isHelpToken)) {
    return null;
  }

  const targetTokens = extractCommandTokens(argv.filter((token) => !isHelpToken(token)));
  if (targetTokens.length === 0) {
    return { type: "global" };
  }

  const command = normalizeCommandName(targetTokens.join(" "));
  const spec = findCommandHelp(command);
  if (spec) {
    return { type: "command", command: spec.canonical };
  }

  return { type: "unknown", command };
}
