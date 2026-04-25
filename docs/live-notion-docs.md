# Live Notion Doc Updates

The curated managed-doc surface is now supported on `main` for selected root, template, and workspace-global docs.

## Curated Workspace-Global Docs

Exact managed pages:
- `Infrastructure HQ Home`
  - id: `3319f5f6-66d0-805b-8ad5-f358f6a1b494`
- `Projects`
  - id: `3319f5f6-66d0-81ab-b6e8-c4fe3e2047be`
- `Templates`
  - id: `3319f5f6-66d0-811b-ac7f-d7a8bb77d99e`
- `Runbooks > Notion Workspace Workflow`
  - id: `3319f5f6-66d0-81d3-b81c-dc0109d3d796`
- `Runbooks > Notion Project Token Setup`
  - id: `3319f5f6-66d0-8182-b7c3-f18396ab199b`

Curated subtree root:
- `Templates > Project Templates`
  - id: `3319f5f6-66d0-817a-8d71-d6c194ea4bb8`

## Project Doc Surface

Project-scoped managed docs include:
- `Root`
- `Root > ...` under non-reserved top-level names

Planning pages remain on the fixed planning surface:
- `Planning > Roadmap`
- `Planning > Current Cycle`
- `Planning > Backlog`
- `Planning > Decision Log`

Starter scaffolding follows that split:
- `Root > Overview` and `Root > Operating Model` are managed-doc drafts
- `Planning > Roadmap` and `Planning > Current Cycle` are planning-page drafts

## Reserved Roots

These stay out of `doc-*`:
- `Ops`
- `Planning`
- `Access`
- `Vendors`
- `Runbooks`
- `Incidents`

Use the owning surface instead:
- `page-*` for planning pages
- `runbook-*` for runbooks
- `access-domain-*`, `secret-record-*`, and `access-token-*` for Access

## Safe Update Rule

Use `doc-*` only after the target is inside the curated family.
Use the curated doc surface for operator and workflow documentation, not for fast-changing implementation notes or design work. Those stay repo-first.

Use `scaffold-docs` as a preview-first step. It writes local draft files only with `--output-dir`, never mutates Notion directly, and stays constrained to approved project-doc and planning-page starter targets.

Safe examples:

```powershell
npm run doc-pull -- --project "SNPM" --path "Root" --output root.md --project-token-env SNPM_NOTION_TOKEN
npm run doc-pull -- --project "SNPM" --path "Root > Overview" --output overview.md --project-token-env SNPM_NOTION_TOKEN
npm run doc-pull -- --path "Templates > Project Templates" --output project-templates.md
npm run doc-pull -- --path "Runbooks > Notion Workspace Workflow" --output workspace-workflow.md
```

Guard examples:

```powershell
npm run doc-pull -- --project "SNPM" --path "Runbooks > SNPM Operator Validation Runbook"
npm run doc-pull -- --project "SNPM" --path "Access > App & Backend"
```

Expected failures:
- runbooks stay on `runbook-*`
- Access stays on `access-*`

## Managed-Doc Behavior

SNPM manages only the body content below the standard divider:
- preserves header content above `---`
- rewrites `Canonical Source`
- rewrites `Last Updated`
- keeps markdown EOF handling stable

For low-ceremony edits on supported operational surfaces, prefer the editor-backed commands:
- `page-edit`
- `runbook-edit`
- `doc-edit`
- `access-domain-edit`

Use `--explain` when you need the auth-mode, target-resolution, child-page, and normalization reasoning before apply.
Use `--review-output <dir>` when you need review artifacts without making the repo the source of truth.
For `secret-record-*` and `access-token-*`, raw local export and local markdown edit/diff/push are unsupported. Use `secret-record-exec` or `access-token-exec` for runtime consumption; pulls are redacted-only and do not create push-ready sidecars. Use `secret-record-generate` or `access-token-generate` when an agent must create or rotate a credential value and store it directly in Notion without putting the value in chat, local files, sidecars, diffs, review artifacts, or journals.

If `doc-adopt` finds no managed divider, it wraps the current full page body under a new managed-doc header.

## Starter Doc Scaffolding

Use starter scaffolding after project bootstrap when the project needs initial docs:

```powershell
npm run scaffold-docs -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run scaffold-docs -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN --output-dir .snpm-scaffold
```

Default preview mode makes no Notion changes and writes no files. Use `--output-dir` only when you want local draft markdown files, `scaffold-plan.json`, and planning-page sidecars for the generated follow-up commands.

Starter targets remain aligned to the owning surface:
- `project-doc` for project managed docs
- `planning-page` for planning pages

After publishing generated starter content through the owning `doc-*` or `page-*` command family, run `verify-project` and `doctor` for the project. Run `verify-workspace-docs` only if curated workspace-global or template docs were changed.

## Access Secret Ingestion Updates

Write-only generated secret ingestion uses the Access command family, not `doc-*` or manifest v2:

```powershell
npm run secret-record-generate -- --project "SNPM" --domain "App & Backend" --title "DATABASE_URL" --mode create --project-token-env SNPM_NOTION_TOKEN --apply -- node scripts/generate-dsn.mjs
npm run access-token-generate -- --project "SNPM" --domain "App & Backend" --title "Project Token" --mode update --project-token-env SNPM_NOTION_TOKEN --apply -- node scripts/rotate-project-token.mjs
```

Preview mode omits `--apply` and must not run the generator. Applied mode runs one child generator command, captures one stdout value in memory, stores it in Notion, and suppresses/redacts child output. The generated value must not appear in terminal output, markdown files, metadata sidecars, review artifacts, mutation journals, or durable summary text.

Durable Notion closeout summary for this sprint:

> SNPM now separates secret handling into two safe lanes. Runtime use remains consume-only through `secret-record-exec` and `access-token-exec`. Agent-generated credential creation and rotation use write-only `secret-record-generate` and `access-token-generate`, which run a child generator only under `--apply`, store the generated stdout value directly in the Access record, and keep raw values out of chat, local files, sidecars, diffs, review artifacts, and journals. Raw local export and secret-bearing local edit/diff/push remain unsupported.

Closeout targets: update `Projects > SNPM > Planning > Decision Log` with the decision, `Runbooks > Notion Workspace Workflow` with the operator workflow, and `Projects > SNPM` only if the public command summary is maintained there.

## Manifest V2 Doc Bundle Updates

Use manifest v2 for mixed approved documentation bundles only. Keep validation-session v1 artifact sync separate.

Supported Sprint 3.3B operator behavior:
- default `sync check`, `sync pull`, and `sync push` cover the whole manifest
- `--entry <selector>` and `--entries-file <path>` narrow check, pull, or push to selected entries
- `sync push --review-output <dir>` writes preview review artifacts without mutating Notion
- `sync push --apply` requires v2 sidecars and allows at most one changed entry by default
- broader applies require `--max-mutations <n>` or `--max-mutations all`
- `sync push --apply --refresh-sidecars` refreshes sidecars only for selected entries that applied successfully
- structured recovery diagnostics appear in result/review metadata for v2 check and push, and result metadata for v2 pull, with stable codes, severity, entry/target context, safe next command, and recovery action

Manifest v2 diagnostics are recovery metadata only. Manifest v2 remains out of scope for create/adopt, Access/build-record entries, rollback, auto-merge, automatic retries, arbitrary CRUD, semantic consistency checks, generic transaction semantics, and generic batch apply.

## Consistency Audit Updates

Use the consistency audit after the project structure verifies and before coordinated planning/runbook/access documentation edits:

```powershell
npm run consistency-audit -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run doctor -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN --consistency-audit
```

`doctor --consistency-audit` is an advisory read-only doctor extension. It reports explicit cross-document contradictions across approved project surfaces, such as Roadmap/Current Cycle active-marker mismatches, explicit runbook references that do not resolve to a runbook page, and explicit Access references that do not resolve in structural Access inventory.

The audit does not mutate Notion, write local files, write sidecars, append mutation journal entries, apply manifests, inspect raw Access secret/token bodies, generate fixes, change default `doctor` output, change top-level `ok` or exit behavior, or make findings blocking. Treat findings as review input, then use the owning `page-*`, `runbook-*`, `access-domain-*`, `secret-record-*`, or `access-token-*` family for any approved remediation.

Durable Notion closeout targets for this sprint:
- `Projects > SNPM > Planning > Decision Log`
- `Projects > SNPM > Planning > Roadmap`
- `Projects > SNPM > Planning > Current Cycle`
- `Runbooks > Notion Workspace Workflow`

## Verification

Project-scoped verification:

```powershell
npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run doctor -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run doctor -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN --truth-audit
npm run consistency-audit -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN
```

Use `doctor --truth-audit` when the project structure verifies but the durable Notion truth may need attention. The audit is read-only and reports stale `Last Updated` headers, placeholder or empty important surfaces, and roadmap/current-cycle freshness concerns. It does not mutate Notion, refresh sidecars, apply manifest entries, export raw Access values, or perform semantic cross-document consistency checks.

Use `doctor --consistency-audit` when the project structure verifies but approved project docs may contradict one another. The audit is read-only and reports explicit contradictions only; it does not inspect raw Access secret/token bodies and it does not change default doctor or blocking behavior.

Address audit findings through the owning command family:
- `doc-*` for curated project, template, and workspace docs
- `page-*` for `Planning > Roadmap` and `Planning > Current Cycle`
- `runbook-*` for runbooks
- Access remains on `access-domain-*`, `secret-record-*`, and `access-token-*`, with secret/token records using consume-only runtime access plus write-only generated ingestion

Workspace/template verification:

```powershell
npm run verify-workspace-docs
```

Use `verify-workspace-docs` after any live mutation to curated workspace-global or template docs.

## Release Alignment Rule

When the supported SNPM surface changes, include these curated live docs in the same promotion pass:
- `Projects > SNPM`
- `Infrastructure HQ Home`
- `Projects`
- `Templates`
- `Templates > Project Templates`
- `Runbooks > Notion Workspace Workflow`
- `Runbooks > Notion Project Token Setup`

This keeps the repo and the curated live docs from drifting apart.
