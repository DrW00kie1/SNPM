import { loadWorkspaceConfig } from "../notion/config.mjs";
import { diagnoseProject } from "../notion/doctor.mjs";
import { getProjectToken } from "../notion/env.mjs";
import { serializeSafeNotionError } from "../notion/errors.mjs";
import { recommendProjectUpdate } from "../notion/recommend.mjs";
import { makeNotionCliApiClient, summarizeNotionCliApiProbe } from "../notion-cli/api-adapter.mjs";
import { probeNotionCli } from "../notion-cli/probe.mjs";

async function probeNotionCliApi({
  config,
  projectTokenEnv,
  doctorResult,
  makeClient = makeNotionCliApiClient,
}) {
  const token = getProjectToken(projectTokenEnv);
  const client = makeClient(token, config.notionVersion);
  const projectId = doctorResult.projectId;

  try {
    const page = await client.request("GET", `pages/${projectId}`);
    return summarizeNotionCliApiProbe({
      ok: true,
      pageId: projectId,
      object: page?.object,
      warnings: [],
    });
  } catch (error) {
    return {
      ...summarizeNotionCliApiProbe({
        ok: false,
        pageId: projectId,
        object: null,
        warnings: ["Notion CLI API probe failed; SNPM fetch-backed transport remains the supported default."],
      }),
      error: serializeSafeNotionError(error),
    };
  }
}

export async function runDoctor({
  projectName,
  projectTokenEnv,
  notionCli = false,
  notionCliApi = false,
  diagnoseProjectImpl = diagnoseProject,
  notionCliProbeImpl = probeNotionCli,
  notionCliApiProbeImpl = probeNotionCliApi,
  truthAudit = false,
  consistencyAudit = false,
  staleAfterDays,
  workspaceName = "infrastructure-hq",
}) {
  const notionCliResult = notionCli ? notionCliProbeImpl() : undefined;

  if (!projectName) {
    if (!notionCli || notionCliApi) {
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
  if (notionCliApi && !projectTokenEnv) {
    throw new Error("Provide --project-token-env PROJECT_NAME_NOTION_TOKEN for --notion-cli-api.");
  }

  const config = loadWorkspaceConfig(workspaceName);
  const result = await diagnoseProjectImpl({
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
    ...(notionCliApi
      ? {
        notionCliApi: await notionCliApiProbeImpl({
          config,
          projectName,
          projectTokenEnv,
          workspaceName,
          doctorResult: result,
        }),
      }
      : {}),
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
