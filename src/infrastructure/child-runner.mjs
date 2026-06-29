import { spawnSync } from "node:child_process";

import { validateChildCommandArgs, validateCwd } from "../validators.mjs";

function normalizeOutput(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
}

function normalizeFailure({ status, signal, spawnError }) {
  if (spawnError) {
    return "Child command failed to start.";
  }

  if (signal) {
    return `Child command terminated with signal ${signal}.`;
  }

  if (status !== 0) {
    return `Child command exited with status ${status}.`;
  }

  return null;
}

export function runChildCommand({
  childArgs,
  cwd,
  env = process.env,
  input,
  spawnSyncImpl = spawnSync,
} = {}) {
  validateChildCommandArgs(childArgs);
  const validatedCwd = validateCwd(cwd);

  const spawnOptions = {
    encoding: "utf8",
    env: { ...env },
    shell: false,
    windowsHide: true,
  };

  if (validatedCwd !== undefined) {
    spawnOptions.cwd = validatedCwd;
  }

  if (input !== undefined) {
    spawnOptions.input = input;
  }

  const result = spawnSyncImpl(childArgs[0], childArgs.slice(1), spawnOptions) || {};
  const spawnError = result.error || null;
  const signal = result.signal || null;
  const status = Number.isInteger(result.status) ? result.status : null;
  const exitCode = status === 0 ? 0 : (Number.isInteger(status) ? status : 1);
  const failure = normalizeFailure({ status: exitCode, signal, spawnError });

  return {
    ok: failure === null,
    status: exitCode,
    exitCode,
    signal,
    stdout: normalizeOutput(result.stdout),
    stderr: normalizeOutput(result.stderr),
    spawnError,
    failure,
  };
}
