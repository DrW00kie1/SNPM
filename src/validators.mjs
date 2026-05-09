import { statSync } from "node:fs";

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const WORKSPACE_NAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const DEFAULT_WORKSPACE_NAME = "infrastructure-hq";

export function validateEnvName(envName, { label = "environment variable name" } = {}) {
  if (typeof envName !== "string" || envName.trim() === "") {
    throw new Error(`Provide a non-empty ${label}.`);
  }

  if (envName !== envName.trim()) {
    throw new Error(`${label} must not include leading or trailing whitespace.`);
  }

  if (!ENV_NAME_PATTERN.test(envName)) {
    throw new Error(`${label} must be a valid environment variable name.`);
  }

  return envName;
}

export function validateProjectTokenEnvName(envName) {
  return validateEnvName(envName, { label: "project-token env name" });
}

export function validateWorkspaceName(workspaceName = DEFAULT_WORKSPACE_NAME) {
  const name = workspaceName === undefined ? DEFAULT_WORKSPACE_NAME : workspaceName;
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("Workspace name must be a non-empty safe config name.");
  }

  if (name !== name.trim()) {
    throw new Error("Workspace name must not include leading or trailing whitespace.");
  }

  if (
    name.length > 80
    || name.includes("..")
    || name.includes("/")
    || name.includes("\\")
    || !WORKSPACE_NAME_PATTERN.test(name)
  ) {
    throw new Error("Workspace name must be a safe config basename using only letters, numbers, dots, underscores, and hyphens.");
  }

  return name;
}

export function validateCwd(cwd, { statSyncImpl = statSync } = {}) {
  if (cwd === undefined || cwd === null) {
    return undefined;
  }

  if (typeof cwd !== "string" || cwd.trim() === "") {
    throw new Error("--cwd must be a non-empty directory path.");
  }

  if (cwd !== cwd.trim()) {
    throw new Error("--cwd must not include leading or trailing whitespace.");
  }

  if (cwd.includes("\0")) {
    throw new Error("--cwd must not contain NUL bytes.");
  }

  let stats;
  try {
    stats = statSyncImpl(cwd);
  } catch {
    throw new Error("--cwd must point to an existing directory.");
  }

  if (!stats || typeof stats.isDirectory !== "function" || !stats.isDirectory()) {
    throw new Error("--cwd must point to an existing directory.");
  }

  return cwd;
}

export function validateChildCommandArgs(childArgs, {
  emptyMessage = "Provide a child command after --.",
  nonStringMessage = "Child command arguments must be strings.",
} = {}) {
  if (!Array.isArray(childArgs) || childArgs.length === 0 || typeof childArgs[0] !== "string" || childArgs[0].trim() === "") {
    throw new Error(emptyMessage);
  }

  if (!childArgs.every((arg) => typeof arg === "string")) {
    throw new Error(nonStringMessage);
  }

  return childArgs;
}

function validatePathString(value, {
  allowDash = false,
  label = "path",
} = {}) {
  if (allowDash && value === "-") {
    return value;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Provide a non-empty ${label}.`);
  }

  if (value !== value.trim()) {
    throw new Error(`${label} must not include leading or trailing whitespace.`);
  }

  if (value.includes("\0")) {
    throw new Error(`${label} must not contain NUL bytes.`);
  }

  if (value === "-") {
    throw new Error(`${label} does not support stdin/stdout; provide a real filesystem path.`);
  }

  return value;
}

function validateNotExistingDirectory(filePath, {
  label,
  statSyncImpl,
}) {
  try {
    const stats = statSyncImpl(filePath);
    if (stats && typeof stats.isDirectory === "function" && stats.isDirectory()) {
      throw new Error(`${label} must be a file path, not a directory.`);
    }
  } catch (error) {
    if (/must be a file path/i.test(error.message)) {
      throw error;
    }
  }
}

export function validateLocalInputFilePath(filePath, {
  allowDash = true,
  label = "input file path",
} = {}) {
  return validatePathString(filePath, { allowDash, label });
}

export function validateLocalOutputFilePath(filePath, {
  allowDash = true,
  label = "output file path",
  statSyncImpl = statSync,
} = {}) {
  const value = validatePathString(filePath, { allowDash, label });
  if (value === "-") {
    return value;
  }

  validateNotExistingDirectory(value, { label, statSyncImpl });
  return value;
}

export function validateLocalMetadataPath(metadataPath, {
  label = "metadata path",
  statSyncImpl = statSync,
} = {}) {
  const value = validatePathString(metadataPath, { allowDash: false, label });
  validateNotExistingDirectory(value, { label, statSyncImpl });
  return value;
}

export function validateLocalDirectoryPath(directoryPath, {
  label = "output directory path",
  statSyncImpl = statSync,
} = {}) {
  const value = validatePathString(directoryPath, { allowDash: false, label });

  try {
    const stats = statSyncImpl(value);
    if (!stats || typeof stats.isDirectory !== "function" || !stats.isDirectory()) {
      throw new Error(`${label} must be a directory path, not a file.`);
    }
  } catch (error) {
    if (/must be a directory path/i.test(error.message)) {
      throw error;
    }
  }

  return value;
}

export function validateLocalManifestPath(manifestPath, options = {}) {
  return validateLocalInputFilePath(manifestPath, {
    allowDash: false,
    label: options.label || "manifest path",
  });
}
