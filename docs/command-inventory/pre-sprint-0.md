# Pre-Sprint 0 Command Inventory

Status: historical baseline captured before validation-bundle retirement.

Generated: 2026-04-27T19:32:11.466Z

## Purpose

This inventory preserves the pre-removal command surface so Sprint 0 deletion is auditable. It is not a supported-command guide after Sprint 0 lands.

## Retired Candidates

- validation-bundle.login
- validation-bundle.preview
- validation-bundle.apply
- validation-bundle.verify

## Counts

- Commands in capabilities: 73
- npm scripts: 69
- validation-bundle npm scripts: 4

## Validation-Bundle Scripts Present At Capture Time

- validation-bundle-login: `node src/cli.mjs validation-bundle login`
- validation-bundle-preview: `node src/cli.mjs validation-bundle preview`
- validation-bundle-apply: `node src/cli.mjs validation-bundle apply`
- validation-bundle-verify: `node src/cli.mjs validation-bundle verify`

## Follow-Up

Sprint 0 should remove validation-bundle commands, scripts, help/capabilities entries, docs, tests, browser automation source, and Playwright dependency while preserving API-visible validation-session workflows.
