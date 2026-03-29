import { loadWorkspaceConfig } from "../notion/config.mjs";
import { pushApprovedPageBody } from "../notion/page-markdown.mjs";
import { readCommandInput } from "./io.mjs";

export async function runPagePush({
  apply = false,
  filePath,
  pagePath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);

  return pushApprovedPageBody({
    apply,
    config,
    fileBodyMarkdown,
    pagePath,
    projectName,
    projectTokenEnv,
  });
}
