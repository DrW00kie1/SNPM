# Notion CLI Interop Boundary

The official Notion CLI (`ntn`) is a useful low-level Notion tool. SNPM remains the approved-surface control plane for Infrastructure HQ project operations.

Use this boundary when deciding whether a coding agent should use SNPM or `ntn` directly.

## Roles

SNPM owns project-safe workflow:

- approved project surfaces and command-family ownership
- project-token-aware execution through explicit `--project-token-env`
- path-based targeting instead of raw page-id mutation
- pull metadata, stale-write refusal, mutation budgets, and redacted mutation journals
- Access secret consume-only and write-only workflows
- `discover`, `recommend`, `plan-change`, `doctor`, truth-audit, and consistency-audit guidance

`ntn` owns official low-level Notion access:

- local operator authentication and workspace targeting
- direct Notion API requests through `ntn api`
- page Markdown get/create/update commands
- data source, file, worker, and diagnostic utilities

The existence of `ntn` does not make SNPM a generic Notion wrapper. Treat `ntn` as an optional future provider under SNPM policy, not as a replacement for SNPM's safety model.

## Safe Direct Use

Direct `ntn` use is appropriate for:

- learning the official API surface
- checking whether the CLI is installed and healthy
- manual operator investigation outside an SNPM-managed mutation path
- future SNPM implementation spikes that call `ntn` behind SNPM's existing policy checks

When using `ntn` for investigation, keep output out of commits and avoid capturing verbose request or response data in task memory.

## Do Not Bypass SNPM

Do not use `ntn` directly for SNPM-managed live mutations unless an approved plan explicitly says to do so.

Avoid these patterns:

- `ntn pages update` or `ntn pages trash` against project pages that SNPM manages
- raw Notion page IDs as an operator shortcut around SNPM page paths
- `ntn --unsafe-verbose` in agent workflows, logs, captured output, tests, or docs
- `ntn login` keychain workspace auth as a way to bypass SNPM project-token boundaries
- copying Notion page IDs, workspace IDs, `ntn` auth state, or SNPM private workspace config into consumer repos

The risk is not that `ntn` is unsafe. The risk is that direct low-level commands skip SNPM's approved-surface routing, stale-write checks, journals, secret redaction, and recovery guidance.

## Authentication Boundary

SNPM's live project commands should continue to use explicit integration tokens such as:

```powershell
npm run doctor -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

The official CLI can use local keychain auth or `NOTION_API_TOKEN`, but those mechanisms are broader than SNPM's project-token convention unless a future implementation deliberately maps them into the same policy boundary.

If SNPM later invokes `ntn` internally, the integration must:

- use `shell:false` child execution
- pass only the intended token or auth context
- avoid `--unsafe-verbose`
- preserve SNPM stale-write checks and operation policy
- redact child output and errors before returning them to the user

## Current Interop Status

Current shipped interop scope is N0/N1:

- document the SNPM-vs-`ntn` boundary
- install and detect the local `ntn` binary
- add a read-only `doctor --notion-cli` probe

Out of scope for N0/N1:

- replacing SNPM's Notion transport
- invoking `ntn api` from product commands
- changing mutation behavior
- adding direct page-id workflows
- using `ntn` authentication to replace project-token-scoped SNPM commands

## N2 Read-Only API Adapter Evaluation

N2 evaluates `ntn api` as an internal read-only provider only. It is not a transport replacement and it is not a new operator mutation path.

The intended N2 shape is:

- keep SNPM's existing fetch transport as the default production transport
- add an internal `ntn api` adapter behind SNPM policy for read-only experiments
- add a project-scoped advisory probe, such as `doctor --notion-cli-api`, that can validate one SNPM-resolved target through `ntn api`
- pass an explicit SNPM project token to the child process, rather than relying on broad keychain workspace auth
- return only operational probe metadata, never raw API bodies or page content

N2 must not:

- run `ntn login`
- use `ntn` keychain auth to bypass `--project-token-env`
- run `ntn pages update`, `ntn pages trash`, or any mutation command
- expose raw page IDs as operator targets
- use `ntn --verbose` or `ntn --unsafe-verbose` in product commands, tests, logs, or docs
- weaken stale-write protection, mutation journals, Access secret safety, structured-error redaction, or command-family ownership

Any `ntn api` adapter should reject write/destructive methods before child spawn. Read failures may carry operation-policy metadata, but they should not create retry loops or change existing mutation semantics.

## Future Evaluation Path

Evaluate deeper `ntn` adoption in this order:

1. Add an optional read-only probe that reports the installed CLI version and warnings.
2. Prototype an explicit read-only `ntn api` adapter behind SNPM's existing client interface.
3. Compare `ntn pages get/update` Markdown round trips against SNPM-managed page requirements.
4. Adopt only the pieces that preserve approved-surface routing, stale-write protection, Access secret safety, redacted output, and mutation journaling.
5. Delete SNPM internals only after parity and rollback plans are proven.

The default assumption is conservative: SNPM may use `ntn` where it reduces low-level maintenance cost, but SNPM remains the policy layer that makes Notion safe for repeated coding-agent use.

## References

- [Notion CLI overview](https://developers.notion.com/cli/get-started/overview)
- [Notion CLI installation](https://developers.notion.com/cli/get-started/installation)
- [Notion CLI authentication](https://developers.notion.com/cli/get-started/authentication)
- [Notion CLI API requests](https://developers.notion.com/cli/guides/api-requests)
- [Notion CLI command reference](https://developers.notion.com/cli/reference/commands)
