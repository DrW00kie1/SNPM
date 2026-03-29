import test from "node:test";
import assert from "node:assert/strict";

import {
  APPROVED_PLANNING_PAGE_PATHS,
  findAccessDomainTarget,
  findAccessRecordTarget,
  findBuildRecordTarget,
  findBuildsContainerTarget,
  findProjectPathTarget,
  findRunbookTarget,
  findValidationSessionsDatabaseTarget,
  parseApprovedPlanningPagePath,
  resolveAccessDomainTarget,
  resolveAccessRecordTarget,
  resolveAccessTarget,
  resolveApprovedPlanningPageTarget,
  resolveBuildRecordTarget,
  resolveProjectPathTarget,
  resolveRunbookTarget,
  resolveValidationTarget,
} from "../src/notion/page-targets.mjs";

test("approved planning targets stay limited to the four planning pages", () => {
  assert.deepEqual(APPROVED_PLANNING_PAGE_PATHS, [
    "Planning > Roadmap",
    "Planning > Current Cycle",
    "Planning > Backlog",
    "Planning > Decision Log",
  ]);
});

test("parseApprovedPlanningPagePath accepts the approved planning targets", () => {
  assert.deepEqual(
    parseApprovedPlanningPagePath("Planning > Current Cycle"),
    ["Planning", "Current Cycle"],
  );
});

test("parseApprovedPlanningPagePath rejects unsupported targets", () => {
  assert.throws(
    () => parseApprovedPlanningPagePath("Ops > Environments"),
    /Approved page targets are limited to/,
  );
});

test("resolveApprovedPlanningPageTarget walks the project subtree", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "planning", child_page: { title: "Planning" } }]],
    ["planning", [{ type: "child_page", id: "roadmap", child_page: { title: "Roadmap" } }]],
  ]);

  const client = {
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  const target = await resolveApprovedPlanningPageTarget("SNPM", "Planning > Roadmap", {
    workspace: { projectsPageId: "projects" },
  }, client);

  assert.equal(target.pageId, "roadmap");
  assert.equal(target.targetPath, "Projects > SNPM > Planning > Roadmap");
});

test("findProjectPathTarget returns null when the target page is missing", async () => {
  const client = {
    async getChildren(pageId) {
      if (pageId === "projects") return [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }];
      if (pageId === "project-root") return [{ type: "child_page", id: "runbooks", child_page: { title: "Runbooks" } }];
      return [];
    },
  };

  const target = await findProjectPathTarget("SNPM", ["Runbooks", "Missing"], {
    workspace: { projectsPageId: "projects" },
  }, client);

  assert.equal(target, null);
});

test("resolveProjectPathTarget returns the resolved project path", async () => {
  const client = {
    async getChildren(pageId) {
      if (pageId === "projects") return [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }];
      if (pageId === "project-root") return [{ type: "child_page", id: "runbooks", child_page: { title: "Runbooks" } }];
      if (pageId === "runbooks") return [{ type: "child_page", id: "runbook", child_page: { title: "Release Smoke Test" } }];
      return [];
    },
  };

  const target = await resolveProjectPathTarget("SNPM", ["Runbooks", "Release Smoke Test"], {
    workspace: { projectsPageId: "projects" },
  }, client);

  assert.equal(target.pageId, "runbook");
  assert.equal(target.targetPath, "Projects > SNPM > Runbooks > Release Smoke Test");
});

test("runbook and build-record helpers resolve approved project-owned surfaces", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [
      { type: "child_page", id: "ops", child_page: { title: "Ops" } },
      { type: "child_page", id: "runbooks", child_page: { title: "Runbooks" } },
    ]],
    ["runbooks", [{ type: "child_page", id: "runbook", child_page: { title: "Release Smoke Test" } }]],
    ["ops", [{ type: "child_page", id: "builds", child_page: { title: "Builds" } }]],
    ["builds", [{ type: "child_page", id: "build-record", child_page: { title: "v0.2.0 Build" } }]],
  ]);

  const client = {
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  const runbookTarget = await resolveRunbookTarget("SNPM", "Release Smoke Test", {
    workspace: { projectsPageId: "projects" },
  }, client);
  const buildsTarget = await findBuildsContainerTarget("SNPM", {
    workspace: { projectsPageId: "projects" },
  }, client);
  const buildRecordTarget = await resolveBuildRecordTarget("SNPM", "v0.2.0 Build", {
    workspace: { projectsPageId: "projects" },
  }, client);

  assert.equal(runbookTarget.targetPath, "Projects > SNPM > Runbooks > Release Smoke Test");
  assert.equal(buildsTarget?.targetPath, "Projects > SNPM > Ops > Builds");
  assert.equal(buildRecordTarget.targetPath, "Projects > SNPM > Ops > Builds > v0.2.0 Build");
});

test("findRunbookTarget and findBuildRecordTarget return null when the title is absent", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [
      { type: "child_page", id: "ops", child_page: { title: "Ops" } },
      { type: "child_page", id: "runbooks", child_page: { title: "Runbooks" } },
    ]],
    ["runbooks", []],
    ["ops", []],
  ]);

  const client = {
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  const runbookTarget = await findRunbookTarget("SNPM", "Missing Runbook", {
    workspace: { projectsPageId: "projects" },
  }, client);
  const buildRecordTarget = await findBuildRecordTarget("SNPM", "Missing Build", {
    workspace: { projectsPageId: "projects" },
  }, client);

  assert.equal(runbookTarget, null);
  assert.equal(buildRecordTarget, null);
});

test("access target helpers resolve Access domains and nested records", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "access", child_page: { title: "Access" } }]],
    ["access", [{ type: "child_page", id: "app-backend", child_page: { title: "App & Backend" } }]],
    ["app-backend", [{ type: "child_page", id: "gemini-key", child_page: { title: "GEMINI_API_KEY" } }]],
  ]);

  const client = {
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  const accessTarget = await resolveAccessTarget("SNPM", {
    workspace: { projectsPageId: "projects" },
  }, client);
  const domainTarget = await resolveAccessDomainTarget("SNPM", "App & Backend", {
    workspace: { projectsPageId: "projects" },
  }, client);
  const recordTarget = await resolveAccessRecordTarget("SNPM", "App & Backend", "GEMINI_API_KEY", {
    workspace: { projectsPageId: "projects" },
  }, client);
  const foundDomainTarget = await findAccessDomainTarget("SNPM", "App & Backend", {
    workspace: { projectsPageId: "projects" },
  }, client);
  const foundRecordTarget = await findAccessRecordTarget("SNPM", "App & Backend", "GEMINI_API_KEY", {
    workspace: { projectsPageId: "projects" },
  }, client);

  assert.equal(accessTarget.targetPath, "Projects > SNPM > Access");
  assert.equal(domainTarget.targetPath, "Projects > SNPM > Access > App & Backend");
  assert.equal(recordTarget.targetPath, "Projects > SNPM > Access > App & Backend > GEMINI_API_KEY");
  assert.equal(foundDomainTarget?.targetPath, domainTarget.targetPath);
  assert.equal(foundRecordTarget?.targetPath, recordTarget.targetPath);
});

test("validation target helpers resolve Ops > Validation and the optional Validation Sessions database", async () => {
  const childrenMap = new Map([
    ["projects", [{ type: "child_page", id: "project-root", child_page: { title: "SNPM" } }]],
    ["project-root", [{ type: "child_page", id: "ops", child_page: { title: "Ops" } }]],
    ["ops", [{ type: "child_page", id: "validation", child_page: { title: "Validation" } }]],
    ["validation", [{ type: "child_database", id: "validation-db", child_database: { title: "Validation Sessions" } }]],
  ]);

  const client = {
    async getChildren(pageId) {
      return childrenMap.get(pageId) || [];
    },
  };

  const validationTarget = await resolveValidationTarget("SNPM", {
    workspace: { projectsPageId: "projects" },
  }, client);
  const databaseTarget = await findValidationSessionsDatabaseTarget("SNPM", {
    workspace: { projectsPageId: "projects" },
  }, client);

  assert.equal(validationTarget.targetPath, "Projects > SNPM > Ops > Validation");
  assert.equal(databaseTarget?.targetPath, "Projects > SNPM > Ops > Validation > Validation Sessions");
});
