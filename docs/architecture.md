# SNPM Architecture Inventory And Migration Map

Status: R5A tests-by-layer alignment. This document describes the current source layout, the boundary checks enforced by `npm run architecture-inventory`, and the completed R4/R5 migration path. R4C grouped Notion domain internals under surface-oriented directories; R4D moved shared runtime helpers into `src/infrastructure/`; R5A aligned tests under layer-specific directories while preserving command behavior.

## Current Layers

| Layer | Current location | Responsibility |
| --- | --- | --- |
| CLI and registry | `src/cli.mjs`, `src/cli/*.mjs`, `src/cli-help.mjs`, `src/command-registry.mjs` | executable entrypoint, argument parsing, top-level error/output shell, help, capabilities, command metadata |
| Command adapters | `src/commands/*.mjs` | public command-family orchestration, option validation, output shaping, mutation journal wrapping |
| Infrastructure utilities | `src/infrastructure/*.mjs` | shared child runner, command IO, mutation journal, operational output, and manifest review-output helpers |
| JSON contracts | `src/contracts/*.mjs` | limited agent-facing JSON contract validation |
| Notion domain services | `src/notion/*.mjs`, `src/notion/{core,project,docs,manifest,planning,validation}/*.mjs` | approved Notion surface resolution, markdown round-trips, manifest engines, audits, client transport |
| Notion CLI adapter | `src/notion-cli/*.mjs` | optional `ntn` probe/read-only adapter under SNPM policy |
| Validators | `src/validators.mjs` | shared fail-before-side-effect validation helpers |
| Tests | `test/{access,cli,commands,infrastructure,manifest,notion,package}/*.mjs` | behavior, contract, release, and safety regression coverage grouped by architecture layer |
| Release tooling | `scripts/*.mjs` | local package/release/architecture gates, not public SNPM commands |

Known compatibility shims remain in `src/commands/*.mjs` for moved infrastructure helpers. These shims are intentional until import inventory proves old command-layer paths are unused.

## Enforced Boundaries

`npm run architecture-inventory` fails when it detects these regressions:

- Notion domain modules importing CLI registry files or command-handler modules.
- JSON contract helpers importing runtime command, domain, or Notion CLI adapter code.
- Infrastructure utilities importing CLI registry, command handlers, or Notion surface implementations outside explicit pure-helper exceptions.
- Tests depending on local-only task memory, `.snpm-closeout` artifacts, or local DOCX reference artifacts.
- Retired `validation-bundle` or browser/UI automation source, scripts, or Playwright imports returning.
- Package allowlist drift that would ship internal architecture/planning docs, scripts, tests, task memory, or dot-state trees.

The inventory is intentionally repo-local. It reads source files and `package.json`; it does not read Notion, mutate Notion, write sidecars, append journals, or expose a new SNPM command family.

## R4/R5 Migration Slices

1. Command-shell split: keep `src/cli.mjs` as the package `bin`, but extract argument parsing, top-level error formatting, and command-result orchestration into smaller behavior-preserving modules. Status: implemented in R4B.
2. Domain-service grouping: group `src/notion` by surface and primitive through explicit module boundaries or barrel exports without changing public command behavior. Status: implemented in R4C.
3. Infrastructure utilities: move reusable runtime utilities such as child runner, file IO helpers, operational output, and journal plumbing out of command-specific paths when they are shared by domain or adapter layers. Status: implemented in R4D.
4. Tests by layer: align tests with the migrated layers so command-contract, domain-service, transport, package, and release checks remain clear. Status: implemented in R5A.
5. R6 decision: after staged migration evidence, decide whether a TypeScript pilot adds enough safety to justify the migration cost, or close hardening without TypeScript.

## Non-Goals

- No source moves outside the approved R4B CLI-shell split, R4C domain-service grouping, R4D infrastructure utilities extraction, and R5A tests-by-layer alignment.
- No command renames, new commands, output-shape changes, or exit-code changes.
- No new Notion mutation surface, transport replacement, retries, rollback, generic batch apply, or manifest scope expansion.
- No package publish, GitHub Release, tag creation, or repository visibility change.
- No TypeScript migration until the R6 decision.
