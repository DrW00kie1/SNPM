import { readFileSync, writeFileSync } from "node:fs";

import {
  validateLocalInputFilePath,
  validateLocalMetadataPath,
  validateLocalOutputFilePath,
} from "../validators.mjs";

function readStreamText(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    if (typeof stream.setEncoding === "function") {
      stream.setEncoding("utf8");
    }

    stream.on("data", (chunk) => {
      chunks.push(chunk);
    });
    stream.on("end", () => {
      resolve(chunks.join(""));
    });
    stream.on("error", reject);
  });
}

export async function readCommandInput(
  filePath,
  {
    readFileSyncImpl = readFileSync,
    stdin = process.stdin,
  } = {},
) {
  const inputPath = validateLocalInputFilePath(filePath, {
    allowDash: true,
    label: "input file path",
  });
  if (inputPath !== "-") {
    return readFileSyncImpl(inputPath, "utf8");
  }

  return readStreamText(stdin);
}

export function writeCommandOutput(
  outputPath,
  bodyText,
  {
    writeFileSyncImpl = writeFileSync,
    stdout = process.stdout,
    statSyncImpl,
  } = {},
) {
  const resolvedOutputPath = validateLocalOutputFilePath(outputPath, {
    allowDash: true,
    label: "output file path",
    ...(statSyncImpl ? { statSyncImpl } : {}),
  });
  if (resolvedOutputPath !== "-") {
    writeFileSyncImpl(resolvedOutputPath, bodyText, "utf8");
    return {
      outputPath: resolvedOutputPath,
      wroteToStdout: false,
    };
  }

  stdout.write(bodyText);
  return {
    outputPath: resolvedOutputPath,
    wroteToStdout: true,
  };
}

export function resolveCommandMetadataPath(outputPath, metadataPath, {
  statSyncImpl,
} = {}) {
  if (typeof metadataPath === "string" && metadataPath.trim() !== "") {
    return validateLocalMetadataPath(metadataPath, {
      label: "metadata path",
      ...(statSyncImpl ? { statSyncImpl } : {}),
    });
  }

  if (outputPath === "-") {
    throw new Error("Provide an explicit metadata path when command input or output uses stdin/stdout.");
  }

  const resolvedOutputPath = validateLocalOutputFilePath(outputPath, {
    allowDash: false,
    label: "output path",
    ...(statSyncImpl ? { statSyncImpl } : {}),
  });

  return validateLocalMetadataPath(`${resolvedOutputPath}.snpm-meta.json`, {
    label: "metadata sidecar path",
    ...(statSyncImpl ? { statSyncImpl } : {}),
  });
}

export function writeCommandMetadataSidecar(
  outputPath,
  metadata,
  {
    metadataPath,
    writeFileSyncImpl = writeFileSync,
    statSyncImpl,
  } = {},
) {
  const resolvedMetadataPath = resolveCommandMetadataPath(outputPath, metadataPath, {
    ...(statSyncImpl ? { statSyncImpl } : {}),
  });
  writeFileSyncImpl(resolvedMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  return {
    metadataPath: resolvedMetadataPath,
  };
}

export function readCommandMetadataSidecar(
  inputPath,
  {
    metadataPath,
    readFileSyncImpl = readFileSync,
    statSyncImpl,
  } = {},
) {
  const resolvedMetadataPath = resolveCommandMetadataPath(inputPath, metadataPath, {
    ...(statSyncImpl ? { statSyncImpl } : {}),
  });
  let rawMetadata;

  try {
    rawMetadata = readFileSyncImpl(resolvedMetadataPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read metadata sidecar "${resolvedMetadataPath}": ${error.message}`);
  }

  try {
    return {
      metadataPath: resolvedMetadataPath,
      metadata: JSON.parse(rawMetadata),
    };
  } catch (error) {
    throw new Error(`Metadata sidecar "${resolvedMetadataPath}" is not valid JSON: ${error.message}`);
  }
}
