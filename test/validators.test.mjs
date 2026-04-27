import test from "node:test";
import assert from "node:assert/strict";

import { getProjectToken } from "../src/notion/env.mjs";
import {
  validateCwd,
  validateProjectTokenEnvName,
  validateWorkspaceName,
} from "../src/validators.mjs";

test("project-token env names use the shared environment-name validator", () => {
  assert.equal(validateProjectTokenEnvName("SNPM_NOTION_TOKEN"), "SNPM_NOTION_TOKEN");

  for (const invalidName of ["", "1SNPM_TOKEN", "SNPM-NOTION-TOKEN", "SNPM TOKEN", "SNPM_NOTION_TOKEN "]) {
    assert.throws(
      () => validateProjectTokenEnvName(invalidName),
      /project-token env name/i,
    );
  }
});

test("getProjectToken rejects invalid env names before process.env lookup", () => {
  const invalidName = "SNPM-NOTION-TOKEN";
  const previous = process.env[invalidName];
  try {
    process.env[invalidName] = "token-that-must-not-be-read";

    assert.throws(
      () => getProjectToken(invalidName),
      /project-token env name must be a valid environment variable name/i,
    );
  } finally {
    if (previous === undefined) {
      delete process.env[invalidName];
    } else {
      process.env[invalidName] = previous;
    }
  }
});

test("workspace names are safe config basenames only", () => {
  assert.equal(validateWorkspaceName("infrastructure-hq"), "infrastructure-hq");
  assert.equal(validateWorkspaceName("infrastructure-hq.example"), "infrastructure-hq.example");

  for (const invalidName of ["", "../escape", "workspace/name", "workspace\\name", "C:workspace", ".hidden", "workspace;", "workspace "]) {
    assert.throws(
      () => validateWorkspaceName(invalidName),
      /Workspace name/i,
    );
  }
});

test("cwd validator fails before callers can spawn child processes", () => {
  let statCalled = false;
  assert.throws(
    () => validateCwd("missing-dir", {
      statSyncImpl: () => {
        statCalled = true;
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    }),
    /--cwd must point to an existing directory/i,
  );
  assert.equal(statCalled, true);

  assert.throws(
    () => validateCwd("not-a-dir", {
      statSyncImpl: () => ({ isDirectory: () => false }),
    }),
    /--cwd must point to an existing directory/i,
  );

  assert.equal(
    validateCwd("C:\\SNPM", {
      statSyncImpl: () => ({ isDirectory: () => true }),
    }),
    "C:\\SNPM",
  );
});
