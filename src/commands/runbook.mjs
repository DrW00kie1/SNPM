import { loadWorkspaceConfig } from "../notion/config.mjs";
import {
  adoptRunbook,
  createRunbook,
  diffRunbookBody,
  pullRunbookBody,
  pushRunbookBody,
} from "../notion/project-pages.mjs";
import { runManagedEditLoop } from "./editing.mjs";
import { readCommandInput, writeCommandOutput } from "./io.mjs";

export async function runRunbookCreate({
  apply = false,
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);

  return createRunbook({
    apply,
    config,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runRunbookAdopt({
  apply = false,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return adoptRunbook({
    apply,
    config,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runRunbookPull({
  outputPath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const result = await pullRunbookBody({
    config,
    projectName,
    projectTokenEnv,
    title,
  });

  const outputResult = writeCommandOutput(outputPath, result.bodyMarkdown);

  return {
    pageId: result.pageId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    ...outputResult,
  };
}

export async function runRunbookDiff({
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);

  return diffRunbookBody({
    config,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runRunbookPush({
  apply = false,
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);

  return pushRunbookBody({
    apply,
    config,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runRunbookEdit({
  apply = false,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
  editorCommand,
  openEditorImpl,
}) {
  const config = loadWorkspaceConfig(workspaceName);

  return runManagedEditLoop({
    apply,
    fileLabel: "runbook.md",
    editorCommand,
    openEditorImpl,
    pullImpl: () => pullRunbookBody({
      config,
      projectName,
      projectTokenEnv,
      title,
    }),
    pushImpl: ({ apply: shouldApply, fileBodyMarkdown }) => pushRunbookBody({
      apply: shouldApply,
      config,
      fileBodyMarkdown,
      projectName,
      projectTokenEnv,
      title,
    }),
  });
}
