import { loadWorkspaceConfig } from "../notion/config.mjs";
import {
  applyValidationBundle,
  loginValidationBundle,
  previewValidationBundle,
  verifyValidationBundle,
} from "../notion-ui/validation-bundle.mjs";

export async function runValidationBundleLogin() {
  return loginValidationBundle({});
}

export async function runValidationBundlePreview({
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return previewValidationBundle({
    config,
    projectName,
    projectTokenEnv,
  });
}

export async function runValidationBundleApply({
  apply = false,
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return applyValidationBundle({
    apply,
    config,
    projectName,
    projectTokenEnv,
  });
}

export async function runValidationBundleVerify({
  projectName,
  projectTokenEnv,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return verifyValidationBundle({
    config,
    projectName,
    projectTokenEnv,
  });
}
