import { getProjectToken, getWorkspaceToken, nowTimestamp } from "./env.mjs";
import { makeNotionClient } from "./client.mjs";
import {
  createChildDatabase,
  findChildDatabase,
  getDatabaseTitle,
  getDateProperty,
  getPageTitleProperty,
  getPrimaryDataSourceId,
  getRichTextProperty,
  getSelectProperty,
  getUrlProperty,
  listChildDatabases,
  queryDataSource,
  retrieveDataSource,
  retrieveDatabase,
  updateDataSource,
  updateDatabase,
} from "./data-sources.mjs";
import { parseFrontMatterFile, renderFrontMatterFile } from "./frontmatter.mjs";
import {
  VALIDATION_SESSIONS_DATABASE_ICON,
  VALIDATION_SESSION_ICON,
  buildManagedValidationSessionMarkdown,
} from "./managed-page-templates.mjs";
import {
  choosePageSyncAuth,
  diffMarkdownText,
  fetchPageMarkdown,
  normalizeMarkdownNewlines,
  replacePageMarkdown,
  splitManagedPageMarkdownIfPresent,
} from "./page-markdown.mjs";
import {
  findProjectPathTarget,
  resolveValidationSessionsDatabaseTarget,
  resolveValidationTarget,
} from "./page-targets.mjs";

export const VALIDATION_SESSIONS_DATABASE_TITLE = "Validation Sessions";
export const VALIDATION_SESSION_FIELD_ORDER = [
  "Platform",
  "Session State",
  "Tester",
  "Build Label",
  "Runbook URL",
  "Started On",
  "Completed On",
];

const VALIDATION_SESSION_SELECT_OPTIONS = {
  Platform: [
    { name: "Web", color: "blue" },
    { name: "Android", color: "green" },
    { name: "iPhone", color: "purple" },
    { name: "Cross-Platform", color: "gray" },
  ],
  "Session State": [
    { name: "Planned", color: "gray" },
    { name: "In Progress", color: "blue" },
    { name: "Passed", color: "green" },
    { name: "Failed", color: "red" },
    { name: "Blocked", color: "yellow" },
  ],
};

function ensureBodyMarkdown(fileBodyMarkdown) {
  return normalizeValidationSessionBodyMarkdown(fileBodyMarkdown || "");
}

function managedPageError(title, hint) {
  return new Error(`Validation session "${title}" is not managed by SNPM yet. ${hint}`);
}

function alreadyManagedError(title) {
  return new Error(`Validation session "${title}" is already managed by SNPM. Use pull, diff, or push instead.`);
}

function buildValidationSessionTargetPath(projectName, title = null) {
  const base = `Projects > ${projectName} > Ops > Validation > ${VALIDATION_SESSIONS_DATABASE_TITLE}`;
  return title ? `${base} > ${title}` : base;
}

function buildValidationRootPath(projectName) {
  return `Projects > ${projectName} > Ops > Validation`;
}

function buildValidationSessionSchema() {
  return {
    Name: { title: {} },
    Platform: { select: { options: VALIDATION_SESSION_SELECT_OPTIONS.Platform } },
    "Session State": { select: { options: VALIDATION_SESSION_SELECT_OPTIONS["Session State"] } },
    Tester: { rich_text: {} },
    "Build Label": { rich_text: {} },
    "Runbook URL": { url: {} },
    "Started On": { date: {} },
    "Completed On": { date: {} },
  };
}

export function normalizeValidationSessionBodyMarkdown(bodyMarkdown) {
  const normalized = normalizeMarkdownNewlines(bodyMarkdown || "");
  const lines = normalized.split("\n");
  const output = [];
  let inCallout = false;
  let inDetails = false;

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];

    if (line === "<callout>") {
      inCallout = true;
    } else if (line === "</callout>") {
      inCallout = false;
    } else if (line === "<details>") {
      inDetails = true;
    } else if (line === "</details>") {
      inDetails = false;
    } else if ((inCallout || inDetails) && /^\t+/.test(line)) {
      line = line.replace(/^\t+/, "");
    }

    output.push(line);
  }

  return output
    .join("\n")
    .replace(/\n(## )/g, "\n\n$1")
    .replace(/\n(<callout>|<details>)/g, "\n\n$1")
    .replace(/(<\/callout>|<\/details>)\n(?!\n|## )/g, "$1\n\n")
    .replace(/(<summary>.*<\/summary>)\n(?!\n)/g, "$1\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "");
}

function buildRichTextValue(text) {
  if (!text) {
    return [];
  }

  return [{
    type: "text",
    text: { content: text },
  }];
}

function normalizeSessionFields(fields) {
  const normalized = {};
  const unknownKeys = Object.keys(fields || {}).filter((key) => !VALIDATION_SESSION_FIELD_ORDER.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(`Validation-session files include unsupported front matter keys: ${unknownKeys.join(", ")}`);
  }

  for (const key of VALIDATION_SESSION_FIELD_ORDER) {
    const value = fields?.[key];
    normalized[key] = typeof value === "string" ? value : "";
  }

  return normalized;
}

function buildValidationSessionPageProperties(title, fields) {
  const normalizedFields = normalizeSessionFields(fields);

  return {
    Name: {
      title: buildRichTextValue(title),
    },
    Platform: {
      select: normalizedFields.Platform ? { name: normalizedFields.Platform } : null,
    },
    "Session State": {
      select: normalizedFields["Session State"] ? { name: normalizedFields["Session State"] } : null,
    },
    Tester: {
      rich_text: buildRichTextValue(normalizedFields.Tester),
    },
    "Build Label": {
      rich_text: buildRichTextValue(normalizedFields["Build Label"]),
    },
    "Runbook URL": {
      url: normalizedFields["Runbook URL"] || null,
    },
    "Started On": {
      date: normalizedFields["Started On"] ? { start: normalizedFields["Started On"] } : null,
    },
    "Completed On": {
      date: normalizedFields["Completed On"] ? { start: normalizedFields["Completed On"] } : null,
    },
  };
}

function extractValidationSessionFields(page) {
  return normalizeSessionFields({
    Platform: getSelectProperty(page, "Platform"),
    "Session State": getSelectProperty(page, "Session State"),
    Tester: getRichTextProperty(page, "Tester"),
    "Build Label": getRichTextProperty(page, "Build Label"),
    "Runbook URL": getUrlProperty(page, "Runbook URL"),
    "Started On": getDateProperty(page, "Started On"),
    "Completed On": getDateProperty(page, "Completed On"),
  });
}

function renderValidationSessionFile({ fields, bodyMarkdown }) {
  return renderFrontMatterFile(
    normalizeSessionFields(fields),
    VALIDATION_SESSION_FIELD_ORDER,
    normalizeValidationSessionBodyMarkdown(bodyMarkdown),
  );
}

function parseValidationSessionFile(markdown) {
  const { fields, bodyMarkdown } = parseFrontMatterFile(markdown);
  return {
    fields: normalizeSessionFields(fields),
    bodyMarkdown: ensureBodyMarkdown(bodyMarkdown),
  };
}

function describeDataSourceProperty(property) {
  if (!property || typeof property !== "object") {
    return "missing";
  }

  if (!property.type) {
    const inferredType = Object.keys(property)[0];
    if (inferredType === "select") {
      const options = (property.select?.options || []).map((option) => option.name).join(", ");
      return `select [${options}]`;
    }
    return inferredType || "missing";
  }

  if (property.type === "select") {
    const options = (property.select?.options || []).map((option) => option.name).join(", ");
    return `select [${options}]`;
  }

  return property.type;
}

function renderValidationSessionsSummary({ targetPath, exists, database, dataSource }) {
  const lines = [
    `# ${targetPath}`,
    exists ? "State: Present" : "State: Missing",
  ];

  if (!exists) {
    lines.push("Database title: missing");
    lines.push("Icon: missing");
    lines.push("Schema: missing");
    return `${lines.join("\n")}\n`;
  }

  lines.push(`Database title: ${database.title?.[0]?.plain_text || VALIDATION_SESSIONS_DATABASE_TITLE}`);
  lines.push(`Icon: ${database.icon?.type === "emoji" ? database.icon.emoji : database.icon?.type || "missing"}`);
  lines.push("Schema:");

  for (const key of ["Name", ...VALIDATION_SESSION_FIELD_ORDER]) {
    lines.push(`- ${key}: ${describeDataSourceProperty(dataSource?.properties?.[key])}`);
  }

  return `${lines.join("\n")}\n`;
}

function iconMatches(icon, expectedIcon) {
  return icon?.type === expectedIcon.type && icon?.emoji === expectedIcon.emoji;
}

function extractManagedCanonicalSource(headerMarkdown) {
  return headerMarkdown
    .split("\n")
    .find((line) => line.startsWith("Canonical Source:"))
    ?.replace(/^Canonical Source:\s*/, "")
    .replace(/\\>/g, ">")
    || "";
}

function buildValidationSessionsInitNextStep() {
  return "Optional UI-only step: configure a form or view for Validation Sessions in Notion. That view setup remains outside SNPM v1 automation.";
}

function buildValidationSessionNormalizationNextStep(title) {
  return `Run validation-session-pull for "${title}" immediately, then validation-session-diff against the pulled file so the local file is normalized to Notion's stored markdown shape.`;
}

function expectedSelectOptionNames(propertyName) {
  return VALIDATION_SESSION_SELECT_OPTIONS[propertyName].map((option) => option.name);
}

function collectSchemaFailures(dataSource) {
  const failures = [];

  for (const [propertyName, expectedDefinition] of Object.entries(buildValidationSessionSchema())) {
    const actual = dataSource?.properties?.[propertyName];
    const expectedType = Object.keys(expectedDefinition)[0];

    if (!actual) {
      failures.push(`Missing property "${propertyName}" on Validation Sessions.`);
      continue;
    }

    if (actual.type !== expectedType) {
      failures.push(`Property "${propertyName}" on Validation Sessions should be ${expectedType}, got ${actual.type}.`);
      continue;
    }

    if (expectedType === "select") {
      const actualOptionNames = (actual.select?.options || []).map((option) => option.name);
      const expectedOptionNames = expectedSelectOptionNames(propertyName);
      if (
        actualOptionNames.length !== expectedOptionNames.length
        || expectedOptionNames.some((name) => !actualOptionNames.includes(name))
      ) {
        failures.push(
          `Property "${propertyName}" on Validation Sessions has unexpected options: [${actualOptionNames.join(", ")}].`,
        );
      }
    }
  }

  return failures;
}

async function collectManagedValidationSessionRowFailures(rows, projectName, client) {
  const failures = [];

  for (const row of rows) {
    const rowTitle = getPageTitleProperty(row);
    const rowPath = buildValidationSessionTargetPath(projectName, rowTitle);
    const page = await client.request("GET", `pages/${row.id}`);
    const markdown = await fetchPageMarkdown(row.id, rowPath, client);
    const managedParts = splitManagedPageMarkdownIfPresent(markdown);

    if (!managedParts) {
      continue;
    }

    if (!iconMatches(page.icon, VALIDATION_SESSION_ICON)) {
      failures.push(`Icon mismatch on ${rowPath}: expected "${VALIDATION_SESSION_ICON.emoji}", got "${page.icon?.emoji || page.icon?.type || "missing"}".`);
    }

    const actualCanonical = extractManagedCanonicalSource(managedParts.headerMarkdown);
    if (actualCanonical !== rowPath) {
      failures.push(`Canonical Source mismatch on ${rowPath}: expected "${rowPath}", got "${actualCanonical || "missing"}"`);
    }
  }

  return failures;
}

async function buildSurfaceClients({
  config,
  projectTokenEnv,
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const workspaceClient = resolveClient
    || makeNotionClientImpl(getWorkspaceTokenImpl(), config.notionVersion);

  if (syncClient) {
    return {
      workspaceClient,
      surfaceClient: syncClient,
      authMode: projectTokenEnv ? "project-token" : "workspace-token",
    };
  }

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

async function patchPageIcon(pageId, icon, client) {
  if (!icon) {
    return;
  }

  await client.request("PATCH", `pages/${pageId}`, { icon });
}

async function loadValidationSessionsContext({
  config,
  projectName,
  projectTokenEnv,
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const { workspaceClient, surfaceClient, authMode } = await buildSurfaceClients({
    config,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const validationTarget = await resolveValidationTarget(projectName, config, workspaceClient);
  const childDatabases = await listChildDatabases(validationTarget.pageId, workspaceClient);
  const conflictingDatabase = childDatabases.find(
    (database) => database.child_database?.title !== VALIDATION_SESSIONS_DATABASE_TITLE,
  );
  if (conflictingDatabase) {
    throw new Error(
      `Ops > Validation already contains a different child database ("${conflictingDatabase.child_database?.title || conflictingDatabase.id}"). Resolve that manually before using validation-sessions init.`,
    );
  }

  const matchingDatabases = childDatabases.filter(
    (database) => database.child_database?.title === VALIDATION_SESSIONS_DATABASE_TITLE,
  );
  if (matchingDatabases.length > 1) {
    throw new Error("Ops > Validation contains multiple child databases named Validation Sessions. Resolve that manually first.");
  }

  if (matchingDatabases.length === 0) {
    return {
      workspaceClient,
      surfaceClient,
      authMode,
      validationTarget,
      databaseTarget: null,
      database: null,
      dataSource: null,
      dataSourceId: null,
    };
  }

  const databaseTarget = await resolveValidationSessionsDatabaseTarget(projectName, config, workspaceClient);
  const database = await retrieveDatabase(databaseTarget.pageId, surfaceClient);
  const dataSourceId = getPrimaryDataSourceId(database);
  const dataSource = await retrieveDataSource(dataSourceId, surfaceClient);

  return {
    workspaceClient,
    surfaceClient,
    authMode,
    validationTarget,
    databaseTarget,
    database,
    dataSource,
    dataSourceId,
  };
}

async function resolveValidationSessionRowContext({
  title,
  ...options
}) {
  const context = await loadValidationSessionsContext(options);
  if (!context.databaseTarget || !context.dataSourceId) {
    throw new Error(`Validation Sessions does not exist at ${buildValidationSessionTargetPath(options.projectName)}. Run "validation-sessions init" first.`);
  }

  const rows = await queryDataSource(context.dataSourceId, context.surfaceClient);
  const matches = rows.filter((row) => getPageTitleProperty(row) === title);

  if (matches.length === 0) {
    throw new Error(`Validation session "${title}" does not exist at ${buildValidationSessionTargetPath(options.projectName)}.`);
  }

  if (matches.length > 1) {
    throw new Error(`Validation session "${title}" is ambiguous in ${buildValidationSessionTargetPath(options.projectName)}.`);
  }

  const row = matches[0];
  const targetPath = buildValidationSessionTargetPath(options.projectName, title);
  const markdown = await fetchPageMarkdown(row.id, targetPath, context.surfaceClient);
  const managedParts = splitManagedPageMarkdownIfPresent(markdown);

  return {
    ...context,
    row,
    pageId: row.id,
    title,
    targetPath,
    markdown,
    managedParts,
  };
}

export async function initializeValidationSessions({
  config,
  projectName,
  projectTokenEnv,
  apply = false,
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const context = await loadValidationSessionsContext({
    config,
    projectName,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const targetPath = `${context.validationTarget.targetPath} > ${VALIDATION_SESSIONS_DATABASE_TITLE}`;
  const nextSchema = buildValidationSessionSchema();
  const currentSummary = renderValidationSessionsSummary({
    targetPath,
    exists: Boolean(context.databaseTarget),
    database: context.database,
    dataSource: context.dataSource,
  });
  const nextSummary = renderValidationSessionsSummary({
    targetPath,
    exists: true,
    database: {
      title: [{ plain_text: VALIDATION_SESSIONS_DATABASE_TITLE }],
      icon: VALIDATION_SESSIONS_DATABASE_ICON,
    },
    dataSource: { properties: nextSchema },
  });
  const diff = diffMarkdownText(currentSummary, nextSummary);

  if (!apply || diff.length === 0) {
    return {
      databaseId: context.databaseTarget?.pageId || null,
      dataSourceId: context.dataSourceId,
      targetPath,
      authMode: context.authMode,
      hasDiff: diff.length > 0,
      diff,
      applied: false,
      createdDatabase: false,
      nextStep: null,
    };
  }

  let databaseId = context.databaseTarget?.pageId || null;
  let createdDatabase = false;
  if (!databaseId) {
    const createdDatabaseResponse = await createChildDatabase(context.validationTarget.pageId, {
      title: VALIDATION_SESSIONS_DATABASE_TITLE,
      icon: VALIDATION_SESSIONS_DATABASE_ICON,
      properties: nextSchema,
    }, context.surfaceClient);
    databaseId = createdDatabaseResponse.id;
    createdDatabase = true;
  }

  await updateDatabase(databaseId, {
    title: [{
      type: "text",
      text: { content: VALIDATION_SESSIONS_DATABASE_TITLE },
    }],
    icon: VALIDATION_SESSIONS_DATABASE_ICON,
  }, context.surfaceClient);

  const database = await retrieveDatabase(databaseId, context.surfaceClient);
  const dataSourceId = getPrimaryDataSourceId(database);
  await updateDataSource(dataSourceId, { properties: nextSchema }, context.surfaceClient);

  return {
    databaseId,
    dataSourceId,
    targetPath,
    authMode: context.authMode,
    hasDiff: true,
    diff,
    applied: true,
    createdDatabase,
    nextStep: buildValidationSessionsInitNextStep(),
  };
}

export async function createValidationSession({
  config,
  projectName,
  title,
  fileMarkdown,
  projectTokenEnv,
  apply = false,
  timestamp = nowTimestamp(),
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const context = await loadValidationSessionsContext({
    config,
    projectName,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  if (!context.databaseTarget || !context.dataSourceId) {
    throw new Error(`Validation Sessions does not exist at ${buildValidationSessionTargetPath(projectName)}. Run "validation-sessions init" first.`);
  }

  const existingRows = await queryDataSource(context.dataSourceId, context.surfaceClient);
  if (existingRows.some((row) => getPageTitleProperty(row) === title)) {
    throw new Error(`Validation session "${title}" already exists at ${buildValidationSessionTargetPath(projectName, title)}.`);
  }

  const parsedFile = parseValidationSessionFile(fileMarkdown);
  const previewFile = renderValidationSessionFile(parsedFile);
  const diff = diffMarkdownText("", previewFile);

  if (!apply) {
    return {
      pageId: null,
      projectId: context.validationTarget.projectId,
      targetPath: buildValidationSessionTargetPath(projectName, title),
      authMode: context.authMode,
      hasDiff: true,
      diff,
      applied: false,
      timestamp: null,
      nextStep: null,
    };
  }

  const createdPage = await context.surfaceClient.request("POST", "pages", {
    parent: {
      type: "data_source_id",
      data_source_id: context.dataSourceId,
    },
    properties: buildValidationSessionPageProperties(title, parsedFile.fields),
  });
  await patchPageIcon(createdPage.id, VALIDATION_SESSION_ICON, context.surfaceClient);
  await replacePageMarkdown(
    createdPage.id,
    buildValidationSessionTargetPath(projectName, title),
    buildManagedValidationSessionMarkdown({
      projectName,
      title,
      bodyMarkdown: parsedFile.bodyMarkdown,
      timestamp,
    }),
    context.surfaceClient,
  );

  return {
    pageId: createdPage.id,
    projectId: context.validationTarget.projectId,
    targetPath: buildValidationSessionTargetPath(projectName, title),
    authMode: context.authMode,
    hasDiff: true,
    diff,
    applied: true,
    timestamp,
    nextStep: buildValidationSessionNormalizationNextStep(title),
  };
}

export async function adoptValidationSession({
  config,
  projectName,
  title,
  projectTokenEnv,
  apply = false,
  timestamp = nowTimestamp(),
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const context = await resolveValidationSessionRowContext({
    config,
    projectName,
    title,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  if (context.managedParts) {
    throw alreadyManagedError(title);
  }

  const nextMarkdown = buildManagedValidationSessionMarkdown({
    projectName,
    title,
    bodyMarkdown: context.markdown,
    timestamp,
  });
  const diff = diffMarkdownText(context.markdown, nextMarkdown);

  if (!apply) {
    return {
      pageId: context.pageId,
      projectId: context.validationTarget.projectId,
      targetPath: context.targetPath,
      authMode: context.authMode,
      hasDiff: diff.length > 0,
      diff,
      applied: false,
      timestamp: null,
      nextStep: null,
    };
  }

  const page = await context.surfaceClient.request("GET", `pages/${context.pageId}`);
  if (!page.icon) {
    await patchPageIcon(context.pageId, VALIDATION_SESSION_ICON, context.surfaceClient);
  }
  await replacePageMarkdown(context.pageId, context.targetPath, nextMarkdown, context.surfaceClient);

  return {
    pageId: context.pageId,
    projectId: context.validationTarget.projectId,
    targetPath: context.targetPath,
    authMode: context.authMode,
    hasDiff: diff.length > 0,
    diff,
    applied: true,
    timestamp,
    nextStep: buildValidationSessionNormalizationNextStep(title),
  };
}

export async function pullValidationSessionFile(options) {
  const context = await resolveValidationSessionRowContext(options);
  if (!context.managedParts) {
    throw managedPageError(options.title, 'Use "validation-session adopt" first.');
  }

  const fields = extractValidationSessionFields(context.row);
  const fileMarkdown = renderValidationSessionFile({
    fields,
    bodyMarkdown: context.managedParts.bodyMarkdown,
  });

  return {
    pageId: context.pageId,
    projectId: context.validationTarget.projectId,
    targetPath: context.targetPath,
    authMode: context.authMode,
    fileMarkdown,
  };
}

export async function diffValidationSessionFile({
  fileMarkdown,
  ...options
}) {
  const context = await resolveValidationSessionRowContext(options);
  if (!context.managedParts) {
    throw managedPageError(options.title, 'Use "validation-session adopt" first.');
  }

  const remoteFile = renderValidationSessionFile({
    fields: extractValidationSessionFields(context.row),
    bodyMarkdown: context.managedParts.bodyMarkdown,
  });
  const nextFile = renderValidationSessionFile(parseValidationSessionFile(fileMarkdown));
  const diff = diffMarkdownText(remoteFile, nextFile);

  return {
    pageId: context.pageId,
    projectId: context.validationTarget.projectId,
    targetPath: context.targetPath,
    authMode: context.authMode,
    hasDiff: diff.length > 0,
    diff,
  };
}

export async function pushValidationSessionFile({
  fileMarkdown,
  apply = false,
  timestamp = nowTimestamp(),
  ...options
}) {
  const context = await resolveValidationSessionRowContext(options);
  if (!context.managedParts) {
    throw managedPageError(options.title, 'Use "validation-session adopt" first.');
  }

  const remoteFile = renderValidationSessionFile({
    fields: extractValidationSessionFields(context.row),
    bodyMarkdown: context.managedParts.bodyMarkdown,
  });
  const parsedFile = parseValidationSessionFile(fileMarkdown);
  const nextFile = renderValidationSessionFile(parsedFile);
  const diff = diffMarkdownText(remoteFile, nextFile);

  if (!apply || diff.length === 0) {
    return {
      pageId: context.pageId,
      projectId: context.validationTarget.projectId,
      targetPath: context.targetPath,
      authMode: context.authMode,
      hasDiff: diff.length > 0,
      diff,
      applied: false,
      timestamp: null,
    };
  }

  await context.surfaceClient.request("PATCH", `pages/${context.pageId}`, {
    properties: buildValidationSessionPageProperties(options.title, parsedFile.fields),
  });
  await replacePageMarkdown(
    context.pageId,
    context.targetPath,
    buildManagedValidationSessionMarkdown({
      projectName: options.projectName,
      title: options.title,
      bodyMarkdown: parsedFile.bodyMarkdown,
      timestamp,
    }),
    context.surfaceClient,
  );

  return {
    pageId: context.pageId,
    projectId: context.validationTarget.projectId,
    targetPath: context.targetPath,
    authMode: context.authMode,
    hasDiff: true,
    diff,
    applied: true,
    timestamp,
  };
}

export async function verifyValidationSessionsExtension(projectPageId, projectName, client, failures) {
  const opsPage = await client.getChildren(projectPageId);
  const opsBlock = opsPage.find((child) => child.type === "child_page" && child.child_page?.title === "Ops");
  if (!opsBlock) {
    return;
  }

  const opsChildren = await client.getChildren(opsBlock.id);
  const validationBlock = opsChildren.find((child) => child.type === "child_page" && child.child_page?.title === "Validation");
  if (!validationBlock) {
    return;
  }

  const childDatabases = (await client.getChildren(validationBlock.id)).filter((child) => child.type === "child_database");
  const matchingDatabases = childDatabases.filter(
    (child) => child.child_database?.title === VALIDATION_SESSIONS_DATABASE_TITLE,
  );

  if (matchingDatabases.length === 0) {
    return;
  }

  if (matchingDatabases.length > 1) {
    failures.push("Ops > Validation contains multiple Validation Sessions databases.");
    return;
  }

  const database = await retrieveDatabase(matchingDatabases[0].id, client);
  const targetPath = buildValidationSessionTargetPath(projectName);

  if (!iconMatches(database.icon, VALIDATION_SESSIONS_DATABASE_ICON)) {
    failures.push(`Icon mismatch on ${targetPath}: expected "${VALIDATION_SESSIONS_DATABASE_ICON.emoji}", got "${database.icon?.emoji || database.icon?.type || "missing"}".`);
  }

  const dataSourceId = getPrimaryDataSourceId(database);
  const dataSource = await retrieveDataSource(dataSourceId, client);
  failures.push(...collectSchemaFailures(dataSource));

  const rows = await queryDataSource(dataSourceId, client);
  failures.push(...(await collectManagedValidationSessionRowFailures(rows, projectName, client)));
}

export async function verifyValidationSessionsSurface({
  config,
  projectName,
  projectTokenEnv,
  resolveClient,
  syncClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  getProjectTokenImpl = getProjectToken,
}) {
  const { workspaceClient, surfaceClient, authMode } = await buildSurfaceClients({
    config,
    projectTokenEnv,
    resolveClient,
    syncClient,
    makeNotionClientImpl,
    getWorkspaceTokenImpl,
    getProjectTokenImpl,
  });

  const targetPath = buildValidationSessionTargetPath(projectName);
  const failures = [];
  const validationTarget = await findProjectPathTarget(projectName, ["Ops", "Validation"], config, workspaceClient);

  if (!validationTarget) {
    return {
      targetPath,
      authMode,
      initialized: false,
      failures: [`Validation surface "${buildValidationRootPath(projectName)}" does not exist.`],
      rowCount: 0,
    };
  }

  const childDatabases = await listChildDatabases(validationTarget.pageId, workspaceClient);
  const matchingDatabases = childDatabases.filter(
    (child) => child.child_database?.title === VALIDATION_SESSIONS_DATABASE_TITLE,
  );

  if (matchingDatabases.length === 0) {
    const otherDatabases = childDatabases
      .map((child) => child.child_database?.title || child.id)
      .filter(Boolean);
    return {
      targetPath,
      authMode,
      initialized: false,
      failures: [otherDatabases.length > 0
        ? `Validation Sessions does not exist at ${targetPath}. Found other child databases under ${buildValidationRootPath(projectName)}: [${otherDatabases.join(", ")}].`
        : `Validation Sessions does not exist at ${targetPath}. Run "validation-sessions init" first.`],
      rowCount: 0,
    };
  }

  if (matchingDatabases.length > 1) {
    failures.push("Ops > Validation contains multiple Validation Sessions databases.");
  }

  const database = await retrieveDatabase(matchingDatabases[0].id, surfaceClient);
  if (getDatabaseTitle(database) !== VALIDATION_SESSIONS_DATABASE_TITLE) {
    failures.push(`Database title mismatch on ${targetPath}: expected "${VALIDATION_SESSIONS_DATABASE_TITLE}", got "${getDatabaseTitle(database) || "missing"}".`);
  }

  if (!iconMatches(database.icon, VALIDATION_SESSIONS_DATABASE_ICON)) {
    failures.push(`Icon mismatch on ${targetPath}: expected "${VALIDATION_SESSIONS_DATABASE_ICON.emoji}", got "${database.icon?.emoji || database.icon?.type || "missing"}".`);
  }

  const dataSourceId = getPrimaryDataSourceId(database);
  const dataSource = await retrieveDataSource(dataSourceId, surfaceClient);
  failures.push(...collectSchemaFailures(dataSource));

  const rows = await queryDataSource(dataSourceId, surfaceClient);
  failures.push(...(await collectManagedValidationSessionRowFailures(rows, projectName, surfaceClient)));

  return {
    targetPath,
    authMode,
    initialized: true,
    failures,
    rowCount: rows.length,
  };
}

export async function collectValidationSessionScopeChecks(projectPageId, projectName, workspaceClient) {
  const projectRootChildren = await workspaceClient.getChildren(projectPageId);
  const opsPage = projectRootChildren.find((child) => child.type === "child_page" && child.child_page?.title === "Ops");
  if (!opsPage) {
    return [];
  }

  const opsChildren = await workspaceClient.getChildren(opsPage.id);
  const validationPage = opsChildren.find((child) => child.type === "child_page" && child.child_page?.title === "Validation");
  if (!validationPage) {
    return [];
  }

  const database = await findChildDatabase(validationPage.id, VALIDATION_SESSIONS_DATABASE_TITLE, workspaceClient);
  if (!database) {
    return [];
  }

  const retrievedDatabase = await retrieveDatabase(database.id, workspaceClient);
  const dataSourceId = getPrimaryDataSourceId(retrievedDatabase);
  const rows = await queryDataSource(dataSourceId, workspaceClient);

  return [
    {
      type: "database",
      id: database.id,
      path: buildValidationSessionTargetPath(projectName),
    },
    {
      type: "data_source",
      id: dataSourceId,
      path: `${buildValidationSessionTargetPath(projectName)} (query)`,
    },
    ...rows.map((row) => ({
      type: "page",
      id: row.id,
      path: buildValidationSessionTargetPath(projectName, getPageTitleProperty(row)),
    })),
  ];
}
