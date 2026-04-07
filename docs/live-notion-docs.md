# Live Notion Doc Updates

The curated managed-doc surface is now supported on `main` for selected root, template, and workspace-global docs.

## Curated Workspace-Global Docs

Exact managed pages:
- `Infrastructure HQ Home`
  - id: `3319f5f6-66d0-805b-8ad5-f358f6a1b494`
- `Projects`
  - id: `3319f5f6-66d0-81ab-b6e8-c4fe3e2047be`
- `Templates`
  - id: `3319f5f6-66d0-811b-ac7f-d7a8bb77d99e`
- `Runbooks > Notion Workspace Workflow`
  - id: `3319f5f6-66d0-81d3-b81c-dc0109d3d796`
- `Runbooks > Notion Project Token Setup`
  - id: `3319f5f6-66d0-8182-b7c3-f18396ab199b`

Curated subtree root:
- `Templates > Project Templates`
  - id: `3319f5f6-66d0-817a-8d71-d6c194ea4bb8`

## Project Doc Surface

Project-scoped managed docs include:
- `Root`
- `Root > ...` under non-reserved top-level names

Planning pages remain on the fixed planning surface:
- `Planning > Roadmap`
- `Planning > Current Cycle`
- `Planning > Backlog`
- `Planning > Decision Log`

## Reserved Roots

These stay out of `doc-*`:
- `Ops`
- `Planning`
- `Access`
- `Vendors`
- `Runbooks`
- `Incidents`

Use the owning surface instead:
- `page-*` for planning pages
- `runbook-*` for runbooks
- `access-domain-*`, `secret-record-*`, and `access-token-*` for Access

## Safe Update Rule

Use `doc-*` only after the target is inside the curated family.
Use the curated doc surface for operator and workflow documentation, not for fast-changing implementation notes or design work. Those stay repo-first.

Safe examples:

```powershell
npm run doc-pull -- --project "SNPM" --path "Root" --output root.md --project-token-env SNPM_NOTION_TOKEN
npm run doc-pull -- --project "SNPM" --path "Root > Overview" --output overview.md --project-token-env SNPM_NOTION_TOKEN
npm run doc-pull -- --path "Templates > Project Templates" --output project-templates.md
npm run doc-pull -- --path "Runbooks > Notion Workspace Workflow" --output workspace-workflow.md
```

Guard examples:

```powershell
npm run doc-pull -- --project "SNPM" --path "Runbooks > SNPM Operator Validation Runbook"
npm run doc-pull -- --project "SNPM" --path "Access > App & Backend"
```

Expected failures:
- runbooks stay on `runbook-*`
- Access stays on `access-*`

## Managed-Doc Behavior

SNPM manages only the body content below the standard divider:
- preserves header content above `---`
- rewrites `Canonical Source`
- rewrites `Last Updated`
- keeps markdown EOF handling stable

For low-ceremony edits on supported operational surfaces, prefer the editor-backed commands:
- `page-edit`
- `runbook-edit`
- `doc-edit`
- `access-domain-edit`
- `secret-record-edit`
- `access-token-edit`

Use `--explain` when you need the auth-mode, target-resolution, child-page, and normalization reasoning before apply.
Use `--review-output <dir>` when you need review artifacts without making the repo the source of truth.

If `doc-adopt` finds no managed divider, it wraps the current full page body under a new managed-doc header.

## Verification

Project-scoped verification:

```powershell
npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run doctor -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN
```

Workspace/template verification:

```powershell
npm run verify-workspace-docs
```

Use `verify-workspace-docs` after any live mutation to curated workspace-global or template docs.

## Release Alignment Rule

When the supported SNPM surface changes, include these curated live docs in the same promotion pass:
- `Projects > SNPM`
- `Infrastructure HQ Home`
- `Projects`
- `Templates`
- `Templates > Project Templates`
- `Runbooks > Notion Workspace Workflow`
- `Runbooks > Notion Project Token Setup`

This keeps the repo and the curated live docs from drifting apart.
