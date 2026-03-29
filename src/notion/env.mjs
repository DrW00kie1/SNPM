import { execFileSync } from "node:child_process";

export function getEnvToken(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }

  for (const name of names) {
    const value = execFileSync(
      "powershell",
      ["-NoProfile", "-Command", `[Environment]::GetEnvironmentVariable('${name}','User')`],
      { encoding: "utf8" },
    ).trim();
    if (value) return value;
  }

  return "";
}

export function getWorkspaceToken() {
  const token = getEnvToken(["NOTION_TOKEN", "INFRASTRUCTURE_HQ_NOTION_TOKEN"]);
  if (!token) {
    throw new Error("Set NOTION_TOKEN or INFRASTRUCTURE_HQ_NOTION_TOKEN before using SNPM.");
  }
  return token;
}

export function getProjectToken(envName) {
  const token = getEnvToken([envName]);
  if (!token) {
    throw new Error(`Set ${envName} before running project-token scope verification.`);
  }
  return token;
}

export function deriveProjectTokenEnv(projectName) {
  return `${projectName.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase()}_NOTION_TOKEN`;
}

export function nowTimestamp() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.month}-${values.day}-${values.year} ${values.hour}:${values.minute}:${values.second}`;
}

