import test from "node:test";
import assert from "node:assert/strict";

import {
  cloneTemplateBlock,
  replaceHeaderRichText,
} from "../src/notion/template-blocks.mjs";

function text(content) {
  return [{ type: "text", text: { content }, plain_text: content }];
}

test("replaceHeaderRichText updates canonical source and timestamp lines", () => {
  assert.deepEqual(
    replaceHeaderRichText(text("Canonical Source: old"), "Projects > SNPM", "03-28-2026 12:00:00"),
    [{ type: "text", text: { content: "Canonical Source: Projects > SNPM" } }],
  );

  assert.deepEqual(
    replaceHeaderRichText(text("Last Updated: old"), "Projects > SNPM", "03-28-2026 12:00:00"),
    [{ type: "text", text: { content: "Last Updated: 03-28-2026 12:00:00" } }],
  );
});

test("cloneTemplateBlock ignores child pages and rejects unsupported block types", async () => {
  assert.equal(await cloneTemplateBlock({ type: "child_page" }, "Projects > SNPM", "ts", { getChildren: async () => [] }), null);

  await assert.rejects(
    () => cloneTemplateBlock({ type: "table" }, "Projects > SNPM", "ts", { getChildren: async () => [] }),
    /Unsupported block type in template: table/,
  );
});

test("cloneTemplateBlock rewrites header text inside supported paragraph blocks", async () => {
  const cloned = await cloneTemplateBlock({
    type: "paragraph",
    paragraph: {
      rich_text: text("Canonical Source: Templates > Project Templates"),
      color: "default",
    },
    has_children: false,
  }, "Projects > SNPM", "03-28-2026 12:00:00", { getChildren: async () => [] });

  assert.equal(cloned.type, "paragraph");
  assert.equal(cloned.paragraph.rich_text[0].text.content, "Canonical Source: Projects > SNPM");
});
