# Project Token Setup

Project creation is automated in SNPM. Project-scoped Notion integration creation is still a manual UI step.

This page documents the current shipped token-setup flow. For the broader planned operator direction, see [operator roadmap](./operator-roadmap.md).

## Day-zero expectation

A fresh repo does not need a project-scoped token just to start using SNPM.

Day-zero flow:
- run `npm run create-project -- --name "Project Name"` from `C:\\SNPM`
- use the created Notion subtree for project planning and operations
- stop there unless the repo already needs Notion API automation

Only set up a project token when the repo needs its own Notion integration.

## Flow

1. Run the SNPM bootstrap command to create `Projects > <Project Name>`.
2. Create a project-scoped Notion integration in the Notion UI.
3. Share that integration to `Projects > <Project Name>`.
4. Store the token locally as `<PROJECT_NAME>_NOTION_TOKEN`.
5. Run `npm run verify-project -- --name "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN`.

## Scope rule

The project integration should be shared to the project root only, not to:
- `Home`
- `Access Index`
- top-level `Runbooks`
- top-level `Vendors`
