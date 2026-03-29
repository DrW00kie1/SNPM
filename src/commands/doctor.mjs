import { loadWorkspaceConfig } from "../notion/config.mjs";
import { diagnoseProject } from "../notion/doctor.mjs";

export async function runDoctor({
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return diagnoseProject({
    config,
    projectName,
    projectTokenEnv,
  });
}
