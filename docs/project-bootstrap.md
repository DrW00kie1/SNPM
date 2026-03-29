# Project Bootstrap

SNPM is the canonical way to create a new Infrastructure HQ project subtree.

## Create a project

```bash
npm run create-project -- --name "Project Name"
```

This command:
- reads `Templates > Project Templates`
- creates `Projects > <Project Name>`
- preserves page icons and covers when available
- rewrites `Canonical Source`
- refreshes `Last Updated`

## Verify a project

```bash
npm run verify-project -- --name "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

This verifies:
- starter tree shape
- page icon presence
- canonical-source rewrites
- optional project-token scope boundaries when the project token env var is provided

