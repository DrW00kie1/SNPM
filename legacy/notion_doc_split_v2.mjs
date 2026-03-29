import { execFileSync } from "node:child_process";

function getToken() {
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN;
  const token = execFileSync(
    "powershell",
    ["-NoProfile", "-Command", "[Environment]::GetEnvironmentVariable('NOTION_TOKEN','User')"],
    { encoding: "utf8" },
  ).trim();
  if (!token) throw new Error("NOTION_TOKEN is not set in process or user environment.");
  return token;
}

const token = getToken();
const notionVersion = "2022-06-28";

const ids = {
  home: "3319f5f6-66d0-805b-8ad5-f358f6a1b494",
  projects: "3319f5f6-66d0-81ab-b6e8-c4fe3e2047be",
  infrastructure: "3319f5f6-66d0-81cc-9115-cefdc9744e1b",
  vendors: "3319f5f6-66d0-8106-930b-fa443a4e6038",
  accessIndex: "3319f5f6-66d0-8160-b214-df4c8ad91c1e",
  runbooks: "3319f5f6-66d0-814c-827d-c665d9a03920",
  incidents: "3319f5f6-66d0-81c3-92de-e0f662adf912",
  templates: "3319f5f6-66d0-811b-ac7f-d7a8bb77d99e",
  tmt: "3319f5f6-66d0-8158-9d16-c6753643c9d6",
  tmtAccess: "3319f5f6-66d0-815f-afec-cb9d4842bb4f",
  hostingInfra: "3319f5f6-66d0-8122-a52c-cf4f2d77f6b9",
  dnsNetwork: "3319f5f6-66d0-81b1-be6b-c80956a07ec1",
  sourceCi: "3319f5f6-66d0-8185-a730-f7edd5c49bfb",
  mobileStore: "3319f5f6-66d0-8120-a0c5-fdf5bc0b5c16",
  appBackend: "3319f5f6-66d0-8159-a98e-ce4b7d397fb8",
  vendorDo: "3319f5f6-66d0-81f5-afaa-ca906b92849d",
  vendorCf: "3319f5f6-66d0-81fc-9be3-dde625e713c7",
  vendorGh: "3319f5f6-66d0-8178-958b-c847502fd09c",
  vendorExpo: "3319f5f6-66d0-8143-bdc8-c7af7cf050c5",
  vendorApple: "3319f5f6-66d0-81d0-840b-d4be6a873441",
  vendorNotion: "3319f5f6-66d0-81f1-adaa-dbf8abee6fc7",
  runbookDeploy: "3319f5f6-66d0-81a0-b9c7-c4eafb8adc16",
  runbookRollback: "3319f5f6-66d0-8164-9c32-f028124e3cba",
  runbookBootstrap: "3319f5f6-66d0-8158-9933-fd54567c25fe",
};

async function notion(method, path, body) {
  const response = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": notionVersion,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function getChildren(blockId) {
  const results = [];
  let cursor = null;
  do {
    const query = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : "?page_size=100";
    const response = await notion("GET", `blocks/${blockId}/children${query}`);
    results.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return results;
}

function rich(text) {
  return [{ type: "text", text: { content: text } }];
}

function paragraph(text) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: rich(text) } };
}

function bullet(text) {
  return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rich(text) } };
}

function heading2(text) {
  return { object: "block", type: "heading_2", heading_2: { rich_text: rich(text) } };
}

function divider() {
  return { object: "block", type: "divider", divider: {} };
}

function callout(text, emoji) {
  return {
    object: "block",
    type: "callout",
    callout: { rich_text: rich(text), icon: { type: "emoji", emoji } },
  };
}

function code(text) {
  return {
    object: "block",
    type: "code",
    code: { rich_text: rich(text), language: "plain text" },
  };
}

function plainText(richText) {
  return (richText || []).map((item) => item.plain_text || "").join("").trim();
}

function blockText(block) {
  const prop = block[block.type];
  if (!prop) return "";
  return plainText(prop.rich_text);
}

async function setPageTitle(pageId, title) {
  await notion("PATCH", `pages/${pageId}`, {
    properties: {
      title: {
        title: [{ type: "text", text: { content: title } }],
      },
    },
  });
}

async function appendBlocks(blockId, blocks) {
  if (!blocks.length) return;
  await notion("PATCH", `blocks/${blockId}/children`, { children: blocks });
}

async function archiveBlock(blockId) {
  await notion("PATCH", `blocks/${blockId}`, { archived: true });
}

async function archivePage(pageId) {
  try {
    await notion("PATCH", `pages/${pageId}`, { archived: true });
  } catch (error) {
    if (!String(error.message).includes("Can't edit block that is archived")) {
      throw error;
    }
  }
}

async function clearPageContent(pageId, keepTypes = []) {
  const children = await getChildren(pageId);
  for (const child of children) {
    if (keepTypes.includes(child.type)) continue;
    if (child.type === "child_page") {
      await archivePage(child.id);
    } else {
      await archiveBlock(child.id);
    }
  }
}

async function getOrCreateChildPage(parentPageId, title) {
  const children = await getChildren(parentPageId);
  const existing = children.find((child) => child.type === "child_page" && child.child_page?.title === title);
  if (existing) return existing.id;

  const created = await notion("POST", "pages", {
    parent: { type: "page_id", page_id: parentPageId },
    properties: {
      title: {
        title: [{ type: "text", text: { content: title } }],
      },
    },
  });
  return created.id;
}

async function getCodeTexts(pageId) {
  const children = await getChildren(pageId);
  return children.filter((block) => block.type === "code").map((block) => plainText(block.code.rich_text));
}

async function getTextNotes(pageId) {
  const children = await getChildren(pageId);
  return children
    .filter((block) => block.type !== "code" && block.type !== "child_page")
    .map((block) => blockText(block))
    .filter(Boolean);
}

function headerBlocks({ purpose, canonicalSource, readThisWhen, sensitive }) {
  return [
    paragraph(`Purpose: ${purpose}`),
    paragraph(`Canonical Source: ${canonicalSource}`),
    paragraph(`Read This When: ${readThisWhen}`),
    paragraph("Last Updated: 2026-03-28"),
    paragraph(`Sensitive: ${sensitive}`),
    divider(),
  ];
}

async function resetPage(pageId, title, blocks, keepTypes = []) {
  try {
    await notion("PATCH", `pages/${pageId}`, { archived: false });
  } catch {
    // ignore; some pages are already active
  }
  await setPageTitle(pageId, title);
  await clearPageContent(pageId, keepTypes);
  await appendBlocks(pageId, blocks);
}

const hostingCodes = await getCodeTexts(ids.hostingInfra);
const hostingNotes = await getTextNotes(ids.hostingInfra);
const dnsNotes = await getTextNotes(ids.dnsNetwork);
const sourceNotes = await getTextNotes(ids.sourceCi);
const mobileNotes = await getTextNotes(ids.mobileStore);
const backendNotes = await getTextNotes(ids.appBackend);

const doTokenRaw = hostingCodes[0] || "PASTE TOKEN HERE";
const prodRootRaw = hostingCodes[1] || "PASTE PROD ROOT ACCESS HERE";
const testRootRaw = hostingCodes[2] || "PASTE TEST ROOT ACCESS HERE";
const deployKeyRaw = hostingCodes[3] || "PASTE DEPLOY KEY METADATA HERE";

await setPageTitle(ids.vendors, "Vendors");
await setPageTitle(ids.accessIndex, "Access Index");
await setPageTitle(ids.runbooks, "Runbooks");
await setPageTitle(ids.hostingInfra, "Hosting & Infra");
await setPageTitle(ids.dnsNetwork, "DNS & Network");
await setPageTitle(ids.sourceCi, "Source Control & CI/CD");
await setPageTitle(ids.mobileStore, "Mobile & Store");
await setPageTitle(ids.appBackend, "App & Backend");
await setPageTitle(ids.tmtAccess, "Tall Man Training");
await archivePage(ids.infrastructure);

const backupRunbookId = await getOrCreateChildPage(ids.runbooks, "Tall Man Training - Backup & Recovery");
const localWorkstationId = await getOrCreateChildPage(ids.home, "Local Workstation");

const homeBlocks = [
  ...headerBlocks({
    purpose: "Workspace landing page for operational context across projects.",
    canonicalSource: "Notion workspace home",
    readThisWhen: "You need the top-level structure, naming rules, or shared operating model.",
    sensitive: "no",
  }),
  callout("Repo docs keep code-coupled truth. Notion keeps current operational state, access, runbooks, incidents, and active planning.", "🧭"),
  heading2("Start Here"),
  bullet("Projects contains project hubs and current operating state."),
  bullet("Access Index is the only place raw secret values should live."),
  bullet("Runbooks holds executable procedures, not environment summaries."),
  bullet("Vendors holds provider ownership, billing, and access context."),
  bullet("Incidents records operational history and lessons."),
  heading2("Shared Context"),
  bullet("Local Workstation stores the current machine baseline and terminal/tooling capability shared across projects."),
];

const projectsBlocks = [
  ...headerBlocks({
    purpose: "Index of project hubs.",
    canonicalSource: "Project pages under Projects",
    readThisWhen: "You need orientation, current status, or the main operational entry point for a specific project.",
    sensitive: "no",
  }),
  callout("Project root pages are orientation pages. Active execution lives in each project's Ops page.", "📁"),
  bullet("Keep each project root short: purpose, status, repo docs, public links, operational surfaces, next milestone."),
  bullet("Do not duplicate secret values, vendor details, or procedural content inside the project root."),
];

const accessIndexBlocks = [
  ...headerBlocks({
    purpose: "Canonical home for credentials and access metadata.",
    canonicalSource: "Access Index project pages",
    readThisWhen: "You need to locate or rotate a credential, confirm access method, or see which environments depend on a system.",
    sensitive: "yes",
  }),
  callout("Raw secret values belong only in Access Index pages. Project pages, vendor pages, and runbooks should reference these pages instead of copying values.", "🔐"),
  bullet("Use fixed fields: System, Purpose, Auth Method, Where The Secret Lives, Owner, Environments Used, Rotation / Reset, Raw Value."),
  bullet("Prefer one access page per domain, not one page per individual token."),
];

const vendorsBlocks = [
  ...headerBlocks({
    purpose: "Index of provider ownership and account context.",
    canonicalSource: "Vendor pages",
    readThisWhen: "You need the owning account, billing context, or a provider-level summary without opening project-specific operational notes.",
    sensitive: "no",
  }),
  bullet("Keep provider pages short and reusable across projects."),
  bullet("Do not store raw secret values here. Link back to Access Index instead."),
];

const runbooksBlocks = [
  ...headerBlocks({
    purpose: "Canonical home for executable operator procedures.",
    canonicalSource: "Runbook pages",
    readThisWhen: "You need to perform a deploy, rollback, restore, or bootstrap task.",
    sensitive: "no",
  }),
  bullet("Each runbook should state the owning project and the related Access Index page."),
  bullet("Avoid long environment summaries. Keep only the minimum context needed to execute the procedure."),
];

const incidentsBlocks = [
  ...headerBlocks({
    purpose: "Historical record of operational incidents and lessons.",
    canonicalSource: "Incident pages",
    readThisWhen: "You are debugging a repeat issue or reviewing historical operational decisions.",
    sensitive: "no",
  }),
  bullet("Capture what happened, impact, resolution, and durable lessons."),
];

const templatesBlocks = [
  ...headerBlocks({
    purpose: "Reusable page shapes for new projects, vendors, access pages, and incidents.",
    canonicalSource: "Template pages",
    readThisWhen: "You are creating a new project or extending the workspace structure.",
    sensitive: "no",
  }),
  bullet("Template pages should define structure and field names, not carry active project state."),
];

const localWorkstationBlocks = [
  ...headerBlocks({
    purpose: "Shared baseline for the current development workstation used across projects.",
    canonicalSource: "Local machine state",
    readThisWhen: "You need to know what this machine can do without re-discovering the toolchain or hardware.",
    sensitive: "no",
  }),
  callout("This page replaces the old repo-local local capabilities doc. Keep project-specific operational state out of it.", "💻"),
  heading2("Hardware"),
  bullet("Machine: ASUSTeK ROG Zephyrus G14 GA402XY"),
  bullet("CPU: AMD Ryzen 9 7940HS"),
  bullet("RAM: 47 GB usable system memory"),
  bullet("GPU: NVIDIA GeForce RTX 4090 Laptop GPU plus AMD Radeon 780M"),
  bullet("Local ML / AI note: capable of moderate local inference or GPU-assisted experimentation, but not treated as a dedicated training box."),
  heading2("Tooling"),
  bullet("Terminal tooling: rg, fd, jq, bat, delta, fzf, httpie, gh"),
  bullet("Mobile tooling: Android SDK at C:\\Android\\SDK, Android emulator support, Expo / EAS workflows"),
  bullet("Access tooling: SSH config present and key-based access configured for Tall Man Training infrastructure"),
];

await resetPage(ids.home, "Infrastructure HQ Home", homeBlocks, ["child_page"]);
await resetPage(ids.projects, "Projects", projectsBlocks, ["child_page"]);
await resetPage(ids.accessIndex, "Access Index", accessIndexBlocks, ["child_page"]);
await resetPage(ids.vendors, "Vendors", vendorsBlocks, ["child_page"]);
await resetPage(ids.runbooks, "Runbooks", runbooksBlocks, ["child_page"]);
await resetPage(ids.incidents, "Incidents", incidentsBlocks, ["child_page"]);
await resetPage(ids.templates, "Templates", templatesBlocks, ["child_page"]);
await resetPage(localWorkstationId, "Local Workstation", localWorkstationBlocks);

await resetPage(ids.tmt, "Tall Man Training", []);
const opsId = await getOrCreateChildPage(ids.tmt, "Ops");

const tmtBlocks = [
  ...headerBlocks({
    purpose: "Primary orientation page for Tall Man Training.",
    canonicalSource: "Repo docs plus Tall Man Training Ops",
    readThisWhen: "You need the current project state, canonical repo docs, public links, or the next operational surface to open.",
    sensitive: "no",
  }),
  callout("Tall Man Training uses the repo for durable technical truth and Notion for current operational state.", "🏋️"),
  heading2("Current Status"),
  bullet("Shared Expo / React Native client is shipped on web and can be tested natively on Android and iPhone."),
  bullet("Production and test environments run on separate DigitalOcean droplets behind Cloudflare."),
  bullet("Current engineering focus is native delivery validation and the supporting operator workflow."),
  heading2("Canonical Repo Docs"),
  bullet("README.md - onboarding, quick start, and deploy entry points"),
  bullet("docs/architecture-decisions.md - durable technical invariants"),
  bullet("docs/dev-guide.md - contributor workflow and versioning"),
  bullet("docs/infrastructure.md - runtime contract and hosting topology"),
  bullet("docs/changelog.md - shipped history"),
  heading2("Public Links"),
  bullet("Production: https://tallman.seanwilkie.me"),
  bullet("Test: https://tallmantest.seanwilkie.me"),
  bullet("GitHub: DrW00kie1/tall-man-training"),
  bullet("Expo / EAS: @seanwilkie/tall-man-training"),
  heading2("Operational Surfaces"),
  bullet("Ops - active project state, environment snapshot, deployment notes, and next milestone"),
  bullet("Access Index > Tall Man Training - all credentials and access metadata"),
  bullet("Runbooks - deploy, rollback, backup & recovery, and server bootstrap procedures"),
  bullet("Vendors - provider ownership and account context"),
  heading2("Current Priorities / Next Milestone"),
  bullet("Keep the shared client stable across web, Android, and iPhone."),
  bullet("Treat iOS packaged builds as milestone checkpoints until a local Mac build loop exists."),
  bullet("Keep deployment and access automation centralized around the documented aliases and runbooks."),
];

const opsBlocks = [
  ...headerBlocks({
    purpose: "Active operating page for Tall Man Training.",
    canonicalSource: "Current operational state for Tall Man Training",
    readThisWhen: "You need to understand what exists now, where it runs, what is next, or which operational link to open.",
    sensitive: "no",
  }),
  callout("Use this page for current state and next actions. Use repo docs for durable technical truth.", "⚙️"),
  heading2("Environment Snapshot"),
  bullet("Production: tallman.seanwilkie.me on tmt-prod"),
  bullet("Test: tallmantest.seanwilkie.me on tmt-test"),
  bullet("Both environments run the same Cloudflare -> DigitalOcean -> Caddy -> PocketBase shape."),
  heading2("Current Capability Snapshot"),
  bullet("Web/PWA is the stable production delivery surface."),
  bullet("Android can be validated locally through the emulator and native Expo tooling."),
  bullet("iPhone validation currently uses packaged preview builds rather than a local Mac simulator loop."),
  heading2("Operator Links"),
  bullet("Access Index > Tall Man Training for credentials and access inventory"),
  bullet("Runbooks for deploy, rollback, backup & recovery, and server bootstrap"),
  bullet("Vendor pages for DigitalOcean, Cloudflare, GitHub, Expo / EAS, Apple Developer, and Notion"),
  heading2("Next Milestone"),
  bullet("Continue shared-client polish while keeping iOS packaged builds batched and deliberate."),
  bullet("Preserve clean documentation boundaries: repo for code-coupled truth, Notion for current state."),
];

await appendBlocks(ids.tmt, tmtBlocks);
await resetPage(opsId, "Ops", opsBlocks);

const tmtAccessBlocks = [
  ...headerBlocks({
    purpose: "Canonical access inventory for Tall Man Training.",
    canonicalSource: "Access Index > Tall Man Training",
    readThisWhen: "You need any secret, credential, or provider access path for Tall Man Training.",
    sensitive: "yes",
  }),
  callout("This is the only Tall Man Training area where raw secret values should live.", "🔐"),
  bullet("Hosting & Infra covers DigitalOcean access, servers, and deployment SSH."),
  bullet("DNS & Network covers Cloudflare, DNS, certificates, and public edge settings."),
  bullet("Source Control & CI/CD covers GitHub, Actions, deploy automation, and repo integrations."),
  bullet("Mobile & Store covers Expo / EAS and Apple distribution access."),
  bullet("App & Backend covers PocketBase and app-facing service credentials."),
];

const hostingBlocks = [
  ...headerBlocks({
    purpose: "Tall Man Training hosting, server, and deployment access.",
    canonicalSource: "Access Index > Tall Man Training > Hosting & Infra",
    readThisWhen: "You need DigitalOcean access, server login, or the current deploy-key state.",
    sensitive: "yes",
  }),
  heading2("System"),
  bullet("DigitalOcean droplets, server root access, and deployment SSH"),
  heading2("Purpose"),
  bullet("Manage droplets, identify production and test hosts, and maintain deploy access."),
  heading2("Auth Method"),
  bullet("DigitalOcean personal access token plus SSH / root credentials"),
  heading2("Where The Secret Lives"),
  bullet("Raw values are stored only on this page."),
  heading2("Owner"),
  bullet("Sean Wilkie"),
  heading2("Environments Used"),
  bullet("Production and Test"),
  heading2("Rotation / Reset"),
  bullet("Rotate the API token if it is exposed or expires. Keep root passwords as emergency-only once SSH key access is verified."),
  heading2("Raw Value"),
  paragraph("DigitalOcean API Token"),
  code(doTokenRaw),
  paragraph("Production Server Root Access"),
  code(prodRootRaw),
  paragraph("Test Server Root Access"),
  code(testRootRaw),
  paragraph("Deployment SSH Access"),
  code(deployKeyRaw),
];
if (hostingNotes.length) {
  hostingBlocks.push(heading2("Imported Notes"));
  hostingNotes.forEach((note) => hostingBlocks.push(bullet(note)));
}

const dnsBlocks = [
  ...headerBlocks({
    purpose: "Tall Man Training DNS, edge, and certificate access.",
    canonicalSource: "Access Index > Tall Man Training > DNS & Network",
    readThisWhen: "You need Cloudflare access, DNS records, or origin certificate context.",
    sensitive: "yes",
  }),
  paragraph("System: Cloudflare, DNS records, and origin certificate context"),
  paragraph("Purpose: Manage public domains and the edge-to-origin trust chain."),
  paragraph("Auth Method: Cloudflare account access and API token"),
  paragraph("Where The Secret Lives: Raw values belong only on this page."),
  paragraph("Owner: Sean Wilkie"),
  paragraph("Environments Used: Production and Test"),
  paragraph("Rotation / Reset: Rotate tokens if exposed. Refresh origin certificate material before expiry."),
];
if (dnsNotes.length) {
  dnsBlocks.push(heading2("Imported Notes"));
  dnsNotes.forEach((note) => dnsBlocks.push(bullet(note)));
}

const sourceBlocks = [
  ...headerBlocks({
    purpose: "Tall Man Training source-control and automation access.",
    canonicalSource: "Access Index > Tall Man Training > Source Control & CI/CD",
    readThisWhen: "You need GitHub, automation, or deploy integration access.",
    sensitive: "yes",
  }),
  paragraph("System: GitHub, Actions, and deploy integrations"),
  paragraph("Purpose: Manage repository access, CI/CD workflows, and connected automation."),
  paragraph("Auth Method: GitHub account access, app/install permissions, or automation tokens"),
  paragraph("Where The Secret Lives: Raw values belong only on this page."),
  paragraph("Owner: Sean Wilkie"),
  paragraph("Environments Used: Shared across development, test, and production workflows"),
  paragraph("Rotation / Reset: Rotate automation tokens after exposure or when integrations change."),
];
if (sourceNotes.length) {
  sourceBlocks.push(heading2("Imported Notes"));
  sourceNotes.forEach((note) => sourceBlocks.push(bullet(note)));
}

const mobileBlocks = [
  ...headerBlocks({
    purpose: "Tall Man Training mobile build and store access.",
    canonicalSource: "Access Index > Tall Man Training > Mobile & Store",
    readThisWhen: "You need Expo, EAS, Apple Developer, or App Store Connect access.",
    sensitive: "yes",
  }),
  paragraph("System: Expo / EAS, Apple Developer, and App Store Connect"),
  paragraph("Purpose: Manage Android and iOS builds, signing, and distribution."),
  paragraph("Auth Method: Expo account/token plus Apple account or App Store Connect API key"),
  paragraph("Where The Secret Lives: Raw values belong only on this page."),
  paragraph("Owner: Sean Wilkie"),
  paragraph("Environments Used: Native test, preview, and store distribution workflows"),
  paragraph("Rotation / Reset: Rotate Expo tokens after exposure. Replace Apple credentials when revoked or expired."),
];
if (mobileNotes.length) {
  mobileBlocks.push(heading2("Imported Notes"));
  mobileNotes.forEach((note) => mobileBlocks.push(bullet(note)));
}

const backendBlocks = [
  ...headerBlocks({
    purpose: "Tall Man Training application and backend access.",
    canonicalSource: "Access Index > Tall Man Training > App & Backend",
    readThisWhen: "You need PocketBase admin access, backend operational access, or app-facing service credentials.",
    sensitive: "yes",
  }),
  paragraph("System: PocketBase admin and app/backend service credentials"),
  paragraph("Purpose: Manage auth, data, admin access, and app-facing service configuration."),
  paragraph("Auth Method: PocketBase admin credentials and service secrets"),
  paragraph("Where The Secret Lives: Raw values belong only on this page."),
  paragraph("Owner: Sean Wilkie"),
  paragraph("Environments Used: Production and Test"),
  paragraph("Rotation / Reset: Rotate backend secrets after exposure or major admin transitions."),
];
if (backendNotes.length) {
  backendBlocks.push(heading2("Imported Notes"));
  backendNotes.forEach((note) => backendBlocks.push(bullet(note)));
}

await resetPage(ids.tmtAccess, "Tall Man Training", tmtAccessBlocks, ["child_page"]);
await resetPage(ids.hostingInfra, "Hosting & Infra", hostingBlocks);
await resetPage(ids.dnsNetwork, "DNS & Network", dnsBlocks);
await resetPage(ids.sourceCi, "Source Control & CI/CD", sourceBlocks);
await resetPage(ids.mobileStore, "Mobile & Store", mobileBlocks);
await resetPage(ids.appBackend, "App & Backend", backendBlocks);

const vendorPages = [
  [ids.vendorDo, "DigitalOcean", "Primary use: Tall Man Training production and test droplets", "Project access: Access Index > Tall Man Training > Hosting & Infra", "Current shape: tmt-prod and tmt-test in SFO3"],
  [ids.vendorCf, "Cloudflare", "Primary use: DNS, CDN, edge protection, and origin certificate model", "Project access: Access Index > Tall Man Training > DNS & Network"],
  [ids.vendorGh, "GitHub", "Primary use: source control, pull requests, and CI automation", "Project access: Access Index > Tall Man Training > Source Control & CI/CD"],
  [ids.vendorExpo, "Expo & EAS", "Primary use: Android and iOS cloud builds plus project linking", "Project access: Access Index > Tall Man Training > Mobile & Store"],
  [ids.vendorApple, "Apple Developer & App Store Connect", "Primary use: iOS signing, ad hoc installs, and future TestFlight distribution", "Project access: Access Index > Tall Man Training > Mobile & Store"],
  [ids.vendorNotion, "Notion", "Primary use: operational workspace, runbooks, access inventory, and planning context", "Sensitive values should still stay only in Access Index pages."],
];

for (const [pageId, title, line1, line2, line3] of vendorPages) {
  const blocks = [
    ...headerBlocks({
      purpose: `Provider summary for ${title}.`,
      canonicalSource: `Vendors > ${title}`,
      readThisWhen: "You need provider ownership or billing context without opening project access pages.",
      sensitive: "no",
    }),
    bullet(line1),
    bullet(line2),
  ];
  if (line3) blocks.push(bullet(line3));
  await resetPage(pageId, title, blocks);
}

const runbookPages = [
  [ids.runbookDeploy, "Tall Man Training - Deploy", "Deploy Tall Man Training to test or production.", "You are preparing or executing a deploy.", "Access page: Access Index > Tall Man Training > Hosting & Infra", "Primary commands: node scripts/deploy-runner.mjs test|prod or ./scripts/deploy.sh test|prod", "Verification: open the app shell, confirm login path, and confirm /api/health"],
  [ids.runbookRollback, "Tall Man Training - Rollback", "Rollback the active Tall Man Training web release.", "A fresh deploy must be reverted to the previous known-good build.", "Access page: Access Index > Tall Man Training > Hosting & Infra", "Rollback target: dist.prev on the appropriate droplet"],
  [ids.runbookBootstrap, "Tall Man Training - Server Bootstrap", "Bootstrap a new Tall Man Training server.", "You are provisioning or rebuilding a host for Tall Man Training.", "Access page: Access Index > Tall Man Training > Hosting & Infra", "Expectations: Ubuntu host, /opt/tmt-app layout, Docker, Caddy, PocketBase, SSH alias wiring"],
  [backupRunbookId, "Tall Man Training - Backup & Recovery", "Back up or restore Tall Man Training PocketBase data.", "You are taking a pre-change backup or restoring after data loss or corruption.", "Access page: Access Index > Tall Man Training > App & Backend", "Repo contract: docs/backup-and-recovery.md", "Operational detail lives here so the repo keeps only the stable recovery contract."],
];

for (const [pageId, title, purpose, readThisWhen, ...lines] of runbookPages) {
  const blocks = [
    ...headerBlocks({
      purpose,
      canonicalSource: `Runbooks > ${title}`,
      readThisWhen,
      sensitive: "no",
    }),
    bullet("Project: Tall Man Training"),
    ...lines.map((line) => bullet(line)),
  ];
  await resetPage(pageId, title, blocks);
}

console.log("Notion documentation split applied.");
