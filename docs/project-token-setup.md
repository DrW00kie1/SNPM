# Project Token Setup

Project creation is automated in SNPM. Project-scoped Notion integration creation is still a manual UI step.

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

