# SNPM

SNPM is the canonical home for Infrastructure HQ Notion automation.

SNPM has two important layers right now:
- current shipped behavior: a conservative bootstrap and verification tool for Infrastructure HQ project pages
- chosen next-phase direction: an internal, opinionated workflow operator for real project work inside Infrastructure HQ

GitHub remote:
- `https://github.com/DrW00kie1/SNPM`
- current active testing contract: `v0.1.0-rc.1`

This repo owns:
- project bootstrap automation for `Templates > Project Templates`
- Infrastructure HQ workspace config
- workspace-operating docs for Notion
- legacy migration material from `C:\\tall-man-training`

## Current Status

Narrow-band release candidate line:
- branch: `codex/rc-0.1.0`
- tag: `v0.1.0-rc.1`
- `main` stays unchanged until the RC is accepted

Supported RC surface:
- `create-project`
- `verify-project`
- `page pull`, `page diff`, and `page push` for the four approved planning pages
- `runbook create`, `runbook adopt`, `runbook pull`, `runbook diff`, and `runbook push`
- `access-domain`, `secret-record`, and `access-token` create / adopt / pull / diff / push
- `doctor`
- `recommend --intent ...`
- stdin/stdout core-band ergonomics with `--output -` and `--file -`
- EOF-stable pull / diff / push behavior on supported managed doc surfaces

Present on this branch but outside RC support:
- build records
- validation sessions
- manifest-backed validation-session sync
- the paused `validation-bundle` Chromium UI lane

Why this RC exists:
- approved-surface mutation only
- project-token-safe paths
- deterministic routing before mutation
- no temp-file requirement on the core band
- text-stable round-trips on supported doc surfaces

Publication boundary:
- `v0.1.0-rc.1` is the active tester contract
- `sprint-1-foundation`, `sprint-2-planning-sync`, and `sprint-3-validation-sessions` remain historical snapshots
- the RC line replaces the older branch-by-branch tester story with one supported candidate line

Current project-token-safe sync and mutation rules:
- approved targets only: `Planning > Roadmap`, `Planning > Current Cycle`, `Planning > Backlog`, and `Planning > Decision Log`
- body-only ownership: SNPM preserves the standard page header above the divider and syncs only the body below it
- project token preferred when provided, with workspace-token fallback
- the RC-supported product line is:
  - `create-project` / `verify-project`
  - planning-page sync
  - managed runbooks
  - managed Access records
  - `doctor`
  - intent-driven `recommend`
- present but outside RC support:
  - build records
  - validation sessions
  - manifest-backed validation-session sync
  - the paused `validation-bundle` browser lane
- `runbook adopt` exists because real projects already contain headerless runbooks that need to be standardized safely
- `validation-sessions init` creates or standardizes the optional database-backed validation surface under `Ops > Validation`
- `validation-sessions verify` is the narrow success signal for that managed surface when `verify-project` would also include unrelated project drift
- validation-session files use YAML front matter for row properties plus a checkbox-first managed markdown body below the divider
- validation-session bodies are standardized as `Session Summary`, `Checklist`, `Findings`, and `Follow-Up`
- the canonical triage subset inside that body is `Callouts`, `Toggle blocks`, and `To-do blocks`
- buttons, database templates, mentions, and row properties remain richer UI-layer helpers rather than canonical synced body structure
- `validation-sessions verify --bundle` remains the supported API-visible validation-session bundle check
- `codex/validation-bundle` is preserved as paused experimental work, not the active near-term publication target
- manifest-backed sync is intentionally limited to existing managed validation-session rows listed in `snpm.sync.json`
- `sync` does not implicitly initialize the surface, create rows, or adopt unmanaged rows
- `doctor` is read-only and summarizes managed surfaces, truth boundaries, hard issues, adoptable content, and next-step commands without mutating Notion
- `recommend --intent ...` is read-only and returns one deterministic approved-home answer plus the exact next SNPM command shape when the update belongs in Notion

Chosen truth boundary:
- Notion-primary: planning pages, runbooks, canonical Access records, and live operator inventory
- repo-primary: code-coupled docs, generated artifacts, machine-owned outputs, and any content where the repo is the clearer long-term source of truth
- hybrid only when justified: validation-session artifacts and similar cases where repo sync adds real value without duplicating the whole workflow

## Commands

Create a new project subtree:

```bash
npm run create-project -- --name "Project Name"
```

Verify a created project subtree:

```bash
npm run verify-project -- --name "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

Read the current project-owned surface state and next-step recommendations:

```bash
npm run doctor -- --project "Project Name"
npm run doctor -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run recommend -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

Get a deterministic routing answer before you edit:

```bash
npm run recommend -- --project "Project Name" --intent planning --page "Roadmap" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run recommend -- --project "Project Name" --intent runbook --title "Release Smoke Test" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run recommend -- --project "Project Name" --intent secret --domain "App & Backend" --title "GEMINI_API_KEY" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run recommend -- --project "Project Name" --intent repo-doc --repo-path "docs/operator-roadmap.md"
```

Pull the editable body for an approved planning page:

```bash
npm run page-pull -- --project "Project Name" --page "Planning > Roadmap" --output roadmap.md
```

Pipe-friendly planning-page loop with no temp file:

```bash
npm run page-pull -- --project "Project Name" --page "Planning > Roadmap" --output - \
  | npm run page-push -- --project "Project Name" --page "Planning > Roadmap" --file -
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

Supported RC Access workflow examples:

Create or adopt a project-scoped Access domain:

```bash
npm run access-domain-create -- --project "Project Name" --title "App & Backend" --file access-domain.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run access-domain-create -- --project "Project Name" --title "App & Backend" --file access-domain.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run access-domain-adopt -- --project "Project Name" --title "Legacy Access Domain" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run access-domain-adopt -- --project "Project Name" --title "Legacy Access Domain" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

Create or sync a project-scoped secret or token record under an Access domain:

```bash
npm run secret-record-create -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run secret-record-pull -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --output secret-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run secret-record-diff -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run secret-record-push -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply

npm run access-token-create -- --project "Project Name" --domain "App & Backend" --title "Project Token" --file access-token.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run access-token-pull -- --project "Project Name" --domain "App & Backend" --title "Project Token" --output access-token.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run access-token-diff -- --project "Project Name" --domain "App & Backend" --title "Project Token" --file access-token.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run access-token-push -- --project "Project Name" --domain "App & Backend" --title "Project Token" --file access-token.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

Pipe-friendly Access update with no temp file:

```bash
npm run secret-record-pull -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --output - --project-token-env PROJECT_NAME_NOTION_TOKEN \
  | npm run secret-record-push -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file - --project-token-env PROJECT_NAME_NOTION_TOKEN
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

Pipe-friendly runbook update with no temp file:

```bash
npm run runbook-pull -- --project "Project Name" --title "Release Smoke Test" --output - --project-token-env PROJECT_NAME_NOTION_TOKEN \
  | npm run runbook-push -- --project "Project Name" --title "Release Smoke Test" --file - --project-token-env PROJECT_NAME_NOTION_TOKEN
```

Create or sync a managed build record:

```text
The remaining command families below are present on this branch, but they are not part of the `v0.1.0-rc.1` support contract.
```

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
npm run validation-sessions-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --bundle
```

Development-branch validation-session UI automation examples:

```text
These commands are committed on `codex/validation-bundle`, but that branch is currently paused experimental work and not the active near-term publication target.
```

```bash
npm run validation-bundle-login
npm run validation-bundle-preview -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-bundle-apply -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-bundle-apply -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run validation-bundle-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
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
For the primary core band, `--output -` streams the pulled body to stdout and `--file -` reads markdown from stdin. When you use `--output -`, SNPM writes structured success metadata to stderr so shell pipelines stay clean.
The same guidance applies to managed runbook, build-record, and validation-session files after `runbook-pull`, `build-record-pull`, or `validation-session-pull`.
For checkbox-first validation sessions, checked task-list items are the passed-state record. Leave blocked or failed items unchecked and record the reason in `Findings`.
For triage-first validation sessions, use one `<callout>` per finding, optional `<details>` blocks for deeper evidence, and to-do items for `Follow-Up`.
For repo-backed validation-session artifacts, `sync-pull --apply` is the normalization step when `sync-check` reports only stored-shape drift such as end-of-file handling on `<empty-block/>`.
For existing projects, use `validation-sessions-verify` as the clean success signal for the managed validation surface; `verify-project` remains broader and may still report unrelated historical drift elsewhere in the project subtree.
For validation-session workflow hardening, `validation-sessions-verify --bundle` remains the API-visible check.
`validation-bundle-*` remains paused experimental branch work rather than part of the active core product line.
Rows created from the `Validation Session` template inherit the managed contract immediately, with the canonical placeholder `... > <Session Title>` until the first SNPM pull/push normalizes the exact row path.

Defaults:
- workspace token: `NOTION_TOKEN`, falling back to `INFRASTRUCTURE_HQ_NOTION_TOKEN`
- workspace config: `config/workspaces/infrastructure-hq.json`

## Next Phase

The immediate next phase after RC is migration guidance for recurring legacy patterns surfaced by `doctor`.

The broader direction stays the same:
- keep the narrow band as the supported day-to-day product line
- add migration guidance before adding new major surfaces
- build workflow bundles only after the core band remains stable under real use
- keep browser automation paused experimental work unless the narrow band proves it is worth resuming

The supporting detail lives in [operator roadmap](./docs/operator-roadmap.md).

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
- check out the active RC tag: `v0.1.0-rc.1`
- run `npm test`
- use GitHub issues to report bugs or testing findings

Trusted live testers should focus on the RC-supported core band: `verify-project`, `doctor`, `recommend --intent ...`, planning-page sync, managed runbooks, and managed Access records. Trusted live mutation on the RC line is limited to explicit narrow-band validation such as `page-push --apply`, `runbook-* --apply`, or Access `* --apply` against SNPM-owned fixtures when the report says exactly what was touched.
Build records, validation sessions, manifest sync, and `validation-bundle` are still present on the branch but are not part of the active RC support contract.

## Docs

- [operator roadmap](./docs/operator-roadmap.md)
- [GitHub testing loop](./docs/github-testing-loop.md)
- [fresh project usage](./docs/fresh-project-usage.md)
- [workspace overview](./docs/workspace-overview.md)
- [project bootstrap](./docs/project-bootstrap.md)
- [project token setup](./docs/project-token-setup.md)
- [workspace config ownership](./docs/workspace-config.md)
- [project access workflows](./docs/project-access.md)
- [validation sessions](./docs/validation-sessions.md)
- [validation-session UI bundle](./docs/validation-session-ui-bundle.md)
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
