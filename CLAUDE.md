# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Test/Lint

```bash
bun install                 # Install dependencies (Bun 1.2+)
bun test                    # Run all tests
bun run build               # Bundle src/cli.ts to dist/
bun run install-cli         # Symlink CLI into ~/.agentic-tools/bin/
bun run src/cli.ts doctor   # Exercise the CLI directly without installing
bash scripts/doctor.sh      # Check local installation environment
bun run lint:docs           # CLI quickref matches --help + ROADMAP.md is consistent
bun run gen:cli-quickref    # Regenerate the command reference after a CLI change
```

`docs/CLI-QUICKREF.md` is the agent-facing invocation reference: every command, flag,
output shape, and exit code, plus the gotchas that cause guess-and-retry. Its command
reference block is generated from the CLI's own `--help`, so any CLI change requires
`bun run gen:cli-quickref` — otherwise `bun run lint:docs` (CI `Docs Verify`, and
`tests/cli-contract.test.ts`) fails.

There is no separate linter or formatter configured. Tests use Bun's built-in test runner (`bun test`). To run a single test file:

```bash
bun test tests/router.test.ts        # Single test file
bun test tests/hash-edit.test.ts     # Single test file
bun test -t "test name pattern"      # Filter by test name
```

The smoke test (`bash tests/smoke.sh`) requires the CLI to be installed (`structured-edit` on PATH); run it whenever CLI behavior changes. CI uses semantic-release for automated versioning and publishing, so commits must use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`) — the prefix drives the release.

Style: strict TypeScript, ES modules, two-space indent; camelCase values, PascalCase types, kebab-case CLI subcommands.

`AGENTS.md` covers the same ground for other agents — keep the two in sync when commands or conventions change.

## Architecture

HashPilot is a global, tool-agnostic structured editing core for coding agents. It exposes a single CLI binary (`structured-edit`) that agents invoke for safe, syntax-aware file edits.

### Three-tier edit hierarchy

1. **AST** — tree-sitter based syntax-aware edits (rename-symbol, replace-body, add/remove-import, insert-before/after). Only available for supported languages.
2. **Hash** — SHA-256 anchored content replacement. Read a file (with hash), then replace by referencing that hash. Detects stale anchors (file changed since read) and relocates the anchor when the content moved and appears exactly once; otherwise it refuses rather than overwriting.
3. **Diff** — Search-and-replace fallback for unsupported languages/operations. Accepts oldContent + newContent, detects duplicates, fails with disambiguation hints.

Supported AST languages: TypeScript, TSX, JavaScript, Python, Go, Rust. `.d.ts` files are excluded from AST editing.

### Module map

All core modules live in `src/core/` (paths below are relative to it).

| Module | Responsibility |
|--------|---------------|
| `src/cli.ts` | Commander-based CLI entry point. Every command records a telemetry event. |
| `ast-edit.ts` | Tree-sitter parsing, symbol finding, rename, body replacement, import add/remove (with per-language configs for import formatting and grouped import handling) Source is streamed to the parser in chunks (no 32KB ceiling), and every operation is wrapped in a parse-validity gate: refuse a file that already has syntax errors, and discard an edit whose result would not parse. |
| `hash-edit.ts` | SHA-256 anchored content replacement with relocation-based stale-anchor recovery and strict range validation. |
| `diff-engine.ts` | LCS-based unified diff generation and patch application with fuzzy matching. |
| `read.ts` | `read-many` (batch file reads with SHA-256 hashes) and `read-hash` (single line with context hashes). |
| `grep.ts` | `grep-many` (regex search via system grep) and `symbol-lookup-many` (regex-based symbol definition search). |
| `router.ts` | Route selection and dispatch. `chooseRoute` determines AST vs hash vs diff. `routeEdit` is the unified execution entry point that auto-routes and applies the edit. |
| `intent.ts` | **M5** — Parses structured intents (e.g. `{"operation":"add-parameter","symbol":"fn","param":{"name":"x"}}`), resolves symbol definitions and references, generates an `EditPlan` with ordered steps and blast radius summary. |
| `plan-executor.ts` | **M5** — Executes `EditPlan` steps through the router with dry-run, verify, and revert-on-failure support. `executeIntent()` is the top-level entry point: parse → resolve → plan → execute. |
| `provenance.ts` | **M6** — Edit history tracking with changeSet IDs. `provenanceQuery(file, line?)` shows who changed what and why (like `git blame` for agent edits). |
| `config.ts` | Configuration loading with merge priority: env var > CLI arg > project `.hashpilot.json` > global `~/.config/hashpilot/config.json` > defaults. |
| `paths.ts` | Write boundary. `assertWritable`/`safeWrite` confine every write to the project root (widened by `allowedRoots`), with a hard deny-list (`~/.ssh`, `~/.aws`, `/etc`, shell rc files, the telemetry log) that no flag overrides. Symlinks are resolved on both sides before comparison. |
| `exit-codes.ts` | Maps `ErrorCode` to process exit codes (0 ok · 1 usage · 2 edit failed · 3 stale/retryable · 4 verify failed · 5 I/O · 70 internal). `finish()` prints JSON and sets the code. |
| `redact.ts` | Credential scrubbing for anything written to the telemetry log: `redactSecrets`, `isSensitiveFile`, `redactEvent`. |
| `batch-edit.ts` | Batch editing — applies the same edit to multiple files in parallel (`editMany`) or serially (`editManySerial`). |
| `verify.ts` | `verify-changes` — runs formatter, linter, and tests on specified files. All checks are opt-in via CLI flags. Auto-detects tools from `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`. |
| `telemetry.ts` | JSONL telemetry logging to `~/.agentic-tools/logs/`. Includes health reports with threshold warnings (stale-anchor rate, diff fallback rate, verify failure rate, per-language failure rate) and trend comparison. |
| `doctor.ts` | Installation health check — verifies core files, CLI on PATH, config, and adapter integrations for Claude Code, OpenCode, and Pi. |
| `index.ts` | Barrel file — re-exports all public API surface from core modules. |

### Key patterns

- **Route precedence** (`chooseRoute`, `src/core/router.ts:36`): policy override → AST (language supported *and* AST operation) → hash operation → diff fallback. First match wins.
- **Telemetry everywhere**: Every CLI command wraps its action in `recordEvent({...})` with operation name, route, file, language, success, and elapsed_ms. The router also self-records events.
- **Config merge priority**: Env var (`HASHPILOT_ROUTE_POLICY`) → CLI `--config` → project `.hashpilot.json` → global `~/.config/hashpilot/config.json` → built-in defaults.
- **Error codes**: Defined as `ErrorCode` enum with `PARSE_ERROR`, `SYMBOL_NOT_FOUND`, `STALE_ANCHOR`, etc. Passed through telemetry for health monitoring.
- **JSON output is a contract**: CLI output is machine-readable JSON consumed by agent adapters. Do not change output shapes without updating `docs/ADAPTER-CONTRACT.md` and affected tests.
- **Barrel exports**: preserve the public exports in `src/core/index.ts`.
- **Provenance tracking**: edit operations can accept `actor`, `taskId`, and `reason` params. These are recorded alongside telemetry events and queryable via `provenance query <file>`.

### Configuration

- Global: `~/.config/hashpilot/config.json`
- Project: `.hashpilot.json` (in cwd)
- Env: `HASHPILOT_ROUTE_POLICY` (JSON string)
- Merge priority (highest wins): env var → CLI `--config` → project → global → defaults

Route policies can override routing per language or per operation, with configurable conflict resolution (`"language"`, `"operation"`, or `"strictest"`).

### Gotchas

- **tree-sitter is a native module.** Run `bun install` before anything else — without `node_modules/`, the AST test files abort with `error: Cannot find package 'tree-sitter'` while the rest of the suite passes, so the failure looks unrelated. Green baseline is 515 pass / 0 fail.
- **AST load failures are silent.** `getParser()` (`src/core/ast-edit.ts:31-60`) catches parser-init errors and returns `null`. The router then falls back to hash/diff with no warning. If AST edits mysteriously route to diff, check that the tree-sitter bindings actually built.

### Adapter integrations

The `templates/` directory contains template files injected into agent config files during install:
- `claude-section.md` — injected into `~/.claude/CLAUDE.md`
- `opencode-skill.md`, `opencode-agent.md` — OpenCode integration
- `pi-extension.ts`, `pi-skill.md` — Pi integration

The `scripts/` directory has install, uninstall, and standalone doctor scripts.
