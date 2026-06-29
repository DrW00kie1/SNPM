import { validateChildCommandArgs } from "../validators.mjs";
import { findCommandHelp, normalizeCommandName } from "../cli-help.mjs";
import { RAW_SECRET_EXPORT_UNSUPPORTED_MESSAGE } from "../commands/secret-output-safety.mjs";

const BOOLEAN_FLAGS = new Set(["allow-repo-secret-output", "apply", "bundle", "consistency-audit", "explain", "manifest-draft", "notion-cli", "notion-cli-api", "quality-gates", "raw-secret-output", "refresh-sidecars", "stdin-secret", "truth-audit"]);
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
const ERROR_FORMATS = new Set(["json", "text"]);

export const DEFAULT_ERROR_FORMAT = "text";

function normalizeErrorFormat(value, { source }) {
  if (ERROR_FORMATS.has(value)) {
    return value;
  }

  throw new Error(`${source} must be json or text.`);
}

function inferCommandForError(argv) {
  if (!Array.isArray(argv) || argv.length === 0) {
    return null;
  }

  const tokens = [];
  for (const token of argv) {
    if (token === "--" || token.startsWith("--")) {
      break;
    }
    if (token === "help") {
      continue;
    }

    tokens.push(token);
    const candidate = normalizeCommandName(tokens.join(" "));
    const commandSpec = findCommandHelp(candidate);
    if (commandSpec) {
      return commandSpec.canonical;
    }
    if (tokens.length >= 2) {
      break;
    }
  }

  return tokens.length > 0 ? normalizeCommandName(tokens.join(" ")) : null;
}

export function prepareCliInvocation(argv, env = process.env) {
  const passthroughIndex = argv.indexOf("--");
  const scannedArgv = passthroughIndex === -1 ? argv : argv.slice(0, passthroughIndex);
  const passthroughArgv = passthroughIndex === -1 ? [] : argv.slice(passthroughIndex);
  const forwardedArgv = [];
  let errorFormat = DEFAULT_ERROR_FORMAT;
  let explicitErrorFormat = false;

  for (let i = 0; i < scannedArgv.length; i += 1) {
    const token = scannedArgv[i];

    if (token.startsWith("--error-format=")) {
      errorFormat = normalizeErrorFormat(token.slice("--error-format=".length), { source: "--error-format" });
      explicitErrorFormat = true;
      continue;
    }

    if (token !== "--error-format") {
      forwardedArgv.push(token);
      continue;
    }

    const value = scannedArgv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("--error-format must be json or text.");
    }

    errorFormat = normalizeErrorFormat(value, { source: "--error-format" });
    explicitErrorFormat = true;
    i += 1;
  }

  if (!explicitErrorFormat && env.SNPM_ERROR_FORMAT !== undefined && env.SNPM_ERROR_FORMAT !== "") {
    errorFormat = normalizeErrorFormat(env.SNPM_ERROR_FORMAT, { source: "SNPM_ERROR_FORMAT" });
  }

  return {
    argv: [...forwardedArgv, ...passthroughArgv],
    command: inferCommandForError([...forwardedArgv, ...passthroughArgv]),
    errorFormat,
  };
}

function isSecretChildCommand(command) {
  return SECRET_CHILD_COMMANDS.has(command);
}

function formatFlagList(flags) {
  return flags.map((flag) => `--${flag}`).join(" and ");
}

export function failIfDeprecatedRawSecretFlags(options) {
  const usedFlags = DEPRECATED_RAW_SECRET_FLAGS.filter((flag) => options[flag] === true);
  if (usedFlags.length === 0) {
    return;
  }

  throw new Error(`${formatFlagList(usedFlags)} ${usedFlags.length === 1 ? "is" : "are"} unsupported: ${RAW_SECRET_EXPORT_UNSUPPORTED_MESSAGE}`);
}

export function requirePassthroughArgs(options, command) {
  return validateChildCommandArgs(options.passthroughArgs, {
    emptyMessage: `Provide a child command after -- for ${command}.`,
    nonStringMessage: `${command} child command arguments must be strings.`,
  });
}

export function rejectUnsupportedSecretGenerateOptions(options, command) {
  const usedFlags = Object.keys(options).filter((flag) => !SECRET_GENERATE_ALLOWED_OPTIONS.has(flag));
  if (usedFlags.length === 0) {
    return;
  }

  throw new Error(`${command} does not support ${usedFlags.map((flag) => `--${flag}`).join(", ")}. Generated secret ingestion accepts only a child generator after -- and never reads raw values from local files, stdin, env vars, or output paths.`);
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

    options.passthroughArgs = validateChildCommandArgs(rest.slice(passthroughIndex + 1), {
      emptyMessage: `Provide a child command after -- for ${command}.`,
      nonStringMessage: `${command} child command arguments must be strings.`,
    });
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

export function parsePositiveInteger(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("--limit must be a positive integer.");
  }
  return parsed;
}

export function parseMaxMutationsOption(value) {
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

export function parseStaleAfterDaysOption(value) {
  if (value === undefined) {
    return 30;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== value) {
    throw new Error("--stale-after-days must be a positive integer.");
  }

  return parsed;
}

export function requireOption(options, name, message) {
  const value = options[name];
  if (!value || typeof value !== "string") {
    throw new Error(message);
  }
  return value;
}
