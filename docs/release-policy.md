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

## Versioning And Tags

SNPM uses SemVer for release identifiers.

- Release-candidate tags use `vX.Y.Z-rc.N`, for example `v0.1.0-rc.1`.
- Stable release tags use `vX.Y.Z`, for example `v0.1.0`.
- Do not reuse tags for different artifacts or approvals.

## Repository Governance

Branch protection is a manual requirement before stable releases. A stable release must not be cut until the release branch or default branch has the required protection rules reviewed and enabled by a repository owner.
