import { readFileSync, writeFileSync } from "node:fs";

import { loadWorkspaceConfig } from "../notion/config.mjs";
import {
  createBuildRecord,
  diffBuildRecordBody,
  pullBuildRecordBody,
  pushBuildRecordBody,
} from "../notion/project-pages.mjs";

export async function runBuildRecordCreate({
  apply = false,
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

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
  });

  writeFileSync(outputPath, result.bodyMarkdown, "utf8");

  return {
    pageId: result.pageId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    outputPath,
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
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

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
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

  return pushBuildRecordBody({
    apply,
    config,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}
