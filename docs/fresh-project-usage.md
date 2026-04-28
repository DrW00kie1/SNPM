# Fresh Project Usage

SNPM can be used from a Codex thread attached to a different repo in source-checkout mode as long as `C:\\SNPM` is available locally. After the package is public-ready, installed CLI mode can run the same command surface from the consumer repo without vendoring SNPM.

This page describes the current shipped cross-repo bootstrap flow. For the broader planned operator model, see [operator roadmap](./operator-roadmap.md).

## Day-zero workflow

### Source checkout mode

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

### Installed CLI mode

Installed mode is the target once the package exposes a public-ready executable and packed-file allowlist. In that mode, do not switch to `C:\\SNPM` and do not copy SNPM into the consumer repo. Run the installed command from the consumer repo:

```powershell
snpm discover --project "Project Name"
snpm doctor --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

Installed mode must use private operator config outside the package:

```powershell
$env:SNPM_WORKSPACE_CONFIG_DIR = "C:\path\to\private\workspace-configs"
```

Use source checkout mode until installed CLI packaging has passed `npm pack --dry-run` review and the published package excludes private workspace config and local artifacts.

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

The installed package also must not carry private workspace config. Treat `SNPM_WORKSPACE_CONFIG_DIR` as the normal installed-mode boundary for real page ids.

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

> Use SNPM for Infrastructure HQ Notion bootstrap, verification, routing, and approved live mutations. In source-checkout mode, start with `Set-Location C:\\SNPM` and `npm run discover -- --project "Project Name"`. In installed CLI mode, run `snpm discover --project "Project Name"` from this repo and set `SNPM_WORKSPACE_CONFIG_DIR` to the private operator config directory. Do not vendor SNPM scripts, workspace ids, workspace config, starter-tree config, or Notion page ids into this repo. Use `recommend` or `plan-change` when the owning surface is unclear. Set up a project-scoped Notion token only if this repo later needs its own Notion automation.

For the fuller fresh-agent handoff, see [agent quickstart](./agent-quickstart.md).
