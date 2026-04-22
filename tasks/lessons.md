# Task Lessons

## 2026-04-22 - CLI Help Before Option Parsing

- If the CLI should support conventional `--help` or `-h`, detect help requests before normal flag parsing.
- Otherwise long-form help tokens get mistaken for valued options and fail with `Missing value for --help` before the command dispatcher can render help.
- Keep help text in a shared registry so global help and command-scoped help do not drift.
