# GitHub Testing Loop

SNPM uses GitHub issues as the intake loop for testing findings.

## Current Tester Targets

Stable baseline:
- `main`

Historical pinned snapshot:
- `v0.1.0-rc.1`

## Current Distribution And Release Identity

Current release testing targets source checkout plus reviewed Git or tarball install paths only. SNPM has an installed `snpm` executable in package metadata for tarball/Git install smoke tests, but there is no npm publish yet.

Release identity rules for test reports:
- do not assume the unscoped npm package name `snpm` belongs to this project; that name is occupied by an unrelated package
- future npm publishing requires an approved owned scoped package name
- GitHub Releases and npm publishing are explicit maintainer actions, not outcomes of tester workflows
- branch protection for `main` is a required manual governance step before stable release promotion

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
- `page-edit`
- `runbook-edit`
- `doc-edit`
- `access-domain-edit`
- `secret-record-exec`
- `access-token-exec`
- `verify-workspace-docs`
- `doctor`
- `recommend`
- curated doc routing via `recommend --intent project-doc|template-doc|workspace-doc`
- repo-first implementation routing via `recommend --intent implementation-note|design-spec|task-breakdown|investigation`

Still outside the stable supported path:
- build records
- validation sessions
- manifest sync

## Tester Workflow

Stable baseline:

```powershell
git clone https://github.com/DrW00kie1/SNPM.git
Set-Location SNPM
git checkout main
npm test
node src/cli.mjs --help
```

## CI And Release Gate Checks

Sprint 1G release-gate checks run on Node.js 22+.

Local release-readiness checks:

```powershell
npm run release-audit
npm run package-contract
npm run release-check
```

`release-audit` is the focused release identity and package-content audit gate. `package-contract` is the focused package metadata and packed-file contract check. `release-check` is the local source-checkout pre-release aggregate gate. If a tested branch does not yet contain `release-audit`, report that explicitly and do not treat the branch as Sprint 1H release-ready.

CI expectations:
- CI must be secret-free
- do not provide Notion tokens, private workspace config, real page ids, or `SNPM_WORKSPACE_CONFIG_DIR` pointing at private operator state
- do not run live Notion verification or mutation commands in CI
- live workspace verification remains a local operator action when private config and tokens are available

## Safe Live Validation

Read-heavy live checks:
- `verify-project`
- `doctor`
- `recommend --intent ...`
- `validation-sessions-verify --bundle`, which verifies API-visible validation-session bundle rules and reports manual UI-only checks
- `page-pull` / `page-diff`
- `runbook-pull` / `runbook-diff`
- Access pull/diff commands
- `doc-pull` / `doc-diff`
- `verify-workspace-docs`

Trusted live mutation only:
- `page-push --apply`
- `page-edit --apply`
- `runbook-* --apply`
- `runbook-edit --apply`
- Access `* --apply`
- Access `*-edit --apply`
- `doc-* --apply`
- `doc-edit --apply`

Every live mutation report should say exactly what page or record was touched.

Example SNPM-only checks:

```powershell
npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run doctor -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run validation-sessions-verify -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN --bundle
npm run recommend -- --project "SNPM" --intent project-doc --path "Root > Overview" --project-token-env SNPM_NOTION_TOKEN
npm run recommend -- --project "SNPM" --intent implementation-note --repo-path "notes/implementation.md"
npm run doc-pull -- --project "SNPM" --path "Root" --output - --project-token-env SNPM_NOTION_TOKEN
npm run doc-pull -- --path "Templates > Project Templates" --output -
npm run verify-workspace-docs
```

## What To Include In An Issue

Include:
- tested branch, tag, or commit
- tested distribution path: source checkout, reviewed Git install, or reviewed tarball install
- Node.js version when testing Sprint 1G release gates
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
