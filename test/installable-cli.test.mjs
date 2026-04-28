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
  return callerRepo;
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
        const configPath = resolveWorkspaceConfigPath("infrastructure-hq");
        const config = loadWorkspaceConfig("infrastructure-hq");
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
