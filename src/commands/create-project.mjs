import { loadWorkspaceConfig } from "../notion/config.mjs";
import { createProject } from "../notion/project-bootstrap.mjs";

export async function runCreateProject({ projectName, workspaceName = "infrastructure-hq" }) {
  const config = loadWorkspaceConfig(workspaceName);
  return createProject(projectName, config);
}

