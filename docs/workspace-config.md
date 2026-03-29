# Workspace Config Ownership

Workspace configuration lives in:

`config/workspaces/infrastructure-hq.json`

It currently owns:
- Notion API version
- `Projects` page id
- `Project Templates` page id
- forbidden-scope page ids used in project-token verification
- the expected project starter tree shape

Rules:
- keep secrets out of config
- update ids deliberately when the live workspace changes
- treat starter-tree changes as contract changes that must be validated against the live workspace

