# SNPM Operator Roadmap

SNPM is being re-scoped around one product thesis:

SNPM is not a generic Notion client and not just a bootstrap tool. It is a project-token-safe workflow operator for real project work inside Infrastructure HQ.

## Current Product Line

Published baseline on `main`:
- project bootstrap from `Templates > Project Templates`
- structural `verify-project`
- planning-page body sync for the four approved `Planning` pages
- first-class `runbook` create/adopt/pull/diff/push
- first-class `build-record` create/pull/diff/push under `Ops > Builds`
- first-class `validation-sessions init`
- first-class `validation-session` create/adopt/pull/diff/push
- narrow `validation-sessions verify`
- manifest-backed `sync check`, `sync pull`, and `sync push` for repo-backed validation-session artifacts
- checkbox-first validation-session body contract

Committed development work beyond published `main`:
- triage-first validation-session `Findings` / `Follow-Up` redesign
- first-class project Access surfaces under `Projects > <Project> > Access`
- read-only `snpm doctor` / `snpm recommend` on `codex/doctor`

Important publication boundary:
- the latest published testing tag is still `sprint-3-validation-sessions`
- that tag is older than the current published `main` baseline
- the docs and live planning pages should distinguish published `main`, published testing tags, and committed development-branch work whenever they differ

## What The Usage Has Taught Us

Tall Man signal:
- the most valuable work was not generic CRUD
- the valuable work was workflow quality: narrow verifiers, checkbox-first execution, triage structure, and selective repo sync for durable artifacts

Contour signal:
- the important answer was a safe, project-local workflow for secrets
- the important problem was discoverability and guardrails, not raw Notion access

Cross-repo Codex signal:
- threads want explicit task commands they can shell out to
- if SNPM does not expose the task, they fall back to ad hoc Notion logic

Adoption signal:
- existing-project support is mandatory
- every successful surface family needed `adopt`, narrow verification, or explicit normalization guidance

Boundary signal:
- Notion should stay primary for current operational state
- repo sync should exist only where the repo truly owns the artifact
- project token should stay the default trust boundary
- manual UI steps are acceptable only when they are bounded and documented

## Roadmap Reset

### Phase 0: Stabilize and publish the real baseline
- publish the currently useful post-`sprint-3-validation-sessions` baseline more cleanly, or explicitly pause slices that are not ready
- bring README, this roadmap, and the live SNPM planning pages back into alignment with what is actually published versus local
- keep the Access direction, but do not pre-populate project Access pages again

### Phase 1: Harden the validation-session UI bundle
- finish the validation-session workflow as one complete supported bundle:
  - managed surface
  - sync-safe canonical body
  - supported surrounding Notion UI bundle
  - narrow verification plus operator guidance
- use one blessed bundle:
  - `Active Sessions`
  - `Quick Intake`
  - `Validation Session`
  - manual button wiring
- keep the boundary as docs + verify, not generic UI automation

### Phase 2: Build the workflow layer
- stop framing next work as "more primitives first"
- define first-class workflow bundles around real jobs:
  - validation run lifecycle
  - release/build evidence capture
  - project access record creation/update
  - runbook standardization and maintenance
- each workflow should include:
  - creation/update path
  - adoption path
  - narrow verifier
  - explicit next-step guidance
  - optional repo sync only where it helps

### Phase 3: Add project doctoring and migration support
- add a project-level doctor/recommend layer that tells an operator:
  - which managed surfaces are present
  - which are missing
  - which are unmanaged but adoptable
  - what command to run next
- the first read-only slice is now implemented on `codex/doctor`
- add surface-specific adoption planners before widening broad verification further
- keep `verify-project` as the structural contract, but pair it with narrow per-surface health checks

### Phase 4: Harden cross-repo consumption
- make pinned install/use from other repos a first-class supported path
- publish testing tags more regularly so testers are not forced onto unpublished local checkouts
- add a thin agent-facing wrapper only after the CLI workflows are stable
- keep other repos from embedding workspace ids or workspace policy logic

### Phase 5: Expand only proven surfaces
- add new surfaces only when repeated workflow demand justifies them
- defer broad multi-surface manifest sync, arbitrary CRUD, and generalized workspace automation
- keep "safe named workflows on approved surfaces" as the product boundary

## What SNPM Should Probably Build Next

Current active command-family work:
- `snpm doctor` / `snpm recommend`
- `validation-sessions verify --bundle`
- the next product slice is validation-session UI bundle hardening before broader workflow bundles

Workflow bundles:
- `start validation run`
- `record release build`
- `add project secret`
- `standardize this runbook`
- these should orchestrate existing primitives rather than replace them

Project capability profiles:
- a machine-readable view of which optional project-owned surfaces are present
- this lets Codex threads discover what a project supports without tree spelunking

Workflow-linked evidence:
- the next high-value step after validation/build/access is linking the approved surfaces into coherent operator flows
- examples:
  - build record linked to a validation session
  - validation session linked to release readiness
  - access record linked to the runbook that depends on it

## Guardrails

Keep these boundaries:
- project token stays the default safety boundary
- approved project-owned surfaces stay explicit
- repo sync stays selective
- manual UI-only steps remain bounded and documented
- `Access Index` and other workspace-global surfaces remain out of scope for project-local day-to-day mutation

## How This Experiment Should Be Judged

The question is whether `Notion + SNPM` reduces document sprawl while staying usable and trustworthy for AI-assisted work.

Use `Pass`, `Watch`, or `Fail` for:
- source-of-truth clarity
- agent usability
- safe mutation
- operational freshness
- repo / Notion boundary health
- manual-friction tolerance

Failure signals:
- repeated duplicate docs across repo and Notion
- frequent ad hoc one-off scripts or manual structure fixes
- low trust in page accuracy or page location
- too many critical workflows blocked by Notion UI friction

The living scorecard should stay in `Projects > SNPM > Planning > Roadmap`. This file is the supporting reference.
