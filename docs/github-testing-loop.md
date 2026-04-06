# GitHub Testing Loop

SNPM uses GitHub issues as the intake loop for testing findings.

## Current Tester Targets

Stable baseline:
- `main`

Historical pinned snapshot:
- `v0.1.0-rc.1`

## Scope By Line

Stable baseline on `main`:
- `create-project`
- `verify-project`
- planning-page sync
- managed runbooks
- managed Access records
- `doc-create`
- `doc-adopt`
- `doc-pull`
- `doc-diff`
- `doc-push`
- `verify-workspace-docs`
- `doctor`
- `recommend`
- curated doc routing via `recommend --intent project-doc|template-doc|workspace-doc`

Still outside the active supported path:
- build records
- validation sessions
- manifest sync
- `validation-bundle`

## Tester Workflow

Stable baseline:

```powershell
git clone https://github.com/DrW00kie1/SNPM.git
Set-Location SNPM
git checkout main
npm test
node src/cli.mjs help
```

## Safe Live Validation

Read-heavy live checks:
- `verify-project`
- `doctor`
- `recommend --intent ...`
- `page-pull` / `page-diff`
- `runbook-pull` / `runbook-diff`
- Access pull/diff commands
- `doc-pull` / `doc-diff`
- `verify-workspace-docs`

Trusted live mutation only:
- `page-push --apply`
- `runbook-* --apply`
- Access `* --apply`
- `doc-* --apply`

Every live mutation report should say exactly what page or record was touched.

Example SNPM-only checks:

```powershell
npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run doctor -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run recommend -- --project "SNPM" --intent project-doc --path "Root > Overview" --project-token-env SNPM_NOTION_TOKEN
npm run doc-pull -- --project "SNPM" --path "Root" --output - --project-token-env SNPM_NOTION_TOKEN
npm run doc-pull -- --path "Templates > Project Templates" --output -
npm run verify-workspace-docs
```

## What To Include In An Issue

Include:
- tested branch, tag, or commit
- commands run
- expected result
- actual result
- whether the test touched the live workspace
- token mode used
- affected project or path
- copied CLI output when useful

If you tested a non-`main` branch, say so explicitly.

## Maintainer Fix Loop

When a finding lands:
- reproduce on the reported line
- add or adjust tests first when practical
- fix in SNPM
- rerun `npm test` plus the relevant live verification path
- close the issue with the fixing branch, commit, or promoted baseline
