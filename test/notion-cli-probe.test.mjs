import test from "node:test";
import assert from "node:assert/strict";

import { runDoctor } from "../src/commands/doctor.mjs";
import {
  probeNotionCli,
  resolveNotionCliVersionChildArgs,
} from "../src/notion-cli/probe.mjs";

test("probeNotionCli parses installed ntn version without exposing raw output", () => {
  const result = probeNotionCli({
    env: {
      PATH: "/usr/local/bin",
      NOTION_API_TOKEN: "must-not-pass-to-child",
    },
    platform: "linux",
    runChildCommandImpl({ childArgs, env }) {
      assert.deepEqual(childArgs, ["ntn", "--version"]);
      assert.equal(env.NOTION_API_TOKEN, undefined);
      return {
        ok: true,
        stdout: "ntn 0.16.0\n",
        stderr: "",
        spawnError: null,
      };
    },
  });

  assert.deepEqual(result, {
    checked: true,
    installed: true,
    version: "0.16.0",
    command: "ntn --version",
    warnings: [],
    safeNextCommands: [
      "node src/cli.mjs doctor --notion-cli",
      'node src/cli.mjs doctor --project "Project Name"',
      'node src/cli.mjs recommend --project "Project Name" --intent <intent>',
    ],
  });
});

test("resolveNotionCliVersionChildArgs uses the display command on non-Windows", () => {
  assert.deepEqual(
    resolveNotionCliVersionChildArgs({ platform: "linux" }),
    ["ntn", "--version"],
  );
});

test("probeNotionCli reports missing ntn as advisory", () => {
  const result = probeNotionCli({
    runChildCommandImpl() {
      return {
        ok: false,
        stdout: "",
        stderr: "not safe to echo",
        spawnError: new Error("spawn ntn ENOENT"),
      };
    },
  });

  assert.equal(result.checked, true);
  assert.equal(result.installed, false);
  assert.equal(result.version, null);
  assert.equal(result.command, "ntn --version");
  assert.match(result.warnings.join("\n"), /not found on PATH/i);
  assert.deepEqual(result.safeNextCommands, [
    "npm install --global ntn",
    "node src/cli.mjs doctor --notion-cli",
  ]);
  assert.doesNotMatch(JSON.stringify(result), /not safe to echo/);
});

test("probeNotionCli reports nonzero and malformed version output without failing closed workflows", () => {
  const nonzero = probeNotionCli({
    runChildCommandImpl() {
      return {
        ok: false,
        stdout: "",
        stderr: "not safe to echo",
        spawnError: null,
      };
    },
  });
  assert.equal(nonzero.installed, true);
  assert.equal(nonzero.version, null);
  assert.match(nonzero.warnings.join("\n"), /did not exit successfully/i);
  assert.doesNotMatch(JSON.stringify(nonzero), /not safe to echo/);

  const malformed = probeNotionCli({
    runChildCommandImpl() {
      return {
        ok: true,
        stdout: "ntn development build\n",
        stderr: "",
        spawnError: null,
      };
    },
  });
  assert.equal(malformed.installed, true);
  assert.equal(malformed.version, null);
  assert.match(malformed.warnings.join("\n"), /could not parse/i);
});

test("runDoctor supports a standalone notion-cli probe without project config", async () => {
  const result = await runDoctor({
    notionCli: true,
    notionCliProbeImpl: () => ({
      checked: true,
      installed: true,
      version: "0.16.0",
      command: "ntn --version",
      warnings: [],
      safeNextCommands: [],
    }),
  });

  assert.equal(result.authMode, "none");
  assert.equal(result.projectName, null);
  assert.equal(result.projectTokenChecked, false);
  assert.deepEqual(result.issues, []);
  assert.equal(result.notionCli.version, "0.16.0");
});

test("runDoctor still requires project unless the notion-cli probe is requested", async () => {
  await assert.rejects(
    () => runDoctor({}),
    /Provide --project "Project Name"/,
  );
});
