# SNPM Operator Roadmap

SNPM currently ships as a conservative Infrastructure HQ Notion bootstrap and verification tool.

The chosen next phase is broader: turn SNPM into an internal, high-guardrail Notion workspace operator that can safely scaffold, verify, and sync selected workspace surfaces without becoming a generic free-form Notion shell.

## Current state

Today SNPM is implemented and validated for:
- project bootstrap from `Templates > Project Templates`
- structural verification of the created project subtree
- markdown-backed `page pull`, `page diff`, and `page push` for approved project planning pages
- optional project-token scope verification
- cross-repo usage through a known local control repo

Today SNPM does **not** yet ship:
- manifest-backed multi-page sync
- broad page pull/push across non-approved targets
- scaffold commands for non-project surfaces
- broad workspace verification beyond the current project bootstrap contract
- package-installable consumption for other repos

## What the Notion API is easy at right now

With a valid token and the right page sharing, the current Notion platform is already good at:
- reading and searching pages and block trees
- creating pages and appending/updating supported block content
- querying structured data sources and databases
- working with comments, file uploads, and webhooks
- converting supported page content to and from Markdown through the newer markdown-oriented APIs

Official references:
- [Capabilities](https://developers.notion.com/reference/capabilities)
- [Working with Markdown content](https://developers.notion.com/guides/data-apis/working-with-markdown-content)
- [Webhooks](https://developers.notion.com/reference/webhooks)
- [Data source API](https://developers.notion.com/reference/data-source)

## What is still challenging or risky

Even with the newer API surface, several things are still operationally tricky:
- permission and sharing boundaries are easy to get wrong and often fail as `object_not_found`
- page content that drifts outside supported markdown/block shapes can round-trip poorly
- recursive block trees require pagination and careful child traversal
- large updates need batching because append/list operations are paginated and limited
- UI-only workflows still exist, especially around integration creation and page sharing
- broad free-form mutation increases the risk of damaging validated workspace structure
- pinned API-version drift can make a legacy client shape increasingly expensive to extend

## Why SNPM should be an opinionated internal operator

Infrastructure HQ is not modeled as a generic Notion sandbox. It already has named surfaces, ownership boundaries, and safety rules around:
- `Projects`
- `Access Index`
- `Runbooks`
- `Vendors`
- `Incidents`

That means the highest-value tool is not a raw Notion client. The highest-value tool is one that:
- understands this workspace model
- protects high-risk pages and boundaries
- makes the safe path the default path
- gives maintainers and Codex threads explicit commands with human-readable verification output

## Chosen product shape

The chosen direction is:
- private Git-installable internal package
- richer CLI as the primary interface
- reusable internal JavaScript core underneath the CLI
- internal-only, highly opinionated workspace policy layer

Recommended architecture:
- Notion adapter layer
- workspace policy and target-resolution layer
- markdown sync engine
- scaffold engine
- verifier layer
- CLI entrypoint

One explicit future platform step should be upgrading off the current pinned Notion API version in [`config/workspaces/infrastructure-hq.json`](../config/workspaces/infrastructure-hq.json) so SNPM can rely on newer markdown and data-source capabilities without deeper legacy lock-in.

## Planning-page sync slice

The first post-bootstrap command family is now implemented as a narrow planning-page sync slice.

Why this came first:
- it fits the current page-tree-heavy workspace model
- it works well for living planning pages with a stable header pattern
- it gives other repos and Codex threads a safe way to inspect and update selected project docs without vendoring workspace logic
- it creates a strong safety boundary by limiting sync to named, approved targets and body-only ownership

Current Sprint 2 command family:
- `snpm page pull`
- `snpm page diff`
- `snpm page push`

Current constraints:
- approved targets only: `Planning > Roadmap`, `Planning > Current Cycle`, `Planning > Backlog`, and `Planning > Decision Log`
- only the body below the standard header divider belongs to the synced file
- project token is preferred when a project-local token exists, otherwise the workspace token is used
- unsupported markdown shapes fail loudly instead of silently flattening content

Still planned after this slice:
- `snpm sync check`
- `snpm sync push`

## Planned command families after that

Second-wave commands should focus on safe scaffolding and verification:
- `snpm workspace verify`
- `snpm scaffold runbook`
- `snpm scaffold vendor`
- `snpm scaffold access-domain`
- `snpm scaffold incident`

These commands are **planned, not implemented yet**.

## How other repos should use SNPM

Chosen model:
- install SNPM from the private Git repo at a pinned tag or commit
- call the SNPM CLI from repo scripts or `npm exec`
- keep only a small repo-local manifest that maps approved local markdown files to approved Notion targets
- do not vendor SNPM workspace ids, starter-tree rules, or policy logic into product repos

In this model:
- the product repo owns code and durable repo docs
- SNPM owns workspace-safe mutation rules and target resolution
- Notion remains the home for current operational state

## How other Codex threads should use SNPM

Chosen model:
- other Codex threads shell out to the SNPM CLI
- repo onboarding or `AGENTS.md` should tell threads to use SNPM instead of writing ad hoc Notion API code
- SNPM should remain the auditable policy layer between a thread and the live workspace

Later, if usage volume justifies it, a thin agent-facing adapter or Codex skill can sit on top of the same CLI/core.

That is a follow-on convenience layer, not the first implementation priority.

## How this experiment will be judged

The broader question is not whether Notion feels elegant. The broader question is whether `Notion + SNPM` reduces document sprawl while staying usable and trustworthy for AI-assisted work.

The living scorecard should stay in `Projects > SNPM > Planning > Roadmap`, with this repo doc acting only as a supporting reference.

Use `Pass`, `Watch`, or `Fail` for these criteria:
- source-of-truth clarity: each document category has one obvious home
- agent usability: Codex threads can find and use the right page without ad hoc exploration
- safe mutation: supported workspace changes happen through SNPM or another explicit guarded workflow
- operational freshness: current state in Notion stays current enough to be useful
- repo / Notion boundary health: durable code truth stays in repo, while current ops and planning stay in Notion
- manual-friction tolerance: required UI-only steps stay occasional and bounded

Failure signals to watch for:
- repeated duplicate docs across repo and Notion
- frequent ad hoc one-off scripts or manual structure fixes
- low trust in page accuracy or page location
- too many critical workflows blocked by Notion UI friction

## Review cadence

Use a layered cadence:
- per-change checks: read-back after live page-body edits and `verify-project` whenever structure might have changed
- weekly review: re-score the broader experiment in `Projects > SNPM > Planning > Roadmap`
- milestone-exit review: decide whether to continue, constrain, or abandon the broader operator direction

The current-cycle proof points should stay in `Projects > SNPM > Planning > Current Cycle`, where the team can judge whether the present milestone is actually succeeding.
