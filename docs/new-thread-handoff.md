# New Thread Handoff

You own the `SNPM` repo, which is the canonical home for Infrastructure HQ Notion automation.

## Ground rules

- Your first job is migration, not redesign.
- Treat `C:\\tall-man-training` as read-only source material until cutover is complete.
- Preserve the currently validated project bootstrap behavior.
- Follow the planning discipline in this repo: research first, then plan, then implement after approval.

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

## After parity

- update live Notion workflow pages to point to SNPM
- reduce `tall-man-training` docs to a short pointer
- only then plan any cleanup or redesign work

