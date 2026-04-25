import { loadWorkspaceConfig } from "../notion/config.mjs";
import { diagnoseProject } from "../notion/doctor.mjs";
import { recommendProjectUpdate } from "../notion/recommend.mjs";

export async function runDoctor({
  projectName,
  projectTokenEnv,
  truthAudit = false,
  staleAfterDays,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return diagnoseProject({
    config,
    projectName,
    projectTokenEnv,
    truthAudit,
    staleAfterDays,
  });
}

export async function runRecommend({
  projectName,
  projectTokenEnv,
  intent,
  pagePath,
  docPath,
  title,
  domainTitle,
  repoPath,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return recommendProjectUpdate({
    config,
    projectName,
    projectTokenEnv,
    intent,
    pagePath,
    docPath,
    title,
    domainTitle,
    repoPath,
  });
}
