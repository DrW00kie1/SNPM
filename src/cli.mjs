import { pathToFileURL } from "node:url";

import {
  capabilityJson,
  commandUsage,
  findCommandHelp,
  resolveHelpRequest,
  usage,
} from "./cli-help.mjs";
import {
  runAccessDomainAdopt,
  runAccessDomainCreate,
  runAccessDomainDiff,
  runAccessDomainEdit,
  runAccessDomainPull,
  runAccessDomainPush,
  runAccessTokenAdopt,
  runAccessTokenCreate,
  runAccessTokenDiff,
  runAccessTokenEdit,
  runAccessTokenExec,
  runAccessTokenGenerate,
  runAccessTokenPull,
  runAccessTokenPush,
  runSecretRecordAdopt,
  runSecretRecordCreate,
  runSecretRecordDiff,
  runSecretRecordEdit,
  runSecretRecordExec,
  runSecretRecordGenerate,
  runSecretRecordPull,
  runSecretRecordPush,
} from "./commands/access.mjs";
import {
  runBuildRecordCreate,
  runBuildRecordDiff,
  runBuildRecordPull,
  runBuildRecordPush,
} from "./commands/build-record.mjs";
import { runCreateProject } from "./commands/create-project.mjs";
import {
  runDocAdopt,
  runDocCreate,
  runDocDiff,
  runDocEdit,
  runDocPull,
  runDocPush,
} from "./commands/doc.mjs";
import { runDoctor, runRecommend } from "./commands/doctor.mjs";
import { runScaffoldDocs } from "./commands/scaffold-docs.mjs";
import { runPageDiff } from "./commands/page-diff.mjs";
import { runPagePull } from "./commands/page-pull.mjs";
import { runPageEdit, runPagePush } from "./commands/page-push.mjs";
import { buildOperationalExplanation, buildOperationalPayload, inferDocSurface, writeReviewArtifacts } from "./commands/operational-output.mjs";
import { RAW_SECRET_EXPORT_UNSUPPORTED_MESSAGE, redactSecretResultForOutput } from "./commands/secret-output-safety.mjs";
import { SECRET_EXEC_LEAK_WARNING } from "./commands/secret-exec.mjs";
import {
  runRunbookAdopt,
  runRunbookCreate,
  runRunbookDiff,
  runRunbookEdit,
  runRunbookPull,
  runRunbookPush,
} from "./commands/runbook.mjs";
import {
  runValidationSessionAdopt,
  runValidationSessionCreate,
  runValidationSessionDiff,
  runValidationSessionPull,
  runValidationSessionPush,
  runValidationSessionsInit,
  runValidationSessionsVerify,
} from "./commands/validation-session.mjs";
import { planChange } from "./commands/plan-change.mjs";
import { readCommandInput } from "./commands/io.mjs";
import {
  readMutationJournalEntries,
  tryRecordMutationJournalEntry,
} from "./commands/mutation-journal.mjs";
import { writeManifestV2PreviewReviewArtifacts } from "./commands/sync-review-output.mjs";
import { buildManifestV2ReviewOutputFailureDiagnostic } from "./notion/manifest-sync-diagnostics.mjs";
import { runVerifyProject } from "./commands/verify-project.mjs";
import { runVerifyWorkspaceDocs } from "./commands/verify-workspace-docs.mjs";
import { runSyncCheck, runSyncPull, runSyncPush } from "./commands/sync.mjs";
import {
  runValidationBundleApply,
  runValidationBundleLogin,
  runValidationBundlePreview,
  runValidationBundleVerify,
} from "./commands/validation-bundle.mjs";

const BOOLEAN_FLAGS = new Set(["allow-repo-secret-output", "apply", "bundle", "explain", "raw-secret-output", "refresh-sidecars", "stdin-secret", "truth-audit"]);
const REPEATABLE_FLAGS = new Set(["entry"]);
const SECRET_EXEC_COMMANDS = new Set([
  "access-token exec",
  "access-token-exec",
  "secret-record exec",
  "secret-record-exec",
]);
const SECRET_GENERATE_COMMANDS = new Set([
  "access-token generate",
  "access-token-generate",
  "secret-record generate",
  "secret-record-generate",
]);
const SECRET_CHILD_COMMANDS = new Set([
  ...SECRET_EXEC_COMMANDS,
  ...SECRET_GENERATE_COMMANDS,
]);
const DEPRECATED_RAW_SECRET_FLAGS = [
  "raw-secret-output",
  "allow-repo-secret-output",
];
const SECRET_ACCESS_FAMILIES = new Set(["access-token", "secret-record"]);
const SECRET_ACCESS_SUBCOMMANDS = new Set([
  "adopt",
  "create",
  "diff",
  "edit",
  "exec",
  "generate",
  "pull",
  "push",
]);
const SECRET_GENERATE_ALLOWED_OPTIONS = new Set([
  "apply",
  "cwd",
  "domain",
  "mode",
  "passthroughArgs",
  "project",
  "project-token-env",
  "title",
  "workspace",
]);
export {
  commandUsage,
  findCommandHelp,
  resolveHelpRequest,
  usage,
} from "./cli-help.mjs";

function printUsage(command = null) {
  console.log(command ? commandUsage(command) : usage());
}

function writeStructuredOutput(payload, { stderr = false } = {}) {
  const stream = stderr ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function withMutationJournal(result, { command, surface }) {
  if (!result || result.applied !== true) {
    return result;
  }

  const recorded = tryRecordMutationJournalEntry({ command, surface, result });
  if (recorded.ok) {
    return {
      ...result,
      journal: {
        path: recorded.journalPath,
      },
    };
  }

  return {
    ...result,
    warnings: [
      ...(Array.isArray(result.warnings) ? result.warnings : []),
      recorded.warning,
    ],
  };
}

function buildSyncPayload(result, {
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

export { withMutationJournal };

function finalizeMutationResult(result, { command, surface }) {
  return withMutationJournal(result, { command, surface });
}

function buildSimpleMutationPayload({ command, result, extra = {} }) {
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

function buildSecretGeneratePayload({ command, result }) {
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

function parsePositiveInteger(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("--limit must be a positive integer.");
  }
  return parsed;
}

function isSecretChildCommand(command) {
  return SECRET_CHILD_COMMANDS.has(command);
}

function formatFlagList(flags) {
  return flags.map((flag) => `--${flag}`).join(" and ");
}

function failIfDeprecatedRawSecretFlags(options) {
  const usedFlags = DEPRECATED_RAW_SECRET_FLAGS.filter((flag) => options[flag] === true);
  if (usedFlags.length === 0) {
    return;
  }

  throw new Error(`${formatFlagList(usedFlags)} ${usedFlags.length === 1 ? "is" : "are"} unsupported: ${RAW_SECRET_EXPORT_UNSUPPORTED_MESSAGE}`);
}

function requirePassthroughArgs(options, command) {
  if (!Array.isArray(options.passthroughArgs) || options.passthroughArgs.length === 0) {
    throw new Error(`Provide a child command after -- for ${command}.`);
  }

  return options.passthroughArgs;
}

function rejectUnsupportedSecretGenerateOptions(options, command) {
  const usedFlags = Object.keys(options).filter((flag) => !SECRET_GENERATE_ALLOWED_OPTIONS.has(flag));
  if (usedFlags.length === 0) {
    return;
  }

  throw new Error(`${command} does not support ${usedFlags.map((flag) => `--${flag}`).join(", ")}. Generated secret ingestion accepts only a child generator after -- and never reads raw values from local files, stdin, env vars, or output paths.`);
}

function writeExecResult(result) {
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

export function parseArgs(argv) {
  const commandParts = [];
  let index = 0;

  while (index < argv.length && !argv[index].startsWith("--") && commandParts.length < 2) {
    commandParts.push(argv[index]);
    index += 1;
    if (isSecretChildCommand(commandParts.join(" "))) {
      break;
    }
  }

  const command = commandParts.join(" ");
  if (SECRET_ACCESS_FAMILIES.has(commandParts[0]) && commandParts.length > 1 && !SECRET_ACCESS_SUBCOMMANDS.has(commandParts[1])) {
    throw new Error(`Unexpected ${commandParts[0]} subcommand. Use ${commandParts[0]} --help for supported commands.`);
  }

  const rest = argv.slice(index);
  const options = {};
  const passthroughIndex = rest.indexOf("--");
  const optionTokens = passthroughIndex === -1 ? rest : rest.slice(0, passthroughIndex);

  if (passthroughIndex !== -1) {
    if (!isSecretChildCommand(command)) {
      throw new Error("The literal -- child-command delimiter is only supported for secret-record exec/generate and access-token exec/generate.");
    }

    options.passthroughArgs = rest.slice(passthroughIndex + 1);
  }

  for (let i = 0; i < optionTokens.length; i += 1) {
    const token = optionTokens[i];
    if (!token.startsWith("--")) {
      if (isSecretChildCommand(command)) {
        throw new Error(`Unexpected argument before -- for ${command}. Raw secret values cannot be provided as positional arguments.`);
      }
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = optionTokens[i + 1];

    if ((!value || value.startsWith("--")) && BOOLEAN_FLAGS.has(key)) {
      options[key] = true;
      continue;
    }

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    if (REPEATABLE_FLAGS.has(key)) {
      options[key] = [...(Array.isArray(options[key]) ? options[key] : []), value];
    } else {
      options[key] = value;
    }
    i += 1;
  }

  return { command, options };
}

function parseMaxMutationsOption(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === "all") {
    return "all";
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== value) {
    throw new Error("--max-mutations must be a positive integer or \"all\".");
  }

  return parsed;
}

function parseStaleAfterDaysOption(value) {
  if (value === undefined) {
    return 30;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== value) {
    throw new Error("--stale-after-days must be a positive integer.");
  }

  return parsed;
}

function requireOption(options, name, message) {
  const value = options[name];
  if (!value || typeof value !== "string") {
    throw new Error(message);
  }
  return value;
}

function printDiff(diff) {
  if (diff) {
    console.log(diff.trimEnd());
    return;
  }

  console.log("No body changes.");
}

function buildOperationalResponse({
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

function printSyncEntryResults(entries) {
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

async function main() {
  const argv = process.argv.slice(2);
  const helpRequest = resolveHelpRequest(argv);
  if (helpRequest) {
    if (helpRequest.type === "unknown") {
      console.error(`Unknown command: ${helpRequest.command}`);
      printUsage();
      process.exitCode = 1;
      return;
    }

    printUsage(helpRequest.command);
    return;
  }

  const { command, options } = parseArgs(argv);
  failIfDeprecatedRawSecretFlags(options);
  if (!command) {
    printUsage();
    return;
  }

  if (command === "capabilities") {
    process.stdout.write(capabilityJson());
    return;
  }

  const workspaceName = options.workspace || "infrastructure-hq";

  if (command === "journal list" || command === "journal-list") {
    console.log(JSON.stringify({
      ok: true,
      command: "journal-list",
      entries: readMutationJournalEntries({
        limit: parsePositiveInteger(options.limit, 20),
      }),
    }, null, 2));
    return;
  }

  if (command === "plan-change") {
    const rawInput = await readCommandInput(requireOption(options, "targets-file", "Provide --targets-file <path|->."));
    let parsedInput;
    try {
      parsedInput = JSON.parse(rawInput);
    } catch (error) {
      throw new Error(`plan-change targets file is not valid JSON: ${error.message}`);
    }

    const result = await planChange({
      ...parsedInput,
      ...(options.project ? { projectName: options.project } : {}),
      ...(options["project-token-env"] ? { projectTokenEnv: options["project-token-env"] } : {}),
      ...(workspaceName ? { workspaceName } : {}),
    }, {
      recommendImpl: runRecommend,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "scaffold-docs") {
    if (options.apply === true) {
      throw new Error("scaffold-docs does not support --apply. Use --output-dir to write local drafts, then run the generated doc-create or page-push commands explicitly.");
    }

    const result = await runScaffoldDocs({
      outputDir: options["output-dir"],
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    console.log(JSON.stringify({
      ok: result.ok,
      ...result,
    }, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "create-project" || command === "create") {
    const projectName = requireOption(options, "name", 'Provide --name "Project Name".');
    const result = await runCreateProject({ projectName, workspaceName });
    console.log(JSON.stringify({
      ok: true,
      command: "create-project",
      ...result,
      nextStep: "Create and share the project Notion integration in the UI, run scaffold-docs to preview starter docs when needed, then run verify-project with the project token env var.",
    }, null, 2));
    return;
  }

  if (command === "doctor") {
    const truthAudit = options["truth-audit"] === true;
    const staleAfterDays = truthAudit || options["stale-after-days"] !== undefined
      ? parseStaleAfterDaysOption(options["stale-after-days"])
      : undefined;
    const result = await runDoctor({
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      ...(truthAudit ? { truthAudit, staleAfterDays } : {}),
      workspaceName,
    });
    console.log(JSON.stringify({
      ok: result.issues.length === 0,
      command,
      ...result,
    }, null, 2));
    if (result.issues.length > 0) {
      process.exitCode = 1;
      return;
    }
    return;
  }

  if (command === "recommend") {
    if (options.intent) {
      const intent = requireOption(options, "intent", "Provide --intent <planning|runbook|secret|token|generated-secret|generated-token|project-doc|template-doc|workspace-doc|implementation-note|design-spec|task-breakdown|investigation|repo-doc|generated-output>.");
      const result = await runRecommend({
        projectName: ["template-doc", "workspace-doc"].includes(intent)
          ? options.project
          : requireOption(options, "project", 'Provide --project "Project Name".'),
        projectTokenEnv: options["project-token-env"],
        intent,
        pagePath: intent === "planning"
          ? requireOption(options, "page", 'Provide --page "Roadmap" or --page "Planning > Roadmap".')
          : undefined,
        docPath: intent === "project-doc" || intent === "template-doc" || intent === "workspace-doc"
          ? requireOption(options, "path", 'Provide --path "<doc path>".')
          : undefined,
        title: intent === "runbook" || intent === "secret" || intent === "token" || intent === "generated-secret" || intent === "generated-token"
          ? requireOption(options, "title", 'Provide --title "Title".')
          : undefined,
        domainTitle: intent === "secret" || intent === "token" || intent === "generated-secret" || intent === "generated-token"
          ? requireOption(options, "domain", 'Provide --domain "Access Domain Title".')
          : undefined,
        repoPath: ["implementation-note", "design-spec", "task-breakdown", "investigation", "repo-doc", "generated-output"].includes(intent)
          ? requireOption(options, "repo-path", "Provide --repo-path <path>.")
          : undefined,
        workspaceName,
      });
      console.log(JSON.stringify({
        command,
        ...result,
      }, null, 2));
      if (!result.ok) {
        process.exitCode = 1;
      }
      return;
    }

    const result = await runDoctor({
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    console.log(JSON.stringify({
      ok: result.issues.length === 0,
      command,
      ...result,
    }, null, 2));
    if (result.issues.length > 0) {
      process.exitCode = 1;
      return;
    }
    return;
  }

  if (command === "verify-project" || command === "verify") {
    const projectName = requireOption(options, "name", 'Provide --name "Project Name".');
    const result = await runVerifyProject({
      projectName,
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    console.log(JSON.stringify({
      ok: result.failures.length === 0,
      command: "verify-project",
      projectId: result.projectId,
      failures: result.failures,
    }, null, 2));
    if (result.failures.length > 0) {
      process.exitCode = 1;
      return;
    }
    return;
  }

  if (command === "verify-workspace-docs") {
    const result = await runVerifyWorkspaceDocs({ workspaceName });
    console.log(JSON.stringify({
      ok: result.failures.length === 0,
      command: "verify-workspace-docs",
      ...result,
    }, null, 2));
    if (result.failures.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "doc create" || command === "doc-create") {
    const result = finalizeMutationResult(await runDocCreate({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      docPath: requireOption(options, "path", 'Provide --path "<doc path>".'),
      projectName: options.project,
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    }), {
      command: "doc-create",
      surface: inferDocSurface({ projectName: options.project, docPath: options.path }),
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({ command: "doc-create", result }), null, 2));
    return;
  }

  if (command === "doc adopt" || command === "doc-adopt") {
    const result = finalizeMutationResult(await runDocAdopt({
      apply: options.apply === true,
      docPath: requireOption(options, "path", 'Provide --path "<doc path>".'),
      projectName: options.project,
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    }), {
      command: "doc-adopt",
      surface: inferDocSurface({ projectName: options.project, docPath: options.path }),
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({ command: "doc-adopt", result }), null, 2));
    return;
  }

  if (command === "doc pull" || command === "doc-pull") {
    const result = await runDocPull({
      outputPath: requireOption(options, "output", "Provide --output <file|->."),
      metadataOutputPath: options["metadata-output"],
      docPath: requireOption(options, "path", 'Provide --path "<doc path>".'),
      projectName: options.project,
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    writeStructuredOutput({
      ok: true,
      command: "doc-pull",
      ...result,
    }, { stderr: result.wroteToStdout === true });
    return;
  }

  if (command === "doc diff" || command === "doc-diff") {
    const result = await runDocDiff({
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      docPath: requireOption(options, "path", 'Provide --path "<doc path>".'),
      projectName: options.project,
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "doc-diff",
      surface: inferDocSurface({ projectName: options.project, docPath: options.path }),
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "doc push" || command === "doc-push") {
    const result = finalizeMutationResult(await runDocPush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      metadataPath: options.metadata,
      docPath: requireOption(options, "path", 'Provide --path "<doc path>".'),
      projectName: options.project,
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    }), {
      command: "doc-push",
      surface: inferDocSurface({ projectName: options.project, docPath: options.path }),
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "doc-push",
      surface: inferDocSurface({ projectName: options.project, docPath: options.path }),
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "doc edit" || command === "doc-edit") {
    const result = finalizeMutationResult(await runDocEdit({
      apply: options.apply === true,
      docPath: requireOption(options, "path", 'Provide --path "<doc path>".'),
      projectName: options.project,
      projectTokenEnv: options["project-token-env"],
      workspaceName,
      editorCommand: process.env.EDITOR,
    }), {
      command: "doc-edit",
      surface: inferDocSurface({ projectName: options.project, docPath: options.path }),
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "doc-edit",
      surface: inferDocSurface({ projectName: options.project, docPath: options.path }),
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "page pull" || command === "page-pull") {
    const result = await runPagePull({
      outputPath: requireOption(options, "output", "Provide --output <file|->."),
      metadataOutputPath: options["metadata-output"],
      pagePath: requireOption(options, "page", 'Provide --page "Planning > <Page Name>".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    writeStructuredOutput({
      ok: true,
      command: "page-pull",
      ...result,
    }, { stderr: result.wroteToStdout === true });
    return;
  }

  if (command === "page diff" || command === "page-diff") {
    const result = await runPageDiff({
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      pagePath: requireOption(options, "page", 'Provide --page "Planning > <Page Name>".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "page-diff",
      surface: "planning",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "page push" || command === "page-push") {
    const result = finalizeMutationResult(await runPagePush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      metadataPath: options.metadata,
      pagePath: requireOption(options, "page", 'Provide --page "Planning > <Page Name>".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    }), { command: "page-push", surface: "planning" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "page-push",
      surface: "planning",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "page edit" || command === "page-edit") {
    const result = finalizeMutationResult(await runPageEdit({
      apply: options.apply === true,
      pagePath: requireOption(options, "page", 'Provide --page "Planning > <Page Name>".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
      editorCommand: process.env.EDITOR,
    }), { command: "page-edit", surface: "planning" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "page-edit",
      surface: "planning",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "access-domain create" || command === "access-domain-create") {
    const result = finalizeMutationResult(await runAccessDomainCreate({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Access Domain Title".'),
      workspaceName,
    }), { command: "access-domain-create", surface: "access-domain" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({ command: "access-domain-create", result }), null, 2));
    return;
  }

  if (command === "access-domain adopt" || command === "access-domain-adopt") {
    const result = finalizeMutationResult(await runAccessDomainAdopt({
      apply: options.apply === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Access Domain Title".'),
      workspaceName,
    }), { command: "access-domain-adopt", surface: "access-domain" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({ command: "access-domain-adopt", result }), null, 2));
    return;
  }

  if (command === "access-domain pull" || command === "access-domain-pull") {
    const result = await runAccessDomainPull({
      outputPath: requireOption(options, "output", "Provide --output <file|->."),
      metadataOutputPath: options["metadata-output"],
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Access Domain Title".'),
      workspaceName,
    });
    writeStructuredOutput({
      ok: true,
      command: "access-domain-pull",
      ...result,
    }, { stderr: result.wroteToStdout === true });
    return;
  }

  if (command === "access-domain diff" || command === "access-domain-diff") {
    const result = await runAccessDomainDiff({
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Access Domain Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "access-domain-diff",
      surface: "access-domain",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "access-domain push" || command === "access-domain-push") {
    const result = finalizeMutationResult(await runAccessDomainPush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      metadataPath: options.metadata,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Access Domain Title".'),
      workspaceName,
    }), { command: "access-domain-push", surface: "access-domain" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "access-domain-push",
      surface: "access-domain",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "access-domain edit" || command === "access-domain-edit") {
    const result = finalizeMutationResult(await runAccessDomainEdit({
      apply: options.apply === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Access Domain Title".'),
      workspaceName,
      editorCommand: process.env.EDITOR,
    }), { command: "access-domain-edit", surface: "access-domain" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "access-domain-edit",
      surface: "access-domain",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "secret-record create" || command === "secret-record-create") {
    const result = finalizeMutationResult(await runSecretRecordCreate({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: options.file,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    }), { command: "secret-record-create", surface: "secret-record" });
    const outputResult = redactSecretResultForOutput(result, { surface: "secret-record" });
    printDiff(outputResult.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({ command: "secret-record-create", result: outputResult }), null, 2));
    return;
  }

  if (command === "secret-record adopt" || command === "secret-record-adopt") {
    const result = finalizeMutationResult(await runSecretRecordAdopt({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    }), { command: "secret-record-adopt", surface: "secret-record" });
    const outputResult = redactSecretResultForOutput(result, { surface: "secret-record" });
    printDiff(outputResult.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({ command: "secret-record-adopt", result: outputResult }), null, 2));
    return;
  }

  if (command === "secret-record generate" || command === "secret-record-generate") {
    rejectUnsupportedSecretGenerateOptions(options, "secret-record generate");
    const passthroughArgs = requirePassthroughArgs(options, "secret-record generate");
    const result = finalizeMutationResult(await runSecretRecordGenerate({
      apply: options.apply === true,
      childArgs: passthroughArgs,
      cwd: options.cwd,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      mode: requireOption(options, "mode", "Provide --mode <create|update>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    }), { command: "secret-record-generate", surface: "secret-record" });
    const outputResult = redactSecretResultForOutput(result, { surface: "secret-record" });
    console.log(JSON.stringify(buildSecretGeneratePayload({ command: "secret-record-generate", result: outputResult }), null, 2));
    return;
  }

  if (command === "secret-record exec" || command === "secret-record-exec") {
    const passthroughArgs = requirePassthroughArgs(options, "secret-record exec");
    const result = await runSecretRecordExec({
      childArgs: passthroughArgs,
      cwd: options.cwd,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      envName: options["env-name"],
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      stdinSecret: options["stdin-secret"] === true,
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    writeExecResult(result);
    return;
  }

  if (command === "secret-record pull" || command === "secret-record-pull") {
    const result = await runSecretRecordPull({
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      outputPath: requireOption(options, "output", "Provide --output <file|->."),
      metadataOutputPath: options["metadata-output"],
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      rawSecretOutput: options["raw-secret-output"] === true,
      allowRepoSecretOutput: options["allow-repo-secret-output"] === true,
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    writeStructuredOutput({
      ok: true,
      command: "secret-record-pull",
      ...result,
    }, { stderr: result.wroteToStdout === true });
    return;
  }

  if (command === "secret-record diff" || command === "secret-record-diff") {
    await runSecretRecordDiff();
    return;
  }

  if (command === "secret-record push" || command === "secret-record-push") {
    await runSecretRecordPush();
    return;
  }

  if (command === "secret-record edit" || command === "secret-record-edit") {
    await runSecretRecordEdit();
    return;
  }

  if (command === "access-token create" || command === "access-token-create") {
    const result = finalizeMutationResult(await runAccessTokenCreate({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: options.file,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    }), { command: "access-token-create", surface: "access-token" });
    const outputResult = redactSecretResultForOutput(result, { surface: "access-token" });
    printDiff(outputResult.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({ command: "access-token-create", result: outputResult }), null, 2));
    return;
  }

  if (command === "access-token adopt" || command === "access-token-adopt") {
    const result = finalizeMutationResult(await runAccessTokenAdopt({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    }), { command: "access-token-adopt", surface: "access-token" });
    const outputResult = redactSecretResultForOutput(result, { surface: "access-token" });
    printDiff(outputResult.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({ command: "access-token-adopt", result: outputResult }), null, 2));
    return;
  }

  if (command === "access-token generate" || command === "access-token-generate") {
    rejectUnsupportedSecretGenerateOptions(options, "access-token generate");
    const passthroughArgs = requirePassthroughArgs(options, "access-token generate");
    const result = finalizeMutationResult(await runAccessTokenGenerate({
      apply: options.apply === true,
      childArgs: passthroughArgs,
      cwd: options.cwd,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      mode: requireOption(options, "mode", "Provide --mode <create|update>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    }), { command: "access-token-generate", surface: "access-token" });
    const outputResult = redactSecretResultForOutput(result, { surface: "access-token" });
    console.log(JSON.stringify(buildSecretGeneratePayload({ command: "access-token-generate", result: outputResult }), null, 2));
    return;
  }

  if (command === "access-token exec" || command === "access-token-exec") {
    const passthroughArgs = requirePassthroughArgs(options, "access-token exec");
    const result = await runAccessTokenExec({
      childArgs: passthroughArgs,
      cwd: options.cwd,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      envName: options["env-name"],
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      stdinSecret: options["stdin-secret"] === true,
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    writeExecResult(result);
    return;
  }

  if (command === "access-token pull" || command === "access-token-pull") {
    const result = await runAccessTokenPull({
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      outputPath: requireOption(options, "output", "Provide --output <file|->."),
      metadataOutputPath: options["metadata-output"],
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      rawSecretOutput: options["raw-secret-output"] === true,
      allowRepoSecretOutput: options["allow-repo-secret-output"] === true,
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    writeStructuredOutput({
      ok: true,
      command: "access-token-pull",
      ...result,
    }, { stderr: result.wroteToStdout === true });
    return;
  }

  if (command === "access-token diff" || command === "access-token-diff") {
    await runAccessTokenDiff();
    return;
  }

  if (command === "access-token push" || command === "access-token-push") {
    await runAccessTokenPush();
    return;
  }

  if (command === "access-token edit" || command === "access-token-edit") {
    await runAccessTokenEdit();
    return;
  }

  if (command === "runbook create" || command === "runbook-create") {
    const result = finalizeMutationResult(await runRunbookCreate({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Runbook Title".'),
      workspaceName,
    }), { command: "runbook-create", surface: "runbooks" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({ command: "runbook-create", result }), null, 2));
    return;
  }

  if (command === "runbook adopt" || command === "runbook-adopt") {
    const result = finalizeMutationResult(await runRunbookAdopt({
      apply: options.apply === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Runbook Title".'),
      workspaceName,
    }), { command: "runbook-adopt", surface: "runbooks" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({ command: "runbook-adopt", result }), null, 2));
    return;
  }

  if (command === "runbook pull" || command === "runbook-pull") {
    const result = await runRunbookPull({
      outputPath: requireOption(options, "output", "Provide --output <file|->."),
      metadataOutputPath: options["metadata-output"],
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Runbook Title".'),
      workspaceName,
    });
    writeStructuredOutput({
      ok: true,
      command: "runbook-pull",
      ...result,
    }, { stderr: result.wroteToStdout === true });
    return;
  }

  if (command === "runbook diff" || command === "runbook-diff") {
    const result = await runRunbookDiff({
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Runbook Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "runbook-diff",
      surface: "runbooks",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "runbook push" || command === "runbook-push") {
    const result = finalizeMutationResult(await runRunbookPush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      metadataPath: options.metadata,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Runbook Title".'),
      workspaceName,
    }), { command: "runbook-push", surface: "runbooks" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "runbook-push",
      surface: "runbooks",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "runbook edit" || command === "runbook-edit") {
    const result = finalizeMutationResult(await runRunbookEdit({
      apply: options.apply === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Runbook Title".'),
      workspaceName,
      editorCommand: process.env.EDITOR,
    }), { command: "runbook-edit", surface: "runbooks" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "runbook-edit",
      surface: "runbooks",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "build-record create" || command === "build-record-create") {
    const result = finalizeMutationResult(await runBuildRecordCreate({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Build Record Title".'),
      workspaceName,
    }), { command: "build-record-create", surface: "build-record" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({
      command: "build-record-create",
      result,
      extra: {
        needsContainer: result.needsContainer,
        containerCreated: result.containerCreated,
      },
    }), null, 2));
    return;
  }

  if (command === "build-record pull" || command === "build-record-pull") {
    const result = await runBuildRecordPull({
      outputPath: requireOption(options, "output", "Provide --output <file|->."),
      metadataOutputPath: options["metadata-output"],
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Build Record Title".'),
      workspaceName,
    });
    writeStructuredOutput({
      ok: true,
      command: "build-record-pull",
      ...result,
    }, { stderr: result.wroteToStdout === true });
    return;
  }

  if (command === "build-record diff" || command === "build-record-diff") {
    const result = await runBuildRecordDiff({
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Build Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "build-record-diff",
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
    }, null, 2));
    return;
  }

  if (command === "build-record push" || command === "build-record-push") {
    const result = finalizeMutationResult(await runBuildRecordPush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      metadataPath: options.metadata,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Build Record Title".'),
      workspaceName,
    }), { command: "build-record-push", surface: "build-record" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({ command: "build-record-push", result }), null, 2));
    return;
  }

  if (command === "validation-sessions init" || command === "validation-sessions-init") {
    const result = finalizeMutationResult(await runValidationSessionsInit({
      apply: options.apply === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    }), { command: "validation-sessions-init", surface: "validation-sessions" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({
      command: "validation-sessions-init",
      result,
      extra: {
        createdDatabase: result.createdDatabase,
        nextStep: result.nextStep,
      },
    }), null, 2));
    return;
  }

  if (command === "validation-sessions verify" || command === "validation-sessions-verify") {
    const result = await runValidationSessionsVerify({
      bundle: options.bundle === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    console.log(JSON.stringify({
      ok: result.initialized && result.failures.length === 0,
      command: "validation-sessions-verify",
      targetPath: result.targetPath,
      authMode: result.authMode,
      initialized: result.initialized,
      failures: result.failures,
      rowCount: result.rowCount,
      ...(result.bundle ? {
        bundle: result.bundle,
        manualChecks: result.manualChecks,
      } : {}),
    }, null, 2));
    if (!result.initialized || result.failures.length > 0) {
      process.exitCode = 1;
      return;
    }
    return;
  }

  if (command === "validation-bundle login" || command === "validation-bundle-login") {
    const result = await runValidationBundleLogin();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "validation-bundle preview" || command === "validation-bundle-preview") {
    const result = await runValidationBundlePreview({
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "validation-bundle apply" || command === "validation-bundle-apply") {
    const bundleApplyResult = await runValidationBundleApply({
      apply: options.apply === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    const result = finalizeMutationResult({
      ...bundleApplyResult,
      applied: options.apply === true && bundleApplyResult.ok !== false,
    }, { command: "validation-bundle-apply", surface: "validation-bundle" });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "validation-bundle verify" || command === "validation-bundle-verify") {
    const result = await runValidationBundleVerify({
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "validation-session create" || command === "validation-session-create") {
    const result = finalizeMutationResult(await runValidationSessionCreate({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Session Title".'),
      workspaceName,
    }), { command: "validation-session-create", surface: "validation-session" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({
      command: "validation-session-create",
      result,
      extra: {
        nextStep: result.nextStep,
      },
    }), null, 2));
    return;
  }

  if (command === "validation-session adopt" || command === "validation-session-adopt") {
    const result = finalizeMutationResult(await runValidationSessionAdopt({
      apply: options.apply === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Session Title".'),
      workspaceName,
    }), { command: "validation-session-adopt", surface: "validation-session" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({
      command: "validation-session-adopt",
      result,
      extra: {
        nextStep: result.nextStep,
      },
    }), null, 2));
    return;
  }

  if (command === "validation-session pull" || command === "validation-session-pull") {
    const result = await runValidationSessionPull({
      outputPath: requireOption(options, "output", "Provide --output <file|->."),
      metadataOutputPath: options["metadata-output"],
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Session Title".'),
      workspaceName,
    });
    writeStructuredOutput({
      ok: true,
      command: "validation-session-pull",
      ...result,
    }, { stderr: result.wroteToStdout === true });
    return;
  }

  if (command === "validation-session diff" || command === "validation-session-diff") {
    const result = await runValidationSessionDiff({
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Session Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "validation-session-diff",
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
    }, null, 2));
    return;
  }

  if (command === "validation-session push" || command === "validation-session-push") {
    const result = finalizeMutationResult(await runValidationSessionPush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      metadataPath: options.metadata,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Session Title".'),
      workspaceName,
    }), { command: "validation-session-push", surface: "validation-session" });
    printDiff(result.diff);
    console.log(JSON.stringify(buildSimpleMutationPayload({ command: "validation-session-push", result }), null, 2));
    return;
  }

  if (command === "sync check" || command === "sync-check") {
    const result = await runSyncCheck({
      entries: options.entry,
      entriesFile: options["entries-file"],
      manifestPath: requireOption(options, "manifest", "Provide --manifest <path>."),
      projectTokenEnv: options["project-token-env"],
      reviewOutput: options["review-output"],
      workspaceOverride: options.workspace,
    });
    printSyncEntryResults(result.entries);
    const payload = buildSyncPayload(result, {
      command: "sync-check",
      failOnDrift: true,
      reviewOutputDir: options["review-output"],
    });
    console.log(JSON.stringify(payload, null, 2));
    if (payload.failures.length > 0 || result.driftCount > 0) {
      process.exitCode = 1;
      return;
    }
    return;
  }

  if (command === "sync pull" || command === "sync-pull") {
    const result = await runSyncPull({
      apply: options.apply === true,
      entries: options.entry,
      entriesFile: options["entries-file"],
      manifestPath: requireOption(options, "manifest", "Provide --manifest <path>."),
      projectTokenEnv: options["project-token-env"],
      reviewOutput: options["review-output"],
      workspaceOverride: options.workspace,
    });
    printSyncEntryResults(result.entries);
    console.log(JSON.stringify({
      ok: result.failures.length === 0,
      ...result,
    }, null, 2));
    if (result.failures.length > 0) {
      process.exitCode = 1;
      return;
    }
    return;
  }

  if (command === "sync push" || command === "sync-push") {
    const apply = options.apply === true;
    const result = await runSyncPush({
      apply,
      entries: options.entry,
      entriesFile: options["entries-file"],
      manifestPath: requireOption(options, "manifest", "Provide --manifest <path>."),
      maxMutations: parseMaxMutationsOption(options["max-mutations"]),
      projectTokenEnv: options["project-token-env"],
      refreshSidecars: options["refresh-sidecars"] === true,
      reviewOutput: options["review-output"],
      workspaceOverride: options.workspace,
    });
    printSyncEntryResults(result.entries);
    const payload = buildSyncPayload(result, {
      command: "sync-push",
      reviewOutputDir: options["review-output"] && !apply ? options["review-output"] : null,
    });
    console.log(JSON.stringify(payload, null, 2));
    if (payload.failures.length > 0) {
      process.exitCode = 1;
      return;
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
