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
- [ ] Add markdown-backed page sync first: `page pull`, `page push`, `page diff`, `sync check`, `sync push`
- [ ] Add scaffold and broader verification commands second: `workspace verify`, `scaffold runbook`, `scaffold vendor`, `scaffold access-domain`, `scaffold incident`

## Notion Strategy Doc Migration

- [x] Preserve the current HQ runbooks as procedural pages and keep the broader strategy content in `Projects > SNPM`
- [x] Rewrite `Projects > SNPM > Planning > Roadmap` with the adapted operator roadmap content while preserving its header structure
- [x] Rewrite `Projects > SNPM > Planning > Current Cycle`, `Backlog`, and `Decision Log` with summarized planning content from the repo docs
- [x] Read back the four planning pages after the update and confirm the content is adapted, summary-first, and clearly separates shipped behavior from planned capability
- [ ] Resolve the unexpected extra `Projects > SNPM > Templates` child page now surfaced by project verification, because it falls outside the starter-tree contract

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
- [ ] Add a short tester workflow doc for direct-clone testing, trusted live validation, issue filing, and the maintainer fix loop
- [ ] Add GitHub issue templates plus template config while keeping blank issues enabled
- [ ] Update `README.md` so testers can find the GitHub testing workflow and the current tagged snapshot
- [ ] Run repo-level validation again before publishing the baseline
- [ ] Commit the current validated repo state to `main`
- [ ] Push the baseline to GitHub
- [ ] Create the first tagged testing snapshot for the public test round
- [ ] Seed the lightweight GitHub label set for bug intake and triage
- [ ] Confirm the tag, labels, and issue templates are visible on GitHub
