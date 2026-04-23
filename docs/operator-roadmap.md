# SNPM Operator Roadmap

SNPM is not a generic Notion connector. It is a constrained operator for approved Infrastructure HQ workspace surfaces.

Sprint-level development sequencing lives in [SNPM development plan](./development-plan.md).

## Current Baseline

Supported on `main`:
- project bootstrap
- `verify-project`
- planning-page sync
- managed runbooks
- managed Access records
- curated managed docs for project root docs, curated template docs, and curated workspace-global docs
- editor-backed operational edit loops
- `doc-create`, `doc-adopt`, `doc-pull`, `doc-diff`, `doc-push`
- `page-edit`, `runbook-edit`, `doc-edit`, `access-domain-edit`, `secret-record-edit`, `access-token-edit`
- `verify-workspace-docs`
- `doctor`
- intent-driven `recommend`
- `recommend --intent project-doc|template-doc|workspace-doc`
- repo-first implementation routing via `recommend --intent implementation-note|design-spec|task-breakdown|investigation`
- JSON-only `capabilities` for LLM-readable command discovery
- read-only `plan-change` for deterministic target-file planning before mutation
- stdin/stdout ergonomics on the core band
- strict metadata sidecars and stale-write checks on managed apply paths
- local redacted mutation journal entries for applied changes
- EOF-stable managed-page round-trips

Still outside the stable supported line:
- build records
- validation sessions
- manifest-backed sync
- experimental `validation-bundle`

## Why SNPM Beats A Generic Connector

SNPM encodes:
- approved-surface mutation only
- project-token-safe paths
- deterministic routing before mutation
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
- only after the operational loop and the experimental validation-session UI lane stay low-friction under real use
- likely first bundles:
  - validation run lifecycle
  - release/build evidence capture
  - project secret management
  - runbook standardization

### Phase 3: Harden Cross-Repo Consumption
- keep pinned install/use from other repos straightforward
- keep the CLI as the policy layer for other Codex threads
- add wrappers only after the CLI workflows are stable

### Phase 4: Expand Only Proven Surfaces
- add new surfaces only when repeated demand justifies them
- avoid generic arbitrary workspace CRUD
- keep the product boundary explicit

## Guardrails

Keep these boundaries:
- project token remains the default project-local safety boundary
- workspace-token-only surfaces stay clearly labeled
- curated doc families stay config-backed and explicit
- repo sync stays selective
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
