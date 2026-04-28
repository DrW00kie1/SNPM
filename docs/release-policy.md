# Release Policy

SNPM distribution is currently limited to source checkout usage and reviewed Git or tarball installs. Operators may run SNPM from a checked-out repository, or install a reviewed Git reference or reviewed package tarball after inspecting the contents.

## Publishing Posture

- npm publishing is deferred.
- Never publish the unscoped package name `snpm`.
- Any future npm publish requires an owned scoped package name, such as `@owner/snpm`, and explicit approval for that publish action.
- GitHub Releases and npm publishing are separate explicit actions. Creating one does not authorize or imply the other.

## Release Gates

Before any release candidate or stable release, the release operator must complete these gates:

1. Start from a clean clone.
2. Run `npm ci`.
3. Run `npm run release-check`.
4. Run `npm pack --dry-run --json --ignore-scripts`.
5. Manually review the pack output and intended tarball contents before distribution.
6. Run local live SNPM verification against the intended workspace boundary before release approval.

Local live SNPM verification is intentionally separate from secret-free CI. CI and `release-check` must not replace the operator's local live workspace verification.

## Promotion Checklist

Use this checklist for Sprint 1I release operations promotion and protection.

Release-candidate promotion:

1. Start from a clean clone of the intended release commit.
2. Run `npm ci`.
3. Run `npm run release-audit`.
4. Run `npm run package-contract`.
5. Run `npm run release-check`.
6. Run `npm pack --dry-run --json --ignore-scripts`.
7. Review the dry-run pack output and confirm only approved source, runtime, public docs, public examples, assets, README, LICENSE, and public workspace examples are included.
8. Confirm CI is green on the exact commit intended for the release candidate.
9. Run local live SNPM verification from an operator environment with private workspace config and tokens:

```powershell
npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run doctor -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN
```

10. Run `npm run verify-workspace-docs` if curated workspace-global or template docs changed.
11. Capture release evidence before any distribution action.
12. Do not create tags, GitHub Releases, or npm publishes unless the operator has separately approved that exact action.

Stable promotion:

1. Repeat the release-candidate promotion checklist on the exact stable candidate commit.
2. Confirm all release-candidate findings are closed or explicitly deferred.
3. Confirm CI is green after final release documentation changes.
4. Enable or verify required branch protection only after green CI on the stable candidate branch or default branch.
5. Re-run local live SNPM verification after any final documentation or release-operation change.
6. Capture stable release evidence, including branch-protection status.
7. Do not create a stable tag, GitHub Release, or npm publish unless each action is explicitly approved.

Branch protection is a post-green-CI governance step. Release scripts, package checks, and CI must not apply branch protection rules automatically.

## Release Evidence

Each promotion record should include:

- release kind: release candidate or stable
- exact branch, commit, and intended SemVer identifier
- CI result link or status summary for the exact commit
- `npm run release-audit` result
- `npm run package-contract` result
- `npm run release-check` result
- `npm pack --dry-run --json --ignore-scripts` review result
- local live `verify-project` and `doctor` result
- `verify-workspace-docs` result when relevant
- branch-protection status for stable promotion
- explicit approvals for any tag, GitHub Release, or npm publish action
- Notion closeout targets updated or explicitly deferred

## Versioning And Tags

SNPM uses SemVer for release identifiers.

- Release-candidate tags use `vX.Y.Z-rc.N`, for example `v0.1.0-rc.1`.
- Stable release tags use `vX.Y.Z`, for example `v0.1.0`.
- Do not reuse tags for different artifacts or approvals.

## Repository Governance

Branch protection is a manual requirement before stable releases. A stable release must not be cut until the release branch or default branch has the required protection rules reviewed and enabled by a repository owner.
