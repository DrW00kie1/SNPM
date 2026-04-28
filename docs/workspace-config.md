# Workspace Config Ownership

In source-checkout mode, workspace configuration lives in:

`config/workspaces/infrastructure-hq.json`

The real workspace config is private local operator state and is ignored by git. The public repo ships `config/workspaces/infrastructure-hq.example.json` with placeholder page ids. Copy that file to `config/workspaces/infrastructure-hq.json` and replace every placeholder before running live SNPM commands.

For automation, tests, installed CLI use, or source checkouts that keep private config outside the repo, set:

```powershell
$env:SNPM_WORKSPACE_CONFIG_DIR = "C:\path\to\private\workspaces"
```

SNPM will then load `<workspace>.json` from that directory.

In installed CLI mode, `SNPM_WORKSPACE_CONFIG_DIR` is the expected boundary for real page ids. The package must not include private workspace config, and operators should keep the config directory in local private storage rather than inside a consumer repo.

It currently owns:
- Notion API version
- `Projects` page id
- `Project Templates` page id
- curated workspace/template managed-doc registry
- forbidden-scope page ids used in project-token verification
- the expected project starter tree shape

## Policy-pack foundation

The policy-pack foundation treats the current config as the source material for reusable Infrastructure HQ policy. In this foundation slice, policy means the approved structure and routing boundaries SNPM already enforces:
- `workspace.managedDocs` exact pages and subtree roots
- `workspace.forbiddenScopePageIds`
- `projectStarter.children`
- reserved roots derived from the starter tree for managed-doc routing

The existing JSON shape remains valid. When a top-level `policyPack` is omitted, SNPM derives a v1 policy pack from the fields above. An explicit `policyPack` may be used when policy needs to be reviewed directly; its v1 fields are:
- `version`
- `reservedProjectRoots`
- `approvedPlanningPages`
- `curatedWorkspaceDocs`
- `curatedTemplateDocs`
- `projectStarterRoots`
- `starterDocScaffold`
- `optionalSurfaces`
- `truthBoundaries`

A policy-pack change is a contract change, not a free-form workspace rewrite.

## Starter doc scaffold policy

`policyPack.starterDocScaffold` is optional. When it is omitted, SNPM uses the built-in Infrastructure HQ starter scaffold:
- `Root > Overview`
- `Root > Operating Model`
- `Planning > Roadmap`
- `Planning > Current Cycle`

The scaffold policy is consumed by `scaffold-docs`, not by `create-project`. `scaffold-docs` previews the starter plan by default and writes local draft files only when `--output-dir` is supplied. It never mutates Notion directly; use the generated owning `doc-*` or `page-*` commands after review.

Each scaffold entry is policy contract data. It must have a stable id, a supported kind, an approved target path, a relative file path, and a built-in template id. Supported kinds are:
- `project-doc` for approved project managed-doc targets
- `planning-page` for approved planning pages

Validation rejects duplicate ids, duplicate files, duplicate targets, unsupported kinds, unsupported targets, raw Notion ids, globs, absolute file paths, and path escapes.

Example policy shape:

```json
{
  "policyPack": {
    "version": 1,
    "starterDocScaffold": [
      {
        "id": "root-overview",
        "kind": "project-doc",
        "target": "Root > Overview",
        "file": "docs/project-overview.md",
        "templateId": "project-overview"
      },
      {
        "id": "planning-roadmap",
        "kind": "planning-page",
        "target": "Planning > Roadmap",
        "file": "planning/roadmap.md",
        "templateId": "planning-roadmap"
      }
    ]
  }
}
```

Rules:
- keep secrets out of config
- update ids deliberately when the live workspace changes
- treat starter-tree changes as contract changes that must be validated against the live workspace
- do not use policy-pack config to claim drift audits, consistency checks, hidden Notion mutation, or broad batch apply without a separate approved implementation
