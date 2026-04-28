# Live Notion Doc Updates

The curated managed-doc surface is now supported on `main` for selected root, template, and workspace-global docs.

## Curated Workspace-Global Docs

Exact managed pages:
- `Infrastructure HQ Home`
- `Projects`
- `Templates`
- `Runbooks > Notion Workspace Workflow`
- `Runbooks > Notion Project Token Setup`

Curated subtree root:
- `Templates > Project Templates`

Real Notion page ids live in the private local workspace config, not in the public repo.

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

## Plan-Change Manifest Draft Updates

`plan-change --manifest-draft` is a preview-only, read-only bridge from intent planning to manifest v2 review. It may draft entries for `planning-page`, `project-doc`, `template-doc`, `workspace-doc`, and `runbook` targets only. Access records, build records, validation-session artifacts, create/adopt targets, arbitrary page IDs, generic CRUD, and unsupported manifest surfaces remain out of scope.

The planner does not write manifest files, local markdown files, sidecars, review artifacts, mutation journal entries, or Notion content. It also does not run audits as gates, refresh sidecars, mutate Access/build-record surfaces, or apply batch changes. After reviewing the preview, safe next commands are `sync check` or `sync pull`; use `sync push` only later against an operator-reviewed manifest file.

Durable Notion closeout draft for this sprint:
- Decision Log: `plan-change --manifest-draft` is approved as a preview-only/read-only planner integration. It drafts manifest v2 entries for approved existing documentation targets only and deliberately does not write files, sidecars, journals, review artifacts, or Notion content.
- Roadmap: Sprint 6.1A advances Plan-To-Manifest by adding manifest draft planning for `planning-page`, `project-doc`, `template-doc`, `workspace-doc`, and `runbook` targets. Access/build-record entries, validation-session artifacts, create/adopt, arbitrary CRUD, audit gates, and batch apply remain deferred/non-goals.
- Current Cycle: Operators can use `plan-change --manifest-draft` to review a proposed bundle before authoring a manifest and running `sync check` or `sync pull`. Applied mutation remains outside the planner and must use the reviewed manifest v2/owning command-family workflows.
- Runbook: Add the operator flow: run `plan-change --manifest-draft`, inspect supported and rejected targets, manually save or edit the manifest draft if appropriate, then run `sync check` or `sync pull`; do not expect planner file writes or Notion mutation.
- Projects > SNPM: If the public command summary is maintained there, note that plan-change now has a manifest-draft preview mode for approved manifest v2 targets only, with no direct mutation or batch apply behavior.

Closeout targets: update `Projects > SNPM > Planning > Decision Log`, `Projects > SNPM > Planning > Roadmap`, `Projects > SNPM > Planning > Current Cycle`, `Runbooks > Notion Workspace Workflow`, and `Projects > SNPM` only if that page carries the public command summary.

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

## Validation-Bundle Retirement Updates

Sprint 0 retires the browser-driven validation-bundle lane while preserving validation-session API workflows.

Supported operator behavior:
- use `validation-sessions verify --bundle` for workflow-level validation-session checks
- treat the command as API-visible verification plus explicit manual checks for UI-only Notion elements
- keep `validation-session-*` and `validation-sessions-*` as the owning command families for validation-session records and surfaces
- maintain `Active Sessions`, `Quick Intake`, `Validation Session`, and `New Validation Session` manually in Notion when the surrounding UI bundle matters

Retired behavior:
- no supported `validation-bundle-*` operator lane
- no browser-driven verification or mutation lane for the validation-session UI bundle
- no local browser state as part of validation-session verification

Durable Notion closeout draft for this sprint:
- Decision Log: Sprint 0 retires the validation-bundle browser automation lane. `validation-sessions verify --bundle` remains the supported workflow-level check and now explicitly reports manual checks for the Notion UI-only parts of the validation-session bundle.
- Roadmap: Mark validation-bundle removal complete and keep validation-session work focused on API-visible managed surfaces, repo-backed session artifacts, and manual UI bundle verification.
- Current Cycle: Record that operators should use `validation-sessions verify --bundle` plus manual Notion checks for `Active Sessions`, `Quick Intake`, `Validation Session`, and `New Validation Session`; do not use retired browser automation commands.
- Runbook: Update the operator workflow to remove browser automation setup and point validation-session bundle closeout at the API-visible verifier plus manual UI checklist.
- Projects > SNPM: If the public command summary is maintained there, remove validation-bundle references and list validation-session bundle verification under the validation-session command family.

Closeout targets: update `Projects > SNPM > Planning > Decision Log`, `Projects > SNPM > Planning > Roadmap`, `Projects > SNPM > Planning > Current Cycle`, `Runbooks > Notion Workspace Workflow`, and `Projects > SNPM` only if that page carries the public command summary.

## Sprint 1A Child Runner Hardening Updates

Sprint 1A follows Sprint 0 as an internal hardening wedge for existing child-process execution paths. Public operator behavior stays unchanged: do not add or imply new commands, and keep generated-secret ingestion, validation-session verification, and other supported workflows on their existing command families.

Durable Notion closeout draft for this sprint:
- Decision Log: Sprint 1A Child Runner Hardening is approved as an internal reliability and safety pass for existing child-process execution paths. It does not change public operator commands or command-family ownership.
- Roadmap: Mark Sprint 1A as the post-Sprint-0 hardening wedge. The next wedge after child runner hardening is Notion transport hardening for the existing Notion-backed command surface.
- Current Cycle: Record that operators should continue using the existing supported workflows; Sprint 1A changes implementation safety posture only, not operator behavior.
- Runbook: No new operator steps are required for Sprint 1A. Keep existing command guidance unchanged unless an existing workflow's safety notes need clarification.
- Projects > SNPM: If the public command summary is maintained there, avoid adding new command claims; mention child runner hardening only as internal reliability work.

Closeout targets: update `Projects > SNPM > Planning > Decision Log`, `Projects > SNPM > Planning > Roadmap`, `Projects > SNPM > Planning > Current Cycle`, `Runbooks > Notion Workspace Workflow`, and `Projects > SNPM` only if that page carries internal status notes.

## Sprint 1B Notion Transport Hardening Updates

Sprint 1B follows Sprint 1A as an internal hardening wedge for the existing Notion-backed command surface. Public operator behavior stays unchanged: do not add or imply new commands, keep command-family ownership unchanged, and leave README/public command guidance untouched unless a broken pointer is found.

Durable Notion closeout draft for this sprint:
- Decision Log: Sprint 1B Notion Transport Hardening is approved as an internal reliability and safety pass for existing Notion-backed transport paths. It does not change public operator commands, command-family ownership, or supported surfaces.
- Roadmap: Mark Sprint 1B as the post-Sprint-1A hardening wedge before broader feature expansion. The scope is the existing Notion-backed command surface, not new mutation capability.
- Current Cycle: Record that operators should continue using the existing supported workflows; Sprint 1B changes implementation transport posture only, not public operator behavior.
- Runbook: No new operator steps are required for Sprint 1B. Keep existing Notion workflow guidance unchanged unless an existing transport failure, retry, or safety note needs clarification.
- Projects > SNPM: If the public command summary is maintained there, avoid adding new command claims; mention Notion transport hardening only as internal reliability work.

Closeout command families: use `page-*` for `Planning > Decision Log`, `Planning > Roadmap`, and `Planning > Current Cycle`; use `runbook-*` for `Runbooks > Notion Workspace Workflow`; use `doc-*` for `Projects > SNPM` only if that page carries internal status notes.

Closeout targets: update `Projects > SNPM > Planning > Decision Log`, `Projects > SNPM > Planning > Roadmap`, `Projects > SNPM > Planning > Current Cycle`, `Runbooks > Notion Workspace Workflow`, and `Projects > SNPM` only if that page carries internal status notes.

## Sprint 1C Installable CLI Smoke Updates

Sprint 1C follows Sprint 1B as a packaging and cross-repo usage wedge. Public Notion operator behavior stays unchanged: do not add or imply new Notion mutation commands, keep command-family ownership unchanged, and keep live workspace mutation on the existing approved surfaces.

Operator usage now has two documented modes:
- Source-checkout mode uses `C:\SNPM`, `npm install`, and `npm run ... -- ...`; this remains the current local development and operator path.
- Installed CLI mode uses the package executable, shown as `snpm ...`, from a consumer repo after package metadata is public-ready.

Installed CLI mode must keep real workspace config outside the package and consumer repos:

```powershell
$env:SNPM_WORKSPACE_CONFIG_DIR = "C:\path\to\private\workspace-configs"
```

Public-readiness expectations:
- package metadata must expose the CLI executable before installed use is claimed as shipped
- packed contents must be reviewed with `npm pack --dry-run`
- the package allowlist must include only CLI/runtime files, required operator docs, public examples, and assets
- private workspace config, task memory, mutation journals, sidecars, review/scaffold/closeout artifacts, env files, and browser/auth state must not be packed

Durable Notion closeout draft for this sprint:
- Decision Log: Sprint 1C Installable CLI Smoke is approved as a packaging and cross-repo usage wedge. It documents source-checkout mode and installed CLI mode while preserving existing Notion command families, supported surfaces, and live mutation behavior.
- Roadmap: Mark Sprint 1C as the post-Sprint-1B packaging/public-readiness wedge. Installed CLI use is gated on executable metadata, reviewed packed-file allowlist, and private workspace config via `SNPM_WORKSPACE_CONFIG_DIR`.
- Current Cycle: Record that operators should continue using source-checkout mode until installed CLI packaging is verified. Installed mode must not vendor SNPM or bundle real workspace page ids into consumer repos or packages.
- Runbook: Add the operator boundary: source-checkout mode uses `C:\SNPM` and npm scripts; installed CLI mode uses `snpm ...` from the consumer repo with `SNPM_WORKSPACE_CONFIG_DIR` pointing at private config.
- Projects > SNPM: If the public command summary is maintained there, mention installed CLI mode only as the package-ready invocation model and avoid claiming new Notion command capability.

Closeout command families: use `page-*` for `Planning > Decision Log`, `Planning > Roadmap`, and `Planning > Current Cycle`; use `runbook-*` for `Runbooks > Notion Workspace Workflow`; use `doc-*` for `Projects > SNPM` only if that page carries public command or internal status notes.

Closeout targets: update `Projects > SNPM > Planning > Decision Log`, `Projects > SNPM > Planning > Roadmap`, `Projects > SNPM > Planning > Current Cycle`, `Runbooks > Notion Workspace Workflow`, and `Projects > SNPM` only if that page carries public command or internal status notes.

## Sprint 1D Command Metadata Registry And Package Readiness Updates

Sprint 1D follows Sprint 1C as the command discovery and package/readiness contract wedge. Public Notion operator behavior stays unchanged: do not add or imply new Notion mutation commands, keep command-family ownership unchanged, and keep live workspace mutation on the existing approved surfaces.

Registry behavior:
- CLI help and `capabilities` are generated from the shared command metadata registry.
- `capabilities` is the full machine-readable command registry for coding agents after first contact.
- `discover` remains the compact first-contact command and should be used before deeper registry inspection.
- Registry metadata includes command names, aliases, flags, examples, surface, auth scope, mutation mode, stability, and feature-specific safety metadata where applicable.

Package/readiness behavior:
- package metadata declares the installed executable as `snpm`.
- installed CLI use must still load real workspace config from private operator state through `SNPM_WORKSPACE_CONFIG_DIR` or an equivalent explicit private path.
- the package allowlist is limited to runtime source, required operator docs, public examples/config examples, assets, README, and LICENSE.
- private workspace config, real page ids, task memory, mutation journals, sidecars, review/scaffold/closeout artifacts, env files, and browser/auth state must not be packed.
- package publishing or repository/package visibility changes remain separate operator actions after reviewed `npm pack --dry-run` output.

Durable Notion closeout draft for this sprint:
- Decision Log: Sprint 1D Command Metadata Registry And Package Readiness is approved as the command discovery and packaging contract follow-up after Sprint 1C. CLI help and `capabilities` now share registry-derived command metadata, while package metadata defines the installed `snpm` executable, Node runtime expectation, and packed-file allowlist. No Notion command-family ownership, supported surface, or live mutation behavior changes.
- Roadmap: Mark Sprint 1D complete. The installed CLI/readiness lane now has registry-derived command metadata, executable package metadata, explicit package file contract, private workspace config boundary through `SNPM_WORKSPACE_CONFIG_DIR`, and `npm pack --dry-run` review before any public package or visibility change.
- Current Cycle: Operators should continue using `discover` for first contact and `capabilities` for the full machine-readable command registry. Source-checkout mode remains valid; installed mode uses `snpm ...` only with private workspace config outside the package or consumer repo. Live Notion mutation still uses the existing owning command families.
- Runbook: Update `Runbooks > Notion Workspace Workflow` only if the live runbook lacks the operator guidance for `discover`/`capabilities`, installed CLI mode, `SNPM_WORKSPACE_CONFIG_DIR`, package allowlist review, and the no-new-Notion-command boundary. If that guidance is already present, no runbook change is required for Sprint 1D.
- Projects > SNPM: If the public command summary is maintained there, mention that command discovery is registry-derived and installed CLI readiness is backed by package metadata; avoid claiming new Notion mutation capability.

Closeout command families: use `page-*` for `Planning > Decision Log`, `Planning > Roadmap`, and `Planning > Current Cycle`; use `runbook-*` only if `Runbooks > Notion Workspace Workflow` needs the operator guidance update; use `doc-*` for `Projects > SNPM` only if that page carries public command or internal status notes.

Closeout targets: update `Projects > SNPM > Planning > Decision Log`, `Projects > SNPM > Planning > Roadmap`, and `Projects > SNPM > Planning > Current Cycle`. Note `Runbooks > Notion Workspace Workflow` only if operator guidance changes.

## Sprint 1E Structured CLI Errors Updates

Sprint 1E follows Sprint 1D as a narrow CLI hardening wedge for automation-readable failures. Default operator behavior stays unchanged: command failures still print human-readable text to stderr unless an operator opts into JSON failure formatting.

Supported behavior:
- use `--error-format json|text` to select failure formatting for a command
- use `SNPM_ERROR_FORMAT=json|text` as the environment default when the flag is omitted
- prefer the explicit flag over the environment variable when both are present
- emit JSON-formatted failures on stderr only
- keep successful stdout payloads and existing success schemas unchanged

Out of scope:
- retries
- rollback or transaction semantics
- changed Notion mutation behavior
- changed stale-write protection
- changed command-family ownership or supported surfaces
- moving failure output to stdout

Durable Notion closeout draft for this sprint:
- Decision Log: Sprint 1E Structured CLI Errors is approved as a reporting-only hardening wedge. CLI failures can opt into JSON with `--error-format json` or `SNPM_ERROR_FORMAT=json`; default text stderr remains unchanged, JSON failures stay on stderr, and success schemas are unchanged.
- Roadmap: Mark Sprint 1E complete as opt-in structured failure reporting after Sprint 1D. It improves automation recovery without adding retries, rollback, transaction semantics, mutation behavior, or new supported surfaces.
- Current Cycle: Operators can keep existing commands unchanged. Use `--error-format json` only when a calling agent or script needs machine-readable failure details; successful command output remains the existing command-specific schema.
- Runbook: Add a short operator note only if the live runbook documents CLI automation conventions: `--error-format` overrides `SNPM_ERROR_FORMAT`, JSON errors are stderr-only, and structured errors are not retry or mutation semantics.
- Projects > SNPM: If the public command summary is maintained there, mention opt-in structured CLI failures as an automation hardening feature, not as a new Notion command capability.

Closeout command families: use `page-*` for `Planning > Decision Log`, `Planning > Roadmap`, and `Planning > Current Cycle`; use `runbook-*` only if `Runbooks > Notion Workspace Workflow` needs the operator note; use `doc-*` for `Projects > SNPM` only if that page carries public command or internal status notes.

Closeout targets: update `Projects > SNPM > Planning > Decision Log`, `Projects > SNPM > Planning > Roadmap`, and `Projects > SNPM > Planning > Current Cycle`. Note `Runbooks > Notion Workspace Workflow` only if operator CLI automation guidance changes.

## Sprint 1F Limited JSON Contract Schemas Updates

Sprint 1F follows Sprint 1E as a narrow compatibility hardening wedge for selected agent-facing JSON contracts. It does not create a new Notion command workflow and does not change live mutation behavior.

Supported behavior:
- document and validate selected machine-consumed JSON contracts
- keep schema coverage limited to structured CLI error v1, discover v1, capabilities v1 minimal shape, plan-change v1, manifest v2 diagnostic/result/review metadata, pull metadata v1, and mutation journal entries
- preserve command-specific success payloads unless a payload is explicitly listed in the limited contract reference
- keep structured CLI errors on stderr and successful command output on its existing channel
- keep secret-bearing values out of schema failures, journals, sidecars, review artifacts, and durable closeout text

Out of scope:
- rewriting every success payload
- changing `capabilities.schemaVersion`
- adding new Notion mutation commands or supported surfaces
- changing command-family ownership, stale-write protection, manifest semantics, mutation journals, or package privacy
- retries, rollback, transaction semantics, semantic consistency gates, or generic batch apply

Durable Notion closeout draft for this sprint:
- Decision Log: Sprint 1F Limited JSON Contract Schemas is approved as compatibility hardening for selected agent-facing JSON contracts only. It stabilizes the contracts agents consume without rewriting every success payload, changing stdout/stderr placement, or changing Notion mutation semantics.
- Roadmap: Sequence Sprint 1F after Sprint 1E and before broader feature expansion. The sprint covers structured CLI errors, discover, capabilities minimal shape, plan-change, manifest v2 diagnostics/result/review metadata, pull metadata, and mutation journal entries while leaving command-specific success payloads unchanged unless explicitly covered.
- Current Cycle: Operators and agents should treat the limited schemas as validation and compatibility references, not as a new command workflow. Continue using existing owning command families for Notion work and existing verification commands for live workspace health.
- Product Hardening Plan: Record that limited JSON schemas are a bounded hardening layer for selected machine-consumed payloads. They do not add a broad schema framework, runtime dependency, retry/rollback/transaction behavior, batch apply semantics, raw secret exposure, or new Notion surfaces.

Closeout command families if later applied by an operator: use `page-*` for `Planning > Decision Log`, `Planning > Roadmap`, and `Planning > Current Cycle`; use `doc-*` for `Root > Product Hardening Plan` only if the strategic hardening sequence needs correction.

Closeout targets if later applied by an operator: `Projects > SNPM > Planning > Decision Log`, `Projects > SNPM > Planning > Roadmap`, `Projects > SNPM > Planning > Current Cycle`, and conditionally `Projects > SNPM > Product Hardening Plan`.

## Sprint 1G CI And Release Gates Updates

Sprint 1G follows Sprint 1F as a release-readiness wedge for CI, package contract checks, and local release gates. It does not create a new Notion workflow and does not change live mutation behavior.

Supported behavior:
- Node 22+ is the runtime contract for source checkout development, CI, and package readiness
- CI is secret-free and must not use Notion tokens, private workspace config, real page ids, or live workspace access
- CI must not run live Notion verification or mutation commands
- local `package-contract` checks the package metadata, runtime, executable, packed-file allowlist, and private-artifact exclusion contract
- local `release-check` is the source-checkout pre-release aggregate gate
- live Notion verification remains a local operator action with private config and tokens

Out of scope:
- live Notion verification or mutation in CI
- adding Notion tokens or private workspace config to CI/package outputs
- changing Notion command-family ownership, supported surfaces, stale-write protection, secret boundaries, or live mutation behavior
- publishing the package or changing repository/package visibility

Durable Notion closeout draft for this sprint:
- Decision Log: Sprint 1G CI And Release Gates is approved as a release-readiness hardening wedge. SNPM now treats Node 22+ as the runtime contract, keeps CI secret-free with no live Notion access, and uses local `package-contract` and `release-check` scripts before release promotion.
- Roadmap: Mark Sprint 1G after Sprint 1F and before broader feature expansion. The release path now has explicit Node 22+, package contract, release-check, and no-live-Notion-in-CI gates while preserving supported command families and live mutation behavior.
- Current Cycle: Operators should run `npm run package-contract` and `npm run release-check` locally before release or visibility changes. Run live Notion verification separately only from an operator environment with private config and tokens.
- Runbook: Update `Runbooks > Notion Workspace Workflow` only if it documents release promotion or CI expectations; note that CI is secret-free and live Notion verification remains local/off-CI.
- Projects > SNPM: If the public command summary is maintained there, mention release readiness as Node 22+ plus secret-free CI and local release gates, not as new Notion command capability.

Closeout command families if later applied by an operator: use `page-*` for `Planning > Decision Log`, `Planning > Roadmap`, and `Planning > Current Cycle`; use `runbook-*` only if `Runbooks > Notion Workspace Workflow` needs release/CI guidance; use `doc-*` for `Projects > SNPM` only if that page carries public command or release-readiness status.

Closeout targets if later applied by an operator: `Projects > SNPM > Planning > Decision Log`, `Projects > SNPM > Planning > Roadmap`, `Projects > SNPM > Planning > Current Cycle`, conditionally `Runbooks > Notion Workspace Workflow`, and conditionally `Projects > SNPM`.

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
