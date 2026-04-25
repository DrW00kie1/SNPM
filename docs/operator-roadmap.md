# SNPM Operator Roadmap

SNPM is not a generic Notion connector. It is a constrained operator for approved Infrastructure HQ workspace surfaces.

Sprint-level development sequencing lives in [SNPM development plan](./development-plan.md).

## Current Baseline

Supported on the current active line:
- project bootstrap
- `verify-project`
- planning-page sync
- managed runbooks
- managed Access records
- curated managed docs for project root docs, curated template docs, and curated workspace-global docs
- editor-backed operational edit loops
- `doc-create`, `doc-adopt`, `doc-pull`, `doc-diff`, `doc-push`
- `page-edit`, `runbook-edit`, `doc-edit`, and `access-domain-edit`
- `verify-workspace-docs`
- `doctor`
- read-only `doctor --truth-audit` for truth-quality audit findings
- intent-driven `recommend`
- `recommend --intent project-doc|template-doc|workspace-doc`
- repo-first implementation routing via `recommend --intent implementation-note|design-spec|task-breakdown|investigation`
- JSON-only `capabilities` for LLM-readable command discovery
- read-only `plan-change` for deterministic target-file planning before mutation
- stdin/stdout ergonomics on the core band
- strict metadata sidecars and stale-write checks on managed apply paths
- local redacted mutation journal entries for applied changes
- consume-only `secret-record-exec` and `access-token-exec` for runtime secret use, with redacted-only pulls and no supported raw local export
- write-only `secret-record-generate` and `access-token-generate` for agent-generated secret/token creation or rotation
- EOF-stable managed-page round-trips
- manifest v2 `sync check` for read-only mixed-surface comparison
- manifest v2 `sync pull` for local-file refreshes with sidecar metadata
- guarded manifest v2 `sync push` for approved existing targets with stale-write protection
- preview-first `scaffold-docs` for starter project documentation drafts

Baseline manifest v2 sidecar-refresh behavior:
- opt-in manifest v2 `sync push --apply --refresh-sidecars` refreshes sidecar metadata after a successful applied push
- default manifest v2 `sync push --apply` still leaves sidecars stale

Promoted policy-pack foundation:
- policy-pack foundation makes the current Infrastructure HQ starter tree, reserved roots, managed-doc boundaries, curated workspace/template docs, and routing boundaries explicit as reusable policy
- the policy can be derived from existing workspace config or declared through an optional `policyPack` v1 config object
- optional `policyPack.starterDocScaffold` declares approved starter doc drafts without applying them
- policy packs do not add drift or staleness audit, consistency checks, manifest create/adopt, rollback, retries, transaction semantics, or broad batch apply

Promoted bootstrap doc scaffolding behavior:
- `scaffold-docs` previews starter drafts by default, writes local scaffold files only with `--output-dir`, and never mutates Notion directly
- the scaffold surface stays constrained to approved `project-doc` and `planning-page` starter targets
- default scaffold targets are `Root > Overview`, `Root > Operating Model`, `Planning > Roadmap`, and `Planning > Current Cycle`
- family-level CLI help and capability metadata stay aligned with the supported command surface

Recently promoted manifest v2 diagnostics behavior on `main`:
- manifest v2 diagnostics parity across CLI help, capability metadata, and operator docs
- v2 check and push diagnostics are structured result/review metadata; v2 pull diagnostics are structured result metadata
- diagnostics include stable codes, severity, entry/target context, safe next command, and recovery action

Recently promoted manifest v2 targeted-review behavior on `main`:
- manifest v2 `--entry` and `--entries-file` selectors for check, pull, and push
- manifest v2 push `--review-output` artifacts for preview review
- manifest v2 push `--max-mutations` gate so default apply allows at most one changed entry unless raised or set to `all`
- selected `sync push --apply --refresh-sidecars` refreshes only selected sidecars for successfully applied entries

Recently promoted truth-quality audit behavior on `main`:
- `doctor --truth-audit` is a read-only project-health audit
- audit findings cover stale `Last Updated` metadata, placeholder or empty important surfaces, and freshness of `Planning > Roadmap` and `Planning > Current Cycle`
- remediation remains explicit through the owning command family; truth-audit does not mutate Notion, apply manifests, refresh sidecars, export secrets, or perform cross-document semantic consistency checks

Current `codex/generated-secret-ingestion` branch addition:
- `secret-record-generate` and `access-token-generate` give coding agents a write-only path for generated credentials
- preview mode validates target feasibility but does not run the generator
- applied mode runs one child generator command, stores one generated stdout value directly in Notion, and keeps the raw value out of chat, local markdown, sidecars, review artifacts, terminal output, and mutation journals
- raw local export and secret-bearing local edit/diff/push remain unsupported

Specialized or experimental lanes:
- build records and validation sessions are supported narrow project-operation surfaces; keep them on their command families rather than treating them as generic docs
- manifest v2 create/adopt, Access/build-record entries, rollback, auto-merge, automatic retries, arbitrary CRUD, semantic consistency checks, generic transaction semantics, and generic batch apply
- policy-pack-driven mutation, cross-document consistency checks, and broad batch apply
- validation-session v1 artifact sync remains a separate specialized lane
- experimental `validation-bundle`

## Why SNPM Beats A Generic Connector

SNPM encodes:
- approved-surface mutation only
- project-token-safe paths
- deterministic routing before mutation
- explicit reusable policy for workspace and project shape rules
- explicit repo-first routing for fast-changing engineering detail
- clear Notion-vs-repo ownership
- stable markdown round-trips on supported surfaces
- review artifacts and explain output before apply
- stale-write refusal before managed page replacement
- a local mutation journal that records operational metadata without storing page bodies or secrets

A generic connector gives raw page reach. SNPM gives a narrower tool that is safer to use repeatedly on a live workspace.

## Managed-Doc Boundary

The managed-doc surface is curated, not arbitrary.

Allowed:
- project root page body
- project root descendants under non-reserved top-level names
- `Templates > Project Templates` and non-reserved descendants
- exact curated workspace-global docs

Starter scaffolding may draft managed-doc content for approved project-doc targets. Planning starter drafts remain planning-page targets, not `doc-*` targets.

Still reserved:
- `Planning`
- `Runbooks`
- `Access`
- `Ops`
- `Vendors`
- `Incidents`

Those surfaces continue to use their own command families.

## Roadmap

### Phase 0: Operational Loop Ergonomics
- keep Notion usage constrained to operational truth
- use repo-first routing for engineering notes, specs, investigations, and task breakdowns
- reduce small-edit ceremony with editor-backed operational commands
- make auth mode, target resolution, child-page preservation, and normalization behavior explicit before apply

### Phase 1: Validation-Session UI Lane
- keep `validation-sessions verify --bundle` as the stable API-visible check
- keep `validation-bundle-*` narrow, Chromium-only, and explicitly experimental
- use the UI lane only for the surrounding Notion bundle:
  - `Active Sessions`
  - `Quick Intake`
  - `Validation Session`
  - `New Validation Session`

### Phase 2: Workflow Bundles
- use manifest v2 check, local-file pull, guarded push, and opt-in sidecar refresh support as the first safe workflow-bundle primitives
- compare, locally refresh, and stale-guard existing mixed approved surfaces before designing batch semantics
- keep default whole-manifest preview for v2 push, while allowing selected review through `--entry`, `--entries-file`, and `--review-output`
- keep default v2 apply limited to one changed entry unless `--max-mutations` is raised or set to `all`
- keep v2 entries explicit:
  - `planning-page`
  - `project-doc`
  - `template-doc`
  - `workspace-doc`
  - `runbook`
  - `validation-session`
- make v2 `sync pull` write local markdown files and sidecar metadata only, with no Notion mutation and no mutation journal entry
- make v2 `sync push` preview by default; allow `--apply` only with sidecar metadata from v2 pull
- treat default successful v2 push as making sidecars stale; the next safe command is `sync pull --apply`
- allow `sync push --apply --refresh-sidecars` as the explicit opt-in to refresh sidecar metadata to the post-push base, limited to selected successfully applied entries when selectors are used
- expose v2 recovery diagnostics as structured metadata only, so operators get self-contained recovery context without adding mutation semantics
- keep create/adopt, Access/build-record entries, rollback, auto-merge, automatic retries, arbitrary CRUD, semantic consistency checks, generic transaction semantics, and generic batch apply out of scope
- keep the v1 validation-session manifest lane available only for repo-backed validation artifacts that need pull/push sync

### Phase 3: Policy Foundation And Cross-Repo Consumption
- make current workspace and project rules reusable through explicit policy instead of scattered helper assumptions
- keep policy-pack changes reviewable and backward compatible with the existing Infrastructure HQ config shape
- allow policy packs to declare preview-first starter doc scaffolds, but do not use them as a shortcut for drift audit, consistency checks, hidden Notion mutation, or broad batch apply
- keep `scaffold-docs` preview-first and local-file-only within approved `project-doc` and `planning-page` starter targets
- keep pinned install/use from other repos straightforward
- keep the CLI as the policy layer for other Codex threads
- add wrappers only after the CLI workflows are stable

### Phase 4: Expand Only Proven Surfaces
- add new surfaces only when repeated demand justifies them
- use `doctor --truth-audit` as the read-only freshness check before adding stronger consistency gates
- use write-only generated Access ingestion for agent-created credentials instead of reopening raw local secret files
- avoid generic arbitrary workspace CRUD
- keep the product boundary explicit

## Guardrails

Keep these boundaries:
- project token remains the default project-local safety boundary
- workspace-token-only surfaces stay clearly labeled
- curated doc families stay config-backed and explicit
- policy packs describe approved structure, routing boundaries, and optional starter doc scaffold declarations; they do not by themselves audit freshness, check semantic consistency, mutate Notion, or apply batches
- `doctor --truth-audit` reports truth-quality findings only; it does not rewrite stale pages, classify secrets for local export, apply generated fixes, or replace the owning command families
- secret-bearing Access records allow consume-only runtime access and write-only generated ingestion; they still do not allow raw local export, local markdown edit/diff/push, sidecars, manifest v2 entries, or review-output artifacts
- `scaffold-docs` is preview-first and must not broaden approved starter targets or bypass managed-surface safety checks
- repo sync stays selective
- manifest v2 supports check, local-file pull, guarded push, targeted review, mutation limits, and opt-in post-push sidecar refresh for approved existing targets; broader mutation stays on the owning command family
- manifest v2 recovery diagnostics are metadata for review and manual recovery, not rollback, automatic retries, semantic consistency checks, transaction semantics, or generic batch apply
- validation-session v1 sync is not a precedent for generalized mixed-surface push
- UI automation stays narrow, explicit, Chromium-only, and non-default

## Success Criteria

Judge the active line on:
- source-of-truth clarity
- operator speed
- safe mutation
- stable round-trips
- low duplication between Notion and repo
- low need for ad hoc scripts

Failure signals:
- repeated drift between repo docs and live Notion docs
- teams bypassing SNPM because the safe path is slower than manual work
- teams using managed docs for fast-changing implementation truth instead of repo-first paths
- pressure to broaden into generic page editing instead of explicit surface modeling

The live scorecard stays in `Projects > SNPM > Planning > Roadmap`.
