import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runChildCommand } from "../src/commands/child-runner.mjs";

test("runChildCommand executes argv arrays without shell expansion", () => {
  const result = runChildCommand({
    childArgs: [process.execPath, "-e", "console.log(process.argv[1])", "literal * value"],
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "literal * value\n");
  assert.equal(result.stderr, "");
  assert.equal(result.failure, null);
});

test("runChildCommand copies env and does not mutate the caller env object", () => {
  const env = { SNPM_CHILD_RUNNER_ENV: "present" };
  let capturedCommand;
  let capturedArgs;
  let capturedEnv;
  let capturedOptions;

  const result = runChildCommand({
    childArgs: ["child-bin", "--flag"],
    env,
    spawnSyncImpl: (command, args, options) => {
      capturedCommand = command;
      capturedArgs = args;
      capturedEnv = options.env;
      capturedOptions = options;
      options.env.ADDED_BY_CHILD_RUNNER_TEST = "mutated-copy";
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(capturedCommand, "child-bin");
  assert.deepEqual(capturedArgs, ["--flag"]);
  assert.equal(capturedOptions.encoding, "utf8");
  assert.equal(capturedOptions.shell, false);
  assert.equal(capturedOptions.windowsHide, true);
  assert.notEqual(capturedEnv, env);
  assert.equal(capturedEnv.SNPM_CHILD_RUNNER_ENV, "present");
  assert.equal(env.ADDED_BY_CHILD_RUNNER_TEST, undefined);
});

test("runChildCommand passes validated cwd when provided", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "snpm-child-runner-"));

  try {
    const result = runChildCommand({
      childArgs: [process.execPath, "-e", "console.log(process.cwd())"],
      cwd: tempDir,
      env: {},
    });

    assert.equal(result.ok, true);
    assert.equal(path.resolve(result.stdout.trim()), path.resolve(tempDir));
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

test("runChildCommand passes optional stdin input", () => {
  const result = runChildCommand({
    childArgs: [process.execPath, "-e", "process.stdin.pipe(process.stdout)"],
    env: {},
    input: "stdin payload",
  });

  assert.equal(result.ok, true);
  assert.equal(result.stdout, "stdin payload");
});

test("runChildCommand normalizes nonzero exits", () => {
  const result = runChildCommand({
    childArgs: [process.execPath, "-e", "process.stderr.write('bad input'); process.exit(7)"],
    env: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 7);
  assert.equal(result.exitCode, 7);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "bad input");
  assert.equal(result.failure, "Child command exited with status 7.");
});

test("runChildCommand normalizes signal termination", () => {
  const result = runChildCommand({
    childArgs: ["child-bin"],
    spawnSyncImpl: () => ({ status: null, signal: "SIGTERM", stdout: "", stderr: "" }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 1);
  assert.equal(result.exitCode, 1);
  assert.equal(result.signal, "SIGTERM");
  assert.equal(result.failure, "Child command terminated with signal SIGTERM.");
});

test("runChildCommand normalizes spawn errors", () => {
  const spawnError = new Error("ENOENT");

  const result = runChildCommand({
    childArgs: ["missing-child-bin"],
    spawnSyncImpl: () => ({ error: spawnError, stdout: "", stderr: "" }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 1);
  assert.equal(result.exitCode, 1);
  assert.equal(result.spawnError, spawnError);
  assert.equal(result.failure, "Child command failed to start.");
});

test("runChildCommand rejects invalid child args before spawning", () => {
  let spawned = false;

  assert.throws(
    () => runChildCommand({
      childArgs: [],
      spawnSyncImpl: () => {
        spawned = true;
        return { status: 0, stdout: "", stderr: "" };
      },
    }),
    /Provide a child command after --/i,
  );

  assert.equal(spawned, false);
});

test("runChildCommand rejects invalid cwd before spawning", () => {
  let spawned = false;

  assert.throws(
    () => runChildCommand({
      childArgs: ["child-bin"],
      cwd: path.join(process.cwd(), ".missing-child-runner-cwd"),
      spawnSyncImpl: () => {
        spawned = true;
        return { status: 0, stdout: "", stderr: "" };
      },
    }),
    /--cwd must point to an existing directory/i,
  );

  assert.equal(spawned, false);
});
