import { runCreateProject } from "./commands/create-project.mjs";
import { runVerifyProject } from "./commands/verify-project.mjs";

function usage() {
  console.log(
    [
      "Usage:",
      '  npm run create-project -- --name "Project Name"',
      '  npm run verify-project -- --name "Project Name" [--project-token-env PROJECT_NAME_NOTION_TOKEN]',
      "",
      "Optional flags:",
      "  --workspace infrastructure-hq",
      "",
      "Environment:",
      "  Workspace token: NOTION_TOKEN or INFRASTRUCTURE_HQ_NOTION_TOKEN",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = rest[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    options[key] = value;
    i += 1;
  }

  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === "--help" || command === "help") {
    usage();
    process.exit(command ? 1 : 0);
  }

  const workspaceName = options.workspace || "infrastructure-hq";
  const projectName = options.name;
  if (!projectName) {
    throw new Error('Provide --name "Project Name".');
  }

  if (command === "create-project" || command === "create") {
    const result = await runCreateProject({ projectName, workspaceName });
    console.log(JSON.stringify({
      ok: true,
      command: "create-project",
      ...result,
      nextStep: "Create and share the project Notion integration in the UI, then run verify-project with the project token env var.",
    }, null, 2));
    return;
  }

  if (command === "verify-project" || command === "verify") {
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
      process.exit(1);
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

