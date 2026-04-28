# Limited JSON Contract Schemas

Sprint 1F stabilizes selected agent-facing JSON contracts. It is a compatibility hardening layer, not a global rewrite of SNPM command outputs.

## Boundary

Covered contracts are intentionally limited to payloads that coding agents or automation are expected to consume directly:
- structured CLI error v1
- discover v1
- capabilities v1 minimal shape
- plan-change v1
- manifest v2 diagnostic, sync-result, and review-output metadata
- managed pull metadata v1
- mutation journal entry v1

Not covered:
- every successful command payload
- human help text
- markdown page bodies
- secret or token raw values
- child-process passthrough output
- Notion API response bodies
- ad hoc debug output or terminal prose

## Compatibility Rules

Schema coverage must preserve existing operator behavior:
- do not change `capabilities.schemaVersion`
- do not move structured CLI errors from stderr to stdout
- do not standardize every success payload into a new envelope
- do not alter command-family ownership or supported Notion surfaces
- do not alter stale-write protection, mutation gates, manifest apply semantics, or mutation journal redaction
- do not add raw local export, local edit, diff, push, sidecars, or review artifacts for secret-bearing Access records

## Contract Notes

Structured CLI error v1 remains an opt-in failure envelope emitted to stderr through `--error-format json` or `SNPM_ERROR_FORMAT=json`. It is reporting metadata only and does not imply retries, rollback, transactions, or changed apply behavior.

Discover v1 and capabilities v1 are discovery contracts for agents. `discover` stays the compact first-contact payload; `capabilities` stays the full registry-derived command map with schema version 1.

Plan-change v1 remains read-only planning output. Manifest draft behavior is preview-only and does not write manifests, local files, sidecars, review artifacts, journals, or Notion content.

Manifest v2 diagnostics and review metadata remain recovery context. They do not add rollback, auto-merge, automatic retries, transaction semantics, semantic consistency gates, or generic batch apply.

Pull metadata v1 and mutation journal entry v1 remain safety metadata. They support stale-write checks and redacted audit trails; they are not page-body schemas and must not contain raw secrets.

## Verification

Docs and tests should prove the limited boundary as much as the schema shape:
- selected contract examples validate against the limited schemas
- command-specific success payloads remain unchanged unless explicitly covered
- stdout/stderr placement remains unchanged
- secret-bearing values remain absent from schema failures, journals, sidecars, and review artifacts
- manifest diagnostics remain recovery metadata only
