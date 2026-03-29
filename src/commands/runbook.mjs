import { readFileSync, writeFileSync } from "node:fs";

import { loadWorkspaceConfig } from "../notion/config.mjs";
import {
  adoptRunbook,
  createRunbook,
  diffRunbookBody,
  pullRunbookBody,
  pushRunbookBody,
} from "../notion/project-pages.mjs";

export async function runRunbookCreate({
  apply = false,
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

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

  writeFileSync(outputPath, result.bodyMarkdown, "utf8");

  return {
    pageId: result.pageId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    outputPath,
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
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

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
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

  return pushRunbookBody({
    apply,
    config,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}
