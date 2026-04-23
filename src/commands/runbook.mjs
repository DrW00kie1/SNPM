import { loadWorkspaceConfig } from "../notion/config.mjs";
import {
  adoptRunbook,
  createRunbook,
  diffRunbookBody,
  pullRunbookBody,
  pushRunbookBody,
} from "../notion/project-pages.mjs";
import { runManagedEditLoop } from "./editing.mjs";
import { readCommandInput, readCommandMetadataSidecar, writeCommandMetadataSidecar, writeCommandOutput } from "./io.mjs";

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
  metadataOutputPath,
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
    commandFamily: "runbook",
    workspaceName,
  });

  const outputResult = writeCommandOutput(outputPath, result.bodyMarkdown);
  const metadataResult = outputPath !== "-" || metadataOutputPath
    ? writeCommandMetadataSidecar(outputPath, result.metadata, { metadataPath: metadataOutputPath })
    : { metadataPath: null };

  return {
    pageId: result.pageId,
    projectId: result.projectId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    metadata: result.metadata,
    ...metadataResult,
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
  metadataPath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);
  const metadata = apply
    ? readCommandMetadataSidecar(filePath, { metadataPath }).metadata
    : undefined;

  return pushRunbookBody({
    apply,
    config,
    fileBodyMarkdown,
    metadata,
    projectName,
    projectTokenEnv,
    title,
    commandFamily: "runbook",
    workspaceName,
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
      commandFamily: "runbook",
      workspaceName,
    }),
    pushImpl: ({ apply: shouldApply, fileBodyMarkdown, metadata }) => pushRunbookBody({
      apply: shouldApply,
      config,
      fileBodyMarkdown,
      metadata,
      projectName,
      projectTokenEnv,
      title,
      commandFamily: "runbook",
      workspaceName,
    }),
  });
}
