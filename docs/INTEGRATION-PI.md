# HashPilot — Pi Integration Guide

## Two Integration Modes

HashPilot integrates with Pi in two ways:

1. **Native Extension** (recommended) — Custom tools registered in Pi's tool system, available in every session
2. **CLI Mode** — Direct shell commands via `hashpilot`

## Mode 1: Native Pi Extension (Recommended)

The HashPilot Pi extension is installed at `~/.pi/agent/extensions/hashpilot.ts`. It registers 7 custom tools and a `/hp` slash command.

### Registered Tools

| Tool | Description |
|------|-------------|
| `hashpilot_read` | Batch read files with content hashes |
| `hashpilot_search` | Grep regex across paths |
| `hashpilot_read_hash` | Read line with hash anchor and context |
| `hashpilot_replace_hash` | Hash-anchored content replacement |
| `hashpilot_ast` | AST operations for supported languages (find-symbols, rename, replace-body, add/remove import, insert) |
| `hashpilot_verify` | Run formatter + linter + tests on files |
| `hashpilot_status` | Show routing info and telemetry summary |

### Slash Command

`/hp <subcommand>` — Quick access to HashPilot:
- `/hp route <file> <op>` — Show which edit route would be chosen
- `/hp telemetry` — Show telemetry summary

### Skill

The `hashpilot` skill at `~/.pi/agent/skills/hashpilot/SKILL.md` provides routing instructions and workflow guidance. Use `/skill:hashpilot` to load it.

### How It Works

The extension calls `hashpilot` CLI under the hood via `pi.exec()`. Each tool:
1. Validates parameters using TypeBox schemas
2. Calls the appropriate `hashpilot` command
3. Parses JSON output
4. Returns structured results to the LLM

For `hashpilot_replace_hash`, stale-anchor detection is built in — if the hash is stale, the tool returns a clear error message telling the agent to re-read and retry.

### Enabling/Disabling

The `hashpilot_enabled` flag controls whether tools appear in Pi's Available Tools. Default: enabled.

## Mode 2: CLI Direct Usage

If the extension isn't loaded, Pi can call `hashpilot` directly via shell:

```bash
# Read files with hashes
hashpilot read-many src/main.ts src/worker.ts

# Read a line with context
hashpilot read-hash src/main.ts 42

# Hash-anchored replacement
HASH=$(hashpilot read-many src/config.py | jq -r '.[0].hash')
hashpilot replace-hash src/config.py "$HASH" "new content"

# AST operations (TypeScript, TSX, JavaScript, Python, Go, Rust)
hashpilot ast find-symbols src/main.ts
hashpilot ast rename-symbol src/main.ts oldFunc newFunc
hashpilot ast replace-body src/main.ts myFunc 'return 42;'
hashpilot ast add-import src/app.ts '{ Router } from express'
hashpilot ast remove-import src/app.ts './bar'

# Generate and apply unified diffs
hashpilot diff generate src/main.ts "$(cat old.ts)" "$(cat new.ts)"
hashpilot diff apply src/main.ts --patch changes.patch

# Route decisions and config
hashpilot route src/main.ts rename-symbol
hashpilot config

# Batch edit across files
hashpilot batch add-import src/*.ts --import-spec "{ z } from zod" --dry-run

# Edit provenance
hashpilot provenance query src/main.ts --human

# Verify changes (with auto-detection)
hashpilot verify-changes src/main.ts --auto-detect
```

## Routing Strategy

HashPilot uses a strict priority for edit method selection:

1. **AST** — For supported languages (TypeScript, TSX, JavaScript, Python, Go, Rust) with AST-compatible operations (rename, replace-body, add/remove import, insert)
2. **Hash** — For hash-anchored content identification (any file type)
3. **Diff** — Fallback for unsupported operations

Check routing: `hashpilot route <file> <operation> [--policy <json>]`

For detailed explanation with policy matches, use `--policy` to test override behavior:

```bash
hashpilot route src/main.ts rename-symbol
# → { route: "ast", explanation: { reasons: ["Language 'typescript' supports AST operations"], ... } }

hashpilot route src/main.py rename-symbol --policy '{"languageOverrides":{"python":"hash"}}'
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

View current merged config: `hashpilot config`

## Stale Anchor Recovery

HashPilot has **auto-recovery** for stale anchors. When the file has changed since the hash was computed, `replace-hash` auto-recovers by applying the edit to the current content and returning `"retries": 1`. This is always safe for full-file replaces.

If auto-recovery fails or is disabled:
1. Re-read the file: `hashpilot read-many <file>`
2. Get the new hash from the response
3. Retry `replace-hash` with the updated hash

The native `hashpilot_replace_hash` tool surfaces stale-anchor status in its response details (`details.stale`), and the extension handles the result accordingly.

## Telemetry

All operations are logged to `~/.agentic-tools/logs/telemetry.jsonl`.

```bash
hashpilot telemetry summary       # Operation counts and timing
hashpilot telemetry show -n 50    # Last 50 events
hashpilot telemetry health -w 7   # Health report with per-language stats and warnings
hashpilot telemetry health -w 7 --trend  # Compare to previous window
hashpilot telemetry sessions      # List session-level summaries
hashpilot telemetry export --from 2026-01-01  # Export events as NDJSON
hashpilot telemetry prune --older-than 30  # Delete old rotated files
hashpilot telemetry clear         # Clear log
```

## When to Use HashPilot Tools vs Raw Commands

| Task | Use HashPilot | Use Direct |
|------|--------------|------------|
| Edit existing TS/JS/Python/Go/Rust files | ✅ ast commands | ❌ |
| Edit any file with hash safety | ✅ replace-hash | ❌ |
| Rename symbols across files | ✅ ast rename-symbol | ❌ |
| Add/remove imports | ✅ ast add-import / remove-import | ❌ |
| Replace function body | ✅ ast replace-body | ❌ |
| Batch read multiple files | ✅ hashpilot_read | ❌ |
| Verify changes | ✅ hashpilot_verify | ❌ |
| Create new files | ❌ | ✅ raw write |
| Delete files/dirs | ❌ | ✅ bash |
| Move/rename files | ❌ | ✅ bash |
| Simple one-line edits | optional | ✅ direct edit |
| Single-file exploration | optional | ✅ direct read |

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
| `hashpilot: command not found` | Add `~/.agentic-tools/bin` to PATH in `~/.bashrc` |
| `Module not found` errors | Run `bun install` in `~/.agentic-tools/structured-editing/` |
| Tree-sitter errors | `bun add tree-sitter tree-sitter-typescript` in the structured-editing dir |
| Pi extension not loading | Check `~/.pi/agent/extensions/hashpilot.ts` exists and has no syntax errors |
| Tools not appearing | Restart Pi; check `~/.pi/agent/settings.json` doesn't disable extensions |
| Stale hash errors | Re-read the file with `read-many` or `read-hash` and use the fresh hash |