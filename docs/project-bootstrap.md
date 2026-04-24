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

## Policy-pack foundation

The policy-pack foundation makes the existing bootstrap rules explicit and reusable. For the current Infrastructure HQ workspace, policy-owned inputs are:
- the source template page and destination `Projects` parent
- the required starter-tree page names
- reserved structural roots such as `Planning`, `Runbooks`, `Access`, `Ops`, `Vendors`, and `Incidents`
- the curated managed-doc and workspace-doc boundaries used by other SNPM command families
- project-token forbidden-scope checks used by verification

This foundation preserves the current bootstrap behavior. It does not seed starter document bodies, scaffold extra managed docs, run drift or staleness audit, run cross-document consistency checks, or apply coordinated batches.

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
