# Migration Guidance

This doc describes the read-only migration-guidance layer built on top of `doctor` and `recommend`.

Scope:
- current stable baseline: `main`
- the guidance layer is part of `main`
- the guidance layer does not mutate Notion by itself

How to use it:
- `doctor --project "<Project>" --project-token-env TOKEN_ENV` now returns a top-level `migrationGuidance` array when it sees recurring legacy patterns
- `recommend --intent ...` now adds targeted `migrationGuidance` when a requested runbook or Access target needs an adopt-first, create-first, or write-only generated-ingestion path
- the guidance entries are reusable summaries, not copies of raw `issues` or `adoptable` output

## RC-Supported Patterns

### `unmanaged-runbook`
- Detected when: a runbook already exists under `Runbooks` but is not SNPM-managed yet.
- Why it exists: real projects often had useful runbooks before the managed header and canonical-source contract existed.
- Exact next command: `npm run runbook-adopt -- --project "Project Name" --title "Runbook Title" --project-token-env PROJECT_NAME_NOTION_TOKEN`
- Manual steps: none.
- Verify afterward: rerun `doctor`, then `runbook-pull` or `runbook-diff` on the adopted runbook.

### `unmanaged-access-domain`
- Detected when: an Access domain page already exists directly under `Projects > <Project> > Access` but is not managed yet.
- Why it exists: teams often created useful Access organization pages manually before the managed Access surface shipped.
- Exact next command: `npm run access-domain-adopt -- --project "Project Name" --title "App & Backend" --project-token-env PROJECT_NAME_NOTION_TOKEN`
- Manual steps: none.
- Verify afterward: rerun `doctor`, then `access-domain-pull` or `access-domain-diff`.

### `unmanaged-secret-record`
- Detected when: a secret page exists under an Access domain but is not managed yet.
- Why it exists: teams stored canonical secrets in the right place before SNPM had a first-class secret-record flow.
- Exact next command: `npm run secret-record-adopt -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --project-token-env PROJECT_NAME_NOTION_TOKEN`
- Manual steps: none.
- Verify afterward: rerun `doctor`, then use `secret-record-exec` for runtime consumption. `secret-record-pull` is redacted-only, and raw local export/edit/diff/push are unsupported for secret-bearing records.

### `unmanaged-access-token`
- Detected when: a token page exists under an Access domain but is not managed yet.
- Why it exists: the project-local token is already stored canonically in Notion, but it predates the managed token record contract.
- Exact next command: `npm run access-token-adopt -- --project "Project Name" --domain "App & Backend" --title "Project Token" --project-token-env PROJECT_NAME_NOTION_TOKEN`
- Manual steps: none.
- Verify afterward: rerun `doctor`, then use `access-token-exec` for runtime consumption. `access-token-pull` is redacted-only, and raw local export/edit/diff/push are unsupported for secret-bearing records.

### `project-token-not-checked`
- Detected when: `doctor` found actionable project-local work, but you did not provide `--project-token-env`.
- Why it exists: the workspace token can read the project, but SNPM has not confirmed that the project-local integration can see the same surfaces.
- Exact next command: `npm run doctor -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN`
- Manual steps: share the project-local integration with the project subtree before relying on mutation workflows.
- Verify afterward: rerun `doctor` with the project token and confirm the guidance entry disappears.

## Conditional Patterns

### `missing-builds-surface`
- Detected when: `Ops > Builds` is absent.
- Why it exists: build records are still conditional support, not part of the RC line.
- Exact next command: `npm run build-record-create -- --project "Project Name" --title "Build Record Title" --file build-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN`
- Manual steps: none, unless the project is intentionally not using build records yet.
- Verify afterward: rerun `doctor` and confirm the Builds guidance is gone or intentionally deferred.

### `unmanaged-build-record`
- Detected when: a build record already exists under `Ops > Builds`, but SNPM does not manage it.
- Why it exists: build records shipped later and still have no `adopt` path.
- Exact next command: `npm run build-record-create -- --project "Project Name" --title "Existing Build Title" --file build-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN`
- Manual steps: manually migrate the legacy build content into the new managed build record.
- Verify afterward: rerun `doctor` and confirm the unmanaged build-record guidance is gone.

### `missing-validation-sessions-surface`
- Detected when: `Ops > Validation > Validation Sessions` is absent.
- Why it exists: validation sessions remain conditional support outside the RC contract.
- Exact next command: `npm run validation-sessions-init -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN`
- Manual steps: none, unless the project is intentionally not using validation-session reporting yet.
- Verify afterward: rerun `doctor` and confirm the missing-surface guidance is gone.

### `untitled-validation-session-row`
- Detected when: a validation-session row exists without a `Name` title.
- Why it exists: SNPM cannot generate a stable adopt command for a row that has no title.
- Exact next command: `npm run doctor -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN`
- Manual steps: set a `Name` title on the row in Notion first, then rerun `doctor` to get the next adopt guidance.
- Verify afterward: rerun `doctor` and confirm the untitled-row guidance is replaced by either a clean state or an adoptable row.

## Recommend-Only Access Case

### Missing Access Domain
- `recommend --intent secret ...` or `recommend --intent token ...` can return targeted migration guidance even when `doctor` has no project-wide legacy issue yet.
- This happens when the requested Access domain does not exist at all.
- Exact next command: `npm run access-domain-create -- --project "Project Name" --title "App & Backend" --file access-domain.md --project-token-env PROJECT_NAME_NOTION_TOKEN`
- Verify afterward: rerun the same `recommend --intent ...` request and confirm it moves to create/adopt/generate plus exec/redacted-pull guidance for the nested record.

### Generated Secret Or Token
- `recommend --intent secret ...` or `recommend --intent token ...` can route agent-generated credentials to write-only ingestion when the value should originate from a local generator command.
- This is for cases such as an agent creating a PostgreSQL DSN or rotating a project token without pasting the value into chat and without writing raw local files.
- Exact next command for a new secret: `npm run secret-record-generate -- --project "Project Name" --domain "App & Backend" --title "DATABASE_URL" --mode create --project-token-env PROJECT_NAME_NOTION_TOKEN --apply -- node scripts/generate-dsn.mjs`
- Exact next command for an existing token rotation: `npm run access-token-generate -- --project "Project Name" --domain "App & Backend" --title "Project Token" --mode update --project-token-env PROJECT_NAME_NOTION_TOKEN --apply -- node scripts/rotate-project-token.mjs`
- Manual steps: review the generator command itself; do not paste the generated raw value into chat, CLI flags, stdin, env vars, or local files.
- Verify afterward: use `secret-record-exec` or `access-token-exec` for runtime consumption. Pulls remain redacted-only, and raw local export/edit/diff/push remain unsupported for secret-bearing records.
