import { pathToFileURL } from "node:url";

import {
  runAccessDomainAdopt,
  runAccessDomainCreate,
  runAccessDomainDiff,
  runAccessDomainPull,
  runAccessDomainPush,
  runAccessTokenAdopt,
  runAccessTokenCreate,
  runAccessTokenDiff,
  runAccessTokenPull,
  runAccessTokenPush,
  runSecretRecordAdopt,
  runSecretRecordCreate,
  runSecretRecordDiff,
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
import { runDoctor } from "./commands/doctor.mjs";
import { runPageDiff } from "./commands/page-diff.mjs";
import { runPagePull } from "./commands/page-pull.mjs";
import { runPagePush } from "./commands/page-push.mjs";
import {
  runRunbookAdopt,
  runRunbookCreate,
  runRunbookDiff,
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
import { runSyncCheck, runSyncPull, runSyncPush } from "./commands/sync.mjs";

const BOOLEAN_FLAGS = new Set(["apply", "bundle"]);

export function usage() {
  return [
    "Usage:",
    '  npm run create-project -- --name "Project Name"',
    '  npm run doctor -- --project "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run recommend -- --project "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run verify-project -- --name "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run page-pull -- --project "Project Name" --page "Planning > Roadmap" --output roadmap.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run page-diff -- --project "Project Name" --page "Planning > Roadmap" --file roadmap.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run page-push -- --project "Project Name" --page "Planning > Roadmap" --file roadmap.md [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run access-domain-create -- --project "Project Name" --title "App & Backend" --file access-domain.md [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run access-domain-adopt -- --project "Project Name" --title "App & Backend" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run access-domain-pull -- --project "Project Name" --title "App & Backend" --output access-domain.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run access-domain-diff -- --project "Project Name" --title "App & Backend" --file access-domain.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run access-domain-push -- --project "Project Name" --title "App & Backend" --file access-domain.md [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run secret-record-create -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record.md [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run secret-record-adopt -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run secret-record-pull -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --output secret-record.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run secret-record-diff -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run secret-record-push -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record.md [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run access-token-create -- --project "Project Name" --domain "App & Backend" --title "Project Token" --file access-token.md [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run access-token-adopt -- --project "Project Name" --domain "App & Backend" --title "Project Token" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run access-token-pull -- --project "Project Name" --domain "App & Backend" --title "Project Token" --output access-token.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run access-token-diff -- --project "Project Name" --domain "App & Backend" --title "Project Token" --file access-token.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run access-token-push -- --project "Project Name" --domain "App & Backend" --title "Project Token" --file access-token.md [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run runbook-create -- --project "Project Name" --title "Runbook Title" --file runbook.md [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run runbook-adopt -- --project "Project Name" --title "Existing Runbook Title" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run runbook-pull -- --project "Project Name" --title "Runbook Title" --output runbook.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run runbook-diff -- --project "Project Name" --title "Runbook Title" --file runbook.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run runbook-push -- --project "Project Name" --title "Runbook Title" --file runbook.md [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run build-record-create -- --project "Project Name" --title "Build Record Title" --file build-record.md [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run build-record-pull -- --project "Project Name" --title "Build Record Title" --output build-record.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run build-record-diff -- --project "Project Name" --title "Build Record Title" --file build-record.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run build-record-push -- --project "Project Name" --title "Build Record Title" --file build-record.md [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run validation-sessions-init -- --project "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run validation-sessions-verify -- --project "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--bundle]',
    '  npm run validation-session-create -- --project "Project Name" --title "Session Title" --file validation-session.md [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run validation-session-adopt -- --project "Project Name" --title "Existing Session Title" [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run validation-session-pull -- --project "Project Name" --title "Session Title" --output validation-session.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run validation-session-diff -- --project "Project Name" --title "Session Title" --file validation-session.md [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run validation-session-push -- --project "Project Name" --title "Session Title" --file validation-session.md [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run sync-check -- --manifest C:\\path\\to\\snpm.sync.json [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
    '  npm run sync-pull -- --manifest C:\\path\\to\\snpm.sync.json [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    '  npm run sync-push -- --manifest C:\\path\\to\\snpm.sync.json [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]',
    "",
    "Run from the SNPM checkout (for example C:\\SNPM), even when the active Codex thread is attached to a different repo.",
    "Bootstrap only needs the workspace token. Project-token verification stays optional until a repo-local Notion integration exists.",
    "Doctoring is read-only and project-scoped; it summarizes managed surfaces, adoptable content, and next-step recommendations.",
    "Planning-page sync is limited to Planning > Roadmap, Planning > Current Cycle, Planning > Backlog, and Planning > Decision Log.",
    "Access operations are limited to project-owned Access domain pages plus secret/token records nested under those domains.",
    "Runbook and build-record operations are limited to project-owned surfaces under Runbooks and Ops > Builds.",
    "Validation-session operations are limited to Ops > Validation > Validation Sessions.",
    "Validation-session bundle verification is docs-and-verify only; it checks API-visible rules and returns explicit manual UI checks for views/forms/templates/buttons.",
    "Manifest sync is limited to repo-backed validation-session files listed in snpm.sync.json.",
    "",
    "Optional flags:",
    "  --workspace infrastructure-hq",
    "  --project-token-env PROJECT_NAME_NOTION_TOKEN",
    "  --apply",
    "",
    "Environment:",
    "  Workspace token: NOTION_TOKEN or INFRASTRUCTURE_HQ_NOTION_TOKEN",
  ].join("\n");
}

function printUsage() {
  console.log(
    [
      usage(),
    ].join("\n"),
  );
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
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === "--help" || command === "help") {
    printUsage();
    process.exitCode = command ? 1 : 0;
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

  if (command === "doctor" || command === "recommend") {
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

  if (command === "page pull" || command === "page-pull") {
    const result = await runPagePull({
      outputPath: requireOption(options, "output", "Provide --output <file>."),
      pagePath: requireOption(options, "page", 'Provide --page "Planning > <Page Name>".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    console.log(JSON.stringify({
      ok: true,
      command: "page-pull",
      ...result,
    }, null, 2));
    return;
  }

  if (command === "page diff" || command === "page-diff") {
    const result = await runPageDiff({
      filePath: requireOption(options, "file", "Provide --file <path>."),
      pagePath: requireOption(options, "page", 'Provide --page "Planning > <Page Name>".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "page-diff",
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
    }, null, 2));
    return;
  }

  if (command === "page push" || command === "page-push") {
    const result = await runPagePush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path>."),
      pagePath: requireOption(options, "page", 'Provide --page "Planning > <Page Name>".'),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "page-push",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "access-domain create" || command === "access-domain-create") {
    const result = await runAccessDomainCreate({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path>."),
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
      outputPath: requireOption(options, "output", "Provide --output <file>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Access Domain Title".'),
      workspaceName,
    });
    console.log(JSON.stringify({
      ok: true,
      command: "access-domain-pull",
      ...result,
    }, null, 2));
    return;
  }

  if (command === "access-domain diff" || command === "access-domain-diff") {
    const result = await runAccessDomainDiff({
      filePath: requireOption(options, "file", "Provide --file <path>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Access Domain Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "access-domain-diff",
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
    }, null, 2));
    return;
  }

  if (command === "access-domain push" || command === "access-domain-push") {
    const result = await runAccessDomainPush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Access Domain Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "access-domain-push",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "secret-record create" || command === "secret-record-create") {
    const result = await runSecretRecordCreate({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: requireOption(options, "file", "Provide --file <path>."),
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
      outputPath: requireOption(options, "output", "Provide --output <file>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    console.log(JSON.stringify({
      ok: true,
      command: "secret-record-pull",
      ...result,
    }, null, 2));
    return;
  }

  if (command === "secret-record diff" || command === "secret-record-diff") {
    const result = await runSecretRecordDiff({
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: requireOption(options, "file", "Provide --file <path>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "secret-record-diff",
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
    }, null, 2));
    return;
  }

  if (command === "secret-record push" || command === "secret-record-push") {
    const result = await runSecretRecordPush({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: requireOption(options, "file", "Provide --file <path>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "secret-record-push",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "access-token create" || command === "access-token-create") {
    const result = await runAccessTokenCreate({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: requireOption(options, "file", "Provide --file <path>."),
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
      outputPath: requireOption(options, "output", "Provide --output <file>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    console.log(JSON.stringify({
      ok: true,
      command: "access-token-pull",
      ...result,
    }, null, 2));
    return;
  }

  if (command === "access-token diff" || command === "access-token-diff") {
    const result = await runAccessTokenDiff({
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: requireOption(options, "file", "Provide --file <path>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "access-token-diff",
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
    }, null, 2));
    return;
  }

  if (command === "access-token push" || command === "access-token-push") {
    const result = await runAccessTokenPush({
      apply: options.apply === true,
      domainTitle: requireOption(options, "domain", 'Provide --domain "Access Domain Title".'),
      filePath: requireOption(options, "file", "Provide --file <path>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Record Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "access-token-push",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
    return;
  }

  if (command === "runbook create" || command === "runbook-create") {
    const result = await runRunbookCreate({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path>."),
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
      outputPath: requireOption(options, "output", "Provide --output <file>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Runbook Title".'),
      workspaceName,
    });
    console.log(JSON.stringify({
      ok: true,
      command: "runbook-pull",
      ...result,
    }, null, 2));
    return;
  }

  if (command === "runbook diff" || command === "runbook-diff") {
    const result = await runRunbookDiff({
      filePath: requireOption(options, "file", "Provide --file <path>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Runbook Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "runbook-diff",
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
    }, null, 2));
    return;
  }

  if (command === "runbook push" || command === "runbook-push") {
    const result = await runRunbookPush({
      apply: options.apply === true,
      filePath: requireOption(options, "file", "Provide --file <path>."),
      projectName: requireOption(options, "project", 'Provide --project "Project Name".'),
      projectTokenEnv: options["project-token-env"],
      title: requireOption(options, "title", 'Provide --title "Runbook Title".'),
      workspaceName,
    });
    printDiff(result.diff);
    console.log(JSON.stringify({
      ok: true,
      command: "runbook-push",
      applied: result.applied,
      hasDiff: result.hasDiff,
      targetPath: result.targetPath,
      authMode: result.authMode,
      pageId: result.pageId,
      timestamp: result.timestamp,
    }, null, 2));
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
