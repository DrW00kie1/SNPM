export const JSON_CONTRACT_IDS = Object.freeze([
  "snpm.cli-error.v1",
  "snpm.discover.v1",
  "snpm.capabilities.v1.minimal",
  "snpm.plan-change.v1",
  "snpm.manifest-v2.diagnostic.v1",
  "snpm.manifest-v2.sync-result.v1",
  "snpm.manifest-v2.review-output.v1",
  "snpm.pull-metadata.v1",
  "snpm.mutation-journal.v1",
]);

const CONTRACT_ID_SET = new Set(JSON_CONTRACT_IDS);
const CONTRACT_ID_ALIASES = new Map([
  ["structured-cli-error.v1", "snpm.cli-error.v1"],
  ["discover.v1", "snpm.discover.v1"],
  ["capabilities.v1", "snpm.capabilities.v1.minimal"],
  ["plan-change.v1", "snpm.plan-change.v1"],
]);

const AUTH_MODES = new Set(["project-token", "workspace-token"]);
const CAPABILITY_AUTH_SCOPES = new Set([
  "local-filesystem",
  "none",
  "project-token",
  "project-token-optional",
  "workspace-or-project-token",
  "workspace-token",
]);
const CAPABILITY_MUTATION_MODES = new Set([
  "apply-gated",
  "live-mutation",
  "local-file-output",
  "mixed",
  "read-only",
  "unsupported",
]);
const CAPABILITY_STABILITIES = new Set(["deprecated", "stable"]);
const COMMAND_KINDS = new Set(["command", "family", "subcommand"]);
const OUTPUT_MODES = new Set([
  "child-passthrough-redacted",
  "editor-json",
  "json",
  "json-or-markdown-stdout",
  "mixed-diff-json",
  "unsupported",
]);
const PLAN_TARGET_TYPES = new Set([
  "planning",
  "project-doc",
  "template-doc",
  "workspace-doc",
  "runbook",
  "secret",
  "token",
  "generated-secret",
  "generated-token",
  "implementation-note",
  "design-spec",
  "task-breakdown",
  "investigation",
  "repo-doc",
  "generated-output",
]);
const MANIFEST_V2_ENTRY_KINDS = new Set([
  "planning-page",
  "project-doc",
  "template-doc",
  "workspace-doc",
  "runbook",
  "validation-session",
]);
const MANIFEST_V2_COMMANDS = new Set(["sync-check", "sync-pull", "sync-push"]);
const DIAGNOSTIC_SEVERITIES = new Set(["error", "warning", "info"]);
const SYNC_STATUSES = new Set([
  "drift",
  "error",
  "in-sync",
  "missing-local-file",
  "pulled",
  "pulled-created",
  "pull-create-preview",
  "pull-preview",
  "pushed",
  "push-preview",
  "skipped",
]);
const METADATA_COMMAND_FAMILIES = new Set([
  "access-domain",
  "access-token",
  "build-record",
  "doc",
  "page",
  "runbook",
  "secret-record",
  "validation-session",
]);
const PULL_METADATA_KEYS = new Set([
  "schema",
  "commandFamily",
  "workspaceName",
  "targetPath",
  "pageId",
  "projectId",
  "authMode",
  "lastEditedTime",
  "pulledAt",
]);
const MUTATION_JOURNAL_KEYS = new Set([
  "schema",
  "command",
  "surface",
  "targetPath",
  "pageId",
  "authMode",
  "timestamp",
  "revision",
  "diff",
]);
const FORBIDDEN_LEAK_KEYS = new Set([
  "bodyMarkdown",
  "currentBodyMarkdown",
  "envValue",
  "nextBodyMarkdown",
  "password",
  "secret",
  "stderr",
  "stdout",
  "token",
]);
const RAW_DIFF_FORBIDDEN_CONTRACTS = new Set([
  "snpm.manifest-v2.review-output.v1",
  "snpm.mutation-journal.v1",
]);
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pathFor(parentPath, key) {
  return parentPath ? `${parentPath}.${key}` : key;
}

function pushError(errors, path, message) {
  errors.push({ path, message });
}

function requireObject(value, path, errors) {
  if (!isPlainObject(value)) {
    pushError(errors, path, "must be a JSON object");
    return false;
  }
  return true;
}

function requireString(object, key, errors, { nonEmpty = true, path = key } = {}) {
  const value = object?.[key];
  if (typeof value !== "string" || (nonEmpty && value.trim() === "")) {
    pushError(errors, path, nonEmpty ? "must be a non-empty string" : "must be a string");
    return null;
  }
  return value;
}

function optionalString(object, key, errors, { nonEmpty = true, path = key } = {}) {
  if (object?.[key] === undefined || object?.[key] === null) {
    return null;
  }
  return requireString(object, key, errors, { nonEmpty, path });
}

function requireBoolean(object, key, errors, { path = key } = {}) {
  if (typeof object?.[key] !== "boolean") {
    pushError(errors, path, "must be a boolean");
    return null;
  }
  return object[key];
}

function optionalBoolean(object, key, errors, { path = key } = {}) {
  if (object?.[key] === undefined) {
    return null;
  }
  return requireBoolean(object, key, errors, { path });
}

function requireNumber(object, key, errors, { integer = true, min, path = key } = {}) {
  const value = object?.[key];
  const validNumber = typeof value === "number" && Number.isFinite(value);
  if (!validNumber || (integer && !Number.isInteger(value)) || (min !== undefined && value < min)) {
    pushError(errors, path, `must be ${integer ? "an integer" : "a number"}${min !== undefined ? ` >= ${min}` : ""}`);
    return null;
  }
  return value;
}

function optionalNumber(object, key, errors, options = {}) {
  if (object?.[key] === undefined) {
    return null;
  }
  return requireNumber(object, key, errors, options);
}

function requireArray(object, key, errors, { path = key, nonEmpty = false } = {}) {
  const value = object?.[key];
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    pushError(errors, path, nonEmpty ? "must be a non-empty array" : "must be an array");
    return null;
  }
  return value;
}

function optionalArray(object, key, errors, options = {}) {
  if (object?.[key] === undefined) {
    return null;
  }
  return requireArray(object, key, errors, options);
}

function requireEnum(object, key, validValues, errors, { path = key } = {}) {
  const value = requireString(object, key, errors, { path });
  if (value !== null && !validValues.has(value)) {
    pushError(errors, path, `must be one of: ${[...validValues].join(", ")}`);
  }
  return value;
}

function optionalEnum(object, key, validValues, errors, { path = key } = {}) {
  if (object?.[key] === undefined || object?.[key] === null) {
    return null;
  }
  return requireEnum(object, key, validValues, errors, { path });
}

function requireLiteral(object, key, expected, errors, { path = key } = {}) {
  if (object?.[key] !== expected) {
    pushError(errors, path, `must equal ${JSON.stringify(expected)}`);
  }
}

function validateStringArray(value, path, errors, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    pushError(errors, path, nonEmpty ? "must be a non-empty string array" : "must be a string array");
    return;
  }

  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      pushError(errors, `${path}[${index}]`, "must be a non-empty string");
    }
  });
}

function validateObjectArray(value, path, errors, validateEntry, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    pushError(errors, path, nonEmpty ? "must be a non-empty object array" : "must be an object array");
    return;
  }

  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!requireObject(entry, entryPath, errors)) {
      return;
    }
    validateEntry(entry, entryPath, errors);
  });
}

function rejectUnknownKeys(object, allowedKeys, path, errors) {
  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, pathFor(path, key), "is not allowed");
    }
  }
}

function rejectLeakFields(value, path, errors, { forbidRawDiff = false } = {}) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectLeakFields(entry, `${path}[${index}]`, errors, { forbidRawDiff }));
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = pathFor(path, key);
    if (FORBIDDEN_LEAK_KEYS.has(key) && child !== null && child !== undefined && child !== "") {
      pushError(errors, childPath, "is leak-prone and must not be included in this contract");
    }
    if (forbidRawDiff && key === "diff" && typeof child === "string") {
      pushError(errors, childPath, "must not include raw diff text");
    }
    rejectLeakFields(child, childPath, errors, { forbidRawDiff });
  }
}

function validateCommandEntry(command, path, errors) {
  requireString(command, "canonical", errors, { path: pathFor(path, "canonical") });
  validateStringArray(command.aliases, pathFor(path, "aliases"), errors);
  requireString(command, "summary", errors, { path: pathFor(path, "summary") });
  validateStringArray(command.usageLines, pathFor(path, "usageLines"), errors);
  validateStringArray(command.requiredFlags, pathFor(path, "requiredFlags"), errors);
  validateStringArray(command.optionalFlags, pathFor(path, "optionalFlags"), errors);
  validateStringArray(command.examples, pathFor(path, "examples"), errors);
  validateStringArray(command.notes, pathFor(path, "notes"), errors);
  requireEnum(command, "surface", new Set([command.surface].filter(Boolean)), errors, { path: pathFor(path, "surface") });
  requireEnum(command, "authScope", CAPABILITY_AUTH_SCOPES, errors, { path: pathFor(path, "authScope") });
  requireEnum(command, "mutationMode", CAPABILITY_MUTATION_MODES, errors, { path: pathFor(path, "mutationMode") });
  requireEnum(command, "stability", CAPABILITY_STABILITIES, errors, { path: pathFor(path, "stability") });

  const contractPath = pathFor(path, "contract");
  if (requireObject(command.contract, contractPath, errors)) {
    requireEnum(command.contract, "commandKind", COMMAND_KINDS, errors, { path: pathFor(contractPath, "commandKind") });
    requireString(command.contract, "family", errors, { path: pathFor(contractPath, "family") });
    optionalString(command.contract, "subcommand", errors, { path: pathFor(contractPath, "subcommand") });
    requireEnum(command.contract, "outputMode", OUTPUT_MODES, errors, { path: pathFor(contractPath, "outputMode") });
    validateStringArray(command.contract.npmScripts, pathFor(contractPath, "npmScripts"), errors);
    requireString(command.contract, "sourceCheckoutForm", errors, { path: pathFor(contractPath, "sourceCheckoutForm") });
    requireString(command.contract, "installedCliForm", errors, { path: pathFor(contractPath, "installedCliForm") });
    requireString(command.contract, "dispatchKey", errors, { path: pathFor(contractPath, "dispatchKey") });
  }
}

function validateCliError(payload, errors) {
  requireLiteral(payload, "ok", false, errors);
  requireLiteral(payload, "schemaVersion", 1, errors);
  if (payload.command !== null) {
    optionalString(payload, "command", errors);
  }

  if (requireObject(payload.error, "error", errors)) {
    requireString(payload.error, "code", errors, { path: "error.code" });
    requireString(payload.error, "category", errors, { path: "error.category" });
    requireString(payload.error, "message", errors, { path: "error.message" });
    optionalBoolean(payload.error, "retryable", errors, { path: "error.retryable" });
    if (payload.error.details !== undefined) {
      requireObject(payload.error.details, "error.details", errors);
    }
  }
}

function validateDiscover(payload, errors) {
  requireLiteral(payload, "ok", true, errors);
  requireLiteral(payload, "schemaVersion", 1, errors);
  requireLiteral(payload, "command", "discover", errors);

  if (requireObject(payload.snpm, "snpm", errors)) {
    requireString(payload.snpm, "identity", errors, { path: "snpm.identity" });
    requireString(payload.snpm, "runContext", errors, { path: "snpm.runContext" });
    requireString(payload.snpm, "workspace", errors, { path: "snpm.workspace" });
    requireString(payload.snpm, "project", errors, { path: "snpm.project" });
    if (payload.snpm.projectTokenEnv !== null) {
      optionalString(payload.snpm, "projectTokenEnv", errors, { path: "snpm.projectTokenEnv" });
    }
    requireString(payload.snpm, "recommendedProjectTokenEnv", errors, { path: "snpm.recommendedProjectTokenEnv" });
  }

  if (requireObject(payload.boundaries, "boundaries", errors)) {
    validateStringArray(payload.boundaries.consumerRepoOwns, "boundaries.consumerRepoOwns", errors, { nonEmpty: true });
    validateStringArray(payload.boundaries.notionOwns, "boundaries.notionOwns", errors, { nonEmpty: true });
  }

  if (requireObject(payload.commandForms, "commandForms", errors)) {
    requireObject(payload.commandForms.sourceCheckout, "commandForms.sourceCheckout", errors);
    requireObject(payload.commandForms.installedCli, "commandForms.installedCli", errors);
  }
  validateObjectArray(payload.safeFirstCommands, "safeFirstCommands", errors, validateCommandSuggestion, { nonEmpty: true });
  validateObjectArray(payload.optionalSetupCommands, "optionalSetupCommands", errors, validateCommandSuggestion);
  validateStringArray(payload.mutationLoop, "mutationLoop", errors, { nonEmpty: true });
  validateStringArray(payload.notes, "notes", errors, { nonEmpty: true });
}

function validateCommandSuggestion(entry, path, errors) {
  requireString(entry, "command", errors, { path: pathFor(path, "command") });
  requireString(entry, "reason", errors, { path: pathFor(path, "reason") });
}

function validateCapabilities(payload, errors) {
  requireLiteral(payload, "schemaVersion", 1, errors);
  validateStringArray(payload.canonicalCommands, "canonicalCommands", errors, { nonEmpty: true });
  validateObjectArray(payload.commands, "commands", errors, validateCommandEntry, { nonEmpty: true });
}

function validatePlanChange(payload, errors) {
  requireBoolean(payload, "ok", errors);
  requireLiteral(payload, "command", "plan-change", errors);
  requireString(payload, "goal", errors);
  if (payload.projectName !== null) {
    optionalString(payload, "projectName", errors);
  }
  validateObjectArray(payload.targets, "targets", errors, validatePlanTarget, { nonEmpty: true });
  validateObjectArray(payload.recommendations, "recommendations", errors, validateRecommendation, { nonEmpty: true });
  validateObjectArray(payload.nextCommands, "nextCommands", errors, validatePlanNextCommand);
  validateStringArray(payload.warnings, "warnings", errors);
  if (payload.manifestDraft !== undefined) {
    validateManifestDraft(payload.manifestDraft, "manifestDraft", errors);
  }
}

function validatePlanTarget(target, path, errors) {
  requireNumber(target, "index", errors, { min: 0, path: pathFor(path, "index") });
  requireEnum(target, "type", PLAN_TARGET_TYPES, errors, { path: pathFor(path, "type") });
}

function validateRecommendation(recommendation, path, errors) {
  requireBoolean(recommendation, "ok", errors, { path: pathFor(path, "ok") });
  optionalString(recommendation, "recommendedHome", errors, { path: pathFor(path, "recommendedHome") });
  optionalString(recommendation, "surface", errors, { path: pathFor(path, "surface") });
  optionalString(recommendation, "targetPath", errors, { path: pathFor(path, "targetPath") });
  validateObjectArray(recommendation.nextCommands || [], pathFor(path, "nextCommands"), errors, validatePlanNextCommand);
}

function validatePlanNextCommand(entry, path, errors) {
  optionalString(entry, "kind", errors, { path: pathFor(path, "kind") });
  const commandLikeFields = ["command", "npmScript", "script", "sourceCheckoutCommand", "installedCliCommand"];
  for (const field of commandLikeFields) {
    optionalString(entry, field, errors, { path: pathFor(path, field) });
  }
  optionalString(entry, "reason", errors, { path: pathFor(path, "reason") });
}

function validateManifestDraft(draft, path, errors) {
  if (!requireObject(draft, path, errors)) {
    return;
  }
  requireLiteral(draft, "version", 2, errors, { path: pathFor(path, "version") });
  requireString(draft, "workspace", errors, { path: pathFor(path, "workspace") });
  requireString(draft, "project", errors, { path: pathFor(path, "project") });
  validateObjectArray(draft.entries, pathFor(path, "entries"), errors, validateManifestDraftEntry);
}

function validateManifestDraftEntry(entry, path, errors) {
  requireEnum(entry, "kind", MANIFEST_V2_ENTRY_KINDS, errors, { path: pathFor(path, "kind") });
  requireString(entry, "file", errors, { path: pathFor(path, "file") });
}

function validateManifestDiagnostic(payload, errors) {
  requireString(payload, "code", errors);
  requireEnum(payload, "severity", DIAGNOSTIC_SEVERITIES, errors);
  requireString(payload, "message", errors);
  requireEnum(payload, "command", MANIFEST_V2_COMMANDS, errors);
  optionalString(payload, "targetPath", errors);
  requireString(payload, "safeNextCommand", errors);
  requireString(payload, "recoveryAction", errors);
  if (payload.entry !== undefined) {
    validateManifestDiagnosticEntry(payload.entry, "entry", errors);
  }
  if (payload.state !== undefined) {
    requireObject(payload.state, "state", errors);
  }
}

function validateManifestDiagnosticEntry(entry, path, errors) {
  if (!requireObject(entry, path, errors)) {
    return;
  }
  requireEnum(entry, "kind", MANIFEST_V2_ENTRY_KINDS, errors, { path: pathFor(path, "kind") });
  optionalString(entry, "target", errors, { path: pathFor(path, "target") });
  optionalString(entry, "file", errors, { path: pathFor(path, "file") });
  optionalString(entry, "metadataPath", errors, { path: pathFor(path, "metadataPath") });
}

function validateManifestSyncResult(payload, errors) {
  requireEnum(payload, "command", MANIFEST_V2_COMMANDS, errors);
  requireString(payload, "manifestPath", errors);
  requireString(payload, "projectName", errors);
  requireString(payload, "workspaceName", errors);
  requireEnum(payload, "authMode", AUTH_MODES, errors);
  requireBoolean(payload, "hasDiff", errors);
  requireNumber(payload, "driftCount", errors, { min: 0 });
  requireNumber(payload, "appliedCount", errors, { min: 0 });
  validateStringArray(payload.failures, "failures", errors);
  validateObjectArray(payload.entries, "entries", errors, validateManifestSyncEntry);
  optionalArray(payload, "diagnostics", errors);
  optionalNumber(payload, "selectedCount", errors, { min: 0, path: "selectedCount" });
  optionalNumber(payload, "skippedCount", errors, { min: 0, path: "skippedCount" });
}

function validateManifestSyncEntry(entry, path, errors) {
  requireEnum(entry, "kind", MANIFEST_V2_ENTRY_KINDS, errors, { path: pathFor(path, "kind") });
  requireString(entry, "target", errors, { path: pathFor(path, "target") });
  requireString(entry, "file", errors, { path: pathFor(path, "file") });
  if (entry.targetPath !== null) {
    optionalString(entry, "targetPath", errors, { path: pathFor(path, "targetPath") });
  }
  requireEnum(entry, "status", SYNC_STATUSES, errors, { path: pathFor(path, "status") });
  requireBoolean(entry, "hasDiff", errors, { path: pathFor(path, "hasDiff") });
  requireBoolean(entry, "applied", errors, { path: pathFor(path, "applied") });
}

function validateReviewOutput(payload, errors) {
  requireBoolean(payload, "written", errors);
  if (payload.written === false) {
    requireString(payload, "reason", errors);
    return;
  }

  requireString(payload, "directory", errors);
  requireString(payload, "summaryPath", errors);
  requireString(payload, "entriesDirectory", errors);
  validateStringArray(payload.files, "files", errors, { nonEmpty: true });
  requireNumber(payload, "entryCount", errors, { min: 0 });
  requireNumber(payload, "diffCount", errors, { min: 0 });
}

function validatePullMetadata(payload, errors) {
  rejectUnknownKeys(payload, PULL_METADATA_KEYS, "", errors);
  requireLiteral(payload, "schema", "snpm.pull-metadata.v1", errors);
  requireEnum(payload, "commandFamily", METADATA_COMMAND_FAMILIES, errors);
  requireString(payload, "workspaceName", errors);
  requireString(payload, "targetPath", errors);
  requireString(payload, "pageId", errors);
  optionalString(payload, "projectId", errors);
  optionalEnum(payload, "authMode", AUTH_MODES, errors);
  requireTimestamp(payload, "lastEditedTime", errors);
  requireTimestamp(payload, "pulledAt", errors);
}

function requireTimestamp(object, key, errors, { path = key } = {}) {
  const value = requireString(object, key, errors, { path });
  if (value !== null && !ISO_TIMESTAMP_PATTERN.test(value)) {
    pushError(errors, path, "must be an ISO-8601 UTC timestamp");
  }
}

function validateMutationJournal(payload, errors) {
  rejectUnknownKeys(payload, MUTATION_JOURNAL_KEYS, "", errors);
  requireLiteral(payload, "schema", "snpm.mutation-journal.v1", errors);
  requireString(payload, "command", errors);
  requireString(payload, "surface", errors);
  requireString(payload, "targetPath", errors);
  requireString(payload, "pageId", errors);
  optionalEnum(payload, "authMode", AUTH_MODES, errors);
  requireString(payload, "timestamp", errors);
  if (payload.revision !== null) {
    validatePullMetadata(payload.revision, errorsForNested(errors, "revision"));
  }
  validateDiffSummary(payload.diff, "diff", errors);
}

function errorsForNested(errors, prefix) {
  return {
    push(error) {
      errors.push({
        ...error,
        path: pathFor(prefix, error.path),
      });
    },
  };
}

function validateDiffSummary(diff, path, errors) {
  if (!requireObject(diff, path, errors)) {
    return;
  }
  rejectUnknownKeys(diff, new Set(["hash", "additions", "deletions"]), path, errors);
  const hash = requireString(diff, "hash", errors, { path: pathFor(path, "hash") });
  if (hash !== null && !SHA256_PATTERN.test(hash)) {
    pushError(errors, pathFor(path, "hash"), "must be a SHA-256 hex digest");
  }
  requireNumber(diff, "additions", errors, { min: 0, path: pathFor(path, "additions") });
  requireNumber(diff, "deletions", errors, { min: 0, path: pathFor(path, "deletions") });
}

const VALIDATORS = Object.freeze({
  "snpm.cli-error.v1": validateCliError,
  "snpm.discover.v1": validateDiscover,
  "snpm.capabilities.v1.minimal": validateCapabilities,
  "snpm.plan-change.v1": validatePlanChange,
  "snpm.manifest-v2.diagnostic.v1": validateManifestDiagnostic,
  "snpm.manifest-v2.sync-result.v1": validateManifestSyncResult,
  "snpm.manifest-v2.review-output.v1": validateReviewOutput,
  "snpm.pull-metadata.v1": validatePullMetadata,
  "snpm.mutation-journal.v1": validateMutationJournal,
});

export function isJsonContractId(contractId) {
  return CONTRACT_ID_SET.has(contractId) || CONTRACT_ID_ALIASES.has(contractId);
}

export function validateJsonContract(contractId, payload) {
  const canonicalContractId = CONTRACT_ID_ALIASES.get(contractId) || contractId;
  if (!CONTRACT_ID_SET.has(canonicalContractId)) {
    return {
      ok: false,
      contractId,
      errors: [{ path: "contractId", message: `Unsupported JSON contract: ${contractId}` }],
    };
  }

  const errors = [];
  if (requireObject(payload, "$", errors)) {
    VALIDATORS[canonicalContractId](payload, errors);
    rejectLeakFields(payload, "$", errors, {
      forbidRawDiff: RAW_DIFF_FORBIDDEN_CONTRACTS.has(canonicalContractId),
    });
  }

  return {
    ok: errors.length === 0,
    contractId,
    errors,
  };
}

export function assertJsonContract(contractId, payload) {
  const result = validateJsonContract(contractId, payload);
  if (!result.ok) {
    const message = result.errors
      .map((error) => `${error.path}: ${error.message}`)
      .join("; ");
    throw new Error(`${contractId} contract validation failed: ${message}`);
  }
  return payload;
}

export const validateCliErrorContract = (payload) => validateJsonContract("snpm.cli-error.v1", payload);
export const validateDiscoverContract = (payload) => validateJsonContract("snpm.discover.v1", payload);
export const validateCapabilitiesMinimalContract = (payload) => validateJsonContract("snpm.capabilities.v1.minimal", payload);
export const validatePlanChangeContract = (payload) => validateJsonContract("snpm.plan-change.v1", payload);
export const validateManifestV2DiagnosticContract = (payload) => validateJsonContract("snpm.manifest-v2.diagnostic.v1", payload);
export const validateManifestV2SyncResultContract = (payload) => validateJsonContract("snpm.manifest-v2.sync-result.v1", payload);
export const validateManifestV2ReviewOutputContract = (payload) => validateJsonContract("snpm.manifest-v2.review-output.v1", payload);
export const validatePullMetadataContract = (payload) => validateJsonContract("snpm.pull-metadata.v1", payload);
export const validateMutationJournalContract = (payload) => validateJsonContract("snpm.mutation-journal.v1", payload);
