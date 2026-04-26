import { loadWorkspaceConfig } from "../notion/config.mjs";
import {
  adoptDoc,
  createDoc,
  diffDocBody,
  pullDocBody,
  pushDocBody,
} from "../notion/doc-pages.mjs";
import { runManagedEditLoop } from "./editing.mjs";
import { readCommandInput, readCommandMetadataSidecar, writeCommandMetadataSidecar, writeCommandOutput } from "./io.mjs";

export async function runDocCreate({
  apply = false,
  filePath,
  docPath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);

  return createDoc({
    apply,
    config,
    docPath,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
  });
}

export async function runDocAdopt({
  apply = false,
  docPath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return adoptDoc({
    apply,
    config,
    docPath,
    projectName,
    projectTokenEnv,
  });
}

export async function runDocPull({
  metadataOutputPath,
  outputPath,
  docPath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const result = await pullDocBody({
    config,
    docPath,
    projectName,
    projectTokenEnv,
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

export async function runDocDiff({
  filePath,
  docPath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);

  return diffDocBody({
    config,
    docPath,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
  });
}

export async function runDocPush({
  apply = false,
  filePath,
  metadataPath,
  docPath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);
  const metadata = apply
    ? readCommandMetadataSidecar(filePath, { metadataPath }).metadata
    : undefined;

  return pushDocBody({
    apply,
    config,
    docPath,
    fileBodyMarkdown,
    metadata,
    projectName,
    projectTokenEnv,
    workspaceName,
  });
}

export async function runDocEdit({
  apply = false,
  docPath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
  editorCommand,
  openEditorImpl,
}) {
  const config = loadWorkspaceConfig(workspaceName);

  return runManagedEditLoop({
    apply,
    fileLabel: "doc.md",
    editorCommand,
    openEditorImpl,
    pullImpl: () => pullDocBody({
      config,
      docPath,
      projectName,
      projectTokenEnv,
      workspaceName,
    }),
    pushImpl: ({ apply: shouldApply, fileBodyMarkdown, metadata }) => pushDocBody({
      apply: shouldApply,
      config,
      docPath,
      fileBodyMarkdown,
      metadata,
      projectName,
      projectTokenEnv,
      workspaceName,
    }),
  });
}
