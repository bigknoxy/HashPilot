# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Test/Lint

```bash
bun install         # Install dependencies
bun test            # Run all tests
bun run build       # Build CLI to dist/
bun run build && structured-edit doctor  # Build + health check
```

There is no separate linter or formatter configured. Tests use Bun's built-in test runner (`bun test`). To run a single test file:

```bash
bun test tests/router.test.ts        # Single test file
bun test tests/hash-edit.test.ts     # Single test file
bun test -t "test name pattern"      # Filter by test name
```

The smoke test (`tests/smoke.sh`) requires the CLI to be installed (`structured-edit` on PATH). CI uses semantic-release for automated versioning and publishing.

## Architecture

HashPilot is a global, tool-agnostic structured editing core for coding agents. It exposes a single CLI binary (`structured-edit`) that agents invoke for safe, syntax-aware file edits.

### Three-tier edit hierarchy

1. **AST** — tree-sitter based syntax-aware edits (rename-symbol, replace-body, add/remove-import, insert-before/after). Only available for supported languages.
2. **Hash** — SHA-256 anchored content replacement. Read a file (with hash), then replace by referencing that hash. Detects stale anchors (file changed since read) and auto-recovers.
3. **Diff** — Search-and-replace fallback for unsupported languages/operations. Accepts oldContent + newContent, detects duplicates, fails with disambiguation hints.

Supported AST languages: TypeScript, TSX, JavaScript, Python, Go, Rust. `.d.ts` files are excluded from AST editing.

### Module map

| Module | Responsibility |
|--------|---------------|
| `src/cli.ts` | Commander-based CLI entry point (~750 lines). Every command records a telemetry event. |
| `ast-edit.ts` | Tree-sitter parsing, symbol finding, rename, body replacement, import add/remove (with per-language configs for import formatting and grouped import handling). |
| `hash-edit.ts` | SHA-256 anchored content replacement with stale-anchor auto-recovery. |
| `diff-engine.ts` | LCS-based unified diff generation and patch application with fuzzy matching. |
| `read.ts` | `read-many` (batch file reads with SHA-256 hashes) and `read-hash` (single line with context hashes). |
| `grep.ts` | `grep-many` (regex search via system grep) and `symbol-lookup-many` (regex-based symbol definition search). |
| `router.ts` | Route selection and dispatch. `chooseRoute` determines AST vs hash vs diff. `routeEdit` is the unified execution entry point that auto-routes and applies the edit. |
| `intent.ts` | **M5** — Parses structured intents (e.g. `{"operation":"add-parameter","symbol":"fn","param":{"name":"x"}}`), resolves symbol definitions and references, generates an `EditPlan` with ordered steps and blast radius summary. |
| `plan-executor.ts` | **M5** — Executes `EditPlan` steps through the router with dry-run, verify, and revert-on-failure support. `executeIntent()` is the top-level entry point: parse → resolve → plan → execute. |
| `provenance.ts` | **M6** — Edit history tracking with changeSet IDs. `provenanceQuery(file, line?)` shows who changed what and why (like `git blame` for agent edits). |
| `config.ts` | Configuration loading with merge priority: env var > CLI arg > project `.hashpilot.json` > global `~/.config/hashpilot/config.json` > defaults. |
| `batch-edit.ts` | Batch editing — applies the same edit to multiple files in parallel (`editMany`) or serially (`editManySerial`). |
| `verify.ts` | `verify-changes` — runs formatter, linter, and tests on specified files. All checks are opt-in via CLI flags. Auto-detects tools from `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`. |
| `telemetry.ts` | JSONL telemetry logging to `~/.agentic-tools/logs/`. Includes health reports with threshold warnings (stale-anchor rate, diff fallback rate, verify failure rate, per-language failure rate) and trend comparison. |
| `doctor.ts` | Installation health check — verifies core files, CLI on PATH, config, and adapter integrations for Claude Code, OpenCode, and Pi. |
| `index.ts` | Barrel file — re-exports all public API surface from core modules. |

### Key patterns

- **Telemetry everywhere**: Every CLI command wraps its action in `recordEvent({...})` with operation name, route, file, language, success, and elapsed_ms. The router also self-records events.
- **Config merge priority**: Env var (`HASHPILOT_ROUTE_POLICY`) → CLI `--config` → project `.hashpilot.json` → global `~/.config/hashpilot/config.json` → built-in defaults.
- **Error codes**: Defined as `ErrorCode` enum with `PARSE_ERROR`, `SYMBOL_NOT_FOUND`, `STALE_ANCHOR`, etc. Passed through telemetry for health monitoring.
- **Provenance tracking**: edit operations can accept `actor`, `taskId`, and `reason` params. These are recorded alongside telemetry events and queryable via `provenance query <file>`.

### Configuration

- Global: `~/.config/hashpilot/config.json`
- Project: `.hashpilot.json` (in cwd)
- Env: `HASHPILOT_ROUTE_POLICY` (JSON string)
- Merge priority (highest wins): env var → CLI `--config` → project → global → defaults

Route policies can override routing per language or per operation, with configurable conflict resolution (`"language"`, `"operation"`, or `"strictest"`).

### Adapter integrations

The `templates/` directory contains template files injected into agent config files during install:
- `claude-section.md` — injected into `~/.claude/CLAUDE.md`
- `opencode-skill.md`, `opencode-agent.md` — OpenCode integration
- `pi-extension.ts`, `pi-skill.md` — Pi integration

The `scripts/` directory has install, uninstall, and standalone doctor scripts.
