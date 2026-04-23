# SNPM Development Plan

This document turns the next set of SNPM product ideas into a step-wise development plan.
Milestones marked implemented are shipped or merge-ready; future phases remain proposed direction. The shipped surface remains documented in the README and operator roadmap.

The goal is to make SNPM a better utility for coding LLMs that need to create and maintain project documentation in Notion without turning it into a generic workspace CRUD tool.

## Product Direction

SNPM should improve in three ways:
- make the allowed Notion operating model easier for an LLM to discover
- make multi-page documentation changes safer to plan, preview, and apply
- detect stale or inconsistent project truth before teams rely on it

The ten planned capability goals are:
- `plan-change`: convert high-level documentation intent into an approved command plan
- multi-surface batch apply: preview and apply coordinated changes across approved surfaces
- generalized manifest sync: sync typed project documentation bundles beyond validation sessions
- drift and staleness audit: detect stale managed pages and outdated project truth
- cross-document consistency verifier: detect contradictions across project docs
- concurrency-safe push model: prevent overwriting Notion changes made after pull
- project policy packs: make approved project/workspace rules reusable and configurable
- bootstrap doc scaffolding: seed useful docs after project creation
- durable mutation journal: keep an audit record of applied SNPM changes
- LLM-native capability introspection: expose allowed commands, surfaces, flags, and examples in machine-readable form

## Sequencing Rules

Development should follow these rules:
- start with discovery and planning before broader mutation
- add stale-write protection before multi-page apply
- expand manifests before building batch workflows on top of them
- keep policy packs explicit and reviewed before using them for bootstrap behavior
- treat semantic consistency checks as advisory until the structural checks are stable

## Phase 1: LLM Discovery And Planning Safety

Purpose: make SNPM easier for another coding agent to understand before it mutates Notion.

### Sprint 1.1: Capability Map

Goal:
- implement machine-readable capability introspection for the current approved surface

Deliverables:
- `capabilities` or equivalent read-only CLI command
- JSON output describing commands, aliases, required flags, auth modes, surfaces, and examples
- tests proving the capability map stays aligned with the shared help registry

Exit criteria:
- an LLM can discover how to operate the current supported surface without scraping README prose

Feature goals covered:
- LLM-native capability introspection

### Sprint 1.2: Change Planner Preview

Goal:
- add a read-only planner that converts user intent into a proposed SNPM command sequence

Deliverables:
- `plan-change` command in preview-only form
- plan output that names target surfaces, repo-vs-Notion ownership, auth mode, needed files, and exact next commands
- integration with existing `recommend` and `doctor` behavior

Exit criteria:
- a request such as "update roadmap, overview, and release runbook" produces a clear plan with no Notion mutation

Feature goals covered:
- `plan-change`

## Phase 2: Single-Change Safety And Auditability

Purpose: make individual Notion writes safer and easier to review before enabling coordinated multi-page changes.

### Sprint 2.1: Concurrency-Safe Push

Goal:
- prevent stale local files from overwriting newer Notion page content

Deliverables:
- base revision metadata in pull outputs or sidecar metadata
- push-time stale detection for managed pages
- clear remediation output for re-pull, re-diff, or merge

Exit criteria:
- SNPM refuses to apply a body update if the Notion page changed after the editing base was pulled

Feature goals covered:
- concurrency-safe push model

### Sprint 2.2: Mutation Journal

Goal:
- persist a durable local audit trail for applied changes

Deliverables:
- local journal entries for every `--apply` mutation
- target path, command, auth mode, timestamp, diff summary, and source file metadata
- a read-only command to inspect recent mutations

Exit criteria:
- a reviewer can answer what SNPM changed without relying on terminal scrollback

Feature goals covered:
- durable mutation journal

## Phase 3: Typed Bundles And Coordinated Apply

Purpose: move from one-page operations to planned documentation bundles while keeping the existing preview-first model.

### Sprint 3.1: Generalized Manifest V2

Goal:
- extend manifest-backed checking and local-file pull beyond validation sessions without adding new Notion mutation semantics

Deliverables:
- typed manifest entries for managed docs, planning pages, runbooks, and validation sessions
- manifest validation that rejects unsupported surfaces and path escapes
- `sync check` support for all approved manifest entry types
- `sync pull` support that previews or writes local markdown files plus per-entry sidecar metadata
- clear separation from the existing validation-session v1 artifact sync lane

Exit criteria:
- a project can describe and locally refresh a deterministic documentation bundle in one manifest without using arbitrary page IDs

Feature goals covered:
- generalized manifest sync

Status:
- active `codex/manifest-v2-pull` scope includes `sync check` and local-file `sync pull`
- supported v2 entry kinds are `planning-page`, `project-doc`, `template-doc`, `workspace-doc`, `runbook`, and `validation-session`
- each entry uses a relative `file` plus `pagePath`, `docPath`, or `title` depending on the surface
- manifest v2 `sync pull --apply` writes local files and `<file>.snpm-meta.json` sidecars only; it does not mutate Notion or append mutation journal entries
- manifest v2 `sync push` remains rejected until stale checks, recovery, and batch-apply semantics are designed
- manifest v1 remains the specialized validation-session artifact-sync lane with its existing `sync check`, `sync pull`, and `sync push` behavior

### Sprint 3.2: Manifest Push And Batch Semantics

Goal:
- support stale-safe mixed-surface writes for approved project documentation bundles

Deliverables:
- `sync push` for the generalized manifest
- per-entry push preview output and failure isolation
- project-token-safe execution where applicable
- reuse or extend the manifest v2 pull sidecar metadata model before allowing mixed-surface writes

Exit criteria:
- an LLM can pull, edit, diff, and push a typed documentation bundle with stale-write protection and without hand-sequencing every page command

Feature goals covered:
- generalized manifest sync

### Sprint 3.3: Batch Apply

Goal:
- apply coordinated approved changes only after a full bundle preview

Deliverables:
- batch preview that summarizes all planned changes before apply
- ordered apply with stop-on-failure behavior
- per-target recovery guidance and journal entries

Exit criteria:
- multi-page documentation changes can be reviewed as one planned operation and applied without broadening SNPM into arbitrary page mutation

Feature goals covered:
- multi-surface batch apply

## Phase 4: Project Bootstrap And Policy Scale

Purpose: reduce setup friction while keeping workspace rules explicit and reviewable.

### Sprint 4.1: Project Policy Packs

Goal:
- make project shape and managed-surface policy reusable across workspaces and project types

Deliverables:
- versioned policy-pack schema
- config validation for reserved roots, curated docs, optional surfaces, and starter docs
- migration guidance for existing workspace config

Exit criteria:
- SNPM can support more than one approved project shape without code changes to policy logic

Feature goals covered:
- project policy packs

### Sprint 4.2: Bootstrap Doc Scaffolding

Goal:
- optionally seed useful managed docs when a project is created

Deliverables:
- preview-first project doc scaffolding after `create-project`
- policy-pack-driven starter docs such as Root overview, operating model, and first roadmap body
- clear separation between starter content and project-specific truth

Exit criteria:
- a new project can start with a usable documentation surface without requiring manual page creation

Feature goals covered:
- bootstrap doc scaffolding

## Phase 5: Truth Quality And Cross-Doc Consistency

Purpose: move verification from structural correctness toward useful operational truth checks.

### Sprint 5.1: Drift And Staleness Audit

Goal:
- detect project docs that are structurally valid but operationally stale

Deliverables:
- stale `Last Updated` checks for managed docs
- empty-section and placeholder detection for important surfaces
- roadmap and current-cycle freshness checks

Exit criteria:
- `doctor` can identify pages that need attention even when the Notion shape is technically valid

Feature goals covered:
- drift and staleness audit

### Sprint 5.2: Cross-Document Consistency Rules

Goal:
- catch contradictions across approved project surfaces

Deliverables:
- first rules for roadmap/current-cycle alignment, runbook references, and Access record references
- advisory severity levels before hard failures
- test fixtures for false-positive control

Exit criteria:
- SNPM can report likely contradictions without blocking ordinary safe mutations prematurely

Feature goals covered:
- cross-document consistency verifier

## Phase 6: Planner Integration

Purpose: connect the planning layer to the safer mutation and audit layers.

### Sprint 6.1: Plan-To-Manifest

Goal:
- allow `plan-change` to emit a manifest draft when a request spans multiple surfaces

Deliverables:
- planner output that can be saved as a manifest
- explicit file naming and target path conventions
- validation that generated manifests stay within approved surfaces

Exit criteria:
- an LLM can move from intent to checked bundle without manually authoring every manifest entry

Feature goals covered:
- `plan-change`
- generalized manifest sync
- multi-surface batch apply

### Sprint 6.2: Plan Quality Gates

Goal:
- make plans self-checking before mutation

Deliverables:
- planner warnings from drift audit and consistency rules
- journal linkage from applied batch back to the originating plan
- stable JSON output suitable for Codex or another coding agent

Exit criteria:
- a planned multi-surface update carries enough context to review, apply, audit, and diagnose later

Feature goals covered:
- `plan-change`
- drift and staleness audit
- cross-document consistency verifier
- durable mutation journal

## Recommended First Milestone

The first milestone should stop after Phase 2:
- LLM-readable capability map
- read-only `plan-change`
- stale-write protection
- mutation journal

That milestone improves daily operator safety and LLM usability without expanding the mutation surface.

Milestone 1 implementation status:
- `capabilities` is implemented as JSON-only CLI introspection sourced from the shared help registry
- `plan-change` is implemented as a deterministic read-only target-file planner
- managed pull commands now write strict metadata sidecars, and apply paths reject missing, mismatched, stale, archived, or trashed metadata before mutation
- applied mutations now append redacted local journal entries with command, surface, target, page, revision, timestamp, and diff hash/stat metadata
- the next development phase should start with generalized manifest sync rather than expanding ad hoc page mutation

## Deferred Work

These should remain out of scope until the phased plan proves itself:
- arbitrary Notion page CRUD
- automatic project-token integration creation
- broad UI automation outside the validation-session bundle
- semantic rewriting of docs without explicit local review
- replacing the repo-first truth boundary for implementation notes, specs, and investigations
