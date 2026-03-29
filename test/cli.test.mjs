import test from "node:test";
import assert from "node:assert/strict";

import { parseArgs, usage } from "../src/cli.mjs";

test("usage includes the planning-page sync commands", () => {
  const help = usage();
  assert.match(help, /npm run page-pull/);
  assert.match(help, /npm run page-diff/);
  assert.match(help, /npm run page-push/);
});

test("parseArgs supports page subcommands and boolean apply flags", () => {
  const parsed = parseArgs([
    "page",
    "push",
    "--project",
    "SNPM",
    "--page",
    "Planning > Backlog",
    "--file",
    "backlog.md",
    "--apply",
  ]);

  assert.equal(parsed.command, "page push");
  assert.equal(parsed.options.project, "SNPM");
  assert.equal(parsed.options.page, "Planning > Backlog");
  assert.equal(parsed.options.file, "backlog.md");
  assert.equal(parsed.options.apply, true);
});
