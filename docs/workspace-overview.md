# Workspace Overview

Infrastructure HQ Notion is the live operational workspace for:
- current project state
- runbooks
- access inventory
- vendors
- incidents
- active planning

The current top-level workspace mental model is:
- `Home`
- `Projects`
- `Templates`
- `Runbooks`
- `Access Index`
- `Vendors`
- `Incidents`

Repo boundary:
- app/runtime truth stays in the owning product repos
- mutable operator workflow and current operational state stay in Notion
- SNPM owns the automation that creates and verifies the standard project subtree inside Notion

Policy boundary:
- the policy-pack foundation is a reusable expression of the current Infrastructure HQ structure and routing rules
- policy covers approved starter-tree shape, reserved roots, managed-doc boundaries, curated workspace/template docs, and project-token scope boundaries
- policy packs do not make SNPM a generic Notion connector and do not add drift audits, consistency checks, starter-doc scaffolding, or broad batch apply
