# Manifest And Validation-Session Sync

SNPM has two manifest sync contracts:
- manifest v2 is a mixed-surface drift detector, local-file pull lane, and guarded existing-target push lane with sidecar metadata, targeted entry selection, review artifacts, apply mutation limits, opt-in post-push sidecar refresh, and structured recovery diagnostics
- manifest v1 is the existing validation-session artifact sync lane with pull and push

Use v2 when the goal is to compare a repo bundle against approved Notion surfaces, refresh local files before planning edits, guarded-push existing approved targets, review selected entries, or opt into sidecar refresh during applied push. Use v1 only when a repo-backed validation-session artifact needs the specialized validation-session pull/push lane.

## Manifest V2 Mixed-Surface Sync

Manifest v2 lets a consumer repo describe a deterministic documentation bundle without raw Notion page ids. In this sprint, v2 supports `sync check`, local-file `sync pull`, guarded `sync push` for existing approved targets, targeted selectors, push review artifacts, apply mutation limits, opt-in sidecar refresh for applied push, and structured recovery diagnostics. V2 push is preview by default; default whole-manifest preview remains unchanged. `sync push --apply` requires sidecar metadata produced by v2 pull and allows at most one changed entry unless `--max-mutations` is raised or set to `all`. A default applied push still leaves sidecars stale unless `--refresh-sidecars` is explicitly included.

Supported v2 entry kinds:
- `planning-page`
- `project-doc`
- `template-doc`
- `workspace-doc`
- `runbook`
- `validation-session`

Example:

```json
{
  "version": 2,
  "workspace": "infrastructure-hq",
  "project": "Project Name",
  "entries": [
    {
      "kind": "planning-page",
      "pagePath": "Planning > Roadmap",
      "file": "notion/planning/roadmap.md"
    },
    {
      "kind": "project-doc",
      "docPath": "Root > Overview",
      "file": "notion/docs/overview.md"
    },
    {
      "kind": "template-doc",
      "docPath": "Templates > Project Templates > Onboarding Notes",
      "file": "notion/templates/onboarding-notes.md"
    },
    {
      "kind": "workspace-doc",
      "docPath": "Runbooks > Notion Workspace Workflow",
      "file": "notion/workspace/notion-workflow.md"
    },
    {
      "kind": "runbook",
      "title": "Release Smoke Test",
      "file": "notion/runbooks/release-smoke-test.md"
    },
    {
      "kind": "validation-session",
      "title": "iPhone TestFlight 0.5.1 (2) - Sean - 2026-03-28",
      "file": "ops/validation-sessions/iphone-testflight-0.5.1-2-sean-2026-03-28.md"
    }
  ]
}
```

Manifest v2 rules:
- `version` must be `2`
- `workspace` must name a configured SNPM workspace
- `project` must be the Notion project name under `Projects`
- `entries` must be a non-empty array
- every entry must include a relative `file`
- `planning-page` entries require `pagePath`
- `project-doc`, `template-doc`, and `workspace-doc` entries require `docPath`
- `runbook` and `validation-session` entries require `title`
- raw page ids, absolute file paths, path escapes, and glob patterns are not allowed
- duplicate file targets and duplicate `kind + target` entries are hard failures

Check the v2 bundle without mutating Notion or local files:

```powershell
npm run sync-check -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run sync-check -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --entry "runbook:Release Smoke Test"
```

`sync check` reads each selected local file, resolves the matching approved Notion target, compares the bodies using the target surface's managed markdown rules, and reports per-entry status. Without selectors, it checks the whole manifest. Missing local files, missing Notion targets, unsupported targets, and content drift make the check fail without creating or modifying anything.

Pull the v2 bundle into local files:

```powershell
npm run sync-pull -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run sync-pull -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run sync-pull -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --apply --entries-file C:\path\to\selected-entries.json
```

`sync pull` resolves each selected approved Notion target and previews local file refreshes by default. Without selectors, it previews the whole manifest. With `--apply`, it writes the selected markdown files and adjacent `<file>.snpm-meta.json` sidecars. This is a local-file operation only: it does not mutate Notion and does not append local mutation journal entries.

`--entries-file` must be JSON: either an array of `kind:target` strings, an array of `{ "kind": "...", "target": "..." }` objects, or an object with an `entries` or `selectors` array.

Preview or guarded-apply a v2 push into Notion:

```powershell
npm run sync-push -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run sync-push -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --entry "planning-page:Planning > Roadmap" --review-output C:\path\to\review
npm run sync-push -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run sync-push -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --apply --entries-file C:\path\to\selected-entries.json --max-mutations 3 --refresh-sidecars
```

`sync push` reads the selected local markdown files and previews the Notion updates by default. Without selectors, the preview covers the whole manifest. Add `--review-output <dir>` to write review artifacts for the previewed entries. With `--apply`, it requires the adjacent `<file>.snpm-meta.json` sidecar from v2 `sync pull` and refuses to write if the Notion target no longer matches the recorded editing base.

Default `sync push --apply` allows at most one changed entry. Raise the gate with `--max-mutations <n>` or use `--max-mutations all` only after reviewing the selected preview. This safety gate is not generic transaction semantics; it is a bounded mutation limit for guarded existing-target pushes.

A default successful `sync push --apply` makes affected sidecars stale because they describe the pre-push base revision. The next safe command is `sync pull --apply`, which refreshes both the local markdown files and sidecars before the next edit cycle. To refresh sidecar metadata to the post-push base during the applied push, opt in with `sync push --apply --refresh-sidecars`. If the apply uses `--entry` or `--entries-file`, sidecar refresh is limited to selected entries that were successfully applied.

Manifest v2 recovery diagnostics are structured output/review metadata. Diagnostics use stable codes, severity, entry and target context, a safe next command, and a recovery action. They are designed to make review artifacts and result JSON self-contained for operator recovery; they do not retry, roll back, auto-merge, check semantic consistency, create transaction semantics, or turn selected guarded push into generic batch apply.

V2 guarded push is not generalized Notion mutation. Out-of-scope behavior:
- create/adopt
- Access/build-record entries
- rollback
- auto-merge
- automatic retries
- arbitrary CRUD
- semantic consistency checks
- generic transaction semantics
- generic batch apply

Use the owning command family when that narrower surface is the right workflow:
- `page-*` for planning pages
- `doc-*` for managed docs
- `runbook-*` for runbooks
- `validation-session-*` for validation-session rows

## Manifest V1 Validation-Session Artifact Sync

Manifest v1 remains the narrow repo-side sync workflow for validation-session artifacts.

This slice is intentionally limited to:
- repo-local files declared in `snpm.sync.json`
- `kind: "validation-session"` entries only
- existing SNPM-managed rows under `Projects > <Project> > Ops > Validation > Validation Sessions`

It does not initialize the surface, create missing rows, or adopt unmanaged rows implicitly.

### V1 Manifest

Place `snpm.sync.json` at the consumer repo root.

Example:

```json
{
  "version": 1,
  "workspace": "infrastructure-hq",
  "project": "Tall Man Training",
  "entries": [
    {
      "kind": "validation-session",
      "title": "iPhone TestFlight 0.5.1 (2) - Sean - 2026-03-28",
      "file": "ops/validation-sessions/iphone-testflight-0.5.1-2-sean-2026-03-28.md"
    }
  ]
}
```

V1 manifest rules:
- `version` must be `1`
- `workspace` must name a configured SNPM workspace
- `project` must be the Notion project name under `Projects`
- `entries` must be a non-empty array
- `file` must be relative to the manifest directory
- raw page ids and glob patterns are not allowed
- duplicate titles and duplicate file targets are hard failures

### V1 Commands

Check repo artifacts against Notion:

```powershell
npm run sync-check -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN
```

Preview or apply a pull from Notion into the repo:

```powershell
npm run sync-pull -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run sync-pull -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

Preview or apply a push from the repo into Notion:

```powershell
npm run sync-push -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run sync-push -- --manifest C:\path\to\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

Project token is the documented normal path. Workspace-token fallback still exists, but v1 sync stays constrained to the same project-owned validation-session surface.

## Checkbox-First Artifact Model

Validation-session sync artifacts keep the same checkbox-first body used in Notion:
- `Session Summary`
- `Checklist`
- `Findings`
- `Follow-Up`

Use real markdown task-list items in `Checklist`:
- checked to-do = passed
- unchecked to-do = not yet run, failed, or blocked

Use the triage-first canonical subset for post-checklist work:
- `Findings` uses one `<callout>` per blocker, issue, or note
- optional deeper evidence lives inside `<details>` / `<summary>` blocks
- `Follow-Up` uses to-do items instead of plain bullet lists

When a tester works live in Notion, v1 `sync-pull --apply` is the safe way to refresh the repo copy so the local file reflects Notion's stored checkbox state and normalized markdown shape.

## V1 Behavior

`sync check`
- compares each listed local file to the matching managed Notion row
- exits non-zero on drift or any entry failure
- reports missing local files as drift, not as implicit create behavior

`sync pull`
- reads the matching managed Notion rows
- previews local file overwrites by default
- writes local files only with `--apply`

`sync push`
- reads the listed local files and compares them to the matching managed Notion rows
- previews Notion mutations by default
- writes to Notion only with `--apply`

## What Sync Does Not Do

If the validation surface is missing:
- run `validation-sessions init`

If a row is missing:
- run `validation-session create`

If a row exists but is unmanaged:
- run `validation-session adopt`

The manifest sync layer will fail with explicit guidance in those cases instead of trying to fix them implicitly.

## Editing Model

Use the latest pulled file as the editing base.

Important normalization note:
- Notion may preserve a trailing `<empty-block/>` without a final newline
- repo-side v1 `sync-check` can therefore report end-of-file drift until you run `sync-pull --apply`
- use the pulled file as the editing base for callout, toggle, and follow-up to-do content too

That normalization is expected and should be treated as the stored Notion shape for the repo artifact copy.
