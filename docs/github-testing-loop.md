# GitHub Testing Loop

SNPM uses GitHub as the intake loop for tester findings.

Default tester path:
- clone or open the SNPM repo directly
- check out the current testing snapshot tag
- run repo-level checks first
- file findings in GitHub issues, not only in chat threads

Current testing snapshot:
- `sprint-3-validation-sessions`

`main` remains the integration branch for follow-on work after the current snapshot.
Manifest-backed validation-session sync and the checkbox-first validation-session workflow are newer than the latest published testing tag but are on published `main`. The triage-first findings / follow-up redesign and the Access-surface command family are committed on `codex/development`. The read-only `doctor` / `recommend` slice is committed on `codex/doctor`. If you test any of those newer slices, say explicitly whether you were on published `main`, `codex/development`, `codex/doctor`, or an unpublished local checkout.

## Tester Workflow

Clone and check out the current snapshot:

```powershell
git clone https://github.com/DrW00kie1/SNPM.git
Set-Location SNPM
git checkout sprint-3-validation-sessions
```

Default repo-level validation:

```powershell
npm test
node src/cli.mjs help
```

Trusted live-tester validation:
- `verify-project` is the default live command because it is read-heavy and validates the real workspace without creating a new project
- `validation-sessions-verify` is also allowed for trusted testers because it verifies only the managed validation-session surface on an existing project
- `page-pull` and `page-diff` are also allowed for trusted testers on the approved planning pages
- preview-only `page-push` without `--apply` is allowed for trusted testers because it computes drift without mutating the workspace
- `runbook-pull`, `runbook-diff`, `build-record-pull`, `build-record-diff`, `validation-session-pull`, and `validation-session-diff` are also allowed for trusted testers on SNPM-managed project pages
- `sync-check` and preview-only `sync-pull` are also allowed for trusted testers on repo-backed validation-session artifacts because they do not mutate Notion
- `doctor` / `recommend` are safe read-only live commands when a tester is explicitly on `codex/doctor`
- `access-domain-pull`, `access-domain-diff`, `secret-record-pull`, `secret-record-diff`, `access-token-pull`, and `access-token-diff` are only relevant when a tester is explicitly on `codex/development`
- preview-only `access-domain-create`, `access-domain-adopt`, `access-domain-push`, `secret-record-create`, `secret-record-adopt`, `secret-record-push`, and `access-token-create`, `access-token-adopt`, `access-token-push` are likewise `codex/development`-only until that slice is published
- preview-only `runbook-create`, `runbook-adopt`, `runbook-push`, `build-record-create`, `build-record-push`, `validation-sessions-init`, `validation-session-create`, `validation-session-adopt`, and `validation-session-push` are allowed for trusted testers because they show the exact change without mutating the workspace
- `create-project`, `page-push --apply`, `access-domain-create --apply`, `access-domain-adopt --apply`, `access-domain-push --apply`, `secret-record-create --apply`, `secret-record-adopt --apply`, `secret-record-push --apply`, `access-token-create --apply`, `access-token-adopt --apply`, `access-token-push --apply`, `runbook-create --apply`, `runbook-adopt --apply`, `runbook-push --apply`, `build-record-create --apply`, `build-record-push --apply`, `validation-sessions-init --apply`, `validation-session-create --apply`, `validation-session-adopt --apply`, `validation-session-push --apply`, `sync-push --apply`, or any other live mutation should be treated as trusted-tester work only and called out explicitly in the issue when used
- use workspace and project tokens only if you already have approved access
- use the file produced by `page-pull` as the editing base for `page-push`; Notion may re-escape markdown-sensitive characters such as `>` on read-back
- use the file produced by `runbook-pull` or `build-record-pull` as the editing base for follow-on push commands for the same reason
- use the file produced by `access-domain-pull`, `secret-record-pull`, or `access-token-pull` as the editing base for follow-on Access pushes; the pulled file is the canonical editable shape for those managed pages
- use the file produced by `validation-session-pull` as the editing base for follow-on validation-session pushes; the local file is the canonical editable shape because it includes normalized YAML front matter plus the managed body
- when testing validation-session workflow changes, report whether you changed checkbox task-list state, callout/toggle triage content, follow-up to-dos, or a mix of them; that makes markdown round-trip regressions much easier to classify

Example trusted live check:

```powershell
npm run verify-project -- --name "SNPM"
npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run validation-sessions-verify -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run page-pull -- --project "SNPM" --page "Planning > Roadmap" --output roadmap.md --project-token-env SNPM_NOTION_TOKEN
npm run page-diff -- --project "SNPM" --page "Planning > Roadmap" --file roadmap.md --project-token-env SNPM_NOTION_TOKEN
npm run page-push -- --project "SNPM" --page "Planning > Roadmap" --file roadmap.md --project-token-env SNPM_NOTION_TOKEN
npm run runbook-pull -- --project "SNPM" --title "SNPM Operator Validation Runbook" --output runbook.md --project-token-env SNPM_NOTION_TOKEN
npm run build-record-diff -- --project "SNPM" --title "SNPM Operator Validation Build Record" --file build-record.md --project-token-env SNPM_NOTION_TOKEN
npm run validation-session-pull -- --project "SNPM" --title "SNPM Validation Session Fixture" --output validation-session.md --project-token-env SNPM_NOTION_TOKEN
npm run validation-session-diff -- --project "SNPM" --title "SNPM Validation Session Fixture" --file validation-session.md --project-token-env SNPM_NOTION_TOKEN
npm run sync-check -- --manifest C:\repo\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run sync-pull -- --manifest C:\repo\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run doctor -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN
```

Testing from another repo context is allowed, but direct-clone testing is the default path for this phase.

## What To Include In An Issue

Include:
- tested tag or commit
- whether you were on a published tag or an unpublished local checkout
- whether you tested from a direct SNPM clone or another repo context
- commands run
- expected result
- actual result
- whether the test touched the live Notion workspace
- token mode used: none, workspace token, or project token
- affected project or page path when relevant
- copied CLI output or screenshots when helpful

Use GitHub issue templates when possible, but blank issues are still allowed for odd edge cases.

## Maintainer Fix Loop

When a finding lands:
- reproduce against the reported tag or current head
- add or adjust automated tests first when practical
- fix the issue in SNPM
- re-run `npm test` plus the relevant live verification path
- close the issue with the fixing commit or a newer testing tag

## Notes

- `main` remains the integration branch.
- Tags are the reproducible testing contract.
- `page push --apply` should always include the affected project and page path in the issue if it was part of testing.
- `access-domain`, `secret-record`, and `access-token` mutations should always include the affected project, domain, and record title in the issue if they were part of testing.
- `runbook` and `build-record` mutations should always include the affected project and target title in the issue if they were part of testing.
- `validation-session` mutations should always include the affected project and target title in the issue if they were part of testing.
- `sync` issues should always include the manifest path and whether the failure was `sync-check`, `sync-pull`, or `sync-push`.
- if you tested an unpublished local checkout instead of a published tag, say so explicitly in the issue.
- Live Notion validation stays limited to a smaller trusted tester group because SNPM touches a real workspace.
