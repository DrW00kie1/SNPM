# Project Bootstrap

SNPM is the canonical way to create a new Infrastructure HQ project subtree.

This page documents the current shipped bootstrap and verification flow. For the broader planned operator direction, see [operator roadmap](./operator-roadmap.md).

## Create a project

```bash
npm run create-project -- --name "Project Name"
```

This command:
- reads `Templates > Project Templates`
- creates `Projects > <Project Name>`
- preserves page icons and covers when available
- rewrites `Canonical Source`
- refreshes `Last Updated`

`create-project` creates the project tree only. It does not write starter documentation bodies or apply hidden multi-page mutations.

## Scaffold starter docs

After bootstrap, preview starter documentation with:

```bash
npm run scaffold-docs -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

The default mode is preview-only. It resolves `policyPack.starterDocScaffold` or the backward-compatible defaults, reports each planned starter doc, and does not mutate Notion.

After review, write local drafts explicitly:

```bash
npm run scaffold-docs -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --output-dir .snpm-scaffold
```

The generated `scaffold-plan.json` contains the owning follow-up commands. Project-doc drafts use `doc-create`; planning-page drafts use `page-push` with adjacent sidecar metadata when live metadata is available. `scaffold-docs` itself never applies Notion mutations.

The scaffold surface remains constrained to approved starter targets:
- `project-doc` for `Root > Overview` and `Root > Operating Model`
- `planning-page` for `Planning > Roadmap` and `Planning > Current Cycle`

Run `verify-project` and `doctor` after publishing reviewed starter docs through the owning command family.

## Policy-pack foundation

The policy-pack foundation makes the existing bootstrap rules explicit and reusable. For the current Infrastructure HQ workspace, policy-owned inputs are:
- the source template page and destination `Projects` parent
- the required starter-tree page names
- optional starter documentation scaffold entries
- reserved structural roots such as `Planning`, `Runbooks`, `Access`, `Ops`, `Vendors`, and `Incidents`
- the curated managed-doc and workspace-doc boundaries used by other SNPM command families
- project-token forbidden-scope checks used by verification

This foundation preserves the `create-project` behavior. Starter documentation is handled by the separate preview-first `scaffold-docs` command. Policy packs do not run drift or staleness audit, run cross-document consistency checks, mutate Notion, or apply coordinated batches.

## From another repo or Codex thread

If the active work is happening in a different repo, use the same command from the SNPM checkout:

```powershell
Set-Location C:\SNPM
npm run create-project -- --name "Project Name"
```

Use SNPM as the control repo for this step. Do not copy the bootstrap script, workspace ids, or starter-tree config into the new repo.

## Verify a project

```bash
npm run verify-project -- --name "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

This verifies:
- starter tree shape
- page icon presence
- canonical-source rewrites
- optional project-token scope boundaries when the project token env var is provided

Project-token verification is intentionally deferred until the new repo actually needs repo-local Notion automation.
