import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const SNPM_NOTION_UI_PROFILE_DIR_ENV = "SNPM_NOTION_UI_PROFILE_DIR";
export const SNPM_NOTION_UI_ARTIFACTS_DIR_ENV = "SNPM_NOTION_UI_ARTIFACTS_DIR";
export const SNPM_NOTION_UI_STORAGE_STATE_PATH_ENV = "SNPM_NOTION_UI_STORAGE_STATE_PATH";
export const SNPM_NOTION_UI_LOGIN_LOCK_PATH_ENV = "SNPM_NOTION_UI_LOGIN_LOCK_PATH";
export const SNPM_PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH_ENV = "SNPM_PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH";

function defaultLocalRoot() {
  return process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
}

export function getNotionUiProfileDir() {
  return process.env[SNPM_NOTION_UI_PROFILE_DIR_ENV]
    || path.join(defaultLocalRoot(), "SNPM", "playwright", "notion-profile");
}

export function getNotionUiArtifactsDir() {
  return process.env[SNPM_NOTION_UI_ARTIFACTS_DIR_ENV]
    || path.join(defaultLocalRoot(), "SNPM", "playwright", "artifacts");
}

export function getNotionUiStorageStatePath() {
  return process.env[SNPM_NOTION_UI_STORAGE_STATE_PATH_ENV]
    || path.join(defaultLocalRoot(), "SNPM", "playwright", "notion-storage-state.json");
}

export function getNotionUiLoginLockPath() {
  return process.env[SNPM_NOTION_UI_LOGIN_LOCK_PATH_ENV]
    || path.join(defaultLocalRoot(), "SNPM", "playwright", "notion-login.lock.json");
}

export function getChromiumExecutablePath() {
  const value = process.env[SNPM_PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH_ENV];
  return value && value.trim() ? value.trim() : null;
}

export function ensureDirectory(dirPath) {
  mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function sanitizeTimestampForPath(timestamp) {
  return timestamp.replace(/[^\dA-Za-z-]+/g, "-");
}
