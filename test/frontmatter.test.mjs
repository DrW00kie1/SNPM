import test from "node:test";
import assert from "node:assert/strict";

import { parseFrontMatterFile, renderFrontMatterFile } from "../src/notion/frontmatter.mjs";

test("parseFrontMatterFile returns fields plus body markdown", () => {
  const parsed = parseFrontMatterFile([
    "---",
    "Platform: Web",
    "Tester: \"QA Lead\"",
    "---",
    "## Findings",
    "- All good",
    "",
  ].join("\n"));

  assert.deepEqual(parsed.fields, {
    Platform: "Web",
    Tester: "QA Lead",
  });
  assert.match(parsed.bodyMarkdown, /## Findings/);
});

test("renderFrontMatterFile writes ordered front matter with normalized body newlines", () => {
  const markdown = renderFrontMatterFile(
    {
      Platform: "Android",
      Tester: "Sean",
    },
    ["Platform", "Tester"],
    "## Findings\r\n- Pass\r\n",
  );

  assert.equal(markdown, [
    "---",
    "Platform: Android",
    "Tester: Sean",
    "---",
    "## Findings",
    "- Pass",
    "",
  ].join("\n"));
});
