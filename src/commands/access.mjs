import { readFileSync, writeFileSync } from "node:fs";

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

export async function runAccessDomainCreate({
  apply = false,
  filePath,
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

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
  });

  writeFileSync(outputPath, result.bodyMarkdown, "utf8");

  return {
    pageId: result.pageId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    outputPath,
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
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

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
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

  return pushAccessDomainBody({
    apply,
    config,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
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
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

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
  });

  writeFileSync(outputPath, result.bodyMarkdown, "utf8");

  return {
    pageId: result.pageId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    outputPath,
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
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

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
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

  return pushSecretRecordBody({
    apply,
    config,
    domainTitle,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
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
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

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
  });

  writeFileSync(outputPath, result.bodyMarkdown, "utf8");

  return {
    pageId: result.pageId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    outputPath,
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
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

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
  projectName,
  projectTokenEnv,
  title,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  const fileBodyMarkdown = readFileSync(filePath, "utf8");

  return pushAccessTokenBody({
    apply,
    config,
    domainTitle,
    fileBodyMarkdown,
    projectName,
    projectTokenEnv,
    title,
  });
}
