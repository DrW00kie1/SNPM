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
- core-band stdin/stdout ergonomics on `codex/doctor`
- intent-driven truth routing on `codex/truth-routing`
- paused experimental Chromium-only `validation-bundle` UI automation on `codex/validation-bundle`

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
- the important problem was discoverability, guardrails, and day-to-day friction, not raw Notion access
- simple updates still feel too choreographed when they require temp files and multiple commands

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
- duplication is now the failure mode to guard against, not just missing automation

## Roadmap Reset

### Phase 0: Stabilize and publish the real baseline
- publish the currently useful post-`sprint-3-validation-sessions` baseline more cleanly, or explicitly pause slices that are not ready
- bring README, this roadmap, and the live SNPM planning pages back into alignment with what is actually published versus local
- keep the Access direction, but do not pre-populate project Access pages again

### Phase 1: Make the narrow band easier to use
- do not add new major surfaces yet
- improve the current primary band:
  - planning-page sync
  - managed runbooks
  - managed Access records
- remove temp-file choreography from the core band with stdin/stdout support
- keep preview-first behavior and project-token boundaries unchanged

### Phase 2: Add truth routing and migration guidance
- add a project-level doctor/recommend layer that tells an operator:
  - which managed surfaces are present
  - which are missing
  - which are unmanaged but adoptable
  - what command to run next
- the first read-only scan shipped on `codex/doctor`
- the next layer is now implemented on `codex/truth-routing`:
  - should this update live in Notion?
  - should it live in the repo?
  - which exact approved SNPM command should run next?
- the next follow-on inside this phase is migration guidance for recurring legacy patterns surfaced by `doctor`
- add surface-specific adoption planners before widening broad verification further
- keep `verify-project` as the structural contract, but pair it with narrow per-surface health checks

### Phase 3: Build the workflow layer
- only after ergonomics and truth routing are in place, define first-class workflow bundles around real jobs:
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
- pipe-friendly planning-page, runbook, and Access updates with stdin/stdout
- truth routing is now implemented on `codex/truth-routing`
- the next product slice after truth routing is migration guidance for recurring legacy patterns before broader workflow bundles

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

Paused experimental work:
- `codex/validation-bundle` preserves the Chromium UI automation lane
- it is not the active near-term publication target
- `validation-sessions verify --bundle` remains the supported API-visible check while the browser lane stays paused

## Guardrails

Keep these boundaries:
- project token stays the default safety boundary
- approved project-owned surfaces stay explicit
- repo sync stays selective
- Notion stays primary unless the repo is clearly the better home
- UI automation remains paused experimental work unless the narrow band proves it is worth resuming
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
