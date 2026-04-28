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
- read-only `doctor --consistency-audit` for advisory cross-document contradiction findings
- intent-driven `recommend`
- `recommend --intent project-doc|template-doc|workspace-doc`
- repo-first implementation routing via `recommend --intent implementation-note|design-spec|task-breakdown|investigation`
- JSON-only `capabilities` for registry-derived LLM-readable command discovery
- read-only `plan-change` for deterministic target-file planning before mutation
- opt-in structured CLI failure reporting through `--error-format json|text` or `SNPM_ERROR_FORMAT`
- limited JSON contract schemas for selected agent-facing payloads
- Node 22+ CI/release gate contract with local `package-contract`, `release-audit`, and `release-check` gates
- release identity and governance guardrails for source checkout, reviewed Git install, and reviewed tarball install distribution
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

Manifest v2 diagnostics behavior:
- manifest v2 diagnostics parity across CLI help, capability metadata, and operator docs
- v2 check and push diagnostics are structured result/review metadata; v2 pull diagnostics are structured result metadata
- diagnostics include stable codes, severity, entry/target context, safe next command, and recovery action

Manifest v2 targeted-review behavior:
- manifest v2 `--entry` and `--entries-file` selectors for check, pull, and push
- manifest v2 push `--review-output` artifacts for preview review
- manifest v2 push `--max-mutations` gate so default apply allows at most one changed entry unless raised or set to `all`
- selected `sync push --apply --refresh-sidecars` refreshes only selected sidecars for successfully applied entries

Truth-quality audit behavior:
- `doctor --truth-audit` is a read-only project-health audit
- audit findings cover stale `Last Updated` metadata, placeholder or empty important surfaces, and freshness of `Planning > Roadmap` and `Planning > Current Cycle`
- remediation remains explicit through the owning command family; truth-audit does not mutate Notion, apply manifests, refresh sidecars, export secrets, or perform cross-document semantic consistency checks

Generated-secret ingestion behavior:
- `secret-record-generate` and `access-token-generate` give coding agents a write-only path for generated credentials
- preview mode validates target feasibility but does not run the generator
- applied mode runs one child generator command, stores one generated stdout value directly in Notion, and keeps the raw value out of chat, local markdown, sidecars, review artifacts, terminal output, and mutation journals
- raw local export and secret-bearing local edit/diff/push remain unsupported

Consistency-audit behavior:
- `doctor --consistency-audit` and `npm run consistency-audit` add an advisory read-only project-health audit for explicit cross-document contradictions
- initial findings cover Roadmap/Current Cycle active-marker alignment, explicit runbook references, and explicit Access references where the target can be resolved structurally
- the audit does not mutate Notion, write local files, write sidecars, append mutation journal entries, apply manifests, inspect raw Access secret/token bodies, generate fixes, change default `doctor` output, change top-level `ok` or exit behavior, or make findings blocking

Plan-change manifest draft behavior:
- `plan-change --manifest-draft` previews manifest v2 entries for approved multi-surface documentation plans
- supported draft targets are `planning-page`, `project-doc`, `template-doc`, `workspace-doc`, and `runbook`
- unsupported draft targets are Access records, build records, create/adopt targets, arbitrary page IDs, generic CRUD targets, and any surface outside approved manifest v2 entries
- safe follow-up starts with operator review, then `sync check` or `sync pull`; `sync push` remains a separate preview/apply workflow against a reviewed manifest file
- the planner does not write files, sidecars, review artifacts, journals, or Notion content, and it does not add audit gates or batch apply behavior

Command metadata and package-readiness behavior:
- CLI help and `capabilities` share one command metadata registry rather than separate hand-maintained surfaces
- `capabilities` reports canonical commands, aliases, flags, examples, surfaces, auth scope, mutation mode, stability, and feature-specific command metadata
- `discover` remains the compact first-contact command; `capabilities` is the full registry for deeper inspection
- package metadata declares the installed `snpm` executable and Node 22+ runtime expectation
- the package file allowlist is explicit and excludes private workspace config, task memory, mutation artifacts, env files, and browser/auth state
- public package or repository visibility changes remain separate operator actions after `npm pack --dry-run` review
- this registry/package contract does not add Notion mutation commands, broaden supported surfaces, or change command-family ownership

Structured CLI error behavior:
- default CLI failures remain human-readable text on stderr
- `--error-format json|text` opts a command into a specific failure format
- `SNPM_ERROR_FORMAT=json|text` sets the default failure format when the flag is omitted
- JSON failures are written to stderr only
- successful stdout payloads and existing success schemas are unchanged
- structured failures do not add retries, rollback, transaction semantics, mutation behavior, or new command-family ownership

Limited JSON contract schema behavior:
- limited schemas stabilize selected agent-facing JSON contracts, not every successful command payload
- covered contract families are structured CLI error v1, discover v1, capabilities v1 minimal shape, plan-change v1, manifest v2 diagnostics/result/review metadata, pull metadata v1, and mutation journal entries
- command-specific success payloads remain command-specific unless listed in the limited contract reference
- schema coverage must not change stdout/stderr placement, `capabilities.schemaVersion`, manifest semantics, secret handling, command-family ownership, supported surfaces, or mutation behavior
- the reference lives in [Limited JSON contract schemas](./json-contract-schemas.md)

CI and release gate behavior:
- Node 22+ is the runtime contract for source checkout development, CI, and package readiness
- CI is secret-free and must not require Notion tokens, private workspace config, real page ids, or live workspace access
- CI must not run live Notion verification or mutation commands
- `release-audit` is the focused release identity and package-content audit gate when present on the branch under review
- `package-contract` is the focused local package metadata and packed-file contract check
- `release-check` is the local source-checkout pre-release aggregate gate
- live Notion verification remains an operator-run local step when private config and tokens are available

Release identity and governance behavior:
- current distribution is source checkout plus reviewed Git or tarball install only
- SNPM is not published to npm yet
- the unscoped npm name `snpm` is occupied by an unrelated package and must not be used for publication
- any future npm package must use an owned scoped name and requires explicit operator approval
- GitHub Releases, release tags, and npm publishing are separate explicit release actions
- `main` branch protection is a manual governance requirement before stable release promotion and is not applied by ordinary release checks
- a branch missing the expected `release-audit` gate must not be treated as Sprint 1H release-ready even if `release-check` passes

Specialized or experimental lanes:
- build records and validation sessions are supported narrow project-operation surfaces; keep them on their command families rather than treating them as generic docs
- manifest v2 create/adopt, Access/build-record entries, rollback, auto-merge, automatic retries, arbitrary CRUD, semantic consistency checks, generic transaction semantics, and generic batch apply
- policy-pack-driven mutation, hard/blocking cross-document consistency gates, and broad batch apply
- validation-session v1 artifact sync remains a separate specialized lane

Active hardening sequence:
- Sprint 0 retired the browser-driven validation-bundle lane; validation-session workflows stay on the existing API-visible command families plus manual UI checks where needed
- Sprint 1A Child Runner Hardening completed the internal reliability and safety pass for existing child-process execution paths
- Sprint 1B Notion Transport Hardening completed the internal reliability and safety pass for the existing Notion-backed command surface
- Sprint 1C Installable CLI Smoke completed the source-checkout versus installed CLI guidance wedge
- Sprint 1D Command Metadata Registry And Package Readiness completed registry-derived command discovery and the package/readiness contract
- Sprint 1E Structured CLI Errors completed opt-in machine-readable failure reporting without changing default stderr text, success schemas, command-family ownership, supported surfaces, or mutation semantics
- Sprint 1F Limited JSON Contract Schemas completed bounded schema coverage for selected agent-facing JSON contracts without rewriting every success payload or changing mutation semantics
- Sprint 1G CI And Release Gates completed the Node 22+ runtime contract, secret-free CI boundary, and local `package-contract`/`release-check` gates without changing Notion mutation behavior
- Sprint 1H Release Identity And Governance adds the release identity/distribution boundary, npm name guardrail, manual branch-protection requirement, and release-audit/release-check governance without publishing packages or changing live Notion behavior
- installed/public use is gated on package executable metadata, an explicit packed-file allowlist, `release-audit`, `package-contract`, `release-check`, `npm pack --dry-run` review, and `SNPM_WORKSPACE_CONFIG_DIR` for private workspace config

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

### Phase 1: Validation-Session Manual Bundle
- keep `validation-sessions verify --bundle` as the stable API-visible check
- keep the API-managed database, schema, row properties, and row body as the supported SNPM-managed surface
- keep Sprint 1A child-runner hardening and Sprint 1B Notion transport hardening internal to existing execution and Notion-backed transport paths, without reintroducing a validation-bundle command lane or adding new operator commands
- treat surrounding Notion UI elements as explicit manual checks returned by bundle verification:
  - `Active Sessions`
  - `Quick Intake`
  - `Validation Session`
  - `New Validation Session`
- do not reintroduce browser automation as a supported mutation or verification lane

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
- keep pinned install/use from other repos straightforward after package public-readiness checks pass
- keep the CLI as the policy layer for other Codex threads
- support both source-checkout mode and installed CLI mode without vendoring private workspace config into consumer repos or packages
- add wrappers only after the CLI workflows are stable

### Phase 4: Expand Only Proven Surfaces
- add new surfaces only when repeated demand justifies them
- use `doctor --truth-audit` as the read-only freshness check and `doctor --consistency-audit` as the read-only contradiction check before adding stronger consistency gates
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
- `doctor --consistency-audit` reports advisory contradiction findings only; it does not mutate Notion, inspect raw Access secret/token bodies, generate fixes, change default doctor behavior, or block ordinary safe mutations
- secret-bearing Access records allow consume-only runtime access and write-only generated ingestion; they still do not allow raw local export, local markdown edit/diff/push, sidecars, manifest v2 entries, or review-output artifacts
- `scaffold-docs` is preview-first and must not broaden approved starter targets or bypass managed-surface safety checks
- repo sync stays selective
- manifest v2 supports check, local-file pull, guarded push, targeted review, mutation limits, and opt-in post-push sidecar refresh for approved existing targets; broader mutation stays on the owning command family
- manifest v2 recovery diagnostics are metadata for review and manual recovery, not rollback, automatic retries, semantic consistency checks, transaction semantics, or generic batch apply
- validation-session v1 sync is not a precedent for generalized mixed-surface push
- browser/UI automation is not a supported SNPM mutation lane; UI-only validation-session elements remain manual checks surfaced by `validation-sessions verify --bundle`
- command metadata must stay registry-derived so CLI help and `capabilities` do not drift
- structured CLI errors are stderr-only failure formatting; they must not change successful command output, success schemas, retry behavior, or Notion mutation semantics
- limited JSON contract schemas cover selected agent-facing contracts only; they must not become a broad success-payload rewrite, add raw secret exposure, change `capabilities.schemaVersion`, or alter stdout/stderr, retry, mutation, manifest, or command-family semantics
- CI and release gates must remain secret-free; do not add Notion tokens, private workspace config, live page ids, or live Notion commands to CI
- current distribution is source checkout plus reviewed Git/tarball install only; do not publish to npm as part of release checks
- the unscoped `snpm` npm name is not available for this project; future npm publication requires an approved owned scoped package name
- branch protection is a manual governance requirement before stable release promotion, not a repo-local script side effect
- `release-audit` and `release-check` are gates; they do not create GitHub Releases, tags, branch rules, or npm publishes
- local `release-audit`, `package-contract`, and `release-check` are release gates, not Notion command families or live workspace verification
- installed CLI packaging must use the package executable metadata and explicit allowlist, and must not publish private workspace config, mutation journals, sidecars, review/scaffold/closeout artifacts, task memory, env files, or local browser/auth state
- installed CLI operation must resolve real workspace config from private operator state, normally through `SNPM_WORKSPACE_CONFIG_DIR`

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
