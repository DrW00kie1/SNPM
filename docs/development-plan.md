# SNPM Development Plan

This document turns the next set of SNPM product ideas into a step-wise development plan.
Milestones marked implemented are shipped or merge-ready; future phases remain proposed direction. The shipped surface remains documented in the README and operator roadmap.

The goal is to make SNPM a better utility for coding LLMs that need to create and maintain project documentation in Notion without turning it into a generic workspace CRUD tool.

## Product Direction

SNPM should improve in three ways:
- make the allowed Notion operating model easier for an LLM to discover
- make multi-page documentation changes safer to plan, preview, and apply
- eventually detect stale or inconsistent project truth before teams rely on it, after structural policy and safe mutation foundations are stable

The ten planned capability goals are:
- `plan-change`: convert high-level documentation intent into an approved command plan
- multi-surface batch apply: preview and apply coordinated changes across approved surfaces
- generalized manifest sync: sync typed project documentation bundles beyond validation sessions
- drift and staleness audit: detect stale managed pages and outdated project truth
- cross-document consistency verifier: detect contradictions across project docs
- concurrency-safe push model: prevent overwriting Notion changes made after pull
- project policy packs: make approved project/workspace rules explicit, reusable, and reviewable
- bootstrap doc scaffolding: seed useful docs after project creation
- read-only truth-quality audit: report stale or underfilled durable Notion truth without mutating it
- durable mutation journal: keep an audit record of applied SNPM changes
- LLM-native capability introspection: expose allowed commands, surfaces, flags, and examples in machine-readable form

## Sequencing Rules

Development should follow these rules:
- start with discovery and planning before broader mutation
- add stale-write protection before multi-page apply
- expand manifests before building batch workflows on top of them
- keep policy packs explicit and reviewed before using them for bootstrap behavior
- treat semantic consistency checks as advisory until the structural checks are stable

Current policy-pack foundation scope:
- make the existing Infrastructure HQ project starter tree, reserved roots, managed-doc boundaries, curated workspace/template docs, and routing boundaries explicit as reusable policy
- preserve existing command behavior and the current workspace config contract
- do not add policy-pack-driven mutation, policy-pack-owned consistency checks, manifest create/adopt, rollback, automatic retries, transaction semantics, or broad batch apply

Sprint 4.2 extends that policy layer with preview-first starter doc scaffolding. The scaffold contract is policy data; `scaffold-docs` writes only local review files with `--output-dir` and leaves Notion mutation to the generated owning command-family steps.

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
- extend manifest-backed checking, local-file pull, and guarded existing-target push beyond validation sessions without adding arbitrary Notion mutation semantics

Deliverables:
- typed manifest entries for managed docs, planning pages, runbooks, and validation sessions
- manifest validation that rejects unsupported surfaces and path escapes
- `sync check` support for all approved manifest entry types
- `sync pull` support that previews or writes local markdown files plus per-entry sidecar metadata
- guarded `sync push` support that previews by default and requires sidecar metadata from v2 pull before `--apply`
- clear separation from the existing validation-session v1 artifact sync lane

Exit criteria:
- a project can describe, locally refresh, and guarded-push a deterministic documentation bundle in one manifest without using arbitrary page IDs

Feature goals covered:
- generalized manifest sync

Status:
- `main` includes `sync check`, local-file `sync pull`, guarded `sync push`, opt-in post-push sidecar refresh, targeted entry selection, push review artifacts, mutation limits, selected sidecar refresh behavior, and structured diagnostics after `7a109c6`
- `main` includes explicit reusable project/workspace policy after `4b010d5`, without changing manifest mutation semantics
- supported v2 entry kinds are `planning-page`, `project-doc`, `template-doc`, `workspace-doc`, `runbook`, and `validation-session`
- each entry uses a relative `file` plus `pagePath`, `docPath`, or `title` depending on the surface
- manifest v2 `sync pull --apply` writes local files and `<file>.snpm-meta.json` sidecars only; it does not mutate Notion or append mutation journal entries
- manifest v2 `sync check`, `sync pull`, and `sync push` can target selected entries with `--entry` or `--entries-file`; without selectors, the default preview and check behavior remains whole-manifest
- manifest v2 `sync push --review-output <dir>` writes review artifacts for previewed entries
- manifest v2 `sync push` previews by default; `sync push --apply` requires sidecar metadata produced by v2 pull and applies only when the target still matches the recorded editing base
- default `sync push --apply` allows at most one changed entry unless `--max-mutations` is raised or set to `all`
- default successful `sync push --apply` makes the sidecars stale; the next safe command is `sync pull --apply`
- `sync push --apply --refresh-sidecars` is the explicit opt-in for refreshing sidecar metadata to the post-push base during the applied push; selected applies refresh only selected sidecars for successfully applied entries
- manifest v2 recovery diagnostics are structured result/review metadata with stable codes, severity, entry/target context, safe next command, and recovery action
- manifest v2 still excludes create/adopt, Access/build-record entries, rollback, auto-merge, automatic retries, arbitrary CRUD, semantic consistency checks, generic transaction semantics, and generic batch apply
- manifest v1 remains the specialized validation-session artifact-sync lane with its existing `sync check`, `sync pull`, and `sync push` behavior

### Sprint 3.2: Batch Semantics

Goal:
- build coordinated bundle semantics on top of guarded v2 push without broadening the approved surface

Deliverables:
- richer per-entry push preview output and failure isolation
- project-token-safe execution where applicable
- reviewed recovery rules before adding rollback, auto-merge, automatic retries, or generic batch apply

Exit criteria:
- an LLM can review and apply coordinated documentation-bundle changes without broadening SNPM into arbitrary page mutation

Feature goals covered:
- generalized manifest sync

### Sprint 3.2B: Applied Push Sidecar Refresh Opt-In

Goal:
- let an approved manifest v2 applied push optionally refresh sidecar metadata without making refresh automatic or adding batch semantics

Deliverables:
- `sync push --apply --refresh-sidecars` for manifest v2 bundles
- default `sync push --apply` continues to leave sidecars stale and points operators back to `sync pull --apply`
- scope remains limited to existing approved targets with sidecar stale-write protection

Exit criteria:
- an operator can choose between the conservative default stale-sidecar behavior and explicit post-push sidecar refresh without enabling create/adopt, Access/build-record entries, rollback, auto-merge, automatic retries, arbitrary CRUD, semantic consistency checks, generic transaction semantics, or generic batch apply

### Sprint 3.2C: Targeted Review And Apply Safety Gate

Goal:
- let operators review and apply selected manifest v2 entries without changing the default whole-manifest preview contract or adding generic batch semantics

Deliverables:
- `--entry` and `--entries-file` selectors for manifest v2 `sync check`, `sync pull`, and `sync push`
- push preview artifacts through `--review-output <dir>`
- `sync push --apply` safety gate that allows at most one changed entry by default and requires `--max-mutations <n>` or `--max-mutations all` for broader selected applies
- selected `sync push --apply --refresh-sidecars` behavior that refreshes only selected sidecars for successfully applied entries

Exit criteria:
- an operator can preview the whole manifest by default, narrow review to selected entries when needed, and apply only within an explicit mutation budget while v1 validation-session sync remains separate

Out of scope:
- create/adopt, Access/build-record entries, rollback, auto-merge, automatic retries, arbitrary CRUD, semantic consistency checks, generic transaction semantics, and generic batch apply

### Sprint 3.3: Recovery Diagnostics

Goal:
- make manifest v2 result JSON and review artifacts self-contained for operator recovery without broadening mutation semantics

Deliverables:
- stable diagnostic codes with severity
- entry and target context on manifest v2 diagnostics
- safe next command and recovery action fields for check, pull, push, and review metadata
- compatibility with existing failures, warnings, recovery strings, sidecar state, journal state, and mutation-budget metadata

Exit criteria:
- an operator can diagnose manifest v2 recovery steps from structured output or review artifacts without relying on terminal scrollback

Feature goals covered:
- generalized manifest sync
- LLM-native capability introspection

Out of scope:
- rollback, auto-merge, automatic retries, semantic consistency checks, generic transaction semantics, and generic batch apply

### Sprint 3.3B: Diagnostics Parity

Goal:
- keep CLI help, capability metadata, README guidance, and operator docs consistent about manifest v2 diagnostics for `sync check`, `sync pull`, and `sync push`

Deliverables:
- help text that documents structured result/review diagnostics for v2 check and push, and structured result diagnostics for v2 pull
- capability metadata that exposes diagnostic scope, purpose, fields, and non-goals for v2 check, pull, and push
- docs that describe diagnostics as recovery metadata only, not rollback, automatic retries, semantic consistency checks, transaction semantics, or generic batch apply

Exit criteria:
- an operator or LLM can read help, capabilities JSON, or repo docs and get the same bounded diagnostics contract for v2 check, pull, and push

Feature goals covered:
- generalized manifest sync
- LLM-native capability introspection

Out of scope:
- rollback, auto-merge, automatic retries, semantic consistency checks, transaction semantics, and generic batch apply

## Phase 4: Project Bootstrap And Policy Scale

Purpose: reduce setup friction while keeping workspace rules explicit and reviewable.

### Sprint 4.1: Project Policy Packs

Goal:
- make the current Infrastructure HQ project shape and managed-surface policy explicit, reusable, and reviewable before supporting additional project shapes

Deliverables:
- policy-pack foundation that normalizes the existing workspace config into reusable policy
- optional top-level `policyPack` v1 config object for explicit reviewable policy declarations
- config validation for reserved roots, curated docs, optional surfaces, and starter-tree pages
- migration guidance that keeps the existing workspace config shape valid while making policy ownership explicit
- docs that separate reusable policy from future audits, consistency checks, starter-doc scaffolding, and broad apply workflows

Exit criteria:
- SNPM can consume current project and workspace rules through a reusable policy layer without changing existing command behavior
- future project-shape changes can be reviewed as policy changes instead of hidden code-only edits

Feature goals covered:
- project policy packs

Status:
- `main` includes the project-policy foundation as an explicit reusable policy slice
- no new public policy-pack CLI command or capability metadata is exposed unless implementation adds a public surface

Out of scope:
- drift or staleness audit
- cross-document consistency checks
- starter-doc scaffolding
- manifest create/adopt entries
- rollback, automatic retries, transaction semantics, and broad batch apply

### Sprint 4.2: Bootstrap Doc Scaffolding

Goal:
- optionally seed useful project documentation after a project is created, without hiding Notion mutation inside bootstrap

Deliverables:
- preview-first `scaffold-docs` command and npm script after `create-project`
- preview by default, with local file output only when `--output-dir` is supplied and no direct Notion mutation
- optional `policyPack.starterDocScaffold` v1 config with backward-compatible defaults
- default starter drafts for `Root > Overview`, `Root > Operating Model`, `Planning > Roadmap`, and `Planning > Current Cycle`
- family-level help for advertised command families and docs aligned to the supported surface list
- clear separation between starter content and project-specific truth

Exit criteria:
- a new project can start with a usable documentation surface without requiring manual page drafting
- an operator can preview the starter scaffold before writing local drafts or running any generated Notion apply command
- help, capabilities, README, and operator docs describe the same supported surfaces and command-family boundaries

Feature goals covered:
- bootstrap doc scaffolding

Supported scaffold surfaces:
- `project-doc` for approved project managed-doc targets such as `Root > Overview` and `Root > Operating Model`
- `planning-page` for approved planning pages such as `Planning > Roadmap` and `Planning > Current Cycle`

Out of scope:
- direct scaffold Notion mutation
- mutating targets outside the approved starter scaffold list
- creating arbitrary managed docs outside the policy
- treating `Planning` as a `doc-*` surface
- broad batch apply, rollback, automatic retries, transaction semantics, drift audit, or semantic consistency checks

## Phase 5: Truth Quality And Cross-Doc Consistency

Purpose: move verification from structural correctness toward useful operational truth checks.

### Sprint 5.1: Drift And Staleness Audit

Goal:
- detect project docs that are structurally valid but operationally stale without mutating Notion

Deliverables:
- `doctor --truth-audit` as a read-only extension to the project health scan
- stale `Last Updated` checks for managed docs
- empty-section and placeholder detection for important surfaces
- roadmap and current-cycle freshness checks

Exit criteria:
- `doctor --truth-audit` can identify pages that need attention even when the Notion shape is technically valid

Status:
- promoted as an advisory truth-quality audit on the active line
- no Notion mutation, sidecar refresh, manifest apply, rollback, retry, or transaction behavior
- remediation stays on the owning `doc-*`, `page-*`, or `runbook-*` command family after review
- Access secret and token records remain consume-only; truth-audit must not create raw local export, editable sidecars, or push-ready secret files

Feature goals covered:
- drift and staleness audit

### Sprint 5.1B: Write-Only Generated Secret Ingestion

Goal:
- let coding agents create or rotate a generated secret/token and store it in Notion without exposing the raw value in chat, CLI literals, local files, sidecars, diffs, review artifacts, or journals

Deliverables:
- `secret-record-generate` and `access-token-generate` under the Access command family
- preview mode that validates target feasibility without running the generator or mutating Notion
- apply mode that runs one child generator command, captures one stdout value in memory, stores it directly in the managed Access record, and suppresses/redacts child output
- create/update modes with explicit target-state checks and stale-write protection on update
- help, capabilities, recommend output, and docs that keep consume-only runtime access separate from write-only generated ingestion

Exit criteria:
- an agent can generate a PostgreSQL DSN, project token, or similar single-line credential and store it in the correct Access record without pasting it into the thread or writing it to disk
- secret-bearing pulls remain redacted-only, `exec` remains the runtime consumption lane, and local raw export/edit/diff/push remain unsupported

Out of scope:
- raw value flags, stdin/env/file secret input, multiline secrets, raw export, metadata sidecars, review output, manifest v2 Access entries, automatic rotation, rollback, retries, and generic credential management

Durable Notion closeout draft:
- SNPM adds a write-only generated secret/token ingestion lane for Access records. `secret-record-generate` and `access-token-generate` run a child generator only under `--apply`, store the generated stdout value directly in Notion, and keep raw values out of chat, local files, sidecars, diffs, review artifacts, terminal output, and journals. Runtime use remains consume-only through `secret-record-exec` and `access-token-exec`; raw local export and secret-bearing local edit/diff/push remain unsupported.

### Sprint 5.2: Cross-Document Consistency Rules

Goal:
- catch contradictions across approved project surfaces

Deliverables:
- first rules for roadmap/current-cycle alignment, runbook references, and Access record references
- advisory severity levels before hard failures
- test fixtures for false-positive control

Exit criteria:
- SNPM can report likely contradictions without blocking ordinary safe mutations prematurely

Status:
- Sprint 5.2A introduces the first advisory read-only slice through `doctor --consistency-audit` and `npm run consistency-audit`
- the audit reports explicit cross-document contradictions across approved project surfaces, including Roadmap/Current Cycle active-marker alignment, explicit runbook references, and explicit Access references
- Access checks use structural domain/record inventory only; the audit must not inspect raw Access secret/token bodies or add raw local export/edit/diff/push behavior
- findings are advisory project-health output only and do not mutate Notion, write local files, write sidecars, append mutation journal entries, apply manifests, generate fixes, change default `doctor` output, change top-level `ok` or exit behavior, or introduce blocking gates
- hard failures, automatic remediation, planner quality gates, broader semantic inference, and consistency checks outside the explicit v1 rule set remain future work

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
- secret-bearing Access commands use consume-only runtime access with redacted-only pulls plus write-only generated ingestion for agent-created values; raw local export and local markdown edit/diff/push are unsupported for secret/token records
- the next development phase should start with generalized manifest sync rather than expanding ad hoc page mutation

## Deferred Work

These should remain out of scope until the phased plan proves itself:
- arbitrary Notion page CRUD
- automatic project-token integration creation
- broad UI automation outside the validation-session bundle
- semantic rewriting of docs without explicit local review
- replacing the repo-first truth boundary for implementation notes, specs, and investigations
