import { readFileSync, writeFileSync } from "node:fs";

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
  if (filePath !== "-") {
    return readFileSyncImpl(filePath, "utf8");
  }

  return readStreamText(stdin);
}

export function writeCommandOutput(
  outputPath,
  bodyText,
  {
    writeFileSyncImpl = writeFileSync,
    stdout = process.stdout,
  } = {},
) {
  if (outputPath !== "-") {
    writeFileSyncImpl(outputPath, bodyText, "utf8");
    return {
      outputPath,
      wroteToStdout: false,
    };
  }

  stdout.write(bodyText);
  return {
    outputPath,
    wroteToStdout: true,
  };
}

export function resolveCommandMetadataPath(outputPath, metadataPath) {
  if (typeof metadataPath === "string" && metadataPath.trim() !== "") {
    return metadataPath;
  }

  if (outputPath === "-") {
    throw new Error("Provide an explicit metadata path when command input or output uses stdin/stdout.");
  }

  if (typeof outputPath !== "string" || outputPath.trim() === "") {
    throw new Error("Provide an output path to derive the metadata sidecar path.");
  }

  return `${outputPath}.snpm-meta.json`;
}

export function writeCommandMetadataSidecar(
  outputPath,
  metadata,
  {
    metadataPath,
    writeFileSyncImpl = writeFileSync,
  } = {},
) {
  const resolvedMetadataPath = resolveCommandMetadataPath(outputPath, metadataPath);
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
  } = {},
) {
  const resolvedMetadataPath = resolveCommandMetadataPath(inputPath, metadataPath);
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
