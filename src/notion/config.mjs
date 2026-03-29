import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadWorkspaceConfig(workspaceName = "infrastructure-hq") {
  const configPath = path.join(__dirname, "..", "..", "config", "workspaces", `${workspaceName}.json`);
  return JSON.parse(readFileSync(configPath, "utf8"));
}

