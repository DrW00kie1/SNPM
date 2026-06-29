import { writeManifestV2PreviewReviewArtifacts } from "../commands/sync-review-output.mjs";
import { buildManifestV2ReviewOutputFailureDiagnostic } from "../notion/manifest-sync-diagnostics.mjs";
import {
  buildOperationalExplanation,
  buildOperationalPayload,
  writeReviewArtifacts,
} from "../commands/operational-output.mjs";
import { redactSecretResultForOutput } from "../commands/secret-output-safety.mjs";
import { SECRET_EXEC_LEAK_WARNING } from "../commands/secret-exec.mjs";

export function writeStructuredOutput(payload, { stderr = false } = {}) {
  const stream = stderr ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export function buildSyncPayload(result, {
  command,
  failOnDrift = false,
  reviewOutputDir = null,
} = {}) {
  const basePayload = {
    ok: result.failures.length === 0 && (!failOnDrift || (result.driftCount || 0) === 0),
    ...result,
  };

  if (!reviewOutputDir) {
    return basePayload;
  }

  try {
    return {
      ...basePayload,
      reviewOutput: writeManifestV2PreviewReviewArtifacts({
        result,
        reviewOutputDir,
      }),
    };
  } catch (error) {
    const diagnostic = buildManifestV2ReviewOutputFailureDiagnostic({
      command,
      error,
      state: {
        reviewOutputDir,
      },
    });
    return {
      ...basePayload,
      ok: false,
      failures: [
        ...(Array.isArray(result.failures) ? result.failures : []),
        `Review output failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
      diagnostics: [
        ...(Array.isArray(result.diagnostics) ? result.diagnostics : []),
        diagnostic,
      ],
      reviewOutput: {
        written: false,
        failure: diagnostic.message,
      },
    };
  }
}

export function buildSimpleMutationPayload({ command, result, extra = {} }) {
  return {
    ok: true,
    command,
    applied: result.applied,
    hasDiff: result.hasDiff,
    targetPath: result.targetPath,
    authMode: result.authMode,
    ...("pageId" in result ? { pageId: result.pageId } : {}),
    ...("databaseId" in result ? { databaseId: result.databaseId } : {}),
    ...("dataSourceId" in result ? { dataSourceId: result.dataSourceId } : {}),
    ...("timestamp" in result ? { timestamp: result.timestamp } : {}),
    ...extra,
    ...(result.journal ? { journal: result.journal } : {}),
    ...(Array.isArray(result.warnings) && result.warnings.length > 0 ? { warnings: result.warnings } : {}),
  };
}

export function buildSecretGeneratePayload({ command, result }) {
  return {
    ok: true,
    command,
    applied: result.applied,
    ...(result.mode ? { mode: result.mode } : {}),
    ...(typeof result.generatorWillRun === "boolean" ? { generatorWillRun: result.generatorWillRun } : {}),
    ...(result.targetPath ? { targetPath: result.targetPath } : {}),
    ...(result.authMode ? { authMode: result.authMode } : {}),
    ...("pageId" in result ? { pageId: result.pageId } : {}),
    ...("projectId" in result ? { projectId: result.projectId } : {}),
    ...(result.generatedSecretStored === true ? { generatedSecretStored: true } : {}),
    ...(result.redacted === true ? { redacted: true } : {}),
    ...(result.journal ? { journal: result.journal } : {}),
    ...(Array.isArray(result.warnings) && result.warnings.length > 0 ? { warnings: result.warnings } : {}),
  };
}

export function writeExecResult(result) {
  if (!result || typeof result !== "object") {
    return;
  }

  if (typeof result.stdout === "string" && result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }

  if (typeof result.stderr === "string" && result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  if (result.spawnError) {
    process.stderr.write(`SNPM child process failed: ${result.spawnError}\n`);
  }

  if (result.leakDetected) {
    process.stderr.write(`${SECRET_EXEC_LEAK_WARNING}\n`);
  }

  const exitCode = Number.isInteger(result.exitCode)
    ? result.exitCode
    : Number.isInteger(result.status)
      ? result.status
      : result.ok === false
        ? 1
        : undefined;

  if (exitCode !== undefined) {
    process.exitCode = exitCode;
  }
}

export function printDiff(diff) {
  if (diff) {
    console.log(diff.trimEnd());
    return;
  }

  console.log("No body changes.");
}

export function buildOperationalResponse({
  command,
  surface,
  result,
  explain = false,
  reviewOutput = null,
}) {
  const outputResult = redactSecretResultForOutput(result, { surface });
  const explanation = buildOperationalExplanation({
    surface,
    targetPath: outputResult.targetPath,
    authMode: outputResult.authMode,
    authScope: outputResult.authScope,
    managedState: outputResult.managedState,
    preserveChildren: outputResult.preserveChildren,
    normalizationsApplied: outputResult.normalizationsApplied || [],
    warnings: outputResult.warnings || [],
    includeDetails: explain,
  });

  const reviewArtifacts = reviewOutput
    ? writeReviewArtifacts({
      reviewOutput,
      command,
      surface,
      result: outputResult,
      explanation,
    })
    : null;

  return buildOperationalPayload({
    command,
    surface,
    result: outputResult,
    explain,
    reviewArtifacts,
    explanation,
  });
}

export function printSyncEntryResults(entries) {
  let printedAny = false;

  for (const entry of entries) {
    const target = entry.title || entry.target || entry.pagePath || entry.docPath || "(unknown target)";

    if (entry.failure) {
      console.log(`[${entry.kind}] ${target} (${entry.file})`);
      console.log(`Error: ${entry.failure}`);
      console.log("");
      printedAny = true;
      continue;
    }

    if (!entry.diff) {
      continue;
    }

    console.log(`[${entry.kind}] ${target} (${entry.file})`);
    console.log(entry.diff.trimEnd());
    console.log("");
    printedAny = true;
  }

  if (!printedAny) {
    console.log("No sync changes.");
  }
}
