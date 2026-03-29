# SNPM

SNPM is the canonical home for Infrastructure HQ Notion automation.

SNPM has two important layers right now:
- current shipped behavior: a conservative bootstrap and verification tool for Infrastructure HQ project pages
- chosen next-phase direction: an internal, opinionated Notion workspace operator with broader page-sync, scaffold, and verification capabilities

GitHub remote:
- `https://github.com/DrW00kie1/SNPM`
- current published testing snapshot: `sprint-3-validation-sessions`

This repo owns:
- project bootstrap automation for `Templates > Project Templates`
- Infrastructure HQ workspace config
- workspace-operating docs for Notion
- legacy migration material from `C:\\tall-man-training`

## Current Status

Today SNPM ships and validates:
- `create-project`
- `verify-project`
- `page pull` for approved planning pages
- `page diff` for approved planning pages
- `page push` for approved planning pages, with preview-only behavior until `--apply` is present
- `runbook create`, `runbook adopt`, `runbook pull`, `runbook diff`, and `runbook push` for project-owned runbooks
- `build-record create`, `build-record pull`, `build-record diff`, and `build-record push` for project-owned build records under `Ops > Builds`
- `validation-sessions init`, `validation-session create`, `validation-session adopt`, `validation-session pull`, `validation-session diff`, and `validation-session push` for human validation-session records under `Ops > Validation > Validation Sessions`
- `validation-sessions verify` for narrow read-only verification of the managed validation-session surface on an existing project
- `sync check`, `sync pull`, and `sync push` for repo-backed validation-session artifacts declared in `snpm.sync.json`
- project-token scope verification when a project token is provided
- cross-repo use through the shared `C:\\SNPM` control checkout

Current project-token-safe sync is intentionally narrow:
- approved targets only: `Planning > Roadmap`, `Planning > Current Cycle`, `Planning > Backlog`, and `Planning > Decision Log`
- body-only ownership: SNPM preserves the standard page header above the divider and syncs only the body below it
- project token preferred when provided, with workspace-token fallback
- day-to-day project operations are limited to `Runbooks`, `Ops > Builds`, and `Ops > Validation > Validation Sessions`
- `runbook adopt` exists because real projects already contain headerless runbooks that need to be standardized safely
- `validation-sessions init` creates or standardizes the optional database-backed validation surface under `Ops > Validation`
- `validation-sessions verify` is the narrow success signal for that managed surface when `verify-project` would also include unrelated project drift
- validation-session files use YAML front matter for row properties plus a checkbox-first managed markdown body below the divider
- validation-session bodies are standardized as `Session Summary`, `Checklist`, `Findings`, and `Follow-Up`
- manifest-backed sync is intentionally limited to existing managed validation-session rows listed in `snpm.sync.json`
- `sync` does not implicitly initialize the surface, create rows, or adopt unmanaged rows

## Commands

Create a new project subtree:

```bash
npm run create-project -- --name "Project Name"
```

Verify a created project subtree:

```bash
npm run verify-project -- --name "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

Pull the editable body for an approved planning page:

```bash
npm run page-pull -- --project "Project Name" --page "Planning > Roadmap" --output roadmap.md
```

Diff an approved planning page body against a local file:

```bash
npm run page-diff -- --project "Project Name" --page "Planning > Roadmap" --file roadmap.md
```

Preview or apply a push back to an approved planning page:

```bash
npm run page-push -- --project "Project Name" --page "Planning > Roadmap" --file roadmap.md
npm run page-push -- --project "Project Name" --page "Planning > Roadmap" --file roadmap.md --apply
```

Create or adopt a project-scoped runbook:

```bash
npm run runbook-create -- --project "Project Name" --title "Release Smoke Test" --file runbook.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run runbook-create -- --project "Project Name" --title "Release Smoke Test" --file runbook.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run runbook-adopt -- --project "Project Name" --title "Legacy Runbook" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run runbook-adopt -- --project "Project Name" --title "Legacy Runbook" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

Pull, diff, or push a managed runbook body:

```bash
npm run runbook-pull -- --project "Project Name" --title "Release Smoke Test" --output runbook.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run runbook-diff -- --project "Project Name" --title "Release Smoke Test" --file runbook.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run runbook-push -- --project "Project Name" --title "Release Smoke Test" --file runbook.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run runbook-push -- --project "Project Name" --title "Release Smoke Test" --file runbook.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

Create or sync a managed build record:

```bash
npm run build-record-create -- --project "Project Name" --title "Build 2026-03-28" --file build-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run build-record-create -- --project "Project Name" --title "Build 2026-03-28" --file build-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run build-record-pull -- --project "Project Name" --title "Build 2026-03-28" --output build-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run build-record-diff -- --project "Project Name" --title "Build 2026-03-28" --file build-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run build-record-push -- --project "Project Name" --title "Build 2026-03-28" --file build-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run build-record-push -- --project "Project Name" --title "Build 2026-03-28" --file build-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

Initialize or standardize the validation-session surface:

```bash
npm run validation-sessions-init -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-sessions-init -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run validation-sessions-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

Create, adopt, or sync a managed validation-session record:

```bash
npm run validation-session-create -- --project "Project Name" --title "Session 2026-03-28" --file validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-session-create -- --project "Project Name" --title "Session 2026-03-28" --file validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run validation-session-adopt -- --project "Project Name" --title "Legacy Session" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-session-adopt -- --project "Project Name" --title "Legacy Session" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run validation-session-pull -- --project "Project Name" --title "Session 2026-03-28" --output validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-session-diff -- --project "Project Name" --title "Session 2026-03-28" --file validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-session-push -- --project "Project Name" --title "Session 2026-03-28" --file validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-session-push -- --project "Project Name" --title "Session 2026-03-28" --file validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

Check or batch-sync repo-backed validation-session artifacts through a manifest:

```bash
npm run sync-check -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run sync-pull -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run sync-pull -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run sync-push -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run sync-push -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

Use the file produced by `page-pull` as your editing base. Notion can normalize markdown-sensitive characters such as `>` on read-back, so the pulled file format is the safest source for follow-on edits.
The same guidance applies to managed runbook, build-record, and validation-session files after `runbook-pull`, `build-record-pull`, or `validation-session-pull`.
For checkbox-first validation sessions, checked task-list items are the passed-state record. Leave blocked or failed items unchecked and record the reason in `Findings`.
For repo-backed validation-session artifacts, `sync-pull --apply` is the normalization step when `sync-check` reports only stored-shape drift such as end-of-file handling on `<empty-block/>`.
For existing projects, use `validation-sessions-verify` as the clean success signal for the managed validation surface; `verify-project` remains broader and may still report unrelated historical drift elsewhere in the project subtree.

Defaults:
- workspace token: `NOTION_TOKEN`, falling back to `INFRASTRUCTURE_HQ_NOTION_TOKEN`
- workspace config: `config/workspaces/infrastructure-hq.json`

## Next Phase

The chosen next phase is to evolve SNPM into an internal, high-guardrail Notion workspace operator.

That broader operator model is underway, but it is **not complete yet**. The roadmap, tradeoffs, and remaining planned command families live in [operator roadmap](./docs/operator-roadmap.md). The next unshipped areas now sit beyond planning sync and the current project-token-safe runbook, build-record, and validation-session surfaces.

## Use From Another Repo Or Codex Thread

If your active Codex thread is attached to a different repo, use SNPM as the local control repo from `C:\\SNPM`:

```powershell
Set-Location C:\SNPM
npm run create-project -- --name "Project Name"
```

Bootstrap is the day-zero requirement. Project-token setup stays deferred until the new repo actually needs repo-local Notion automation.

Do not copy SNPM scripts, workspace ids, or starter-tree config into the new repo.

## GitHub Testing

SNPM now uses its private GitHub repo as the tester feedback loop.

Default tester flow:
- clone or open the repo directly
- check out the current published testing snapshot tag: `sprint-3-validation-sessions`
- run `npm test`
- use GitHub issues to report bugs or testing findings

Trusted live testers may also run `verify-project`, `page-pull`, `page-diff`, preview-only `page-push`, and the project-token-safe `runbook` / `build-record` commands against the real Notion workspace when they already have the right token setup. Live mutation commands such as `create-project`, `page-push --apply`, `runbook-create --apply`, `runbook-adopt --apply`, or `build-record-create --apply` are not the default testing path.
Trusted live testers may also use `validation-sessions-verify` and the validation-session commands against project-owned `Ops > Validation > Validation Sessions` surfaces when they already have the right token setup. `validation-sessions-init --apply`, `validation-session-create --apply`, `validation-session-adopt --apply`, and `validation-session-push --apply` remain trusted live-mutation paths rather than default testing steps.
Manifest-backed validation-session sync and the checkbox-first validation-session workflow are newer than the latest published testing tag. If you test `sync-check`, `sync-pull`, `sync-push`, or the checkbox-first validation-session body contract, report that you tested an unpublished local checkout unless a newer tag exists.

## Docs

- [operator roadmap](./docs/operator-roadmap.md)
- [GitHub testing loop](./docs/github-testing-loop.md)
- [fresh project usage](./docs/fresh-project-usage.md)
- [workspace overview](./docs/workspace-overview.md)
- [project bootstrap](./docs/project-bootstrap.md)
- [project token setup](./docs/project-token-setup.md)
- [workspace config ownership](./docs/workspace-config.md)
- [validation sessions](./docs/validation-sessions.md)
- [validation-session sync](./docs/validation-session-sync.md)
- [live Notion doc update guidance](./docs/live-notion-docs.md)
- [new thread handoff](./docs/new-thread-handoff.md)

## Migration

Milestone 1 is intentionally conservative:
- preserve the validated `create` / `verify` behavior from `tall-man-training`
- move ownership into this repo
- update live Notion docs to reference SNPM
- leave cleanup/removal in `tall-man-training` for a later pass after parity is proven

The roadmap beyond milestone 1 should not be confused with the currently shipped command surface.
