import test from "node:test";
import assert from "node:assert/strict";

import { verifyExpectedTree } from "../src/notion/project-service.mjs";

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
