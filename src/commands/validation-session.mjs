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
import { readCommandInput, readCommandMetadataSidecar, writeCommandMetadataSidecar, writeCommandOutput } from "./io.mjs";

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
  bundle = false,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return verifyValidationSessionsSurface({
    bundle,
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
  const fileMarkdown = await readCommandInput(filePath);

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
  metadataOutputPath,
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
    workspaceName,
  });

  const outputResult = writeCommandOutput(outputPath, result.fileMarkdown);
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

export async function runValidationSessionDiff({
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileMarkdown = await readCommandInput(filePath);

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
  metadataPath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileMarkdown = await readCommandInput(filePath);
  const metadata = apply
    ? readCommandMetadataSidecar(filePath, { metadataPath }).metadata
    : undefined;

  return pushValidationSessionFile({
    apply,
    config,
    fileMarkdown,
    metadata,
    projectName,
    projectTokenEnv,
    title,
    workspaceName,
  });
}
