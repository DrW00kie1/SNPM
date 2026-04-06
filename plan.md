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
- [x] Commit the `research.md` and `plan.md` branch-state updates on local `main`.
- [x] Run `git fetch --prune origin` and confirm whether `origin/main` is still at `4d47b4a`.
- [x] If `origin/main` has not moved, push local `main` directly to `origin/main`.
- [ ] If `origin/main` has moved and diverged, merge `origin/main` into local `main`, rerun the relevant SNPM validation, and then push the merged `main`.
- [x] Create `codex/development` from the final published `main` tip.
- [x] Push `codex/development` to `origin` and set upstream tracking.
- [x] Confirm `git branch -vv` and `git branch -r` show the expected local and remote branch state after publication.

## 2026-03-29 — Validation-Session Triage Workflow

- [x] Record the issue `#6` analysis, primitive inventory, and canonical-vs-UI split in `research.md`.
- [x] Add the triage-workflow milestone checklist to `plan.md`.
- [x] Update `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` first so the living plan reflects validation-session triage as the next milestone.
- [x] Comment on GitHub issue `#6` with the accepted scope: improve `Findings` and `Follow-Up`, classify Notion primitives, and keep commands/schema unchanged.
- [x] Change the managed validation-session default body so triage uses markdown-safe Notion primitives instead of plain bullet lists.
- [x] Document and test the canonical triage model:
  - `Findings` uses callout-first entries with optional toggle detail blocks
  - `Follow-Up` uses to-do items
  - buttons/templates/mentions stay UI-layer guidance, not canonical synced structure
- [x] Update validation-session docs, sync docs, roadmap docs, and tester docs with the primitive ranking plus canonical-vs-UI rules.
- [x] Run automated tests covering the new body contract and round-tripping of callout/toggle/to-do markdown.
- [x] Live-validate the new triage body on SNPM-managed validation-session fixtures with pull / diff / push / verify.

## 2026-03-29 — First-Class Project Access Surfaces

- [x] Record the issue `#7` analysis, live Access-template findings, and chosen scope in `research.md`.
- [x] Add the Access-surface milestone checklist to `plan.md`.
- [x] Update `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` first so the living plan reflects Access surfaces as the next milestone.
- [x] Comment on GitHub issue `#7` with the current manual answer for Contour plus the accepted managed-surface scope.
- [x] Add approved target resolution for:
  - `Projects > <Project> > Access`
  - `Projects > <Project> > Access > <Domain>`
  - `Projects > <Project> > Access > <Domain> > <Record>`
- [x] Add managed templates and icons for:
  - Access domain pages
  - secret record pages
  - access token record pages
- [x] Add first-class `access-domain create`, `access-domain adopt`, `access-domain pull`, `access-domain diff`, and `access-domain push`.
- [x] Add first-class `secret-record create`, `secret-record adopt`, `secret-record pull`, `secret-record diff`, and `secret-record push`.
- [x] Add first-class `access-token create`, `access-token adopt`, `access-token pull`, `access-token diff`, and `access-token push`.
- [x] Keep Access mutations confined to `Projects > <Project> > Access` and explicitly out of `Access Index`.
- [x] Rework verification so dynamic descendants under `Access` are allowed while managed Access descendants are recursively validated without weakening unrelated drift checks.
- [x] Add automated tests for Access target resolution, managed templates, create/adopt flows, pull/diff/push round-tripping, missing-domain failures, and verification behavior.
- [x] Add a dedicated repo doc for project Access workflows with:
  - the current manual template-based workflow
  - the new managed SNPM workflow
  - the exact Contour-style path `Access > App & Backend > GEMINI_API_KEY`
- [x] Update README and roadmap/tester docs so Access workflow discovery is easy for Codex threads.
- [x] Live-validate the feature on `Projects > SNPM > Access` by:
  - creating or adopting `App & Backend`
  - creating a managed secret fixture under it
  - creating a managed token fixture under it
  - round-tripping both record types with `SNPM_NOTION_TOKEN`
  - rerunning `verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN`
- [x] After code validation, update the live template library by adding `Secret Record Template` under `Templates > Misc Templates > Project Subpage Templates`.
- [x] After code validation, update `Templates > Project Templates > Access` so it points to the real available template set and no longer references a missing secret template.

## 2026-03-29 — Remove SNPM Access Test Pages Only

- [x] Record the Contour correction in `research.md`: Contour was not mutated; the live test pages exist only under `Projects > SNPM > Access`.
- [x] Record this cleanup sequence in `plan.md` before mutating the live workspace.
- [x] Re-read `Projects > SNPM > Access` immediately before deletion and confirm it contains only:
  - `App & Backend`
  - `App & Backend > GEMINI_API_KEY`
  - `App & Backend > SNPM_NOTION_TOKEN`
- [x] Re-read `Projects > Contour > Access` immediately before deletion and confirm it is still empty.
- [x] Delete the two SNPM Access child record pages first:
  - `Projects > SNPM > Access > App & Backend > GEMINI_API_KEY`
  - `Projects > SNPM > Access > App & Backend > SNPM_NOTION_TOKEN`
- [x] Delete the parent SNPM Access domain page last:
  - `Projects > SNPM > Access > App & Backend`
- [x] Read back `Projects > SNPM > Access` and confirm it has no child pages.
- [x] Run `npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN`.
- [x] Re-read `Projects > Contour > Access` after cleanup and confirm it remains unchanged.

## 2026-03-29 — Workflow Operator Roadmap Reset

- [x] Record the multi-project usage lessons, publication-boundary correction, and workflow-operator re-scope in `research.md`.
- [x] Add the roadmap-reset execution checklist to `plan.md`.
- [x] Update `README.md` so it distinguishes:
  - published `main` baseline
  - latest published testing tag
  - committed development-branch work
  - no unpublished feature slices that are still pretending to be part of the committed branch
- [x] Rewrite `docs/operator-roadmap.md` around the workflow-operator thesis, phased roadmap, and next high-value product ideas.
- [x] Update `Projects > SNPM > Planning > Roadmap` so it resets the product thesis and phased roadmap around workflow bundles, doctoring, and selective expansion.
- [x] Update `Projects > SNPM > Planning > Current Cycle` so it stops presenting the Access slice as the active completed milestone and instead frames the immediate objective as roadmap reset plus baseline/publication alignment.
- [x] Update `Projects > SNPM > Planning > Backlog` so future work is grouped under:
  - baseline publication alignment
  - workflow bundles
  - doctoring/adoption planners
  - cross-repo distribution hardening
  - proven-surface expansion only
- [x] Update `Projects > SNPM > Planning > Decision Log` with the explicit direction change from surface-first expansion to workflow-operator development.
- [x] Read back the updated planning pages and confirm they no longer claim unpublished Access work is part of the current shipped baseline.
- [x] Run `npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN` after the planning-page updates.

## 2026-03-29 — Stabilize `codex/development`

- [x] Preserve the passing Access slice as its own development-branch commit.
- [x] Commit the roadmap/publication-boundary reset separately so it reflects Access as committed on `codex/development` rather than local-only worktree state.
- [x] Update the live SNPM planning pages so they distinguish published `main`, the latest published testing tag, and committed `codex/development`.
- [x] Run `npm test` and `npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN` after the cleanup commits.
- [x] Confirm `git status --short` is clean.
- [x] Push the cleaned `codex/development` branch to `origin`.
- [x] Create `codex/doctor` from the cleaned development tip.

## 2026-03-29 — `snpm doctor` / `snpm recommend`

- [x] Record the `doctor` v1 design, scope, and surface-classification rules in `research.md`.
- [x] Add the `doctor` implementation checklist to `plan.md` before code changes.
- [x] Add a new read-only service module for `doctor` that reports:
  - managed surface presence
  - missing optional surfaces
  - unmanaged-but-adoptable content
  - actionable next-step recommendations
- [x] Reuse the existing project verification and validation-session helpers instead of widening `verify-project`.
- [x] Add CLI support for:
  - `doctor --project "<Project>" [--project-token-env TOKEN_ENV]`
  - `recommend --project "<Project>" [--project-token-env TOKEN_ENV]`
- [x] Return structured JSON with:
  - `ok`
  - `command`
  - `projectId`
  - `targetPath`
  - `authMode`
  - `projectTokenChecked`
  - `surfaces`
  - `issues`
  - `adoptable`
  - `recommendations`
- [x] Cover these surfaces in v1:
  - `Runbooks`
  - `Ops > Builds`
  - `Ops > Validation > Validation Sessions`
  - `Access`
- [x] Keep missing optional surfaces as recommendations, not hard failures.
- [x] Keep unmanaged adoptable content out of hard failures and place it in `adoptable` plus `recommendations`.
- [x] Run automated tests for:
  - CLI parsing and help text
  - empty/missing optional surfaces
  - unmanaged runbook/access descendants
  - validation-session surface health passthrough
  - project-token scope reporting only when requested
- [x] Live-validate:
  - `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN`
  - `doctor --project "Tall Man Training" --project-token-env TALLMAN_NOTION_TOKEN`
  - cross-repo invocation from `C:\\tall-man-training`
- [x] Update local docs and live SNPM planning pages so `doctor` is the active next command family and workflow bundles remain the follow-on layer.

## 2026-03-29 — Validation-Session UI Bundle Hardening

- [x] Record the issue `#8` analysis and the UI-bundle roadmap shift in `research.md`.
- [x] Add the issue `#8` implementation checklist to `plan.md` before code changes.
- [x] Update `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` first so the living plan reflects validation-session UI bundle hardening as the next milestone.
- [x] Comment on GitHub issue `#8` with the accepted scope:
  - one blessed validation-session UI bundle
  - manual setup for UI-only pieces
  - narrow API-visible verification
  - no generic Notion UI builder tooling
- [x] Extend `validation-sessions verify` with `--bundle`.
- [x] Keep default `validation-sessions verify` behavior unchanged when `--bundle` is not supplied.
- [x] In bundle mode, verify:
  - required validation-session schema still present
  - safe extra API-visible property `Issue URL` is allowed as `url`
  - row pages still satisfy the canonical managed-page body contract
  - unsupported UI blocks do not appear inside the synced body
- [x] In bundle mode, return explicit manual-check guidance for:
  - `Active Sessions` primary view
  - `Quick Intake` backup intake form
  - `Validation Session` database template
  - manual button wiring
- [x] Add automated coverage for:
  - CLI parsing/output for `validation-sessions verify --bundle`
  - bundle-pass and bundle-fail cases
  - safe extra property allowance for `Issue URL`
  - manual-check reporting without pretending UI-only elements were API-verified
- [x] Add a dedicated validation-session UI-bundle doc and update:
  - `README.md`
  - `docs/operator-roadmap.md`
  - `docs/github-testing-loop.md`
  - `docs/validation-sessions.md`
- [x] Live-validate the bundle verifier on `Projects > SNPM > Ops > Validation > Validation Sessions` first.
- [x] Pause further cross-project bundle rollout work after the Contour narrow-band reset; keep `validation-sessions verify --bundle` as the supported API-visible check and leave Tall Man-specific follow-on work out of the active SNPM milestone queue.
- [x] After Tall Man validation, promote the blessed bundle into shared workspace guidance via `Templates > Project Templates > Ops > Validation`.

## 2026-03-29 — Hybrid UI Automation Lane for the Validation-Session Bundle

- [x] Record the hybrid control-plane decision, Chromium-only constraint, and default-browser avoidance requirement in `research.md`.
- [x] Add this implementation checklist to `plan.md` before code changes.
- [x] Update `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` first so the live plan reflects the hybrid UI-automation milestone.
- [x] Add Playwright with Chromium-only usage and no Edge/default-browser fallback.
- [x] Add a new `validation-bundle` command family:
  - `validation-bundle login`
  - `validation-bundle preview`
  - `validation-bundle apply`
  - `validation-bundle verify`
- [x] Keep `validation-sessions verify --bundle` unchanged as the API-visible verifier.
- [x] Add a separate `src/notion-ui/` subsystem for:
  - local Chromium profile/session handling
  - bundle spec
  - UI action planning
  - UI apply flows
  - UI verification flows
- [x] Ensure all browser launches happen inside Playwright Chromium and never via shell-open/default-browser handoff.
- [x] Store browser profile state, traces, and screenshots outside the repo.
- [x] Automate one exact v1 bundle only:
  - `Active Sessions` view
  - `Quick Intake` form
  - `Validation Session` database template
  - button wiring on `Projects > <Project> > Ops > Validation`
- [x] Keep button wiring out of runbooks in v1.
- [x] Treat `Quick Intake` as valid only if submitted rows immediately inherit the managed `Validation Session` body.
- [x] Return structured JSON for `preview`, `apply`, and `verify` with:
  - `ok`
  - `command`
  - `projectId`
  - `targetPath`
  - `authMode`
  - `uiAuth`
  - `apiBundle`
  - `uiBundle`
  - `actions`
  - `failures`
  - `manualChecks`
- [x] Add automated coverage for:
  - CLI parsing/help for `validation-bundle`
  - bundle-spec/action-planner logic
  - mocked Playwright flows
  - missing-login and selector-drift failures
  - proof that no default-browser or Edge path is used
  - regression coverage for `validation-sessions verify --bundle`
- [x] Pause the interactive `validation-bundle` rollout as experimental work after the Contour narrow-band reset; preserve the branch and command family, but remove it from the active milestone path and near-term publication target.
- [x] After implementation, update repo docs so the hybrid UI lane replaces the old "manual bundle setup" boundary.

## 2026-03-29 — Contour-Driven Narrow-Band Reset

- [x] Record Contour's narrow-band feedback and the product reset in `research.md`.
- [x] Add this reset and the new core-band ergonomics milestone to `plan.md` before code changes.
- [x] Update `README.md`, `docs/operator-roadmap.md`, `docs/github-testing-loop.md`, `docs/validation-sessions.md`, and `docs/validation-session-ui-bundle.md` so they all:
  - treat bootstrap, planning sync, runbooks, and Access as the primary supported product line
  - mark build records, validation sessions, manifest sync, and browser/UI automation as secondary or conditional
  - mark `codex/validation-bundle` as a paused experimental branch rather than the active next publication target
- [x] Update `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` so the live plan matches the repo reset:
  - mostly Notion-first
  - no new major surfaces until the core band is easier to use
  - browser/UI automation paused as non-core work
  - `doctor` truth-routing is the follow-on differentiator after ergonomics
- [x] Implement temp-file-free core-band updates by allowing:
  - `--output -` on `page-pull`, `runbook-pull`, `access-domain-pull`, `secret-record-pull`, and `access-token-pull`
  - `--file -` on `page-diff`, `page-push`, `runbook-create`, `runbook-diff`, `runbook-push`, `access-domain-create`, `access-domain-diff`, `access-domain-push`, `secret-record-create`, `secret-record-diff`, `secret-record-push`, `access-token-create`, `access-token-diff`, and `access-token-push`
- [x] Keep preview-first behavior unchanged; `--apply` remains required for mutation.
- [x] Keep streamed pull bodies on stdout and route structured success metadata to stderr when `--output -` is used, so pipelines stay clean.
- [x] Add automated coverage for the shared stdin/stdout helper and the new CLI usage contract.
- [x] Live-validate the ergonomics on `Projects > SNPM` only:
  - update one planning page through stdin/stdout with no temp file
  - update `Runbooks > SNPM Operator Validation Runbook` through stdin/stdout with no temp file
  - prove one Access stdin/stdout path on `Projects > SNPM > Access` without touching any other project
- [x] Re-run `npm test` and `npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN`.
- [x] Update the live SNPM planning pages again after validation so the reset is marked shipped and the next active follow-on is `doctor` truth routing instead of new surface expansion.

## 2026-03-29 — Truth-Routed `recommend`

- [x] Fast-forward `codex/doctor` to the `codex/core-ergonomics` tip and push it so the active integration base includes the narrow-band reset plus stdin/stdout ergonomics.
- [x] Create `codex/truth-routing` from the updated `codex/doctor`.
- [x] Record the truth-routing design, branch choice, and competitive boundary versus a generic Notion connector in `research.md`.
- [x] Update `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` first so the active milestone is truth routing in `doctor` / `recommend`.
- [x] Keep `doctor --project "<Project>"` as the read-only live surface scan.
- [x] Keep `recommend --project "<Project>"` without an intent as an alias for the current scan.
- [x] Add intent-driven routing:
  - `recommend --project "<Project>" --intent planning --page "<Approved Planning Page>"`
  - `recommend --project "<Project>" --intent runbook --title "<Runbook Title>"`
  - `recommend --project "<Project>" --intent secret --domain "<Access Domain>" --title "<Record Title>"`
  - `recommend --project "<Project>" --intent token --domain "<Access Domain>" --title "<Record Title>"`
  - `recommend --project "<Project>" --intent repo-doc --repo-path "<Repo Path>"`
  - `recommend --project "<Project>" --intent generated-output --repo-path "<Repo Path>"`
- [x] Return structured routing output including:
  - `ok`
  - `command`
  - `projectId`
  - `intent`
  - `recommendedHome`
  - `surface`
  - `supported`
  - `reason`
  - `targetPath` when relevant
  - `repoPath` when relevant
  - `warnings`
  - `nextCommands`
- [x] Add a top-level truth-boundary summary to `doctor` so the output explains current Notion-primary, repo-primary, and hybrid ownership rather than only surface health.
- [x] Keep routing read-only:
  - no mutation inside `doctor` or `recommend`
  - no new major surfaces
  - no browser automation work
  - no generic arbitrary-page routing
- [x] Reuse the current doctoring code and exact command builders rather than creating a separate planner stack.
- [x] Add automated coverage for:
  - CLI parsing for `recommend --intent ...`
  - required-context validation failures
  - each v1 intent mapping to the expected `recommendedHome`
  - repo-primary intents emitting no Notion mutation command
  - unmanaged or missing Notion targets routing to `adopt` or `create`
  - unsupported intents failing clearly
  - `doctor` truth-boundary summary
  - unchanged `recommend` behavior without `--intent`
- [x] Live-validate on `Projects > SNPM` only:
  - `recommend --project "SNPM" --intent planning --page "Roadmap" --project-token-env SNPM_NOTION_TOKEN`
  - `recommend --project "SNPM" --intent runbook --title "SNPM Operator Validation Runbook" --project-token-env SNPM_NOTION_TOKEN`
  - `recommend --project "SNPM" --intent secret --domain "App & Backend" --title "GEMINI_API_KEY" --project-token-env SNPM_NOTION_TOKEN`
  - `recommend --project "SNPM" --intent repo-doc --repo-path "docs/operator-roadmap.md"`
  - `recommend --project "SNPM" --intent generated-output --repo-path "artifacts/build.json"`
- [x] Re-run `npm test` and `verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN`.
- [x] Update README and roadmap/tester docs after implementation so the active next differentiator is truth routing rather than new surface expansion.

## 2026-03-29 — SNPM Self-Hosted Notion Doc Audit

- [x] Record the supported live SNPM doc surfaces, current doctor state, and unsupported-page boundaries in `research.md`.
- [x] Add this audit checklist to `plan.md` before mutating live Notion docs.
- [x] Reframe `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` around a short self-hosting doc audit so the live planning pages themselves are part of the test.
- [x] Update the four approved planning pages through `page-pull`, `page-diff`, and `page-push`.
- [x] Update the managed SNPM runbooks through `runbook-pull`, `runbook-diff`, and `runbook-push`.
- [x] Run at least one unsupported-page probe and record what fails cleanly versus what is simply out of scope.
- [x] Summarize what worked and what did not in the live SNPM planning pages and in the repo research notes.
- [x] Finish with `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN` and `verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN`.

## 2026-03-29 — Shared EOF Normalization For Managed Doc Surfaces

- [x] Record the shared-helper normalization rationale, root cause, and chosen scope in `research.md`.
- [x] Add this implementation checklist to `plan.md` before code changes.
- [x] Update `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` first so the live plan reflects EOF normalization as the active next milestone.
- [x] Add one shared managed-body normalization helper alongside the current newline helpers.
- [x] Apply the helper to body extraction on pull for the approved planning-page and shared managed-page flows.
- [x] Apply the helper to body preparation before diff and before push for the same shared flows.
- [x] Keep full-page header rewriting behavior unchanged.
- [x] Keep stdout/stderr command I/O behavior unchanged for `--output -`.
- [x] Add automated coverage for:
  - helper behavior on `body` vs `body\n`
  - clean no-diff behavior on approved planning pages
  - clean no-diff behavior on one managed runbook
  - clean no-diff behavior on one Access surface
  - clean no-diff behavior on one build-record surface
- [x] Re-run `npm test`.
- [x] Live-validate on `Projects > SNPM` only:
  - update one planning page and confirm immediate `page-diff` is clean
  - update `SNPM Operator Validation Runbook` and confirm immediate `runbook-diff` is clean
  - rerun an unsupported root-page probe and confirm it still fails with the approved-target guard
  - rerun `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN`
  - rerun `verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN`
- [x] Update the live SNPM planning pages again after validation so the normalization slice is marked shipped and the next follow-on returns to migration guidance for recurring legacy patterns surfaced by `doctor`.

## 2026-03-29 — Narrow-Band Release Candidate Readiness

- [x] Record the RC base, scope freeze, validation contract, and publication contract in `research.md`.
- [x] Add this RC-readiness checklist to `plan.md` before mutation.
- [x] Create `codex/rc-0.1.0` from `codex/core-normalization` and do all RC work on that branch.
- [x] Update `README.md`, `docs/operator-roadmap.md`, and `docs/github-testing-loop.md` so the active tester story is one narrow-band RC line rather than a branch maze.
- [x] Update `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` so the live plan reflects:
  - narrow-band RC support
  - explicit non-RC surfaces
  - the reasons SNPM beats a generic Notion connector on this slice
- [x] Run the integrated RC validation pass on `Projects > SNPM` only:
  - `npm test`
  - `node src/cli.mjs help`
  - `verify-project --name "SNPM" --project-token-env SNPM_NOTION_TOKEN`
  - `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN`
  - `recommend` for `planning`, `runbook`, `secret`, and `repo-doc`
  - planning-page live pull / diff / push with immediate clean re-diff
  - runbook live pull / diff / push with immediate clean re-diff
  - temporary Access fixture live pull / diff / push with cleanup back to empty
  - unsupported root-page probe
- [x] Update the live SNPM planning pages again after validation so the RC state is marked shipped and the next follow-on returns to migration guidance for recurring legacy patterns surfaced by `doctor`.
- [x] Push `codex/rc-0.1.0`.
- [x] Tag the validated RC commit as `v0.1.0-rc.1` and push the tag.
- [x] Confirm the README, roadmap doc, testing doc, live SNPM planning pages, branch tip, and tag all describe the same RC support boundary.

## 2026-04-06 — Post-RC Cleanup And Legacy Migration Guidance

- [x] Record the validated RC branch/tag state and the next migration-guidance slice in `research.md`.
- [x] Correct the stale RC publication checklist in `plan.md`.
- [x] Create `codex/migration-guidance` from `codex/rc-0.1.0` and keep `v0.1.0-rc.1` fixed.
- [x] Update `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` first so the live plan frames migration guidance as the active next milestone.
- [x] Extend `doctor` with a top-level `migrationGuidance` array containing:
  - `patternId`
  - `surface`
  - `supportTier`
  - `targetPath`
  - `summary`
  - `manualSteps`
  - `nextCommands`
- [x] Cover these recurring v1 patterns in `doctor`:
  - `unmanaged-runbook`
  - `unmanaged-access-domain`
  - `unmanaged-secret-record`
  - `unmanaged-access-token`
  - `unmanaged-build-record`
  - `missing-builds-surface`
  - `missing-validation-sessions-surface`
  - `untitled-validation-session-row`
  - `project-token-not-checked`
- [x] Keep unsupported structural failures in `issues`, not `migrationGuidance`.
- [x] Keep migration-guidance ordering stable: `rc` entries first, then `conditional`, then by `targetPath`.
- [x] Extend `recommend --intent ...` with optional `migrationGuidance` when the requested runbook or Access target matches a known recurring pattern.
- [x] Keep repo-owned intents free of Notion mutation commands and free of migration guidance.
- [x] Add a dedicated operator doc at `docs/migration-guidance.md`.
- [x] Update `README.md`, `docs/operator-roadmap.md`, and `docs/github-testing-loop.md` so migration guidance is the active post-RC slice.
- [x] Add automated coverage in `test/doctor.test.mjs` for all v1 migration-guidance patterns.
- [x] Add automated coverage in `test/recommend.test.mjs` for targeted runbook and Access migration guidance.
- [x] Live-validate on `Projects > SNPM` only:
  - `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN`
  - `recommend --intent planning`
  - `recommend --intent runbook`
  - `recommend --intent secret`
  - `recommend --intent repo-doc`
  - `verify-project --name "SNPM" --project-token-env SNPM_NOTION_TOKEN`
- [x] Update the live SNPM planning pages again after validation so migration guidance is marked shipped and the next follow-on is clear.
- [x] Push `codex/migration-guidance`.

## 2026-04-06 — Branch Consolidation Around `main`

- [x] Record the current 10-branch state, branch ancestry facts, and chosen 3-branch end state in `research.md`.
- [x] Add this branch-consolidation checklist to `plan.md` before branch surgery.
- [x] Discard the stray local `plan.md` and `research.md` worktree edits so cleanup starts from a clean base.
- [ ] Run `git fetch --prune origin` and re-confirm:
  - `main` is still fast-forwardable to `codex/migration-guidance`
  - no branch unexpectedly moved
  - no new remote branches appeared
- [ ] Fast-forward local `main` to `codex/migration-guidance` with `--ff-only`.
- [ ] Push `main` to `origin`.
- [ ] Keep `codex/migration-guidance` after the promotion.
- [ ] Do not retag anything and do not change `v0.1.0-rc.1`.
- [ ] Delete these strict ancestor branches locally and on `origin`:
  - `codex/core-ergonomics`
  - `codex/core-normalization`
  - `codex/development`
  - `codex/doctor`
  - `codex/notion-doc-audit`
  - `codex/rc-0.1.0`
  - `codex/truth-routing`
- [ ] Keep these branches:
  - `main`
  - `codex/migration-guidance`
  - `codex/validation-bundle`
- [ ] Prune remotes again after deletion.
- [ ] Confirm local branches are exactly:
  - `main`
  - `codex/migration-guidance`
  - `codex/validation-bundle`
- [ ] Confirm remote branches are exactly:
  - `origin/main`
  - `origin/codex/migration-guidance`
  - `origin/codex/validation-bundle`
- [ ] Confirm `main` and `codex/migration-guidance` point to the same commit.
- [ ] Confirm `codex/validation-bundle` still points to `73f2780`.
- [ ] Confirm tags remain:
  - `sprint-1-foundation`
  - `sprint-2-planning-sync`
  - `sprint-3-validation-sessions`
  - `v0.1.0-rc.1`
