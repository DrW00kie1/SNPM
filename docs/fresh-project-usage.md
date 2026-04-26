# Fresh Project Usage

SNPM can be used from a Codex thread attached to a different repo as long as `C:\\SNPM` is available locally.

This page describes the current shipped cross-repo bootstrap flow. For the broader planned operator model, see [operator roadmap](./operator-roadmap.md).

## Day-zero workflow

1. Start the new repo and choose the project name there.
2. In that thread, switch command context to `C:\\SNPM`.
3. Run first-contact discovery:

```powershell
Set-Location C:\SNPM
npm run discover -- --project "Project Name"
```

4. If the project does not exist in Notion yet, run the bootstrap command:

```powershell
Set-Location C:\SNPM
npm run create-project -- --name "Project Name"
```

5. Let SNPM create `Projects > <Project Name>` from `Templates > Project Templates`.
6. Treat the created Notion subtree as part of the new repo's operating context for planning, runbooks, status, and operational notes.

## Ownership boundary

SNPM owns:
- project bootstrap automation
- workspace ids and config
- starter-tree contract
- structural verification and optional scope verification

The new repo owns:
- code and shipped behavior
- code-coupled docs and invariants
- contributor workflow
- product-specific operational truth

Do not copy SNPM scripts, config, or page ids into the new repo.

## When a project token is needed later

Project-token setup is intentionally deferred until the new repo actually needs repo-local Notion automation.

When that happens:
1. Create a project-scoped Notion integration in the Notion UI.
2. Share it to `Projects > <Project Name>` only.
3. Store the token locally as `<PROJECT_NAME>_NOTION_TOKEN`.
4. Run:

```bash
npm run verify-project -- --name "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

## Suggested repo note

If a fresh repo wants to document this boundary in its own `AGENTS.md` or onboarding docs, use wording close to:

> Use `C:\\SNPM` for Infrastructure HQ Notion bootstrap, verification, routing, and approved live mutations. Do not vendor SNPM scripts, workspace ids, workspace config, starter-tree config, or Notion page ids into this repo. Start with `Set-Location C:\\SNPM` and `npm run discover -- --project "Project Name"`. Use `recommend` or `plan-change` when the owning surface is unclear. Set up a project-scoped Notion token only if this repo later needs its own Notion automation.

For the fuller fresh-agent handoff, see [agent quickstart](./agent-quickstart.md).
