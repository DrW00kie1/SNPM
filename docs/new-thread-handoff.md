# New Thread Handoff

You own the `SNPM` repo, which is the canonical home for Infrastructure HQ Notion automation.

Remote:
- `https://github.com/DrW00kie1/SNPM`

## Ground rules

- Preserve validated project bootstrap and approved-surface mutation behavior.
- Use the CLI help and capability registry before assuming a command shape.
- Do not confuse roadmap ideas with shipped capability when operating a live workspace.
- Keep local task memory out of git and publish durable operations state through the managed Notion surfaces.

## External usage model

Source-checkout mode:
- Fresh project threads should use `C:\\SNPM` as the local control repo for Notion bootstrap.
- Outside repos should not vendor the bootstrap logic, workspace ids, or starter-tree config.
- Bootstrap is the day-zero requirement; project-token setup is deferred until repo-local Notion automation is needed.
- Fresh agents in other repos should start with:

```powershell
Set-Location C:\SNPM
npm run discover -- --project "Project Name"
```

Installed CLI mode:
- Installed mode is the target after package metadata is public-ready.
- Agents should run the installed executable from the consumer repo instead of vendoring SNPM or switching into a source checkout.
- Real workspace config must come from private operator state, normally through `SNPM_WORKSPACE_CONFIG_DIR`.
- Installed-mode first contact is:

```powershell
snpm discover --project "Project Name"
```

- Use `doctor` after discovery for the read-only project health scan.
- Use `recommend` or `plan-change` when the owning Notion-vs-repo surface is unclear.
- See [`docs/agent-quickstart.md`](./agent-quickstart.md) for the consumer-repo `AGENTS.md` snippet.

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
- gate installed/public use on an explicit packed-file allowlist that excludes private config, task memory, local mutation artifacts, env files, and browser/auth state

Canonical roadmap:
- [`docs/operator-roadmap.md`](./operator-roadmap.md)

## Cleanup Boundary

- Real workspace page ids live in private local config, not in the public repo.
- Local planning notes, research scratchpads, and task lessons stay untracked unless deliberately promoted into product docs.
