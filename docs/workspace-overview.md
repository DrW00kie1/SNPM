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
- app/runtime truth stays in product repos like `tall-man-training`
- mutable operator workflow and current operational state stay in Notion
- SNPM owns the automation that creates and verifies the standard project subtree inside Notion

