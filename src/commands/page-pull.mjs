import { loadWorkspaceConfig } from "../notion/config.mjs";
import { pullApprovedPageBody } from "../notion/page-markdown.mjs";
import { writeCommandOutput } from "./io.mjs";

export async function runPagePull({
  outputPath,
  pagePath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const result = await pullApprovedPageBody({
    config,
    pagePath,
    projectName,
    projectTokenEnv,
  });

  const outputResult = writeCommandOutput(outputPath, result.bodyMarkdown);

  return {
    pageId: result.pageId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    ...outputResult,
  };
}
