import test from "node:test";
import assert from "node:assert/strict";

import {
  MANIFEST_V2_CHECK_DIAGNOSTIC_CODES,
  MANIFEST_V2_PULL_DIAGNOSTIC_CODES,
  MANIFEST_V2_PUSH_DIAGNOSTIC_CODES,
  buildManifestV2CheckRemoteFailureDiagnostic,
  buildManifestV2LocalFileFailureDiagnostic,
  buildManifestV2PreflightFailureDiagnostic,
  buildManifestV2PushDiagnostic,
  buildManifestV2PushFailureDiagnostic,
  buildManifestV2PullCollisionDiagnostic,
  buildManifestV2PullRemoteFailureDiagnostic,
  buildManifestV2PullWriteFailureDiagnostic,
  buildManifestV2ReviewOutputFailureDiagnostic,
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
  assert.equal(diagnostic.command, "sync-push");
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

test("manifest v2 check remote diagnostics expose stable recovery metadata", () => {
  const diagnostic = buildManifestV2CheckRemoteFailureDiagnostic({
    entry: {
      kind: "planning-page",
      pagePath: "Planning > Roadmap",
      file: "planning/roadmap.md",
    },
    error: new Error("Notion target could not be read."),
    targetPath: "Projects > SNPM > Planning > Roadmap",
  });

  assert.deepEqual(diagnostic, {
    code: MANIFEST_V2_CHECK_DIAGNOSTIC_CODES.REMOTE_FAILED,
    severity: "error",
    message: "Notion target could not be read.",
    command: "sync-check",
    entry: {
      kind: "planning-page",
      target: "Planning > Roadmap",
      file: "planning/roadmap.md",
    },
    targetPath: "Projects > SNPM > Planning > Roadmap",
    safeNextCommand: "sync check",
    recoveryAction: "Verify the remote Notion target is readable before rerunning sync check.",
    state: {
      phase: "remote-read",
    },
  });
});

test("manifest v2 pull remote diagnostics expose stable recovery metadata", () => {
  const diagnostic = buildManifestV2PullRemoteFailureDiagnostic({
    descriptor: {
      entry: {
        kind: "runbook",
        title: "Release Smoke Test",
        file: "runbooks/release-smoke-test.md",
      },
      metadataPath: "C:\\repo\\runbooks\\release-smoke-test.md.snpm-meta.json",
    },
    error: "Remote Notion page lookup failed.",
  });

  assert.equal(diagnostic.code, MANIFEST_V2_PULL_DIAGNOSTIC_CODES.REMOTE_FAILED);
  assert.equal(diagnostic.command, "sync-pull");
  assert.equal(diagnostic.safeNextCommand, "sync check");
  assert.match(diagnostic.recoveryAction, /remote Notion target/);
  assert.deepEqual(diagnostic.entry, {
    kind: "runbook",
    target: "Release Smoke Test",
    file: "runbooks/release-smoke-test.md",
    metadataPath: "C:\\repo\\runbooks\\release-smoke-test.md.snpm-meta.json",
  });
  assert.deepEqual(diagnostic.state, {
    phase: "remote-read",
  });
});

test("manifest v2 pull collision and write diagnostics distinguish recovery paths", () => {
  const collision = buildManifestV2PullCollisionDiagnostic({
    entry: {
      kind: "project-doc",
      docPath: "Projects > SNPM",
      file: "docs/project.md",
    },
    message: "Output/sidecar path collision at docs/project.md.",
  });
  const write = buildManifestV2PullWriteFailureDiagnostic({
    descriptor: {
      entry: {
        kind: "project-doc",
        docPath: "Projects > SNPM",
        file: "docs/project.md",
      },
      metadataPath: "C:\\repo\\docs\\project.md.snpm-meta.json",
    },
    error: new Error("EACCES: permission denied"),
    partialWrites: ["C:\\repo\\docs\\project.md"],
  });

  assert.equal(collision.code, MANIFEST_V2_PULL_DIAGNOSTIC_CODES.PATH_COLLISION);
  assert.equal(collision.safeNextCommand, "sync check");
  assert.match(collision.recoveryAction, /paths/);
  assert.equal(collision.state.phase, "path-collision");

  assert.equal(write.code, MANIFEST_V2_PULL_DIAGNOSTIC_CODES.WRITE_FAILED);
  assert.equal(write.safeNextCommand, "sync pull --apply");
  assert.match(write.recoveryAction, /Partial local writes/);
  assert.deepEqual(write.state, {
    phase: "write",
    partialWrites: ["C:\\repo\\docs\\project.md"],
  });
});

test("manifest v2 local file, review-output, and preflight helpers select command-specific codes", () => {
  const local = buildManifestV2LocalFileFailureDiagnostic({
    command: "sync-pull",
    entry: {
      kind: "validation-session",
      title: "Release Smoke Test",
      file: "validation/release-smoke-test.md",
    },
    error: new Error("EISDIR: illegal operation on a directory"),
  });
  const review = buildManifestV2ReviewOutputFailureDiagnostic({
    command: "sync-check",
    error: new Error("EACCES: review output is not writable"),
  });
  const pushReview = buildManifestV2ReviewOutputFailureDiagnostic({
    command: "sync-push",
    error: new Error("EACCES: push review output is not writable"),
  });
  const preflight = buildManifestV2PreflightFailureDiagnostic({
    command: "sync-pull",
    error: new Error("Unsupported manifest v2 sync pull kind."),
  });

  assert.equal(local.code, MANIFEST_V2_PULL_DIAGNOSTIC_CODES.LOCAL_FILE_FAILED);
  assert.equal(local.command, "sync-pull");
  assert.equal(local.safeNextCommand, "sync pull");
  assert.equal(local.state.phase, "local-file");

  assert.equal(review.code, MANIFEST_V2_CHECK_DIAGNOSTIC_CODES.REVIEW_OUTPUT_FAILED);
  assert.equal(review.safeNextCommand, "sync check --review-output <dir>");
  assert.equal(review.state.phase, "review-output");
  assert.equal(pushReview.code, MANIFEST_V2_PUSH_DIAGNOSTIC_CODES.REVIEW_OUTPUT_FAILED);
  assert.equal(pushReview.safeNextCommand, "sync push --review-output <dir>");

  assert.equal(preflight.code, MANIFEST_V2_PULL_DIAGNOSTIC_CODES.PREFLIGHT_FAILED);
  assert.equal(preflight.safeNextCommand, "sync check");
  assert.equal(preflight.state.phase, "preflight");
});

test("manifest v2 diagnostics redact sensitive message and state values", () => {
  const diagnostic = buildManifestV2CheckRemoteFailureDiagnostic({
    entry: {
      kind: "workspace-doc",
      docPath: "Runbooks > Notion Workspace Workflow",
      file: "docs/workflow.md",
    },
    error: new Error("Request failed with token=ntn_secret_message and password=hunter2."),
    state: {
      token: "ntn_secret_state",
      nested: {
        secret: "secret=plain-value",
        retained: "safe operational context",
      },
    },
  });
  const serialized = JSON.stringify(diagnostic);

  assert.equal(serialized.includes("ntn_secret"), false);
  assert.equal(serialized.includes("hunter2"), false);
  assert.equal(serialized.includes("plain-value"), false);
  assert.match(diagnostic.message, /token: \[redacted\]/);
  assert.equal(diagnostic.state.nested.retained, "safe operational context");
});
