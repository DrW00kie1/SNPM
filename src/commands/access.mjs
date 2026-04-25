import { mkdirSync } from "node:fs";
import path from "node:path";

import { loadWorkspaceConfig } from "../notion/config.mjs";
import {
  adoptAccessDomain,
  adoptAccessToken,
  adoptSecretRecord,
  createAccessDomain,
  createAccessToken,
  createSecretRecord,
  diffAccessDomainBody,
  diffAccessTokenBody,
  diffSecretRecordBody,
  pullAccessDomainBody,
  pullAccessTokenBody,
  pullSecretRecordBody,
  pushAccessDomainBody,
  pushAccessTokenBody,
  pushSecretRecordBody,
} from "../notion/project-pages.mjs";
import { runManagedEditLoop } from "./editing.mjs";
import { readCommandInput, readCommandMetadataSidecar, writeCommandMetadataSidecar, writeCommandOutput } from "./io.mjs";
import {
  assertNoSecretRedactionMarkers,
  redactSecretMarkdown,
  validateSecretPullOutputPolicy,
} from "./secret-output-safety.mjs";

function ensureOutputParentDirectory(outputPath, { mkdirSyncImpl = mkdirSync } = {}) {
  if (outputPath === "-") {
    return;
  }

  const directory = path.dirname(outputPath);
  if (!directory || directory === ".") {
    return;
  }

  mkdirSyncImpl(directory, { recursive: true });
}

export async function runAccessDomainCreate({
  apply = false,
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);

  return createAccessDomain({
    apply,
    config,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runAccessDomainAdopt({
  apply = false,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return adoptAccessDomain({
    apply,
    config,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runAccessDomainPull({
  metadataOutputPath,
  outputPath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const result = await pullAccessDomainBody({
    config,
    projectName,
    projectTokenEnv,
    title,
    commandFamily: "access-domain",
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

export async function runAccessDomainDiff({
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);

  return diffAccessDomainBody({
    config,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runAccessDomainPush({
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

  return pushAccessDomainBody({
    apply,
    config,
    fileBodyMarkdown,
    metadata,
    projectName,
    projectTokenEnv,
    title,
    commandFamily: "access-domain",
    workspaceName,
  });
}

export async function runAccessDomainEdit({
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
    fileLabel: "access-domain.md",
    editorCommand,
    openEditorImpl,
    pullImpl: () => pullAccessDomainBody({
      config,
      projectName,
      projectTokenEnv,
      title,
      commandFamily: "access-domain",
      workspaceName,
    }),
    pushImpl: ({ apply: shouldApply, fileBodyMarkdown, metadata }) => pushAccessDomainBody({
      apply: shouldApply,
      config,
      fileBodyMarkdown,
      metadata,
      projectName,
      projectTokenEnv,
      title,
      commandFamily: "access-domain",
      workspaceName,
    }),
  });
}

export async function runSecretRecordCreate({
  apply = false,
  domainTitle,
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);
  assertNoSecretRedactionMarkers(fileBodyMarkdown, { command: "secret-record create" });

  return createSecretRecord({
    apply,
    config,
    domainTitle,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runSecretRecordAdopt({
  apply = false,
  domainTitle,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return adoptSecretRecord({
    apply,
    config,
    domainTitle,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runSecretRecordPull({
  allowRepoSecretOutput = false,
  domainTitle,
  loadWorkspaceConfigImpl = loadWorkspaceConfig,
  metadataOutputPath,
  outputPath,
  projectName,
  projectTokenEnv,
  pullSecretRecordBodyImpl = pullSecretRecordBody,
  rawSecretOutput = false,
  title,
  workspaceConfig,
  workspaceName = "infrastructure-hq",
  mkdirSyncImpl = mkdirSync,
  writeCommandMetadataSidecarImpl = writeCommandMetadataSidecar,
  writeCommandOutputImpl = writeCommandOutput,
}) {
  const outputPolicy = validateSecretPullOutputPolicy({
    outputPath,
    metadataOutputPath,
    rawSecretOutput,
    allowRepoSecretOutput,
  });
  const config = workspaceConfig || loadWorkspaceConfigImpl(workspaceName);
  const result = await pullSecretRecordBodyImpl({
    config,
    domainTitle,
    projectName,
    projectTokenEnv,
    title,
    commandFamily: "secret-record",
    workspaceName,
  });

  const outputBodyMarkdown = outputPolicy.raw
    ? result.bodyMarkdown
    : redactSecretMarkdown(result.bodyMarkdown);
  ensureOutputParentDirectory(outputPath, { mkdirSyncImpl });
  const outputResult = writeCommandOutputImpl(outputPath, outputBodyMarkdown);
  const metadataResult = outputPolicy.raw && (outputPath !== "-" || metadataOutputPath)
    ? writeCommandMetadataSidecarImpl(outputPath, result.metadata, { metadataPath: metadataOutputPath })
    : { metadataPath: null };

  return {
    pageId: result.pageId,
    projectId: result.projectId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    metadata: result.metadata,
    redacted: outputPolicy.redacted,
    rawSecretOutput: outputPolicy.raw,
    warnings: outputPolicy.warnings,
    ...metadataResult,
    ...outputResult,
  };
}

export async function runSecretRecordDiff({
  domainTitle,
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);
  assertNoSecretRedactionMarkers(fileBodyMarkdown, { command: "secret-record diff" });

  return diffSecretRecordBody({
    config,
    domainTitle,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runSecretRecordPush({
  apply = false,
  domainTitle,
  filePath,
  metadataPath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);
  assertNoSecretRedactionMarkers(fileBodyMarkdown, { command: "secret-record push" });
  const metadata = apply
    ? readCommandMetadataSidecar(filePath, { metadataPath }).metadata
    : undefined;

  return pushSecretRecordBody({
    apply,
    config,
    domainTitle,
    fileBodyMarkdown,
    metadata,
    projectName,
    projectTokenEnv,
    title,
    commandFamily: "secret-record",
    workspaceName,
  });
}

export async function runSecretRecordEdit({
  apply = false,
  domainTitle,
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
    fileLabel: "secret-record.md",
    editorCommand,
    openEditorImpl,
    pullImpl: () => pullSecretRecordBody({
      config,
      domainTitle,
      projectName,
      projectTokenEnv,
      title,
      commandFamily: "secret-record",
      workspaceName,
    }),
    pushImpl: ({ apply: shouldApply, fileBodyMarkdown, metadata }) => pushSecretRecordBody({
      apply: shouldApply,
      config,
      domainTitle,
      fileBodyMarkdown: (() => {
        assertNoSecretRedactionMarkers(fileBodyMarkdown, { command: "secret-record edit" });
        return fileBodyMarkdown;
      })(),
      metadata,
      projectName,
      projectTokenEnv,
      title,
      commandFamily: "secret-record",
      workspaceName,
    }),
  });
}

export async function runAccessTokenCreate({
  apply = false,
  domainTitle,
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);
  assertNoSecretRedactionMarkers(fileBodyMarkdown, { command: "access-token create" });

  return createAccessToken({
    apply,
    config,
    domainTitle,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runAccessTokenAdopt({
  apply = false,
  domainTitle,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return adoptAccessToken({
    apply,
    config,
    domainTitle,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runAccessTokenPull({
  allowRepoSecretOutput = false,
  domainTitle,
  loadWorkspaceConfigImpl = loadWorkspaceConfig,
  metadataOutputPath,
  outputPath,
  projectName,
  projectTokenEnv,
  pullAccessTokenBodyImpl = pullAccessTokenBody,
  rawSecretOutput = false,
  title,
  workspaceConfig,
  workspaceName = "infrastructure-hq",
  mkdirSyncImpl = mkdirSync,
  writeCommandMetadataSidecarImpl = writeCommandMetadataSidecar,
  writeCommandOutputImpl = writeCommandOutput,
}) {
  const outputPolicy = validateSecretPullOutputPolicy({
    outputPath,
    metadataOutputPath,
    rawSecretOutput,
    allowRepoSecretOutput,
  });
  const config = workspaceConfig || loadWorkspaceConfigImpl(workspaceName);
  const result = await pullAccessTokenBodyImpl({
    config,
    domainTitle,
    projectName,
    projectTokenEnv,
    title,
    commandFamily: "access-token",
    workspaceName,
  });

  const outputBodyMarkdown = outputPolicy.raw
    ? result.bodyMarkdown
    : redactSecretMarkdown(result.bodyMarkdown);
  ensureOutputParentDirectory(outputPath, { mkdirSyncImpl });
  const outputResult = writeCommandOutputImpl(outputPath, outputBodyMarkdown);
  const metadataResult = outputPolicy.raw && (outputPath !== "-" || metadataOutputPath)
    ? writeCommandMetadataSidecarImpl(outputPath, result.metadata, { metadataPath: metadataOutputPath })
    : { metadataPath: null };

  return {
    pageId: result.pageId,
    projectId: result.projectId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    metadata: result.metadata,
    redacted: outputPolicy.redacted,
    rawSecretOutput: outputPolicy.raw,
    warnings: outputPolicy.warnings,
    ...metadataResult,
    ...outputResult,
  };
}

export async function runAccessTokenDiff({
  domainTitle,
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);
  assertNoSecretRedactionMarkers(fileBodyMarkdown, { command: "access-token diff" });

  return diffAccessTokenBody({
    config,
    domainTitle,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}

export async function runAccessTokenPush({
  apply = false,
  domainTitle,
  filePath,
  metadataPath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = await readCommandInput(filePath);
  assertNoSecretRedactionMarkers(fileBodyMarkdown, { command: "access-token push" });
  const metadata = apply
    ? readCommandMetadataSidecar(filePath, { metadataPath }).metadata
    : undefined;

  return pushAccessTokenBody({
    apply,
    config,
    domainTitle,
    fileBodyMarkdown,
    metadata,
    projectName,
    projectTokenEnv,
    title,
    commandFamily: "access-token",
    workspaceName,
  });
}

export async function runAccessTokenEdit({
  apply = false,
  domainTitle,
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
    fileLabel: "access-token.md",
    editorCommand,
    openEditorImpl,
    pullImpl: () => pullAccessTokenBody({
      config,
      domainTitle,
      projectName,
      projectTokenEnv,
      title,
      commandFamily: "access-token",
      workspaceName,
    }),
    pushImpl: ({ apply: shouldApply, fileBodyMarkdown, metadata }) => pushAccessTokenBody({
      apply: shouldApply,
      config,
      domainTitle,
      fileBodyMarkdown: (() => {
        assertNoSecretRedactionMarkers(fileBodyMarkdown, { command: "access-token edit" });
        return fileBodyMarkdown;
      })(),
      metadata,
      projectName,
      projectTokenEnv,
      title,
      commandFamily: "access-token",
      workspaceName,
    }),
  });
}
