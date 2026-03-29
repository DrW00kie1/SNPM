# SNPM

SNPM is the canonical home for Infrastructure HQ Notion automation.

It is intentionally opinionated:
- approved-surface mutation only
- project-token-safe paths where possible
- deterministic routing before mutation
- body-only markdown sync on curated surfaces

GitHub remote:
- `https://github.com/DrW00kie1/SNPM`

Current branch reality:
- active stable baseline: `main`
- promotion trace branch: `codex/managed-doc-surface`
- historical RC snapshot: `v0.1.0-rc.1`

## Current Surface

Supported narrow-band baseline on `main`:
- `create-project`
- `verify-project`
- planning-page sync for the four approved planning pages
- managed runbooks
- managed Access records
 - low-ceremony edit loops via `page-edit`, `runbook-edit`, `doc-edit`, `access-domain-edit`, `secret-record-edit`, and `access-token-edit`
- curated managed docs for:
  - project root docs
  - `Templates > Project Templates` and its non-reserved descendants
  - a small named set of workspace-global docs
- `doc-create`, `doc-adopt`, `doc-pull`, `doc-diff`, `doc-push`
- `verify-workspace-docs`
- `doctor`
- intent-driven `recommend`
- `recommend --intent project-doc|template-doc|workspace-doc`
- stdin/stdout ergonomics on the core band
- EOF-stable round-trips on managed planning, runbook, Access, and build-record pages

Present in the repo but outside the current supported line:
- build records
- validation sessions
- manifest-backed sync
- experimental `validation-bundle` Chromium UI automation

## Managed-Doc Boundary

The new managed-doc surface is curated, not arbitrary.

Project-scoped managed docs:
- `Root`
- `Root > ...` under non-reserved top-level names
- planning pages remain on `page-*` as a compatibility surface

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

Create a new project subtree:

```bash
npm run create-project -- --name "Project Name"
```

Verify a project subtree:

```bash
npm run verify-project -- --name "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

Inspect a project safely before mutation:

```bash
npm run doctor -- --project "Project Name"
npm run doctor -- --project "Project Name" --project-token-env PROJECT_NAME_NOTION_TOKEN
```

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

Planning-page sync remains available through `page-*`:

```bash
npm run page-pull -- --project "Project Name" --page "Planning > Roadmap" --output roadmap.md
npm run page-diff -- --project "Project Name" --page "Planning > Roadmap" --file roadmap.md
npm run page-push -- --project "Project Name" --page "Planning > Roadmap" --file roadmap.md --apply
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
npm run secret-record-create -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run secret-record-pull -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --output secret-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run secret-record-diff -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN
npm run secret-record-push -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --file secret-record.md --project-token-env PROJECT_NAME_NOTION_TOKEN --apply
npm run secret-record-edit -- --project "Project Name" --domain "App & Backend" --title "GEMINI_API_KEY" --project-token-env PROJECT_NAME_NOTION_TOKEN --apply --explain --review-output review\access
```

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

The file produced by `page-pull`, `runbook-pull`, Access pull commands, and `doc-pull` is the safe editing base. For core-band and managed-doc flows:
- `--output -` streams the body to stdout
- `--file -` reads markdown from stdin
- structured success metadata goes to stderr when stdout is used for body output

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

Near-term direction on `main`:
- use the managed-doc surface to standardize remaining curated root, template, and workspace docs
- keep that surface curated and explicit
- keep specialized surfaces specialized instead of collapsing everything into generic page mutation

Broader direction:
- keep the narrow band usable and safe
- expand doc adoption and verification before broader workflow bundles
- return to workflow bundles only after the core band and curated docs are stable under real use
- keep Chromium UI automation narrow and explicitly experimental while the API-visible validation-session flow stays the default operator path

The supporting detail lives in [operator roadmap](./docs/operator-roadmap.md).

## Use From Another Repo Or Codex Thread

If your active Codex thread is attached to a different repo, use SNPM as the local control repo from `C:\\SNPM`:

```powershell
Set-Location C:\SNPM
npm run verify-project -- --name "Project Name"
```

Do not copy SNPM scripts, workspace ids, or config into another repo.

## Docs

- [operator roadmap](./docs/operator-roadmap.md)
- [GitHub testing loop](./docs/github-testing-loop.md)
- [fresh project usage](./docs/fresh-project-usage.md)
- [workspace overview](./docs/workspace-overview.md)
- [project bootstrap](./docs/project-bootstrap.md)
- [project token setup](./docs/project-token-setup.md)
- [workspace config ownership](./docs/workspace-config.md)
- [project access workflows](./docs/project-access.md)
- [migration guidance](./docs/migration-guidance.md)
- [validation sessions](./docs/validation-sessions.md)
- [validation-session UI bundle](./docs/validation-session-ui-bundle.md)
- [validation-session sync](./docs/validation-session-sync.md)
- [live Notion doc update guidance](./docs/live-notion-docs.md)
- [new thread handoff](./docs/new-thread-handoff.md)
