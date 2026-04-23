export const PAGE_METADATA_SCHEMA = "snpm.pull-metadata.v1";

const SIDECAR_KEYS = new Set([
  "schema",
  "commandFamily",
  "workspaceName",
  "targetPath",
  "pageId",
  "projectId",
  "authMode",
  "lastEditedTime",
  "pulledAt",
]);

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Metadata field "${fieldName}" must be a non-empty string.`);
  }

  return value;
}

function optionalNonEmptyString(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  return requireNonEmptyString(value, fieldName);
}

function assertNoUnknownMetadataKeys(metadata) {
  for (const key of Object.keys(metadata)) {
    if (!SIDECAR_KEYS.has(key)) {
      throw new Error(`Metadata includes unsupported field "${key}".`);
    }
  }
}

export function normalizeLivePageMetadata(page) {
  if (!page || typeof page !== "object" || Array.isArray(page)) {
    throw new Error("Live page metadata response must be an object.");
  }

  return {
    pageId: requireNonEmptyString(page.id, "pageId"),
    lastEditedTime: requireNonEmptyString(page.last_edited_time, "lastEditedTime"),
    archived: page.archived === true || page.in_trash === true,
  };
}

export async function fetchLivePageMetadata(pageId, client) {
  requireNonEmptyString(pageId, "pageId");

  if (!client || typeof client.request !== "function") {
    throw new Error("A Notion client with request(method, apiPath) is required.");
  }

  return normalizeLivePageMetadata(await client.request("GET", `pages/${pageId}`));
}

export function assertLivePageMetadataStable({
  before,
  after,
  targetPath,
}) {
  const initialMetadata = before
    && typeof before === "object"
    && "last_edited_time" in before
    ? normalizeLivePageMetadata(before)
    : before;
  const latestMetadata = after
    && typeof after === "object"
    && "last_edited_time" in after
    ? normalizeLivePageMetadata(after)
    : after;

  if (!initialMetadata || !latestMetadata) {
    throw new Error("Live page metadata is required for stable pull validation.");
  }

  requireNonEmptyString(initialMetadata.pageId, "before.pageId");
  requireNonEmptyString(initialMetadata.lastEditedTime, "before.lastEditedTime");
  requireNonEmptyString(latestMetadata.pageId, "after.pageId");
  requireNonEmptyString(latestMetadata.lastEditedTime, "after.lastEditedTime");

  if (latestMetadata.archived === true) {
    throw new Error(`Page "${latestMetadata.pageId}" is archived or in trash and cannot be pulled safely.`);
  }

  if (
    initialMetadata.pageId !== latestMetadata.pageId
    || initialMetadata.lastEditedTime !== latestMetadata.lastEditedTime
  ) {
    throw new Error(
      `Live page changed while pulling "${targetPath}". Retry the pull before editing or pushing.`,
    );
  }

  return latestMetadata;
}

export function buildPullPageMetadata({
  commandFamily,
  workspaceName,
  targetPath,
  pageId,
  projectId,
  authMode,
  lastEditedTime,
  pulledAt = new Date().toISOString(),
}) {
  return validatePullPageMetadata({
    schema: PAGE_METADATA_SCHEMA,
    commandFamily,
    workspaceName,
    targetPath,
    pageId,
    projectId,
    authMode,
    lastEditedTime,
    pulledAt,
  });
}

export function validatePullPageMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Metadata sidecar must be a JSON object.");
  }

  assertNoUnknownMetadataKeys(metadata);

  if (metadata.schema !== PAGE_METADATA_SCHEMA) {
    throw new Error(`Metadata sidecar must use schema "${PAGE_METADATA_SCHEMA}".`);
  }

  const validated = {
    schema: PAGE_METADATA_SCHEMA,
    commandFamily: requireNonEmptyString(metadata.commandFamily, "commandFamily"),
    workspaceName: requireNonEmptyString(metadata.workspaceName, "workspaceName"),
    targetPath: requireNonEmptyString(metadata.targetPath, "targetPath"),
    pageId: requireNonEmptyString(metadata.pageId, "pageId"),
    lastEditedTime: requireNonEmptyString(metadata.lastEditedTime, "lastEditedTime"),
    pulledAt: requireNonEmptyString(metadata.pulledAt, "pulledAt"),
  };

  const projectId = optionalNonEmptyString(metadata.projectId, "projectId");
  if (projectId !== undefined) {
    validated.projectId = projectId;
  }

  const authMode = optionalNonEmptyString(metadata.authMode, "authMode");
  if (authMode !== undefined) {
    validated.authMode = authMode;
  }

  return validated;
}

function assertExpectedValue(metadata, expected, fieldName) {
  if (expected[fieldName] === undefined) {
    return;
  }

  if (metadata[fieldName] !== expected[fieldName]) {
    throw new Error(
      `Metadata ${fieldName} mismatch: expected "${expected[fieldName]}", got "${metadata[fieldName]}".`,
    );
  }
}

export function assertPullPageMetadataFresh({
  metadata,
  liveMetadata,
  commandFamily,
  workspaceName,
  targetPath,
  pageId,
  projectId,
}) {
  const validatedMetadata = validatePullPageMetadata(metadata);
  const normalizedLive = liveMetadata
    && typeof liveMetadata === "object"
    && "last_edited_time" in liveMetadata
    ? normalizeLivePageMetadata(liveMetadata)
    : liveMetadata;

  if (!normalizedLive || typeof normalizedLive !== "object") {
    throw new Error("Live page metadata is required for freshness validation.");
  }

  requireNonEmptyString(normalizedLive.pageId, "liveMetadata.pageId");
  requireNonEmptyString(normalizedLive.lastEditedTime, "liveMetadata.lastEditedTime");

  assertExpectedValue(validatedMetadata, { commandFamily }, "commandFamily");
  assertExpectedValue(validatedMetadata, { workspaceName }, "workspaceName");
  assertExpectedValue(validatedMetadata, { targetPath }, "targetPath");
  assertExpectedValue(validatedMetadata, { pageId }, "pageId");
  assertExpectedValue(validatedMetadata, { projectId }, "projectId");

  if (normalizedLive.archived === true) {
    throw new Error(`Page "${validatedMetadata.pageId}" is archived or in trash and cannot be updated safely.`);
  }

  if (normalizedLive.pageId !== validatedMetadata.pageId) {
    throw new Error(
      `Live page id mismatch: metadata references "${validatedMetadata.pageId}", got "${normalizedLive.pageId}".`,
    );
  }

  if (normalizedLive.lastEditedTime !== validatedMetadata.lastEditedTime) {
    throw new Error(
      `Stale metadata for "${validatedMetadata.targetPath}": pulled at last_edited_time "${validatedMetadata.lastEditedTime}", live page is "${normalizedLive.lastEditedTime}".`,
    );
  }

  return validatedMetadata;
}

export async function assertPullPageMetadataFreshFromNotion({
  metadata,
  client,
  commandFamily,
  workspaceName,
  targetPath,
  pageId,
  projectId,
}) {
  const validatedMetadata = validatePullPageMetadata(metadata);
  const liveMetadata = await fetchLivePageMetadata(validatedMetadata.pageId, client);

  return assertPullPageMetadataFresh({
    metadata: validatedMetadata,
    liveMetadata,
    commandFamily,
    workspaceName,
    targetPath,
    pageId,
    projectId,
  });
}
