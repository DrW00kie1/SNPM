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
npm run secret-record-create -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record-shell.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run secret-record-generate -- --project "Project Name" --domain "App & Backend" --title "DATABASE_URL" --mode create --project-token-env PROJECT_NAME_NOTION_TOKEN --apply -- node scripts/generate-dsn.mjs
npm run secret-record-generate -- --project "Project Name" --domain "App & Backend" --title "DATABASE_URL" --mode update --project-token-env PROJECT_NAME_NOTION_TOKEN --apply -- node scripts/rotate-dsn.mjs
npm run secret-record-adopt -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run secret-record-pull -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --output secret-record-redacted.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run secret-record-exec -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --env-name GEMINI_API_KEY --project-token-env PROJECT_NAME_NOTION_TOKEN -- node scripts/use-secret.mjs
```

Access token commands:

```bash
npm run access-token-create -- --project "Project Name" --domain "App & Backend" --title "Project Token" --file access-token-shell.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run access-token-generate -- --project "Project Name" --domain "App & Backend" --title "Project Token" --mode create --project-token-env PROJECT_NAME_NOTION_TOKEN --apply -- node scripts/generate-project-token.mjs
npm run access-token-generate -- --project "Project Name" --domain "App & Backend" --title "Project Token" --mode update --project-token-env PROJECT_NAME_NOTION_TOKEN --apply -- node scripts/rotate-project-token.mjs
npm run access-token-adopt -- --project "Project Name" --domain "App & Backend" --title "Project Token" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run access-token-pull -- --project "Project Name" --domain "App & Backend" --title "Project Token" --output access-token-redacted.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run access-token-exec -- --project "Project Name" --domain "App & Backend" --title "Project Token" --stdin-secret --project-token-env PROJECT_NAME_NOTION_TOKEN -- node scripts/read-token-from-stdin.mjs
```

Managed workflow rules:

- use `create` for new managed pages
- use `adopt` only for existing headerless pages
- use `secret-record-exec` and `access-token-exec` for runtime secret consumption
- use `secret-record-generate` and `access-token-generate` when an agent-generated value must be stored in Notion without putting the value in chat, CLI flags, local files, sidecars, diffs, review artifacts, or journals
- default `secret-record-pull` and `access-token-pull` output is redacted-only and is not push-ready
- raw local export, local markdown diff, push, and edit are unsupported for secret-bearing records
- if a domain page does not exist, create or adopt the domain first
- SNPM-managed Access records stay inside `Projects > <Project> > Access`

Write-only generated ingestion path:

```bash
npm run secret-record-generate -- --project "Project Name" --domain "App & Backend" --title "DATABASE_URL" --mode create --project-token-env PROJECT_NAME_NOTION_TOKEN --apply -- node scripts/generate-dsn.mjs
npm run access-token-generate -- --project "Project Name" --domain "App & Backend" --title "Project Token" --mode update --project-token-env PROJECT_NAME_NOTION_TOKEN --apply -- node scripts/rotate-project-token.mjs
```

Generated-ingestion rules:
- omit `--apply` for preview; preview validates the domain and target mode but does not run the generator
- put the generator command after the literal `--` delimiter
- the generator must produce exactly one valid single-line value on stdout and no stderr
- `--mode create` fails if the record already exists; `--mode update` fails if the record is missing, unmanaged, stale, archived, or malformed
- SNPM stores the generated value directly in the Notion record and suppresses/redacts child output
- generated values are never written to local markdown files, metadata sidecars, review artifacts, terminal output, or mutation journal entries
- raw input through chat, CLI flags, stdin, env vars, or local files is not a supported ingestion path

Consume-only execution path:

```bash
npm run secret-record-exec -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --env-name GEMINI_API_KEY --project-token-env PROJECT_NAME_NOTION_TOKEN -- node scripts/use-secret.mjs
npm run access-token-exec -- --project "Project Name" --domain "App & Backend" --title "Project Token" --stdin-secret --project-token-env PROJECT_NAME_NOTION_TOKEN -- node scripts/read-token-from-stdin.mjs
```

Consume-only rules:
- use `--env-name ENV_NAME` to inject the raw value into the child process environment
- use `--stdin-secret` to pass the raw value to the child process on stdin
- place the child command after a literal `--` delimiter
- SNPM does not write raw secret markdown files, sidecars, review artifacts, or mutation journal entries for exec
- child stdout and stderr are redacted if they contain the exact secret value

## Body Ownership

Access domain, secret record, and token record pages use the standard SNPM-managed header above the divider.

The synced file owns only the body below that header.

Managed Access pages are marked `Sensitive: yes`.
