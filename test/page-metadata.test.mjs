import test from "node:test";
import assert from "node:assert/strict";

import {
  PAGE_METADATA_SCHEMA,
  assertLivePageMetadataStable,
  assertPullPageMetadataFresh,
  assertPullPageMetadataFreshFromNotion,
  buildPullPageMetadata,
  fetchLivePageMetadata,
  normalizeLivePageMetadata,
  validatePullPageMetadata,
} from "../src/notion/page-metadata.mjs";
import { assertJsonContract } from "../src/contracts/json-contracts.mjs";

const BASE_METADATA = {
  schema: PAGE_METADATA_SCHEMA,
  commandFamily: "page",
  workspaceName: "infrastructure-hq",
  targetPath: "Projects > SNPM > Planning > Roadmap",
  pageId: "page-1",
  projectId: "project-1",
  authMode: "project-token",
  lastEditedTime: "2026-04-23T20:00:00.000Z",
  pulledAt: "2026-04-23T20:01:00.000Z",
};

const LIVE_METADATA = {
  pageId: "page-1",
  lastEditedTime: "2026-04-23T20:00:00.000Z",
  archived: false,
};

test("fetchLivePageMetadata fetches page metadata through GET pages/{pageId}", async () => {
  const requests = [];
  const client = {
    async request(method, apiPath) {
      requests.push({ method, apiPath });
      return {
        id: "page-1",
        last_edited_time: "2026-04-23T20:00:00.000Z",
        archived: false,
        in_trash: false,
      };
    },
  };

  const metadata = await fetchLivePageMetadata("page-1", client);

  assert.deepEqual(requests, [{ method: "GET", apiPath: "pages/page-1" }]);
  assert.deepEqual(metadata, LIVE_METADATA);
});

test("normalizeLivePageMetadata rejects malformed live page responses", () => {
  assert.throws(
    () => normalizeLivePageMetadata(null),
    /must be an object/,
  );
  assert.throws(
    () => normalizeLivePageMetadata({ id: "page-1" }),
    /lastEditedTime/,
  );
});

test("buildPullPageMetadata creates the strict sidecar shape", () => {
  const metadata = buildPullPageMetadata({
    commandFamily: "page",
    workspaceName: "infrastructure-hq",
    targetPath: "Projects > SNPM > Planning > Roadmap",
    pageId: "page-1",
    projectId: "project-1",
    authMode: "project-token",
    lastEditedTime: "2026-04-23T20:00:00.000Z",
    pulledAt: "2026-04-23T20:01:00.000Z",
  });

  assert.deepEqual(metadata, BASE_METADATA);
  assertJsonContract("snpm.pull-metadata.v1", metadata);
});

test("validatePullPageMetadata rejects missing and malformed metadata", () => {
  assert.throws(
    () => validatePullPageMetadata(null),
    /must be a JSON object/,
  );
  assert.throws(
    () => validatePullPageMetadata({ ...BASE_METADATA, schema: "old" }),
    /must use schema/,
  );
  assert.throws(
    () => validatePullPageMetadata({ ...BASE_METADATA, targetPath: "" }),
    /targetPath/,
  );
});

test("validatePullPageMetadata rejects page body, diffs, tokens, env values, and secrets", () => {
  for (const fieldName of ["bodyMarkdown", "markdown", "diff", "token", "env", "secret"]) {
    assert.throws(
      () => validatePullPageMetadata({ ...BASE_METADATA, [fieldName]: "unsafe" }),
      new RegExp(`unsupported field "${fieldName}"`),
    );
  }
});

test("validatePullPageMetadata failure messages do not serialize sensitive field values", () => {
  const sensitiveValues = [
    "raw-notion-body-sentinel",
    "ntn_token_sentinel",
    "PROJECT_TOKEN_ENV_VALUE",
    "generated-secret-sentinel",
    "Error: stack sentinel\n    at secret-generator",
  ];
  const metadata = {
    ...BASE_METADATA,
    bodyMarkdown: sensitiveValues[0],
    token: sensitiveValues[1],
    envValue: sensitiveValues[2],
    generatedValue: sensitiveValues[3],
    stack: sensitiveValues[4],
  };

  assert.throws(
    () => validatePullPageMetadata(metadata),
    (error) => {
      const serialized = JSON.stringify({
        message: error.message,
        name: error.name,
      });
      assert.match(error.message, /unsupported field "bodyMarkdown"/);
      for (const value of sensitiveValues) {
        assert.equal(serialized.includes(value), false);
      }
      assert.equal(serialized.includes("secret-generator"), false);
      return true;
    },
  );
});

test("assertPullPageMetadataFresh rejects command, workspace, target, page, and project mismatches", () => {
  for (const [fieldName, expectedValue] of [
    ["commandFamily", "doc"],
    ["workspaceName", "other-workspace"],
    ["targetPath", "Projects > SNPM > Planning > Backlog"],
    ["pageId", "page-2"],
    ["projectId", "project-2"],
  ]) {
    assert.throws(
      () => assertPullPageMetadataFresh({
        metadata: BASE_METADATA,
        liveMetadata: LIVE_METADATA,
        [fieldName]: expectedValue,
      }),
      new RegExp(`${fieldName} mismatch`),
    );
  }
});

test("assertPullPageMetadataFresh rejects stale live metadata", () => {
  assert.throws(
    () => assertPullPageMetadataFresh({
      metadata: BASE_METADATA,
      liveMetadata: {
        ...LIVE_METADATA,
        lastEditedTime: "2026-04-23T20:05:00.000Z",
      },
      commandFamily: "page",
      workspaceName: "infrastructure-hq",
      targetPath: "Projects > SNPM > Planning > Roadmap",
      pageId: "page-1",
      projectId: "project-1",
    }),
    /Stale metadata/,
  );
});

test("assertPullPageMetadataFresh rejects archived pages", () => {
  assert.throws(
    () => assertPullPageMetadataFresh({
      metadata: BASE_METADATA,
      liveMetadata: {
        ...LIVE_METADATA,
        archived: true,
      },
      commandFamily: "page",
      workspaceName: "infrastructure-hq",
      targetPath: "Projects > SNPM > Planning > Roadmap",
      pageId: "page-1",
      projectId: "project-1",
    }),
    /archived or in trash/,
  );
});

test("assertPullPageMetadataFresh accepts fresh metadata", () => {
  const metadata = assertPullPageMetadataFresh({
    metadata: BASE_METADATA,
    liveMetadata: LIVE_METADATA,
    commandFamily: "page",
    workspaceName: "infrastructure-hq",
    targetPath: "Projects > SNPM > Planning > Roadmap",
    pageId: "page-1",
    projectId: "project-1",
  });

  assert.deepEqual(metadata, BASE_METADATA);
});

test("assertPullPageMetadataFreshFromNotion fetches live metadata before validation", async () => {
  const requests = [];
  const client = {
    async request(method, apiPath) {
      requests.push({ method, apiPath });
      return {
        id: "page-1",
        last_edited_time: "2026-04-23T20:00:00.000Z",
        archived: false,
      };
    },
  };

  const metadata = await assertPullPageMetadataFreshFromNotion({
    metadata: BASE_METADATA,
    client,
    commandFamily: "page",
    workspaceName: "infrastructure-hq",
    targetPath: "Projects > SNPM > Planning > Roadmap",
    pageId: "page-1",
    projectId: "project-1",
  });

  assert.deepEqual(requests, [{ method: "GET", apiPath: "pages/page-1" }]);
  assert.deepEqual(metadata, BASE_METADATA);
});

test("assertLivePageMetadataStable rejects pull-time stale metadata with retry guidance", () => {
  assert.throws(
    () => assertLivePageMetadataStable({
      before: LIVE_METADATA,
      after: {
        ...LIVE_METADATA,
        lastEditedTime: "2026-04-23T20:02:00.000Z",
      },
      targetPath: "Projects > SNPM > Planning > Roadmap",
    }),
    /Retry the pull/,
  );
});

test("assertLivePageMetadataStable rejects archived or trashed pages", () => {
  assert.throws(
    () => assertLivePageMetadataStable({
      before: LIVE_METADATA,
      after: {
        ...LIVE_METADATA,
        archived: true,
      },
      targetPath: "Projects > SNPM > Planning > Roadmap",
    }),
    /archived or in trash/,
  );
});
