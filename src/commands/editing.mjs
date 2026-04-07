import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function quoteShellArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

export function resolveEditorCommand({
  env = process.env,
  platform = process.platform,
  spawnSyncImpl = spawnSync,
} = {}) {
  if (typeof env.EDITOR === "string" && env.EDITOR.trim()) {
    return env.EDITOR.trim();
  }

  const locatorCommand = platform === "win32" ? "where" : "which";
  const codeCheck = spawnSyncImpl(locatorCommand, ["code"], {
    encoding: "utf8",
  });

  if (!codeCheck.error && codeCheck.status === 0 && (codeCheck.stdout || "").trim()) {
    return "code --wait";
  }

  return platform === "win32" ? "notepad" : "vi";
}

export function openEditorFile(
  filePath,
  {
    editorCommand,
    env = process.env,
    stdio = "inherit",
    spawnSyncImpl = spawnSync,
  } = {},
) {
  const selectedEditor = editorCommand || resolveEditorCommand({ env, spawnSyncImpl });
  const result = spawnSyncImpl(
    `${selectedEditor} ${quoteShellArg(filePath)}`,
    {
      shell: true,
      stdio,
      env,
      encoding: "utf8",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 0) !== 0) {
    throw new Error(`Editor exited with status ${result.status}.`);
  }

  return selectedEditor;
}

export async function runManagedEditLoop({
  apply = false,
  fileLabel,
  pullImpl,
  pushImpl,
  editorCommand,
  openEditorImpl = openEditorFile,
  mkdtempSyncImpl = mkdtempSync,
  writeFileSyncImpl = writeFileSync,
  readFileSyncImpl = readFileSync,
  rmSyncImpl = rmSync,
} = {}) {
  const current = await pullImpl();
  const tempDir = mkdtempSyncImpl(path.join(tmpdir(), "snpm-edit-"));
  const tempPath = path.join(tempDir, fileLabel || "body.md");

  try {
    writeFileSyncImpl(tempPath, current.bodyMarkdown || "", "utf8");
    const selectedEditor = openEditorImpl(tempPath, { editorCommand });
    const editedBodyMarkdown = readFileSyncImpl(tempPath, "utf8");
    const result = await pushImpl({
      apply,
      fileBodyMarkdown: editedBodyMarkdown,
    });

    return {
      ...result,
      editor: selectedEditor,
      editedFilePath: tempPath,
    };
  } finally {
    rmSyncImpl(tempDir, { recursive: true, force: true });
  }
}
