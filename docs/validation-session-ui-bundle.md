# Validation-Session UI Bundle

SNPM now treats a complete validation-session workflow as four layers:
- managed validation-session surface
- sync-safe canonical body
- supported Notion UI bundle around that body
- narrow verification plus operator guidance

This document defines the blessed validation-session UI bundle and the paused experimental Chromium-only UI automation lane that was built to reconcile it.

Current product boundary:
- `validation-sessions verify --bundle` remains the supported API-visible check
- `validation-bundle-*` remains preserved on `codex/validation-bundle` as paused experimental work
- the browser lane is not the active near-term publication target

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

## Command Split

API-visible verification stays on the existing command:

```powershell
npm run validation-sessions-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --bundle
```

That command verifies only API-visible rules and still returns explicit manual checks because the public Notion API cannot manage the whole surrounding UI bundle.

The UI automation lane is separate and currently paused experimental work:

```powershell
npm run validation-bundle-login
npm run validation-bundle-preview -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-bundle-apply -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-bundle-apply -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run validation-bundle-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

Behavior:
- `validation-bundle-login` launches a headed Playwright Chromium window and persists the Notion session locally
- `validation-bundle-preview` reports which UI bundle elements are missing or out of policy
- `validation-bundle-apply` stays preview-only until `--apply` is present
- `validation-bundle-verify` combines the API-visible bundle check with UI bundle inspection

Do not treat that lane as the default operator path today. It is preserved branch work, not the core supported product line.

## Browser Boundary

The supported browser path is:
- Playwright Chromium only

Explicit non-goals on this machine:
- no Edge support
- no default-browser handoff
- no LibreWolf dependency

The implementation launches Chromium directly and stores browser state outside the repo. If Chromium is not installed for Playwright yet, run:

```powershell
npx playwright install chromium
```

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

Recommended live flow:
1. Open `New Validation Session` on `Ops > Validation`.
2. Use `Quick Intake` or the default template path to create the row.
3. Execute the checklist and triage directly in Notion.
4. Use `validation-session-pull` or manifest sync only when a repo artifact is needed.

## Verification

Use the API-visible verifier when you only need to prove the managed surface and canonical body rules:

```powershell
npm run validation-sessions-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --bundle
```

Use the UI verifier when you need the full surrounding bundle:

```powershell
npm run validation-bundle-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

`validation-bundle-verify` reports:
- UI auth/session availability
- API-visible bundle status
- the current state of the view, form, template, and button
- remaining actions if the bundle is still incomplete
- manual checks only where Notion does not expose a stable non-mutating inspector
