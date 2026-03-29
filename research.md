# Research

## Migration Source Inventory

Primary source repo: `C:\\tall-man-training`

Tracked Notion automation assets discovered there:
- `scripts/notion-project-bootstrap.mjs`
- `scripts/notion-workspace.config.json`
- `docs/dev-guide.md` `Notion Workspace Automation` section

Legacy one-off Notion maintenance assets discovered there:
- `tmp/notion_doc_split_v2.mjs`
- `tmp/notion_doc_split_v2.ps1`
- `tmt_notion_icon.png`

## Current Validated Behavior

The existing bootstrap flow has already been validated against the live Infrastructure HQ workspace:
- create a project from `Templates > Project Templates`
- place it under `Projects > <Project Name>`
- preserve page icons
- rewrite `Canonical Source`
- refresh `Last Updated`
- verify tree shape and icon presence
- optionally verify project-token scope boundaries

## Migration Constraint

Milestone 1 should relocate and stabilize the tooling, not redesign the Notion workspace model.

## External Consumer Model

For a brand-new repo or Codex thread outside `SNPM`:
- treat `C:\\SNPM` as the local control repo for Infrastructure HQ Notion bootstrap and verification
- run SNPM commands from that checkout instead of copying scripts, workspace ids, or starter-tree config into the new repo
- make bootstrap the day-zero requirement; defer project-token setup until the new repo actually needs repo-local Notion automation
- keep the new repo responsible for code-coupled docs, runtime contract, and shipped history while SNPM remains the owner of workspace bootstrap rules and structural verification

## SNPM Self-Bootstrap Preflight

As of `2026-03-28` before the SNPM live dogfood run:
- the live `Projects` page contains `Tall Man Training` and does not yet contain `SNPM`
- a workspace token is available locally, so live workspace inspection and bootstrap are possible from this machine
- `SNPM_NOTION_TOKEN` is not configured, so this pass should stop at bootstrap plus structural verification without project-token scope checks
- `verify-project -- --name "SNPM"` currently reports the expected missing-project error, but the CLI also emits a Windows async-handle assertion under Node `v24.14.0` because it exits through direct `process.exit(...)`

## SNPM Self-Bootstrap Result

Live dogfood run completed on `2026-03-28`:
- `src/cli.mjs` was hardened to use `process.exitCode` on help and failure paths, which removed the Windows async-handle assertion during expected command failures
- `npm run create-project -- --name "SNPM"` succeeded from a non-SNPM workdir while using `C:\\SNPM` as the control checkout
- the created project id is `3329f5f6-66d0-811f-b193-c8f9d17afa3f`
- the returned destination path is `Projects > SNPM`
- the recommended future project token env var is `SNPM_NOTION_TOKEN`
- `npm run verify-project -- --name "SNPM"` succeeded without a project token and returned zero failures
- the live `Projects` page now contains both `Tall Man Training` and `SNPM`
- the `SNPM` starter tree contains `Ops`, `Planning`, `Access`, `Vendors`, `Runbooks`, and `Incidents`
- duplicate creation remains blocked with `A project named "SNPM" already exists under Projects.`

## Notion API Capability Summary

The current official Notion platform is already strong at:
- page and block reads
- page creation and supported block updates
- search
- data source and database query flows
- comments
- file workflows
- webhook-driven change detection
- markdown-oriented page export/import/update flows

These capabilities are broad enough that SNPM does not need to stay limited to project bootstrap forever.

## Easy Vs Challenging

Easy or relatively straightforward with a valid token and correct page sharing:
- read named pages and block trees
- create child pages under known parents
- append supported content blocks
- verify workspace structure against expected shapes
- search for pages by title or content
- sync documentation-heavy pages through markdown where the content shape stays within supported block types

Challenging or high-risk:
- integration sharing and permission boundaries, which often fail as `object_not_found`
- round-tripping rich or unsupported page structures through markdown without content loss
- broad free-form mutation across the workspace
- large recursive page operations that require pagination and careful batching
- workflows that still require Notion UI participation, especially integration creation and sharing
- growing new features against the currently pinned Notion API version without first planning an upgrade path

## Next-Phase Positioning Rationale

SNPM should evolve as:
- CLI first
- private Git-installable package
- internal-only
- highly opinionated about Infrastructure HQ workspace rules

Reasoning:
- the workspace already has named high-value surfaces and safety boundaries
- maintainers and Codex threads benefit more from explicit safe commands than from raw API freedom
- other repos should consume SNPM as a tool rather than copy workspace ids or policy logic
- markdown-backed sync is a natural next step because the current workspace is still page-tree-heavy rather than database-heavy

## Usage Guidance For Other Repos

Chosen direction for other repos:
- install SNPM from the private Git repo at a pinned tag or commit
- call the SNPM CLI from repo scripts or `npm exec`
- keep only a small repo-local mapping from approved local docs to approved Notion targets
- avoid vendoring workspace config, page ids, or policy logic

## Usage Guidance For Other Codex Threads

Chosen direction for other Codex threads:
- shell out to the SNPM CLI
- treat SNPM as the policy layer for live workspace mutations
- avoid writing direct one-off Notion API scripts when SNPM can express the operation
- add a thinner agent-facing wrapper later only if repetition justifies it

## Notion Strategy Doc Migration

For the first live migration of the broader SNPM strategy docs into Notion:
- keep the HQ runbooks procedural and unchanged
- use `Projects > SNPM > Planning > Roadmap` as the Notion home for the broader operator direction
- use `Projects > SNPM > Planning > Current Cycle`, `Backlog`, and `Decision Log` for summarized planning content derived from the repo docs
- treat the SNPM planning pages in Notion as the primary living home for strategy and planning after the move
- keep the repo docs as supporting engineering and reference material rather than a second equal strategy surface

## Notion Strategy Doc Migration Result

Live update completed on `2026-03-28`:
- `Projects > SNPM > Planning > Roadmap` now carries the adapted current-vs-planned operator direction
- `Projects > SNPM > Planning > Current Cycle` now carries the active migration-stage objective and immediate risks
- `Projects > SNPM > Planning > Backlog` now carries grouped deferred work buckets for the next implementation phases
- `Projects > SNPM > Planning > Decision Log` now carries the dated strategy and tooling decisions
- the existing page header pattern was preserved on all four planning pages and `Last Updated` was refreshed
- `Runbooks > Notion Workspace Workflow` and `Runbooks > Notion Project Token Setup` were deliberately left unchanged

Unexpected finding from post-update verification:
- `npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN` now reports an unexpected extra child page under `Projects > SNPM`: `Templates`
- the `Templates` child page exists live and contains `Project Templates` plus `Misc Templates`
- this extra page is outside the original starter-tree contract and should be treated as a separate follow-up decision rather than part of the planning-page migration

## Project Root Landing Page Comparison

Live comparison completed on `2026-03-28` before the next root-page normalization pass:
- `Projects > Tall Man Training` already uses the richer landing-page pattern the user wants to mirror
- `Projects > SNPM` and `Templates > Project Templates` still use the older generic landing-page body
- all three pages preserve the same header metadata pattern: `Purpose`, `Canonical Source`, `Read This When`, `Last Updated`, `Sensitive`
- the current starter-tree contract remains unchanged in repo config and still expects only `Ops`, `Planning`, `Access`, `Vendors`, `Runbooks`, and `Incidents` under the project root

Tall Man Training root-page body sections now present live:
- launchpad callout
- `Start Here`
- `Current Status`
- `Development Planning`
- `Canonical Repo Docs`
- `Public Links`
- `Operating Notes`

SNPM and Project Templates currently still use the older sections:
- launchpad callout
- `Start Here`
- `Current Picture`
- `Project Identifiers`
- `Canonical Repo Docs`
- `Operating Notes`

Important live detail for the normalization:
- `Tall Man Training`, `SNPM`, and `Project Templates` all currently have the same direct child-page set: `Access`, `Incidents`, `Ops`, `Planning`, `Runbooks`, and `Vendors`
- the visible top-of-page launcher list is Notion rendering actual `child_page` blocks, not a custom widget
- the requested mirror should therefore rewrite only the landing-page body content and must not add, remove, or reorder root child pages

Chosen normalization direction:
- mirror the Tall Man Training landing-page structure and tone into `Projects > SNPM`
- mirror the same structure into `Templates > Project Templates`, but generalize project-specific facts into reusable placeholders and prompts
- keep `Tall Man Training` unchanged and keep the current bootstrap / verification contract untouched

## Project Root Landing Page Normalization Result

Live update completed on `2026-03-28`:
- `Projects > SNPM` now uses the richer Tall Man Training-style landing-page shape below the preserved root child pages
- `Templates > Project Templates` now uses the same section model with generalized placeholder content for future projects
- both pages now share the same section set below the header: `Start Here`, `Current Status`, `Development Planning`, `Canonical Repo Docs`, `Key Links`, and `Operating Notes`
- both pages preserved the existing direct child-page set: `Ops`, `Planning`, `Access`, `Vendors`, `Runbooks`, and `Incidents`
- `Tall Man Training` was left unchanged

Post-update verification:
- read-back confirmed the new section structure on both target pages
- `npm run verify-project -- --name "SNPM"` returned `ok: true` with zero failures after the live edits
- no manual UI-only Notion steps were required for this normalization pass

## Experiment Success Criteria Model

The broader SNPM question is no longer just whether the bootstrap script works. The active experiment is whether `Notion + SNPM` can serve as the operational memory layer for AI-assisted app development without turning into another confusing document pile.

Chosen evaluation model:
- use a layered decision rather than a single yes/no judgment
- separate immediate milestone gates from the broader product and workflow viability test
- keep the living scorecard in `Projects > SNPM > Planning`, with the repo keeping a shorter supporting reference copy

Why explicit criteria are needed:
- dislike of the Notion UX alone is not enough to decide whether the system is useful
- raw usage volume alone is also not enough, because people can use a tool heavily while still duplicating docs and losing trust in the source of truth
- Codex threads need a stable rubric so they can tell whether the workspace is becoming easier to use or merely larger

Chosen scoring shape:
- use `Pass`, `Watch`, and `Fail` instead of numeric KPIs
- score the broader experiment on source-of-truth clarity, agent usability, safe mutation, operational freshness, repo-vs-Notion boundary health, and tolerance for manual UI friction
- score the immediate cycle on whether the live bootstrap contract remains trustworthy and whether the planning surfaces are actually functioning as the living coordination layer

Planned cadence:
- evaluate the broader scorecard weekly
- use a milestone-exit review to decide whether to continue, constrain, or abandon the broader Notion-operator direction
- keep per-change validation lightweight: read-back after page-body edits and `verify-project` whenever structure could have drifted

## Experiment Success Criteria Rollout Result

Live update completed on `2026-03-28`:
- `Projects > SNPM > Planning > Roadmap` now includes the broader Notion-experiment scorecard, explicit failure signals, and the recurring review cadence
- `Projects > SNPM > Planning > Current Cycle` now includes immediate success gates and the testing cadence for the current milestone
- `Projects > SNPM > Planning > Decision Log` now records that the experiment should be judged with a layered `Pass / Watch / Fail` scorecard rather than gut feel alone
- `Projects > SNPM > Planning > Backlog` now includes evidence-gathering work for markdown-sync viability and real cross-repo adoption
- `docs/operator-roadmap.md` now carries a shorter supporting reference version of the same model and explicitly points back to Notion as the living scorecard

Post-update verification:
- read-back confirmed that `Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` now contain the intended scorecard, cadence, and supporting evidence items
- `npm run verify-project -- --name "SNPM"` returned `ok: true` with zero failures after the live planning-page updates
- no manual UI-only Notion steps were required for this planning update

## Sprint 1 Foundation Prep

Current repo shape before Sprint 1 implementation:
- the public command surface is still only `create-project` and `verify-project`
- the codebase is still intentionally small: one CLI entrypoint, two command wrappers, one config loader, one low-level Notion client, and one large `project-bootstrap` module
- there is no existing automated test harness and no `package-lock.json`

Official Notion API grounding for the upgrade:
- the latest official Notion API version is `2026-03-11`
- this repo does not currently use the high-risk database or data-source surfaces, so the main Sprint 1 risk is not object-shape drift there
- this repo also does not currently archive pages or blocks in tracked runtime code, so the most visible breaking change from `archived` to `in_trash` does not block the current command surface

Chosen Sprint 1 implementation direction:
- upgrade the pinned workspace config version from `2022-06-28` to `2026-03-11`
- keep the lightweight fetch-based client for now instead of introducing a new runtime dependency during the same safety sprint
- normalize API failures through a clearer internal error type and injectable fetch path so the client is easier to test
- split the current large `project-bootstrap` file into smaller internal modules for config and path modeling, template block handling, and project service orchestration
- add a built-in Node test harness around config loading, path and tree modeling, template block rewriting, supported-block enforcement, and normalized client failure handling

## Sprint 1 Foundation Result

Sprint 1 implementation completed on `2026-03-28`:
- the pinned workspace config version is now `2026-03-11`
- the low-level client now normalizes Notion API failures through a dedicated error type and supports injected fetch for tests
- the former all-in-one bootstrap module is now split into smaller internal modules for project modeling, template block handling, project orchestration, and low-level error handling
- the public command surface remains unchanged: `create-project` and `verify-project`
- a built-in Node test harness now covers client error handling and pagination, config validation, project path and tree modeling, template block rewriting, and tree-verification failure reporting

Validation result:
- `npm test` passed with `14` tests
- `npm run verify-project -- --name "SNPM"` passed from `C:\\SNPM`
- `npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN` passed from `C:\\SNPM`
- `npm --prefix C:\\SNPM run verify-project -- --name "SNPM"` passed from `C:\\tall-man-training`
- duplicate-create and missing-project failure paths still return clean operator-facing errors

Deliberate non-action during Sprint 1 validation:
- a fresh successful live `create-project` run was not repeated because it would create another real project in the workspace just to prove a no-surface-change refactor
- instead, live regression focused on `verify-project`, cross-repo invocation, and the existing create-project duplicate guard while the previously validated SNPM bootstrap result remains the last successful live creation proof

## GitHub Testing Loop Prep

Current GitHub state before rolling out the tester loop:
- the repo already exists at `https://github.com/DrW00kie1/SNPM`
- it is private
- issues are already enabled
- the default branch is `main`
- there are no releases, tags, or open issues yet
- there is no existing `.github` issue-template or testing workflow setup in the repo

Current distribution and intake constraints:
- testers can already clone and open the SNPM repo directly, which is the lowest-friction path for early testing
- the repo is not yet packaged for private Git dependency consumption, so direct-clone testing should remain the default path for this rollout
- live Notion validation should stay limited to trusted testers because the repo mutates a real workspace

Chosen rollout direction:
- publish the already-validated repo state as a clean baseline on `main`
- create a tagged testing snapshot so issue reports can name an exact tested version
- add light GitHub intake structure only: issue templates, a few labels, and a short tester workflow doc
- keep blank issues available for edge cases instead of forcing a heavy process

## GitHub Testing Loop Rollout Result

GitHub rollout completed on `2026-03-28`:
- the current validated repo state was committed on `main` as `ad8d72b` with message `Prepare SNPM sprint 1 testing baseline`
- the baseline was pushed to `origin/main`
- the first tagged testing snapshot was created and pushed as `sprint-1-foundation`
- the repo now contains GitHub issue forms for `bug report` and `testing finding`, plus template config that keeps blank issues enabled
- the repo now contains `docs/github-testing-loop.md`, which documents the default direct-clone tester path, trusted live-test guidance, issue requirements, and the maintainer fix loop
- `README.md` now points testers to the GitHub testing workflow and the current snapshot tag

GitHub-side intake setup now present:
- labels created: `bug`, `testing-feedback`, `repo-only`, `live-workspace`, `needs-repro`, `regression`
- issue templates are present on `main` under `.github/ISSUE_TEMPLATE/`
- the repo remains private and issues remain enabled

Verification result:
- `npm test` passed before publication
- `npm run verify-project -- --name "SNPM"` passed before publication
- remote tag lookup confirms `refs/tags/sprint-1-foundation` exists on `origin`
- GitHub API confirms the issue-template files are present on `main`
- GitHub label listing confirms the new intake labels exist alongside the default GitHub labels

## Sprint 2 Planning-Page Sync Prep

Live capability check completed on `2026-03-28`:
- `GET /pages/{page_id}/markdown` works against `Projects > SNPM > Planning > Roadmap` on the current pinned API version
- the returned markdown for `Roadmap` is not truncated and contains no `unknown_block_ids`
- the live `SNPM_NOTION_TOKEN` can also read the same markdown endpoint for the project planning page, so project-scoped planning-page sync is feasible

Current live shape of the first sync family:
- `Roadmap`, `Current Cycle`, and `Backlog` are all paragraph/callout/divider/heading/bulleted-list pages in Notion markdown terms
- `Decision Log` is the same plus a single `code` block for the decision-entry format
- all four pages therefore fit the first sync slice cleanly without requiring unsupported block handling right away

Chosen Sprint 2 contract:
- use Notion's native markdown endpoints rather than inventing a custom body format
- sync only approved planning pages under `Planning > Roadmap`, `Planning > Current Cycle`, `Planning > Backlog`, and `Planning > Decision Log`
- use body-only ownership: keep the standard header metadata above the divider under SNPM control and sync the callout plus all content below that divider through files
- prefer the project token when `--project-token-env` is provided, otherwise fall back to the workspace token
- reject truncated markdown, `unknown_block_ids`, and unapproved targets with hard failures rather than risking partial sync

Implementation direction for Sprint 2:
- add a planning-page target resolver from `--project` plus `--page` to a real page id under the validated starter tree
- add markdown pull, diff, and push service functions
- generate diffs using a unified text diff from temporary files through `git diff --no-index --no-color`
- use `replace_content` through `PATCH /pages/{page_id}/markdown` for mutating push while reconstructing the full page from the preserved header plus the file-owned body

## Sprint 2 Planning-Page Sync Rollout Result

Sprint 2 was implemented and validated on `2026-03-28`.

Implemented command surface:
- `page pull --project "<Project Name>" --page "Planning > <Page Name>" --output <file> [--project-token-env PROJECT_NAME_NOTION_TOKEN]`
- `page diff --project "<Project Name>" --page "Planning > <Page Name>" --file <file> [--project-token-env PROJECT_NAME_NOTION_TOKEN]`
- `page push --project "<Project Name>" --page "Planning > <Page Name>" --file <file> [--project-token-env PROJECT_NAME_NOTION_TOKEN] [--apply]`

Internal changes now present:
- approved-target resolution is limited to `Planning > Roadmap`, `Planning > Current Cycle`, `Planning > Backlog`, and `Planning > Decision Log`
- markdown sync is body-only and preserves the standard header metadata above the divider
- project-token auth is preferred when `--project-token-env` is provided; otherwise the workspace token is used
- truncated markdown and `unknown_block_ids` now fail hard instead of being synced partially
- unified diffs are generated through `git diff --no-index --no-color`

Validation result:
- `npm test` passed with `29` tests after the Sprint 2 implementation
- `node src/cli.mjs help` now documents `page pull`, `page diff`, and `page push`
- `page pull` succeeded for all four approved planning pages on `Projects > SNPM > Planning`
- `page diff` reported `No body changes.` for unmodified pulled files
- preview-only `page push` showed a clear unified diff and did not mutate the page without `--apply`
- trusted live `page push --apply` succeeded against `Projects > SNPM > Planning > Backlog`, and an immediate restore returned the page to its original body
- `npm run verify-project -- --name "SNPM"` passed after the apply-and-revert flow
- cross-repo dogfood passed from `C:\\tall-man-training` via `npm --prefix C:\\SNPM run page-diff -- ...`

Live doc alignment now completed through the new sync path:
- `Projects > SNPM > Planning > Roadmap`, `Current Cycle`, `Backlog`, and `Decision Log` were all updated with the new page-sync commands themselves
- read-back confirmed the live pages now describe Sprint 2 as shipped and validated rather than merely planned

Observed edge case worth preserving:
- Notion re-escapes markdown-sensitive characters such as `>` on read-back, so exact-text diff stability is cleanest when operators edit the file produced by `page pull`
- a hand-authored body line containing a raw `>` pushed successfully, but the next `page diff` showed the normalized `\\>` form coming back from Notion
- that normalization is a content-formatting nuance rather than a structural failure, but testers should treat the pulled file format as canonical for follow-on edits

## Post-Sprint-2 GitHub Testing Snapshot

Publishing goal for the next tester-facing baseline:
- move the implemented and validated Sprint 2 planning-page sync slice onto `main`
- create a new reproducible Git tag so testers do not need to target `main` directly
- update the tester-facing docs so the current published snapshot and checkout examples point at the new tag

Chosen snapshot name:
- `sprint-2-planning-sync`

Expected publication checks:
- rerun `npm test`
- rerun `npm run verify-project -- --name "SNPM"`
- rerun a planning-page sync smoke check before tagging so the published snapshot reflects the current live-safe path

Publication result on `2026-03-28`:
- `npm test` passed with `29` tests
- `npm run page-pull -- --project "SNPM" --page "Planning > Roadmap" --output ... --project-token-env SNPM_NOTION_TOKEN` passed
- `npm run page-diff -- --project "SNPM" --page "Planning > Roadmap" --file ... --project-token-env SNPM_NOTION_TOKEN` reported `No body changes.`
- `npm run verify-project -- --name "SNPM"` passed
- cross-repo smoke validation from `C:\\tall-man-training` using `npm --prefix C:\\SNPM run page-diff -- ...` also reported `No body changes.`
- the repo docs now point testers at the new published snapshot tag `sprint-2-planning-sync`
