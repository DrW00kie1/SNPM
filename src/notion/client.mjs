export function makeNotionClient(token, notionVersion) {
  async function request(method, apiPath, body) {
    const response = await fetch(`https://api.notion.com/v1/${apiPath}`, {
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
      throw new Error(`${method} ${apiPath} failed: ${response.status} ${text}`);
    }

    return response.json();
  }

  async function requestMaybe(method, apiPath, body) {
    const response = await fetch(`https://api.notion.com/v1/${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": notionVersion,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.ok) {
      return { ok: true, json: await response.json() };
    }

    return {
      ok: false,
      status: response.status,
      body: await response.text(),
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

