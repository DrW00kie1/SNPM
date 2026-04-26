# Agent Quickstart

Use this when a fresh Codex thread in another repo needs Infrastructure HQ Notion context without reading the whole SNPM repo.

## First Contact

Run SNPM from the local control repo:

```powershell
Set-Location C:\SNPM
npm run discover -- --project "Project Name"
```

`discover` prints compact JSON only. It tells the agent what SNPM is, where to run it, which boundaries not to cross, and which safe command to run next.

## Consumer Repo Pointer

Use wording like this in a project `AGENTS.md` when that repo uses Infrastructure HQ Notion state:

~~~markdown
Use `C:\SNPM` for Infrastructure HQ Notion bootstrap, verification, routing, and approved live mutations.
Do not vendor SNPM scripts, workspace ids, workspace config, starter-tree config, or Notion page ids into this repo.
Start with:

```powershell
Set-Location C:\SNPM
npm run discover -- --project "Project Name"
```

Use `recommend` or `plan-change` when the owning surface is unclear.
~~~

## Safe First Commands

```powershell
Set-Location C:\SNPM
npm run discover -- --project "Project Name"
npm run doctor -- --project "Project Name"
npm run recommend -- --project "Project Name" --intent planning --page "Roadmap"
npm run plan-change -- --targets-file plan-targets.json --project "Project Name"
```

Add `--project-token-env PROJECT_NAME_NOTION_TOKEN` after a project-scoped integration exists and is shared to the project subtree.

## Boundaries

- `discover` does not read Notion, write files, write sidecars, mutate Notion, or append journal entries.
- `capabilities` remains the full machine-readable command map for deep inspection after first contact.
- Code-coupled docs, implementation notes, tests, and shipped behavior stay in the consumer repo.
- Approved planning pages, managed docs, runbooks, Access records, and durable project operations state stay in Notion and are mutated only through the owning SNPM command family.
