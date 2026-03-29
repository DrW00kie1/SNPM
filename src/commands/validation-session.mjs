import { readFileSync, writeFileSync } from "node:fs";

import { loadWorkspaceConfig } from "../notion/config.mjs";
import {
  adoptValidationSession,
  createValidationSession,
  diffValidationSessionFile,
  initializeValidationSessions,
  pullValidationSessionFile,
  pushValidationSessionFile,
  verifyValidationSessionsSurface,
} from "../notion/validation-sessions.mjs";

export async function runValidationSessionsInit({
  apply = false,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return initializeValidationSessions({
    apply,
    config,
    projectName,
    projectTokenEnv,
  });
}

export async function runValidationSessionsVerify({
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return verifyValidationSessionsSurface({
    config,
    projectName,
    projectTokenEnv,
  });
}

export async function runValidationSessionCreate({
  apply = false,
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileMarkdown = readFileSync(filePath, "utf8");

  return createValidationSession({
    apply,
    config,
    fileMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runValidationSessionAdopt({
  apply = false,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return adoptValidationSession({
    apply,
    config,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runValidationSessionPull({
  outputPath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const result = await pullValidationSessionFile({
    config,
    projectName,
    projectTokenEnv,
    title,
  });

  writeFileSync(outputPath, result.fileMarkdown, "utf8");

  return {
    pageId: result.pageId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    outputPath,
  };
}

export async function runValidationSessionDiff({
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileMarkdown = readFileSync(filePath, "utf8");

  return diffValidationSessionFile({
    config,
    fileMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runValidationSessionPush({
  apply = false,
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileMarkdown = readFileSync(filePath, "utf8");

  return pushValidationSessionFile({
    apply,
    config,
    fileMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}
