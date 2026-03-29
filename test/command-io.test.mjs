import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { readCommandInput, writeCommandOutput } from "../src/commands/io.mjs";

test("readCommandInput reads markdown from a file path", async () => {
  const markdown = await readCommandInput("runbook.md", {
    readFileSyncImpl: (filePath, encoding) => {
      assert.equal(filePath, "runbook.md");
      assert.equal(encoding, "utf8");
      return "## Procedure\n- Step one\n";
    },
  });

  assert.equal(markdown, "## Procedure\n- Step one\n");
});

test("readCommandInput reads markdown from stdin when file path is dash", async () => {
  const markdown = await readCommandInput("-", {
    stdin: Readable.from(["## Procedure\n", "- Step one\n"]),
  });

  assert.equal(markdown, "## Procedure\n- Step one\n");
});

test("writeCommandOutput writes markdown to a file path", () => {
  const writes = [];

  const result = writeCommandOutput("runbook.md", "## Procedure\n- Step one\n", {
    writeFileSyncImpl: (...args) => writes.push(args),
  });

  assert.deepEqual(writes, [["runbook.md", "## Procedure\n- Step one\n", "utf8"]]);
  assert.deepEqual(result, {
    outputPath: "runbook.md",
    wroteToStdout: false,
  });
});

test("writeCommandOutput writes markdown to stdout when output path is dash", () => {
  const chunks = [];

  const result = writeCommandOutput("-", "## Procedure\n- Step one\n", {
    stdout: {
      write(chunk) {
        chunks.push(chunk);
      },
    },
  });

  assert.deepEqual(chunks, ["## Procedure\n- Step one\n"]);
  assert.deepEqual(result, {
    outputPath: "-",
    wroteToStdout: true,
  });
});
