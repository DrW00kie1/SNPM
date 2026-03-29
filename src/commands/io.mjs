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
