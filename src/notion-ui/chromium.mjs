import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

import {
  ensureDirectory,
  getChromiumExecutablePath,
  getNotionUiArtifactsDir,
  getNotionUiProfileDir,
  getNotionUiStorageStatePath,
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
  const storageStatePath = getNotionUiStorageStatePath();
  ensureDirectory(path.dirname(storageStatePath));
  const artifacts = buildArtifactsPaths(timestamp, command);
  const executablePath = getChromiumExecutablePath() || undefined;
  const launchArgs = [
    "--disable-features=msEdgeTextScaleFactor",
  ];

  try {
    const browser = await chromium.launch({
      headless: !headed,
      executablePath,
      args: launchArgs,
    });
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      storageState: existsSync(storageStatePath) ? storageStatePath : undefined,
    });
    context.setDefaultTimeout(15_000);

    const page = context.pages()[0] || await context.newPage();
    return {
      browser,
      context,
      page,
      profileDir,
      storageStatePath,
      artifacts,
    };
  } catch (error) {
    wrapChromiumLaunchError(error);
  }
}

export async function persistChromiumStorageState(context, storageStatePath = getNotionUiStorageStatePath()) {
  ensureDirectory(path.dirname(storageStatePath));
  await context.storageState({ path: storageStatePath });
  return storageStatePath;
}

export async function captureFailureArtifact(page, artifacts) {
  if (!page || !artifacts?.screenshotPath) {
    return null;
  }

  mkdirSync(path.dirname(artifacts.screenshotPath), { recursive: true });
  await page.screenshot({ path: artifacts.screenshotPath, fullPage: true }).catch(() => {});
  return artifacts.screenshotPath;
}
