import { loadWorkspaceConfig } from "../notion/config.mjs";
import {
  createBuildRecord,
  diffBuildRecordBody,
  pullBuildRecordBody,
  pushBuildRecordBody,
} from "../notion/project-pages.mjs";
import { readCommandInput, readCommandMetadataSidecar, writeCommandMetadataSidecar, writeCommandOutput } from "./io.mjs";

export async function runBuildRecordCreate({
  apply = false,
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);

  return createBuildRecord({
    apply,
    config,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runBuildRecordPull({
  metadataOutputPath,
  outputPath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const result = await pullBuildRecordBody({
    config,
    projectName,
    projectTokenEnv,
    title,
    commandFamily: "build-record",
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

export async function runBuildRecordDiff({
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);

  return diffBuildRecordBody({
    config,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runBuildRecordPush({
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

  return pushBuildRecordBody({
    apply,
    config,
    fileBodyMarkdown,
    metadata,
    projectName,
    projectTokenEnv,
    title,
    commandFamily: "build-record",
    workspaceName,
  });
}
