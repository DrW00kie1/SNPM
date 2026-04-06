import { loadWorkspaceConfig } from "../notion/config.mjs";
import { verifyWorkspaceDocs } from "../notion/doc-pages.mjs";

export async function runVerifyWorkspaceDocs({
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return verifyWorkspaceDocs({ config });
}
