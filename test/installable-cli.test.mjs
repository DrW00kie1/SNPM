import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function writeWorkspaceConfig(configDir, name, overrides = {}) {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, `${name}.json`), JSON.stringify({
    notionVersion: "2026-03-11",
    workspace: {
      projectsPageId: `${name}-projects-page-id`,
      projectTemplatesPageId: `${name}-templates-page-id`,
      managedDocs: {
        exactPages: [{ path: "Projects", pageId: `${name}-projects-page-id` }],
        subtreeRoots: [{ path: "Templates > Project Templates", pageId: `${name}-templates-page-id` }],
      },
      forbiddenScopePageIds: { home: `${name}-home-page-id` },
    },
    projectStarter: {
      children: [{ title: "Planning", children: [{ title: "Roadmap", children: [] }] }],
    },
    ...overrides,
  }));
}

function makeInstalledLayout(tempDir) {
  const installRoot = path.join(tempDir, "installed", "node_modules", "snpm");
  cpSync(path.join(REPO_ROOT, "src"), path.join(installRoot, "src"), { recursive: true });
  cpSync(path.join(REPO_ROOT, "config", "workspaces"), path.join(installRoot, "config", "workspaces"), { recursive: true });
  return installRoot;
}

function makeCallerRepo(tempDir) {
  const callerRepo = path.join(tempDir, "caller-repo");
  const callerWorkspaceDir = path.join(callerRepo, "config", "workspaces");
  mkdirSync(callerWorkspaceDir, { recursive: true });
  writeFileSync(
    path.join(callerWorkspaceDir, "infrastructure-hq.json"),
    "{ this caller-local workspace config must not be read",
  );
  writeFileSync(
    path.join(callerWorkspaceDir, "infrastructure-hq.example.json"),
    "{ this caller-local example workspace config must not be read",
  );
  return callerRepo;
}

function quoteWindowsCommandArg(arg) {
  const value = String(arg);
  if (value === "") {
    return "\"\"";
  }

  return /[\s"]/u.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value;
}

function runNpm(args, { cwd }) {
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", ["npm", ...args].map(quoteWindowsCommandArg).join(" ")]
    : args;

  return spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

function packAndInstallSnpm(tempDir) {
  const packDir = path.join(tempDir, "pack");
  const consumerRoot = path.join(tempDir, "consumer");
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerRoot, { recursive: true });

  const packResult = runNpm(["pack", "--silent", "--pack-destination", packDir, "--ignore-scripts"], { cwd: REPO_ROOT });
  assert.equal(packResult.status, 0, packResult.stderr || packResult.stdout);
  const tarballName = packResult.stdout.trim().split(/\r?\n/u).at(-1);
  assert.ok(tarballName, `Expected npm pack to print a tarball name. stdout: ${packResult.stdout}`);
  const tarballPath = path.resolve(packDir, tarballName);

  writeFileSync(path.join(consumerRoot, "package.json"), `${JSON.stringify({
    private: true,
    type: "module",
  }, null, 2)}\n`);
  const installResult = runNpm(
    ["install", "--silent", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath],
    { cwd: consumerRoot },
  );
  assert.equal(installResult.status, 0, installResult.stderr || installResult.stdout);

  return consumerRoot;
}

function writeNotionFetchPreload(preloadPath) {
  const markdownByPageId = [
    ["private-workspace-projects-page-id", "Canonical Source: Projects\nLast Updated: 2026-04-28\n\n---\n# Projects\n"],
    ["private-workspace-templates-page-id", "Canonical Source: Templates \\> Project Templates\nLast Updated: 2026-04-28\n\n---\n# Project Templates\n"],
  ];
  const preloadSource = `
const markdownByPageId = new Map(${JSON.stringify(markdownByPageId)});

function jsonResponse(payload, { status = 200 } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  const method = String(options.method || "GET").toUpperCase();
  const apiPath = parsed.pathname.replace(/^\\/v1\\//u, "");

  if (method === "GET" && apiPath.startsWith("pages/") && apiPath.endsWith("/markdown")) {
    const pageId = apiPath.slice("pages/".length, -"/markdown".length);
    if (markdownByPageId.has(pageId)) {
      return jsonResponse({
        markdown: markdownByPageId.get(pageId),
        truncated: false,
        unknown_block_ids: [],
      });
    }
  }

  if (method === "GET" && apiPath.startsWith("blocks/") && apiPath.endsWith("/children")) {
    return jsonResponse({
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    });
  }

  return jsonResponse({
    object: "error",
    code: "unexpected_test_request",
    message: "Unexpected " + method + " " + apiPath,
  }, { status: 500 });
};
`;
  writeFileSync(preloadPath, preloadSource);
}

function nodeOptionsWithImport(modulePath) {
  const preloadOption = `--import=${pathToFileURL(modulePath).href}`;
  return process.env.NODE_OPTIONS
    ? `${process.env.NODE_OPTIONS} ${preloadOption}`
    : preloadOption;
}

function runInstalledSnpm({ args, consumerRoot, cwd, env = {} }) {
  const binPath = path.join(
    consumerRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "snpm.cmd" : "snpm",
  );
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : binPath;
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", [binPath, ...args].map(quoteWindowsCommandArg).join(" ")]
    : args;

  return spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

function runConfigProbe({ cwd, installRoot, env = {}, script }) {
  const configUrl = pathToFileURL(path.join(installRoot, "src", "notion", "config.mjs")).href;
  return spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { loadWorkspaceConfig, resolveWorkspaceConfigPath } from ${JSON.stringify(configUrl)};
    ${script}
  `], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      SNPM_WORKSPACE_CONFIG_DIR: "",
      ...env,
    },
  });
}

test("installed config loading ignores caller repo ./config/workspaces from outside cwd", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-installable-config-"));
  try {
    const installRoot = makeInstalledLayout(tempDir);
    const callerRepo = makeCallerRepo(tempDir);

    const result = runConfigProbe({
      cwd: callerRepo,
      installRoot,
      script: `
        const configPath = resolveWorkspaceConfigPath("infrastructure-hq.example");
        const config = loadWorkspaceConfig("infrastructure-hq.example");
        console.log(JSON.stringify({
          configPath,
          notionVersion: config.notionVersion,
          starterRoot: config.projectStarter.children[0].title
        }));
      `,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.notionVersion, "2026-03-11");
    assert.equal(payload.starterRoot, "Ops");
    assert.equal(path.dirname(payload.configPath), path.join(installRoot, "config", "workspaces"));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("packed snpm binary uses SNPM_WORKSPACE_CONFIG_DIR from outside the source repo", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-packed-runtime-config-"));
  try {
    const consumerRoot = packAndInstallSnpm(tempDir);
    const callerRepo = makeCallerRepo(tempDir);
    const callerWorkspaceDir = path.join(callerRepo, "config", "workspaces");
    writeFileSync(
      path.join(callerWorkspaceDir, "private-workspace.json"),
      "{ this caller-local private workspace config must not be read",
    );

    const privateConfigDir = path.join(tempDir, "private-workspaces");
    writeWorkspaceConfig(privateConfigDir, "private-workspace");
    const preloadPath = path.join(tempDir, "notion-fetch-preload.mjs");
    writeNotionFetchPreload(preloadPath);

    const result = runInstalledSnpm({
      consumerRoot,
      cwd: callerRepo,
      args: ["verify-workspace-docs", "--workspace", "private-workspace"],
      env: {
        NODE_OPTIONS: nodeOptionsWithImport(preloadPath),
        NOTION_TOKEN: "test-notion-token",
        SNPM_WORKSPACE_CONFIG_DIR: privateConfigDir,
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.command, "verify-workspace-docs");
    assert.deepEqual(payload.checkedPaths, ["Projects", "Templates > Project Templates"]);
    assert.deepEqual(payload.failures, []);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("SNPM_WORKSPACE_CONFIG_DIR works for installed config loading from a different cwd", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "snpm-installable-config-dir-"));
  try {
    const installRoot = makeInstalledLayout(tempDir);
    const callerRepo = makeCallerRepo(tempDir);
    const privateConfigDir = path.join(tempDir, "private-workspaces");
    writeWorkspaceConfig(privateConfigDir, "private-workspace");

    const result = runConfigProbe({
      cwd: callerRepo,
      installRoot,
      env: {
        SNPM_WORKSPACE_CONFIG_DIR: privateConfigDir,
      },
      script: `
        const configPath = resolveWorkspaceConfigPath("private-workspace");
        const config = loadWorkspaceConfig("private-workspace");
        console.log(JSON.stringify({
          configPath,
          projectsPageId: config.workspace.projectsPageId,
          starterRoot: config.projectStarter.children[0].title
        }));
      `,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.configPath, path.join(privateConfigDir, "private-workspace.json"));
    assert.equal(payload.projectsPageId, "private-workspace-projects-page-id");
    assert.equal(payload.starterRoot, "Planning");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
