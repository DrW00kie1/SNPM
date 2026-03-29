export class NotionApiError extends Error {
  constructor(message, { method, apiPath, status, code, body, details } = {}) {
    super(message);
    this.name = "NotionApiError";
    this.method = method;
    this.apiPath = apiPath;
    this.status = status;
    this.code = code || null;
    this.body = body || "";
    this.details = details || null;
  }
}

function toMessage(method, apiPath, status, code, message) {
  const suffix = code ? `${code} ${message}` : message;
  return `${method} ${apiPath} failed: ${status} ${suffix}`.trim();
}

export async function parseNotionError(method, apiPath, response) {
  const body = await response.text();

  let parsed = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }

  const code = parsed?.code || null;
  const message = parsed?.message || body || response.statusText || "Unknown Notion API error.";

  return new NotionApiError(toMessage(method, apiPath, response.status, code, message), {
    method,
    apiPath,
    status: response.status,
    code,
    body,
    details: parsed,
  });
}
