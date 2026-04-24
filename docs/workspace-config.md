# Workspace Config Ownership

Workspace configuration lives in:

`config/workspaces/infrastructure-hq.json`

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
- `optionalSurfaces`
- `truthBoundaries`

A policy-pack change is a contract change, not a free-form workspace rewrite.

Rules:
- keep secrets out of config
- update ids deliberately when the live workspace changes
- treat starter-tree changes as contract changes that must be validated against the live workspace
- do not use policy-pack config to claim drift audits, consistency checks, starter-doc scaffolding, or broad batch apply without a separate approved implementation
