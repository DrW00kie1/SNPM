export const MANIFEST_V2_PUSH_DIAGNOSTIC_CODES = Object.freeze({
  ADAPTER_CONTRACT: "manifest-v2-push-adapter-contract",
  LOCAL_FILE_MISSING: "manifest-v2-push-local-file-missing",
  METADATA_ARCHIVED_OR_TRASHED: "manifest-v2-push-metadata-archived-or-trashed",
  METADATA_MISMATCH: "manifest-v2-push-metadata-mismatch",
  METADATA_STALE: "manifest-v2-push-metadata-stale",
  MUTATION_BUDGET_EXCEEDED: "manifest-v2-push-mutation-budget-exceeded",
  PARTIAL_APPLY: "manifest-v2-push-partial-apply",
  PATH_COLLISION: "manifest-v2-push-path-collision",
  PREFLIGHT_FAILED: "manifest-v2-push-preflight-failed",
  REFRESH_SIDECARS_REQUIRES_APPLY: "manifest-v2-push-refresh-sidecars-requires-apply",
  REMOTE_PREFLIGHT_FAILED: "manifest-v2-push-remote-preflight-failed",
  REVIEW_OUTPUT_FAILED: "manifest-v2-push-review-output-failed",
  SIDECAR_MALFORMED: "manifest-v2-push-sidecar-malformed",
  SIDECAR_MISSING: "manifest-v2-push-sidecar-missing",
  SIDECAR_REFRESH_PREFLIGHT_FAILED: "manifest-v2-push-sidecar-refresh-preflight-failed",
  SIDECAR_REFRESH_WRITE_FAILED: "manifest-v2-push-sidecar-refresh-write-failed",
  SIDECAR_STALE_AFTER_APPLY: "manifest-v2-push-sidecar-stale-after-apply",
});

export const MANIFEST_V2_CHECK_DIAGNOSTIC_CODES = Object.freeze({
  LOCAL_FILE_FAILED: "manifest-v2-check-local-file-failed",
  PREFLIGHT_FAILED: "manifest-v2-check-preflight-failed",
  REMOTE_FAILED: "manifest-v2-check-remote-failed",
  REVIEW_OUTPUT_FAILED: "manifest-v2-check-review-output-failed",
});

export const MANIFEST_V2_PULL_DIAGNOSTIC_CODES = Object.freeze({
  LOCAL_FILE_FAILED: "manifest-v2-pull-local-file-failed",
  PATH_COLLISION: "manifest-v2-pull-path-collision",
  PREFLIGHT_FAILED: "manifest-v2-pull-preflight-failed",
  REMOTE_FAILED: "manifest-v2-pull-remote-failed",
  REVIEW_OUTPUT_FAILED: "manifest-v2-pull-review-output-failed",
  WRITE_FAILED: "manifest-v2-pull-write-failed",
});

const SENSITIVE_STRING_PATTERNS = Object.freeze([
  /\bntn_[A-Za-z0-9_=-]+\b/g,
  /\b(secret|token|password)\s*[:=]\s*[^,\s"'}]+/gi,
]);

const DEFAULT_RECOVERY_BY_CODE = Object.freeze({
  [MANIFEST_V2_CHECK_DIAGNOSTIC_CODES.LOCAL_FILE_FAILED]: {
    safeNextCommand: "sync check",
    recoveryAction: "Resolve local file access before rerunning sync check.",
  },
  [MANIFEST_V2_CHECK_DIAGNOSTIC_CODES.PREFLIGHT_FAILED]: {
    safeNextCommand: "sync check",
    recoveryAction: "Resolve the preflight failure before rerunning sync check.",
  },
  [MANIFEST_V2_CHECK_DIAGNOSTIC_CODES.REMOTE_FAILED]: {
    safeNextCommand: "sync check",
    recoveryAction: "Verify the remote Notion target is readable before rerunning sync check.",
  },
  [MANIFEST_V2_CHECK_DIAGNOSTIC_CODES.REVIEW_OUTPUT_FAILED]: {
    safeNextCommand: "sync check --review-output <dir>",
    recoveryAction: "Choose a writable review output directory, or rerun without review output.",
  },
  [MANIFEST_V2_PULL_DIAGNOSTIC_CODES.LOCAL_FILE_FAILED]: {
    safeNextCommand: "sync pull",
    recoveryAction: "Resolve local file access before rerunning sync pull.",
  },
  [MANIFEST_V2_PULL_DIAGNOSTIC_CODES.PATH_COLLISION]: {
    safeNextCommand: "sync check",
    recoveryAction: "Fix manifest output and sidecar paths so each managed path is unique before rerunning sync pull.",
  },
  [MANIFEST_V2_PULL_DIAGNOSTIC_CODES.PREFLIGHT_FAILED]: {
    safeNextCommand: "sync check",
    recoveryAction: "Resolve the preflight failure before rerunning sync pull.",
  },
  [MANIFEST_V2_PULL_DIAGNOSTIC_CODES.REMOTE_FAILED]: {
    safeNextCommand: "sync check",
    recoveryAction: "Verify the remote Notion target is readable before rerunning sync pull.",
  },
  [MANIFEST_V2_PULL_DIAGNOSTIC_CODES.REVIEW_OUTPUT_FAILED]: {
    safeNextCommand: "sync pull --review-output <dir>",
    recoveryAction: "Choose a writable review output directory, or rerun without review output.",
  },
  [MANIFEST_V2_PULL_DIAGNOSTIC_CODES.WRITE_FAILED]: {
    safeNextCommand: "sync pull --apply",
    recoveryAction: "Partial local writes may exist. Rerun sync pull --apply after fixing filesystem access.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.ADAPTER_CONTRACT]: {
    safeNextCommand: "sync check",
    recoveryAction: "Fix the manifest v2 sync adapter contract, then rerun sync push.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.LOCAL_FILE_MISSING]: {
    safeNextCommand: "sync pull --apply",
    recoveryAction: "Pull the managed file before retrying sync push.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.METADATA_ARCHIVED_OR_TRASHED]: {
    safeNextCommand: "sync pull --apply",
    recoveryAction: "Restore or replace the Notion target, then pull fresh sidecars before retrying.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.METADATA_MISMATCH]: {
    safeNextCommand: "sync pull --apply",
    recoveryAction: "Refresh sidecars from the current Notion target before retrying.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.METADATA_STALE]: {
    safeNextCommand: "sync pull --apply",
    recoveryAction: "Pull fresh sidecars to pick up the current Notion last_edited_time before retrying.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.MUTATION_BUDGET_EXCEEDED]: {
    safeNextCommand: "sync push --apply --max-mutations <n|all>",
    recoveryAction: "Review the changed entries, then rerun with an explicit mutation budget if the mutations are intended.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.PARTIAL_APPLY]: {
    safeNextCommand: "sync pull --apply",
    recoveryAction: "No rollback was attempted. Pull fresh files and sidecars before retrying.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.PATH_COLLISION]: {
    safeNextCommand: "sync check",
    recoveryAction: "Fix the manifest file and sidecar paths so each managed path is unique.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.PREFLIGHT_FAILED]: {
    safeNextCommand: "sync check",
    recoveryAction: "Resolve the preflight failure before retrying sync push.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.REFRESH_SIDECARS_REQUIRES_APPLY]: {
    safeNextCommand: "sync push --apply --refresh-sidecars",
    recoveryAction: "Rerun with --apply, or omit --refresh-sidecars for preview.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.REMOTE_PREFLIGHT_FAILED]: {
    safeNextCommand: "sync check",
    recoveryAction: "Verify the remote Notion target is readable before retrying sync push.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.REVIEW_OUTPUT_FAILED]: {
    safeNextCommand: "sync push --review-output <dir>",
    recoveryAction: "Choose a writable review output directory, or rerun without review output.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_MALFORMED]: {
    safeNextCommand: "sync pull --apply",
    recoveryAction: "Regenerate the metadata sidecar from Notion before retrying.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_MISSING]: {
    safeNextCommand: "sync pull --apply",
    recoveryAction: "Create the metadata sidecar by pulling before retrying sync push.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_REFRESH_PREFLIGHT_FAILED]: {
    safeNextCommand: "sync pull --apply",
    recoveryAction: "No sidecars were written. Pull fresh files and sidecars, or resolve the refresh failure and retry with --refresh-sidecars.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_REFRESH_WRITE_FAILED]: {
    safeNextCommand: "sync pull --apply",
    recoveryAction: "Some sidecars may have been written. Pull fresh files and sidecars before retrying.",
  },
  [MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_STALE_AFTER_APPLY]: {
    safeNextCommand: "sync pull --apply",
    recoveryAction: "Refresh sidecars before the next push, or use sync push --apply --refresh-sidecars next time.",
  },
});

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function redactString(value) {
  return SENSITIVE_STRING_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, (match, label) => (
      typeof label === "string" ? `${label}: [redacted]` : "[redacted]"
    )),
    value,
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanObject(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanObject(item)).filter((item) => item !== undefined);
  }

  if (!isPlainObject(value)) {
    if (value === undefined) {
      return undefined;
    }

    return typeof value === "string" ? redactString(value) : value;
  }

  const cleaned = {};
  for (const [key, childValue] of Object.entries(value)) {
    if (typeof childValue === "function") {
      continue;
    }

    const cleanedValue = cleanObject(childValue);
    if (cleanedValue !== undefined) {
      cleaned[key] = cleanedValue;
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export function manifestV2PushDiagnosticEntry(entry, descriptor = {}) {
  return manifestV2DiagnosticEntry(entry, descriptor);
}

export function manifestV2DiagnosticEntry(entry, descriptor = {}) {
  if (!entry || typeof entry !== "object") {
    return undefined;
  }

  return cleanObject({
    kind: entry.kind,
    target: entry.target || entry.pagePath || entry.docPath || entry.title || "",
    file: entry.file,
    metadataPath: descriptor.metadataPath,
  });
}

export function buildManifestV2Diagnostic({
  code,
  command,
  entry,
  descriptor,
  message,
  recoveryAction,
  safeNextCommand,
  severity = "error",
  state,
  targetPath,
}) {
  if (typeof code !== "string" || code.trim() === "") {
    throw new Error("Manifest v2 diagnostic code must be a non-empty string.");
  }

  const defaults = DEFAULT_RECOVERY_BY_CODE[code] || {};
  const normalizedMessage = typeof message === "string" && message.trim() !== ""
    ? message
    : code;

  return cleanObject({
    code,
    severity,
    message: normalizedMessage,
    command,
    entry: manifestV2DiagnosticEntry(entry || descriptor?.entry, descriptor),
    targetPath,
    safeNextCommand: safeNextCommand || defaults.safeNextCommand || "sync check",
    recoveryAction: recoveryAction || defaults.recoveryAction || "Resolve the diagnostic before retrying.",
    state,
  });
}

export function buildManifestV2PushDiagnostic(options) {
  return buildManifestV2Diagnostic({
    ...options,
    command: "sync-push",
  });
}

export function buildManifestV2CheckRemoteFailureDiagnostic({ descriptor, entry, error, state, targetPath }) {
  return buildManifestV2Diagnostic({
    code: MANIFEST_V2_CHECK_DIAGNOSTIC_CODES.REMOTE_FAILED,
    command: "sync-check",
    descriptor,
    entry,
    message: toErrorMessage(error),
    state: {
      phase: "remote-read",
      ...state,
    },
    targetPath,
  });
}

export function buildManifestV2PullRemoteFailureDiagnostic({ descriptor, entry, error, state, targetPath }) {
  return buildManifestV2Diagnostic({
    code: MANIFEST_V2_PULL_DIAGNOSTIC_CODES.REMOTE_FAILED,
    command: "sync-pull",
    descriptor,
    entry,
    message: toErrorMessage(error),
    state: {
      phase: "remote-read",
      ...state,
    },
    targetPath,
  });
}

export function buildManifestV2PullCollisionDiagnostic({ descriptor, entry, error, message, state, targetPath }) {
  return buildManifestV2Diagnostic({
    code: MANIFEST_V2_PULL_DIAGNOSTIC_CODES.PATH_COLLISION,
    command: "sync-pull",
    descriptor,
    entry,
    message: message || toErrorMessage(error),
    state: {
      phase: "path-collision",
      ...state,
    },
    targetPath,
  });
}

export function buildManifestV2PullWriteFailureDiagnostic({
  descriptor,
  entry,
  error,
  partialWrites,
  state,
  targetPath,
}) {
  return buildManifestV2Diagnostic({
    code: MANIFEST_V2_PULL_DIAGNOSTIC_CODES.WRITE_FAILED,
    command: "sync-pull",
    descriptor,
    entry,
    message: toErrorMessage(error),
    state: {
      phase: "write",
      partialWrites,
      ...state,
    },
    targetPath,
  });
}

export function buildManifestV2LocalFileFailureDiagnostic({
  command = "sync-check",
  descriptor,
  entry,
  error,
  state,
  targetPath,
}) {
  const isPull = command === "sync-pull";

  return buildManifestV2Diagnostic({
    code: isPull
      ? MANIFEST_V2_PULL_DIAGNOSTIC_CODES.LOCAL_FILE_FAILED
      : MANIFEST_V2_CHECK_DIAGNOSTIC_CODES.LOCAL_FILE_FAILED,
    command,
    descriptor,
    entry,
    message: toErrorMessage(error),
    state: {
      phase: "local-file",
      ...state,
    },
    targetPath,
  });
}

export function buildManifestV2ReviewOutputFailureDiagnostic({
  command = "sync-check",
  error,
  state,
}) {
  const isPull = command === "sync-pull";
  const isPush = command === "sync-push";

  return buildManifestV2Diagnostic({
    code: isPush
      ? MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.REVIEW_OUTPUT_FAILED
      : isPull
        ? MANIFEST_V2_PULL_DIAGNOSTIC_CODES.REVIEW_OUTPUT_FAILED
        : MANIFEST_V2_CHECK_DIAGNOSTIC_CODES.REVIEW_OUTPUT_FAILED,
    command,
    message: toErrorMessage(error),
    state: {
      phase: "review-output",
      ...state,
    },
  });
}

export function buildManifestV2PreflightFailureDiagnostic({
  command = "sync-check",
  descriptor,
  entry,
  error,
  state,
  targetPath,
}) {
  const isPull = command === "sync-pull";

  return buildManifestV2Diagnostic({
    code: isPull
      ? MANIFEST_V2_PULL_DIAGNOSTIC_CODES.PREFLIGHT_FAILED
      : MANIFEST_V2_CHECK_DIAGNOSTIC_CODES.PREFLIGHT_FAILED,
    command,
    descriptor,
    entry,
    message: toErrorMessage(error),
    state: {
      phase: "preflight",
      ...state,
    },
    targetPath,
  });
}

function codeForPreflightFailure(message) {
  if (/sync push --refresh-sidecars requires --apply/i.test(message)) {
    return MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.REFRESH_SIDECARS_REQUIRES_APPLY;
  }

  if (/Metadata sidecar ".+" is required/i.test(message)) {
    return MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_MISSING;
  }

  if (
    /Metadata sidecar ".+" is not valid JSON/i.test(message)
    || /Metadata sidecar must/i.test(message)
    || /Metadata field ".+" must/i.test(message)
    || /Metadata includes unsupported field/i.test(message)
  ) {
    return MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_MALFORMED;
  }

  if (/Stale metadata/i.test(message)) {
    return MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.METADATA_STALE;
  }

  if (/archived or in trash/i.test(message)) {
    return MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.METADATA_ARCHIVED_OR_TRASHED;
  }

  if (/(targetPath|pageId|page id|projectId|workspaceName|commandFamily) mismatch/i.test(message)) {
    return MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.METADATA_MISMATCH;
  }

  if (/Local sync file ".+" does not exist/i.test(message)) {
    return MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.LOCAL_FILE_MISSING;
  }

  if (/path collision/i.test(message)) {
    return MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.PATH_COLLISION;
  }

  if (/readRemote|liveMetadata|could not be read|freshness validation/i.test(message)) {
    return MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.REMOTE_PREFLIGHT_FAILED;
  }

  if (/missing (pushLocal|readRemote)|Unsupported manifest v2 sync push kind|must return/i.test(message)) {
    return MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.ADAPTER_CONTRACT;
  }

  return MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.PREFLIGHT_FAILED;
}

export function buildManifestV2PushFailureDiagnostic({
  descriptor,
  entry,
  error,
  phase = "preflight",
  state,
  targetPath,
}) {
  const message = toErrorMessage(error);
  const phaseCode = phase === "partial-apply"
    ? MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.PARTIAL_APPLY
    : phase === "sidecar-refresh-preflight"
      ? MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_REFRESH_PREFLIGHT_FAILED
      : phase === "sidecar-refresh-write"
        ? MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_REFRESH_WRITE_FAILED
        : codeForPreflightFailure(message);

  return buildManifestV2PushDiagnostic({
    code: phaseCode,
    descriptor,
    entry,
    message,
    state: {
      phase,
      ...state,
    },
    targetPath,
  });
}

export function buildManifestV2PushBudgetDiagnostic({ message, mutationBudget }) {
  return buildManifestV2PushDiagnostic({
    code: MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.MUTATION_BUDGET_EXCEEDED,
    message,
    state: {
      phase: "mutation-budget",
      maxMutations: mutationBudget?.maxMutations,
      changedCount: mutationBudget?.changedCount,
      withinBudget: mutationBudget?.withinBudget,
    },
  });
}

export function buildManifestV2PushWarningDiagnostic({ code, message, state }) {
  return buildManifestV2PushDiagnostic({
    code,
    message,
    severity: "warning",
    state,
  });
}
