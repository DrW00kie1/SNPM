import { loadWorkspaceConfig } from "../notion/config.mjs";
import { pullApprovedPageBody, pushApprovedPageBody } from "../notion/page-markdown.mjs";
import { runManagedEditLoop } from "./editing.mjs";
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

export async function runPageEdit({
  apply = false,
  pagePath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
  editorCommand,
  openEditorImpl,
}) {
  const config = loadWorkspaceConfig(workspaceName);

  return runManagedEditLoop({
    apply,
    fileLabel: "page.md",
    editorCommand,
    openEditorImpl,
    pullImpl: () => pullApprovedPageBody({
      config,
      pagePath,
      projectName,
      projectTokenEnv,
    }),
    pushImpl: ({ apply: shouldApply, fileBodyMarkdown }) => pushApprovedPageBody({
      apply: shouldApply,
      config,
      fileBodyMarkdown,
      pagePath,
      projectName,
      projectTokenEnv,
    }),
  });
}
