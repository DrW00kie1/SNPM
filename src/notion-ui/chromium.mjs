import { mkdirSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

import {
  ensureDirectory,
  getChromiumExecutablePath,
  getNotionUiArtifactsDir,
  getNotionUiProfileDir,
  SNPM_PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH_ENV,
  sanitizeTimestampForPath,
} from "./env.mjs";

export function buildArtifactsPaths(timestamp, command) {
  const root = ensureDirectory(getNotionUiArtifactsDir());
  const directory = ensureDirectory(path.join(root, `${sanitizeTimestampForPath(timestamp)}-${command}`));
  return {
    directory,
    screenshotPath: path.join(directory, "failure.png"),
  };
}

function wrapChromiumLaunchError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (/Executable doesn't exist|browser has been closed|Failed to launch/i.test(message)) {
    throw new Error(
      `${message}\nInstall Chromium for Playwright with "npx playwright install chromium" or set ${SNPM_PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH_ENV} to an explicit Chromium executable.`,
    );
  }

  throw error;
}

export async function launchChromiumSession({
  headed = false,
  command,
  timestamp,
}) {
  const profileDir = ensureDirectory(getNotionUiProfileDir());
  const artifacts = buildArtifactsPaths(timestamp, command);

  try {
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: !headed,
      executablePath: getChromiumExecutablePath() || undefined,
      viewport: { width: 1600, height: 1000 },
      args: [
        "--disable-features=msEdgeTextScaleFactor",
      ],
    });
    context.setDefaultTimeout(15_000);

    const page = context.pages()[0] || await context.newPage();
    return {
      context,
      page,
      profileDir,
      artifacts,
    };
  } catch (error) {
    wrapChromiumLaunchError(error);
  }
}

export async function captureFailureArtifact(page, artifacts) {
  if (!page || !artifacts?.screenshotPath) {
    return null;
  }

  mkdirSync(path.dirname(artifacts.screenshotPath), { recursive: true });
  await page.screenshot({ path: artifacts.screenshotPath, fullPage: true }).catch(() => {});
  return artifacts.screenshotPath;
}
