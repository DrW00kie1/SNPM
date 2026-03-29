# SNPM

SNPM is the canonical home for Infrastructure HQ Notion automation.

SNPM has two important layers right now:
- current shipped behavior: a conservative bootstrap and verification tool for Infrastructure HQ project pages
- chosen next-phase direction: an internal, opinionated Notion workspace operator with broader page-sync, scaffold, and verification capabilities

GitHub remote:
- `https://github.com/DrW00kie1/SNPM`
- current testing snapshot: `sprint-1-foundation`

This repo owns:
- project bootstrap automation for `Templates > Project Templates`
- Infrastructure HQ workspace config
- workspace-operating docs for Notion
- legacy migration material from `C:\\tall-man-training`

## Current Status

Today SNPM ships and validates:
- `create-project`
- `verify-project`
- project-token scope verification when a project token is provided
- cross-repo use through the shared `C:\\SNPM` control checkout

This current command surface is the only implemented operator surface today.

## Commands

Create a new project subtree:

```bash
npm run create-project -- --name "Project Name"
```

Verify a created project subtree:

```bash
npm run verify-project -- --name "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

Defaults:
- workspace token: `NOTION_TOKEN`, falling back to `INFRASTRUCTURE_HQ_NOTION_TOKEN`
- workspace config: `config/workspaces/infrastructure-hq.json`

## Next Phase

The chosen next phase is to evolve SNPM into an internal, high-guardrail Notion workspace operator.

That broader operator model is the intended direction, but it is **not implemented yet**. The roadmap, tradeoffs, and planned command families live in [operator roadmap](./docs/operator-roadmap.md).

## Use From Another Repo Or Codex Thread

If your active Codex thread is attached to a different repo, use SNPM as the local control repo from `C:\\SNPM`:

```powershell
Set-Location C:\SNPM
npm run create-project -- --name "Project Name"
```

Bootstrap is the day-zero requirement. Project-token setup stays deferred until the new repo actually needs repo-local Notion automation.

Do not copy SNPM scripts, workspace ids, or starter-tree config into the new repo.

## GitHub Testing

SNPM now uses its private GitHub repo as the tester feedback loop.

Default tester flow:
- clone or open the repo directly
- check out the current testing snapshot tag: `sprint-1-foundation`
- run `npm test`
- use GitHub issues to report bugs or testing findings

Trusted live testers may also run `verify-project` against the real Notion workspace when they already have the right token setup. Live mutation commands such as `create-project` are not the default testing path.

## Docs

- [operator roadmap](./docs/operator-roadmap.md)
- [GitHub testing loop](./docs/github-testing-loop.md)
- [fresh project usage](./docs/fresh-project-usage.md)
- [workspace overview](./docs/workspace-overview.md)
- [project bootstrap](./docs/project-bootstrap.md)
- [project token setup](./docs/project-token-setup.md)
- [workspace config ownership](./docs/workspace-config.md)
- [live Notion doc update guidance](./docs/live-notion-docs.md)
- [new thread handoff](./docs/new-thread-handoff.md)

## Migration

Milestone 1 is intentionally conservative:
- preserve the validated `create` / `verify` behavior from `tall-man-training`
- move ownership into this repo
- update live Notion docs to reference SNPM
- leave cleanup/removal in `tall-man-training` for a later pass after parity is proven

The roadmap beyond milestone 1 should not be confused with the currently shipped command surface.
