# SNPM

SNPM is the canonical home for Infrastructure HQ Notion automation.

It is intentionally opinionated:
- approved-surface mutation only
- project-token-safe paths where possible
- deterministic routing before mutation
- body-only markdown sync on curated surfaces

## Public Setup

This repo does not commit real Infrastructure HQ Notion page ids or operator task memory.

Before running live commands, copy `config/workspaces/infrastructure-hq.example.json` to `config/workspaces/infrastructure-hq.json`, replace the placeholder page ids, and keep the private file untracked. If your private configs live outside the repo, set `SNPM_WORKSPACE_CONFIG_DIR` to the directory that contains `<workspace>.json`.

## Current Surface

Supported narrow-band baseline on this active line:
- `create-project`
- `verify-project`
- planning-page sync for the four approved planning pages
- managed runbooks
- managed Access records
- low-ceremony edit loops via `page-edit`, `runbook-edit`, `doc-edit`, and `access-domain-edit`
- consume-only secret runtime helpers via `secret-record-exec` and `access-token-exec`
- write-only generated secret/token ingestion via `secret-record-generate` and `access-token-generate`
- curated managed docs for:
  - project root docs
  - `Templates > Project Templates` and its non-reserved descendants
  - a small named set of workspace-global docs
- `capabilities` for LLM-readable command discovery
- `discover` for compact fresh-agent first contact
- read-only `plan-change` for deterministic routing before mutation
- strict pull metadata sidecars and stale-write protection for managed apply paths
- local redacted mutation journal entries for applied mutations
- `doc-create`, `doc-adopt`, `doc-pull`, `doc-diff`, `doc-push`
- `verify-workspace-docs`
- `doctor`
- read-only `doctor --truth-audit` for truth-quality audit findings
- read-only `doctor --consistency-audit` for advisory cross-document contradiction findings
- intent-driven `recommend`
- `recommend --intent project-doc|template-doc|workspace-doc`
- stdin/stdout ergonomics on the core band
- EOF-stable round-trips on managed planning, runbook, Access, and build-record pages
- manifest v2 mixed-surface comparison through `sync check`
- manifest v2 local-file refresh through `sync pull`, including per-entry sidecar metadata
- guarded manifest v2 `sync push` for approved existing targets with stale-write protection

Recently promoted bootstrap doc scaffolding:
- `scaffold-docs` consumes the promoted policy-pack foundation instead of hardcoding a one-off bootstrap shape
- workspace config can derive starter scaffold policy from the existing fields or declare an explicit optional `policyPack` v1 object for reviewable policy changes
- optional `policyPack.starterDocScaffold` declares starter documentation drafts for approved project docs and planning pages
- `scaffold-docs` is preview-first, prints JSON by default, writes local drafts only with `--output-dir`, and never mutates Notion directly
- the scaffold surface stays constrained to approved `project-doc` and `planning-page` starter targets
- built-in starter defaults cover `Root > Overview`, `Root > Operating Model`, `Planning > Roadmap`, and `Planning > Current Cycle`
- policy packs do not add drift or staleness audit, cross-document consistency checks, manifest create/adopt, rollback, retries, transaction semantics, or broad batch apply

Recently promoted manifest v2 diagnostics behavior on `main`:
- manifest v2 diagnostics are documented consistently in CLI help, capability metadata, and operator docs as structured result/review metadata for check and push, and structured result metadata for pull
- diagnostics include stable codes, severity, entry/target context, a safe next command, and a recovery action

Plan-change manifest draft behavior:
- `plan-change --manifest-draft` is a preview-only, read-only planner integration for drafting manifest v2 entries from approved plan targets
- supported draft targets are `planning-page`, `project-doc`, `template-doc`, `workspace-doc`, and `runbook`
- unsupported draft targets include Access records, build records, create/adopt targets, arbitrary page IDs, and any surface outside approved manifest v2 entries
- the planner does not write manifest files, local page files, sidecars, review artifacts, journals, or Notion content, and it does not apply or batch changes

Recently promoted manifest v2 targeted-review behavior on `main`:
- manifest v2 `sync check`, `sync pull`, and `sync push` can target entries with `--entry <selector>` or `--entries-file <path>`
- manifest v2 `sync push` can write preview artifacts with `--review-output <dir>`
- manifest v2 `sync push --apply` defaults to at most one changed entry and requires `--max-mutations <n>` or `--max-mutations all` for broader applies
- opt-in manifest v2 `sync push --apply --refresh-sidecars` refreshes sidecar metadata only for selected entries that were applied successfully
- default manifest v2 `sync push --apply` still leaves sidecars stale

Recently promoted truth-quality audit behavior on `main`:
- `doctor --truth-audit` is read-only and project-scoped
- the audit reports stale managed-page `Last Updated` values, placeholder or empty content on important project surfaces, and freshness concerns for `Planning > Roadmap` and `Planning > Current Cycle`
- truth-audit findings are advisory project-health output; they do not mutate Notion, rewrite pages, refresh sidecars, apply manifests, or perform cross-document semantic consistency checks

Current consistency-audit branch behavior:
- `doctor --consistency-audit` and `npm run consistency-audit` are read-only and project-scoped
- the audit reports explicit contradictions across approved project surfaces, including Roadmap/Current Cycle alignment and explicit Runbook or Access references when those references can be resolved structurally
- consistency-audit findings are advisory only; they do not mutate Notion, write local files, write sidecars, append mutation journal entries, apply manifests, inspect raw Access secret/token bodies, generate fixes, change default `doctor` output, change top-level `ok` or exit behavior, or block ordinary safe mutations

Generated-secret ingestion behavior carried into this branch:
- `secret-record-generate` and `access-token-generate` are apply-gated write-only commands for agent-generated credentials
- preview mode validates target state and does not run the generator
- `--apply` runs one child generator command, captures stdout in memory, stores the generated value in Notion, and suppresses/redacts child output
- the generated value is never written to local markdown, sidecars, review artifacts, stdout, stderr, or mutation journal entries
- raw local export, local secret-bearing diff, push, and edit remain unsupported

Specialized or experimental lanes:
- build records and validation sessions are supported narrow project-operation surfaces; keep them on their command families instead of treating them as generic managed docs
- v1 validation-session manifest sync remains a specialized artifact-sync lane, not the generalized bundle workflow
- manifest v2 create/adopt, Access/build-record entries, rollback, auto-merge, automatic retries, arbitrary CRUD, semantic consistency checks, generic transaction semantics, and generic batch apply
- policy-pack-driven mutation, hard/blocking cross-document consistency gates, and broad batch apply
- experimental `validation-bundle` Chromium UI automation

## Managed-Doc Boundary

The new managed-doc surface is curated, not arbitrary.

The policy-pack foundation keeps this boundary reusable instead of hiding it in one-off helpers. The current policy names the same reserved roots and curated workspace/template docs listed below; changing those rules is a policy change that must be reviewed, tested, and verified against the live workspace.

Project-scoped managed docs:
- `Root`
- `Root > ...` under non-reserved top-level names
- planning pages remain on `page-*` as a compatibility surface

Starter scaffolding follows the same surface split. `Root > Overview` and `Root > Operating Model` are managed-doc targets, while `Planning > Roadmap` and `Planning > Current Cycle` remain planning-page targets rather than `doc-*` targets.

Curated docs are for operator and workflow context. Fast-changing implementation notes, design specs, investigations, and task breakdowns stay repo-first.

Workspace/template managed docs:
- exact workspace-global pages:
  - `Infrastructure HQ Home`
  - `Projects`
  - `Templates`
  - `Runbooks > Notion Workspace Workflow`
  - `Runbooks > Notion Project Token Setup`
- subtree root:
  - `Templates > Project Templates`

Reserved roots stay on their owning surfaces:
- `Planning` -> `page-*`
- `Runbooks` -> `runbook-*`
- `Access` -> `access-domain-*`, `secret-record-*`, `access-token-*`
- `Ops`
- `Vendors`
- `Incidents`

The managed-doc contract is the same body-only contract used elsewhere:
- preserve the page header above `---`
- manage the editable body below it
- rewrite `Canonical Source` and `Last Updated`
- keep newline handling stable on pull, diff, and push

## Commands

Fresh-agent first contact from another repo:

```powershell
Set-Location C:\SNPM
npm run discover -- --project "Project Name"
```

`discover` is the compact starting point for a new Codex thread. It prints JSON only, identifies SNPM as the Infrastructure HQ Notion control repo, points the agent at `C:\SNPM`, states the no-vendoring boundary, and lists safe next commands such as `doctor`, `recommend`, and `plan-change`. Use `capabilities` only when the full command map is needed after first contact.

Create a new project subtree:

```bash
npm run create-project -- --name "Project Name"
```

Verify a project subtree:

```bash
npm run verify-project -- --name "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

Preview starter documentation drafts after bootstrap:

```bash
npm run scaffold-docs -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run scaffold-docs -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --output-dir .snpm-scaffold
```

`scaffold-docs` reads `policyPack.starterDocScaffold` or the default starter scaffold policy and reports the starter docs it would seed. Without `--output-dir`, it prints JSON only. With `--output-dir`, it writes local draft markdown files, `scaffold-plan.json`, and planning-page metadata sidecars when live metadata is available. Notion mutation stays outside the scaffold command; review the generated plan and then run the owning `doc-create` or `page-push` commands explicitly.

Inspect a project safely before mutation:

```bash
npm run doctor -- --project "Project Name"
npm run doctor -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run doctor -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --truth-audit
npm run doctor -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --consistency-audit
npm run consistency-audit -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

`doctor --truth-audit` extends the read-only project health scan with truth-quality findings. Use it when the project shape is valid but the durable Notion truth may be stale or underfilled: old `Last Updated` headers, placeholder/empty important surfaces, and roadmap/current-cycle content that no longer looks current. It is an audit surface only; publish fixes through the owning `doc-*`, `page-*`, or `runbook-*` family after review.

`doctor --consistency-audit` extends the same read-only project health scan with advisory cross-document contradiction findings. Use it when the durable pages may disagree with each other: Roadmap and Current Cycle active markers, explicit runbook references, or explicit Access references. The audit uses managed page content plus structural Access inventory only; it does not inspect raw secret/token bodies and it does not change default doctor output, top-level `ok`, exit behavior, or blocking behavior. Publish any reviewed fixes through the owning command family.

Get a deterministic routing answer before editing:

```bash
npm run recommend -- --project "Project Name" --intent planning --page "Roadmap" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run recommend -- --project "Project Name" --intent runbook --title "Release Smoke Test" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run recommend -- --project "Project Name" --intent secret --domain "App & Backend" --title "GEMINI_API_KEY" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run recommend -- --project "Project Name" --intent project-doc --path "Root > Overview" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run recommend -- --intent template-doc --path "Templates > Project Templates > Onboarding Notes"
npm run recommend -- --intent workspace-doc --path "Runbooks > Notion Workspace Workflow"
npm run recommend -- --project "Project Name" --intent implementation-note --repo-path "notes/implementation.md"
npm run recommend -- --project "Project Name" --intent design-spec --repo-path "docs/design/spec.md"
npm run recommend -- --intent repo-doc --repo-path "docs/operator-roadmap.md"
```

Discover the CLI surface and inspect a proposed change plan:

```bash
npm run discover -- --project "Project Name"
npm run capabilities
node src/cli.mjs help doc
node src/cli.mjs help page
node src/cli.mjs help sync
node src/cli.mjs help secret-record
node src/cli.mjs help access-token
npm run plan-change -- --targets-file plan-targets.json --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run journal-list -- --limit 20
```

Family-level help is available for the advertised command families, including `doc`, `page`, `runbook`, `sync`, `validation-session`, `secret-record`, and `access-token`. Hyphenated npm scripts remain convenience wrappers around the canonical family commands.

`plan-change --manifest-draft` is still a planner, not a writer. It previews manifest v2 entries for approved existing surfaces so an operator can review the proposed bundle and then choose the next safe command. Supported manifest draft targets are `planning-page`, `project-doc`, `template-doc`, `workspace-doc`, and `runbook`. Access records, build records, validation-session artifacts, create/adopt entries, arbitrary page IDs, and generic workspace CRUD remain unsupported by the planner.

Safe next commands after reviewing a manifest draft are the read-only or explicitly local manifest v2 commands: `npm run sync-check -- --manifest <path>`, `npm run sync-pull -- --manifest <path>`, or `npm run sync-pull -- --manifest <path> --apply` when local files and sidecars are desired. Use `npm run sync-push -- --manifest <path>` only for a later preview against an operator-authored manifest file. Do not treat the planner output as an apply request.

Manifest v2 mixed-surface sync:

```bash
npm run sync-check -- --manifest C:\repo\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run sync-pull -- --manifest C:\repo\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run sync-push -- --manifest C:\repo\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run sync-push -- --manifest C:\repo\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --entry "planning-page:Planning > Roadmap" --review-output review\manifest
npm run sync-push -- --manifest C:\repo\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run sync-push -- --manifest C:\repo\snpm.sync.json --project-token-env PROJECT_NAME_NOTION_TOKEN --apply --entries-file review\selected-entries.json --max-mutations 3 --refresh-sidecars
```

Manifest v2 supports read-only comparison, local-file pull, guarded push, targeted entry selection, review artifacts, apply mutation limits, and opt-in post-push sidecar refresh for `planning-page`, `project-doc`, `template-doc`, `workspace-doc`, `runbook`, and `validation-session` entries. `sync check`, `sync pull`, and `sync push` operate on the whole manifest by default. Use `--entry <selector>` or a JSON `--entries-file <path>` to narrow the operation to selected entries. `sync pull` previews by default; with `--apply`, it writes the selected local markdown files and adjacent `<file>.snpm-meta.json` sidecars only. It does not mutate Notion and does not append local mutation journal entries.

Manifest v2 `sync push` is preview by default. The default preview still covers the whole manifest unless selectors are supplied. Add `--review-output <dir>` to write the preview summary and per-entry review artifacts without mutating Notion. `sync push --apply` requires the adjacent sidecar metadata produced by v2 `sync pull` and applies only if the target still matches the recorded editing base. Default apply allows at most one changed entry; use `--max-mutations <n>` or `--max-mutations all` only after reviewing a broader selected set.

A default successful `sync push --apply` makes affected sidecars stale because they describe the pre-push base revision. The next safe command is `sync pull --apply` to refresh the local files and sidecars before further edits. When the operator wants the applied push to refresh sidecar metadata to the post-push base, opt in with `sync push --apply --refresh-sidecars`; on selected applies, only selected sidecars for successfully applied entries are refreshed.

Manifest v2 recovery diagnostics are structured metadata, not mutation behavior. `sync check` and `sync push` can expose diagnostics in result/review metadata, while `sync pull` exposes result metadata. Diagnostics can include stable codes, severity, entry and target context, a safe next command, and a recovery action so operators can decide the next manual step without relying on terminal scrollback.

Manifest v2 does not support create/adopt, Access/build-record entries, rollback, auto-merge, automatic retries, arbitrary CRUD, semantic consistency checks, generic transaction semantics, or generic batch apply. `plan-change --manifest-draft` does not change that boundary: it writes no manifest file, local content file, sidecar, review artifact, journal entry, or Notion page, and it adds no audit gate or batch-apply lane. Sidecar refresh is never automatic on default v2 push; it only happens when `--refresh-sidecars` is included with `--apply`. Use the owning `page-*`, `doc-*`, `runbook-*`, or `validation-session-*` command family when that narrower surface is the better fit.

Planning-page sync remains available through `page-*`:

```bash
npm run page-pull -- --project "Project Name" --page "Planning > Roadmap" --output roadmap.md --metadata-output roadmap.meta.json
npm run page-diff -- --project "Project Name" --page "Planning > Roadmap" --file roadmap.md
npm run page-push -- --project "Project Name" --page "Planning > Roadmap" --file roadmap.md --metadata roadmap.meta.json --apply
npm run page-edit -- --project "Project Name" --page "Planning > Roadmap" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply --explain --review-output review\planning
```

Pipe-friendly planning-page loop:

```bash
npm run page-pull -- --project "Project Name" --page "Planning > Roadmap" --output - \
  | npm run page-push -- --project "Project Name" --page "Planning > Roadmap" --file -
```

Runbook workflow:

```bash
npm run runbook-create -- --project "Project Name" --title "Release Smoke Test" --file runbook.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run runbook-adopt -- --project "Project Name" --title "Legacy Runbook" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run runbook-pull -- --project "Project Name" --title "Release Smoke Test" --output runbook.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run runbook-diff -- --project "Project Name" --title "Release Smoke Test" --file runbook.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run runbook-push -- --project "Project Name" --title "Release Smoke Test" --file runbook.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run runbook-edit -- --project "Project Name" --title "Release Smoke Test" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply --explain --review-output review\runbook
```

Access workflow:

```bash
npm run access-domain-create -- --project "Project Name" --title "App & Backend" --file access-domain.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run access-domain-adopt -- --project "Project Name" --title "Legacy Access Domain" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run secret-record-create -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record-shell.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run secret-record-generate -- --project "Project Name" --domain "App & Backend" --title "DATABASE_URL" --mode create --project-token-env PROJECT_NAME_NOTION_TOKEN --apply -- node scripts/generate-dsn.mjs
npm run secret-record-adopt -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run secret-record-pull -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --output secret-record-redacted.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run secret-record-exec -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --env-name GEMINI_API_KEY --project-token-env PROJECT_NAME_NOTION_TOKEN -- node scripts/use-secret.mjs
npm run access-token-generate -- --project "Project Name" --domain "App & Backend" --title "Project Token" --mode update --project-token-env PROJECT_NAME_NOTION_TOKEN --apply -- node scripts/generate-project-token.mjs
npm run access-token-exec -- --project "Project Name" --domain "App & Backend" --title "Project Token" --stdin-secret --project-token-env PROJECT_NAME_NOTION_TOKEN -- node scripts/read-token-from-stdin.mjs
```

`secret-record-*` and `access-token-*` are secret-bearing surfaces with two safe lanes. Runtime consumption goes through `secret-record-exec` or `access-token-exec`, which injects the raw value into one child process and redacts child output. Agent-generated values go through `secret-record-generate` or `access-token-generate`; preview does not run the generator, and `--apply` stores one generated stdout value directly in Notion without writing raw local files, sidecars, diffs, review artifacts, stdout/stderr, or journal content. Pulls are redacted-only and do not create sidecars or push-ready editing bases. Raw local export, local markdown diff, push, and edit are unsupported for secret-bearing records.

Managed-doc workflow on `main`:

```bash
npm run doc-pull -- --project "Project Name" --path "Root" --output root.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run doc-create -- --project "Project Name" --path "Root > Overview" --file overview.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run doc-adopt -- --project "Project Name" --path "Root > Overview" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run doc-diff -- --project "Project Name" --path "Root > Overview" --file overview.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run doc-push -- --project "Project Name" --path "Root > Overview" --file overview.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run doc-edit -- --project "Project Name" --path "Root > Overview" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply --explain --review-output review\docs
```

Workspace/template doc examples:

```bash
npm run doc-pull -- --path "Templates > Project Templates" --output project-templates.md
npm run doc-pull -- --path "Runbooks > Notion Workspace Workflow" --output notion-workflow.md
npm run doc-adopt -- --path "Projects" --apply
npm run doc-push -- --path "Runbooks > Notion Workspace Workflow" --file notion-workflow.md --apply
npm run verify-workspace-docs
```

Experimental validation-session UI bundle lane on `main`:

```bash
npm run validation-bundle-login
npm run validation-bundle-preview -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run validation-bundle-apply -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run validation-bundle-verify -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

Use that Chromium-only lane only when the surrounding Notion UI bundle matters. The stable default remains `validation-sessions-verify --bundle` for the API-visible checks plus manual UI setup where needed.

Validation-session manifest v1 sync is documented separately from manifest v2. Use v1 only for repo-backed validation-session artifacts that need the specialized `sync-check`, `sync-pull`, or `sync-push` lane; use v2 when the goal is mixed-surface comparison, local-file refresh, or guarded existing-target push across approved surfaces. V1 validation-session sync remains a separate specialized artifact lane, not the generalized bundle workflow.

The file produced by `page-pull`, `runbook-pull`, access-domain pulls, `build-record-pull`, `validation-session-pull`, and `doc-pull` is the safe editing base. Secret-record and access-token pulls are redacted inspection artifacts only, not editing bases. For core-band and managed-doc flows:
- `--output -` streams the body to stdout
- `--file -` reads markdown from stdin
- structured success metadata goes to stderr when stdout is used for body output
- file pulls write `<output>.snpm-meta.json` by default; use `--metadata-output <path>` to override
- `--apply` push reads `<file>.snpm-meta.json` by default; use `--metadata <path>` to override
- `--file - --apply` requires explicit `--metadata <path>`
- applied Notion mutations append redacted operational entries to `%LOCALAPPDATA%\SNPM\journal.ndjson` unless `SNPM_JOURNAL_PATH` overrides it

## Testing

Stable baseline testing:
- use `main`

Historical pinned snapshot:
- `v0.1.0-rc.1`

Default repo checks:

```bash
npm test
node src/cli.mjs --help
```

Safe live SNPM checks:

```bash
npm run verify-project -- --name "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run doctor -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run doctor -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN --truth-audit
npm run consistency-audit -- --project "SNPM" --project-token-env SNPM_NOTION_TOKEN
npm run verify-workspace-docs
```

## Truth Boundary

Notion-primary:
- planning pages
- runbooks
- canonical Access records
- curated managed docs
- live operator inventory

Repo-primary:
- implementation notes
- design specs
- task breakdowns
- investigations
- code-coupled docs
- generated artifacts
- machine-owned outputs

Hybrid only when justified:
- validation-session artifacts and similar cases where repo sync adds value without duplicating the whole workflow

## Current Direction

Near-term direction:
- use the managed-doc surface to standardize remaining curated root, template, and workspace docs
- use read-only `doctor --truth-audit` to surface stale or underfilled durable Notion truth before editing
- use read-only `doctor --consistency-audit` to surface explicit cross-document contradictions before editing, without making findings blocking
- use `secret-record-generate` and `access-token-generate` when a coding agent must create or rotate a credential value without pasting it into chat or writing it locally
- use manifest v2 `sync check`, local-file `sync pull`, guarded `sync push`, targeted selectors, review artifacts, mutation limits, and opt-in `sync push --apply --refresh-sidecars` to preflight, refresh, and update existing mixed-surface documentation bundles before any generic batch-apply design
- keep policy packs focused on explicit reusable policy for existing approved surfaces, including preview-first starter doc scaffold declarations
- keep that surface curated and explicit
- keep specialized surfaces specialized instead of collapsing everything into generic page mutation

Broader direction:
- keep the narrow band usable and safe
- expand doc adoption and verification before broader workflow bundles
- keep v1 validation-session artifact sync separate from v2 mixed-surface manifests
- return to workflow bundles only after the core band and curated docs are stable under real use
- keep Chromium UI automation narrow and explicitly experimental while the API-visible validation-session flow stays the default operator path

The supporting detail lives in [operator roadmap](./docs/operator-roadmap.md), with sprint sequencing in [development plan](./docs/development-plan.md).

## Use From Another Repo Or Codex Thread

If your active Codex thread is attached to a different repo, use SNPM as the local control repo from `C:\\SNPM`:

```powershell
Set-Location C:\SNPM
npm run verify-project -- --name "Project Name"
```

Do not copy SNPM scripts, workspace ids, or config into another repo.

## Docs

- [operator roadmap](./docs/operator-roadmap.md)
- [development plan](./docs/development-plan.md)
- [GitHub testing loop](./docs/github-testing-loop.md)
- [fresh project usage](./docs/fresh-project-usage.md)
- [agent quickstart](./docs/agent-quickstart.md)
- [workspace overview](./docs/workspace-overview.md)
- [project bootstrap](./docs/project-bootstrap.md)
- [project token setup](./docs/project-token-setup.md)
- [workspace config ownership](./docs/workspace-config.md)
- [project access workflows](./docs/project-access.md)
- [migration guidance](./docs/migration-guidance.md)
- [validation sessions](./docs/validation-sessions.md)
- [validation-session UI bundle](./docs/validation-session-ui-bundle.md)
- [manifest and validation-session sync](./docs/validation-session-sync.md)
- [live Notion doc update guidance](./docs/live-notion-docs.md)
- [new thread handoff](./docs/new-thread-handoff.md)
