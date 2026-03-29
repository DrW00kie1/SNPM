import test from "node:test";
import assert from "node:assert/strict";

import {
  applyValidationBundle,
  loginValidationBundle,
  previewValidationBundle,
  verifyValidationBundle,
} from "../src/notion-ui/validation-bundle.mjs";

function fakeSession() {
  const page = {
    async goto() {},
    url() {
      return "https://www.notion.so/3329f5f666d08157abcdabcdabcdabcd";
    },
    async waitForLoadState() {},
  };
  const context = {
    async close() {},
    async cookies() {
      return [];
    },
  };

  return {
    context,
    page,
    profileDir: "C:\\Users\\Sean\\AppData\\Local\\SNPM\\playwright\\notion-profile",
    artifacts: {},
  };
}

function baseBundleContext() {
  return {
    projectId: "project-root",
    targetPath: "Projects > SNPM > Ops > Validation",
    authMode: "project-token",
    apiBundle: {
      initialized: true,
      failures: [],
      rowCount: 1,
    },
    validationTarget: { pageId: "validation-page" },
    databaseTarget: { pageId: "validation-database" },
    surfaceClient: {},
    templates: [],
    projectName: "SNPM",
  };
}

test("loginValidationBundle succeeds when Chromium session captures a Notion auth cookie", async () => {
  const result = await loginValidationBundle({
    launchChromiumSessionImpl: async () => fakeSession(),
    hasNotionAuthCookieImpl: async () => true,
    waitForNotionLoginImpl: async () => false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.command, "validation-bundle-login");
  assert.equal(result.uiAuth.browser, "chromium");
  assert.equal(result.uiAuth.loggedIn, true);
});

test("previewValidationBundle returns a login failure when no Chromium session is available", async () => {
  const result = await previewValidationBundle({
    config: {},
    projectName: "SNPM",
    loadValidationBundleContextImpl: async () => baseBundleContext(),
    launchChromiumSessionImpl: async () => fakeSession(),
    hasNotionAuthCookieImpl: async () => false,
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /validation-bundle login/i);
  assert.equal(result.manualChecks[0].id, "notion-login");
});

test("previewValidationBundle reports the missing UI bundle actions without mutating", async () => {
  const result = await previewValidationBundle({
    config: {},
    projectName: "SNPM",
    loadValidationBundleContextImpl: async () => baseBundleContext(),
    launchChromiumSessionImpl: async () => fakeSession(),
    hasNotionAuthCookieImpl: async () => true,
    inspectUiBundleStateImpl: async () => ({
      activeSessionsView: { present: false },
      quickIntakeForm: { present: false, url: null },
      validationSessionTemplate: { present: false, isDefault: false, managed: false },
      button: { present: false, targetMatches: false, url: null },
    }),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.actions.map((entry) => entry.id), [
    "create-active-sessions-view",
    "create-quick-intake-form",
    "create-validation-template",
    "create-validation-button",
  ]);
});

test("applyValidationBundle runs reconciliation and reports clean state after apply", async () => {
  let inspected = 0;
  let applied = false;

  const result = await applyValidationBundle({
    apply: true,
    config: {},
    projectName: "SNPM",
    loadValidationBundleContextImpl: async () => baseBundleContext(),
    launchChromiumSessionImpl: async () => fakeSession(),
    hasNotionAuthCookieImpl: async () => true,
    inspectUiBundleStateImpl: async () => {
      inspected += 1;
      if (inspected === 1) {
        return {
          activeSessionsView: { present: false },
          quickIntakeForm: { present: false, url: null },
          validationSessionTemplate: { present: false, isDefault: false, managed: false },
          button: { present: false, targetMatches: false, url: null },
        };
      }

      return {
        activeSessionsView: { present: true },
        quickIntakeForm: { present: true, url: "https://www.notion.so/quick-intake?v=1" },
        validationSessionTemplate: { present: true, isDefault: true, managed: true, iconMatches: true },
        button: { present: true, targetMatches: null, url: "https://www.notion.so/quick-intake?v=1" },
      };
    },
    applyUiBundleImpl: async () => {
      applied = true;
    },
  });

  assert.equal(applied, true);
  assert.equal(result.ok, true);
  assert.equal(result.actions.length, 0);
  assert.equal(result.manualChecks[0].id, "button-target-audit");
});

test("verifyValidationBundle fails fast when API-visible bundle verification is unhealthy", async () => {
  const result = await verifyValidationBundle({
    config: {},
    projectName: "SNPM",
    loadValidationBundleContextImpl: async () => ({
      ...baseBundleContext(),
      apiBundle: {
        initialized: false,
        failures: ["Validation Sessions does not exist."],
        rowCount: 0,
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /API-visible bundle verification/i);
});
