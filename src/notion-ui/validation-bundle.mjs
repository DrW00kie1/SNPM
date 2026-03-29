import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { nowTimestamp, getProjectToken, getWorkspaceToken } from "../notion/env.mjs";
import { makeNotionClient } from "../notion/client.mjs";
import { choosePageSyncAuth, fetchPageMarkdown, replacePageMarkdown, splitManagedPageMarkdownIfPresent } from "../notion/page-markdown.mjs";
import { resolveProjectRootTarget, resolveValidationSessionsDatabaseTarget, resolveValidationTarget } from "../notion/page-targets.mjs";
import { getPrimaryDataSourceId, listDataSourceTemplates } from "../notion/data-sources.mjs";
import {
  VALIDATION_SESSION_ICON,
  buildManagedValidationSessionTemplateMarkdown,
} from "../notion/managed-page-templates.mjs";
import {
  VALIDATION_BUNDLE_BUTTON_LABEL,
  VALIDATION_BUNDLE_PRIMARY_VIEW,
  VALIDATION_BUNDLE_QUICK_INTAKE_FORM,
  VALIDATION_BUNDLE_TEMPLATE_NAME,
  buildValidationSessionBundleMetadata,
  buildValidationSessionTemplateCanonicalPath,
} from "./validation-bundle-spec.mjs";
import { captureFailureArtifact, launchChromiumSession, persistChromiumStorageState } from "./chromium.mjs";
import { ensureDirectory, getNotionUiLoginLockPath } from "./env.mjs";
import { verifyValidationSessionsSurface, normalizeValidationSessionBodyMarkdown } from "../notion/validation-sessions.mjs";

const NOTION_BASE_URL = "https://www.notion.so";
const NOTION_COOKIE_NAME = "token_v2";

function stripDashes(id) {
  return id.replaceAll("-", "");
}

function buildNotionPageUrl(id) {
  return `${NOTION_BASE_URL}/${stripDashes(id)}`;
}

function extractPageIdFromUrl(url) {
  const match = /([0-9a-f]{32})/i.exec(url || "");
  if (!match) {
    return null;
  }

  const compact = match[1].toLowerCase();
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function buildValidationRootPath(projectName) {
  return `Projects > ${projectName} > Ops > Validation`;
}

function buildValidationSessionsPath(projectName) {
  return `${buildValidationRootPath(projectName)} > Validation Sessions`;
}

function buildTemplateTargetPath(projectName) {
  return `${buildValidationSessionsPath(projectName)} > ${VALIDATION_BUNDLE_TEMPLATE_NAME}`;
}

function buildButtonTargetPath(projectName) {
  return `${buildValidationRootPath(projectName)} > ${VALIDATION_BUNDLE_BUTTON_LABEL}`;
}

async function hasNotionAuthCookie(context) {
  const cookies = await context.cookies();
  return cookies.some((cookie) => cookie.name === NOTION_COOKIE_NAME && cookie.value);
}

function isClosedError(error) {
  return /Target page, context or browser has been closed|browser has been closed/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

function getLoginLockPath() {
  return getNotionUiLoginLockPath();
}

function readLoginLockRecord() {
  const lockPath = getLoginLockPath();
  if (!existsSync(lockPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    return {
      pid: null,
      startedAt: null,
    };
  }
}

function releaseLoginLock() {
  const lockPath = getLoginLockPath();
  if (existsSync(lockPath)) {
    unlinkSync(lockPath);
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getActiveLoginLock() {
  const record = readLoginLockRecord();
  if (!record) {
    return null;
  }

  if (!isProcessAlive(record.pid)) {
    releaseLoginLock();
    return null;
  }

  return record;
}

function acquireLoginLock(command) {
  const activeLock = getActiveLoginLock();
  if (activeLock) {
    throw new Error("A validation-bundle login is already in progress in another Chromium window. Finish or close that window before retrying.");
  }

  const lockPath = getLoginLockPath();
  ensureDirectory(path.dirname(lockPath));
  writeFileSync(lockPath, JSON.stringify({
    command,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }, null, 2));
  return lockPath;
}

function buildLoginTargetUrl(config) {
  const pageId = config?.workspace?.projectsPageId;
  if (!pageId) {
    throw new Error("Validation bundle login requires a workspace projects page id in the workspace config.");
  }
  return buildNotionPageUrl(pageId);
}

async function waitForNotionLogin(context, timeoutMs = null) {
  const deadline = typeof timeoutMs === "number" ? Date.now() + timeoutMs : null;

  while (!deadline || Date.now() < deadline) {
    try {
      if (await hasNotionAuthCookie(context)) {
        return true;
      }
    } catch (error) {
      if (isClosedError(error)) {
        return false;
      }
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

async function checkAuthenticatedTargetAccess(page, targetUrl, isNotionSignInPageImpl = isNotionSignInPage) {
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    return !(await isNotionSignInPageImpl(page));
  } catch (error) {
    if (isClosedError(error)) {
      return false;
    }
    throw error;
  }
}

async function waitForAuthenticatedTargetAccess(page, targetUrl, {
  context = null,
  isNotionSignInPageImpl = isNotionSignInPage,
  timeoutMs = null,
} = {}) {
  const deadline = typeof timeoutMs === "number" ? Date.now() + timeoutMs : null;

  while (!deadline || Date.now() < deadline) {
    if (page.isClosed?.()) {
      return false;
    }

    let cookieObserved = true;
    if (context) {
      try {
        cookieObserved = await hasNotionAuthCookie(context);
      } catch (error) {
        if (isClosedError(error)) {
          return false;
        }
        throw error;
      }
    }

    const signInPage = await isNotionSignInPageImpl(page);
    if (cookieObserved && !signInPage) {
      return checkAuthenticatedTargetAccess(page, targetUrl, isNotionSignInPageImpl);
    }

    await page.waitForTimeout(1000).catch(() => {});
  }

  return false;
}

async function isNotionSignInPage(page) {
  const candidates = [
    page.getByText(/sign in to see this page/i).first(),
    page.getByText(/verification code|two-step|2-step|authenticator|enter code/i).first(),
    page.getByText(/enter your email address/i).first(),
    page.getByRole("button", { name: /google/i }).first(),
    page.getByRole("button", { name: /microsoft/i }).first(),
    page.getByRole("button", { name: /apple/i }).first(),
    page.getByRole("button", { name: /passkey/i }).first(),
    page.getByRole("button", { name: /sso/i }).first(),
  ];

  for (const candidate of candidates) {
    if (await safeTextExists(candidate)) {
      return true;
    }
  }

  return false;
}

function templateBodyMatches(markdown, expectedCanonicalPath) {
  const managedParts = splitManagedPageMarkdownIfPresent(markdown);
  if (!managedParts) {
    return false;
  }

  const canonicalLine = managedParts.headerMarkdown
    .split("\n")
    .find((line) => line.startsWith("Canonical Source:"));
  if (!canonicalLine) {
    return false;
  }

  const actualCanonical = canonicalLine.replace(/^Canonical Source:\s*/, "").replace(/\\>/g, ">");
  if (actualCanonical !== expectedCanonicalPath) {
    return false;
  }

  const normalizedBody = normalizeValidationSessionBodyMarkdown(managedParts.bodyMarkdown);
  return normalizedBody.includes("## Session Summary")
    && normalizedBody.includes("## Checklist")
    && normalizedBody.includes("## Findings")
    && normalizedBody.includes("## Follow-Up");
}

async function buildSurfaceClients({
  config,
  projectTokenEnv,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const workspaceClient = makeNotionClientImpl(getWorkspaceTokenImpl(), config.notionVersion);
  const auth = choosePageSyncAuth(projectTokenEnv, {
    getProjectTokenImpl,
    getWorkspaceTokenImpl,
  });

  return {
    workspaceClient,
    surfaceClient: makeNotionClientImpl(auth.token, config.notionVersion),
    authMode: auth.authMode,
  };
}

async function loadValidationBundleContext({
  config,
  projectName,
  projectTokenEnv,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
  verifyValidationSessionsSurfaceImpl = verifyValidationSessionsSurface,
}) {
  const { workspaceClient, surfaceClient, authMode } = await buildSurfaceClients({
    config,
    projectTokenEnv,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const projectRoot = await resolveProjectRootTarget(projectName, config, workspaceClient);
  const validationTarget = await resolveValidationTarget(projectName, config, workspaceClient);
  const apiBundle = await verifyValidationSessionsSurfaceImpl({
    bundle: true,
    config,
    projectName,
    projectTokenEnv,
    resolveClient: workspaceClient,
    syncClient: surfaceClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  let databaseTarget = null;
  let dataSourceId = null;
  let templates = [];

  if (apiBundle.initialized) {
    databaseTarget = await resolveValidationSessionsDatabaseTarget(projectName, config, workspaceClient);
    const database = await surfaceClient.request("GET", `databases/${databaseTarget.pageId}`);
    dataSourceId = getPrimaryDataSourceId(database);
    templates = await listDataSourceTemplates(dataSourceId, surfaceClient, { name: VALIDATION_BUNDLE_TEMPLATE_NAME });
  }

  return {
    authMode,
    apiBundle,
    projectRoot,
    projectId: projectRoot.projectId,
    projectName,
    projectTokenEnv,
    targetPath: buildValidationRootPath(projectName),
    validationTarget,
    databaseTarget,
    dataSourceId,
    templates,
    workspaceClient,
    surfaceClient,
  };
}

function buildUiAuthResult({ loggedIn, profileDir }) {
  return {
    browser: "chromium",
    loggedIn,
    profileDir,
  };
}

function buildNotLoggedInResult(command, context, uiAuth, failures = []) {
  return {
    ok: false,
    command,
    projectId: context?.projectId || null,
    targetPath: context?.targetPath || null,
    authMode: context?.authMode || null,
    uiAuth,
    apiBundle: context?.apiBundle || null,
    uiBundle: null,
    actions: [],
    failures: failures.length > 0 ? failures : [
      "No persisted Notion UI login is available. Run \"validation-bundle login\" first.",
    ],
    manualChecks: [{
      id: "notion-login",
      title: "Notion login",
      status: "manual-required",
      reason: "A persisted Playwright Chromium session is required before UI bundle automation can run.",
    }],
  };
}

function buildLoginInProgressResult(command, context) {
  return buildNotLoggedInResult(command, context, buildUiAuthResult({
    loggedIn: false,
    profileDir: null,
  }), [
    "A validation-bundle login is already in progress in another Chromium window. Finish or close that window before retrying.",
  ]);
}

async function findTemplateState(bundleContext) {
  const template = bundleContext.templates.find((entry) => entry.name === VALIDATION_BUNDLE_TEMPLATE_NAME) || null;

  if (!template) {
    return {
      present: false,
      isDefault: false,
      pageId: null,
      managed: false,
    };
  }

  const expectedCanonicalPath = buildValidationSessionTemplateCanonicalPath(bundleContext.projectName);
  const page = await bundleContext.surfaceClient.request("GET", `pages/${template.id}`);
  const markdown = await fetchPageMarkdown(template.id, buildTemplateTargetPath(bundleContext.projectName), bundleContext.surfaceClient);

  return {
    present: true,
    isDefault: Boolean(template.is_default),
    pageId: template.id,
    managed: templateBodyMatches(markdown, expectedCanonicalPath),
    iconMatches: page.icon?.type === VALIDATION_SESSION_ICON.type && page.icon?.emoji === VALIDATION_SESSION_ICON.emoji,
  };
}

async function safeTextExists(locator) {
  try {
    return await locator.first().isVisible();
  } catch {
    return false;
  }
}

async function clickFirstVisible(locators) {
  for (const locator of locators) {
    try {
      if (await locator.first().isVisible()) {
        await locator.first().click();
        return true;
      }
    } catch {
      // continue
    }
  }

  return false;
}

async function openPage(page, pageId) {
  await page.goto(buildNotionPageUrl(pageId), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
}

async function locateViewTab(page, name) {
  const candidates = [
    page.getByRole("tab", { name, exact: true }),
    page.getByRole("button", { name, exact: true }),
    page.locator(`[aria-label="${name}"]`),
    page.locator(`text="${name}"`),
  ];

  for (const candidate of candidates) {
    if (await safeTextExists(candidate)) {
      return candidate.first();
    }
  }

  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openAddViewDialog(page) {
  const clicked = await clickFirstVisible([
    page.getByRole("button", { name: /add a view/i }),
    page.getByRole("button", { name: /new view/i }),
    page.getByRole("button", { name: /\+.*view/i }),
    page.locator('[aria-label*="Add a view" i]'),
    page.getByText("+", { exact: true }),
    page.locator('[role="button"]').filter({ hasText: /^\+$/ }),
    page.locator("button").filter({ hasText: /^\+$/ }),
    page.locator('xpath=//*[normalize-space(text())="Default view"]/following-sibling::*[1]'),
    page.locator(`xpath=//*[normalize-space(text())="${VALIDATION_BUNDLE_PRIMARY_VIEW}"]/following-sibling::*[1]`),
    page.locator('xpath=//*[normalize-space(text())="Form builder"]/following-sibling::*[1]'),
    page.locator(`xpath=//*[normalize-space(text())="${VALIDATION_BUNDLE_QUICK_INTAKE_FORM}"]/following-sibling::*[1]`),
  ]);

  if (clicked) {
    return;
  }

  for (const currentViewName of [
    VALIDATION_BUNDLE_PRIMARY_VIEW,
    VALIDATION_BUNDLE_QUICK_INTAKE_FORM,
    "Default view",
    "Form builder",
  ]) {
    const currentView = await locateViewTab(page, currentViewName);
    if (!currentView) {
      continue;
    }

    const box = await currentView.boundingBox().catch(() => null);
    if (!box) {
      continue;
    }

    await page.mouse.click(box.x + box.width + 14, box.y + (box.height / 2));
    await page.waitForTimeout(500);
    return;
  }

  throw new Error("Could not find the Notion control for adding a database view.");
}

async function openCurrentViewSettings(page, fallbackNames = []) {
  if (
    await safeTextExists(page.getByText(/view settings/i))
    || await safeTextExists(page.locator('input[placeholder*="View name" i]'))
  ) {
    return true;
  }

  for (const name of fallbackNames) {
    if (!name) {
      continue;
    }

    const viewTab = await locateViewTab(page, name);
    if (!viewTab) {
      continue;
    }

    await viewTab.click().catch(() => {});
    const clicked = await clickFirstVisible([
      page.getByRole("menuitem", { name: /edit view/i }),
      page.getByRole("button", { name: /edit view/i }),
      page.getByText(/^edit view$/i),
    ]);
    if (clicked) {
      return true;
    }
  }

  return await safeTextExists(page.getByText(/view settings/i));
}

async function renameCurrentView(page, name, fallbackNames = []) {
  const namePattern = new RegExp(`^${escapeRegExp(name)}$`, "i");
  const preferredField = page.locator('input[placeholder*="View name" i]').first();

  const fillField = async (field) => {
    if (!(await safeTextExists(field))) {
      return false;
    }

    await field.first().click().catch(() => {});
    await field.first().fill(name).catch(async () => {
      await page.keyboard.press("Control+A").catch(() => {});
      await page.keyboard.type(name);
    });

    const saved = await clickFirstVisible([
      page.getByRole("button", { name: /done/i }),
      page.getByText(/^done$/i),
    ]);
    if (!saved) {
      await page.keyboard.press("Enter").catch(() => {});
    }

    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    return true;
  };

  if (!(await fillField(preferredField))) {
    const settingsOpened = await openCurrentViewSettings(page, fallbackNames);
    if (!settingsOpened) {
      return false;
    }

    const fallbackFields = [
      preferredField,
      page.locator('xpath=//*[contains(normalize-space(.), "View settings")]/following::input[1]'),
      page.locator('input[value="Default view"]').first(),
      page.locator('input[value="New view"]').first(),
      page.locator('input[value="Form builder"]').first(),
      page.locator("input").first(),
    ];

    let renamed = false;
    for (const field of fallbackFields) {
      if (await fillField(field)) {
        renamed = true;
        break;
      }
    }

    if (!renamed) {
      return false;
    }
  }

  const renamedTab = await locateViewTab(page, name);
  if (renamedTab) {
    await renamedTab.click().catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    return true;
  }

  return await safeTextExists(page.getByText(namePattern));
}

async function createNamedView(page, { name, type }) {
  await openAddViewDialog(page);

  const typePattern = new RegExp(`^${escapeRegExp(type)}$`, "i");
  const typeClicked = await clickFirstVisible([
    page.getByRole("button", { name: typePattern }),
    page.getByRole("menuitem", { name: typePattern }),
    page.getByText(typePattern, { exact: true }),
  ]);

  if (!typeClicked) {
    throw new Error(`Could not find the Notion view type control for "${type}".`);
  }

  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

  const fallbackNames = type === "Form"
    ? [name, "Form builder"]
    : [name, "Default view"];

  const renamed = await renameCurrentView(page, name, fallbackNames);
  if (!renamed) {
    throw new Error(`View "${name}" was created but could not be renamed through the current Notion view settings flow.`);
  }

  const createdTab = await locateViewTab(page, name);
  if (!createdTab) {
    throw new Error(`View "${name}" was not visible after creation.`);
  }

  return createdTab;
}

async function ensureView(page, { name, type }) {
  let tab = await locateViewTab(page, name);
  if (!tab) {
    const recoveryNames = type === "Form"
      ? ["New view", "Form builder", VALIDATION_BUNDLE_QUICK_INTAKE_FORM]
      : ["New view", "Table", "Default view", VALIDATION_BUNDLE_PRIMARY_VIEW];

    const recoverableView = await (async () => {
      for (const recoveryName of recoveryNames) {
        const candidate = await locateViewTab(page, recoveryName);
        if (candidate) {
          return recoveryName;
        }
      }
      return null;
    })();

    if (recoverableView) {
      const renamed = await renameCurrentView(page, name, [recoverableView]);
      if (!renamed) {
        tab = await createNamedView(page, { name, type });
      } else {
        tab = await locateViewTab(page, name);
      }
    } else {
      tab = await createNamedView(page, { name, type });
    }
  }

  await tab.click().catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  return {
    present: true,
    url: page.url(),
  };
}

async function openNewMenu(page) {
  const clicked = await clickFirstVisible([
    page.locator('button[aria-haspopup="menu"]', { hasText: /^New$/i }),
    page.locator('button[aria-haspopup="dialog"]', { hasText: /^New$/i }),
    page.locator('button[aria-label*="template" i]'),
    page.getByRole("button", { name: /new .*template/i }),
  ]);

  if (!clicked) {
    throw new Error("Could not open the Validation Sessions new/template menu in Notion.");
  }
}

async function createTemplateViaUi(page, templateName) {
  const startingUrl = page.url();
  await openNewMenu(page);

  const created = await clickFirstVisible([
    page.getByText(/new template/i),
    page.getByRole("menuitem", { name: /new template/i }),
    page.getByRole("button", { name: /new template/i }),
  ]);
  if (!created) {
    throw new Error("Could not find the Notion control for creating a new database template.");
  }

  await page.waitForURL((url) => url.toString() !== startingUrl, { timeout: 15_000 }).catch(() => {});
  const templatePageId = extractPageIdFromUrl(page.url());
  if (!templatePageId) {
    throw new Error("Notion did not navigate to a template page after creating the database template.");
  }

  const titleCandidates = [
    page.locator('[placeholder="Untitled"]').first(),
    page.locator('[contenteditable="true"]').first(),
  ];
  for (const titleField of titleCandidates) {
    try {
      if (await titleField.isVisible()) {
        await titleField.click();
        await titleField.fill(templateName).catch(async () => {
          await page.keyboard.press("Control+A").catch(() => {});
          await page.keyboard.type(templateName);
        });
        break;
      }
    } catch {
      // continue
    }
  }

  return templatePageId;
}

async function patchTemplateViaApi(bundleContext, templatePageId, timestamp) {
  const templateTargetPath = buildTemplateTargetPath(bundleContext.projectName);
  const page = await bundleContext.surfaceClient.request("GET", `pages/${templatePageId}`);
  const titlePropertyName = Object.keys(page.properties || {}).find((key) => page.properties[key]?.type === "title");
  const body = {
    icon: VALIDATION_SESSION_ICON,
  };

  if (titlePropertyName) {
    body.properties = {
      [titlePropertyName]: {
        title: [{
          type: "text",
          text: { content: VALIDATION_BUNDLE_TEMPLATE_NAME },
        }],
      },
    };
  }

  await bundleContext.surfaceClient.request("PATCH", `pages/${templatePageId}`, body);
  await replacePageMarkdown(
    templatePageId,
    templateTargetPath,
    buildManagedValidationSessionTemplateMarkdown({
      projectName: bundleContext.projectName,
      timestamp,
    }),
    bundleContext.surfaceClient,
  );
}

async function ensureTemplateDefault(page, templateName) {
  await openNewMenu(page);

  const templateRow = page.getByText(templateName, { exact: true }).first();
  if (!(await safeTextExists(templateRow))) {
    throw new Error(`Template "${templateName}" was not visible in the Notion template menu.`);
  }

  const rowContainer = templateRow.locator("xpath=ancestor-or-self::*[self::div or self::button][1]");
  const menuButton = rowContainer.getByRole("button", { name: /more|menu/i }).first();
  if (!(await safeTextExists(menuButton))) {
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }

  await menuButton.click();
  const setDefaultClicked = await clickFirstVisible([
    page.getByRole("menuitem", { name: /set as default/i }),
    page.getByText(/set as default/i),
  ]);

  await page.keyboard.press("Escape").catch(() => {});
  return setDefaultClicked;
}

async function inspectButton(page) {
  const locator = page.getByText(VALIDATION_BUNDLE_BUTTON_LABEL, { exact: true }).first();
  if (!(await safeTextExists(locator))) {
    return {
      present: false,
      targetMatches: false,
    };
  }

  return {
    present: true,
    targetMatches: null,
  };
}

async function createButton(page, quickIntakeUrl) {
  const editor = page.locator('[contenteditable="true"]').last();
  if (!(await safeTextExists(editor))) {
    throw new Error("Could not find a Notion editor surface to insert the validation-session button.");
  }

  await editor.click();
  await page.keyboard.type("/button");
  await page.keyboard.press("Enter");

  const dialog = page.locator('[role="dialog"]').last();
  await dialog.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});

  const nameField = dialog.getByRole("textbox", { name: /name|label/i }).first();
  if (await safeTextExists(nameField)) {
    await nameField.fill(VALIDATION_BUNDLE_BUTTON_LABEL);
  }

  const openLinkOption = dialog.getByText(/open link|open url/i).first();
  if (await safeTextExists(openLinkOption)) {
    await openLinkOption.click();
  }

  const urlField = dialog.getByRole("textbox", { name: /url|link/i }).first();
  if (await safeTextExists(urlField)) {
    await urlField.fill(quickIntakeUrl);
  }

  const saved = await clickFirstVisible([
    dialog.getByRole("button", { name: /done|create|save/i }),
  ]);
  if (!saved) {
    await dialog.press("Enter").catch(() => {});
  }
}

async function inspectUiBundleState(bundleContext, page) {
  await openPage(page, bundleContext.databaseTarget.pageId);
  const activeSessionsView = await locateViewTab(page, VALIDATION_BUNDLE_PRIMARY_VIEW);
  const quickIntakeView = await locateViewTab(page, VALIDATION_BUNDLE_QUICK_INTAKE_FORM);

  let quickIntakeUrl = null;
  if (quickIntakeView) {
    await quickIntakeView.click().catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    quickIntakeUrl = page.url();
  }

  const template = await findTemplateState(bundleContext);

  await openPage(page, bundleContext.validationTarget.pageId);
  const button = await inspectButton(page);

  return {
    activeSessionsView: {
      present: Boolean(activeSessionsView),
    },
    quickIntakeForm: {
      present: Boolean(quickIntakeView),
      url: quickIntakeUrl,
    },
    validationSessionTemplate: template,
    button: {
      ...button,
      url: quickIntakeUrl,
    },
  };
}

function buildBundleActions(uiBundle) {
  const actions = [];

  if (!uiBundle.activeSessionsView.present) {
    actions.push({
      id: "create-active-sessions-view",
      title: VALIDATION_BUNDLE_PRIMARY_VIEW,
      type: "create-view",
    });
  }

  if (!uiBundle.quickIntakeForm.present) {
    actions.push({
      id: "create-quick-intake-form",
      title: VALIDATION_BUNDLE_QUICK_INTAKE_FORM,
      type: "create-form-view",
    });
  }

  if (!uiBundle.validationSessionTemplate.present) {
    actions.push({
      id: "create-validation-template",
      title: VALIDATION_BUNDLE_TEMPLATE_NAME,
      type: "create-template",
    });
  } else {
    if (!uiBundle.validationSessionTemplate.managed) {
      actions.push({
        id: "repair-validation-template-body",
        title: VALIDATION_BUNDLE_TEMPLATE_NAME,
        type: "repair-template",
      });
    }
    if (!uiBundle.validationSessionTemplate.isDefault) {
      actions.push({
        id: "set-default-validation-template",
        title: VALIDATION_BUNDLE_TEMPLATE_NAME,
        type: "set-default-template",
      });
    }
  }

  if (!uiBundle.button.present) {
    actions.push({
      id: "create-validation-button",
      title: VALIDATION_BUNDLE_BUTTON_LABEL,
      type: "create-button",
    });
  }

  return actions;
}

function buildManualChecks(uiBundle, uiAuthLoggedIn) {
  if (!uiAuthLoggedIn) {
    return [{
      id: "notion-login",
      title: "Notion login",
      status: "manual-required",
      reason: "A persisted Playwright Chromium session is required before UI bundle automation can run.",
    }];
  }

  const checks = [];
  if (uiBundle.button.present && uiBundle.button.targetMatches === null) {
    checks.push({
      id: "button-target-audit",
      title: "Validation button target",
      status: "manual-check",
      reason: "The button is present, but Notion does not expose a stable non-mutating target inspector for this button block.",
    });
  }
  return checks;
}

async function applyUiBundle(bundleContext, page, timestamp) {
  await openPage(page, bundleContext.databaseTarget.pageId);

  if (!await locateViewTab(page, VALIDATION_BUNDLE_PRIMARY_VIEW)) {
    await createNamedView(page, { name: VALIDATION_BUNDLE_PRIMARY_VIEW, type: "Table" });
  }

  let quickIntakeTab = await locateViewTab(page, VALIDATION_BUNDLE_QUICK_INTAKE_FORM);
  if (!quickIntakeTab) {
    quickIntakeTab = await createNamedView(page, { name: VALIDATION_BUNDLE_QUICK_INTAKE_FORM, type: "Form" });
  }
  await quickIntakeTab.click().catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  const quickIntakeUrl = page.url();

  let templateState = await findTemplateState(bundleContext);
  if (!templateState.present) {
    const templatePageId = await createTemplateViaUi(page, VALIDATION_BUNDLE_TEMPLATE_NAME);
    await patchTemplateViaApi(bundleContext, templatePageId, timestamp);
    templateState = {
      present: true,
      isDefault: false,
      pageId: templatePageId,
      managed: true,
      iconMatches: true,
    };
    await openPage(page, bundleContext.databaseTarget.pageId);
  } else if (!templateState.managed || !templateState.iconMatches) {
    await patchTemplateViaApi(bundleContext, templateState.pageId, timestamp);
    templateState = await findTemplateState(bundleContext);
  }

  if (!templateState.isDefault) {
    await ensureTemplateDefault(page, VALIDATION_BUNDLE_TEMPLATE_NAME);
  }

  await openPage(page, bundleContext.validationTarget.pageId);
  const buttonState = await inspectButton(page);
  if (!buttonState.present) {
    await createButton(page, quickIntakeUrl);
  }
}

async function withBundleSession({
  command,
  headed = false,
  timestamp = nowTimestamp(),
  body,
  launchChromiumSessionImpl = launchChromiumSession,
}) {
  const session = await launchChromiumSessionImpl({
    headed,
    command,
    timestamp,
  });

  try {
    return await body(session, timestamp);
  } catch (error) {
    const screenshotPath = await captureFailureArtifact(session.page, session.artifacts);
    if (error instanceof Error && screenshotPath) {
      error.message = `${error.message}\nFailure screenshot: ${screenshotPath}`;
    }
    throw error;
  } finally {
    await session.context.close().catch(() => {});
    if (session.browser) {
      await session.browser.close().catch(() => {});
    }
  }
}

export async function loginValidationBundle({
  config,
  timestamp = nowTimestamp(),
  launchChromiumSessionImpl = launchChromiumSession,
  hasNotionAuthCookieImpl = hasNotionAuthCookie,
  waitForNotionLoginImpl = waitForNotionLogin,
  waitForAuthenticatedTargetAccessImpl = waitForAuthenticatedTargetAccess,
  persistChromiumStorageStateImpl = persistChromiumStorageState,
  acquireLoginLockImpl = acquireLoginLock,
  releaseLoginLockImpl = releaseLoginLock,
  buildLoginTargetUrlImpl = buildLoginTargetUrl,
}) {
  acquireLoginLockImpl("validation-bundle-login");

  try {
    return await withBundleSession({
      command: "validation-bundle-login",
      headed: true,
    timestamp,
    launchChromiumSessionImpl,
    body: async ({ context, page, profileDir }) => {
      const targetUrl = buildLoginTargetUrlImpl(config);
      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

      const authenticatedPageAccess = await waitForAuthenticatedTargetAccessImpl(page, targetUrl, {
        context,
      });
      if (!authenticatedPageAccess) {
        throw new Error("Chromium login window was closed before authenticated Notion page access was confirmed.");
      }

        await persistChromiumStorageStateImpl(context);

        return {
          ok: true,
          command: "validation-bundle-login",
          uiAuth: buildUiAuthResult({ loggedIn: true, profileDir }),
        };
      },
    });
  } finally {
    releaseLoginLockImpl();
  }
}

async function runValidationBundle({
  command,
  apply = false,
  config,
  projectName,
  projectTokenEnv,
  timestamp = nowTimestamp(),
  loadValidationBundleContextImpl = loadValidationBundleContext,
  launchChromiumSessionImpl = launchChromiumSession,
  getActiveLoginLockImpl = getActiveLoginLock,
  inspectUiBundleStateImpl = inspectUiBundleState,
  applyUiBundleImpl = applyUiBundle,
  checkAuthenticatedTargetAccessImpl = checkAuthenticatedTargetAccess,
}) {
  const bundleContext = await loadValidationBundleContextImpl({
    config,
    projectName,
    projectTokenEnv,
  });

  if (!bundleContext.apiBundle.initialized || bundleContext.apiBundle.failures.length > 0) {
    return {
      ok: false,
      command,
      projectId: bundleContext.projectId,
      targetPath: bundleContext.targetPath,
      authMode: bundleContext.authMode,
      uiAuth: null,
      apiBundle: bundleContext.apiBundle,
      uiBundle: null,
      actions: [],
      failures: [
        "Validation Sessions must pass the API-visible bundle verification before UI bundle automation can run.",
        ...bundleContext.apiBundle.failures,
      ],
      manualChecks: [],
    };
  }

  if (await getActiveLoginLockImpl()) {
    return buildLoginInProgressResult(command, bundleContext);
  }

  return withBundleSession({
    command,
    headed: false,
    timestamp,
    launchChromiumSessionImpl,
    body: async ({ context, page, profileDir }) => {
      const targetUrl = buildNotionPageUrl(bundleContext.validationTarget.pageId);
      const authenticated = await checkAuthenticatedTargetAccessImpl(page, targetUrl);
      const uiAuth = buildUiAuthResult({ loggedIn: authenticated, profileDir });
      if (!authenticated) {
        return buildNotLoggedInResult(command, bundleContext, uiAuth, [
          "No valid saved Chromium Notion session is available. Run \"validation-bundle login\" first.",
        ]);
      }

      const initialUiBundle = await inspectUiBundleStateImpl(bundleContext, page);
  const initialActions = buildBundleActions(initialUiBundle);
  if (command === "validation-bundle-preview" || (!apply && command === "validation-bundle-apply")) {
    const manualChecks = buildManualChecks(initialUiBundle, true);
    return {
      ok: initialActions.length === 0,
          command,
          projectId: bundleContext.projectId,
          targetPath: bundleContext.targetPath,
          authMode: bundleContext.authMode,
          uiAuth,
          apiBundle: bundleContext.apiBundle,
          uiBundle: initialUiBundle,
          actions: initialActions,
          failures: [],
          manualChecks,
        };
      }

      if (command === "validation-bundle-apply" && apply) {
        await applyUiBundleImpl(bundleContext, page, timestamp);
      }

      const finalUiBundle = await inspectUiBundleStateImpl(bundleContext, page);
      const remainingActions = buildBundleActions(finalUiBundle);
      const manualChecks = buildManualChecks(finalUiBundle, true);

      return {
        ok: remainingActions.length === 0,
        command,
        projectId: bundleContext.projectId,
        targetPath: bundleContext.targetPath,
        authMode: bundleContext.authMode,
        uiAuth,
        apiBundle: bundleContext.apiBundle,
        uiBundle: finalUiBundle,
        actions: remainingActions,
        failures: [],
        manualChecks,
      };
    },
  });
}

export async function previewValidationBundle(options) {
  return runValidationBundle({
    command: "validation-bundle-preview",
    ...options,
  });
}

export async function applyValidationBundle(options) {
  return runValidationBundle({
    command: "validation-bundle-apply",
    ...options,
  });
}

export async function verifyValidationBundle(options) {
  return runValidationBundle({
    command: "validation-bundle-verify",
    ...options,
  });
}
