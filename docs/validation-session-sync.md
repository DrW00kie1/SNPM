# Manifest And Validation-Session Sync

SNPM has two manifest sync contracts:
- manifest v2 is a check-only, mixed-surface drift detector
- manifest v1 is the existing validation-session artifact sync lane with pull and push

Use v2 when the goal is to compare a repo bundle against approved Notion surfaces before planning edits. Use v1 only when a repo-backed validation-session artifact needs to pull from or push to its managed Notion row.

## Manifest V2 Check-Only Sync

Manifest v2 lets a consumer repo describe a deterministic documentation bundle without raw Notion page ids. In this sprint, v2 is intentionally limited to `sync check`.

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
```

`sync check` reads each listed local file, resolves the matching approved Notion target, compares the bodies using the target surface's managed markdown rules, and reports per-entry status. Missing local files, missing Notion targets, unsupported targets, and content drift make the check fail without creating or modifying anything.

V2 does not support generalized mutation. `sync pull` and `sync push` reject v2 manifests in this sprint; use the owning command family instead:
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
