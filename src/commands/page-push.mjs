import { readFileSync } from "node:fs";

import { loadWorkspaceConfig } from "../notion/config.mjs";
import { pushApprovedPageBody } from "../notion/page-markdown.mjs";

export async function runPagePush({
  apply = false,
  filePath,
  pagePath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

  return pushApprovedPageBody({
    apply,
    config,
    fileBodyMarkdown,
    pagePath,
    projectName,
    projectTokenEnv,
  });
}
