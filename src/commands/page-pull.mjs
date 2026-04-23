import { loadWorkspaceConfig } from "../notion/config.mjs";
import { pullApprovedPageBody } from "../notion/page-markdown.mjs";
import { writeCommandMetadataSidecar, writeCommandOutput } from "./io.mjs";

export async function runPagePull({
  metadataOutputPath,
  outputPath,
  pagePath,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const result = await pullApprovedPageBody({
    config,
    pagePath,
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
