# GitHub Testing Loop

SNPM uses GitHub as the intake loop for tester findings.

Default tester path:
- clone or open the SNPM repo directly
- check out the current testing snapshot tag
- run repo-level checks first
- file findings in GitHub issues, not only in chat threads

Current testing snapshot:
- `sprint-1-foundation`

## Tester Workflow

Clone and check out the current snapshot:

```powershell
git clone https://github.com/DrW00kie1/SNPM.git
Set-Location SNPM
git checkout sprint-1-foundation
```

Default repo-level validation:

```powershell
npm test
node src/cli.mjs help
```

Trusted live-tester validation:
- `verify-project` is the default live command because it is read-heavy and validates the real workspace without creating a new project
- `create-project` or any other live mutation should be treated as trusted-tester work only and called out explicitly in the issue when used
- use workspace and project tokens only if you already have approved access

Example trusted live check:

```powershell
npm run verify-project -- --name "SNPM"
npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN
```

Testing from another repo context is allowed, but direct-clone testing is the default path for this phase.

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

- `main` remains the integration branch.
- Tags are the reproducible testing contract.
- Live Notion validation stays limited to a smaller trusted tester group because SNPM touches a real workspace.
