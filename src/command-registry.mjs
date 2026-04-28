const READ_ONLY_VERBS = new Set([
  "capabilities",
  "check",
  "diff",
  "discover",
  "doctor",
  "help",
  "list",
  "plan-change",
  "preview",
  "pull",
  "recommend",
  "verify",
  "verify-project",
  "verify-workspace-docs",
]);

const REQUIRED_STRING_FIELDS = [
  "canonical",
  "summary",
  "surface",
  "authScope",
  "mutationMode",
  "stability",
];

const REQUIRED_ARRAY_FIELDS = [
  "aliases",
  "usageLines",
  "requiredFlags",
  "optionalFlags",
  "examples",
  "notes",
];

const FAMILY_COMMANDS = new Set([
  "access-domain",
  "access-token",
  "build-record",
  "doc",
  "page",
  "runbook",
  "secret-record",
  "sync",
  "validation-session",
  "validation-sessions",
]);

const BASE_CAPABILITY_FIELDS = new Set([
  "canonical",
  "aliases",
  "summary",
  "usageLines",
  "requiredFlags",
  "optionalFlags",
  "examples",
  "notes",
  "surface",
  "authScope",
  "mutationMode",
  "stability",
]);

const VALID_AUTH_SCOPES = new Set([
  "local-filesystem",
  "none",
  "project-token",
  "project-token-optional",
  "workspace-or-project-token",
  "workspace-token",
]);

const VALID_MUTATION_MODES = new Set([
  "apply-gated",
  "live-mutation",
  "local-file-output",
  "mixed",
  "read-only",
  "unsupported",
]);

const VALID_STABILITIES = new Set([
  "deprecated",
  "stable",
]);

const VALID_COMMAND_KINDS = new Set([
  "command",
  "family",
  "subcommand",
]);

const VALID_OUTPUT_MODES = new Set([
  "child-passthrough-redacted",
  "editor-json",
  "json",
  "json-or-markdown-stdout",
  "mixed-diff-json",
  "unsupported",
]);

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
    discover: "first-contact",
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

  if (root === "create-project") {
    return "live-mutation";
  }

  if (READ_ONLY_VERBS.has(verb)) {
    return "read-only";
  }

  return "apply-gated";
}

function inferStability() {
  return "stable";
}

function inferCommandKind(canonical) {
  if (canonical.includes(" ")) {
    return "subcommand";
  }

  if (FAMILY_COMMANDS.has(canonical)) {
    return "family";
  }

  return "command";
}

function inferOutputMode(canonical, mutationMode) {
  const root = commandRoot(canonical);
  const verb = commandVerb(canonical);

  if (mutationMode === "unsupported") {
    return "unsupported";
  }

  if ((root === "secret-record" || root === "access-token") && verb === "exec") {
    return "child-passthrough-redacted";
  }

  if (verb === "diff") {
    return "mixed-diff-json";
  }

  if (verb === "pull") {
    return "json-or-markdown-stdout";
  }

  if (verb === "edit") {
    return "editor-json";
  }

  return "json";
}

function inferCommandMetadata(canonical, overrides = {}) {
  return {
    surface: overrides.surface || inferCommandSurface(canonical),
    authScope: overrides.authScope || inferAuthScope(canonical),
    mutationMode: overrides.mutationMode || inferMutationMode(canonical),
    stability: overrides.stability || inferStability(canonical),
  };
}

function inferNpmScripts(canonical, commandKind, capabilityMetadata) {
  if (Array.isArray(capabilityMetadata.npmScripts)) {
    return [...capabilityMetadata.npmScripts];
  }

  if (commandKind === "family") {
    return [];
  }

  return [canonical.replace(/\s+/g, "-")];
}

function commandContract(canonical, metadata, capabilityMetadata) {
  const parts = canonical.split(" ");
  const commandKind = inferCommandKind(canonical);
  const family = parts[0];
  const subcommand = parts.length > 1 ? parts.slice(1).join(" ") : null;
  const outputMode = inferOutputMode(canonical, metadata.mutationMode);
  const npmScripts = inferNpmScripts(canonical, commandKind, capabilityMetadata);

  return {
    commandKind,
    family,
    subcommand,
    outputMode,
    npmScripts,
    sourceCheckoutForm: `node src/cli.mjs ${canonical}`,
    installedCliForm: `snpm ${canonical}`,
    dispatchKey: canonical,
    capabilityMetadataFields: Object.keys(capabilityMetadata).sort(),
  };
}

function copyCapabilityValue(value) {
  if (Array.isArray(value)) {
    return value.map(copyCapabilityValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, copyCapabilityValue(nestedValue)]),
    );
  }

  return value;
}

function commandCapability(spec) {
  const capability = {
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
  };

  for (const [field, value] of Object.entries(spec)) {
    if (!BASE_CAPABILITY_FIELDS.has(field)) {
      capability[field] = copyCapabilityValue(value);
    }
  }

  return capability;
}

function commandLookupTokens(spec) {
  return [spec.canonical, ...spec.aliases];
}

function buildCommandIndex(commandSpecs) {
  const index = new Map();

  for (const spec of commandSpecs) {
    for (const token of commandLookupTokens(spec)) {
      index.set(token, spec);
    }
  }

  return index;
}

function commandGroupsCapability(commandGroups) {
  return commandGroups.map((group) => ({
    title: group.title.replace(/:$/, ""),
    entries: group.entries.map(([label, summary]) => ({
      label,
      summary,
    })),
  }));
}

function missingMetadata(commandSpecs) {
  const diagnostics = [];

  for (const spec of commandSpecs) {
    for (const field of REQUIRED_STRING_FIELDS) {
      if (typeof spec[field] !== "string" || spec[field].length === 0) {
        diagnostics.push({ canonical: spec.canonical, field, expected: "non-empty string" });
      }
    }

    for (const field of REQUIRED_ARRAY_FIELDS) {
      if (!Array.isArray(spec[field])) {
        diagnostics.push({ canonical: spec.canonical, field, expected: "array" });
      }
    }

    if (!spec.contract || typeof spec.contract !== "object") {
      diagnostics.push({ canonical: spec.canonical, field: "contract", expected: "object" });
    }
  }

  return diagnostics;
}

function invalidEnumValues(commandSpecs) {
  const diagnostics = [];

  for (const spec of commandSpecs) {
    const enumChecks = [
      ["authScope", spec.authScope, VALID_AUTH_SCOPES],
      ["mutationMode", spec.mutationMode, VALID_MUTATION_MODES],
      ["stability", spec.stability, VALID_STABILITIES],
      ["contract.commandKind", spec.contract?.commandKind, VALID_COMMAND_KINDS],
      ["contract.outputMode", spec.contract?.outputMode, VALID_OUTPUT_MODES],
    ];

    for (const [field, value, validValues] of enumChecks) {
      if (!validValues.has(value)) {
        diagnostics.push({
          canonical: spec.canonical,
          field,
          value,
          validValues: [...validValues],
        });
      }
    }
  }

  return diagnostics;
}

function duplicateCanonicalCommands(commandSpecs) {
  const counts = new Map();

  for (const spec of commandSpecs) {
    counts.set(spec.canonical, (counts.get(spec.canonical) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([canonical, count]) => ({ canonical, count }));
}

function lookupCollisions(commandSpecs) {
  const owners = new Map();
  const collisions = [];

  for (const spec of commandSpecs) {
    for (const token of commandLookupTokens(spec)) {
      const owner = owners.get(token);
      if (owner && owner !== spec.canonical) {
        collisions.push({
          lookup: token,
          firstCanonical: owner,
          secondCanonical: spec.canonical,
        });
        continue;
      }

      owners.set(token, spec.canonical);
    }
  }

  return collisions;
}

export function normalizeCommandName(command) {
  return command.trim().replace(/\s+/g, " ").toLowerCase();
}

export function createCommandSpec({
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
    contract: commandContract(normalizedCanonical, metadata, capabilityMetadata),
    ...capabilityMetadata,
  };
}

export function compoundFamilySpecs({ family, subcommands }) {
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

export function commandRegistryDiagnostics(commandSpecs) {
  return {
    duplicateCanonicals: duplicateCanonicalCommands(commandSpecs),
    lookupCollisions: lookupCollisions(commandSpecs),
    missingMetadata: missingMetadata(commandSpecs),
    invalidEnumValues: invalidEnumValues(commandSpecs),
  };
}

export function createCommandRegistry({ commandSpecs, commandGroups, schemaVersion = 1 }) {
  const index = buildCommandIndex(commandSpecs);

  return {
    schemaVersion,
    commandSpecs,
    commandGroups,
    diagnostics() {
      return commandRegistryDiagnostics(commandSpecs);
    },
    findCommandHelp(command) {
      return index.get(normalizeCommandName(command)) || null;
    },
    lookupEntries() {
      return commandSpecs.flatMap((spec) => commandLookupTokens(spec).map((lookup) => ({
        lookup,
        canonical: spec.canonical,
        kind: lookup === spec.canonical ? "canonical" : "alias",
      })));
    },
    buildCapabilityMap() {
      const commands = commandSpecs.map(commandCapability);

      return {
        schemaVersion,
        commandGroups: commandGroupsCapability(commandGroups),
        canonicalCommands: commands.map((command) => command.canonical),
        commands,
      };
    },
  };
}
