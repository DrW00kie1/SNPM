import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeProjectPolicyPack } from "./project-policy.mjs";
import { validateWorkspaceName } from "../validators.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveWorkspaceConfigPath(workspaceName = "infrastructure-hq") {
  const validatedWorkspaceName = validateWorkspaceName(workspaceName);
  const configDir = typeof process.env.SNPM_WORKSPACE_CONFIG_DIR === "string"
    ? process.env.SNPM_WORKSPACE_CONFIG_DIR.trim()
    : "";
  if (configDir) {
    return path.resolve(configDir, `${validatedWorkspaceName}.json`);
  }
  return path.join(__dirname, "..", "..", "config", "workspaces", `${validatedWorkspaceName}.json`);
}

function requireNonEmptyString(value, label, sourceLabel) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${sourceLabel} must include a non-empty string for ${label}.`);
  }
}

function validateManagedDocEntries(entries, label, sourceLabel) {
  if (!Array.isArray(entries)) {
    throw new Error(`${sourceLabel} must include an array for ${label}.`);
  }

  for (const [index, entry] of entries.entries()) {
    const entryLabel = `${label}[${index}]`;
    if (!entry || typeof entry !== "object") {
      throw new Error(`${sourceLabel} must include an object for ${entryLabel}.`);
    }
    requireNonEmptyString(entry.path, `${entryLabel}.path`, sourceLabel);
    requireNonEmptyString(entry.pageId, `${entryLabel}.pageId`, sourceLabel);
  }
}

function validateTreeNodes(nodes, label, sourceLabel) {
  if (!Array.isArray(nodes)) {
    throw new Error(`${sourceLabel} must include an array for ${label}.`);
  }

  for (const [index, node] of nodes.entries()) {
    const nodeLabel = `${label}[${index}]`;
    if (!node || typeof node !== "object") {
      throw new Error(`${sourceLabel} must include an object for ${nodeLabel}.`);
    }
    requireNonEmptyString(node.title, `${nodeLabel}.title`, sourceLabel);
    validateTreeNodes(node.children, `${nodeLabel}.children`, sourceLabel);
  }
}

export function validateWorkspaceConfig(config, sourceLabel = "workspace config") {
  if (!config || typeof config !== "object") {
    throw new Error(`${sourceLabel} must contain a JSON object.`);
  }

  requireNonEmptyString(config.notionVersion, "notionVersion", sourceLabel);

  if (!config.workspace || typeof config.workspace !== "object") {
    throw new Error(`${sourceLabel} must include a workspace object.`);
  }
  requireNonEmptyString(config.workspace.projectsPageId, "workspace.projectsPageId", sourceLabel);
  requireNonEmptyString(config.workspace.projectTemplatesPageId, "workspace.projectTemplatesPageId", sourceLabel);
  if (!config.workspace.managedDocs || typeof config.workspace.managedDocs !== "object") {
    throw new Error(`${sourceLabel} must include workspace.managedDocs.`);
  }
  validateManagedDocEntries(config.workspace.managedDocs.exactPages, "workspace.managedDocs.exactPages", sourceLabel);
  validateManagedDocEntries(config.workspace.managedDocs.subtreeRoots, "workspace.managedDocs.subtreeRoots", sourceLabel);

  if (!config.workspace.forbiddenScopePageIds || typeof config.workspace.forbiddenScopePageIds !== "object") {
    throw new Error(`${sourceLabel} must include workspace.forbiddenScopePageIds.`);
  }
  for (const [label, value] of Object.entries(config.workspace.forbiddenScopePageIds)) {
    requireNonEmptyString(value, `workspace.forbiddenScopePageIds.${label}`, sourceLabel);
  }

  if (!config.projectStarter || typeof config.projectStarter !== "object") {
    throw new Error(`${sourceLabel} must include a projectStarter object.`);
  }
  validateTreeNodes(config.projectStarter.children, "projectStarter.children", sourceLabel);

  config.policyPack = normalizeProjectPolicyPack(config, sourceLabel);
  return config;
}

export function loadWorkspaceConfig(workspaceName = "infrastructure-hq") {
  const configPath = resolveWorkspaceConfigPath(workspaceName);

  let raw;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Unknown workspace "${workspaceName}". Expected config at ${configPath}.`);
    }
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${configPath}: ${error.message}`);
  }

  return validateWorkspaceConfig(parsed, configPath);
}
