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
  domainTitle,
  metadataOutputPath,
  outputPath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const result = await pullSecretRecordBody({
    config,
    domainTitle,
    projectName,
    projectTokenEnv,
    title,
    commandFamily: "secret-record",
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
      fileBodyMarkdown,
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
  domainTitle,
  metadataOutputPath,
  outputPath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const result = await pullAccessTokenBody({
    config,
    domainTitle,
    projectName,
    projectTokenEnv,
    title,
    commandFamily: "access-token",
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
      fileBodyMarkdown,
      metadata,
      projectName,
      projectTokenEnv,
      title,
      commandFamily: "access-token",
      workspaceName,
    }),
  });
}
