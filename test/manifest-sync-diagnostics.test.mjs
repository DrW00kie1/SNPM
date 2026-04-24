import test from "node:test";
import assert from "node:assert/strict";

import {
  MANIFEST_V2_PUSH_DIAGNOSTIC_CODES,
  buildManifestV2PushDiagnostic,
  buildManifestV2PushFailureDiagnostic,
} from "../src/notion/manifest-sync-diagnostics.mjs";

test("manifest v2 push diagnostics include stable recovery fields and entry context", () => {
  const descriptor = {
    entry: {
      kind: "planning-page",
      target: "Planning > Roadmap",
      file: "planning/roadmap.md",
    },
    metadataPath: "C:\\repo\\planning\\roadmap.md.snpm-meta.json",
  };

  const diagnostic = buildManifestV2PushFailureDiagnostic({
    descriptor,
    error: new Error('Metadata sidecar "C:\\repo\\planning\\roadmap.md.snpm-meta.json" is not valid JSON.'),
    state: {
      phase: "apply-preflight",
      ignored: undefined,
      hook: () => "must not serialize",
    },
  });

  assert.equal(diagnostic.code, MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.SIDECAR_MALFORMED);
  assert.equal(diagnostic.severity, "error");
  assert.equal(diagnostic.safeNextCommand, "sync pull --apply");
  assert.match(diagnostic.recoveryAction, /Regenerate/);
  assert.deepEqual(diagnostic.entry, {
    kind: "planning-page",
    target: "Planning > Roadmap",
    file: "planning/roadmap.md",
    metadataPath: "C:\\repo\\planning\\roadmap.md.snpm-meta.json",
  });
  assert.deepEqual(diagnostic.state, {
    phase: "apply-preflight",
  });
});

test("manifest v2 push diagnostics reject empty codes", () => {
  assert.throws(
    () => buildManifestV2PushDiagnostic({ code: "", message: "Missing code." }),
    /diagnostic code/,
  );
});
