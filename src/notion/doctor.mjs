import { makeNotionClient } from "./client.mjs";
import { listChildDatabases, queryDataSource, retrieveDatabase, getPageTitleProperty, getPrimaryDataSourceId } from "./data-sources.mjs";
import { getWorkspaceToken } from "./env.mjs";
import { getProjectPolicyReservedRootTitles } from "./managed-doc-policy.mjs";
import {
  ACCESS_DOMAIN_ICON,
  ACCESS_TOKEN_ICON,
  BUILDS_CONTAINER_ICON,
  BUILD_RECORD_ICON,
  RUNBOOK_ICON,
  SECRET_RECORD_ICON,
  VALIDATION_SESSION_ICON,
} from "./managed-page-templates.mjs";
import { fetchPageMarkdown } from "./page-markdown.mjs";
import {
  buildMissingBuildsSurfaceGuidance,
  buildMissingValidationSessionsSurfaceGuidance,
  buildProjectTokenNotCheckedGuidance,
  buildUnmanagedAccessDomainGuidance,
  buildUnmanagedAccessRecordGuidance,
  buildUnmanagedBuildRecordGuidance,
  buildUnmanagedRunbookGuidance,
  buildUntitledValidationSessionRowGuidance,
  pushMigrationGuidance,
  sortMigrationGuidance,
} from "./migration-guidance.mjs";
import { expectedCanonicalSource, projectPath } from "./project-model.mjs";
import { findChildPage, verifyScope } from "./project-service.mjs";
import { findBuildsContainerTarget, findProjectPathTarget, findValidationSessionsDatabaseTarget, resolveProjectRootTarget } from "./page-targets.mjs";
import { buildCommand, buildTruthBoundaries } from "./routing-policy.mjs";
import { getCanonicalSource } from "./template-blocks.mjs";
import { VALIDATION_SESSIONS_DATABASE_TITLE, verifyValidationSessionsSurface } from "./validation-sessions.mjs";

function iconMatches(icon, expectedIcon) {
  return Boolean(icon) && icon.type === expectedIcon.type && icon.emoji === expectedIcon.emoji;
}

function iconLabel(icon) {
  return icon?.emoji || icon?.type || "missing";
}

function pushUnique(list, keySet, key, value) {
  if (keySet.has(key)) {
    return;
  }

  keySet.add(key);
  list.push(value);
}

async function listChildPages(parentPageId, client) {
  return (await client.getChildren(parentPageId)).filter((child) => child.type === "child_page");
}

async function safeFetchPageMarkdown(pageId, targetPath, client) {
  try {
    const response = await fetchPageMarkdown(pageId, targetPath, client);
    return response.markdown;
  } catch {
    return "";
  }
}

async function inspectManagedPage({
  pageId,
  pathTitles,
  projectName,
  expectedIcon,
  client,
  requireIcon = true,
}) {
  const page = await client.request("GET", `pages/${pageId}`);
  const actualCanonical = await getCanonicalSource(pageId, client);
  const targetPath = projectPath(projectName, pathTitles);
  const issues = [];

  if (!actualCanonical) {
    return {
      page,
      pageId,
      targetPath,
      status: "unmanaged",
      issues,
    };
  }

  const expectedCanonical = expectedCanonicalSource(projectName, [projectName, ...pathTitles]);
  if (actualCanonical !== expectedCanonical) {
    issues.push(`Canonical Source mismatch on ${targetPath}: expected "${expectedCanonical}", got "${actualCanonical}".`);
  }

  if (requireIcon && !page.icon) {
    issues.push(`Missing icon on ${targetPath}.`);
  } else if (expectedIcon && !iconMatches(page.icon, expectedIcon)) {
    issues.push(`Icon mismatch on ${targetPath}: expected "${expectedIcon.emoji}", got "${iconLabel(page.icon)}".`);
  }

  return {
    page,
    pageId,
    targetPath,
    status: "managed",
    issues,
  };
}

async function inferAccessRecordKind(page, pageId, targetPath, client) {
  if (iconMatches(page.icon, ACCESS_TOKEN_ICON)) {
    return "access-token";
  }

  if (iconMatches(page.icon, SECRET_RECORD_ICON)) {
    return "secret-record";
  }

  const markdown = await safeFetchPageMarkdown(pageId, targetPath, client);

  if (/## Token Record|Shared Root Page:|Capabilities:/i.test(markdown)) {
    return "access-token";
  }

  if (/## Secret Record|Secret Name:|Raw Value/i.test(markdown)) {
    return "secret-record";
  }

  if (/_TOKEN\b|TOKEN\b/i.test(targetPath)) {
    return "access-token";
  }

  return "secret-record";
}

async function looksLikeAccessRecordAtRoot(page, pageId, targetPath, client) {
  if (iconMatches(page.icon, ACCESS_TOKEN_ICON) || iconMatches(page.icon, SECRET_RECORD_ICON)) {
    return true;
  }

  if (/[A-Z0-9_]{6,}/.test(targetPath.split(" > ").at(-1) || "")) {
    return true;
  }

  const markdown = await safeFetchPageMarkdown(pageId, targetPath, client);
  return /## Token Record|## Secret Record|Raw Value|Shared Root Page:/i.test(markdown);
}

function addIssue(result, issueKeys, surface, targetPath, message) {
  pushUnique(
    result.issues,
    issueKeys,
    `${surface}:${targetPath}:${message}`,
    { surface, targetPath, message },
  );
}

function addAdoptable(result, adoptableKeys, { surface, type, title, targetPath, command }) {
  pushUnique(
    result.adoptable,
    adoptableKeys,
    `${surface}:${type}:${targetPath}`,
    { surface, type, title, targetPath, command },
  );
}

function addRecommendation(result, recommendationKeys, { surface, targetPath, reason, command = null }) {
  pushUnique(
    result.recommendations,
    recommendationKeys,
    `${surface}:${targetPath}:${reason}:${command || ""}`,
    { surface, targetPath, reason, ...(command ? { command } : {}) },
  );
}

function buildProjectDocCommandPath(pathTitles) {
  return pathTitles.length === 0 ? "Root" : `Root > ${pathTitles.join(" > ")}`;
}

async function analyzeProjectDocBranch({
  branchPageId,
  pathTitles,
  projectName,
  client,
  projectTokenEnv,
  result,
  issueKeys,
  adoptableKeys,
  recommendationKeys,
  summary,
}) {
  const inspection = await inspectManagedPage({
    pageId: branchPageId,
    pathTitles,
    projectName,
    client,
    requireIcon: false,
  });

  summary.totalCount += 1;

  if (inspection.status === "managed") {
    summary.managedCount += 1;
    for (const message of inspection.issues) {
      addIssue(result, issueKeys, "project-docs", inspection.targetPath, message);
    }
  } else {
    summary.unmanagedCount += 1;
    const command = buildCommand("doc-adopt", [
      ["project", projectName],
      ["path", buildProjectDocCommandPath(pathTitles)],
    ], projectTokenEnv);
    addAdoptable(result, adoptableKeys, {
      surface: "project-docs",
      type: "project-doc",
      title: pathTitles.at(-1),
      targetPath: inspection.targetPath,
      command,
    });
    addRecommendation(result, recommendationKeys, {
      surface: "project-docs",
      targetPath: inspection.targetPath,
      reason: `Standardize the existing unmanaged project doc "${pathTitles.at(-1)}".`,
      command,
    });
  }

  const children = await listChildPages(branchPageId, client);
  for (const child of children) {
    await analyzeProjectDocBranch({
      branchPageId: child.id,
      pathTitles: [...pathTitles, child.child_page.title],
      projectName,
      client,
      projectTokenEnv,
      result,
      issueKeys,
      adoptableKeys,
      recommendationKeys,
      summary,
    });
  }
}

async function analyzeProjectDocs({
  config,
  projectName,
  client,
  projectTokenEnv,
  result,
  issueKeys,
  adoptableKeys,
  recommendationKeys,
}) {
  const projectRoot = await resolveProjectRootTarget(projectName, config, client);
  const rootInspection = await inspectManagedPage({
    pageId: projectRoot.pageId,
    pathTitles: [],
    projectName,
    client,
    requireIcon: false,
  });
  const reservedRootTitles = new Set(getProjectPolicyReservedRootTitles(config));
  const summary = {
    targetPath: projectRoot.targetPath,
    rootStatus: rootInspection.status,
    totalCount: 0,
    managedCount: 0,
    unmanagedCount: 0,
  };

  if (rootInspection.status === "managed") {
    for (const message of rootInspection.issues) {
      addIssue(result, issueKeys, "project-docs", rootInspection.targetPath, message);
    }
  } else {
    const command = buildCommand("doc-adopt", [
      ["project", projectName],
      ["path", "Root"],
    ], projectTokenEnv);
    addAdoptable(result, adoptableKeys, {
      surface: "project-docs",
      type: "project-doc",
      title: projectName,
      targetPath: rootInspection.targetPath,
      command,
    });
    addRecommendation(result, recommendationKeys, {
      surface: "project-docs",
      targetPath: rootInspection.targetPath,
      reason: `Standardize the unmanaged project root doc for "${projectName}".`,
      command,
    });
  }

  const rootChildren = await listChildPages(projectRoot.pageId, client);
  for (const child of rootChildren) {
    if (reservedRootTitles.has(child.child_page.title)) {
      continue;
    }

    await analyzeProjectDocBranch({
      branchPageId: child.id,
      pathTitles: [child.child_page.title],
      projectName,
      client,
      projectTokenEnv,
      result,
      issueKeys,
      adoptableKeys,
      recommendationKeys,
      summary,
    });
  }

  result.surfaces.projectDocs = summary;
}

async function analyzeRunbooks({
  config,
  projectName,
  client,
  projectTokenEnv,
  result,
  issueKeys,
  adoptableKeys,
  recommendationKeys,
  migrationGuidanceKeys,
}) {
  const targetPath = projectPath(projectName, ["Runbooks"]);
  const target = await findProjectPathTarget(projectName, ["Runbooks"], config, client);

  if (!target) {
    result.surfaces.runbooks = {
      targetPath,
      present: false,
      empty: true,
      totalCount: 0,
      managedCount: 0,
      unmanagedCount: 0,
    };
    addIssue(result, issueKeys, "runbooks", targetPath, `Required surface "${targetPath}" is missing.`);
    return;
  }

  const children = await listChildPages(target.pageId, client);
  const summary = {
    targetPath,
    present: true,
    empty: children.length === 0,
    totalCount: children.length,
    managedCount: 0,
    unmanagedCount: 0,
  };

  for (const child of children) {
    const title = child.child_page.title;
    const inspection = await inspectManagedPage({
      pageId: child.id,
      pathTitles: ["Runbooks", title],
      projectName,
      expectedIcon: RUNBOOK_ICON,
      client,
    });

    if (inspection.status === "managed") {
      summary.managedCount += 1;
      for (const message of inspection.issues) {
        addIssue(result, issueKeys, "runbooks", inspection.targetPath, message);
      }
      continue;
    }

    summary.unmanagedCount += 1;
    const command = buildCommand("runbook-adopt", [
      ["project", projectName],
      ["title", title],
    ], projectTokenEnv);
    addAdoptable(result, adoptableKeys, {
      surface: "runbooks",
      type: "runbook",
      title,
      targetPath: inspection.targetPath,
      command,
    });
    addRecommendation(result, recommendationKeys, {
      surface: "runbooks",
      targetPath: inspection.targetPath,
      reason: `Standardize the existing unmanaged runbook "${title}".`,
      command,
    });
    pushMigrationGuidance(
      result.migrationGuidance,
      migrationGuidanceKeys,
      buildUnmanagedRunbookGuidance({
        projectName,
        projectTokenEnv,
        targetPath: inspection.targetPath,
        title,
      }),
    );
  }

  result.surfaces.runbooks = summary;
}

async function analyzeBuilds({
  config,
  projectName,
  client,
  projectTokenEnv,
  result,
  issueKeys,
  recommendationKeys,
  migrationGuidanceKeys,
}) {
  const targetPath = projectPath(projectName, ["Ops", "Builds"]);
  const target = await findBuildsContainerTarget(projectName, config, client);

  if (!target) {
    result.surfaces.builds = {
      targetPath,
      present: false,
      empty: true,
      totalCount: 0,
      managedCount: 0,
      unmanagedCount: 0,
    };
    addRecommendation(result, recommendationKeys, {
      surface: "builds",
      targetPath,
      reason: "The optional Builds container is missing. Initialize it on first use with a managed build record.",
      command: buildCommand("build-record-create", [
        ["project", projectName],
        ["title", "<Build Record Title>"],
        ["file", "build-record.md"],
      ], projectTokenEnv),
    });
    pushMigrationGuidance(
      result.migrationGuidance,
      migrationGuidanceKeys,
      buildMissingBuildsSurfaceGuidance({
        projectName,
        projectTokenEnv,
        targetPath,
      }),
    );
    return;
  }

  const summary = {
    targetPath,
    present: true,
    empty: false,
    totalCount: 0,
    managedCount: 0,
    unmanagedCount: 0,
  };

  const containerInspection = await inspectManagedPage({
    pageId: target.pageId,
    pathTitles: ["Ops", "Builds"],
    projectName,
    expectedIcon: BUILDS_CONTAINER_ICON,
    client,
  });
  for (const message of containerInspection.issues) {
    addIssue(result, issueKeys, "builds", targetPath, message);
  }

  const children = await listChildPages(target.pageId, client);
  summary.empty = children.length === 0;
  summary.totalCount = children.length;

  for (const child of children) {
    const title = child.child_page.title;
    const inspection = await inspectManagedPage({
      pageId: child.id,
      pathTitles: ["Ops", "Builds", title],
      projectName,
      expectedIcon: BUILD_RECORD_ICON,
      client,
    });

    if (inspection.status === "managed") {
      summary.managedCount += 1;
      for (const message of inspection.issues) {
        addIssue(result, issueKeys, "builds", inspection.targetPath, message);
      }
      continue;
    }

    summary.unmanagedCount += 1;
    addIssue(
      result,
      issueKeys,
      "builds",
      inspection.targetPath,
      `Build record "${title}" exists but is not managed by SNPM. No adopt path exists yet for build records.`,
    );
    addRecommendation(result, recommendationKeys, {
      surface: "builds",
      targetPath: inspection.targetPath,
      reason: `Create a new managed build record for "${title}" and migrate the content manually if you want this surface standardized.`,
      command: buildCommand("build-record-create", [
        ["project", projectName],
        ["title", title],
        ["file", "build-record.md"],
      ], projectTokenEnv),
    });
    pushMigrationGuidance(
      result.migrationGuidance,
      migrationGuidanceKeys,
      buildUnmanagedBuildRecordGuidance({
        projectName,
        projectTokenEnv,
        targetPath: inspection.targetPath,
        title,
      }),
    );
  }

  result.surfaces.builds = summary;
}

async function analyzeValidationSessions({
  config,
  projectName,
  client,
  projectTokenEnv,
  result,
  issueKeys,
  adoptableKeys,
  recommendationKeys,
  migrationGuidanceKeys,
  verifyValidationSessionsSurfaceImpl = verifyValidationSessionsSurface,
}) {
  const validationRootPath = projectPath(projectName, ["Ops", "Validation"]);
  const targetPath = `${validationRootPath} > ${VALIDATION_SESSIONS_DATABASE_TITLE}`;
  const validationRoot = await findProjectPathTarget(projectName, ["Ops", "Validation"], config, client);

  if (!validationRoot) {
    result.surfaces.validationSessions = {
      targetPath,
      initialized: false,
      rowCount: 0,
      managedCount: 0,
      unmanagedCount: 0,
      failureCount: 1,
    };
    addIssue(result, issueKeys, "validation-sessions", validationRootPath, `Required surface "${validationRootPath}" is missing.`);
    return;
  }

  const childDatabases = await listChildDatabases(validationRoot.pageId, client);
  const matchingDatabases = childDatabases.filter((child) => child.child_database?.title === VALIDATION_SESSIONS_DATABASE_TITLE);

  if (matchingDatabases.length === 0) {
    result.surfaces.validationSessions = {
      targetPath,
      initialized: false,
      rowCount: 0,
      managedCount: 0,
      unmanagedCount: 0,
      failureCount: 0,
    };

    const otherDatabases = childDatabases.map((child) => child.child_database?.title || child.id).filter(Boolean);
    if (otherDatabases.length > 0) {
      addIssue(
        result,
        issueKeys,
        "validation-sessions",
        validationRootPath,
        `Validation Sessions is missing at ${targetPath}. Found other child databases under ${validationRootPath}: [${otherDatabases.join(", ")}].`,
      );
      return;
    }

    addRecommendation(result, recommendationKeys, {
      surface: "validation-sessions",
      targetPath,
      reason: "The optional Validation Sessions surface is missing. Initialize it before using managed validation-session reporting.",
      command: buildCommand("validation-sessions-init", [
        ["project", projectName],
      ], projectTokenEnv),
    });
    pushMigrationGuidance(
      result.migrationGuidance,
      migrationGuidanceKeys,
      buildMissingValidationSessionsSurfaceGuidance({
        projectName,
        projectTokenEnv,
        targetPath,
      }),
    );
    return;
  }

  if (matchingDatabases.length > 1) {
    result.surfaces.validationSessions = {
      targetPath,
      initialized: true,
      rowCount: 0,
      managedCount: 0,
      unmanagedCount: 0,
      failureCount: 1,
    };
    addIssue(result, issueKeys, "validation-sessions", targetPath, "Ops > Validation contains multiple Validation Sessions databases.");
    return;
  }

  const verification = await verifyValidationSessionsSurfaceImpl({
    config,
    projectName,
    resolveClient: client,
    syncClient: client,
  });
  const summary = {
    targetPath,
    initialized: verification.initialized,
    rowCount: verification.rowCount,
    managedCount: 0,
    unmanagedCount: 0,
    failureCount: verification.failures.length,
  };

  for (const failure of verification.failures) {
    addIssue(result, issueKeys, "validation-sessions", targetPath, failure);
  }

  const databaseTarget = await findValidationSessionsDatabaseTarget(projectName, config, client);
  if (!databaseTarget) {
    result.surfaces.validationSessions = summary;
    return;
  }

  const database = await retrieveDatabase(databaseTarget.pageId, client);
  const rows = await queryDataSource(getPrimaryDataSourceId(database), client);
  summary.rowCount = rows.length;

  for (const row of rows) {
    const title = getPageTitleProperty(row);
    if (!title) {
      summary.unmanagedCount += 1;
      addIssue(
        result,
        issueKeys,
        "validation-sessions",
        `${targetPath} > ${row.id}`,
        `Validation session row "${row.id}" is missing a Name title. Add a row title in Notion before using "validation-session adopt".`,
      );
      addRecommendation(result, recommendationKeys, {
        surface: "validation-sessions",
        targetPath: `${targetPath} > ${row.id}`,
        reason: "Set a Name title on the unmanaged validation-session row, then rerun doctor to get a valid adopt command.",
      });
      pushMigrationGuidance(
        result.migrationGuidance,
        migrationGuidanceKeys,
        buildUntitledValidationSessionRowGuidance({
          projectName,
          projectTokenEnv,
          targetPath: `${targetPath} > ${row.id}`,
        }),
      );
      continue;
    }

    const inspection = await inspectManagedPage({
      pageId: row.id,
      pathTitles: ["Ops", "Validation", VALIDATION_SESSIONS_DATABASE_TITLE, title],
      projectName,
      expectedIcon: VALIDATION_SESSION_ICON,
      client,
    });

    if (inspection.status === "managed") {
      summary.managedCount += 1;
      continue;
    }

    summary.unmanagedCount += 1;
    const command = buildCommand("validation-session-adopt", [
      ["project", projectName],
      ["title", title],
    ], projectTokenEnv);
    addAdoptable(result, adoptableKeys, {
      surface: "validation-sessions",
      type: "validation-session",
      title,
      targetPath: inspection.targetPath,
      command,
    });
    addRecommendation(result, recommendationKeys, {
      surface: "validation-sessions",
      targetPath: inspection.targetPath,
      reason: `Standardize the existing unmanaged validation session "${title}".`,
      command,
    });
  }

  result.surfaces.validationSessions = summary;
}

async function analyzeAccess({
  config,
  projectName,
  client,
  projectTokenEnv,
  result,
  issueKeys,
  adoptableKeys,
  recommendationKeys,
  migrationGuidanceKeys,
}) {
  const targetPath = projectPath(projectName, ["Access"]);
  const target = await findProjectPathTarget(projectName, ["Access"], config, client);

  if (!target) {
    result.surfaces.access = {
      targetPath,
      present: false,
      empty: true,
      domainCount: 0,
      managedDomainCount: 0,
      unmanagedDomainCount: 0,
      managedRecordCount: 0,
      unmanagedRecordCount: 0,
    };
    addIssue(result, issueKeys, "access", targetPath, `Required surface "${targetPath}" is missing.`);
    return;
  }

  const domains = await listChildPages(target.pageId, client);
  const summary = {
    targetPath,
    present: true,
    empty: domains.length === 0,
    domainCount: domains.length,
    managedDomainCount: 0,
    unmanagedDomainCount: 0,
    managedRecordCount: 0,
    unmanagedRecordCount: 0,
  };

  for (const domain of domains) {
    const title = domain.child_page.title;
    const domainPath = `${targetPath} > ${title}`;
    const inspection = await inspectManagedPage({
      pageId: domain.id,
      pathTitles: ["Access", title],
      projectName,
      expectedIcon: ACCESS_DOMAIN_ICON,
      client,
    });

    if (inspection.status === "managed") {
      summary.managedDomainCount += 1;
      for (const message of inspection.issues) {
        addIssue(result, issueKeys, "access", inspection.targetPath, message);
      }
    } else if (await looksLikeAccessRecordAtRoot(inspection.page, domain.id, domainPath, client)) {
      addIssue(
        result,
        issueKeys,
        "access",
        domainPath,
        `Access root should contain domain pages only. "${title}" looks like a secret or token record and should live under a domain page.`,
      );
    } else {
      summary.unmanagedDomainCount += 1;
      const command = buildCommand("access-domain-adopt", [
        ["project", projectName],
        ["title", title],
      ], projectTokenEnv);
      addAdoptable(result, adoptableKeys, {
        surface: "access",
        type: "access-domain",
        title,
        targetPath: domainPath,
        command,
      });
      addRecommendation(result, recommendationKeys, {
        surface: "access",
        targetPath: domainPath,
        reason: `Standardize the existing unmanaged Access domain "${title}".`,
        command,
      });
      pushMigrationGuidance(
        result.migrationGuidance,
        migrationGuidanceKeys,
        buildUnmanagedAccessDomainGuidance({
          projectName,
          projectTokenEnv,
          targetPath: domainPath,
          title,
        }),
      );
    }

    const records = await listChildPages(domain.id, client);
    for (const record of records) {
      const recordTitle = record.child_page.title;
      const recordPath = `${domainPath} > ${recordTitle}`;
      const page = await client.request("GET", `pages/${record.id}`);
      const kind = await inferAccessRecordKind(page, record.id, recordPath, client);
      const expectedIcon = kind === "access-token" ? ACCESS_TOKEN_ICON : SECRET_RECORD_ICON;
      const recordInspection = await inspectManagedPage({
        pageId: record.id,
        pathTitles: ["Access", title, recordTitle],
        projectName,
        expectedIcon,
        client,
      });

      if (recordInspection.status === "managed") {
        summary.managedRecordCount += 1;
        for (const message of recordInspection.issues) {
          addIssue(result, issueKeys, "access", recordInspection.targetPath, message);
        }
        continue;
      }

      summary.unmanagedRecordCount += 1;
      const scriptName = kind === "access-token" ? "access-token-adopt" : "secret-record-adopt";
      const command = buildCommand(scriptName, [
        ["project", projectName],
        ["domain", title],
        ["title", recordTitle],
      ], projectTokenEnv);
      addAdoptable(result, adoptableKeys, {
        surface: "access",
        type: kind,
        title: recordTitle,
        targetPath: recordInspection.targetPath,
        command,
      });
      addRecommendation(result, recommendationKeys, {
        surface: "access",
        targetPath: recordInspection.targetPath,
        reason: `Standardize the existing unmanaged ${kind === "access-token" ? "access token" : "secret record"} "${recordTitle}".`,
        command,
      });
      pushMigrationGuidance(
        result.migrationGuidance,
        migrationGuidanceKeys,
        buildUnmanagedAccessRecordGuidance({
          projectName,
          projectTokenEnv,
          targetPath: recordInspection.targetPath,
          domainTitle: title,
          title: recordTitle,
          recordType: kind,
        }),
      );
    }
  }

  result.surfaces.access = summary;
}

function maybeAddProjectTokenRecommendation({
  projectName,
  projectTokenEnv,
  result,
  recommendationKeys,
  migrationGuidanceKeys,
}) {
  if (projectTokenEnv || (result.adoptable.length === 0 && result.recommendations.length === 0)) {
    return;
  }

  addRecommendation(result, recommendationKeys, {
    surface: "project-token-scope",
    targetPath: result.targetPath,
    reason: "Project-token scope was not evaluated. Re-run doctor with the project token before relying on project-local mutation workflows.",
    command: buildCommand("doctor", [
      ["project", projectName],
    ], "<PROJECT_TOKEN_ENV>"),
  });
  pushMigrationGuidance(
    result.migrationGuidance,
    migrationGuidanceKeys,
    buildProjectTokenNotCheckedGuidance({
      projectName,
      targetPath: result.targetPath,
    }),
  );
}

export async function diagnoseProject({
  config,
  projectName,
  projectTokenEnv,
  workspaceClient,
  makeNotionClientImpl = makeNotionClient,
  getWorkspaceTokenImpl = getWorkspaceToken,
  verifyScopeImpl = verifyScope,
  verifyValidationSessionsSurfaceImpl = verifyValidationSessionsSurface,
}) {
  const client = workspaceClient || makeNotionClientImpl(getWorkspaceTokenImpl(), config.notionVersion);
  const projectRoot = await resolveProjectRootTarget(projectName, config, client);
  const result = {
    projectId: projectRoot.projectId,
    targetPath: projectRoot.targetPath,
    authMode: "workspace-token",
    projectTokenChecked: Boolean(projectTokenEnv),
    truthBoundaries: buildTruthBoundaries(config),
    surfaces: {},
    issues: [],
    adoptable: [],
    recommendations: [],
    migrationGuidance: [],
  };
  const issueKeys = new Set();
  const adoptableKeys = new Set();
  const recommendationKeys = new Set();
  const migrationGuidanceKeys = new Set();

  if (projectTokenEnv) {
    const scopeFailures = await verifyScopeImpl(projectRoot.pageId, projectName, config, projectTokenEnv);
    result.surfaces.projectTokenScope = {
      checked: true,
      ok: scopeFailures.length === 0,
      failures: scopeFailures,
    };
    for (const failure of scopeFailures) {
      addIssue(result, issueKeys, "project-token-scope", projectRoot.targetPath, failure);
    }
  }

  await analyzeProjectDocs({
    config,
    projectName,
    client,
    projectTokenEnv,
    result,
    issueKeys,
    adoptableKeys,
    recommendationKeys,
  });
  await analyzeRunbooks({
    config,
    projectName,
    client,
    projectTokenEnv,
    result,
    issueKeys,
    adoptableKeys,
    recommendationKeys,
    migrationGuidanceKeys,
  });
  await analyzeBuilds({
    config,
    projectName,
    client,
    projectTokenEnv,
    result,
    issueKeys,
    recommendationKeys,
    migrationGuidanceKeys,
  });
  await analyzeValidationSessions({
    config,
    projectName,
    client,
    projectTokenEnv,
    result,
    issueKeys,
    adoptableKeys,
    recommendationKeys,
    migrationGuidanceKeys,
    verifyValidationSessionsSurfaceImpl,
  });
  await analyzeAccess({
    config,
    projectName,
    client,
    projectTokenEnv,
    result,
    issueKeys,
    adoptableKeys,
    recommendationKeys,
    migrationGuidanceKeys,
  });
  maybeAddProjectTokenRecommendation({
    projectName,
    projectTokenEnv,
    result,
    recommendationKeys,
    migrationGuidanceKeys,
  });
  result.migrationGuidance = sortMigrationGuidance(result.migrationGuidance);

  return result;
}
