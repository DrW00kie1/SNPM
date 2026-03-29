# Research

## Migration Source Inventory

Primary source repo: `C:\\tall-man-training`

Tracked Notion automation assets discovered there:
- `scripts/notion-project-bootstrap.mjs`
- `scripts/notion-workspace.config.json`
- `docs/dev-guide.md` `Notion Workspace Automation` section

Legacy one-off Notion maintenance assets discovered there:
- `tmp/notion_doc_split_v2.mjs`
- `tmp/notion_doc_split_v2.ps1`
- `tmt_notion_icon.png`

## Current Validated Behavior

The existing bootstrap flow has already been validated against the live Infrastructure HQ workspace:
- create a project from `Templates > Project Templates`
- place it under `Projects > <Project Name>`
- preserve page icons
- rewrite `Canonical Source`
- refresh `Last Updated`
- verify tree shape and icon presence
- optionally verify project-token scope boundaries

## Migration Constraint

Milestone 1 should relocate and stabilize the tooling, not redesign the Notion workspace model.

