# Validation-Session Artifact Sync

SNPM ships a narrow manifest-backed sync workflow for repo-side validation-session artifacts.

This slice is intentionally limited to:
- repo-local files declared in `snpm.sync.json`
- `kind: "validation-session"` entries only
- existing SNPM-managed rows under `Projects > <Project> > Ops > Validation > Validation Sessions`

It does not initialize the surface, create missing rows, or adopt unmanaged rows implicitly.

## Manifest

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

Manifest rules:
- `version` must be `1`
- `workspace` must name a configured SNPM workspace
- `project` must be the Notion project name under `Projects`
- `entries` must be a non-empty array
- `file` must be relative to the manifest directory
- raw page ids and glob patterns are not allowed
- duplicate titles and duplicate file targets are hard failures

## Commands

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

Project token is the documented normal path. Workspace-token fallback still exists, but sync stays constrained to the same project-owned validation-session surface.

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

When a tester works live in Notion, `sync-pull --apply` is the safe way to refresh the repo copy so the local file reflects Notion's stored checkbox state and normalized markdown shape.

## Behavior

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
- repo-side `sync-check` can therefore report end-of-file drift until you run `sync-pull --apply`
- use the pulled file as the editing base for callout, toggle, and follow-up to-do content too

That normalization is expected and should be treated as the stored Notion shape for the repo artifact copy.
