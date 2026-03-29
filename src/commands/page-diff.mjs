import { readFileSync } from "node:fs";

import { loadWorkspaceConfig } from "../notion/config.mjs";
import { diffApprovedPageBody } from "../notion/page-markdown.mjs";

export async function runPageDiff({
  filePath,
  pagePath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

  return diffApprovedPageBody({
    config,
    fileBodyMarkdown,
    pagePath,
    projectName,
    projectTokenEnv,
  });
}
