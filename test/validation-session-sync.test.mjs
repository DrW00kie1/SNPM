import test from "node:test";
import assert from "node:assert/strict";

import {
  checkValidationSessionSyncManifest,
  pullValidationSessionSyncManifest,
  pushValidationSessionSyncManifest,
} from "../src/notion/validation-session-sync.mjs";

function baseManifest() {
  return {
    manifestPath: "C:\\example-project\\snpm.sync.json",
    manifestDir: "C:\\example-project",
    workspaceName: "infrastructure-hq",
    projectName: "Tall Man Training",
    entries: [{
      kind: "validation-session",
      title: "iPhone TestFlight 0.5.1 (2) - Sean - 2026-03-28",
      file: "ops/validation-sessions/iphone-testflight-0.5.1-2-sean-2026-03-28.md",
      absoluteFilePath: "C:\\example-project\\ops\\validation-sessions\\iphone-testflight-0.5.1-2-example-2026-03-28.md",
    }],
  };
}

function baseConfig() {
  return {
    notionVersion: "2026-03-11",
    workspace: { projectsPageId: "projects" },
  };
}

test("sync check reports in-sync validation-session artifacts", async () => {
  const manifest = baseManifest();
  const localFile = "---\nPlatform: iPhone\nSession State: Passed\nTester: Sean\nBuild Label: 0.5.1 (2)\nRunbook URL: https://example.com/runbook\nStarted On: 2026-03-28\nCompleted On: 2026-03-28\n---\n## Session Summary\n- Goal: Confirm the session is in sync.\n\n## Checklist\n- [x] Install build\n- [x] Complete smoke flow\n\n## Findings\n<callout>\nNote: No blocker.\n</callout>\n\n<details>\n<summary>Optional finding detail</summary>\n\nArea:\nSmoke flow\nExpected:\nComplete session\nActual:\nCompleted session\nEvidence:\nNone\n</details>\n\n## Follow-Up\n- [x] No follow-up required.\n";
  const result = await checkValidationSessionSyncManifest({
    config: baseConfig(),
    manifest,
    projectTokenEnv: "TALLMAN_NOTION_TOKEN",
    readFileSyncImpl: () => localFile,
    diffValidationSessionFileImpl: async () => ({
      targetPath: "Projects > Tall Man Training > Ops > Validation > Validation Sessions > iPhone TestFlight 0.5.1 (2) - Sean - 2026-03-28",
      hasDiff: false,
      diff: "",
    }),
  });

  assert.equal(result.command, "sync-check");
  assert.equal(result.authMode, "project-token");
  assert.equal(result.driftCount, 0);
  assert.deepEqual(result.failures, []);
  assert.equal(result.entries[0].status, "in-sync");
});

test("sync check reports local drift and missing files", async () => {
  const manifest = {
    ...baseManifest(),
    entries: [
      baseManifest().entries[0],
      {
        kind: "validation-session",
        title: "Android Smoke 0.5.1 (2) - Sean - 2026-03-28",
        file: "ops/validation-sessions/android-smoke-0.5.1-2-sean-2026-03-28.md",
        absoluteFilePath: "C:\\example-project\\ops\\validation-sessions\\android-smoke-0.5.1-2-example-2026-03-28.md",
      },
    ],
  };
  const localFiles = new Map([
    [manifest.entries[0].absoluteFilePath, "---\nPlatform: iPhone\nSession State: Passed\nTester: Sean\nBuild Label: 0.5.1 (2)\nRunbook URL: https://example.com/runbook\nStarted On: 2026-03-28\nCompleted On: 2026-03-28\n---\n## Session Summary\n- Goal: Local drift.\n\n## Checklist\n- [ ] Install build\n\n## Findings\n<callout>\nIssue: Waiting.\n</callout>\n\n## Follow-Up\n- [ ] None yet.\n"],
  ]);

  const result = await checkValidationSessionSyncManifest({
    config: baseConfig(),
    manifest,
    readFileSyncImpl: (filePath) => {
      if (!localFiles.has(filePath)) {
        const error = new Error(`ENOENT: ${filePath}`);
        error.code = "ENOENT";
        throw error;
      }
      return localFiles.get(filePath);
    },
    diffValidationSessionFileImpl: async ({ title }) => ({
      targetPath: `Projects > Tall Man Training > Ops > Validation > Validation Sessions > ${title}`,
      hasDiff: true,
      diff: "--- remote\n+++ local\n@@\n-- Passed\n+- Local drift\n",
    }),
    pullValidationSessionFileImpl: async ({ title }) => ({
      targetPath: `Projects > Tall Man Training > Ops > Validation > Validation Sessions > ${title}`,
      fileMarkdown: "---\nPlatform: Android\nSession State: Passed\nTester: Sean\nBuild Label: 0.5.1 (2)\nRunbook URL: https://example.com/runbook\nStarted On: 2026-03-28\nCompleted On: 2026-03-28\n---\n## Session Summary\n- Goal: Confirm Android smoke flow.\n\n## Checklist\n- [x] Launch build\n\n## Findings\n<callout>\nNote: None.\n</callout>\n\n## Follow-Up\n- [x] No follow-up required.\n",
    }),
  });

  assert.equal(result.driftCount, 2);
  assert.equal(result.entries[0].status, "drift");
  assert.equal(result.entries[1].status, "missing-local-file");
  assert.equal(result.failures.length, 0);
});

test("sync check reports missing rows, unmanaged rows, and missing surfaces as failures", async () => {
  const manifest = {
    ...baseManifest(),
    entries: [
      baseManifest().entries[0],
      {
        kind: "validation-session",
        title: "Missing Session",
        file: "ops/validation-sessions/missing.md",
        absoluteFilePath: "C:\\example-project\\ops\\validation-sessions\\missing.md",
      },
      {
        kind: "validation-session",
        title: "Legacy Session",
        file: "ops/validation-sessions/legacy.md",
        absoluteFilePath: "C:\\example-project\\ops\\validation-sessions\\legacy.md",
      },
    ],
  };

  let calls = 0;
  const result = await checkValidationSessionSyncManifest({
    config: baseConfig(),
    manifest,
    readFileSyncImpl: () => "---\nPlatform: iPhone\nSession State: Passed\nTester: Sean\nBuild Label: 0.5.1 (2)\nRunbook URL: https://example.com/runbook\nStarted On: 2026-03-28\nCompleted On: 2026-03-28\n---\n## Session Summary\n- Goal: Passed.\n\n## Checklist\n- [x] Launch build\n\n## Findings\n<callout>\nNote: None.\n</callout>\n\n## Follow-Up\n- [x] No follow-up required.\n",
    diffValidationSessionFileImpl: async ({ title }) => {
      calls += 1;
      if (title === manifest.entries[0].title) {
        throw new Error('Validation Sessions does not exist at Projects > Tall Man Training > Ops > Validation > Validation Sessions. Run "validation-sessions init" first.');
      }

      if (title === "Missing Session") {
        throw new Error('Validation session "Missing Session" does not exist at Projects > Tall Man Training > Ops > Validation > Validation Sessions. Use "validation-session create" first.');
      }

      throw new Error('Validation session "Legacy Session" is not managed by SNPM yet. Use "validation-session adopt" first.');
    },
  });

  assert.equal(calls, 3);
  assert.equal(result.entries[0].status, "error");
  assert.equal(result.entries[1].status, "error");
  assert.equal(result.entries[2].status, "error");
  assert.equal(result.failures.length, 3);
  assert.match(result.failures.join("\n"), /validation-sessions init/i);
  assert.match(result.failures.join("\n"), /validation-session create/i);
  assert.match(result.failures.join("\n"), /validation-session adopt/i);
});

test("sync pull previews and applies local file refreshes", async () => {
  const manifest = baseManifest();
  const writes = [];
  const mkdirs = [];

  const preview = await pullValidationSessionSyncManifest({
    config: baseConfig(),
    manifest,
    readFileSyncImpl: () => "---\nPlatform: iPhone\nSession State: Passed\nTester: Sean\nBuild Label: 0.5.0 (1)\nRunbook URL: https://example.com/runbook\nStarted On: 2026-03-20\nCompleted On: 2026-03-20\n---\n## Session Summary\n- Goal: Old.\n\n## Checklist\n- [ ] Launch build\n\n## Findings\n<callout>\nIssue: Old.\n</callout>\n\n## Follow-Up\n- [ ] Old.\n",
    pullValidationSessionFileImpl: async ({ title }) => ({
      targetPath: `Projects > Tall Man Training > Ops > Validation > Validation Sessions > ${title}`,
      fileMarkdown: "---\nPlatform: iPhone\nSession State: Passed\nTester: Sean\nBuild Label: 0.5.1 (2)\nRunbook URL: https://example.com/runbook\nStarted On: 2026-03-28\nCompleted On: 2026-03-28\n---\n## Session Summary\n- Goal: New.\n\n## Checklist\n- [x] Launch build\n\n## Findings\n<callout>\nIssue: New.\n</callout>\n\n## Follow-Up\n- [ ] No follow-up required.\n",
    }),
    writeFileSyncImpl: (...args) => writes.push(args),
    mkdirSyncImpl: (...args) => mkdirs.push(args),
  });

  assert.equal(preview.entries[0].status, "pull-preview");
  assert.equal(preview.entries[0].applied, false);
  assert.equal(writes.length, 0);

  const applied = await pullValidationSessionSyncManifest({
    apply: true,
    config: baseConfig(),
    manifest,
    readFileSyncImpl: () => {
      const error = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    },
    pullValidationSessionFileImpl: async ({ title }) => ({
      targetPath: `Projects > Tall Man Training > Ops > Validation > Validation Sessions > ${title}`,
      fileMarkdown: "---\nPlatform: iPhone\nSession State: Passed\nTester: Sean\nBuild Label: 0.5.1 (2)\nRunbook URL: https://example.com/runbook\nStarted On: 2026-03-28\nCompleted On: 2026-03-28\n---\n## Session Summary\n- Goal: New.\n\n## Checklist\n- [x] Launch build\n\n## Findings\n<callout>\nIssue: New.\n</callout>\n\n## Follow-Up\n- [ ] No follow-up required.\n",
    }),
    writeFileSyncImpl: (...args) => writes.push(args),
    mkdirSyncImpl: (...args) => mkdirs.push(args),
  });

  assert.equal(applied.entries[0].status, "pulled-created");
  assert.equal(applied.entries[0].applied, true);
  assert.equal(mkdirs.length > 0, true);
  assert.equal(writes.length > 0, true);
});

test("sync push previews and applies Notion updates from local files", async () => {
  const manifest = baseManifest();
  const localFile = "---\nPlatform: iPhone\nSession State: Failed\nTester: Sean\nBuild Label: 0.5.1 (2)\nRunbook URL: https://example.com/runbook\nStarted On: 2026-03-28\nCompleted On: 2026-03-28\n---\n## Session Summary\n- Goal: Failing.\n\n## Checklist\n- [x] Install build\n- [ ] Complete smoke flow\n\n## Findings\n<callout>\nBlocker: Smoke flow blocked by login issue.\n</callout>\n\n<details>\n<summary>Auth detail</summary>\n\nArea:\nLogin\nExpected:\nSign in succeeds\nActual:\nSpinner never resolves\nEvidence:\nVideo attached in Notion\n</details>\n\n## Follow-Up\n- [ ] Re-test after auth fix.\n";

  const preview = await pushValidationSessionSyncManifest({
    config: baseConfig(),
    manifest,
    readFileSyncImpl: () => localFile,
    pushValidationSessionFileImpl: async ({ apply, title }) => ({
      targetPath: `Projects > Tall Man Training > Ops > Validation > Validation Sessions > ${title}`,
      hasDiff: true,
      diff: "--- remote\n+++ local\n@@\n-- Passed\n+- Failed\n",
      applied: apply,
    }),
  });

  assert.equal(preview.entries[0].status, "push-preview");
  assert.equal(preview.entries[0].applied, false);

  const applied = await pushValidationSessionSyncManifest({
    apply: true,
    config: baseConfig(),
    manifest,
    readFileSyncImpl: () => localFile,
    pushValidationSessionFileImpl: async ({ apply, title }) => ({
      targetPath: `Projects > Tall Man Training > Ops > Validation > Validation Sessions > ${title}`,
      hasDiff: true,
      diff: "--- remote\n+++ local\n@@\n-- Passed\n+- Failed\n",
      applied: apply,
    }),
  });

  assert.equal(applied.entries[0].status, "pushed");
  assert.equal(applied.entries[0].applied, true);
});

test("sync push fails when the local sync artifact is missing", async () => {
  const manifest = baseManifest();
  const result = await pushValidationSessionSyncManifest({
    config: baseConfig(),
    manifest,
    readFileSyncImpl: () => {
      const error = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    },
  });

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /sync pull --apply/i);
  assert.equal(result.entries[0].status, "error");
});
