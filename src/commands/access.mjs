import { mkdirSync } from "node:fs";
import path from "node:path";

import { loadWorkspaceConfig } from "../notion/config.mjs";
import {
  adoptAccessDomain,
  adoptAccessToken,
  adoptSecretRecord,
  createAccessDomain,
  createAccessToken,
  createGeneratedAccessToken,
  createGeneratedSecretRecord,
  createSecretRecord,
  diffAccessDomainBody,
  pullAccessDomainBody,
  pullAccessTokenBody,
  pullSecretRecordBody,
  pushAccessDomainBody,
  updateGeneratedAccessToken,
  updateGeneratedSecretRecord,
} from "../notion/project-pages.mjs";
import { runManagedEditLoop } from "./editing.mjs";
import { readCommandInput, readCommandMetadataSidecar, writeCommandMetadataSidecar, writeCommandOutput } from "./io.mjs";
import {
  SECRET_MARKDOWN_MUTATION_UNSUPPORTED_MESSAGE,
  assertNoLocalRawSecretValue,
  extractRawSecretValueFromMarkdown,
  redactSecretMarkdown,
  validateSecretPullOutputPolicy,
} from "./secret-output-safety.mjs";
import { runSecretExec } from "./secret-exec.mjs";
import {
  runGeneratedSecretCommand,
  unwrapGeneratedSecretMaterial,
} from "./secret-generate.mjs";

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
  const fileBodyMarkdown = filePath ? await readCommandInput(filePath) : "";
  assertNoLocalRawSecretValue(fileBodyMarkdown, { command: "secret-record create" });

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
  writeCommandOutputImpl = writeCommandOutput,
}) {
  const outputPolicy = validateSecretPullOutputPolicy({
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

  const outputBodyMarkdown = redactSecretMarkdown(result.bodyMarkdown);
  ensureOutputParentDirectory(outputPath, { mkdirSyncImpl });
  const outputResult = writeCommandOutputImpl(outputPath, outputBodyMarkdown);

  return {
    pageId: result.pageId,
    projectId: result.projectId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    metadata: result.metadata,
    redacted: outputPolicy.redacted,
    rawSecretOutput: false,
    warnings: outputPolicy.warnings,
    metadataPath: null,
    ...outputResult,
  };
}

export async function runSecretRecordExec({
  childArgs,
  cwd,
  domainTitle,
  env,
  envName,
  loadWorkspaceConfigImpl = loadWorkspaceConfig,
  projectName,
  projectTokenEnv,
  pullSecretRecordBodyImpl = pullSecretRecordBody,
  spawnSyncImpl,
  stdinSecret = false,
  title,
  workspaceConfig,
  workspaceName = "infrastructure-hq",
}) {
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
  const secretValue = extractRawSecretValueFromMarkdown(result.bodyMarkdown, { command: "secret-record exec" });
  const execResult = runSecretExec({
    childArgs,
    cwd,
    env,
    envName,
    secretValue,
    spawnSyncImpl,
    stdinSecret,
  });

  return {
    pageId: result.pageId,
    projectId: result.projectId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    redacted: execResult.leakDetected,
    ...execResult,
  };
}

export async function runSecretRecordDiff({} = {}) {
  throw new Error(`secret-record diff is disabled. ${SECRET_MARKDOWN_MUTATION_UNSUPPORTED_MESSAGE}`);
}

export async function runSecretRecordPush({} = {}) {
  throw new Error(`secret-record push is disabled. ${SECRET_MARKDOWN_MUTATION_UNSUPPORTED_MESSAGE}`);
}

export async function runSecretRecordEdit({} = {}) {
  throw new Error(`secret-record edit is disabled. ${SECRET_MARKDOWN_MUTATION_UNSUPPORTED_MESSAGE}`);
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
  const fileBodyMarkdown = filePath ? await readCommandInput(filePath) : "";
  assertNoLocalRawSecretValue(fileBodyMarkdown, { command: "access-token create" });

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

function normalizeGenerateMode(mode, command) {
  if (mode !== "create" && mode !== "update") {
    throw new Error(`${command} requires --mode create or --mode update.`);
  }

  return mode;
}

function validateGenerateChildArgs(childArgs, command) {
  if (!Array.isArray(childArgs) || childArgs.length === 0 || !childArgs[0]) {
    throw new Error(`Provide a generator command after -- for ${command}.`);
  }

  if (!childArgs.every((arg) => typeof arg === "string")) {
    throw new Error(`${command} generator command arguments must be strings.`);
  }
}

function generatedAccessWarning() {
  return "Generated raw value is write-only: SNPM did not return it locally, write a sidecar, or create review artifacts.";
}

async function runGeneratedAccessRecord({
  apply = false,
  childArgs,
  command,
  createImpl,
  cwd,
  domainTitle,
  mode,
  projectName,
  projectTokenEnv,
  runGeneratedSecretCommandImpl = runGeneratedSecretCommand,
  title,
  updateImpl,
  workspaceConfig,
  workspaceName = "infrastructure-hq",
}) {
  const normalizedMode = normalizeGenerateMode(mode, command);
  validateGenerateChildArgs(childArgs, command);
  const config = workspaceConfig || loadWorkspaceConfig(workspaceName);
  const mutateImpl = normalizedMode === "create" ? createImpl : updateImpl;
  const baseArgs = {
    config,
    domainTitle,
    projectName,
    projectTokenEnv,
    title,
  };

  const preview = await mutateImpl({
    ...baseArgs,
    apply: false,
  });

  if (!apply) {
    return {
      ...preview,
      mode: normalizedMode,
      generatorWillRun: false,
      generatedSecretStored: false,
      redacted: true,
      warnings: [
        ...(Array.isArray(preview.warnings) ? preview.warnings : []),
        generatedAccessWarning(),
      ],
    };
  }

  const generated = runGeneratedSecretCommandImpl({
    childArgs,
    cwd,
  });
  if (!generated.ok) {
    throw new Error(generated.failure || "Generator command failed.");
  }

  const generatedRawValue = unwrapGeneratedSecretMaterial(generated.secretMaterial);
  try {
    const result = await mutateImpl({
      ...baseArgs,
      apply: true,
      generatedRawValue,
    });

    return {
      ...result,
      mode: normalizedMode,
      generatorWillRun: true,
      redacted: true,
      warnings: [
        ...(Array.isArray(result.warnings) ? result.warnings : []),
        generatedAccessWarning(),
      ],
    };
  } catch (error) {
    const message = generated.redactor?.redactText
      ? generated.redactor.redactText(error instanceof Error ? error.message : String(error))
      : "Generated secret Notion write failed.";
    throw new Error(message);
  }
}

export async function runSecretRecordGenerate({
  apply = false,
  childArgs,
  createGeneratedSecretRecordImpl = createGeneratedSecretRecord,
  cwd,
  domainTitle,
  mode,
  projectName,
  projectTokenEnv,
  runGeneratedSecretCommandImpl,
  title,
  updateGeneratedSecretRecordImpl = updateGeneratedSecretRecord,
  workspaceConfig,
  workspaceName = "infrastructure-hq",
}) {
  return runGeneratedAccessRecord({
    apply,
    childArgs,
    command: "secret-record generate",
    createImpl: createGeneratedSecretRecordImpl,
    cwd,
    domainTitle,
    mode,
    projectName,
    projectTokenEnv,
    runGeneratedSecretCommandImpl,
    title,
    updateImpl: updateGeneratedSecretRecordImpl,
    workspaceConfig,
    workspaceName,
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
  writeCommandOutputImpl = writeCommandOutput,
}) {
  const outputPolicy = validateSecretPullOutputPolicy({
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

  const outputBodyMarkdown = redactSecretMarkdown(result.bodyMarkdown);
  ensureOutputParentDirectory(outputPath, { mkdirSyncImpl });
  const outputResult = writeCommandOutputImpl(outputPath, outputBodyMarkdown);

  return {
    pageId: result.pageId,
    projectId: result.projectId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    metadata: result.metadata,
    redacted: outputPolicy.redacted,
    rawSecretOutput: false,
    warnings: outputPolicy.warnings,
    metadataPath: null,
    ...outputResult,
  };
}

export async function runAccessTokenExec({
  childArgs,
  cwd,
  domainTitle,
  env,
  envName,
  loadWorkspaceConfigImpl = loadWorkspaceConfig,
  projectName,
  projectTokenEnv,
  pullAccessTokenBodyImpl = pullAccessTokenBody,
  spawnSyncImpl,
  stdinSecret = false,
  title,
  workspaceConfig,
  workspaceName = "infrastructure-hq",
}) {
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
  const secretValue = extractRawSecretValueFromMarkdown(result.bodyMarkdown, { command: "access-token exec" });
  const execResult = runSecretExec({
    childArgs,
    cwd,
    env,
    envName,
    secretValue,
    spawnSyncImpl,
    stdinSecret,
  });

  return {
    pageId: result.pageId,
    projectId: result.projectId,
    targetPath: result.targetPath,
    authMode: result.authMode,
    redacted: execResult.leakDetected,
    ...execResult,
  };
}

export async function runAccessTokenGenerate({
  apply = false,
  childArgs,
  createGeneratedAccessTokenImpl = createGeneratedAccessToken,
  cwd,
  domainTitle,
  mode,
  projectName,
  projectTokenEnv,
  runGeneratedSecretCommandImpl,
  title,
  updateGeneratedAccessTokenImpl = updateGeneratedAccessToken,
  workspaceConfig,
  workspaceName = "infrastructure-hq",
}) {
  return runGeneratedAccessRecord({
    apply,
    childArgs,
    command: "access-token generate",
    createImpl: createGeneratedAccessTokenImpl,
    cwd,
    domainTitle,
    mode,
    projectName,
    projectTokenEnv,
    runGeneratedSecretCommandImpl,
    title,
    updateImpl: updateGeneratedAccessTokenImpl,
    workspaceConfig,
    workspaceName,
  });
}

export async function runAccessTokenDiff({} = {}) {
  throw new Error(`access-token diff is disabled. ${SECRET_MARKDOWN_MUTATION_UNSUPPORTED_MESSAGE}`);
}

export async function runAccessTokenPush({} = {}) {
  throw new Error(`access-token push is disabled. ${SECRET_MARKDOWN_MUTATION_UNSUPPORTED_MESSAGE}`);
}

export async function runAccessTokenEdit({} = {}) {
  throw new Error(`access-token edit is disabled. ${SECRET_MARKDOWN_MUTATION_UNSUPPORTED_MESSAGE}`);
}
