import { loadWorkspaceConfig } from "../notion/config.mjs";
import { pullApprovedPageBody, pushApprovedPageBody } from "../notion/page-markdown.mjs";
import { runManagedEditLoop } from "./editing.mjs";
import { readCommandInput, readCommandMetadataSidecar } from "./io.mjs";

export async function runPagePush({
  apply = false,
  filePath,
  metadataPath,
  pagePath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);
  const metadata = apply
    ? readCommandMetadataSidecar(filePath, { metadataPath }).metadata
    : undefined;

  return pushApprovedPageBody({
    apply,
    config,
    fileBodyMarkdown,
    metadata,
    pagePath,
    projectName,
    projectTokenEnv,
    workspaceName,
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
      workspaceName,
    }),
    pushImpl: ({ apply: shouldApply, fileBodyMarkdown, metadata }) => pushApprovedPageBody({
      apply: shouldApply,
      config,
      fileBodyMarkdown,
      metadata,
      pagePath,
      projectName,
      projectTokenEnv,
      workspaceName,
    }),
  });
}
