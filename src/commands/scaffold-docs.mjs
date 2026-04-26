import { loadWorkspaceConfig } from "../notion/config.mjs";
import { scaffoldProjectStarterDocs } from "../notion/scaffold-docs.mjs";

export async function runScaffoldDocs({
  apply = false,
  projectName,
  projectTokenEnv,
  outputDir,
  workspaceName = "infrastructure-hq",
  client,
  makeNotionClientImpl,
  getProjectTokenImpl,
  getWorkspaceTokenImpl,
  mkdirSyncImpl,
  writeFileSyncImpl,
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return scaffoldProjectStarterDocs({
    apply,
    config,
    projectName,
    projectTokenEnv,
    workspaceName,
    outputDir,
    client,
    makeNotionClientImpl,
    getProjectTokenImpl,
    getWorkspaceTokenImpl,
    mkdirSyncImpl,
    writeFileSyncImpl,
  });
}
