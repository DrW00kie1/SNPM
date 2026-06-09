import { loadWorkspaceConfig } from "../notion/config.mjs";
import { diagnoseProject } from "../notion/doctor.mjs";
import { recommendProjectUpdate } from "../notion/recommend.mjs";
import { probeNotionCli } from "../notion-cli/probe.mjs";

export async function runDoctor({
  projectName,
  projectTokenEnv,
  notionCli = false,
  notionCliProbeImpl = probeNotionCli,
  truthAudit = false,
  consistencyAudit = false,
  staleAfterDays,
  workspaceName = "infrastructure-hq",
}) {
  const notionCliResult = notionCli ? notionCliProbeImpl() : undefined;

  if (!projectName) {
    if (!notionCli) {
      throw new Error('Provide --project "Project Name".');
    }
    return {
      authMode: "none",
      projectName: null,
      projectTokenChecked: false,
      issues: [],
      recommendations: [],
      notionCli: notionCliResult,
    };
  }

  const config = loadWorkspaceConfig(workspaceName);
  const result = await diagnoseProject({
    config,
    projectName,
    projectTokenEnv,
    truthAudit,
    consistencyAudit,
    staleAfterDays,
  });

  return {
    ...result,
    ...(notionCli ? { notionCli: notionCliResult } : {}),
  };
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
