import { inspect } from "node:util";

import { runChildCommand } from "./child-runner.mjs";
import { validateChildCommandArgs, validateCwd } from "../validators.mjs";
import {
  SECRET_REDACTION_MARKER,
  createExactSecretRedactor,
  validateGeneratedSecretValue,
} from "./secret-output-safety.mjs";

export const GENERATED_SECRET_MATERIAL_KIND = "snpm.generated-secret-material.v1";

const GENERATED_SECRET_VALUE = Symbol("snpm.generatedSecretValue");

function stringifyOutput(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
}

function validateGeneratorCommand(childArgs) {
  return validateChildCommandArgs(childArgs, {
    emptyMessage: "Provide a generator command after -- for secret generate.",
    nonStringMessage: "Secret generator command arguments must be strings.",
  });
}

export function createGeneratedSecretMaterial(secretValue) {
  if (typeof secretValue !== "string" || secretValue === "") {
    throw new Error("createGeneratedSecretMaterial requires a non-empty generated secret value.");
  }

  const material = {};
  Object.defineProperties(material, {
    kind: {
      value: GENERATED_SECRET_MATERIAL_KIND,
      enumerable: true,
    },
    redacted: {
      value: true,
      enumerable: true,
    },
    marker: {
      value: SECRET_REDACTION_MARKER,
      enumerable: true,
    },
    [GENERATED_SECRET_VALUE]: {
      value: secretValue,
      enumerable: false,
    },
    toJSON: {
      value: () => ({
        kind: GENERATED_SECRET_MATERIAL_KIND,
        redacted: true,
        marker: SECRET_REDACTION_MARKER,
      }),
      enumerable: false,
    },
    [inspect.custom]: {
      value: () => `[GeneratedSecretMaterial ${SECRET_REDACTION_MARKER}]`,
      enumerable: false,
    },
  });

  return Object.freeze(material);
}

export function unwrapGeneratedSecretMaterial(material) {
  if (!material || material.kind !== GENERATED_SECRET_MATERIAL_KIND || typeof material[GENERATED_SECRET_VALUE] !== "string") {
    throw new Error("Expected generated secret material.");
  }

  return material[GENERATED_SECRET_VALUE];
}

function failureResult({
  exitCode = 1,
  failure,
  signal = null,
  status = 1,
} = {}) {
  return {
    ok: false,
    status,
    exitCode,
    signal,
    stdout: "",
    stderr: "",
    outputSuppressed: true,
    ...(failure ? { failure } : {}),
  };
}

export function runGeneratedSecretCommand({
  childArgs,
  cwd,
  env = process.env,
  maxBytes,
  spawnSyncImpl,
} = {}) {
  validateGeneratorCommand(childArgs);
  const validatedCwd = validateCwd(cwd);

  const result = runChildCommand({
    childArgs,
    cwd: validatedCwd,
    env,
    ...(spawnSyncImpl ? { spawnSyncImpl } : {}),
  });
  const stdout = stringifyOutput(result.stdout);
  const stderr = stringifyOutput(result.stderr);
  const status = Number.isInteger(result.status) ? result.status : 1;

  if (result.spawnError) {
    return failureResult({
      status: 1,
      exitCode: 1,
      failure: "Generator command failed to start.",
    });
  }

  if (result.signal) {
    return failureResult({
      status: 1,
      exitCode: 1,
      signal: result.signal,
      failure: `Generator command terminated with signal ${result.signal}.`,
    });
  }

  if (status !== 0) {
    return failureResult({
      status,
      exitCode: status,
      failure: `Generator command exited with status ${status}.`,
    });
  }

  if (stderr !== "") {
    return failureResult({
      status: 1,
      exitCode: 1,
      failure: "Generator command wrote to stderr; refusing generated secret ingestion.",
    });
  }

  let secretValue;
  try {
    secretValue = validateGeneratedSecretValue(stdout, {
      childArgs,
      command: "secret generate",
      maxBytes,
    });
  } catch (error) {
    return failureResult({
      status: 1,
      exitCode: 1,
      failure: error.message,
    });
  }

  return {
    ok: true,
    status: 0,
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    outputSuppressed: true,
    secretMaterial: createGeneratedSecretMaterial(secretValue),
    redactor: createExactSecretRedactor(secretValue),
    redaction: {
      applied: true,
      marker: SECRET_REDACTION_MARKER,
      reason: "generated-secret-material",
    },
  };
}
