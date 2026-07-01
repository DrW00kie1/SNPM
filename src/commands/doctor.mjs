import { loadWorkspaceConfig } from "../notion/config.mjs";
import { makeNotionClient } from "../notion/client.mjs";
import { diagnoseProject } from "../notion/doctor.mjs";
import { getProjectToken } from "../notion/env.mjs";
import { serializeSafeNotionError } from "../notion/errors.mjs";
import {
  fetchPageMarkdown,
  normalizeMarkdownNewlines,
} from "../notion/page-markdown.mjs";
import {
  parseApprovedPlanningPagePath,
  resolveApprovedPlanningPageTarget,
} from "../notion/page-targets.mjs";
import { recommendProjectUpdate } from "../notion/recommend.mjs";
import { makeNotionCliApiClient, summarizeNotionCliApiProbe } from "../notion-cli/api-adapter.mjs";
import {
  makeNotionCliPageMarkdownClient,
  summarizeNotionCliPagesProbe,
} from "../notion-cli/page-markdown-adapter.mjs";
import { probeNotionCli } from "../notion-cli/probe.mjs";

async function probeNotionCliApi({
  config,
  projectTokenEnv,
  doctorResult,
  makeClient = makeNotionCliApiClient,
}) {
  const token = getProjectToken(projectTokenEnv);
  const client = makeClient(token, config.notionVersion);
  const projectId = doctorResult.projectId;

  try {
    const page = await client.request("GET", `pages/${projectId}`);
    return summarizeNotionCliApiProbe({
      ok: true,
      pageId: projectId,
      object: page?.object,
      warnings: [],
    });
  } catch (error) {
    return {
      ...summarizeNotionCliApiProbe({
        ok: false,
        pageId: projectId,
        object: null,
        warnings: ["Notion CLI API probe failed; SNPM fetch-backed transport remains the supported default."],
      }),
      error: serializeSafeNotionError(error),
    };
  }
}

function stripLeadingYamlFrontmatter(markdown) {
  const normalized = normalizeMarkdownNewlines(markdown || "");
  if (!normalized.startsWith("---\n")) {
    return {
      markdown: normalized,
      stripped: false,
    };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return {
      markdown: normalized,
      stripped: false,
    };
  }

  return {
    markdown: normalized.slice(endIndex + "\n---\n".length),
    stripped: true,
  };
}

function normalizeForPageMarkdownComparison(snpmMarkdown, notionCliMarkdown) {
  const notes = ["lf-newlines"];
  const snpmNormalized = normalizeMarkdownNewlines(snpmMarkdown || "");
  const ntnFrontmatter = stripLeadingYamlFrontmatter(notionCliMarkdown);

  if (ntnFrontmatter.stripped) {
    notes.push("ntn-page-property-frontmatter-stripped");
  }

  return {
    snpmMarkdown: snpmNormalized,
    notionCliMarkdown: ntnFrontmatter.markdown,
    normalizationNotes: notes,
  };
}

export function redactResolvedPageError(error) {
  const serialized = serializeSafeNotionError(error);
  const notionIdPattern = /\b(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})\b/gi;

  function redact(value) {
    if (typeof value === "string") {
      return value.replace(notionIdPattern, "<notion-id>");
    }
    if (Array.isArray(value)) {
      return value.map((entry) => redact(entry));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redact(entry)]));
    }
    return value;
  }

  return redact(serialized);
}

async function probeNotionCliPages({
  config,
  projectName,
  projectTokenEnv,
  pagePath,
  makeNotionClientImpl = makeNotionClient,
  makePagesClient = makeNotionCliPageMarkdownClient,
}) {
  const fallbackTargetPath = `Projects > ${projectName} > ${pagePath}`;
  let targetPath = fallbackTargetPath;

  try {
    const token = getProjectToken(projectTokenEnv);
    const client = makeNotionClientImpl(token, config.notionVersion);
    const target = await resolveApprovedPlanningPageTarget(projectName, pagePath, config, client);
    targetPath = target.targetPath;
    const snpmMarkdown = await fetchPageMarkdown(target.pageId, target.targetPath, client);
    const pagesClient = makePagesClient(token, config.notionVersion);
    const ntnResponse = await pagesClient.getPageMarkdown(target.pageId);
    const warnings = [];
    if (ntnResponse.truncated) {
      warnings.push("Notion CLI reported truncated Markdown for the approved page.");
    }
    if (ntnResponse.unknownBlockCount > 0) {
      warnings.push(`Notion CLI reported unsupported blocks for the approved page; count=${ntnResponse.unknownBlockCount}.`);
    }

    const comparison = normalizeForPageMarkdownComparison(snpmMarkdown, ntnResponse.markdown);
    const matches = comparison.snpmMarkdown === comparison.notionCliMarkdown;

    return summarizeNotionCliPagesProbe({
      available: true,
      targetPath: target.targetPath,
      matches,
      hasDiff: !matches,
      normalizationNotes: comparison.normalizationNotes,
      warnings,
      recommendation: matches && warnings.length === 0
        ? "ntn-pages-get-is-compatible-for-this-approved-page"
        : "keep-snpm-page-markdown-transport-until-parity-is-proven",
    });
  } catch (error) {
    return {
      ...summarizeNotionCliPagesProbe({
        available: false,
        targetPath,
        matches: false,
        hasDiff: null,
        warnings: ["Notion CLI page Markdown probe failed; SNPM fetch-backed page Markdown remains the supported default."],
        recommendation: "keep-snpm-page-markdown-transport-until-parity-is-proven",
      }),
      error: redactResolvedPageError(error),
    };
  }
}

export async function runDoctor({
  projectName,
  projectTokenEnv,
  notionCli = false,
  notionCliApi = false,
  notionCliPages = false,
  notionCliPagePath,
  diagnoseProjectImpl = diagnoseProject,
  notionCliProbeImpl = probeNotionCli,
  notionCliApiProbeImpl = probeNotionCliApi,
  notionCliPagesProbeImpl = probeNotionCliPages,
  truthAudit = false,
  consistencyAudit = false,
  staleAfterDays,
  workspaceName = "infrastructure-hq",
}) {
  const notionCliResult = notionCli ? notionCliProbeImpl() : undefined;

  if (!projectName) {
    if (!notionCli || notionCliApi || notionCliPages) {
      throw new Error('Provide --project "Project Name".');
    }
    return {
      authMode: "none",
      projectName: null,
      projectTokenChecked: false,
      issues: [],
      recommendations: [],
      notionCli: notionCliResult,
    };
  }
  if (notionCliApi && !projectTokenEnv) {
    throw new Error("Provide --project-token-env PROJECT_NAME_NOTION_TOKEN for --notion-cli-api.");
  }
  if (notionCliPages) {
    if (!projectTokenEnv) {
      throw new Error("Provide --project-token-env PROJECT_NAME_NOTION_TOKEN for --notion-cli-pages.");
    }
    parseApprovedPlanningPagePath(notionCliPagePath);
  }

  const config = loadWorkspaceConfig(workspaceName);
  const result = await diagnoseProjectImpl({
    config,
    projectName,
    projectTokenEnv,
    truthAudit,
    consistencyAudit,
    staleAfterDays,
  });

  return {
    ...result,
    ...(notionCli ? { notionCli: notionCliResult } : {}),
    ...(notionCliApi
      ? {
        notionCliApi: await notionCliApiProbeImpl({
          config,
          projectName,
          projectTokenEnv,
          workspaceName,
          doctorResult: result,
        }),
      }
      : {}),
    ...(notionCliPages
      ? {
        notionCliPages: await notionCliPagesProbeImpl({
          config,
          projectName,
          projectTokenEnv,
          workspaceName,
          pagePath: notionCliPagePath,
          doctorResult: result,
        }),
      }
      : {}),
  };
}

export async function runRecommend({
  projectName,
  projectTokenEnv,
  intent,
  pagePath,
  docPath,
  title,
  domainTitle,
  repoPath,
  workspaceName = "infrastructure-hq",
}) {
  const config = loadWorkspaceConfig(workspaceName);
  return recommendProjectUpdate({
    config,
    projectName,
    projectTokenEnv,
    intent,
    pagePath,
    docPath,
    title,
    domainTitle,
    repoPath,
  });
}
