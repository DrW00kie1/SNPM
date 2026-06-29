import {
  NotionApiError,
  NotionParseError,
  NotionTransportError,
  serializeSafeNotionError,
} from "../notion/errors.mjs";
import { DEFAULT_ERROR_FORMAT } from "./arguments.mjs";
import { writeStructuredOutput } from "./output.mjs";

function isSensitiveErrorText(message) {
  return /(?:bearer\s+[a-z0-9._-]+|ntn_[a-z0-9_]+|postgres(?:ql)?:\/\/\S+|(?:secret|token|password|api[_-]?key)\s*=\s*\S+|stdout:|stderr:|stack:)/i.test(String(message || ""));
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (!message) {
    return "Unexpected error.";
  }
  return isSensitiveErrorText(message) ? "Unexpected error." : message;
}

function errorCodeFromMessage(message) {
  if (/^Unknown command:/i.test(message)) {
    return "unknown_command";
  }
  if (/^Missing value for --/i.test(message)) {
    return "missing_option_value";
  }
  if (/^Provide --/i.test(message) || /^Provide a /i.test(message)) {
    return "missing_required_option";
  }
  if (/--error-format/i.test(message)) {
    return "invalid_error_format";
  }
  if (/workspace/i.test(message)) {
    return "invalid_workspace";
  }
  if (/project-token-env/i.test(message)) {
    return "invalid_project_token_env";
  }
  if (/\bcwd\b|working directory/i.test(message)) {
    return "invalid_cwd";
  }
  if (/metadata/i.test(message)) {
    return "metadata_error";
  }
  if (/manifest/i.test(message)) {
    return "manifest_error";
  }
  if (/literal -- child-command delimiter|child command|passthrough/i.test(message)) {
    return "invalid_child_command";
  }
  return "cli_error";
}

function errorCategoryFromCode(code) {
  if (code === "unknown_command" || code.startsWith("missing_") || code.startsWith("invalid_")) {
    return "usage";
  }
  if (code === "metadata_error" || code === "manifest_error") {
    return "preflight";
  }
  return "runtime";
}

export function cliErrorPayload(error, { command = null } = {}) {
  if (
    error instanceof NotionApiError
    || error instanceof NotionTransportError
    || error instanceof NotionParseError
    || ["NotionApiError", "NotionTransportError", "NotionParseError"].includes(error?.name)
  ) {
    const safeError = serializeSafeNotionError(error);
    const categoryByKind = {
      api: "notion-api",
      parse: "notion-parse",
      transport: "notion-transport",
    };

    return {
      ok: false,
      schemaVersion: 1,
      command,
      error: {
        code: safeError.code || safeError.kind || "notion_error",
        category: categoryByKind[safeError.kind] || "notion",
        message: safeError.message,
        ...(safeError.retryable !== undefined ? { retryable: safeError.retryable } : {}),
        details: Object.fromEntries(
          Object.entries(safeError).filter(([key]) => !["message", "name"].includes(key)),
        ),
      },
    };
  }

  const message = safeErrorMessage(error);
  const code = errorCodeFromMessage(message);
  return {
    ok: false,
    schemaVersion: 1,
    command,
    error: {
      code,
      category: errorCategoryFromCode(code),
      message,
    },
  };
}

export function writeTopLevelError(error, { command = null, errorFormat = DEFAULT_ERROR_FORMAT } = {}) {
  if (errorFormat === "json") {
    writeStructuredOutput(cliErrorPayload(error, { command }), { stderr: true });
    return;
  }

  console.error(error instanceof Error ? error.message : String(error));
}
