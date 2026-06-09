import { existsSync } from "node:fs";
import path from "node:path";

import { runChildCommand } from "../commands/child-runner.mjs";

const DISPLAY_VERSION_COMMAND = ["ntn", "--version"];
const VERSION_PATTERN = /\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/;
const SENSITIVE_ENV_NAME_PATTERN = /(?:TOKEN|SECRET|PASSWORD|PASS|KEY|AUTH|CREDENTIAL)/i;

function safeNextCommands({ installed }) {
  if (!installed) {
    return [
      "npm install --global ntn",
      "node src/cli.mjs doctor --notion-cli",
    ];
  }

  return [
    "node src/cli.mjs doctor --notion-cli",
    "node src/cli.mjs doctor --project \"Project Name\"",
    "node src/cli.mjs recommend --project \"Project Name\" --intent <intent>",
  ];
}

function parseVersion(stdout) {
  const match = VERSION_PATTERN.exec(stdout || "");
  return match ? match[1] : null;
}

function probeEnv(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !SENSITIVE_ENV_NAME_PATTERN.test(key)),
  );
}

function pathEntries(env = process.env) {
  const value = env.Path || env.PATH || "";
  return value.split(path.delimiter).filter(Boolean);
}

function resolveWindowsNtnChildArgs({
  env = process.env,
  nodeExecPath = process.execPath,
} = {}) {
  for (const entry of pathEntries(env)) {
    const scriptPath = path.join(entry, "node_modules", "ntn", "bin", "ntn");
    if (existsSync(scriptPath)) {
      return [nodeExecPath, scriptPath, "--version"];
    }
  }

  return DISPLAY_VERSION_COMMAND;
}

export function resolveNotionCliVersionChildArgs({
  env = process.env,
  nodeExecPath = process.execPath,
  platform = process.platform,
} = {}) {
  return platform === "win32"
    ? resolveWindowsNtnChildArgs({ env, nodeExecPath })
    : DISPLAY_VERSION_COMMAND;
}

export function probeNotionCli({
  runChildCommandImpl = runChildCommand,
  env = process.env,
  nodeExecPath = process.execPath,
  platform = process.platform,
} = {}) {
  const childArgs = resolveNotionCliVersionChildArgs({ env, nodeExecPath, platform });
  const result = runChildCommandImpl({
    childArgs,
    env: probeEnv(env),
  });
  const version = parseVersion(result.stdout);
  const warnings = [];
  const launched = result.spawnError === null && result.spawnError !== undefined
    ? true
    : !result.spawnError;
  const installed = result.ok || launched;

  if (!installed) {
    warnings.push("Notion CLI was not found on PATH. Install it with npm install --global ntn when official CLI interop diagnostics are needed.");
  } else if (!result.ok) {
    warnings.push("Notion CLI was found, but ntn --version did not exit successfully.");
  } else if (!version) {
    warnings.push("Notion CLI responded, but SNPM could not parse a semantic version from ntn --version output.");
  }

  return {
    checked: true,
    installed,
    version,
    command: DISPLAY_VERSION_COMMAND.join(" "),
    warnings,
    safeNextCommands: safeNextCommands({ installed }),
  };
}
