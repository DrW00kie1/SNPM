# GitHub Testing Loop

SNPM uses GitHub as the intake loop for RC findings.

## Current Tester Contract

Active testing tag:
- `v0.1.0-rc.1`

This RC covers the narrow-band line only:
- planning-page sync
- managed runbooks
- managed Access records
- `doctor`
- intent-driven `recommend`
- stdin/stdout core-band ergonomics
- EOF-stable round-trips

Historical sprint tags remain available for older snapshots, but `v0.1.0-rc.1` is the default place to report current findings.

## Tester Workflow

Clone and check out the RC:

```powershell
git clone https://github.com/DrW00kie1/SNPM.git
Set-Location SNPM
git checkout v0.1.0-rc.1
```

Default repo-level validation:

```powershell
npm test
node src/cli.mjs help
```

Trusted live-tester validation:
- `verify-project` is the default live command because it is read-heavy and validates the real workspace without creating a new project
- `doctor` is a safe read-only live command on the RC line
- `recommend --intent ...` is a safe read-only live command on the RC line
- `page-pull` and `page-diff` are allowed on the approved planning pages
- preview-only `page-push` without `--apply` is allowed because it computes drift without mutating the workspace
- `runbook-pull` and `runbook-diff` are allowed on managed runbooks
- `access-domain-pull`, `access-domain-diff`, `secret-record-pull`, `secret-record-diff`, `access-token-pull`, and `access-token-diff` are allowed on RC-line Access pages
- preview-only `runbook-create`, `runbook-adopt`, `runbook-push`, `access-domain-create`, `access-domain-adopt`, `access-domain-push`, `secret-record-create`, `secret-record-adopt`, `secret-record-push`, `access-token-create`, `access-token-adopt`, and `access-token-push` are allowed because they show the exact change without mutating the workspace
- `create-project`, `page-push --apply`, `runbook-* --apply`, and Access `* --apply` remain trusted live-mutation paths only and must say exactly what page or record was touched
- use workspace and project tokens only if you already have approved access
- for the core band, `page-pull`, `runbook-pull`, and Access pull commands accept `--output -` so the pulled body can go straight to stdout
- for the core band, `page-diff`, `page-push`, `runbook-create`, `runbook-diff`, `runbook-push`, and the Access create/diff/push commands accept `--file -` so markdown can come from stdin instead of a temp file
- use the file produced by `page-pull`, `runbook-pull`, or the Access pull commands as the editing base for follow-on pushes
- build records, validation sessions, manifest sync, and `validation-bundle` remain present on the branch but are not part of the active RC testing path

Example trusted live check:

```powershell
npm run verify-project -- --name "SNPM"
npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run doctor -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run recommend -- --project "SNPM" --intent planning --page "Roadmap" --project-token-env SNPM_NOTION_TOKEN
npm run recommend -- --project "SNPM" --intent secret --domain "App & Backend" --title "GEMINI_API_KEY" --project-token-env SNPM_NOTION_TOKEN
npm run recommend -- --project "SNPM" --intent repo-doc --repo-path "docs/operator-roadmap.md"
npm run page-pull -- --project "SNPM" --page "Planning > Roadmap" --output - --project-token-env SNPM_NOTION_TOKEN
Get-Content roadmap.md | npm run page-diff -- --project "SNPM" --page "Planning > Roadmap" --file - --project-token-env SNPM_NOTION_TOKEN
Get-Content roadmap.md | npm run page-push -- --project "SNPM" --page "Planning > Roadmap" --file - --project-token-env SNPM_NOTION_TOKEN
npm run runbook-pull -- --project "SNPM" --title "SNPM Operator Validation Runbook" --output - --project-token-env SNPM_NOTION_TOKEN
npm run access-domain-pull -- --project "SNPM" --title "App & Backend" --output - --project-token-env SNPM_NOTION_TOKEN
```

## What To Include In An Issue

Include:
- tested tag or commit
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

- `main` remains unchanged until the RC is accepted.
- Tags are the reproducible testing contract.
- `page push --apply` issues should include the affected project and page path.
- Access mutation issues should include the affected project, domain, and record title.
- runbook mutation issues should include the affected project and target title.
- if you test non-RC command families such as `build-record`, `validation-session`, `sync`, or `validation-bundle`, say so explicitly because they are outside the active RC contract.
- Live Notion validation stays limited to a smaller trusted tester group because SNPM touches a real workspace.
