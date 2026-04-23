import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import {
  readCommandInput,
  readCommandMetadataSidecar,
  resolveCommandMetadataPath,
  writeCommandOutput,
  writeCommandMetadataSidecar,
} from "../src/commands/io.mjs";

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

test("resolveCommandMetadataPath derives the default sidecar path from output", () => {
  assert.equal(resolveCommandMetadataPath("roadmap.md"), "roadmap.md.snpm-meta.json");
});

test("resolveCommandMetadataPath prefers explicit metadata paths", () => {
  assert.equal(
    resolveCommandMetadataPath("roadmap.md", "metadata/roadmap.json"),
    "metadata/roadmap.json",
  );
  assert.equal(resolveCommandMetadataPath("-", "metadata/stdout.json"), "metadata/stdout.json");
});

test("resolveCommandMetadataPath rejects stdout without explicit metadata path", () => {
  assert.throws(
    () => resolveCommandMetadataPath("-"),
    /explicit metadata path/,
  );
});

test("writeCommandMetadataSidecar writes JSON to the default sidecar path", () => {
  const writes = [];
  const metadata = {
    schema: "snpm.page-metadata.v1",
    pageId: "page-1",
  };

  const result = writeCommandMetadataSidecar("roadmap.md", metadata, {
    writeFileSyncImpl: (...args) => writes.push(args),
  });

  assert.equal(result.metadataPath, "roadmap.md.snpm-meta.json");
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], "roadmap.md.snpm-meta.json");
  assert.equal(writes[0][2], "utf8");
  assert.deepEqual(JSON.parse(writes[0][1]), metadata);
});

test("writeCommandMetadataSidecar writes JSON to an explicit sidecar path", () => {
  const writes = [];

  const result = writeCommandMetadataSidecar("roadmap.md", { pageId: "page-1" }, {
    metadataPath: "roadmap.meta.json",
    writeFileSyncImpl: (...args) => writes.push(args),
  });

  assert.equal(result.metadataPath, "roadmap.meta.json");
  assert.equal(writes[0][0], "roadmap.meta.json");
});

test("readCommandMetadataSidecar reads JSON from the default sidecar path", () => {
  const result = readCommandMetadataSidecar("roadmap.md", {
    readFileSyncImpl: (filePath, encoding) => {
      assert.equal(filePath, "roadmap.md.snpm-meta.json");
      assert.equal(encoding, "utf8");
      return '{"schema":"snpm.page-metadata.v1","pageId":"page-1"}';
    },
  });

  assert.deepEqual(result, {
    metadataPath: "roadmap.md.snpm-meta.json",
    metadata: {
      schema: "snpm.page-metadata.v1",
      pageId: "page-1",
    },
  });
});

test("readCommandMetadataSidecar reads JSON from an explicit sidecar path", () => {
  const result = readCommandMetadataSidecar("-", {
    metadataPath: "stdin.meta.json",
    readFileSyncImpl: (filePath) => {
      assert.equal(filePath, "stdin.meta.json");
      return '{"pageId":"page-1"}';
    },
  });

  assert.deepEqual(result.metadata, { pageId: "page-1" });
});

test("readCommandMetadataSidecar requires explicit metadata when markdown comes from stdin", () => {
  assert.throws(
    () => readCommandMetadataSidecar("-"),
    /explicit metadata path/,
  );
});

test("readCommandMetadataSidecar reports missing metadata sidecars clearly", () => {
  assert.throws(
    () => readCommandMetadataSidecar("roadmap.md", {
      readFileSyncImpl: () => {
        throw new Error("ENOENT");
      },
    }),
    /Unable to read metadata sidecar "roadmap\.md\.snpm-meta\.json": ENOENT/,
  );
});

test("readCommandMetadataSidecar reports malformed metadata JSON clearly", () => {
  assert.throws(
    () => readCommandMetadataSidecar("roadmap.md", {
      readFileSyncImpl: () => "{not-json",
    }),
    /not valid JSON/,
  );
});
