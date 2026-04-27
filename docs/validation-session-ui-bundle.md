# Validation-Session Manual UI Bundle

SNPM treats a complete validation-session workflow as four layers:
- managed validation-session surface
- sync-safe canonical body
- manual Notion UI bundle around that body
- API-visible verification plus explicit manual checks

This document defines the blessed validation-session UI bundle after retiring the browser automation lane. SNPM does not drive the Notion UI for this bundle. Operators verify API-visible rules with `validation-sessions verify --bundle` and complete the returned manual checks in Notion.

Current product boundary:
- `validation-sessions verify --bundle` remains the supported workflow-level check
- the verifier checks API-visible rules and reports manual checks for UI-only elements
- manual UI setup is required for Notion views, forms, templates, and buttons
- the default operator path is the API-visible workflow plus explicit manual UI confirmation

## Blessed Bundle

Use one exact v1 bundle:
- primary working view: `Active Sessions`
- backup intake form: `Quick Intake`
- database template: `Validation Session`
- validation-page button: `New Validation Session`
- safe extra API-visible property: `Issue URL` as `url`

The button belongs only on:
- `Projects > <Project> > Ops > Validation`

Runbooks stay out of button wiring in v1.

## Command Boundary

API-visible verification stays on the validation-session command family:

```powershell
npm run validation-sessions-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --bundle
```

That command verifies the managed surface and API-visible bundle rules. It returns explicit manual checks for UI-only elements because the public Notion API does not fully manage the surrounding view/form/template/button bundle.

The verifier does not:
- create or edit Notion database views
- create or edit Notion forms
- create or edit Notion database templates
- create or edit Notion buttons
- inspect browser-only UI state
- replace the operator's visual check in Notion

## Manual Setup And Check

Use this sequence when a project needs the full validation-session workflow:

1. Initialize or verify the managed `Validation Sessions` database with `validation-sessions init` and `validation-sessions verify`.
2. Open `Projects > <Project> > Ops > Validation > Validation Sessions` in Notion.
3. Confirm the `Issue URL` property exists as a URL property when the bundle requires it.
4. Confirm the `Active Sessions` working view exists and surfaces active/planned sessions clearly.
5. Confirm the `Quick Intake` form creates rows in `Validation Sessions`.
6. Confirm the `Validation Session` database template starts from the SNPM-managed body contract.
7. Confirm the `New Validation Session` button exists only on `Ops > Validation` and points operators to the intake path.
8. Run `validation-sessions verify --bundle` and record any returned manual checks in the task closeout.

## Safe vs Unsafe

Safe inside the canonical synced body:
- headings
- paragraphs
- links
- to-do blocks
- callouts
- `<details>` / `<summary>`

Safe around the synced body in the Notion UI when maintained manually:
- database views
- button wiring on `Ops > Validation`
- form wiring
- page properties
- a `Validation Session` database template that starts from the SNPM-managed body contract

Unsafe in the canonical synced body:
- button blocks
- form blocks
- table/layout blocks
- unsupported blocks that make markdown retrieval unsafe

## Managed-On-Submit Rule

`Quick Intake` is valid only when submitted rows immediately inherit the SNPM-managed validation-session contract.

Practical detail:
- the template uses the managed header and body immediately
- the template header carries the canonical placeholder `Projects > <Project> > Ops > Validation > Validation Sessions > <Session Title>`
- the first SNPM pull/push cycle normalizes that placeholder to the exact row title path

This keeps form-created rows inside the managed contract without pretending the template can know the future title at creation time.

## Repo-Sync Boundary

The repo-owned boundary stays narrow:
- the managed database, schema, and row pages are SNPM-owned
- the canonical row body is SNPM-owned
- repo sync still applies only when the repo truly owns the validation-session artifact
- surrounding UI elements remain manually maintained in Notion

Recommended live flow:

1. Open `Ops > Validation`.
2. Use `Quick Intake` or the default template path to create the row.
3. Execute the checklist and triage directly in Notion.
4. Use `validation-session-pull` or manifest sync only when a repo artifact is needed.

## Verification

Use the API-visible verifier for the managed surface and bundle rules:

```powershell
npm run validation-sessions-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --bundle
```

`validation-sessions verify --bundle` reports:
- managed database status
- API-visible schema and property status
- canonical body contract status where applicable
- manual checks for the view, form, template, and button
- remaining API-visible or manual actions when the bundle is incomplete
