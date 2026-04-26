import test from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";

import {
  GENERATED_SECRET_MATERIAL_KIND,
  createGeneratedSecretMaterial,
  runGeneratedSecretCommand,
  unwrapGeneratedSecretMaterial,
} from "../src/commands/secret-generate.mjs";
import { SECRET_REDACTION_MARKER } from "../src/commands/secret-output-safety.mjs";

test("runGeneratedSecretCommand captures generator stdout with shell disabled and returns opaque material", () => {
  const calls = [];

  const result = runGeneratedSecretCommand({
    childArgs: ["generator-bin", "--dsn"],
    cwd: "C:/work",
    env: { PATH: "bin" },
    spawnSyncImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: "postgres://generated-secret\n", stderr: "" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  assert.equal(result.outputSuppressed, true);
  assert.equal(unwrapGeneratedSecretMaterial(result.secretMaterial), "postgres://generated-secret");
  assert.equal(result.secretMaterial.kind, GENERATED_SECRET_MATERIAL_KIND);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "generator-bin");
  assert.deepEqual(calls[0].args, ["--dsn"]);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.cwd, "C:/work");
  assert.deepEqual(calls[0].options.env, { PATH: "bin" });
});

test("generated secret material does not serialize or inspect as the raw value", () => {
  const material = createGeneratedSecretMaterial("super-secret-value");

  assert.equal(unwrapGeneratedSecretMaterial(material), "super-secret-value");
  assert.doesNotMatch(JSON.stringify(material), /super-secret-value/);
  assert.match(JSON.stringify(material), new RegExp(SECRET_REDACTION_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(inspect(material), /super-secret-value/);
  assert.match(inspect(material), new RegExp(SECRET_REDACTION_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("runGeneratedSecretCommand redactor redacts exact generated value", () => {
  const result = runGeneratedSecretCommand({
    childArgs: ["generator-bin"],
    spawnSyncImpl: () => ({ status: 0, stdout: "exact-secret", stderr: "" }),
  });

  const redacted = result.redactor.redact("before exact-secret after exact-secret");

  assert.equal(redacted.redacted, true);
  assert.equal(redacted.text, `before ${SECRET_REDACTION_MARKER} after ${SECRET_REDACTION_MARKER}`);
});

test("runGeneratedSecretCommand rejects nonzero status signals spawn errors and stderr without echoing output", () => {
  assert.deepEqual(
    runGeneratedSecretCommand({
      childArgs: ["generator-bin"],
      spawnSyncImpl: () => ({ status: 7, stdout: "secret-from-failed-generator", stderr: "" }),
    }),
    {
      ok: false,
      status: 7,
      exitCode: 7,
      signal: null,
      stdout: "",
      stderr: "",
      outputSuppressed: true,
      failure: "Generator command exited with status 7.",
    },
  );

  const signalResult = runGeneratedSecretCommand({
    childArgs: ["generator-bin"],
    spawnSyncImpl: () => ({ status: null, signal: "SIGTERM", stdout: "secret", stderr: "" }),
  });
  assert.equal(signalResult.ok, false);
  assert.equal(signalResult.failure, "Generator command terminated with signal SIGTERM.");
  assert.equal(signalResult.stdout, "");

  const errorResult = runGeneratedSecretCommand({
    childArgs: ["generator-bin"],
    spawnSyncImpl: () => ({ error: new Error("spawn failed with secret"), stdout: "secret", stderr: "" }),
  });
  assert.equal(errorResult.ok, false);
  assert.equal(errorResult.failure, "Generator command failed to start.");
  assert.equal(errorResult.stdout, "");

  const stderrResult = runGeneratedSecretCommand({
    childArgs: ["generator-bin"],
    spawnSyncImpl: () => ({ status: 0, stdout: "secret", stderr: "warning with secret" }),
  });
  assert.equal(stderrResult.ok, false);
  assert.equal(stderrResult.failure, "Generator command wrote to stderr; refusing generated secret ingestion.");
  assert.equal(stderrResult.stderr, "");
});

test("runGeneratedSecretCommand rejects invalid generated values without echoing them", () => {
  const cases = [
    { stdout: "", pattern: /empty value/i },
    { stdout: "<paste secret here>", pattern: /placeholder value/i },
    { stdout: SECRET_REDACTION_MARKER, pattern: /redacted value/i },
    { stdout: "abc\0def", pattern: /invalid value/i },
    { stdout: "line-one\nline-two", pattern: /multiline value/i },
    { stdout: "x".repeat(9), maxBytes: 8, pattern: /larger than 8 bytes/i },
  ];

  for (const item of cases) {
    const result = runGeneratedSecretCommand({
      childArgs: ["generator-bin"],
      maxBytes: item.maxBytes,
      spawnSyncImpl: () => ({ status: 0, stdout: item.stdout, stderr: "" }),
    });

    assert.equal(result.ok, false);
    assert.match(result.failure, item.pattern);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    if (item.stdout) {
      assert.doesNotMatch(JSON.stringify(result), new RegExp(item.stdout.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});

test("runGeneratedSecretCommand strips only one final newline before validation", () => {
  const valid = runGeneratedSecretCommand({
    childArgs: ["generator-bin"],
    spawnSyncImpl: () => ({ status: 0, stdout: "secret\r\n", stderr: "" }),
  });
  assert.equal(valid.ok, true);
  assert.equal(unwrapGeneratedSecretMaterial(valid.secretMaterial), "secret");

  const invalid = runGeneratedSecretCommand({
    childArgs: ["generator-bin"],
    spawnSyncImpl: () => ({ status: 0, stdout: "secret\n\n", stderr: "" }),
  });
  assert.equal(invalid.ok, false);
  assert.match(invalid.failure, /multiline value/i);
});

test("runGeneratedSecretCommand rejects argv-literal generated outputs", () => {
  const result = runGeneratedSecretCommand({
    childArgs: ["node", "-e", "console.log('literal-secret')"],
    spawnSyncImpl: () => ({ status: 0, stdout: "literal-secret\n", stderr: "" }),
  });

  assert.equal(result.ok, false);
  assert.match(result.failure, /appears in the generator argv/i);
  assert.doesNotMatch(JSON.stringify(result), /literal-secret/);
});

test("runGeneratedSecretCommand validates child command shape", () => {
  assert.throws(
    () => runGeneratedSecretCommand({ childArgs: [] }),
    /Provide a generator command after --/i,
  );

  assert.throws(
    () => runGeneratedSecretCommand({ childArgs: ["generator-bin", 1] }),
    /arguments must be strings/i,
  );
});
