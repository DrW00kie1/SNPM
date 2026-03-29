# Validation-Session UI Bundle

SNPM now treats a complete validation-session workflow as four layers:
- managed validation-session surface
- sync-safe canonical body
- supported Notion UI bundle around that body
- narrow verification plus operator guidance

This document defines the first blessed validation-session UI bundle.

## Blessed Bundle

Use one exact v1 bundle:
- primary working view: `Active Sessions`
- backup intake form: `Quick Intake`
- database template: `Validation Session`
- manual button wiring around that template/form flow
- safe extra API-visible property: `Issue URL` as `url`

`validation-sessions verify --bundle` checks only API-visible rules and returns explicit manual checks for the UI-only parts.

## Safe vs Unsafe

Safe inside the canonical synced body:
- headings
- paragraphs
- links
- to-do blocks
- callouts
- `<details>` / `<summary>`

Safe around the synced body in the Notion UI:
- database views
- manual button wiring
- manual form wiring
- page properties
- a `Validation Session` database template that starts from the SNPM-managed body contract

Safe extra API-visible property:
- `Issue URL` as `url`

Unsafe in the canonical synced body:
- button blocks
- form blocks
- table/layout blocks
- unsupported blocks that make markdown retrieval unsafe
- template bodies that drift away from the SNPM-managed body contract

## Manual Setup

The current public API does not manage the whole UI bundle. Set these up in the Notion UI:

1. Create or tune the `Active Sessions` view.
2. Create or tune the `Quick Intake` form.
3. Create or tune the `Validation Session` database template.
4. Add the button wiring that creates a new row through that template/form path.

SNPM does not automate those steps in this slice. It documents them and verifies only the API-visible rules around them.

## Repo-Sync Boundary

The repo-owned boundary stays narrow:
- the managed database, schema, and row pages are SNPM-owned
- the canonical row body is SNPM-owned
- repo sync still applies only when the repo truly owns the validation-session artifact

Recommended live flow:
1. create a session from the button/template path in Notion
2. execute the checklist and triage directly in Notion
3. use `validation-session-pull` or manifest sync only when a repo artifact is needed

## Verification

Use bundle verification when you need the narrow workflow-level check:

```powershell
npm run validation-sessions-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --bundle
```

Bundle verification:
- confirms the managed validation-session surface still exists
- confirms the core schema is still valid
- allows `Issue URL` when it is a `url` property
- confirms managed rows still round-trip through the sync-safe body contract
- fails when unsupported blocks appear inside the synced body
- returns explicit manual checks for the view, form, template, and button wiring
