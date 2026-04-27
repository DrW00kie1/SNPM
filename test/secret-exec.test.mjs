import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  SECRET_EXEC_LEAK_WARNING,
  findSecretExecEnvCollision,
  redactExactSecret,
  runSecretExec,
  validateSecretExecInjection,
} from "../src/commands/secret-exec.mjs";
import { SECRET_REDACTION_MARKER } from "../src/commands/secret-output-safety.mjs";

test("runSecretExec injects the secret into a child env var without shell execution", () => {
  const calls = [];
  const existingCwd = process.cwd();

  const result = runSecretExec({
    childArgs: ["child-bin", "--flag"],
    cwd: existingCwd,
    env: { PATH: "bin" },
    envName: "SNPM_TEST_SECRET",
    secretValue: "exact-secret",
    spawnSyncImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: "ok\n", stderr: "" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.leakDetected, false);
  assert.deepEqual(result.injection, { mode: "env", envName: "SNPM_TEST_SECRET" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "child-bin");
  assert.deepEqual(calls[0].args, ["--flag"]);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.cwd, existingCwd);
  assert.equal(calls[0].options.env.SNPM_TEST_SECRET, "exact-secret");
  assert.equal("input" in calls[0].options, false);
});

test("runSecretExec injects the secret through stdin when requested", () => {
  const calls = [];

  const result = runSecretExec({
    childArgs: ["child-bin"],
    env: { PATH: "bin" },
    secretValue: "stdin-secret",
    spawnSyncImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: "consumed", stderr: "" };
    },
    stdinSecret: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.injection, { mode: "stdin", envName: null });
  assert.equal(calls[0].options.input, "stdin-secret");
  assert.deepEqual(calls[0].options.env, { PATH: "bin" });
});

test("runSecretExec redacts exact secret output and fails closed on leaks", () => {
  const result = runSecretExec({
    childArgs: ["child-bin"],
    env: {},
    envName: "SECRET_VALUE",
    secretValue: "super-secret",
    spawnSyncImpl: () => ({
      status: 0,
      stdout: "stdout super-secret\n",
      stderr: "stderr super-secret\n",
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 0);
  assert.equal(result.exitCode, 1);
  assert.equal(result.leakDetected, true);
  assert.equal(result.failure, SECRET_EXEC_LEAK_WARNING);
  assert.match(result.stdout, new RegExp(SECRET_REDACTION_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(result.stderr, new RegExp(SECRET_REDACTION_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(result.stdout, /super-secret/);
  assert.doesNotMatch(result.stderr, /super-secret/);
});

test("runSecretExec preserves child nonzero status when no secret leaked", () => {
  const result = runSecretExec({
    childArgs: ["child-bin"],
    env: {},
    envName: "SECRET_VALUE",
    secretValue: "super-secret",
    spawnSyncImpl: () => ({
      status: 7,
      stdout: "ordinary failure\n",
      stderr: "bad input\n",
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 7);
  assert.equal(result.exitCode, 7);
  assert.equal(result.leakDetected, false);
  assert.equal(result.failure, "Child command exited with status 7.");
});

test("runSecretExec reports child signal termination as a failure", () => {
  const result = runSecretExec({
    childArgs: ["child-bin"],
    env: {},
    envName: "SECRET_VALUE",
    secretValue: "super-secret",
    spawnSyncImpl: () => ({
      status: null,
      signal: "SIGTERM",
      stdout: "",
      stderr: "",
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 1);
  assert.equal(result.exitCode, 1);
  assert.equal(result.signal, "SIGTERM");
  assert.equal(result.failure, "Child command terminated with signal SIGTERM.");
});

test("validateSecretExecInjection rejects invalid modes, env names, and collisions", () => {
  assert.throws(
    () => validateSecretExecInjection({}),
    /exactly one/i,
  );

  assert.throws(
    () => validateSecretExecInjection({ envName: "SECRET_VALUE", stdinSecret: true }),
    /exactly one/i,
  );

  assert.throws(
    () => validateSecretExecInjection({ envName: "1SECRET" }),
    /valid environment variable name/i,
  );

  assert.throws(
    () => validateSecretExecInjection({ env: { Secret_Value: "already-set" }, envName: "SECRET_VALUE" }),
    /already exists/i,
  );

  assert.equal(findSecretExecEnvCollision("SECRET_VALUE", { Secret_Value: "already-set" }), "Secret_Value");
});

test("runSecretExec rejects invalid cwd before spawning the child", () => {
  let spawned = false;

  assert.throws(
    () => runSecretExec({
      childArgs: ["child-bin"],
      cwd: path.join(process.cwd(), ".missing-secret-exec-cwd"),
      env: {},
      envName: "SECRET_VALUE",
      secretValue: "super-secret",
      spawnSyncImpl: () => {
        spawned = true;
        return { status: 0, stdout: "", stderr: "" };
      },
    }),
    /--cwd must point to an existing directory/i,
  );

  assert.equal(spawned, false);
});

test("redactExactSecret only redacts exact secret-value occurrences", () => {
  const result = redactExactSecret("before line-one\nline-two after line-one\nline-two", "line-one\nline-two");

  assert.equal(result.redacted, true);
  assert.equal(
    result.text,
    `before ${SECRET_REDACTION_MARKER} after ${SECRET_REDACTION_MARKER}`,
  );
});
