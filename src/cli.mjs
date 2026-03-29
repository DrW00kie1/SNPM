import { pathToFileURL } from "node:url";

import {
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
  runAccessTokenPull,
  runAccessTokenPush,
  runSecretRecordAdopt,
  runSecretRecordCreate,
  runSecretRecordDiff,
  runSecretRecordEdit,
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
import { runPageDiff } from "./commands/page-diff.mjs";
import { runPagePull } from "./commands/page-pull.mjs";
import { runPageEdit, runPagePush } from "./commands/page-push.mjs";
import { buildOperationalExplanation, buildOperationalPayload, inferDocSurface, writeReviewArtifacts } from "./commands/operational-output.mjs";
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
import { runVerifyProject } from "./commands/verify-project.mjs";
import { runVerifyWorkspaceDocs } from "./commands/verify-workspace-docs.mjs";
import { runSyncCheck, runSyncPull, runSyncPush } from "./commands/sync.mjs";
import {
  runValidationBundleApply,
  runValidationBundleLogin,
  runValidationBundlePreview,
  runValidationBundleVerify,
} from "./commands/validation-bundle.mjs";

const BOOLEAN_FLAGS = new Set(["apply", "bundle", "explain"]);
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

export function parseArgs(argv) {
  const commandParts = [];
  let index = 0;

  while (index < argv.length && !argv[index].startsWith("--") && commandParts.length < 2) {
    commandParts.push(argv[index]);
    index += 1;
  }

  const command = commandParts.join(" ");
  const rest = argv.slice(index);
  const options = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = rest[i + 1];

    if ((!value || value.startsWith("--")) && BOOLEAN_FLAGS.has(key)) {
      options[key] = true;
      continue;
    }

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    options[key] = value;
    i += 1;
  }

  return { command, options };
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
  const explanation = buildOperationalExplanation({
    surface,
    targetPath: result.targetPath,
    authMode: result.authMode,
    authScope: result.authScope,
    managedState: result.managedState,
    preserveChildren: result.preserveChildren,
    normalizationsApplied: result.normalizationsApplied || [],
    warnings: result.warnings || [],
    includeDetails: explain,
  });

  const reviewArtifacts = reviewOutput
    ? writeReviewArtifacts({
      reviewOutput,
      command,
      surface,
      result,
      explanation,
    })
    : null;

  return buildOperationalPayload({
    command,
    surface,
    result,
    explain,
    reviewArtifacts,
    explanation,
  });
}

function printSyncEntryResults(entries) {
  let printedAny = false;

  for (const entry of entries) {
    if (entry.failure) {
      console.log(`[${entry.kind}] ${entry.title} (${entry.file})`);
      console.log(`Error: ${entry.failure}`);
      console.log("");
      printedAny = true;
      continue;
    }

    if (!entry.diff) {
      continue;
    }

    console.log(`[${entry.kind}] ${entry.title} (${entry.file})`);
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
  if (!command) {
    printUsage();
    return;
  }

  const workspaceName = options.workspace || "infrastructure-hq";

  if (command === "create-project" || command === "create") {
    const projectName = requireOption(options, "name", 'Provide --name "Project Name".');
    const result = await runCreateProject({ projectName, workspaceName });
    console.log(JSON.stringify({
      ok: true,
      command: "create-project",
      ...result,
      nextStep: "Create and share the project Notion integration in the UI, then run verify-project with the project token env var.",
    }, null, 2));
    return;
  }

  if (command === "doctor") {
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

  if (command === "recommend") {
    if (options.intent) {
      const intent = requireOption(options, "intent", "Provide --intent <planning|runbook|secret|token|project-doc|template-doc|workspace-doc|implementation-note|design-spec|task-breakdown|investigation|repo-doc|generated-output>.");
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
        title: intent === "runbook" || intent === "secret" || intent === "token"
          ? requireOption(options, "title", 'Provide --title "Title".')
          : undefined,
        domainTitle: intent === "secret" || intent === "token"
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
    const result = await runDocCreate({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      docPath: requireOption(options, "path", 'Provide --path "<doc path>".'),
      projectName: options.project,
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "doc-create",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "doc adopt" || command === "doc-adopt") {
    const result = await runDocAdopt({
      apply: options.apply === true,
      docPath: requireOption(options, "path", 'Provide --path "<doc path>".'),
      projectName: options.project,
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "doc-adopt",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "doc pull" || command === "doc-pull") {
    const result = await runDocPull({
      outputPath: requireOption(options, "output", "Provide --output <file|->."),
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
    const result = await runDocPush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      docPath: requireOption(options, "path", 'Provide --path "<doc path>".'),
      projectName: options.project,
      projectTokenEnv: options["project-token-env"],
      workspaceName,
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
    const result = await runDocEdit({
      apply: options.apply === true,
      docPath: requireOption(options, "path", 'Provide --path "<doc path>".'),
      projectName: options.project,
      projectTokenEnv: options["project-token-env"],
      workspaceName,
      editorCommand: process.env.EDITOR,
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
    const result = await runPagePush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      pagePath: requireOption(options, "page", 'Provide --page "Planning > <Page Name>".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
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
    const result = await runPageEdit({
      apply: options.apply === true,
      pagePath: requireOption(options, "page", 'Provide --page "Planning > <Page Name>".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
      editorCommand: process.env.EDITOR,
    });
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
    const result = await runAccessDomainCreate({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Access Domain Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "access-domain-create",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "access-domain adopt" || command === "access-domain-adopt") {
    const result = await runAccessDomainAdopt({
      apply: options.apply === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Access Domain Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "access-domain-adopt",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "access-domain pull" || command === "access-domain-pull") {
    const result = await runAccessDomainPull({
      outputPath: requireOption(options, "output", "Provide --output <file|->."),
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
    const result = await runAccessDomainPush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Access Domain Title".'),
      workspaceName,
    });
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
    const result = await runAccessDomainEdit({
      apply: options.apply === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Access Domain Title".'),
      workspaceName,
      editorCommand: process.env.EDITOR,
    });
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
    const result = await runSecretRecordCreate({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "secret-record-create",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "secret-record adopt" || command === "secret-record-adopt") {
    const result = await runSecretRecordAdopt({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "secret-record-adopt",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "secret-record pull" || command === "secret-record-pull") {
    const result = await runSecretRecordPull({
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      outputPath: requireOption(options, "output", "Provide --output <file|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
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
    const result = await runSecretRecordDiff({
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "secret-record-diff",
      surface: "secret-record",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "secret-record push" || command === "secret-record-push") {
    const result = await runSecretRecordPush({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "secret-record-push",
      surface: "secret-record",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "secret-record edit" || command === "secret-record-edit") {
    const result = await runSecretRecordEdit({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
      editorCommand: process.env.EDITOR,
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "secret-record-edit",
      surface: "secret-record",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "access-token create" || command === "access-token-create") {
    const result = await runAccessTokenCreate({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "access-token-create",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "access-token adopt" || command === "access-token-adopt") {
    const result = await runAccessTokenAdopt({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "access-token-adopt",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "access-token pull" || command === "access-token-pull") {
    const result = await runAccessTokenPull({
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      outputPath: requireOption(options, "output", "Provide --output <file|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
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
    const result = await runAccessTokenDiff({
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "access-token-diff",
      surface: "access-token",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "access-token push" || command === "access-token-push") {
    const result = await runAccessTokenPush({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "access-token-push",
      surface: "access-token",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "access-token edit" || command === "access-token-edit") {
    const result = await runAccessTokenEdit({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
      editorCommand: process.env.EDITOR,
    });
    printDiff(result.diff);
    console.log(JSON.stringify(buildOperationalResponse({
      command: "access-token-edit",
      surface: "access-token",
      result,
      explain: options.explain === true,
      reviewOutput: options["review-output"],
    }), null, 2));
    return;
  }

  if (command === "runbook create" || command === "runbook-create") {
    const result = await runRunbookCreate({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Runbook Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "runbook-create",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "runbook adopt" || command === "runbook-adopt") {
    const result = await runRunbookAdopt({
      apply: options.apply === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Runbook Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "runbook-adopt",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "runbook pull" || command === "runbook-pull") {
    const result = await runRunbookPull({
      outputPath: requireOption(options, "output", "Provide --output <file|->."),
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
    const result = await runRunbookPush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path|->."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Runbook Title".'),
      workspaceName,
    });
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
    const result = await runRunbookEdit({
      apply: options.apply === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Runbook Title".'),
      workspaceName,
      editorCommand: process.env.EDITOR,
    });
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
    const result = await runBuildRecordCreate({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Build Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "build-record-create",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
      needsContainer: result.needsContainer,
      containerCreated: result.containerCreated,
    }, null, 2));
    return;
  }

  if (command === "build-record pull" || command === "build-record-pull") {
    const result = await runBuildRecordPull({
      outputPath: requireOption(options, "output", "Provide --output <file>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Build Record Title".'),
      workspaceName,
    });
    console.log(JSON.stringify({
      ok: true,
      command: "build-record-pull",
      ...result,
    }, null, 2));
    return;
  }

  if (command === "build-record diff" || command === "build-record-diff") {
    const result = await runBuildRecordDiff({
      filePath: requireOption(options, "file", "Provide --file <path>."),
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
    const result = await runBuildRecordPush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Build Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "build-record-push",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "validation-sessions init" || command === "validation-sessions-init") {
    const result = await runValidationSessionsInit({
      apply: options.apply === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "validation-sessions-init",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      databaseId: result.databaseId,
      dataSourceId: result.dataSourceId,
      createdDatabase: result.createdDatabase,
      nextStep: result.nextStep,
    }, null, 2));
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
    const result = await runValidationBundleApply({
      apply: options.apply === true,
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
    const result = await runValidationSessionCreate({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Session Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "validation-session-create",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
      nextStep: result.nextStep,
    }, null, 2));
    return;
  }

  if (command === "validation-session adopt" || command === "validation-session-adopt") {
    const result = await runValidationSessionAdopt({
      apply: options.apply === true,
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Session Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "validation-session-adopt",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
      nextStep: result.nextStep,
    }, null, 2));
    return;
  }

  if (command === "validation-session pull" || command === "validation-session-pull") {
    const result = await runValidationSessionPull({
      outputPath: requireOption(options, "output", "Provide --output <file>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Session Title".'),
      workspaceName,
    });
    console.log(JSON.stringify({
      ok: true,
      command: "validation-session-pull",
      ...result,
    }, null, 2));
    return;
  }

  if (command === "validation-session diff" || command === "validation-session-diff") {
    const result = await runValidationSessionDiff({
      filePath: requireOption(options, "file", "Provide --file <path>."),
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
    const result = await runValidationSessionPush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Session Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "validation-session-push",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "sync check" || command === "sync-check") {
    const result = await runSyncCheck({
      manifestPath: requireOption(options, "manifest", "Provide --manifest <path>."),
      projectTokenEnv: options["project-token-env"],
      workspaceOverride: options.workspace,
    });
    printSyncEntryResults(result.entries);
    console.log(JSON.stringify({
      ok: result.failures.length === 0 && result.driftCount === 0,
      ...result,
    }, null, 2));
    if (result.failures.length > 0 || result.driftCount > 0) {
      process.exitCode = 1;
      return;
    }
    return;
  }

  if (command === "sync pull" || command === "sync-pull") {
    const result = await runSyncPull({
      apply: options.apply === true,
      manifestPath: requireOption(options, "manifest", "Provide --manifest <path>."),
      projectTokenEnv: options["project-token-env"],
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
    const result = await runSyncPush({
      apply: options.apply === true,
      manifestPath: requireOption(options, "manifest", "Provide --manifest <path>."),
      projectTokenEnv: options["project-token-env"],
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

  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
