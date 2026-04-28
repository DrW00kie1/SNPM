#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const checks = [
  { label: "full test suite", command: "npm", args: ["test"] },
  { label: "package contract tests", command: "npm", args: ["run", "test:package-contract"] },
  { label: "release audit", command: "node", args: ["scripts/release-audit.mjs"] },
  { label: "package dry run", command: "npm", args: ["pack", "--dry-run", "--json", "--ignore-scripts"] },
  { label: "CLI help smoke", command: "node", args: ["src/cli.mjs", "--help"] },
  { label: "capabilities smoke", command: "npm", args: ["run", "capabilities"] },
  { label: "discover smoke", command: "npm", args: ["run", "discover", "--", "--project", "SNPM"] },
];

function quoteWindowsArg(value) {
  const text = String(value);
  if (text === "") {
    return '""';
  }

  return /[\s"&()^|<>]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function runCheck({ label, command, args }) {
  console.error(`\n[release-check] ${label}`);

  const isNpmOnWindows = process.platform === "win32" && command === "npm";
  const spawnCommand = isNpmOnWindows ? process.env.ComSpec || "cmd.exe" : command;
  const spawnArgs = isNpmOnWindows
    ? ["/d", "/s", "/c", ["npm", ...args].map(quoteWindowsArg).join(" ")]
    : args;

  const result = spawnSync(spawnCommand, spawnArgs, {
    stdio: "inherit",
    windowsHide: true,
  });

  if (result.error) {
    console.error(`[release-check] ${label} failed to start ${spawnCommand}: ${result.error.message}`);
    return 1;
  }

  if (result.signal) {
    console.error(`[release-check] ${label} terminated by signal: ${result.signal}`);
    return 1;
  }

  return result.status ?? 1;
}

for (const check of checks) {
  const status = runCheck(check);
  if (status !== 0) {
    process.exit(status);
  }
}
