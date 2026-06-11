## HashPilot Claude — Structured Editing Integration

This session has HashPilot Claude active at user scope.
HashPilot Core (`structured-edit`) is available on PATH.

Edit hierarchy (prefer top first):
1. **`structured-edit ast <subcommand>`** — syntax-aware structured edit (best)
2. **`structured-edit replace-hash`** — hash-anchored content replacement (safe)
3. **Direct Edit/Write** — fallback only

Batched operations (use these over single-file tools when practical):
- `/hashpilot-read <paths>` — batched file reads via structured-edit read-many
- `/hashpilot-search <pattern>` — batched search via structured-edit grep-many
- `/hashpilot-verify [files]` — bundled verification via structured-edit verify-changes

Route introspection and config:
- `structured-edit route <file> <op> [--policy <json>]` — detailed route explanation with policy testing
- `structured-edit config` — show current merged configuration

Status and control:
- `/hashpilot-status` — check adapter status
- `HASHPILOT_DISABLE=1` — bypass HashPilot entirely (env var)
