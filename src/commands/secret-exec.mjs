import { spawnSync } from "node:child_process";

import { SECRET_REDACTION_MARKER } from "./secret-output-safety.mjs";

export const SECRET_EXEC_LEAK_WARNING = "SNPM redacted child output containing the secret; failing closed.";

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function stringifyOutput(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
}

export function redactExactSecret(text, secretValue) {
  const input = stringifyOutput(text);
  if (!secretValue || !input.includes(secretValue)) {
    return {
      text: input,
      redacted: false,
    };
  }

  return {
    text: input.split(secretValue).join(SECRET_REDACTION_MARKER),
    redacted: true,
  };
}

export function validateSecretExecEnvName(envName) {
  if (typeof envName !== "string" || envName.trim() === "") {
    throw new Error("Provide --env-name ENV_NAME or --stdin-secret for secret exec.");
  }

  if (!ENV_NAME_PATTERN.test(envName)) {
    throw new Error("--env-name must be a valid environment variable name.");
  }

  return envName;
}

export function findSecretExecEnvCollision(envName, env = process.env) {
  const normalizedEnvName = envName.toUpperCase();
  return Object.keys(env || {}).find((key) => key.toUpperCase() === normalizedEnvName) || null;
}

export function validateSecretExecInjection({
  env = process.env,
  envName,
  stdinSecret = false,
} = {}) {
  const hasEnvName = typeof envName === "string" && envName.trim() !== "";
  if ((hasEnvName ? 1 : 0) + (stdinSecret ? 1 : 0) !== 1) {
    throw new Error("Provide exactly one of --env-name ENV_NAME or --stdin-secret.");
  }

  if (stdinSecret) {
    return {
      mode: "stdin",
      envName: null,
    };
  }

  const validatedEnvName = validateSecretExecEnvName(envName);
  const collision = findSecretExecEnvCollision(validatedEnvName, env);
  if (collision) {
    throw new Error(`Environment variable ${collision} already exists; refusing to overwrite it with a secret.`);
  }

  return {
    mode: "env",
    envName: validatedEnvName,
  };
}

function validateSecretExecCommand(childArgs) {
  if (!Array.isArray(childArgs) || childArgs.length === 0 || !childArgs[0]) {
    throw new Error("Provide a child command after -- for secret exec.");
  }

  if (!childArgs.every((arg) => typeof arg === "string")) {
    throw new Error("Secret exec child command arguments must be strings.");
  }
}

export function runSecretExec({
  childArgs,
  cwd,
  env = process.env,
  envName,
  secretValue,
  spawnSyncImpl = spawnSync,
  stdinSecret = false,
} = {}) {
  if (typeof secretValue !== "string" || !secretValue.trim()) {
    throw new Error("secret exec requires a non-empty raw secret value.");
  }

  validateSecretExecCommand(childArgs);
  const injection = validateSecretExecInjection({ env, envName, stdinSecret });

  const childEnv = injection.mode === "env"
    ? { ...env, [injection.envName]: secretValue }
    : { ...env };
  const spawnOptions = {
    encoding: "utf8",
    env: childEnv,
    shell: false,
    windowsHide: true,
  };
  if (cwd) {
    spawnOptions.cwd = cwd;
  }
  if (injection.mode === "stdin") {
    spawnOptions.input = secretValue;
  }

  const result = spawnSyncImpl(childArgs[0], childArgs.slice(1), spawnOptions) || {};

  const stdout = redactExactSecret(result.stdout, secretValue);
  const stderr = redactExactSecret(result.stderr, secretValue);
  const spawnError = result.error ? redactExactSecret(result.error.message, secretValue) : null;
  const leakDetected = stdout.redacted || stderr.redacted || (spawnError ? spawnError.redacted : false);
  const status = Number.isInteger(result.status)
    ? result.status
    : result.error || result.signal
      ? 1
      : 0;
  const exitCode = leakDetected ? 1 : status;
  const failure = leakDetected
    ? SECRET_EXEC_LEAK_WARNING
    : result.error
      ? spawnError.text
      : result.signal
        ? `Child command terminated with signal ${result.signal}.`
      : exitCode === 0
        ? null
        : `Child command exited with status ${exitCode}.`;

  return {
    ok: exitCode === 0,
    status,
    exitCode,
    signal: result.signal || null,
    stdout: stdout.text,
    stderr: stderr.text,
    leakDetected,
    spawnError: spawnError ? spawnError.text : null,
    injection,
    ...(failure ? { failure } : {}),
  };
}
