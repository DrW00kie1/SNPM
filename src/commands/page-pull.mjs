import { writeFileSync } from "node:fs";

import { loadWorkspaceConfig } from "../notion/config.mjs";
import { pullApprovedPageBody } from "../notion/page-markdown.mjs";

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

  writeFileSync(outputPath, result.bodyMarkdown, "utf8");

  return {
    pageId: result.pageId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    outputPath,
  };
}
