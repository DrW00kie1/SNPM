# Validation Sessions

SNPM ships a project-token-safe validation-session workflow for human tester runs.

The managed surface is:
- `Projects > <Project> > Ops > Validation > Validation Sessions`

This surface is optional:
- it is not part of the required starter-tree baseline
- initialize it only when the project needs per-run human validation reports

## Commands

Initialize or standardize the managed database:

```powershell
npm run validation-sessions-init -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-sessions-init -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run validation-sessions-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-sessions-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --bundle
```

Create or adopt a managed validation-session record:

```powershell
npm run validation-session-create -- --project "Project Name" --title "Session Title" --file validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-session-create -- --project "Project Name" --title "Session Title" --file validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run validation-session-adopt -- --project "Project Name" --title "Legacy Session Title" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-session-adopt -- --project "Project Name" --title "Legacy Session Title" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

Pull, diff, or push a managed validation-session record:

```powershell
npm run validation-session-pull -- --project "Project Name" --title "Session Title" --output validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-session-diff -- --project "Project Name" --title "Session Title" --file validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-session-push -- --project "Project Name" --title "Session Title" --file validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-session-push -- --project "Project Name" --title "Session Title" --file validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

All mutating commands are preview-first and require `--apply`.

## Checkbox-First Workflow

Validation sessions now use a checkbox-first managed body contract:
- `Session Summary`
- `Checklist`
- `Findings`
- `Follow-Up`

Checklist semantics:
- checked to-do = passed
- unchecked to-do = not yet run, failed, or blocked
- failures and blockers belong in `Findings`, not in separate per-check database properties

Triage semantics:
- `Findings` is callout-first, with one finding per callout
- `<details>` / `<summary>` blocks are the canonical way to keep deeper evidence collapsible
- `Follow-Up` uses to-do items so next actions stay easy to scan and check off
- plain bullet lists are no longer the default interaction model for triage

Primary human workflow:
1. Create a new session from a Notion database template or button when the tester is working live in Notion.
2. Execute the checklist directly in the session page by checking items as they pass.
3. Record failures, blockers, and notable observations in `Findings` using one callout per finding, with an optional toggle for detail.
4. Pull or sync the managed markdown file back into the repo only when a repo artifact is needed.

## Triage Primitive Ranking

Use this ranking for `Findings` and `Follow-Up` decisions:

1. `Database templates`
2. `To-do blocks`
3. `Toggle blocks`
4. `Callouts`
5. `Buttons`
6. `Status / select / checkbox properties`
7. `Mentions`
8. `Simple tables / layout primitives`
9. `Linked databases / relation properties`
10. `Comments / discussions`

Chosen classification for the current SNPM contract:
- safe for the canonical synced page body:
  - `To-do blocks`
  - `Toggle blocks`
  - `Callouts`
- useful only in the richer Notion UI layer:
  - `Buttons`
  - `Database templates`
  - `Mentions`
  - `Status / select / checkbox properties`
- unsupported or too risky for the current canonical sync model:
  - `Comments / discussions` as canonical report content
  - `Linked databases / relation properties`
  - `Simple tables / layout primitives` as the default triage shape

Why SNPM draws the line there:
- the canonical body must stay obvious in pulled markdown and safe to round-trip through `create`, `pull`, `diff`, `push`, and manifest sync
- buttons/templates are valuable accelerators, but they belong to the live Notion UI layer rather than the synced markdown contract
- comments and relation-heavy triage add collaboration value, but they are not stable canonical report content for the current SNPM workflow

## Existing Project Adoption

For an existing project, use this sequence and report the exact published tag or commit you tested.

1. Confirm the feature exists in the published tag or exact commit you are using.
2. Preview the surface:

```powershell
npm run validation-sessions-init -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

3. Apply the surface:

```powershell
npm run validation-sessions-init -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

4. Create or adopt the first managed session row:

```powershell
npm run validation-session-create -- --project "Project Name" --title "Session Title" --file validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

or

```powershell
npm run validation-session-adopt -- --project "Project Name" --title "Legacy Session Title" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

5. Immediately normalize the local file against Notion's stored markdown shape:

```powershell
npm run validation-session-pull -- --project "Project Name" --title "Session Title" --output validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-session-diff -- --project "Project Name" --title "Session Title" --file validation-session.md --project-token-env PROJECT_NAME_NOTION_TOKEN
```

6. Optionally confirm the managed surface itself:

```powershell
npm run validation-sessions-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

7. Optionally run the broader project verifier:

```powershell
npm run verify-project -- --name "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

`validation-sessions-verify` is the clean success signal for this surface. `verify-project` is still broader and may report unrelated legacy drift elsewhere in an older project subtree.

## File Format

Validation-session files use YAML front matter plus the managed page body:

```md
---
Platform: Web
Session State: Planned
Tester: Example Tester
Build Label: validation-fixture-001
Runbook URL: https://example.com/validation-runbook
Started On: 2026-03-28
Completed On:
---
## Session Summary
- Goal: Describe the purpose and scope of this validation run.
- Scope: Record the environment, account, or lane being validated.
- Tester context: Capture device, build, or setup notes that affect interpretation.

## Checklist
- [ ] Confirm the validation target and account for this run.
- [ ] Execute the primary happy-path flow for this session.
- [ ] Re-check any recent fixes or high-risk areas tied to this run.

## Findings
<callout>
Blocker / Issue / Note: Summarize the finding in one line.
</callout>

<details>
<summary>Optional finding detail</summary>

Area:
Expected:
Actual:
Evidence:
</details>

## Follow-Up
- [ ] Capture the concrete next action, owner, and retest trigger.
- [ ] Link the follow-up issue, PR, or runbook update if one exists.
```

Front matter fields:
- `Platform`
- `Session State`
- `Tester`
- `Build Label`
- `Runbook URL`
- `Started On`
- `Completed On`

`--title` remains the record lookup key inside `Validation Sessions` and must be unique.

Use the file produced by `validation-session-pull` as the editing base for later pushes.
That pulled file is the canonical editable shape for callouts, toggles, and follow-up to-dos.
For batch repo-backed artifact sync, use the manifest workflow in [validation-session sync](./validation-session-sync.md).

## Managed Surface Rules

SNPM enforces these v1 constraints:
- the database name must be exactly `Validation Sessions`
- it must live directly under `Ops > Validation`
- `validation-sessions init` creates or standardizes only that database
- `validation-sessions verify` checks only that managed surface and does not report unrelated drift elsewhere in the project
- conflicting child databases under `Ops > Validation` fail loudly instead of being adopted automatically
- `pull`, `diff`, and `push` operate only on SNPM-managed session pages
- `adopt` is the explicit path for standardizing an existing headerless session page

## Surrounding Manual UI Bundle

The stable API-managed surface stops at the database, schema, row properties, and row page content.

Use bundle verification when you need the narrow workflow-level check:

```powershell
npm run validation-sessions-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --bundle
```

`--bundle` verifies the API-visible parts of the validation-session workflow and returns explicit manual checks for UI-only elements that the Notion API does not manage.

Manual UI-only elements:
- primary working view: `Active Sessions`
- backup intake form: `Quick Intake`
- database template: `Validation Session`
- validation-page button: `New Validation Session`
- optional safe extra API-visible property: `Issue URL` as `url`

SNPM does not mutate or inspect the full surrounding UI bundle. Keep the API-visible validation-session surface plus manual UI setup as the stable baseline.

Rows created from the `Validation Session` template inherit the managed contract immediately. The template uses the canonical placeholder path `... > <Session Title>` until the first SNPM pull/push normalizes the header to the exact row title.

The full manual bundle contract lives in [validation-session manual UI bundle](./validation-session-ui-bundle.md).
