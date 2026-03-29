# Plan

## Milestone 1

Stand up SNPM as the canonical Infrastructure HQ Notion automation repo while preserving the currently validated project bootstrap behavior.

## Steps

- [ ] Keep the bootstrap and verification behavior equivalent to the validated source script
- [ ] Move workspace config into this repo
- [ ] Preserve older Notion maintenance scripts under `legacy/`
- [ ] Add clear workspace-operating docs
- [ ] Update live Notion workflow pages to reference SNPM
- [ ] Reduce `tall-man-training` docs to a short pointer to SNPM
- [x] Verify the new commands against the live workspace

## External Usage

- [x] Document the fresh-project workflow for non-SNPM Codex threads that have access to `C:\\SNPM`
- [x] Make the bootstrap docs explicit that outside repos should use SNPM as a local control repo instead of copying scripts or config
- [x] Keep project-token setup documented as deferred until repo-local Notion automation is needed
- [x] Validate safe cross-repo invocation from a non-SNPM working directory

## SNPM Self-Bootstrap Live Test

- [x] Harden `src/cli.mjs` so expected failures set `process.exitCode` instead of calling `process.exit(...)`
- [x] Re-run missing-project verification for `SNPM` and confirm it exits cleanly without the Windows async-handle assertion
- [x] From a non-SNPM workdir, run `npm run create-project -- --name "SNPM"` using `C:\\SNPM` as the control checkout
- [x] Run `npm run verify-project -- --name "SNPM"` without a project token immediately after bootstrap
- [x] Read back the live `Projects > SNPM` subtree and confirm the expected starter pages exist

## Documentation Alignment

- [x] Add a roadmap doc that separates shipped behavior from the chosen next-phase operator direction
- [x] Refresh README, handoff, research, and plan docs so maintainers and Codex threads can clearly tell what exists now versus what is planned
- [x] Add light-touch roadmap pointers to the current usage docs without changing the trusted current command guidance

## Chosen Next-Phase Architecture

- [ ] Upgrade off the currently pinned legacy Notion API version as an early enabling step
- [ ] Split SNPM into a richer CLI surface backed by an internal JavaScript core
- [ ] Keep SNPM internal-only and highly opinionated about Infrastructure HQ workspace boundaries
- [ ] Make private Git package installation the default model for other repos
- [ ] Keep CLI usage as the primary integration path for other Codex threads

## Planned Command Sequencing

- [ ] Keep `create-project` and `verify-project` as the trusted current command surface
- [x] Add markdown-backed page sync first: `page pull`, `page push`, `page diff`
- [x] Add first-class project-token day-to-day commands next: `runbook create`, `runbook adopt`, `runbook pull`, `runbook diff`, `runbook push`, `build-record create`, `build-record pull`, `build-record diff`, `build-record push`
- [x] Add validation-session reporting next: `validation-sessions init`, `validation-session create`, `validation-session adopt`, `validation-session pull`, `validation-session diff`, `validation-session push`
- [ ] Add manifest-backed sync after that: `sync check`, `sync push`
- [ ] Add scaffold and broader verification commands later: `workspace verify`, `scaffold vendor`, `scaffold access-domain`, `scaffold incident`

## Notion Strategy Doc Migration

- [x] Preserve the current HQ runbooks as procedural pages and keep the broader strategy content in `Projects > SNPM`
- [x] Rewrite `Projects > SNPM > Planning > Roadmap` with the adapted operator roadmap content while preserving its header structure
- [x] Rewrite `Projects > SNPM > Planning > Current Cycle`, `Backlog`, and `Decision Log` with summarized planning content from the repo docs
- [x] Read back the four planning pages after the update and confirm the content is adapted, summary-first, and clearly separates shipped behavior from planned capability
- [x] Reconfirm the live project-root child-page contract after the later Tall Man Training mirror work and keep verification green

## Project Root Landing Page Normalization

- [x] Compare the live `Tall Man Training`, `SNPM`, and `Project Templates` root pages and confirm the actual section differences before mutating anything
- [x] Record the comparison and the body-only normalization decision in `research.md`
- [x] Rewrite `Projects > SNPM` below the existing header metadata so it uses the richer Tall Man Training-style landing-page structure with SNPM-specific content
- [x] Rewrite `Templates > Project Templates` below the existing header metadata so it uses the same structure with generalized template wording
- [x] Preserve the existing root child-page set and the starter-tree contract while doing both rewrites
- [x] Read back both pages and confirm the new body structure is in place without child-page drift
- [x] Run `npm run verify-project -- --name "SNPM"` after the live edits to confirm the project structure still passes

## Experiment Success Criteria Rollout

- [x] Capture the layered evaluation model and the need for explicit pass / watch / fail criteria in `research.md`
- [x] Update `docs/operator-roadmap.md` with a concise reference version of the experiment scorecard and review cadence while keeping Notion as the primary living scorecard
- [x] Rewrite `Projects > SNPM > Planning > Roadmap` so it includes the broader viability question, the pass / watch / fail criteria, and explicit failure signals
- [x] Rewrite `Projects > SNPM > Planning > Current Cycle` so it includes immediate success gates and the recurring testing cadence
- [x] Add a dated Decision Log note that SNPM is being evaluated with a layered scorecard rather than gut feel alone
- [x] Add a Backlog item for gathering evidence on markdown-sync viability and real cross-repo adoption
- [x] Read back the updated planning pages and confirm the current-vs-planned framing still reads clearly
- [x] Run `npm run verify-project -- --name "SNPM"` after the live updates to confirm the project subtree still passes

## Sprint 1 Foundation And Safety Rails

- [x] Record the current repo shape, official Notion API upgrade target, and the no-new-dependency testing approach in `research.md`
- [x] Upgrade the pinned Notion API version to `2026-03-11` without changing the public command surface
- [x] Normalize the low-level Notion client error model and make the fetch path testable
- [x] Split the current large project bootstrap module into smaller internal modules while preserving current behavior
- [x] Add a built-in Node test harness for config loading, project path modeling, block rewriting, supported-block rejection, and normalized client failure handling
- [x] Run the automated tests locally
- [x] Re-run `create-project` and `verify-project` regression checks from `C:\\SNPM`
- [x] Dogfood the verification command from a non-SNPM repo context such as `C:\\tall-man-training`

## GitHub Testing Loop Rollout

- [x] Record the current GitHub repo state, tester constraints, and light-structure rollout direction in `research.md`
- [x] Add a short tester workflow doc for direct-clone testing, trusted live validation, issue filing, and the maintainer fix loop
- [x] Add GitHub issue templates plus template config while keeping blank issues enabled
- [x] Update `README.md` so testers can find the GitHub testing workflow and the current tagged snapshot
- [x] Run repo-level validation again before publishing the baseline
- [x] Commit the current validated repo state to `main`
- [x] Push the baseline to GitHub
- [x] Create the first tagged testing snapshot for the public test round
- [x] Seed the lightweight GitHub label set for bug intake and triage
- [x] Confirm the tag, labels, and issue templates are visible on GitHub

## Sprint 2 Planning-Page Sync Slice

- [x] Record the live markdown-endpoint viability, body-only ownership model, project-token-preferred auth model, and approved target scope in `research.md`
- [x] Update `Projects > SNPM > Planning > Roadmap` so Sprint 2 is the active next build step
- [x] Update `Projects > SNPM > Planning > Current Cycle` with Sprint 2 objective, success gates, and validation path
- [x] Update `Projects > SNPM > Planning > Backlog` to move later sync and manifest work out of the active sprint
- [x] Update `Projects > SNPM > Planning > Decision Log` with the Sprint 2 sync decisions
- [x] Add page-target resolution for approved planning pages only
- [x] Add markdown page pull, diff, and push services with body-only ownership and project-token-preferred auth
- [x] Add CLI support and npm script wrappers for `page pull`, `page diff`, and `page push`
- [x] Add automated tests for target resolution, header/body splitting, markdown rejection paths, token selection, and CLI parsing
- [x] Update README, roadmap, and GitHub testing docs for the new command surface
- [x] Run unit tests plus live dogfood on `Projects > SNPM > Planning`
- [x] Run cross-repo validation from `C:\\tall-man-training`
- [x] Update the live SNPM planning pages again through the new page-sync commands so they describe Sprint 2 as shipped and validated
- [x] Publish the `sprint-2-planning-sync` GitHub testing snapshot so external testers can target page sync by tag instead of `main`

## Project-Token Day-To-Day Operations

- [x] Record the issue analysis, downstream usage signal, and re-scope decision in `research.md`
- [x] Comment on GitHub issue `#1` that Sprint 2 partially addressed Planning, and map the remaining gap to project-token-safe operations beyond Planning
- [x] Comment on GitHub issue `#2` that it is now the active implementation slice for approved project-owned surfaces
- [x] Update SNPM Notion planning pages so the next milestone is first-class project-token day-to-day operations rather than manifest sync
- [x] Add approved target resolution for `Runbooks` and `Ops > Builds`
- [x] Add managed templates for runbooks, build records, and the optional `Ops > Builds` container
- [x] Add `runbook create`, `runbook adopt`, `runbook pull`, `runbook diff`, and `runbook push`
- [x] Add `build-record create`, `build-record pull`, `build-record diff`, and `build-record push`
- [x] Keep project-token auth as the documented normal path, with workspace-token fallback still constrained to project-owned approved surfaces
- [x] Rework verification so required starter-tree pages remain mandatory while approved dynamic descendants and the optional `Ops > Builds` extension are verified instead of rejected
- [x] Add unit and CLI tests for adoption, managed create flows, approved-surface validation, and relaxed-but-safe verification
- [x] Create persistent SNPM validation fixtures for one managed runbook and one managed build record, then round-trip them with `SNPM_NOTION_TOKEN`
- [x] Run cross-repo validation from `C:\\tall-man-training` for at least one runbook command and one build-record command
- [x] Update README, roadmap, testing docs, and the live SNPM planning pages to reflect the new next milestone and command surface

## Validation Session Reporting

- [x] Update `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` first so the living plan reflects validation-session reporting as the next milestone
- [x] Record the issue `#3` analysis, live workspace findings, and v1 database/form boundary in `research.md`
- [x] Comment on GitHub issue `#3` that it is now the active implementation slice for the next milestone
- [x] Add approved target resolution for `Ops > Validation > Validation Sessions`
- [x] Add managed data-surface helpers for creating, retrieving, and verifying the `Validation Sessions` database-backed surface
- [x] Add first-class `validation-sessions init`
- [x] Add `validation-session create`, `validation-session adopt`, `validation-session pull`, `validation-session diff`, and `validation-session push`
- [x] Use YAML front matter plus managed markdown body content for validation-session files
- [x] Rework verification so `Validation Sessions` is allowed only as an optional extension under `Ops > Validation`
- [x] Include validation-session descendants in project-token scope verification without weakening unrelated drift checks
- [x] Add unit and CLI tests for initialization, schema checks, title lookup, front-matter handling, preview/apply behavior, and verification
- [x] Create persistent SNPM validation-session fixtures under `Projects > SNPM > Ops > Validation`
- [x] Run cross-repo validation from `C:\\tall-man-training` for at least one validation-session command
- [x] Update `Infrastructure HQ Home` only after the feature path is validated
- [x] Update `Templates > Project Templates > Ops > Validation` so new projects point to the Validation Sessions extension workflow
- [x] Add repo docs for the validation-session workflow and the bounded manual form-view step
- [x] Update README and roadmap docs to reflect the shipped validation-session surface after implementation

## Existing-Project Validation-Session Adoption

- [x] Record the issue `#4` analysis and adoption-clarity scope in `research.md`
- [x] Update `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` first so the living plan reflects the adoption-clarity milestone
- [x] Comment on GitHub issue `#4` with the accepted scope: publish the current validation-session slice, add explicit adoption docs, and add `validation-sessions verify`
- [x] Publish the validated local validation-session slice to `origin/main`
- [x] Create the `sprint-3-validation-sessions` testing snapshot tag
- [x] Add `validation-sessions verify --project "<Project>" [--project-token-env TOKEN_ENV]` as a narrow surface-only verifier
- [x] Add `nextStep` guidance to `validation-sessions init --apply`, `validation-session create --apply`, and `validation-session adopt --apply`
- [x] Update validation-session docs, tester workflow docs, and README so published-vs-local availability and the existing-project adoption path are explicit
- [x] Add automated tests for the new verifier and the new `nextStep` fields
- [x] Run live validation on `Projects > SNPM` and `Projects > Tall Man Training` to prove the narrow verifier distinguishes healthy validation-session adoption from unrelated broad project drift
- [x] Confirm the new tag exists remotely and the tester docs point to it

## Manifest-Backed Validation-Session Artifact Sync

- [x] Record the validation-session-only manifest-sync rationale and Tall Man Training consumer signal in `research.md`
- [x] Update `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` first so the living plan reflects validation-session artifact sync as the next milestone
- [x] Add repo-local manifest support with `version`, `workspace`, `project`, and validation-session `entries`
- [x] Add `sync check --manifest <path> [--project-token-env TOKEN_ENV]`
- [x] Add `sync pull --manifest <path> [--project-token-env TOKEN_ENV] [--apply]`
- [x] Add `sync push --manifest <path> [--project-token-env TOKEN_ENV] [--apply]`
- [x] Add npm wrappers for `sync-check`, `sync-pull`, and `sync-push`
- [x] Keep sync limited to existing managed validation-session rows; do not implicitly initialize, create, or adopt
- [x] Add automated tests for manifest parsing, duplicate validation, relative path resolution, preview/apply behavior, and missing-row / unmanaged-row / missing-surface failures
- [x] Add a focused sync doc for the manifest workflow and update README, roadmap, and GitHub testing docs after implementation
- [x] Dogfood the manifest workflow in `C:\\tall-man-training` by adding `snpm.sync.json` and updating the Tall Man Training validation-session docs to use it
- [x] Run live sync validation on `Tall Man Training` plus cross-repo execution from `C:\\tall-man-training`

## Checkbox-First Validation-Session Workflow

- [x] Record the issue `#5` analysis and the checkbox-first workflow re-scope in `research.md`
- [x] Update `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` first so the living plan reflects the checkbox-first validation-session milestone
- [x] Comment on GitHub issue `#5` with the accepted scope: checkbox-first validation-session workflow, live Tall Man migration, and manual template/button setup only
- [x] Change the managed validation-session default body to the checkbox-first contract while keeping the current row schema unchanged
- [x] Update validation-session docs and workflow docs so the primary human flow is checklist execution in Notion plus optional repo sync afterward
- [x] Update the Tall Man validation-session artifact template and related workflow docs to match the checkbox-first contract
- [x] Migrate a controlled SNPM validation-session fixture to the checkbox-first body and prove `create`, `pull`, `diff`, and `push` round-trip cleanly
- [x] Migrate the active `Tall Man Training` iPhone/TestFlight validation-session artifact and live row to the checkbox-first body through the existing sync path
- [x] Document the bounded manual Notion UI step for the Tall Man `Validation Sessions` database template and button
- [x] Add automated tests for checkbox-first default bodies and checkbox markdown round-tripping without weakening the current schema/verification tests
- [x] Finish with clean live validation on `Tall Man Training` using `sync-check` and `validation-sessions-verify`

## 2026-03-29 — Publish `main` and Cut `codex/development`

- [x] Record the current SNPM branch state and publication assumptions in `research.md`.
- [x] Add the branch publication and cut sequence to `plan.md`.
- [ ] Commit the `research.md` and `plan.md` branch-state updates on local `main`.
- [ ] Run `git fetch --prune origin` and confirm whether `origin/main` is still at `4d47b4a`.
- [ ] If `origin/main` has not moved, push local `main` directly to `origin/main`.
- [ ] If `origin/main` has moved and diverged, merge `origin/main` into local `main`, rerun the relevant SNPM validation, and then push the merged `main`.
- [ ] Create `codex/development` from the final published `main` tip.
- [ ] Push `codex/development` to `origin` and set upstream tracking.
- [ ] Confirm `git branch -vv` and `git branch -r` show the expected local and remote branch state after publication.
