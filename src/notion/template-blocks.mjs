export const SUPPORTED_TEMPLATE_BLOCK_TYPES = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "divider",
  "callout",
  "code",
  "quote",
]);

export function plainText(richText) {
  return (richText || []).map((item) => item.plain_text || item.text?.content || "").join("").trim();
}

export function cloneRichText(richText) {
  return (richText || []).map((item) => {
    if (item.type === "text") {
      return {
        type: "text",
        text: {
          content: item.text?.content || "",
          link: item.text?.link || null,
        },
        annotations: item.annotations,
      };
    }

    return {
      type: "text",
      text: { content: item.plain_text || "" },
      annotations: item.annotations,
    };
  });
}

export function sanitizeIcon(icon) {
  if (!icon) return undefined;
  if (icon.type === "emoji") return { type: "emoji", emoji: icon.emoji };
  if (icon.type === "external") return { type: "external", external: { url: icon.external.url } };
  if (icon.type === "custom_emoji") {
    return { type: "custom_emoji", custom_emoji: { id: icon.custom_emoji.id } };
  }
  if (icon.type === "file_upload") {
    return { type: "file_upload", file_upload: { id: icon.file_upload.id } };
  }
  if (icon.type === "file" && icon.file?.url) {
    return { type: "external", external: { url: icon.file.url } };
  }
  return undefined;
}

export function sanitizeCover(cover) {
  if (!cover) return undefined;
  if (cover.type === "external") return { type: "external", external: { url: cover.external.url } };
  if (cover.type === "file_upload") {
    return { type: "file_upload", file_upload: { id: cover.file_upload.id } };
  }
  if (cover.type === "file" && cover.file?.url) {
    return { type: "external", external: { url: cover.file.url } };
  }
  return undefined;
}

export function replaceHeaderRichText(richText, canonicalSource, timestamp) {
  const text = plainText(richText);
  if (text.startsWith("Canonical Source:")) {
    return [{ type: "text", text: { content: `Canonical Source: ${canonicalSource}` } }];
  }
  if (text.startsWith("Last Updated:")) {
    return [{ type: "text", text: { content: `Last Updated: ${timestamp}` } }];
  }
  return cloneRichText(richText);
}

export async function cloneTemplateBlock(block, canonicalSource, timestamp, sourceClient) {
  if (block.type === "child_page") return null;
  if (!SUPPORTED_TEMPLATE_BLOCK_TYPES.has(block.type)) {
    throw new Error(`Unsupported block type in template: ${block.type}`);
  }

  if (block.type === "divider") {
    return { object: "block", type: "divider", divider: {} };
  }

  const prop = block[block.type];
  const payload = {
    object: "block",
    type: block.type,
    [block.type]: {},
  };

  if ("rich_text" in prop) {
    payload[block.type].rich_text = replaceHeaderRichText(prop.rich_text, canonicalSource, timestamp);
  }
  if ("color" in prop) {
    payload[block.type].color = prop.color || "default";
  }

  if (block.type === "callout") {
    payload.callout.icon = sanitizeIcon(prop.icon) || { type: "emoji", emoji: "💡" };
  }

  if (block.type === "code") {
    payload.code.language = prop.language || "plain text";
    payload.code.caption = cloneRichText(prop.caption || []);
  }

  if (block.has_children) {
    const childBlocks = await sourceClient.getChildren(block.id);
    const clonedChildren = [];
    for (const child of childBlocks) {
      const cloned = await cloneTemplateBlock(child, canonicalSource, timestamp, sourceClient);
      if (cloned) clonedChildren.push(cloned);
    }
    if (clonedChildren.length > 0) {
      payload[block.type].children = clonedChildren;
    }
  }

  return payload;
}

export async function getCanonicalSource(pageId, client) {
  const blocks = await client.getChildren(pageId);
  const match = blocks.find(
    (block) => block.type === "paragraph" && plainText(block.paragraph.rich_text).startsWith("Canonical Source:"),
  );
  return match ? plainText(match.paragraph.rich_text) : "";
}
