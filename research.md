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

## Issue-Driven Re-scope For Project-Token Operations

Open GitHub issue review on `2026-03-28`:
- issue `#1` (`[testing] Need first-class project-token operations for existing project subtrees`) is a real feature-gap report from `ec53bb4`, not a regression
- issue `#2` (`[testing] Need a supported command for project-scoped page creation and update inside an existing project subtree`) is the concrete next feature request rather than a low-level API bug
- both issues were filed from another repo context while using `C:\\SNPM` as the control repo, which matches the intended cross-repo usage model

What Sprint 2 changed relative to the issues:
- Sprint 2 partially addressed issue `#1` by shipping first-class project-token-safe planning-page pull, diff, and push
- neither issue is actually solved for routine project work because SNPM still lacks first-class project-token-safe operations for `Runbooks` and `Ops > Builds`

Concrete downstream usage signal from `Tall Man Training`:
- `Tall Man Training > Runbooks` already holds real operational pages such as `iOS TestFlight Internal Distribution`
- `Tall Man Training > Ops` already includes an extra `Builds` child page beyond the starter-tree baseline
- `Tall Man Training > Ops > Builds` already contains meaningful build records such as `Android Local Preview + Test PWA Refresh - v0.5.1` and `iOS TestFlight Audit + First Internal Build - v0.5.1`
- `tall-man-training/plan.md` and `research.md` explicitly call out missing Notion mutation support as the blocker for keeping build history and operational results in Notion

Live markdown/read-shape observations that affect the next milestone:
- the sampled build-record page is already a managed-header page with `Purpose`, `Canonical Source`, `Read This When`, `Last Updated`, `Sensitive`, and a divider
- the sampled runbook page `iOS TestFlight Internal Distribution` is headerless and begins directly with body content
- that means the next milestone cannot assume all project-owned pages already follow the managed page contract

Chosen product re-scope:
- the next milestone should optimize for least-privilege, project-token-first day-to-day operations inside an existing project subtree
- SNPM should remain opinionated and task-based rather than becoming a generic Notion shell
- the first-wave approved surfaces should be `Runbooks` and `Ops > Builds`
- `Ops > Builds` should be treated as an approved extension surface, not promoted into the starter-tree template for every project

Implementation implications:
- add first-class `runbook` and `build-record` command families rather than widening `page` into a generic project shell
- support `runbook adopt` because real projects already contain headerless runbooks that need to be brought under SNPM management safely
- keep `page pull` / `page diff` / `page push` unchanged for Planning
- rework verification so the starter tree stays the required baseline, but legitimate descendants under `Runbooks` and the optional `Ops > Builds` extension do not fail verification as drift

GitHub issue handling constraints in the current tool environment:
- GitHub comments can be added from this session
- issue-title editing is not exposed by the available GitHub connector tools, so the practical response path here is to comment with the re-scope, partial-resolution note, and milestone mapping

## Project-Token Day-To-Day Operations Rollout Result

The re-scoped milestone was implemented and validated on `2026-03-28`.

GitHub issue handling result:
- issue `#1` now has a comment marking Sprint 2 as a partial resolution and re-framing the remaining gap as project-token-safe operations beyond Planning
- issue `#2` now has a comment marking it as the active implementation slice for approved project-owned surfaces
- issue titles themselves were not edited because the available GitHub connector tools in this session do not expose issue-title mutation

Implemented command surface:
- `runbook create --project "<Project>" --title "<Title>" --file <file> [--project-token-env TOKEN_ENV] [--apply]`
- `runbook adopt --project "<Project>" --title "<Existing Title>" [--project-token-env TOKEN_ENV] [--apply]`
- `runbook pull --project "<Project>" --title "<Title>" --output <file> [--project-token-env TOKEN_ENV]`
- `runbook diff --project "<Project>" --title "<Title>" --file <file> [--project-token-env TOKEN_ENV]`
- `runbook push --project "<Project>" --title "<Title>" --file <file> [--project-token-env TOKEN_ENV] [--apply]`
- `build-record create --project "<Project>" --title "<Title>" --file <file> [--project-token-env TOKEN_ENV] [--apply]`
- `build-record pull --project "<Project>" --title "<Title>" --output <file> [--project-token-env TOKEN_ENV]`
- `build-record diff --project "<Project>" --title "<Title>" --file <file> [--project-token-env TOKEN_ENV]`
- `build-record push --project "<Project>" --title "<Title>" --file <file> [--project-token-env TOKEN_ENV] [--apply]`

Implementation result:
- approved project-owned target resolution now includes `Runbooks` and `Ops > Builds`
- `runbook adopt` converts a headerless runbook into the SNPM-managed page shape while preserving the body content
- `build-record create` can create the optional `Ops > Builds` container on demand without changing the required starter-tree baseline for every project
- verification now keeps the starter tree as the required baseline while allowing dynamic descendants under `Runbooks` and the optional `Ops > Builds` extension
- project-token scope verification now includes approved dynamic descendants under `Runbooks` and `Ops > Builds` when they exist

Live validation result on `Projects > SNPM`:
- created persistent fixture `Runbooks > SNPM Operator Validation Runbook`
- created persistent fixture `Runbooks > SNPM Operator Validation Legacy Runbook` and adopted it into the managed format
- created persistent fixture `Ops > Builds > SNPM Operator Validation Build Record`
- `build-record create` also created the managed `Ops > Builds` container because it did not exist yet under `Projects > SNPM`
- `runbook pull`, `runbook diff`, preview `runbook push`, apply `runbook push`, and revert `runbook push` all succeeded with `SNPM_NOTION_TOKEN`
- `build-record pull`, `build-record diff`, preview `build-record push`, apply `build-record push`, and revert `build-record push` all succeeded with `SNPM_NOTION_TOKEN`
- `npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN` passed after the structural changes

Cross-repo validation result:
- from `C:\\tall-man-training`, `npm --prefix C:\\SNPM run runbook-pull -- ...` against the SNPM validation runbook succeeded
- from `C:\\tall-man-training`, `npm --prefix C:\\SNPM run build-record-diff -- ...` against the SNPM validation build record reported `No body changes.`

Automated validation result:
- `npm test` passed with `48` tests after the new command families and verification changes landed

## Validation Session Reporting Re-scope

Issue `#3` on `2026-03-28` is a credible next-milestone signal rather than a generic feature wishlist.

What the new issue adds:
- the current shipped surface is now strong enough for planning, runbooks, and build records, but it still does not provide a canonical place to record one human validation session per test run
- `Projects > Tall Man Training > Ops > Validation` is currently a summary/status page, not an intake/reporting surface
- `Runbooks` describe what to test and `Builds` describe what was built, but neither one is the right canonical home for tester session reports

Live workspace observations:
- `Projects > Tall Man Training > Ops > Validation` currently has no child surfaces under it
- `Infrastructure HQ Home` remains a short workspace landing page with top-level pointers only
- that means the correct v1 shape is not “put validation reports in Home”; it is “add a project-owned validation-session surface, then update Home to point to it”

Current Notion API implications:
- the current Notion API version in use supports database/data-source style workflows strongly enough to make a database-backed surface feasible
- pages can be created under a data source via the normal page APIs
- page markdown endpoints still work for row pages, which keeps the managed-page body contract viable
- form/view creation and configuration remain the likely UI-only gap in v1, so the boundary should stay explicit and documented rather than hidden

Chosen milestone direction:
- make issue `#3` the next active milestone
- add a managed `Validation Sessions` surface under `Projects > <Project> > Ops > Validation`
- keep it project-token-safe, bounded, and opinionated
- bundle a lightweight `Infrastructure HQ Home` workflow pointer in the same milestone, but only after the new surface is validated live

Chosen v1 contract:
- `Validation Sessions` is an optional database-backed extension surface, not a new required starter-tree child
- the managed container lives only at `Ops > Validation > Validation Sessions`
- session records are treated as first-class managed objects, not arbitrary database rows
- a bounded manual Notion UI step for a form-style view is acceptable in v1
- arbitrary database/view tooling remains out of scope

## Validation Session Reporting Rollout Result

The validation-session milestone was implemented and live-validated on `2026-03-28`.

Implemented command surface:
- `validation-sessions init --project "<Project>" [--project-token-env TOKEN_ENV] [--apply]`
- `validation-session create --project "<Project>" --title "<Title>" --file <file> [--project-token-env TOKEN_ENV] [--apply]`
- `validation-session adopt --project "<Project>" --title "<Existing Title>" [--project-token-env TOKEN_ENV] [--apply]`
- `validation-session pull --project "<Project>" --title "<Title>" --output <file> [--project-token-env TOKEN_ENV]`
- `validation-session diff --project "<Project>" --title "<Title>" --file <file> [--project-token-env TOKEN_ENV]`
- `validation-session push --project "<Project>" --title "<Title>" --file <file> [--project-token-env TOKEN_ENV] [--apply]`

Implementation result:
- target resolution now includes the optional `Ops > Validation > Validation Sessions` database-backed extension surface
- the managed schema is enforced for `Name`, `Platform`, `Session State`, `Tester`, `Build Label`, `Runbook URL`, `Started On`, and `Completed On`
- validation-session files use YAML front matter for row properties plus the managed markdown body below the divider
- verification now allows `Validation Sessions` only under `Ops > Validation`, verifies the database title/icon/schema, and includes session descendants in project-token scope checks

Live validation result on `Projects > SNPM`:
- `validation-sessions init` preview and apply succeeded with `SNPM_NOTION_TOKEN`
- created persistent fixture `Ops > Validation > Validation Sessions > SNPM Validation Session Fixture`
- `validation-session pull`, `validation-session diff`, preview `validation-session push`, apply `validation-session push`, and revert `validation-session push` all succeeded with `SNPM_NOTION_TOKEN`
- created persistent legacy fixture `Ops > Validation > Validation Sessions > SNPM Validation Session Legacy Fixture` and adopted it into the managed format
- `npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN` passed after the new optional surface was created

Cross-repo validation result:
- from `C:\\tall-man-training`, `npm --prefix C:\\SNPM run validation-session-diff -- ...` against the SNPM validation-session fixture reported `No body changes.`

Workspace guidance result:
- `Infrastructure HQ Home` should now point testers at project-owned `Ops > Validation` surfaces rather than acting as the reporting surface itself
- `Templates > Project Templates > Ops > Validation` should now describe the optional `Validation Sessions` extension and the one-session-per-run workflow
- a bounded manual Notion UI step for form-style views remains documented rather than automated

## Existing-Project Validation-Session Adoption Re-scope

Issue `#4` on `2026-03-28` is not asking for a new validation-session data model. It is pointing out an adoption and publication gap in the current rollout.

What the issue surfaced:
- the validation-session slice is implemented locally but is not yet published on `origin/main` or on a dedicated tester-facing tag
- existing projects need a cleaner success signal than `verify-project`, because broad project verification can still fail on unrelated historical drift
- the validation-session docs do not yet make the existing-project path explicit enough, especially the immediate `pull` then `diff` normalization step after `create --apply` or `adopt --apply`
- testers also need a clear distinction between a published baseline and an unpublished local checkout when reporting results

Current repo and publication state before this milestone:
- local `main` contains the uncommitted validation-session implementation
- `origin/main` and the latest published tag still point to `sprint-2-planning-sync`
- this makes the README and tester workflow misleading for anyone trying to evaluate validation sessions from GitHub alone

Chosen scope for issue `#4`:
- keep validation-session CRUD behavior as-is
- publish the validated local validation-session slice to `origin/main`
- add a new tester-facing tag named `sprint-3-validation-sessions`
- add a narrow read-only `validation-sessions verify` command that checks only `Ops > Validation > Validation Sessions`
- leave `verify-project` intentionally broad so it still catches unrelated legacy drift elsewhere in a project subtree
- document the existing-project adoption flow explicitly, including the post-create normalization step and the bounded manual form/view UI step

Why the narrow verify command is worth adding:
- existing projects need a clean pass/fail signal for the managed validation-session surface itself
- broad `verify-project` output is still useful, but it is the wrong signal for “is validation-session adoption healthy?”
- a surface-only verifier keeps the distinction sharp without weakening the broader project verifier

## Existing-Project Validation-Session Adoption Result

Issue `#4` was implemented on `2026-03-28` as a docs + publication + narrow-verifier slice.

Implementation result:
- `validation-sessions verify --project "<Project>" [--project-token-env TOKEN_ENV]` now verifies only `Ops > Validation > Validation Sessions`
- the new verifier reports `ok`, `command`, `targetPath`, `authMode`, `initialized`, `failures`, and `rowCount`
- `validation-sessions init --apply`, `validation-session create --apply`, and `validation-session adopt --apply` now return explicit `nextStep` guidance for UI-only form/view setup or immediate local-file normalization
- `verify-project` remains unchanged and still reports unrelated legacy drift elsewhere in the project subtree
- the validation-session docs, README, and GitHub testing docs now explain the existing-project adoption path explicitly, including the immediate `pull` then `diff` normalization step

Live validation result:
- `npm run validation-sessions-verify -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN` passed with `rowCount: 2` before the new adoption fixture was created and later passed cross-repo with `rowCount: 3`
- `npm run validation-sessions-verify -- --project "Tall Man Training" --project-token-env TALLMAN_NOTION_TOKEN` passed with `rowCount: 1`
- `npm run verify-project -- --name "Tall Man Training" --project-token-env TALLMAN_NOTION_TOKEN` still failed on broad legacy canonical-source and tree-shape drift, which proves the distinction between the narrow surface verifier and the broad project verifier
- the normalization flow was confirmed live by creating `SNPM Validation Session Adoption Fixture`, then immediately running `validation-session-pull` and `validation-session-diff`, which returned `No body changes.`

Publication result:
- the current validation-session slice is now the baseline to publish to `origin/main`
- the tester-facing snapshot name for this milestone is `sprint-3-validation-sessions`

## Manifest-Backed Validation-Session Artifact Sync Re-scope

The next credible milestone after issue `#4` is not broader surface expansion. It is reducing repo workflow friction for the validation-session surface that already exists.

What the current repo and consumer state show:
- SNPM now has stable per-record commands for `validation-session create`, `pull`, `diff`, `push`, and the narrow `validation-sessions verify` check
- `C:\\tall-man-training` already treats `ops/validation-sessions/` as repo-side sync artifacts rather than the primary reporting surface
- the Tall Man Training docs explicitly keep runbooks, build history, current status, and active planning primary in Notion
- that means the first manifest-backed sync slice should not try to batch every managed surface SNPM can touch

Consumer-repo signal from `C:\\tall-man-training`:
- `docs/dev-guide.md` explicitly calls out `ops/validation-sessions/` as the repo-owned sync-artifact surface
- `ops/validation-sessions/README.md` already documents pull / diff / push behavior for managed session files
- there is already a real managed artifact file at `ops/validation-sessions/iphone-testflight-0.5.1-2-sean-2026-03-28.md`
- there is no equivalent repo-side artifact inventory for runbooks or build records; those remain deliberately Notion-first

Chosen milestone direction:
- add a small repo-local manifest and batch sync commands for validation-session files only
- make `C:\\tall-man-training` the first dogfood consumer
- keep this as repo-backed artifact sync, not a general Notion multi-surface sync layer

Chosen v1 sync shape:
- repo manifest file: `snpm.sync.json`
- manifest fields: `version`, `workspace`, `project`, and `entries`
- entry shape: `{ kind, title, file }`
- `kind` is limited to `validation-session`
- `title` is the Notion row title under `Ops > Validation > Validation Sessions`
- `file` is relative to the manifest directory

Chosen behavioral boundaries:
- `sync check` compares local files to existing managed validation-session rows and reports drift per entry
- `sync pull` previews or writes local files from Notion, but it does not initialize or adopt anything
- `sync push` previews or writes Notion rows from local files, but it does not initialize or adopt anything
- missing surface, missing row, or unmanaged row are operator errors with explicit guidance to use `validation-sessions init`, `validation-session create`, or `validation-session adopt`
- project token remains the documented normal path, with workspace-token fallback still constrained to the same project-owned validation-session surface

## Manifest-Backed Validation-Session Artifact Sync Result

The validation-session artifact-sync milestone was implemented and live-validated on `2026-03-29`.

Implementation result:
- added `snpm.sync.json` parsing with strict validation for `version`, `workspace`, `project`, and validation-session `entries`
- added `sync check`, `sync pull`, and `sync push` as validation-session-only batch commands
- kept sync scoped to existing SNPM-managed validation-session rows; no implicit surface initialization, row creation, or unmanaged-row adoption
- reused the existing validation-session pull/diff/push services rather than introducing a second content format or target model
- added a focused repo doc for manifest-backed validation-session sync plus consumer-repo docs and a Tall Man Training manifest

Repo-level validation result:
- `npm test` passed with `73` tests after adding sync-manifest, sync-service, and CLI coverage
- `node src/cli.mjs help` prints the new sync command surface and manifest-scope constraints

Live dogfood result on `C:\\tall-man-training`:
- `validation-sessions-verify --project "Tall Man Training" --project-token-env TALLMAN_NOTION_TOKEN` passed before and after sync testing
- `sync-check` passed against `C:\\tall-man-training\\snpm.sync.json` before mutation
- `sync-pull` preview and `sync-pull --apply` both succeeded from the Tall Man Training repo context while using `C:\\SNPM` as the control checkout
- a temporary local edit to `ops/validation-sessions/iphone-testflight-0.5.1-2-sean-2026-03-28.md` produced the expected `sync-push` preview and `sync-push --apply` mutation against the live validation-session row
- the temporary change was then removed locally and pushed back to Notion successfully
- the final local artifact required one more `sync-pull --apply` normalization pass because Notion's stored markdown shape preserves `<empty-block/>` without a final newline
- final `sync-check` returned `No sync changes.`

Important live-workflow nuance:
- repo-backed validation-session artifacts can show drift that is only end-of-file normalization on `<empty-block/>`
- the safe resolution is `sync-pull --apply`, not manual cleanup of the stored artifact shape

## Checkbox-First Validation-Session Workflow Re-scope

Issue `#5` is not asking for more generic validation-session CRUD. It is pointing out that the current managed execution surface is the wrong UX for a human tester running a real device checklist.

What the issue and current state show:
- the database row schema is adequate as a session container and metadata record
- the current managed body contract is still prose-edit-heavy even after validation-session CRUD and manifest sync landed
- the active Tall Man session currently uses plain markdown bullets under `## Checklist`, not real task-list items
- there is already a repo-local Tall Man `_template.md` file for validation sessions, but it follows the same prose-bullet checklist shape
- the downstream team wants SNPM to own the human-facing validation-session template and workflow, not just the underlying storage path

Key product signal from the issue:
- the friction is step-by-step execution inside the session page, not session creation
- form views are optional and secondary
- the right v1 improvement is a checkbox-first page-body contract with a short central `Findings` section
- this remains a narrow workflow/template redesign for validation sessions, not a request for generic Notion checklist tooling

Chosen milestone direction:
- keep the current validation-session command surface and row schema
- redesign the managed validation-session body contract around:
  - `Session Summary`
  - `Checklist`
  - `Findings`
  - `Follow-Up`
- use real markdown task-list syntax so the existing pull / diff / push / sync path continues to own the content
- keep verifier behavior structural and schema-focused; do not start auditing exact checklist content

Chosen rollout shape:
- make the global managed default body checkbox-first but generic
- use the current Tall Man iPhone/TestFlight checklist as the first concrete live seed and migration target
- migrate the active Tall Man validation-session row plus its repo-backed artifact in this milestone
- document a bounded manual UI step for the Tall Man `Validation Sessions` database template and button; SNPM owns the contract and workflow, not full Notion template/button automation in v1

## Checkbox-First Validation-Session Workflow Result

The checkbox-first validation-session workflow milestone was implemented and live-validated on `2026-03-29`.

Implementation result:
- the managed default validation-session body is now checkbox-first and standardized as:
  - `Session Summary`
  - `Checklist`
  - `Findings`
  - `Follow-Up`
- the managed default uses real markdown task-list items under `Checklist`, while keeping the existing validation-session row schema unchanged
- validation-session docs, sync docs, README, GitHub testing docs, and Tall Man Training workflow docs now describe the checkbox-first execution model
- the Tall Man repo-local validation-session `_template.md` and active iPhone/TestFlight artifact were migrated to real task-list syntax

Automated validation result:
- `npm test` passed with `74` tests after updating the managed-body defaults and adding checkbox round-trip coverage
- the test suite now proves checkbox-first defaults, validation-session round-tripping, and manifest-sync handling of task-list markdown without changing schema-verification behavior

Live validation result:
- `validation-session-pull`, `validation-session-diff`, `validation-session-push --apply`, follow-on `validation-session-pull`, and final `validation-session-diff` all succeeded on `Projects > SNPM > Ops > Validation > Validation Sessions > SNPM Validation Session Fixture`
- the SNPM fixture was migrated from the earlier prose body to the checkbox-first body and ended with `No body changes.` after normalization
- `validation-sessions-verify --project "SNPM" --project-token-env SNPM_NOTION_TOKEN` continued to pass after the fixture migration
- the active Tall Man session `iPhone TestFlight 0.5.1 (2) - Sean - 2026-03-28` was migrated through the existing manifest-sync path with `sync-push --apply`, `sync-pull --apply`, and final clean `sync-check`
- `validation-sessions-verify --project "Tall Man Training" --project-token-env TALLMAN_NOTION_TOKEN` passed before and after the migration
- the live Tall Man runbook `iOS TestFlight Internal Distribution` was updated in place to point operators at the checkbox-first session flow and the manual database-template / button path

Bounded manual step that remains:
- SNPM does not automate Notion database-template creation or the `Submit Validation Session` button
- the correct v1 contract is to document that manual UI step clearly and keep the session body, migration flow, and repo sync path under SNPM control

## 2026-03-29 — Branch Publication and Development Cut

- Branch operations for the new Tall Man feedback response should stay in `C:\\SNPM`, not `C:\\tall-man-training`.
- The local `C:\\SNPM` worktree was clean at the start of this pass.
- Local `main` was ahead of `origin/main` by two commits:
  - `094356a` `Add validation-session manifest sync`
  - `3111528` `Adopt checkbox-first validation sessions`
- The only remote branch visible before publication was `origin/main`.
- In this repo, "merge with main" means publishing the validated local `main` baseline first, then creating `codex/development` from that published tip.
- If `origin/main` moved before publication, the safe fallback is to merge `origin/main` into local `main`, rerun the relevant SNPM validation, and only then push and cut `codex/development`.

## 2026-03-29 — Validation-Session Triage Workflow Re-scope

Issue `#6` is not another request for more validation-session commands. The current CRUD, verifier, and manifest-sync surface are adequate. The remaining friction is the triage UX after the checklist.

What the issue and current repo state show:
- the checkbox-first checklist from issue `#5` improved session execution materially
- the current managed body still defaults `Findings` and `Follow-Up` to plain bullet lists
- that leaves the tester in a prose-edit workflow exactly where the most important post-checklist triage should be faster and more structured
- the right next slice is a body-contract redesign plus explicit documentation of which Notion primitives are canonical versus UI-only

Relevant current Notion support from the official markdown docs:
- Notion markdown explicitly supports:
  - to-do blocks
  - toggle blocks via `<details>` / `<summary>`
  - callouts via `<callout>`
  - simple tables via `<table>`
- Notion markdown explicitly does not render template blocks; unsupported blocks are returned as `<unknown .../>`
- comments are a separate API surface; the public API can add page comments and reply to existing discussions, but it cannot start a new inline discussion thread on a block

Chosen canonical-vs-UI split for this milestone:
- Safe canonical synced body:
  - `To-do blocks`
  - `Toggle blocks`
  - `Callouts`
- Useful only in a richer UI layer for this workflow:
  - `Buttons`
  - `Database templates`
  - `Mentions`
  - `Status / select / checkbox properties`
- Explicitly unsupported or too risky for the current canonical sync model:
  - `Comments / discussions` as canonical report content
  - `Linked databases / relation properties` for v1 validation-session triage
  - `Simple tables / layout primitives` as the default triage shape even though basic table blocks exist, because they add structure cost and worse diff ergonomics without solving the main tester interaction problem

Chosen v1 triage direction:
- keep the row schema and command surface unchanged
- redesign the managed body contract so `Findings` becomes callout-first with optional collapsible detail blocks
- redesign `Follow-Up` so the default interaction model is to-do items, not prose bullets
- keep button/template setup as a documented UI-only accelerator rather than trying to automate it in this milestone
- validate the new body contract on SNPM-managed fixtures and keep Tall Man Training repo state untouched during this pass

## 2026-03-29 — Validation-Session Triage Workflow Result

The triage-workflow milestone was implemented and live-validated on `codex/development`.

Implementation result:
- the managed validation-session default body still uses `Session Summary`, `Checklist`, `Findings`, and `Follow-Up`
- `Findings` is now callout-first with an optional `<details>` / `<summary>` block for deeper evidence
- `Follow-Up` now defaults to to-do items instead of plain bullet lists
- the command surface and row schema remain unchanged
- repo docs now classify the key Notion primitives into canonical synced body, richer UI layer, and unsupported/risky behavior for the current sync model

Normalization result:
- the first live proof exposed a real formatting gap: Notion returned callout and toggle content with tab indentation and tighter spacing that made `pull -> diff` non-clean
- that was fixed by normalizing validation-session body markdown around callout/toggle blocks before rendering local files and before diff/push comparisons
- after that fix, the pulled local file became the stable canonical editable shape again

Validation result:
- `npm test` passed with `75` tests after adding triage-body and normalization coverage
- the live `SNPM Validation Session Fixture` was migrated from bullet-style triage to the new callout/toggle/to-do model
- `validation-session-pull` on that fixture now produces a normalized local file with clean `pull -> diff`
- `validation-sessions-verify --project "SNPM" --project-token-env SNPM_NOTION_TOKEN` continued to pass after the migration

Scope intentionally preserved:
- no Tall Man Training repo files were changed in this pass
- no new validation-session commands were added
- no row schema changes were introduced
- Notion buttons/templates remain a documented UI-layer accelerator rather than a new SNPM automation surface

## 2026-03-29 — Project Access Surfaces Re-scope

GitHub issue `#7` from the Contour team is a product/API gap, not a bug in the current shipped surface.

Current repo and workspace facts:
- `Projects > <Project> > Access` is part of the standard starter tree and already exists for `Contour`
- the current shipped CLI has no `Access` command family and the repo docs do not define a supported workflow for creating child pages under `Projects > <Project> > Access`
- the live `Access` landing page explicitly says it is an index/context page, not the default raw-secret dump target
- that same page already points operators at three subpage patterns:
  - `Access Domain Template`
  - `Access Token Record Template`
  - `Secret Record Template`
- the live template library currently contains:
  - `Templates > Misc Templates > Project Subpage Templates > Access Domain Template`
  - `Templates > Misc Templates > Project Subpage Templates > Access Token Record Template`
- the live template library does **not** currently contain `Secret Record Template`, even though the project `Access` landing page tells operators to use it
- the live access taxonomy already includes the domain `App & Backend`

Immediate product answer for Contour:
- `Access Index` remains out of scope for project work
- project-token writes remain the intended normal path
- the intended project-local destination for a service secret like `GEMINI_API_KEY` is:
  - `Projects > Contour > Access > App & Backend > GEMINI_API_KEY`

Chosen milestone direction:
- do two things together:
  - document the current manual workflow clearly and prominently
  - ship a first-class managed Access surface so other repos and Codex threads do not fall back to ad hoc Notion mutation
- first-wave Access support should cover:
  - Access domain pages directly under `Projects > <Project> > Access`
  - generic secret record pages under an Access domain
  - scoped access token record pages under an Access domain
- direct children of `Projects > <Project> > Access` should be Access domain pages only
- generic secret and token records should live under a domain page, not directly under the `Access` root
- the managed implementation should reuse the existing SNPM page model:
  - managed header above the divider
  - body ownership below the divider
  - create / adopt / pull / diff / push flows
  - project-token-preferred auth with workspace-token fallback

Chosen live-validation boundary:
- do **not** mutate `Projects > Contour` in this milestone
- prove the feature only on `Projects > SNPM > Access` fixtures
- after the code path is validated, add `Secret Record Template` to the live template library and fix the `Project Templates > Access` page so the manual workflow and the managed workflow agree

## 2026-03-29 — Project Access Surfaces Result

The first-class project Access-surface milestone was implemented and live-validated on `codex/development`.

Implementation result:
- SNPM now ships first-class managed commands for:
  - `access-domain create|adopt|pull|diff|push`
  - `secret-record create|adopt|pull|diff|push`
  - `access-token create|adopt|pull|diff|push`
- the Access target model is now explicit in code and docs:
  - direct children of `Projects > <Project> > Access` are domain pages
  - secret and token records live under a domain page
  - `Access Index` remains out of scope for project-token-safe day-to-day work
- managed Access pages reuse the existing SNPM page model:
  - standard managed header above the divider
  - body ownership below the divider
  - create/adopt/pull/diff/push workflow
  - project-token-preferred auth with workspace-token fallback
- verification now allows dynamic descendants under `Access` while recursively validating managed Access descendants without weakening unrelated drift checks

Repo/documentation result:
- a dedicated `docs/project-access.md` now explains both:
  - the current manual template-based workflow
  - the new managed SNPM workflow
- README, roadmap, and tester docs now expose the Access surface clearly enough that a Codex thread should not need to infer it from the workspace tree alone

Live validation result on `Projects > SNPM`:
- created `Projects > SNPM > Access > App & Backend`
- created managed secret fixture `Projects > SNPM > Access > App & Backend > GEMINI_API_KEY`
- created managed token fixture `Projects > SNPM > Access > App & Backend > SNPM_NOTION_TOKEN`
- `secret-record-pull`, `secret-record-diff`, `secret-record-push --apply`, follow-on `secret-record-pull`, and final clean `secret-record-diff` succeeded with `SNPM_NOTION_TOKEN`
- `access-token-pull`, `access-token-diff`, `access-token-push --apply`, follow-on `access-token-pull`, and final clean `access-token-diff` succeeded with `SNPM_NOTION_TOKEN`
- `verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN` passed after the Access fixtures existed

Live workspace documentation/template result:
- added `Secret Record Template` under `Templates > Misc Templates > Project Subpage Templates`
- updated `Templates > Misc Templates > Project Subpage Templates` so the template library now lists domain, secret, and token Access templates together
- updated `Templates > Project Templates > Access` so it now explicitly says:
  - domain pages are the direct children of the Access root
  - secret and token records should be nested under a domain page
  - `App & Backend` is a valid first example domain

Scope intentionally preserved:
- `Projects > Contour` was not mutated in this milestone
- `Access Index` was not touched
- no new narrow Access-only verifier was added

## 2026-03-29 — SNPM Access Fixture Cleanup Correction

Live re-check after the Contour follow-up request:
- `Projects > Contour > Access` is still untouched and has no child pages
- the Access test fixtures created during the Access-surface milestone exist only under `Projects > SNPM > Access`
- live SNPM Access fixture tree before cleanup:
  - `Projects > SNPM > Access > App & Backend`
  - `Projects > SNPM > Access > App & Backend > GEMINI_API_KEY`
  - `Projects > SNPM > Access > App & Backend > SNPM_NOTION_TOKEN`

Accepted cleanup scope:
- remove only the live SNPM Access fixtures listed above
- keep the Access feature implementation in the repo
- keep the Access template-library updates and project-template guidance in place
- do not mutate `Projects > Contour`

Cleanup result:
- trashed the two child record pages first, then trashed the parent `App & Backend` domain page
- `Projects > SNPM > Access` is now empty again
- `Projects > Contour > Access` remains empty
- `verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN` passed after cleanup

## 2026-03-29 — Workflow Operator Roadmap Reset

After real use by `Tall Man Training`, `Contour`, and additional Codex-thread testing, the strongest product signal is now clear:
- users do **not** primarily want a broader generic Notion client
- users want a project-token-safe workflow operator for normal project work
- the winning unit of product value is not "one more page surface"; it is "one more complete task workflow"

Key lessons from shipped slices and issue flow:
- Tall Man validated that human workflow quality matters as much as API coverage:
  - the critical improvements were `validation-sessions verify`, checkbox-first session bodies, manifest-backed artifact sync, and triage-first `Findings` / `Follow-Up`
  - that is a workflow-UX signal, not a CRUD-surface signal
- Contour validated that discoverability and safe mutation boundaries matter more than generic flexibility:
  - the useful answer was the exact project-local secret path plus a managed project-local Access model
  - the wrong answer would have been "use the workspace however you want"
- Cross-repo Codex usage validated that the product boundary should stay task-oriented:
  - if SNPM does not expose the task directly, threads fall back to ad hoc Notion API logic
  - that defeats the guardrail model the repo is supposed to provide
- Existing-project adoption is now a first-class requirement:
  - every successful surface family needed some combination of `adopt`, narrow verification, or explicit normalization guidance
  - greenfield-only tooling would not match the real workspace
- Repo sync demand is selective, not universal:
  - repo-backed sync clearly fits validation-session artifacts
  - there is not yet the same downstream signal for making runbooks, build records, or Access records repo-primary

Publication and roadmap-boundary correction:
- published `main` currently includes:
  - planning-page sync
  - runbook/build-record operations
  - validation-session reporting plus `validation-sessions verify`
  - manifest-backed validation-session sync
  - checkbox-first validation-session workflow
- the latest published tester-facing tag is still `sprint-3-validation-sessions`, so the testing contract lags the published `main` baseline
- `codex/development` adds the committed triage-workflow slice and the committed Access-surface slice on top of published `main`
- the first-class Access-surface implementation should now be treated as committed development-branch work, not published baseline

Chosen roadmap reset:
- re-scope SNPM around the thesis: "project-token-safe workflow operator for real project work"
- shift roadmap language away from "more primitive surfaces and broader sync first"
- organize next work into phases:
  - Phase 0: stabilize and publish the real shipped baseline, or explicitly pause newer local-only slices
  - Phase 1: build workflow bundles for the real jobs teams are doing
  - Phase 2: add project doctoring, recommendation, and adoption planning
  - Phase 3: harden distribution and repeatable cross-repo consumption
  - Phase 4: expand only those surfaces that repeated workflow demand justifies

High-value product ideas surfaced by this reset:
- `snpm doctor` / `snpm recommend` to tell an operator what exists, what is missing, what is unmanaged but adoptable, and what command to run next
- workflow bundles that orchestrate existing primitives for:
  - validation run lifecycle
  - release/build evidence capture
  - project access record creation/update
  - runbook standardization and maintenance
- project capability profiles so Codex threads can discover optional project-owned surfaces without tree spelunking
- workflow-linked evidence models that connect builds, validation sessions, release readiness, and project-scoped access changes

## 2026-03-29 — `snpm doctor` v1 Design

Goal:
- add one read-only, project-scoped command that answers:
  - what approved managed surfaces already exist
  - what optional surfaces are missing
  - what existing pages are unmanaged but adoptable
  - what command the operator should run next

Chosen command shape:
- `doctor --project "<Project>" [--project-token-env TOKEN_ENV]`
- `recommend --project "<Project>" [--project-token-env TOKEN_ENV]` as an alias to the same implementation

Chosen output contract:
- top-level fields:
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
- `ok` should reflect hard issues only:
  - unmanaged-but-adoptable content should not make the command fail by itself
  - missing optional surfaces should not make the command fail by itself

Chosen auth/read model:
- use the workspace token as the discovery source of truth for the doctor scan itself
- if `--project-token-env` is provided:
  - run the existing project-token scope checks
  - expose the result as a dedicated scope section inside `surfaces`
  - keep `projectTokenChecked: true`
- if `--project-token-env` is omitted:
  - keep `projectTokenChecked: false`
  - do not synthesize fake scope failures
  - recommend rerunning with a project token only when that extra readiness signal is relevant

Chosen v1 surfaces:
- `Runbooks`
- `Ops > Builds`
- `Ops > Validation > Validation Sessions`
- `Access`

Chosen surface rules:
- Runbooks:
  - inspect direct child pages under `Runbooks`
  - classify each child page as managed, unmanaged, or managed-with-issues
  - unmanaged direct children are adoptable via `runbook adopt`
- Builds:
  - `Ops > Builds` remains optional
  - if missing, recommend `build-record create` for first use
  - if present, inspect direct child pages under `Builds`
  - existing unmanaged build pages are issues rather than adoptable content because there is no `build-record adopt` command today
- Validation Sessions:
  - reuse the current `validation-sessions verify` logic for structural/schema health
  - if initialized, inspect row pages and classify unmanaged rows as adoptable via `validation-session adopt`
  - if missing, recommend `validation-sessions init`
- Access:
  - inspect direct child pages under `Access` as domain pages
  - inspect direct child pages under each domain as secret/token records
  - unmanaged domains are adoptable via `access-domain adopt`
  - unmanaged records should be classified heuristically:
    - `🪪` icon or token-shaped body -> `access-token adopt`
    - otherwise -> `secret-record adopt`
  - any direct record-like child under `Access` root is a structural issue because only domain pages belong there

Chosen implementation boundary:
- add a new service module instead of widening `verify-project`
- reuse:
  - `findChildPage` and `verifyScope` from `project-service.mjs`
  - target/path helpers from `page-targets.mjs`
  - canonical-source helpers from `template-blocks.mjs` and `project-model.mjs`
  - validation-surface verification from `validation-sessions.mjs`
- keep the command read-only:
  - no page creation
  - no adoption
  - no template mutation
  - no Notion workspace restructuring

## 2026-03-29 — `snpm doctor` v1 Result

Implementation result:
- added a read-only `doctor` command plus `recommend` alias
- added structured JSON output for:
  - managed surface summaries
  - hard issues
  - unmanaged-but-adoptable content
  - actionable next-step recommendations
- kept the command workspace-token-driven for discovery while making project-token scope checks optional and explicit
- reused the existing validation-session verifier and project-token scope helper instead of widening `verify-project`

Surface result:
- `Runbooks`
  - direct child runbooks are classified as managed or unmanaged
  - unmanaged direct children produce `runbook adopt` recommendations
- `Ops > Builds`
  - missing optional `Builds` produces a `build-record create` recommendation
  - existing unmanaged build pages are surfaced as issues because no `build-record adopt` path exists yet
- `Validation Sessions`
  - missing optional initialization produces `validation-sessions init` recommendation
  - unmanaged row pages produce `validation-session adopt` recommendations when the row has a usable title
  - rows missing a `Name` title are hard issues because SNPM cannot target them safely yet
- `Access`
  - empty Access roots are summarized cleanly
  - unmanaged domains produce `access-domain adopt` recommendations
  - unmanaged nested records produce `secret-record adopt` or `access-token adopt` recommendations using icon/body heuristics

Live validation result:
- `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN` passed cleanly and correctly reported:
  - `Runbooks` present
  - `Ops > Builds` present
  - `Validation Sessions` present
  - `Access` present and currently empty after fixture cleanup
- `doctor --project "Tall Man Training" --project-token-env TALLMAN_NOTION_TOKEN` intentionally surfaced real health and adoption work without mutating the project:
  - one unmanaged runbook remains adoptable
  - one validation-session row is missing a `Name` title and must be titled manually before adoption
  - multiple legacy pages still use older canonical-source strings and custom icons, which the new doctor surface now exposes explicitly as health issues
- cross-repo invocation from `C:\\tall-man-training` against the shared `C:\\SNPM` checkout succeeded and returned the same Tall Man assessment

Product lesson from the live Tall Man scan:
- the command already delivers value because it can surface adoption work and drift safely
- legacy custom icons/canonical strings are now a clear migration problem category
- the next high-value layer after doctor is still workflow bundles, but the strongest immediate follow-on inside doctoring is better migration guidance for known legacy patterns

## 2026-03-29 — Issue #8 and Validation-Session UI Bundle Hardening

Issue `#8` changes the near-term roadmap, but it does not change the core product thesis.

What changes:
- a complete SNPM workflow now has four required layers:
  - managed Notion surface
  - sync-safe canonical body
  - supported Notion UI bundle around that body
  - narrow verification plus operator guidance
- validation sessions are the first place where the product has enough real usage to prove that UI-layer standardization matters as much as the markdown/data model

What does **not** change:
- SNPM remains a project-token-safe workflow operator, not a generic Notion client
- generic UI automation is still the wrong boundary for v1
- the public Notion API remains the control plane for SNPM-managed behavior

Chosen response to issue `#8`:
- use a `Docs + Verify` approach rather than generic UI automation
- define one blessed validation-session UI bundle rather than per-project variants
- keep bundle verification honest:
  - verify API-visible rules only
  - return explicit manual checks for UI-only pieces such as views, form wiring, templates, and buttons

Public-API grounding:
- the Notion API can create and update data sources and create pages from templates
- the Notion API still does not manage views through the public API; that remains a manual UI concern
- that means SNPM should standardize and document the UI bundle, and verify only the parts it can safely inspect

Chosen blessed validation-session UI bundle:
- primary view: `Active Sessions`
- backup intake form: `Quick Intake`
- database template: `Validation Session`
- safe extra API-visible property: `Issue URL` as `url`
- canonical synced body stays limited to headings, paragraphs, links, to-dos, callouts, and `<details>`
- unsafe in the canonical synced body:
  - button blocks
  - form blocks
  - unsupported UI/layout blocks
  - template bodies that diverge from the SNPM-managed canonical body

Roadmap impact:
- this bundle-hardening slice should land before broader workflow bundles
- future workflow milestones should explicitly define both:
  - the canonical sync-safe content contract
  - the supported surrounding Notion UI bundle
- `doctor` remains useful and should stay read-only; this milestone hardens one workflow instead of replacing doctoring

## 2026-03-29 — Validation-Session UI Bundle Hardening Result

Implementation result:
- added `validation-sessions verify --bundle` on top of the existing narrow verifier
- kept default `validation-sessions verify` behavior unchanged
- bundle mode now:
  - reuses the current surface/schema checks
  - allows the optional `Issue URL` property when it is `url`
  - verifies managed row bodies still match the blessed sync-safe contract
  - fails when unsupported or unsafe body content appears
  - returns explicit manual checks for `Active Sessions`, `Quick Intake`, `Validation Session`, and button wiring
- added dedicated bundle guidance in repo docs and updated the roadmap/testing docs accordingly

Live result:
- `Projects > SNPM > Ops > Validation > Validation Sessions` initially failed bundle verification because older fixtures predated the full bundle contract
- those SNPM fixtures were normalized onto the blessed body shape and `validation-sessions verify --bundle` now passes there
- `Projects > Tall Man Training > Ops > Validation > Validation Sessions` already passed the API-visible bundle verifier
- cross-repo `sync-check` from `C:\\tall-man-training` remained clean for the active TestFlight session artifact
- the live Tall Man runbook `iOS TestFlight Internal Distribution` was standardized and updated to point at the blessed validation-session UI bundle and repo-sync boundary
- `Templates > Project Templates > Ops > Validation` was updated so shared guidance points at the blessed bundle and the new `--bundle` verifier

Explicit remaining boundary:
- the public API implementation is complete for this milestone
- the UI-only steps remain manual by design:
  - `Active Sessions` view configuration
  - `Quick Intake` form configuration
  - `Validation Session` template configuration
  - button wiring
- SNPM now documents and reports those manual checks explicitly, but it does not automate them in this slice

## 2026-03-29 — Hybrid UI Automation Lane for the Validation-Session Bundle

Problem statement:
- the current public-API control plane stops at honest docs plus verification for the validation-session bundle
- that leaves four high-friction UI-only steps manual:
  - `Active Sessions` view
  - `Quick Intake` form
  - `Validation Session` template
  - button wiring on `Projects > <Project> > Ops > Validation`
- Tall Man and SNPM now have enough validation-session usage to justify automating this exact bundle instead of documenting it indefinitely

Chosen product response:
- keep the public Notion API lane as the stable control plane for:
  - managed surfaces
  - canonical sync-safe markdown bodies
  - schema checks
  - repo sync
  - API-visible bundle verification
- add a second, opt-in UI automation lane that is explicitly narrower and more fragile:
  - Chromium-only Playwright automation
  - validation-session bundle only
  - no generic Notion UI builder tooling

Why this boundary is correct:
- Notion view/form/button configuration is still fundamentally UI-managed in practice for this workflow
- the public API remains the right source of truth for data and structure, but not for fully reconciling the surrounding operator UX
- a hybrid control plane keeps the current API-based surfaces stable while giving SNPM a credible way to finish one workflow end to end

Machine constraints and browser choice:
- Edge is not a viable runtime on this machine and must not be targeted
- LibreWolf is the default browser on this machine and must not be used implicitly
- the supported browser path is Playwright Chromium only
- login must happen inside a Playwright-launched Chromium window, not through shell-open or default-browser handoff

Chosen bundle scope:
- automate and verify one exact v1 bundle:
  - `Active Sessions` view
  - `Quick Intake` form
  - `Validation Session` database template
  - button on `Projects > <Project> > Ops > Validation`
- keep runbooks out of button wiring for v1
- treat `Quick Intake` as valid only if submitted rows immediately inherit the SNPM-managed `Validation Session` body

Implementation direction:
- add a new `validation-bundle` command family rather than widening `validation-sessions`
- keep `validation-sessions verify --bundle` as the API-visible verifier
- add a separate `src/notion-ui/` subsystem for:
  - bundle spec
  - Chromium session/profile management
  - UI action planning
  - UI apply flows
  - UI verification flows
- store browser profile state, traces, and screenshots outside the repo
- fail loudly on selector drift or expired login so the stable API lane is never confused with the UI lane

Roadmap impact:
- this hybrid UI lane now becomes the next milestone ahead of broader workflow-bundle orchestration
- future workflow milestones should define both:
  - canonical sync-safe content
  - supported surrounding Notion UI bundle
- `doctor` remains useful as-is; this milestone completes one workflow rather than replacing read-only discovery

## 2026-03-29 — Hybrid UI Automation Lane Result

Implementation result:
- added `validation-bundle login`, `preview`, `apply`, and `verify`
- kept `validation-sessions verify --bundle` as the API-visible verifier rather than widening it into a UI driver
- added a separate `src/notion-ui/` subsystem for:
  - Chromium profile/session handling outside the repo
  - machine-readable validation-bundle metadata
  - UI planning/apply/verify flows
- added Playwright and locked the supported browser path to Chromium only
- added runtime protection against Edge/default-browser handoff and a clear install path for Playwright Chromium
- moved template verification back onto the stable API lane by using data-source template listing plus markdown verification

Important model adjustment:
- database templates cannot know the future row title, but the managed validation-session header normally encodes the exact row path
- the implemented compromise is a template-managed canonical placeholder:
  - `Projects > <Project> > Ops > Validation > Validation Sessions > <Session Title>`
- rows created from the UI bundle still inherit the managed header/body contract immediately
- the first SNPM pull/push cycle then normalizes the placeholder to the exact row title path
- validation-session verification was updated to accept that placeholder as part of the supported bundle path

Validation result:
- `npm test` passes with the new UI-lane coverage
- `npx playwright install chromium` succeeded locally
- `validation-bundle preview -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN` succeeded as a live non-mutating probe of the browser lane:
  - Playwright Chromium launched directly
  - no Edge or default-browser path was used
  - the command correctly reported that no persisted Chromium Notion login exists yet
- that means the remaining live gap is no longer product design or repo code; it is the first interactive Chromium login seed

Explicit remaining live step:
- `validation-bundle-login` still needs one manual interactive Chromium login on this machine before end-to-end live apply/verify can run on `SNPM` and `Tall Man Training`
- until that login is seeded, the repo implementation is complete but full live UI-bundle reconciliation remains blocked by auth rather than by the public API boundary

## 2026-03-29 — Contour Narrow-Band Product Signal

Contour's direct feedback is the clearest product signal so far because it splits value from drag without ambiguity.

What Contour says is clearly helping:
- project bootstrap gives a consistent Notion structure
- Access records are useful for canonical secret storage
- managed planning pages keep roadmap, current cycle, and decision log synchronized
- managed runbooks work well for operator-state inventory such as VPS host tracking

What Contour says is clearly slowing work down:
- the supported surface model is still incomplete, so real ops data gets forced into the nearest supported shape
- simple updates still require temp files and command choreography too often
- building SNPM while depending on it means tool gaps immediately interrupt project work
- some truths already live better in the repo, so Notion can become duplication rather than leverage

Product conclusion from this feedback:
- SNPM should stay mostly Notion-first, but it should stop expanding scope until the narrow band that is already valuable becomes easier to use
- the primary product line is now:
  - `create-project` / `verify-project`
  - planning-page sync
  - managed runbooks
  - managed Access records
- secondary or conditional surfaces are now:
  - build records
  - validation sessions
  - manifest-backed sync
  - Chromium UI automation

Roadmap effect:
- the `codex/validation-bundle` browser lane should be preserved as experimental branch work, but paused as a non-core track rather than treated as the next publication target
- the next active milestone should be ergonomic cleanup on the primary band, not more surface expansion
- the first concrete ergonomics gap is temp-file choreography, so the next code change should add stdin/stdout support to the core pull/create/diff/push flows

Chosen repo-vs-Notion boundary:
- Notion-primary:
  - planning pages
  - runbooks
  - canonical Access records
  - live operator inventory
- Repo-primary:
  - code-coupled docs
  - generated artifacts
  - machine-owned outputs
  - any artifact where the repo is plainly the better long-term source of truth
- Hybrid only when justified:
  - validation-session artifacts and similar cases where repo sync adds real value without duplicating the whole workflow

High-value next differentiator after ergonomics:
- extend `doctor` / `recommend` from surface-health reporting into truth routing
- the command should eventually tell an operator whether an update belongs in Notion, the repo, or a justified hybrid path, and explain why before duplication is created

## 2026-03-29 — Contour Narrow-Band Reset Result

Implementation result:
- updated the repo docs and live SNPM planning pages so the active product line is now clearly the narrow band:
  - bootstrap / verify
  - planning-page sync
  - managed runbooks
  - managed Access records
- reclassified `codex/validation-bundle` as paused experimental work rather than the near-term publication target
- made the repo-vs-Notion ownership boundary explicit in README, roadmap docs, and the live planning pages
- added a shared stdin/stdout command I/O helper and wired it into the core band:
  - `page-pull`, `page-diff`, `page-push`
  - `runbook-create`, `runbook-pull`, `runbook-diff`, `runbook-push`
  - `access-domain`, `secret-record`, and `access-token` create/pull/diff/push
- kept preview-first mutation behavior unchanged and routed structured success metadata to stderr when a pull command uses `--output -`

Validation result:
- `npm test` passed with `103` tests
- `Projects > SNPM > Planning > Roadmap` was updated through the stdin/stdout path and ended with a clean `page-pull --output - | page-diff --file -`
- `Runbooks > SNPM Operator Validation Runbook` was updated through the stdin/stdout path and ended with a clean direct pipe `runbook-pull --output - | runbook-diff --file -`
- a temporary SNPM-only Access fixture domain and secret record were created, updated through the stdin/stdout path, verified clean with `secret-record-diff --file -`, and then archived so `Projects > SNPM > Access` returned to empty
- `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN` confirmed `Access` is empty again after cleanup
- `verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN` passed after the live validation pass

Operational conclusion:
- the core-band stdin/stdout path removes a real chunk of operator friction without changing the safety model
- the next meaningful product move should now be truth routing inside `doctor` / `recommend`, not new surfaces and not resumed browser automation

## 2026-03-29 — Truth-Routed `recommend` Next Slice

Current baseline after the ergonomics cleanup:
- `codex/core-ergonomics` is the clean, pushed narrow-band baseline
- `codex/doctor` is now the correct integration base once it is fast-forwarded to that baseline
- `codex/validation-bundle` remains preserved paused experimental work

Competitive product boundary versus a generic Notion connector:
- SNPM should not compete on raw page/database reach
- SNPM should compete on:
  - approved-surface mutation only
  - exact project-token-safe paths
  - explicit Notion-vs-repo ownership
  - exact next commands instead of raw Notion access

Why truth routing is the next bread-and-butter slice:
- the current doctoring layer can already tell an operator what exists, what is missing, and what is adoptable
- the next practical gap is deciding where an update belongs before duplication is created
- this is the clearest place SNPM can be:
  - better than a generic connector, because it knows policy and approved targets
  - faster than ad hoc Notion access, because it can emit one exact next command
  - safer than generic workspace mutation, because it can reject the wrong home up front

Chosen v1 routing scope:
- keep the feature read-only
- keep `doctor --project "<Project>"` as the live surface scan
- keep `recommend --project "<Project>"` without an intent as an alias for that scan
- add an intent-driven routing form:
  - `recommend --project "<Project>" --intent <intent> ...`

Chosen v1 intents:
- `planning`
- `runbook`
- `secret`
- `token`
- `repo-doc`
- `generated-output`

Chosen v1 routing policy:
- `planning` -> `notion`
- `runbook` -> `notion`
- `secret` -> `notion`
- `token` -> `notion`
- `repo-doc` -> `repo`
- `generated-output` -> `repo`

Chosen command/context rules:
- `planning` requires `--page`
- `runbook` requires `--title`
- `secret` and `token` require `--domain` plus `--title`
- `repo-doc` and `generated-output` require `--repo-path`

Chosen behavior rules:
- repo-primary routes do not emit Notion mutation commands
- Notion-primary routes emit the exact approved SNPM command shape
- if the target exists but is unmanaged, route to `adopt` first
- if the target is missing, route to `create`
- unsupported or off-policy requests should fail clearly rather than guess
- no natural-language parsing in v1; routing stays explicit and flag-driven

Chosen implementation shape:
- reuse `diagnoseProject` rather than create a separate planner stack
- add one focused routing module that combines:
  - static ownership policy
  - required-context validation
  - live doctor scan results
  - exact next-command generation

Chosen branch plan:
- fast-forward `codex/doctor` to the `codex/core-ergonomics` tip
- create `codex/truth-routing` from the updated `codex/doctor`
- keep `main`, `codex/development`, and `codex/validation-bundle` unchanged

## 2026-03-29 — Truth-Routed `recommend` Result

Implementation result:
- fast-forwarded `codex/doctor` to the `codex/core-ergonomics` tip and created `codex/truth-routing` from that clean integration base
- updated the live `Projects > SNPM > Planning` pages first so truth routing was the active milestone before code changes
- extended `doctor` with a top-level `truthBoundaries` summary that explains:
  - planning pages -> `notion`
  - runbooks -> `notion`
  - Access records -> `notion`
  - repo docs -> `repo`
  - generated outputs -> `repo`
  - validation-session artifacts -> `hybrid`
- kept `recommend --project "<Project>"` without `--intent` as the existing read-only scan alias
- added deterministic intent routing for:
  - `planning`
  - `runbook`
  - `secret`
  - `token`
  - `repo-doc`
  - `generated-output`
- kept the feature read-only:
  - no new major surfaces
  - no browser automation
  - no generic arbitrary-page routing
  - no mutation inside `doctor` or `recommend`

Behavior result:
- Notion-primary intents now return the exact approved SNPM command shape for the current live state:
  - managed targets route to `pull`, `diff`, and `push`
  - unmanaged targets route to `adopt`
  - missing approved targets route to `create`
- repo-primary intents return one clear repo-owned answer and do not emit Notion mutation commands
- unsupported intents fail clearly instead of guessing
- routing remains explicit and flag-driven rather than natural-language based

Validation result:
- `npm test` passes with the new truth-routing coverage
- live SNPM-only read-only validation succeeded for:
  - `recommend --project "SNPM" --intent planning --page "Roadmap" --project-token-env SNPM_NOTION_TOKEN`
  - `recommend --project "SNPM" --intent runbook --title "SNPM Operator Validation Runbook" --project-token-env SNPM_NOTION_TOKEN`
  - `recommend --project "SNPM" --intent secret --domain "App & Backend" --title "GEMINI_API_KEY" --project-token-env SNPM_NOTION_TOKEN`
  - `recommend --project "SNPM" --intent repo-doc --repo-path "docs/operator-roadmap.md"`
  - `recommend --project "SNPM" --intent generated-output --repo-path "artifacts/build.json"`
- `verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN` remained green after the planning-page updates

Product conclusion:
- this is the clearest differentiation from a generic Notion connector so far
- SNPM now answers both:
  - what exists and what is adoptable
  - where a change should live before duplication is created
- the next useful layer after this is migration guidance for recurring legacy patterns surfaced by `doctor`, not new surfaces

## 2026-03-29 — SNPM Self-Hosted Notion Doc Audit

Current live SNPM doc inventory from the approved command surfaces:
- supported live documentation surfaces:
  - `Projects > SNPM > Planning > Roadmap`
  - `Projects > SNPM > Planning > Current Cycle`
  - `Projects > SNPM > Planning > Backlog`
  - `Projects > SNPM > Planning > Decision Log`
  - `Projects > SNPM > Runbooks > SNPM Operator Validation Runbook`
  - `Projects > SNPM > Runbooks > SNPM Operator Validation Legacy Runbook`
- current `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN` result:
  - no issues
  - no adoptable content
  - both runbooks are already managed
  - `Access` is empty

What this means for the audit:
- the cleanest self-hosting test is to update the live SNPM planning pages and the managed SNPM runbooks through SNPM itself
- these surfaces are already standardized and sit inside the current narrow supported band

What SNPM can test directly right now:
- planning pages through `page-pull`, `page-diff`, and `page-push`
- managed runbooks through `runbook-pull`, `runbook-diff`, and `runbook-push`
- truth routing and surface health through `doctor` / `recommend`

What SNPM still cannot update directly through the approved CLI:
- the `Projects > SNPM` root landing-page body
- arbitrary non-planning project pages
- template-library docs such as `Templates > Project Templates > ...`
- generic workspace docs outside the approved project-owned surfaces

Chosen audit goal:
- prove that SNPM can self-host updates on its own live Notion planning pages and managed runbooks without leaving the safe surface model
- capture the practical limitation that arbitrary page editing is still outside the approved CLI contract

Chosen audit validation:
- update the four live planning pages with a short self-hosting audit section or wording refresh through `page-pull` / `page-push`
- update both managed SNPM runbooks through `runbook-pull` / `runbook-push`
- run at least one unsupported-page probe and record the failure as a current product boundary rather than a bug
- finish with `verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN`

## 2026-03-29 — SNPM Self-Hosted Notion Doc Audit Result

What worked:
- the four approved planning pages were updated live through the supported `page-pull` / `page-diff` / `page-push` path
- both managed SNPM runbooks were updated live through the supported `runbook-pull` / `runbook-diff` / `runbook-push` path
- the live planning pages now document the actual current boundary:
  - supported self-hosted doc surfaces are planning pages and managed runbooks
  - unsupported surfaces include the project root landing page, template-library docs, and arbitrary non-surface pages
- `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN` stayed green after the audit
- `verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN` stayed green after the audit

What failed cleanly:
- an explicit unsupported-page probe against `Projects > SNPM` through `page-pull --page "Projects > SNPM"` failed with the approved-target guard rather than touching the wrong page
- this confirms the current boundary is enforced in the CLI rather than being only documentation

What did not round-trip cleanly yet:
- immediate re-diff on both planning pages and managed runbooks still reports trailing-newline-only drift
- the diff is limited to end-of-file newline normalization and does not indicate content loss or structural drift
- this is an ergonomics issue in the markdown round-trip, not a data-integrity failure

Product conclusion from the audit:
- SNPM is already credible for self-hosting updates on its narrow-band doc surfaces
- the next decision is not “more raw page reach”
- the next decision is whether:
  - migration guidance is enough for the current doc surfaces
  - or the project root / template-library docs justify a new managed surface later

## 2026-03-29 — Shared EOF Normalization For Managed Doc Surfaces

Chosen next slice:
- keep the current approved-surface model unchanged
- do not widen planning-page targets or add generic page editing
- fix the shared markdown round-trip so EOF-only trailing-newline mismatch no longer produces diffs on current managed doc surfaces

Why this is next:
- the self-hosting audit proved the current planning-page and managed-runbook surfaces are valuable and safe
- the only remaining friction on those surfaces was immediate re-diff drift caused by a missing final newline
- expanding page reach before removing that friction would add scope while leaving the core band rough

Chosen implementation boundary:
- fix the behavior once in the shared markdown/page helper layer
- apply it to:
  - approved planning pages
  - managed runbooks
  - managed Access pages
  - managed build records
- leave validation-session files and manifest sync unchanged because they use their own front-matter/body pipeline

Root cause from code inspection:
- `normalizeMarkdownNewlines(...)` currently collapses CRLF to LF but does not guarantee a canonical EOF shape for editable body markdown
- managed template builders already force a trailing newline in several places, but pull/diff/push on the shared page helpers do not canonicalize body EOF consistently
- `splitManagedPageMarkdown(...)` returns the raw body tail, so a stored markdown body without a final newline compares differently from an otherwise identical file body that ends with `\n`

Chosen normalization rule:
- preserve internal content and preserve intentional extra blank lines
- only normalize the single missing final newline case by ensuring editable managed-page bodies end with at least one trailing newline
- do not collapse multiple trailing blank lines, because that would hide real EOF-content drift

Acceptance target:
- update one approved planning page, then immediate `page-diff` is clean
- update one managed runbook, then immediate `runbook-diff` is clean
- unsupported root-page probes still fail with the approved-target guard
- `doctor` and `verify-project` remain green on `SNPM`

## 2026-03-29 — Shared EOF Normalization Result

Implementation result:
- added a shared editable-body normalization helper in the page-markdown layer
- the helper now ensures managed doc bodies have a canonical final newline when they are:
  - extracted on pull
  - prepared before diff
  - prepared before push
- applied that shared behavior to:
  - approved planning pages
  - managed runbooks
  - managed Access pages
  - managed build records
- kept the approved-target model unchanged
- kept header rewriting unchanged
- left validation-session files and manifest sync untouched

Important behavior choice:
- preserved intentional extra blank lines at EOF
- normalized only the missing-final-newline case
- this matches the product goal of removing false-positive diffs without hiding real content drift

Validation result:
- `npm test` passed with the added regression coverage
- live SNPM-only validation passed:
  - updated `Projects > SNPM > Planning > Roadmap`
  - immediate `page-diff` on `Planning > Roadmap` returned `No body changes.`
  - updated `Projects > SNPM > Runbooks > SNPM Operator Validation Runbook`
  - immediate `runbook-diff` on that runbook returned `No body changes.`
  - unsupported root-page probe still failed with the approved-target guard
  - `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN` stayed green
  - `verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN` stayed green

Product conclusion:
- the current supported doc surfaces now have the text-stable round-trip behavior they needed
- the next narrow-band slice should return to migration guidance for recurring legacy patterns rather than widening page reach

## 2026-03-29 — Narrow-Band Release Candidate Readiness

Current branch reality:
- `codex/core-normalization` is the strongest RC base because it already contains the full narrow-band ancestry:
  - bootstrap / `verify-project`
  - planning-page sync
  - managed runbooks
  - managed Access records
  - `doctor`
  - truth-routed `recommend`
  - stdin/stdout core-band ergonomics
  - shared EOF normalization
- `main` should stay unchanged until the RC is accepted

Chosen RC support boundary:
- in RC support:
  - `create-project`
  - `verify-project`
  - planning-page sync
  - managed runbooks
  - managed Access records
  - `doctor`
  - intent-driven `recommend`
  - stdin/stdout core-band ergonomics
  - EOF-stable pull / diff / push behavior
- present on the branch but outside RC support:
  - build records
  - validation sessions
  - manifest-backed sync
  - paused `validation-bundle`

Why this is the right RC line:
- it is the clearest statement of why SNPM is better than a generic Notion connector:
  - approved-surface mutation only
  - project-token-safe paths
  - deterministic routing before mutation
  - no temp-file choreography on the core band
  - text-stable round-trips on supported doc surfaces
- it avoids waiting on broader workflow work or paused UI automation before shipping a credible candidate

Chosen RC validation contract:
- repo-level:
  - `npm test`
  - `node src/cli.mjs help`
- live SNPM-only:
  - `verify-project --name "SNPM" --project-token-env SNPM_NOTION_TOKEN`
  - `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN`
  - `recommend` for `planning`, `runbook`, `secret`, and `repo-doc`
  - planning-page live pull / diff / push loop with immediate clean re-diff
  - runbook live pull / diff / push loop with immediate clean re-diff
  - temporary Access fixture domain and record live pull / diff / push loop, followed by cleanup back to empty
  - unsupported root-page probe to confirm the approved-target guard still holds

Chosen publication contract:
- create `codex/rc-0.1.0` from `codex/core-normalization`
- push `codex/rc-0.1.0`
- tag the validated RC commit as `v0.1.0-rc.1`
- update repo docs and live SNPM planning pages so `v0.1.0-rc.1` becomes the active tester contract while the older sprint tags remain historical snapshots

## 2026-03-29 — Narrow-Band Release Candidate Result

Implementation result:
- cut `codex/rc-0.1.0` from `codex/core-normalization`
- aligned repo docs and live SNPM planning pages to one RC story instead of a branch maze
- froze the RC support boundary to:
  - project bootstrap
  - `verify-project`
  - planning-page sync
  - managed runbooks
  - managed Access records
  - `doctor`
  - intent-driven `recommend`
  - stdin/stdout ergonomics
  - EOF-stable managed-doc round-trips
- kept build records, validation sessions, manifest sync, and `validation-bundle` present on the branch but outside RC support

Validation result:
- `npm test` passed with `106` tests
- `node src/cli.mjs help` returned the expected CLI usage output
- live SNPM-only validation passed:
  - `verify-project --name "SNPM" --project-token-env SNPM_NOTION_TOKEN`
  - `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN`
  - `recommend` for `planning`, `runbook`, `secret`, and `repo-doc`
  - planning-page pipe-friendly pull / diff / push loop with immediate clean re-diff
  - runbook pipe-friendly pull / diff / push loop with immediate clean re-diff
  - temporary Access fixture domain and record create / pull / diff / push loop with cleanup back to empty
  - unsupported root-page probe failed cleanly with the approved-target guard

Operational result:
- `Projects > SNPM > Access` returned to empty after the temporary RC fixture cleanup
- the live SNPM planning pages now mark the RC validated and return the next follow-on to migration guidance
- the RC line now has one clear tester contract instead of branch-by-branch release language

## 2026-04-06 — Post-RC Cleanup And Legacy Migration Guidance

Current branch reality at the start of this slice:
- `codex/rc-0.1.0` is clean and validated
- `v0.1.0-rc.1` already exists and points at the same RC commit
- `main` remains unchanged
- the stale RC checklist issue is documentation drift in `plan.md`, not a git-state problem

Why this is the correct next slice:
- the RC already froze the supported narrow band
- the next friction is not missing surface area, it is recurring legacy-state interpretation
- `doctor` already surfaces repeated patterns such as unmanaged runbooks, unmanaged Access pages, optional-surface gaps, and validation-session adoption problems
- those patterns need reusable migration guidance rather than one-off interpretation by each operator or Codex thread

Chosen implementation boundary:
- keep the feature read-only
- extend `doctor` with a dedicated `migrationGuidance` summary layer
- extend `recommend --intent ...` with targeted migration guidance only where the request maps to known runbook or Access legacy patterns
- keep repo-owned intents (`repo-doc`, `generated-output`) free of migration guidance because they already resolve away from Notion

Chosen v1 migration-guidance patterns:
- `unmanaged-runbook`
- `unmanaged-access-domain`
- `unmanaged-secret-record`
- `unmanaged-access-token`
- `unmanaged-build-record`
- `missing-builds-surface`
- `missing-validation-sessions-surface`
- `untitled-validation-session-row`
- `project-token-not-checked`

Chosen support tiers:
- `rc`:
  - runbooks
  - Access domains
  - secret records
  - access tokens
  - project-token scope guidance for the RC-supported surfaces
- `conditional`:
  - build records
  - validation sessions

Important behavior rules:
- keep unsupported structural failures in `issues`, not `migrationGuidance`
- do not copy `issues` or `adoptable` entries verbatim into guidance; summarize them into stable recurring patterns
- keep output ordering stable so the guidance layer is predictable for operators and tests

Validation target:
- SNPM-only live validation should stay clean, which means `migrationGuidance` should be empty on the current `Projects > SNPM` project
- the recurring legacy patterns should be proven mainly through automated tests with fake project state rather than by introducing new live drift just to exercise the feature

## 2026-04-06 — SNPM Notion Doc Audit And SNPM-Only Correction Scope

Live audit summary before the correction pass:
- `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN` is currently clean on `Projects > SNPM`
- `page-pull` plus `page-diff` on `Projects > SNPM > Planning > Roadmap` returns a clean no-diff result, so the current planning child pages remain aligned with the repo's active migration-guidance slice
- the workspace-global bootstrap and token-setup pages remain intentionally narrow and still point to the correct SNPM bootstrap flow, but they do not attempt to mirror the full RC command surface
- the SNPM root, planning index, ops index, validation index, runbooks index, and access index pages still read like generic template or pre-RC summary pages, but those pages are outside the current SNPM-managed planning-page and managed-runbook write surfaces
- `Projects > SNPM > Runbooks > SNPM Operator Validation Legacy Runbook` is inside the current managed runbook surface and contains one stale claim: it still says the immediate re-diff shows trailing-newline-only drift

Chosen correction boundary for this pass:
- keep the work `SNPM`-only and stay inside the existing supported `page-*` and `runbook-*` surfaces
- correct the stale managed runbook statement through the runbook sync flow
- add one short audit-boundary note to `Projects > SNPM > Planning > Decision Log`
- add one low-priority deferred follow-up line to `Projects > SNPM > Planning > Backlog`
- do not patch unsupported root or index pages through ad hoc tooling and do not broaden the product surface in this pass

## 2026-04-06 — Post-RC Cleanup And Legacy Migration Guidance Result

Implementation result:
- corrected the stale RC checklist in `plan.md` while leaving the RC tag and `main` unchanged
- cut `codex/migration-guidance` from `codex/rc-0.1.0`
- added a reusable `migration-guidance` helper module so `doctor` and `recommend` share the same recurring-pattern summaries
- extended `doctor` with a top-level `migrationGuidance` array
- extended `recommend --intent ...` with targeted migration guidance for:
  - unmanaged runbooks
  - unmanaged Access domains
  - unmanaged secret/token records
  - missing Access domains
- kept repo-owned intents free of Notion mutation commands and free of migration guidance
- added `docs/migration-guidance.md`
- updated README, roadmap, and testing docs so the post-RC branch state is explicit

Behavior result:
- `doctor` now summarizes recurring legacy patterns into reusable entries with:
  - `patternId`
  - `surface`
  - `supportTier`
  - `targetPath`
  - `summary`
  - `manualSteps`
  - `nextCommands`
- the v1 `doctor` pattern set is:
  - `unmanaged-runbook`
  - `unmanaged-access-domain`
  - `unmanaged-secret-record`
  - `unmanaged-access-token`
  - `unmanaged-build-record`
  - `missing-builds-surface`
  - `missing-validation-sessions-surface`
  - `untitled-validation-session-row`
  - `project-token-not-checked`
- migration guidance stays read-only and does not change the RC mutation surface
- structural failures still stay in `issues`
- guidance ordering is stable: `rc` first, then `conditional`, then by `targetPath`

SNPM-only live validation result:
- `npm test` passed with `109` tests
- `doctor --project "SNPM" --project-token-env SNPM_NOTION_TOKEN` returned:
  - zero issues
  - zero recommendations
  - zero migration-guidance entries
- `recommend --intent planning` on `SNPM` stayed clean with no migration guidance
- `recommend --intent runbook` on the managed SNPM operator runbook stayed clean with no migration guidance
- `recommend --intent repo-doc` stayed repo-owned with no migration guidance
- `recommend --intent secret --domain "App & Backend" --title "GEMINI_API_KEY"` returned one deliberate `missing-access-domain` migration pattern, which is the expected create-domain-first case on the currently empty SNPM Access surface
- `verify-project --name "SNPM" --project-token-env SNPM_NOTION_TOKEN` remained green

Live planning-page result:
- the SNPM planning pages were updated first to frame migration guidance as the active milestone
- after validation they were updated again to mark the slice shipped and set the next follow-on back to workflow bundles, contingent on real usefulness of the guidance layer

Product conclusion:
- this keeps SNPM on the narrow-band path
- the product now explains recurring legacy states explicitly instead of relying on maintainer interpretation of raw `doctor` output
- the next question is no longer "what new surface should be added"
- the next question is whether this guidance layer is sufficient, or whether the next phase should add workflow-bundle shortcuts on top of the stabilized core band

## 2026-04-06 — Branch Consolidation Around `main`

Current branch inventory before cleanup:
- local and remote both currently carry 10 branches:
  - `main`
  - `codex/core-ergonomics`
  - `codex/core-normalization`
  - `codex/development`
  - `codex/doctor`
  - `codex/migration-guidance`
  - `codex/notion-doc-audit`
  - `codex/rc-0.1.0`
  - `codex/truth-routing`
  - `codex/validation-bundle`

Branch ancestry facts:
- `codex/migration-guidance` at `4d2056e` is the current active tip
- `main` at `6d3471a` is 12 commits behind `codex/migration-guidance` and 0 commits ahead
- 8 branches are strict ancestors of `codex/migration-guidance`:
  - `main`
  - `codex/core-ergonomics`
  - `codex/core-normalization`
  - `codex/development`
  - `codex/doctor`
  - `codex/notion-doc-audit`
  - `codex/rc-0.1.0`
  - `codex/truth-routing`
- `codex/validation-bundle` is the only true side branch:
  - `codex/migration-guidance` has 7 commits not in `codex/validation-bundle`
  - `codex/validation-bundle` has 2 commits not in `codex/migration-guidance`
  - unique commits:
    - `55763e0` `Add Chromium validation bundle automation`
    - `73f2780` `Fix validation-bundle auth session flow`

Remote and release facts:
- `origin` still has all 10 branches before cleanup
- there are no open pull requests depending on any current branch name
- release tags remain the durable history anchors:
  - `sprint-1-foundation`
  - `sprint-2-planning-sync`
  - `sprint-3-validation-sessions`
  - `v0.1.0-rc.1`
- because `v0.1.0-rc.1` points at `2ec9402`, `codex/rc-0.1.0` becomes redundant once `main` is promoted

Chosen cleanup result:
- promote `main` to the current active narrow-band baseline by fast-forwarding it to `codex/migration-guidance`
- keep `codex/migration-guidance` as the active follow-on development line
- keep `codex/validation-bundle` as paused experimental work
- delete the 7 redundant strict-ancestor feature branches locally and on `origin`

Chosen local cleanup handling:
- discard the stray local worktree edits in `plan.md` and `research.md` before branch surgery
- do not preserve those local changes in a stash or side branch because the chosen action is explicit discard

## 2026-04-06 — Branch Consolidation Result

Implementation result:
- discarded the stray local `plan.md` and `research.md` worktree edits before branch surgery
- recorded the branch-consolidation decision on `codex/migration-guidance`
- fast-forwarded `main` from `6d3471a` to `462a850`
- pushed the promoted `main`
- deleted these redundant strict-ancestor branches locally and on `origin`:
  - `codex/core-ergonomics`
  - `codex/core-normalization`
  - `codex/development`
  - `codex/doctor`
  - `codex/notion-doc-audit`
  - `codex/rc-0.1.0`
  - `codex/truth-routing`
- preserved:
  - `main`
  - `codex/migration-guidance`
  - `codex/validation-bundle`

Final git state:
- local branches:
  - `main`
  - `codex/migration-guidance`
  - `codex/validation-bundle`
- remote branches:
  - `origin/main`
  - `origin/codex/migration-guidance`
  - `origin/codex/validation-bundle`
- `main` and `codex/migration-guidance` both point to `462a850`
- `codex/validation-bundle` still points to `73f2780`
- tags preserved:
  - `sprint-1-foundation`
  - `sprint-2-planning-sync`
  - `sprint-3-validation-sessions`
  - `v0.1.0-rc.1`

Operational conclusion:
- the repo is no longer carrying a branch maze for linear ancestor history
- `main` is now the active narrow-band baseline
- `codex/migration-guidance` remains available as the active follow-on line
- `codex/validation-bundle` remains isolated as paused experimental work
