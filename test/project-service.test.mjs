import test from "node:test";
import assert from "node:assert/strict";

import { verifyApprovedExtensions, verifyExpectedTree } from "../src/notion/project-service.mjs";

function makeConfig() {
  return {
    projectStarter: {
      children: [
        { title: "Ops", children: [] },
        { title: "Planning", children: [] },
        { title: "Access", children: [] },
        { title: "Vendors", children: [] },
        { title: "Runbooks", children: [] },
        { title: "Incidents", children: [] },
      ],
    },
  };
}

function paragraph(text) {
  return {
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: text }, plain_text: text }],
    },
  };
}

test("verifyExpectedTree reports icon, canonical, and child-page mismatches", async () => {
  const pageMap = new Map([
    ["root", { icon: { type: "emoji", emoji: "🗂️" } }],
    ["ops", { icon: null }],
  ]);

  const childrenMap = new Map([
    ["root", [
      { type: "child_page", id: "ops", child_page: { title: "Ops" } },
      paragraph("Canonical Source: Projects > Wrong"),
    ]],
    ["ops", [
      paragraph("Canonical Source: Projects > SNPM > Ops"),
    ]],
  ]);

  const fakeClient = {
    async request(method, apiPath) {
      if (method !== "GET" || !apiPath.startsWith("pages/")) {
        throw new Error(`Unexpected request: ${method} ${apiPath}`);
      }
      return pageMap.get(apiPath.slice("pages/".length));
    },
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  const failures = [];
  await verifyExpectedTree(
    "root",
    {
      title: "SNPM",
      children: [{ title: "Planning", children: [] }],
    },
    "SNPM",
    fakeClient,
    failures,
    ["SNPM"],
  );

  assert.ok(failures.some((failure) => failure.includes("Canonical Source mismatch on SNPM")));
  assert.ok(failures.some((failure) => failure.includes("Child page mismatch on SNPM")));
});

test("verifyExpectedTree allows dynamic runbooks, dynamic access domains, and the optional Ops > Builds extension", async () => {
  const pageMap = new Map([
    ["root", { icon: { type: "emoji", emoji: "🗂️" } }],
    ["ops", { icon: { type: "emoji", emoji: "🛠️" } }],
    ["access", { icon: { type: "emoji", emoji: "🔐" } }],
    ["runbooks", { icon: { type: "emoji", emoji: "📚" } }],
  ]);

  const childrenMap = new Map([
    ["root", [
      { type: "child_page", id: "access", child_page: { title: "Access" } },
      { type: "child_page", id: "ops", child_page: { title: "Ops" } },
      { type: "child_page", id: "runbooks", child_page: { title: "Runbooks" } },
      paragraph("Canonical Source: Projects > SNPM"),
    ]],
    ["access", [
      { type: "child_page", id: "app-backend", child_page: { title: "App & Backend" } },
      paragraph("Canonical Source: Projects > SNPM > Access"),
    ]],
    ["ops", [
      { type: "child_page", id: "environments", child_page: { title: "Environments" } },
      { type: "child_page", id: "validation", child_page: { title: "Validation" } },
      { type: "child_page", id: "release-readiness", child_page: { title: "Release Readiness" } },
      { type: "child_page", id: "builds", child_page: { title: "Builds" } },
      paragraph("Canonical Source: Projects > SNPM > Ops"),
    ]],
    ["runbooks", [
      { type: "child_page", id: "dynamic-runbook", child_page: { title: "Dynamic Runbook" } },
      paragraph("Canonical Source: Projects > SNPM > Runbooks"),
    ]],
    ["environments", [paragraph("Canonical Source: Projects > SNPM > Ops > Environments")]],
    ["validation", [paragraph("Canonical Source: Projects > SNPM > Ops > Validation")]],
    ["release-readiness", [paragraph("Canonical Source: Projects > SNPM > Ops > Release Readiness")]],
  ]);

  const fakeClient = {
    async request(method, apiPath) {
      if (method !== "GET" || !apiPath.startsWith("pages/")) {
        throw new Error(`Unexpected request: ${method} ${apiPath}`);
      }
      return pageMap.get(apiPath.slice("pages/".length)) || { icon: { type: "emoji", emoji: "📄" } };
    },
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  const failures = [];
  await verifyExpectedTree(
    "root",
    {
      title: "SNPM",
      children: [
        { title: "Access", children: [] },
        {
          title: "Ops",
          children: [
            { title: "Environments", children: [] },
            { title: "Validation", children: [] },
            { title: "Release Readiness", children: [] },
          ],
        },
        { title: "Runbooks", children: [] },
      ],
    },
    "SNPM",
    fakeClient,
    failures,
    ["SNPM"],
  );

  assert.deepEqual(failures, []);
});

test("verifyExpectedTree allows non-reserved project root docs", async () => {
  const pageMap = new Map([
    ["root", { icon: { type: "emoji", emoji: "🗂️" } }],
    ["ops", { icon: { type: "emoji", emoji: "🛠️" } }],
  ]);

  const childrenMap = new Map([
    ["root", [
      { type: "child_page", id: "ops", child_page: { title: "Ops" } },
      { type: "child_page", id: "overview", child_page: { title: "Overview" } },
      paragraph("Canonical Source: Projects > SNPM"),
    ]],
    ["ops", [
      { type: "child_page", id: "environments", child_page: { title: "Environments" } },
      { type: "child_page", id: "validation", child_page: { title: "Validation" } },
      { type: "child_page", id: "release-readiness", child_page: { title: "Release Readiness" } },
      paragraph("Canonical Source: Projects > SNPM > Ops"),
    ]],
    ["overview", [paragraph("Canonical Source: Projects > SNPM > Overview")]],
    ["environments", [paragraph("Canonical Source: Projects > SNPM > Ops > Environments")]],
    ["validation", [paragraph("Canonical Source: Projects > SNPM > Ops > Validation")]],
    ["release-readiness", [paragraph("Canonical Source: Projects > SNPM > Ops > Release Readiness")]],
  ]);

  const fakeClient = {
    async request(method, apiPath) {
      if (method !== "GET" || !apiPath.startsWith("pages/")) {
        throw new Error(`Unexpected request: ${method} ${apiPath}`);
      }
      return pageMap.get(apiPath.slice("pages/".length)) || { icon: { type: "emoji", emoji: "📄" } };
    },
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  const failures = [];
  await verifyExpectedTree(
    "root",
    {
      title: "SNPM",
      children: [{
        title: "Ops",
        children: [
          { title: "Environments", children: [] },
          { title: "Validation", children: [] },
          { title: "Release Readiness", children: [] },
        ],
      }],
    },
    "SNPM",
    fakeClient,
    failures,
    ["SNPM"],
    makeConfig(),
  );

  assert.deepEqual(failures, []);
});

test("verifyExpectedTree allows the optional Ops > Validation > Validation Sessions database", async () => {
  const pageMap = new Map([
    ["root", { icon: { type: "emoji", emoji: "🗂️" } }],
    ["ops", { icon: { type: "emoji", emoji: "🛠️" } }],
    ["validation", { icon: { type: "emoji", emoji: "🧪" } }],
  ]);

  const childrenMap = new Map([
    ["root", [
      { type: "child_page", id: "ops", child_page: { title: "Ops" } },
      paragraph("Canonical Source: Projects > SNPM"),
    ]],
    ["ops", [
      { type: "child_page", id: "environments", child_page: { title: "Environments" } },
      { type: "child_page", id: "validation", child_page: { title: "Validation" } },
      { type: "child_page", id: "release-readiness", child_page: { title: "Release Readiness" } },
      paragraph("Canonical Source: Projects > SNPM > Ops"),
    ]],
    ["validation", [
      { type: "child_database", id: "validation-db", child_database: { title: "Validation Sessions" } },
      paragraph("Canonical Source: Projects > SNPM > Ops > Validation"),
    ]],
    ["environments", [paragraph("Canonical Source: Projects > SNPM > Ops > Environments")]],
    ["release-readiness", [paragraph("Canonical Source: Projects > SNPM > Ops > Release Readiness")]],
  ]);

  const fakeClient = {
    async request(method, apiPath) {
      if (method !== "GET" || !apiPath.startsWith("pages/")) {
        throw new Error(`Unexpected request: ${method} ${apiPath}`);
      }
      return pageMap.get(apiPath.slice("pages/".length)) || { icon: { type: "emoji", emoji: "📄" } };
    },
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  const failures = [];
  await verifyExpectedTree(
    "root",
    {
      title: "SNPM",
      children: [{
        title: "Ops",
        children: [
          { title: "Environments", children: [] },
          { title: "Validation", children: [] },
          { title: "Release Readiness", children: [] },
        ],
      }],
    },
    "SNPM",
    fakeClient,
    failures,
    ["SNPM"],
  );

  assert.deepEqual(failures, []);
});

test("verifyApprovedExtensions checks managed extension pages while ignoring unmanaged descendants", async () => {
  const pageMap = new Map([
    ["access-domain", { icon: { type: "emoji", emoji: "🗃️" } }],
    ["managed-secret", { icon: { type: "emoji", emoji: "🔑" } }],
    ["builds", { icon: { type: "emoji", emoji: "🏗️" } }],
    ["managed-record", { icon: { type: "emoji", emoji: "📦" } }],
    ["unmanaged-runbook", { icon: null }],
  ]);

  const childrenMap = new Map([
    ["root", [
      { type: "child_page", id: "access", child_page: { title: "Access" } },
      { type: "child_page", id: "ops", child_page: { title: "Ops" } },
      { type: "child_page", id: "runbooks", child_page: { title: "Runbooks" } },
    ]],
    ["access", [{ type: "child_page", id: "access-domain", child_page: { title: "App & Backend" } }]],
    ["access-domain", [
      { type: "child_page", id: "managed-secret", child_page: { title: "GEMINI_API_KEY" } },
      paragraph("Canonical Source: Projects > SNPM > Access > App & Backend"),
    ]],
    ["ops", [{ type: "child_page", id: "builds", child_page: { title: "Builds" } }]],
    ["runbooks", [{ type: "child_page", id: "unmanaged-runbook", child_page: { title: "Legacy Runbook" } }]],
    ["builds", [{ type: "child_page", id: "managed-record", child_page: { title: "Validation Build" } }]],
    ["managed-secret", [paragraph("Canonical Source: Projects > SNPM > Access > App & Backend > GEMINI_API_KEY")]],
    ["managed-record", [paragraph("Canonical Source: Projects > SNPM > Ops > Builds > Validation Build")]],
    ["unmanaged-runbook", [paragraph("Legacy runbook body without managed header")]],
  ]);

  const fakeClient = {
    async request(method, apiPath) {
      if (method !== "GET" || !apiPath.startsWith("pages/")) {
        throw new Error(`Unexpected request: ${method} ${apiPath}`);
      }
      return pageMap.get(apiPath.slice("pages/".length)) || { icon: { type: "emoji", emoji: "📄" } };
    },
    async getChildren(pageId) {
      if (pageId === "builds") {
        return [
          { type: "child_page", id: "managed-record", child_page: { title: "Validation Build" } },
          paragraph("Canonical Source: Projects > SNPM > Ops > Builds"),
        ];
      }
      return childrenMap.get(pageId) || [];
    },
  };

  const failures = [];
  await verifyApprovedExtensions("root", "SNPM", makeConfig(), fakeClient, failures);

  assert.deepEqual(failures, []);
});

test("verifyApprovedExtensions validates the optional Validation Sessions database schema", async () => {
  const pageMap = new Map([
    ["session-row", { icon: { type: "emoji", emoji: "🧾" } }],
  ]);

  const childrenMap = new Map([
    ["root", [{ type: "child_page", id: "ops", child_page: { title: "Ops" } }]],
    ["ops", [{ type: "child_page", id: "validation", child_page: { title: "Validation" } }]],
    ["validation", [{ type: "child_database", id: "validation-db", child_database: { title: "Validation Sessions" } }]],
  ]);

  const fakeClient = {
    async request(method, apiPath) {
      if (method === "GET" && /^pages\/[^/]+$/.test(apiPath)) {
        return pageMap.get(apiPath.slice("pages/".length)) || { icon: { type: "emoji", emoji: "📄" } };
      }

      if (method === "GET" && /^pages\/[^/]+\/markdown$/.test(apiPath)) {
        return {
          markdown: [
            "Purpose: Validation session",
            "Canonical Source: Projects \\> SNPM \\> Ops \\> Validation \\> Validation Sessions \\> Regression Pass",
            "Read This When: Session details",
            "Last Updated: 03-29-2026 12:00:00",
            "Sensitive: no",
            "---",
            "## Findings",
            "- Existing",
            "",
          ].join("\n"),
          truncated: false,
          unknown_block_ids: [],
        };
      }

      if (method === "GET" && apiPath === "databases/validation-db") {
        return {
          id: "validation-db",
          title: [{ plain_text: "Validation Sessions" }],
          icon: { type: "emoji", emoji: "🧪" },
          data_sources: [{ id: "validation-ds" }],
        };
      }

      if (method === "GET" && apiPath === "data_sources/validation-ds") {
        return {
          id: "validation-ds",
          properties: {
            Name: { type: "title" },
            Platform: { type: "select", select: { options: [{ name: "Web" }, { name: "Android" }, { name: "iPhone" }, { name: "Cross-Platform" }] } },
            "Session State": { type: "select", select: { options: [{ name: "Planned" }, { name: "In Progress" }, { name: "Passed" }, { name: "Failed" }, { name: "Blocked" }] } },
            Tester: { type: "rich_text" },
            "Build Label": { type: "rich_text" },
            "Runbook URL": { type: "url" },
            "Started On": { type: "date" },
            "Completed On": { type: "date" },
          },
        };
      }

      if (method === "POST" && apiPath === "data_sources/validation-ds/query") {
        return {
          results: [{
            id: "session-row",
            properties: {
              Name: { title: [{ plain_text: "Regression Pass" }] },
            },
          }],
          has_more: false,
          next_cursor: null,
        };
      }

      throw new Error(`Unexpected request: ${method} ${apiPath}`);
    },
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  const failures = [];
  await verifyApprovedExtensions("root", "SNPM", makeConfig(), fakeClient, failures);

  assert.deepEqual(failures, []);
});
