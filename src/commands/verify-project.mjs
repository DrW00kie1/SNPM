import { loadWorkspaceConfig } from "../notion/config.mjs";
import { verifyProject } from "../notion/project-bootstrap.mjs";

export async function runVerifyProject({
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return verifyProject(projectName, config, projectTokenEnv);
}

