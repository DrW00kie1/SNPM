import { parseNotionError } from "./errors.mjs";

async function readJsonResponse(response) {
  if (response.status === 204) return null;

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function makeNotionClient(token, notionVersion, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required to create the Notion client.");
  }

  async function request(method, apiPath, body) {
    const response = await fetchImpl(`https://api.notion.com/v1/${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": notionVersion,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw await parseNotionError(method, apiPath, response);
    }

    return readJsonResponse(response);
  }

  async function requestMaybe(method, apiPath, body) {
    const response = await fetchImpl(`https://api.notion.com/v1/${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": notionVersion,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.ok) {
      return { ok: true, json: await readJsonResponse(response) };
    }

    const error = await parseNotionError(method, apiPath, response);
    return {
      ok: false,
      status: error.status,
      body: error.body,
      error,
    };
  }

  async function getChildren(blockId) {
    const results = [];
    let cursor = null;

    do {
      const query = cursor
        ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
        : "?page_size=100";
      const response = await request("GET", `blocks/${blockId}/children${query}`);
      results.push(...response.results);
      cursor = response.has_more ? response.next_cursor : null;
    } while (cursor);

    return results;
  }

  return {
    request,
    requestMaybe,
    getChildren,
  };
}
