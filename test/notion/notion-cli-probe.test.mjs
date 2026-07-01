import test from "node:test";
import assert from "node:assert/strict";

import { redactResolvedPageError, runDoctor } from "../../src/commands/doctor.mjs";
import { NotionApiError } from "../../src/notion/errors.mjs";
import {
  probeNotionCli,
  resolveNotionCliVersionChildArgs,
} from "../../src/notion-cli/probe.mjs";

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

test("runDoctor requires project and project-token-env for the notion-cli-api probe", async () => {
  await assert.rejects(
    () => runDoctor({ notionCli: true, notionCliApi: true }),
    /Provide --project "Project Name"/,
  );
  await assert.rejects(
    () => runDoctor({ projectName: "SNPM", notionCliApi: true }),
    /Provide --project-token-env PROJECT_NAME_NOTION_TOKEN for --notion-cli-api/,
  );
});

test("runDoctor requires project, project-token-env, and approved page for the notion-cli-pages probe", async () => {
  await assert.rejects(
    () => runDoctor({ notionCliPages: true, notionCliPagePath: "Planning > Roadmap" }),
    /Provide --project "Project Name"/,
  );
  await assert.rejects(
    () => runDoctor({ projectName: "SNPM", notionCliPages: true, notionCliPagePath: "Planning > Roadmap" }),
    /Provide --project-token-env PROJECT_NAME_NOTION_TOKEN for --notion-cli-pages/,
  );
  await assert.rejects(
    () => runDoctor({
      projectName: "SNPM",
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      notionCliPages: true,
    }),
    /Provide --page "Planning > <Page Name>"/,
  );
  await assert.rejects(
    () => runDoctor({
      projectName: "SNPM",
      projectTokenEnv: "SNPM_NOTION_TOKEN",
      notionCliPages: true,
      notionCliPagePath: "Access > Database",
    }),
    /Approved page targets are limited/,
  );
});

test("runDoctor wires notion-cli-api through an injectable project-scoped probe", async () => {
  const result = await runDoctor({
    projectName: "SNPM",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    workspaceName: "infrastructure-hq.example",
    notionCliApi: true,
    diagnoseProjectImpl({ config, projectName, projectTokenEnv }) {
      assert.ok(config.workspace);
      assert.equal(projectName, "SNPM");
      assert.equal(projectTokenEnv, "SNPM_NOTION_TOKEN");
      return {
        authMode: "project-token",
        projectName,
        projectTokenChecked: true,
        issues: [],
        recommendations: [],
      };
    },
    notionCliApiProbeImpl({ config, projectName, projectTokenEnv, workspaceName, doctorResult }) {
      assert.ok(config.workspace);
      assert.equal(projectName, "SNPM");
      assert.equal(projectTokenEnv, "SNPM_NOTION_TOKEN");
      assert.equal(workspaceName, "infrastructure-hq.example");
      assert.equal(doctorResult.authMode, "project-token");
      return {
        checked: true,
        available: true,
        ok: true,
        command: "ntn api --method GET pages/<project-page>",
        target: "project-page",
        object: "page",
        warnings: [],
        safeNextCommands: [],
      };
    },
  });

  assert.equal(result.projectName, "SNPM");
  assert.equal(result.notionCliApi.checked, true);
  assert.equal(result.notionCliApi.available, true);
  assert.equal(result.notionCliApi.command, "ntn api --method GET pages/<project-page>");
});

test("runDoctor wires notion-cli-pages through an injectable project-scoped probe", async () => {
  let probeCalled = false;
  const result = await runDoctor({
    projectName: "SNPM",
    projectTokenEnv: "SNPM_NOTION_TOKEN",
    workspaceName: "infrastructure-hq.example",
    notionCliPages: true,
    notionCliPagePath: "Planning > Roadmap",
    diagnoseProjectImpl({ config, projectName, projectTokenEnv }) {
      assert.ok(config.workspace);
      assert.equal(projectName, "SNPM");
      assert.equal(projectTokenEnv, "SNPM_NOTION_TOKEN");
      return {
        authMode: "project-token",
        projectName,
        projectTokenChecked: true,
        issues: [],
        recommendations: [],
      };
    },
    notionCliPagesProbeImpl({ config, projectName, projectTokenEnv, workspaceName, pagePath, doctorResult }) {
      probeCalled = true;
      assert.ok(config.workspace);
      assert.equal(projectName, "SNPM");
      assert.equal(projectTokenEnv, "SNPM_NOTION_TOKEN");
      assert.equal(workspaceName, "infrastructure-hq.example");
      assert.equal(pagePath, "Planning > Roadmap");
      assert.equal(doctorResult.authMode, "project-token");
      return {
        checked: true,
        available: true,
        targetPath: "Projects > SNPM > Planning > Roadmap",
        command: "ntn pages get <resolved-page> --json --notion-version <version>",
        matches: true,
        hasDiff: false,
        normalizationNotes: ["lf-newlines"],
        warnings: [],
        safeNextCommands: [],
        recommendation: "ntn-pages-get-is-compatible-for-this-approved-page",
      };
    },
  });

  assert.equal(probeCalled, true);
  assert.equal(result.projectName, "SNPM");
  assert.equal(result.notionCliPages.checked, true);
  assert.equal(result.notionCliPages.available, true);
  assert.equal(result.notionCliPages.matches, true);
  assert.equal(result.notionCliPages.command, "ntn pages get <resolved-page> --json --notion-version <version>");
});

test("redactResolvedPageError removes raw Notion identifiers from probe errors", () => {
  const error = new NotionApiError("GET blocks/3319f5f6-66d0-81ab-b6e8-c4fe3e2047be/children failed", {
    method: "GET",
    apiPath: "blocks/3319f5f6-66d0-81ab-b6e8-c4fe3e2047be/children?page_id=3319f5f666d081abb6e8c4fe3e2047be",
    status: 404,
    code: "object_not_found",
    body: "",
    details: null,
  });

  const redacted = redactResolvedPageError(error);

  assert.doesNotMatch(JSON.stringify(redacted), /3319f5f6|3319f5f666d081abb6e8c4fe3e2047be/i);
  assert.match(redacted.message, /<notion-id>/);
  assert.match(redacted.apiPath, /<notion-id>/);
});
