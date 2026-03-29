# Project Access Workflows

Use this page when a project needs project-local access records under:

- `Projects > <Project> > Access`

This surface is project-owned. Do not use `Access Index` for project-local secrets or tokens.

## Current Manual Workflow

Use the live template library at:

- `Templates > Misc Templates > Project Subpage Templates`

Current template set:

- `Access Domain Template`
- `Secret Record Template`
- `Access Token Record Template`

Contour-style manual path for a service secret:

1. Open `Projects > Contour > Access`.
2. Create `App & Backend` from `Access Domain Template`.
3. Create `GEMINI_API_KEY` as a child page under `App & Backend` from `Secret Record Template`.
4. Keep the raw value on the child record page, not on the `Access` root page.

Manual path for a project token record:

1. Open `Projects > <Project> > Access`.
2. Create or open the relevant domain page such as `App & Backend`.
3. Create a child page from `Access Token Record Template`.
4. Record the token scope, shared root, environment variable, raw value, and rotation path on that child page.

Manual rules:

- direct children of the `Access` root are domain pages only
- secret and token records belong under a domain page
- project-token writes stay inside `Projects > <Project> > Access`
- `Access Index` stays out of scope for this workflow

## Managed SNPM Workflow

SNPM now ships first-class managed commands for the same Access model.

Access domain commands:

```bash
npm run access-domain-create -- --project "Project Name" --title "App & Backend" --file access-domain.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run access-domain-adopt -- --project "Project Name" --title "App & Backend" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run access-domain-pull -- --project "Project Name" --title "App & Backend" --output access-domain.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run access-domain-diff -- --project "Project Name" --title "App & Backend" --file access-domain.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run access-domain-push -- --project "Project Name" --title "App & Backend" --file access-domain.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

Secret record commands:

```bash
npm run secret-record-create -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run secret-record-adopt -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run secret-record-pull -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --output secret-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run secret-record-diff -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run secret-record-push -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

Access token commands:

```bash
npm run access-token-create -- --project "Project Name" --domain "App & Backend" --title "Project Token" --file access-token.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run access-token-adopt -- --project "Project Name" --domain "App & Backend" --title "Project Token" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run access-token-pull -- --project "Project Name" --domain "App & Backend" --title "Project Token" --output access-token.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run access-token-diff -- --project "Project Name" --domain "App & Backend" --title "Project Token" --file access-token.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run access-token-push -- --project "Project Name" --domain "App & Backend" --title "Project Token" --file access-token.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
```

Managed workflow rules:

- use `create` for new managed pages
- use `adopt` only for existing headerless pages
- use the pulled file as the editing base before later `diff` or `push`
- if a domain page does not exist, create or adopt the domain first
- SNPM-managed Access records stay inside `Projects > <Project> > Access`

Pipe-friendly core-band path:

```bash
npm run secret-record-pull -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --output - --project-token-env PROJECT_NAME_NOTION_TOKEN \
  | npm run secret-record-push -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file - --project-token-env PROJECT_NAME_NOTION_TOKEN
```

Core-band stdin/stdout rules:
- use `--output -` on Access pull commands to stream the managed body to stdout
- use `--file -` on Access create, diff, and push commands to read markdown from stdin
- when `--output -` is used, SNPM writes the markdown body to stdout and the structured success metadata to stderr so shell pipelines stay clean

## Body Ownership

Access domain, secret record, and token record pages use the standard SNPM-managed header above the divider.

The synced file owns only the body below that header.

Managed Access pages are marked `Sensitive: yes`.
