function richTextArray(text) {
  return [{
    type: "text",
    text: { content: text },
  }];
}

function richTextPlainText(richText) {
  return (richText || []).map((item) => item.plain_text || item.text?.content || "").join("").trim();
}

export async function findChildDatabase(parentPageId, title, client) {
  const children = await client.getChildren(parentPageId);
  return children.find((child) => child.type === "child_database" && child.child_database?.title === title) || null;
}

export async function listChildDatabases(parentPageId, client) {
  return (await client.getChildren(parentPageId)).filter((child) => child.type === "child_database");
}

export async function createChildDatabase(parentPageId, {
  title,
  icon,
  properties,
}, client) {
  return client.request("POST", "databases", {
    parent: { type: "page_id", page_id: parentPageId },
    title: richTextArray(title),
    icon,
    initial_data_source: {
      properties,
    },
  });
}

export async function retrieveDatabase(databaseId, client) {
  return client.request("GET", `databases/${databaseId}`);
}

export async function updateDatabase(databaseId, body, client) {
  return client.request("PATCH", `databases/${databaseId}`, body);
}

export function getDatabaseTitle(database) {
  return richTextPlainText(database?.title || []);
}

export function getPrimaryDataSourceId(database) {
  const dataSources = Array.isArray(database?.data_sources) ? database.data_sources : [];
  if (dataSources.length === 0 || !dataSources[0]?.id) {
    throw new Error(`Database "${getDatabaseTitle(database) || database?.id || "unknown"}" is missing a primary data source.`);
  }

  return dataSources[0].id;
}

export async function retrieveDataSource(dataSourceId, client) {
  return client.request("GET", `data_sources/${dataSourceId}`);
}

export async function updateDataSource(dataSourceId, body, client) {
  return client.request("PATCH", `data_sources/${dataSourceId}`, body);
}

export async function queryDataSource(dataSourceId, client, body = {}) {
  const results = [];
  let cursor = null;

  do {
    const response = await client.request("POST", `data_sources/${dataSourceId}/query`, {
      ...body,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    results.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return results;
}

export async function listDataSourceTemplates(dataSourceId, client, { name } = {}) {
  const templates = [];
  let cursor = null;

  do {
    const query = new URLSearchParams();
    query.set("page_size", "100");
    if (name) {
      query.set("name", name);
    }
    if (cursor) {
      query.set("start_cursor", cursor);
    }

    const response = await client.request("GET", `data_sources/${dataSourceId}/templates?${query.toString()}`);
    templates.push(...(response.results || response.templates || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return templates;
}

export async function createPageInDataSource(dataSourceId, {
  properties = {},
  template = null,
  children = undefined,
} = {}, client) {
  return client.request("POST", "pages", {
    parent: {
      type: "data_source_id",
      data_source_id: dataSourceId,
    },
    properties,
    ...(template ? { template } : {}),
    ...(children ? { children } : {}),
  });
}

export function getPageTitleProperty(page, propertyName = "Name") {
  const property = page?.properties?.[propertyName];
  if (!property) {
    return "";
  }

  if (property.type === "title" || Array.isArray(property.title)) {
    return richTextPlainText(property.title);
  }

  return "";
}

export function getRichTextProperty(page, propertyName) {
  const property = page?.properties?.[propertyName];
  if (!property || (!Array.isArray(property.rich_text) && property.type !== "rich_text")) {
    return "";
  }

  return richTextPlainText(property.rich_text);
}

export function getSelectProperty(page, propertyName) {
  const property = page?.properties?.[propertyName];
  if (!property || (!("select" in property) && property.type !== "select")) {
    return "";
  }

  return property.select?.name || "";
}

export function getUrlProperty(page, propertyName) {
  const property = page?.properties?.[propertyName];
  if (!property || (!("url" in property) && property.type !== "url")) {
    return "";
  }

  return property.url || "";
}

export function getDateProperty(page, propertyName) {
  const property = page?.properties?.[propertyName];
  if (!property || (!("date" in property) && property.type !== "date")) {
    return "";
  }

  return property.date?.start || "";
}
