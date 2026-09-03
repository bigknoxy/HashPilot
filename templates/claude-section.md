## Install HashPilot
`curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/install.sh | bash` — installs `hashpilot` CLI on PATH; injects the section below into `~/.claude/CLAUDE.md`.

## HashPilot Claude — Structured Editing Integration
Active at user scope; `hashpilot` is on PATH.
- **Preferred:** `claude mcp add hashpilot -- hashpilot mcp --stdio`. Tools mirror the CLI 1:1 (`rename_symbol`, `replace_hash`, `route_edit`, `verify_changes`, plus read/search tools); JSON avoids shell-quoting. Other hosts: `docs/INTEGRATION-MCP.md`. CLI below is the fallback when MCP is unavailable.
- **Use when:** editing existing files, renaming symbols, replacing function bodies, managing imports, batch reading, verifying changes. **Skip when:** creating/deleting/moving files, one-off edits, other filesystem ops — use direct Edit/Write.
- **Edit hierarchy** (top preferred): `hashpilot ast <subcommand>` (syntax-aware, best) → `hashpilot replace-hash` (hash-anchored, safe) → direct Edit/Write (fallback only).
- **Batched ops:** `/hashpilot-read <paths>` (→ `read-many`), `/hashpilot-search <pattern>` (→ `grep-many`), `/hashpilot-verify [files]` (→ `verify-changes`).
- **Introspection:** `hashpilot route <file> <op> [--policy <json>]`; `hashpilot config`.
- **Output** (apiVersion 1): `{ apiVersion, ok, command, data, error, warnings }` — payload in `data`; failures carry `error.code` (+`error.recovery` when actionable); `ok` matches exit code; `warnings` covers route fallbacks/relocated anchors/corrupt telemetry. See `docs/ADAPTER-CONTRACT.md`.
- **Status/control:** `/hashpilot-status`; `HASHPILOT_DISABLE=1` bypasses HashPilot entirely.
