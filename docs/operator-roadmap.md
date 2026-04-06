# SNPM Operator Roadmap

SNPM is not a generic Notion connector. The current release-candidate line is an opinionated, project-token-safe operator for a narrow band of real project work inside Infrastructure HQ.

## Current RC Line

Active candidate:
- branch: `codex/rc-0.1.0`
- tag: `v0.1.0-rc.1`

Supported RC surface:
- project bootstrap
- structural `verify-project`
- planning-page body sync for the four approved `Planning` pages
- first-class managed runbooks
- first-class managed Access records
- `doctor`
- intent-driven `recommend`
- stdin/stdout core-band ergonomics
- EOF-stable managed-doc round-trips

Present on the branch but outside RC support:
- `build-record`
- `validation-sessions`
- manifest-backed `sync`
- paused experimental Chromium-only `validation-bundle`

Why this line matters:
- approved-surface mutation only
- project-token-safe paths
- deterministic routing before mutation
- no temp-file choreography on the core band
- text-stable round-trips on the supported doc surfaces

## Roadmap

### Phase 0: Ship the RC cleanly
- align README, this roadmap, testing docs, and the live SNPM planning pages around one RC story
- validate the integrated RC line on `Projects > SNPM`
- keep `main` unchanged until the RC is accepted

### Phase 1: Add migration guidance
- turn recurring `doctor` findings into explicit `migrationGuidance` entries
- add targeted migration guidance to `recommend --intent ...` for runbook and Access legacy cases
- publish one operator playbook so recurring adopt/create-first paths stop living only in maintainer memory
- keep `verify-project` structural and keep `doctor` / `recommend` read-only

### Phase 2: Build workflow bundles
- only after the core band stays stable under real use
- likely first bundles:
  - validation run lifecycle
  - release/build evidence capture
  - project secret management
  - runbook standardization

### Phase 3: Harden cross-repo consumption
- make pinned install/use from other repos a first-class supported path
- publish tags regularly so testers are not forced onto unpublished local checkouts
- add a thin agent-facing wrapper only after the CLI workflows are stable

### Phase 4: Expand only proven surfaces
- add new surfaces only when repeated workflow demand justifies them
- defer broad multi-surface manifest sync, arbitrary CRUD, and generalized workspace automation
- keep "safe named workflows on approved surfaces" as the product boundary

## Guardrails

Keep these boundaries:
- project token stays the default safety boundary
- approved project-owned surfaces stay explicit
- repo sync stays selective
- Notion stays primary unless the repo is clearly the better home
- UI automation remains paused experimental work unless the narrow band proves it is worth resuming
- workspace-global surfaces such as `Access Index` stay out of scope for project-local day-to-day mutation

## Success Criteria

Judge the RC with `Pass`, `Watch`, or `Fail` on:
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

The living scorecard stays in `Projects > SNPM > Planning > Roadmap`. This file is the supporting reference.
