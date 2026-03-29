# New Thread Handoff

You own the `SNPM` repo, which is the canonical home for Infrastructure HQ Notion automation.

Remote:
- `https://github.com/DrW00kie1/SNPM`

## Ground rules

- Your first job is migration, not redesign.
- Treat `C:\\tall-man-training` as read-only source material until cutover is complete.
- Preserve the currently validated project bootstrap behavior.
- Follow the planning discipline in this repo: research first, then plan, then implement after approval.
- Do not confuse the next-phase roadmap with shipped capability when operating the live workspace.

## External usage model

- Fresh project threads should use `C:\\SNPM` as the local control repo for Notion bootstrap.
- Outside repos should not vendor the bootstrap logic, workspace ids, or starter-tree config.
- Bootstrap is the day-zero requirement; project-token setup is deferred until repo-local Notion automation is needed.

## Source assets imported from `tall-man-training`

- `scripts/notion-project-bootstrap.mjs`
- `scripts/notion-workspace.config.json`
- `tmp/notion_doc_split_v2.mjs`
- `tmp/notion_doc_split_v2.ps1`
- `docs/dev-guide.md` Notion automation section
- `tmt_notion_icon.png`

## Behavior that must remain true in milestone 1

- project creation starts from `Templates > Project Templates`
- destination is `Projects > <Project Name>`
- icons are preserved
- `Canonical Source` is rewritten to the project path
- `Last Updated` is refreshed
- structural verification remains available
- optional project-token scope verification remains available

## Next-phase direction

After the migration surface is stable, the chosen direction is for SNPM to become an internal, high-guardrail Notion workspace operator.

That next phase should:
- keep the current project bootstrap and verification commands intact
- add broader page-sync, scaffold, and verification capabilities in a clearly separated roadmap track
- stay opinionated about Infrastructure HQ workspace boundaries rather than becoming a generic raw Notion shell
- prefer a package-installable, CLI-first model that other repos and Codex threads can call directly

Canonical roadmap:
- [`docs/operator-roadmap.md`](./operator-roadmap.md)

## After parity

- update live Notion workflow pages to point to SNPM
- reduce `tall-man-training` docs to a short pointer
- only then plan any cleanup or redesign work
