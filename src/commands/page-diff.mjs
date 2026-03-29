import { loadWorkspaceConfig } from "../notion/config.mjs";
import { diffApprovedPageBody } from "../notion/page-markdown.mjs";
import { readCommandInput } from "./io.mjs";

export async function runPageDiff({
  filePath,
  pagePath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);

  return diffApprovedPageBody({
    config,
    fileBodyMarkdown,
    pagePath,
    projectName,
    projectTokenEnv,
  });
}
