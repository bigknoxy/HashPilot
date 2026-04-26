# HashPilot — Pi Integration Guide

## Two Integration Modes

HashPilot integrates with Pi in two ways:

1. **Native Extension** (recommended) — Custom tools registered in Pi's tool system, available in every session
2. **CLI Mode** — Direct shell commands via `structured-edit`

## Mode 1: Native Pi Extension (Recommended)

The HashPilot Pi extension is installed at `~/.pi/agent/extensions/hashpilot.ts`. It registers 7 custom tools and a `/hp` slash command.

### Registered Tools

| Tool | Description |
|------|-------------|
| `hashpilot_read` | Batch read files with content hashes |
| `hashpilot_search` | Grep regex across paths |
| `hashpilot_read_hash` | Read line with hash anchor and context |
| `hashpilot_replace_hash` | Hash-anchored content replacement |
| `hashpilot_ast` | AST operations (find-symbols, rename, replace-body, add/remove import, insert) |
| `hashpilot_verify` | Run formatter + linter + tests on files |
| `hashpilot_status` | Show routing info and telemetry summary |

### Slash Command

`/hp <subcommand>` — Quick access to HashPilot:
- `/hp route <file> <op>` — Show which edit route would be chosen
- `/hp status` — Show telemetry summary
- `/hp symbols <file>` — List symbols in a file

### Skill

The `hashpilot` skill at `~/.pi/agent/skills/hashpilot/SKILL.md` provides routing instructions and workflow guidance. Use `/skill:hashpilot` to load it.

### How It Works

The extension calls `structured-edit` CLI under the hood via `pi.exec()`. Each tool:
1. Validates parameters using TypeBox schemas
2. Calls the appropriate `structured-edit` command
3. Parses JSON output
4. Returns structured results to the LLM

For `hashpilot_replace_hash`, stale-anchor detection is built in — if the hash is stale, the tool returns a clear error message telling the agent to re-read and retry.

### Enabling/Disabling

The `hashpilot_enabled` flag controls whether tools appear in Pi's Available Tools. Default: enabled.

## Mode 2: CLI Direct Usage

If the extension isn't loaded, Pi can call `structured-edit` directly via shell:

```bash
# Read files with hashes
structured-edit read-many src/main.ts src/worker.ts

# Read a line with context
structured-edit read-hash src/main.ts 42

# Hash-anchored replacement
HASH=$(structured-edit read-many src/config.py | jq -r '.[0].hash')
structured-edit replace-hash src/config.py "$HASH" "new content"

# AST operations (TypeScript/TSX)
structured-edit ast find-symbols src/main.ts
structured-edit ast rename-symbol src/main.ts oldFunc newFunc
structured-edit ast replace-body src/main.ts myFunc 'return 42;'

# Verify changes
structured-edit verify-changes src/main.ts --formatter prettier --linter eslint
```

## Routing Strategy

HashPilot uses a strict priority for edit method selection:

1. **AST** — For supported languages (TypeScript, TSX, JavaScript, Python, Go, Rust) with AST-compatible operations (rename, replace-body, add/remove import, insert)
2. **Hash** — For hash-anchored content identification (any file type)
3. **Diff** — Fallback for unsupported operations

Check routing: `structured-edit route <file> <operation> [--policy <json>]`

For detailed explanation with policy matches, use `--policy` to test override behavior:

```bash
structured-edit route src/main.ts rename-symbol
# → { route: "ast", explanation: { reasons: ["Language 'typescript' supports AST operations"], ... } }

structured-edit route src/main.py rename-symbol --policy '{"languageOverrides":{"python":"hash"}}'
# → { route: "hash", explanation: { policyApplied: true, ... } }
```

## Configuration

HashPilot supports layered configuration via files and environment variables:

| Source | Path | Priority |
|--------|------|----------|
| Global config | `~/.config/hashpilot/config.json` | Lowest (applied first) |
| Project config | `.hashpilot.json` in cwd | Medium |
| CLI override | `--config <path>` | Higher |
| Environment | `HASHPILOT_ROUTE_POLICY` env var | Highest |

Example project config (`.hashpilot.json`):

```json
{
  "routePolicy": {
    "languageOverrides": { "python": "hash" },
    "operationOverrides": { "add-import": "diff" }
  }
}
```

View current merged config: `structured-edit config`

## Stale Anchor Recovery

When `replace-hash` returns `"stale": true`:
1. Re-read the file: `structured-edit read-many <file>`
2. Get the new hash from the response
3. Retry `replace-hash` with the updated hash

The native `hashpilot_replace_hash` tool returns this guidance automatically.

## Telemetry

All operations are logged to `~/.agentic-tools/logs/telemetry.jsonl`.

```bash
structured-edit telemetry summary       # Operation counts and timing
structured-edit telemetry show -n 50    # Last 50 events
structured-edit telemetry health -w 7   # Health report with per-language stats and warnings
structured-edit telemetry health -w 7 --trend  # Compare to previous window
structured-edit telemetry clear         # Clear log
```

## Key Benefits

1. **Reduced token usage** — Hash anchoring eliminates line-counting and re-reading
2. **Fewer retries** — Stale anchor detection catches conflicts before corruption
3. **Structured output** — JSON responses parse easily in agent logic
4. **Verification batching** — One command to run all checks
5. **Audit trail** — Telemetry logs every operation for debugging
6. **Native Pi integration** — Custom tools appear in Pi's tool system with proper schemas and guidelines

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `structured-edit: command not found` | Add `~/.agentic-tools/bin` to PATH in `~/.bashrc` |
| `Module not found` errors | Run `bun install` in `~/.agentic-tools/structured-editing/` |
| Tree-sitter errors | `bun add tree-sitter tree-sitter-typescript` in the structured-editing dir |
| Pi extension not loading | Check `~/.pi/agent/extensions/hashpilot.ts` exists and has no syntax errors |
| Tools not appearing | Restart Pi; check `~/.pi/agent/settings.json` doesn't disable extensions |
| Stale hash errors | Re-read the file with `read-many` or `read-hash` and use the fresh hash |