# AGENTS.md

## Workflow

### 1. Research before implementation

- Read the current repo state first
- Capture findings in `research.md`
- Do not jump straight into code for non-trivial changes

### 2. Plan before mutation

- Write the implementation plan in `plan.md`
- Wait for explicit approval before implementing
- If scope or assumptions change, update the plan first

### 3. Respect the live workspace

- This repo mutates a real Notion workspace
- Prefer conservative changes over clever ones
- Preserve validated behavior unless the plan explicitly changes it
- Never do speculative workspace restructuring as part of an unrelated task

### 4. Keep milestone 1 migration-focused

- Treat `C:\\tall-man-training` as source material until cutover is complete
- Preserve the current starter tree contract
- Preserve project-token boundary expectations
- Move ownership before redesigning architecture

### 5. Verify before closing

- Run the bootstrap command against the live workspace when appropriate
- Run verification after structural changes
- Call out any manual UI-only Notion steps explicitly

