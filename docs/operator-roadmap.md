# SNPM Operator Roadmap

SNPM is not a generic Notion connector. It is a constrained operator for approved Infrastructure HQ workspace surfaces.

## Current Baseline

Supported on `main`:
- project bootstrap
- `verify-project`
- planning-page sync
- managed runbooks
- managed Access records
- `doctor`
- intent-driven `recommend`
- stdin/stdout ergonomics on the core band
- EOF-stable managed-page round-trips

Current follow-on branch:
- `codex/managed-doc-surface`
- adds curated managed docs for:
  - project root docs
  - `Templates > Project Templates`
  - a small named set of workspace-global docs
- adds:
  - `doc-create`
  - `doc-adopt`
  - `doc-pull`
  - `doc-diff`
  - `doc-push`
  - `verify-workspace-docs`

Still outside the supported line:
- build records
- validation sessions
- manifest-backed sync
- paused `validation-bundle`

## Why SNPM Beats A Generic Connector

SNPM encodes:
- approved-surface mutation only
- project-token-safe paths
- deterministic routing before mutation
- clear Notion-vs-repo ownership
- stable markdown round-trips on supported surfaces

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

### Phase 0: Validate and Promote Managed Docs
- prove the curated managed-doc surface on `Projects > SNPM`
- keep workspace-global coverage explicit and config-backed
- promote the branch only after project, template, and workspace doc loops are all clean

### Phase 1: Doc Adoption And Audit Coverage
- use the new surface to standardize remaining live root/template/workspace docs that belong inside the curated boundary
- extend guidance so unmanaged docs are easy to adopt safely
- keep unsupported or structural pages out of scope rather than silently broadening reach

### Phase 2: Workflow Bundles
- only after the current core band and curated docs stay stable under real use
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
- browser automation stays paused unless it becomes clearly necessary again

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
- pressure to broaden into generic page editing instead of explicit surface modeling

The live scorecard stays in `Projects > SNPM > Planning > Roadmap`.
