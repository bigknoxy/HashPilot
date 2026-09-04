# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Strategic Context

**[docs/COMPETITIVE-ANALYSIS.md](docs/COMPETITIVE-ANALYSIS.md)** is the canonical map of the agent
file-editing primitive space (Aider, Scalpel MCP, fedit, CLIO, Codex/Claude/Cursor, Comby, Morfx,
and others). It carries the positioning statement now used on the README and landing page, the feature
matrix, and the deduped action list. **Read it before working on** MCP (#25), benchmarks (#26),
language expansion, distribution, Go-to-market, or "compete with X" requests. Headline facts worth
knowing up front:

- **The moat is real and unclaimed:** no competitor combines hash-anchored (SHA-256) verification with
  AST-native editing. Aider dominates *adoption* but is text-matching; Scalpel MCP is the closest
  structural analog but has zero adoption and CodeRabbit-flagged critical issues and no hash/provenance/locks.
- **Do not re-file these as gaps — they are shipped or tracked:** multi-agent file locking is **shipped**
  (`src/core/locking.ts`); changeSets/undo (`snapshot.ts`), provenance (`provenance.ts`), and telemetry
  are shipped; **MCP server is issue #25** and **benchmarks are issue #26** (both Sprint 3). See §6 of the
  analysis. The remaining leverage is distribution (MCP) and proof (benchmark), not capability.

## Build/Test/Lint

```bash
bun install                 # Install dependencies (Bun 1.2+)
bun test                    # Run all tests
bun run build               # Bundle src/cli.ts to dist/
bun run install-cli         # Symlink CLI into ~/.agentic-tools/bin/ and add it to your shell rc PATH
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

The smoke test (`bash tests/smoke.sh`) requires the CLI to be installed (`hashpilot` on PATH); run it whenever CLI behavior changes. It exercises the shipped binary end to end and asserts on the `data` payload of the apiVersion 1 envelope, so it catches envelope-shape breakage that unit tests miss; CI runs it too, so it must stay green. CI uses semantic-release for automated versioning and publishing, so commits must use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`) — the prefix drives the release.

Style: strict TypeScript, ES modules, two-space indent; camelCase values, PascalCase types, kebab-case CLI subcommands.

`AGENTS.md` covers the same ground for other agents — keep the two in sync when commands or conventions change.

### Branch protection required checks

`main`'s branch protection `required_status_checks.contexts` must list the *real*
current CI job names — not aspirational or historical ones. They drifted silently
once before (#184/B78): the contexts were `Test` and `ShellCheck`, names that once
matched real jobs in `.github/workflows/ci.yml` but were replaced (PR #149's
language-agnostic CI rewrite) without updating branch protection, so those two
required contexts never reported on any PR again. As of this fix the required
contexts are: `Node test`, `actionlint`, `yaml lint`, `Packaging smoke test`,
`codeql (javascript-typescript)`, `gitleaks`, `osv-scanner`. Note that plain
`codeql` (unlike `gitleaks`/`osv-scanner`) never matches anything either: the
`codeql` job in `security.yml` is matrixed by language, so its real check names
are `codeql (<language>)` — `codeql (javascript-typescript)` is the one that
actually runs against this repo's source. If you rename or restructure `ci.yml`
or `security.yml` job `name:`/matrix values, update branch protection's required
contexts in the *same* change — a stale context silently stops gating merges
instead of failing loudly.

## Architecture

HashPilot is a global, tool-agnostic structured editing core for coding agents. It exposes a single CLI binary (`hashpilot`) that agents invoke for safe, syntax-aware file edits.

### Three-tier edit hierarchy

1. **AST** — tree-sitter based syntax-aware edits (rename-symbol, replace-body, add/remove-import, insert-before/after). Only available for supported languages.
2. **Hash** — SHA-256 anchored content replacement. Read a file (with hash), then replace by referencing that hash. Detects stale anchors (file changed since read) and relocates the anchor when the content moved and appears exactly once; otherwise it refuses rather than overwriting.
3. **Diff** — Search-and-replace fallback for unsupported languages/operations. Accepts oldContent + newContent, detects duplicates, fails with disambiguation hints.

Supported AST languages: TypeScript, TSX, JavaScript, Python, Go, Rust. `.d.ts` files are excluded from AST editing.

### Module map

All core modules live in `src/core/` (paths below are relative to it).

| Module | Responsibility |
|--------|---------------|
| `src/cli-node.cjs` | Node-parseable CommonJS `bin` shim. Spawns Bun with array argv, forwards the child exit code, and prints an actionable install message (exit 127) when Bun is absent. |
| `src/cli.ts` | Commander-based CLI entry point. Every command records a telemetry event. |
| `ast-edit.ts` | Tree-sitter parsing, symbol finding, rename, body replacement, import add/remove (with per-language configs for import formatting and grouped import handling) Source is streamed to the parser in chunks (no 32KB ceiling), and every operation is wrapped in a parse-validity gate: refuse a file that already has syntax errors, and discard an edit whose result would not parse. |
| `hash-edit.ts` | SHA-256 anchored content replacement with relocation-based stale-anchor recovery and strict range validation. |
| `diff-engine.ts` | LCS-based unified diff generation and patch application with fuzzy matching. |
| `read.ts` | `read-many` (batch file reads with SHA-256 hashes) and `read-hash` (single line with context hashes). |
| `grep.ts` | `grep-many` (regex search via system grep) and `symbol-lookup-many` (regex-based symbol definition search). |
| `router.ts` | Route selection and dispatch. `chooseRoute` determines AST vs hash vs diff. `routeEdit` is the unified execution entry point that auto-routes and applies the edit. Every non-dry-run edit holds the file's advisory lock across the whole read → edit → compare → write window, so the compare-and-swap check cannot be invalidated between compare and write. |
| `locking.ts` | Advisory file locks. Lockfiles live under the **target file's project root** (`<root>/.hashpilot/locks/`) keyed by a SHA-256 of the absolute path, so the lock is cwd-independent on both halves. Created atomically with `O_CREAT\|O_EXCL`; each acquisition carries a `nonce` and refreshes its heartbeat every 5s, and reclaim needs both a 30s-stale heartbeat and a dead PID. Release unlinks only a lockfile still carrying our nonce. `acquireLock` for one file; `acquireSortedLocks` for a set, sorted and deduped *by lock path* to prevent deadlock on overlapping file sets. `pruneStaleLocks` sweeps crash leftovers. Locks are **not** re-entrant — concurrent writers in one process must still exclude each other — so `batch-edit` passes `alreadyLocked` to the router instead of nesting an acquire. Release functions are idempotent. |
| `intent.ts` | **M5** — Parses structured intents (e.g. `{"operation":"add-parameter","symbol":"fn","param":{"name":"x"}}`), resolves symbol definitions and references, generates an `EditPlan` with ordered steps and blast radius summary. An edit the planner cannot compute (e.g. `add-parameter` with no default, so there is no call-site argument) is recorded as an `unresolved` item rather than written into the source as a placeholder comment. |
| `plan-executor.ts` | **M5** — Executes `EditPlan` steps through the router with dry-run, verify, and revert-on-failure support. `executeIntent()` is the top-level entry point: parse → resolve → plan → execute. |
| `provenance.ts` | **M6** — Edit history tracking with changeSet IDs. `provenanceQuery(file, line?)` shows who changed what and why (like `git blame` for agent edits). |
| `config.ts` | Configuration loading with merge priority: env var > CLI arg > project `.hashpilot.json` > global `~/.config/hashpilot/config.json` > defaults. |
| `paths.ts` | Write boundary. `assertWritable`/`safeWrite` confine every write to the project root (widened by `allowedRoots`), with a hard deny-list (`~/.ssh`, `~/.aws`, `/etc`, shell rc files, the telemetry log) that no flag overrides. Symlinks are resolved on both sides before comparison. Writes are atomic: temp file → fsync → rename, with the target's mode preserved. |
| `module-system.ts` | **#139** — `detectModuleSystem` decides whether a JavaScript file is ESM or CommonJS from, in order, a `.cjs`/`.mjs` extension, the nearest `package.json` `type` field (absent ⇒ CommonJS, per Node), then a content sniff. `ast-edit.ts` consults it for **JavaScript only** before choosing import syntax, so `add-import` emits `require` into a CommonJS file instead of ESM that parses and then fails to load. Both markers present with nothing to settle it is a refusal (`MODULE_SYSTEM_MISMATCH`), never a guess. |
| `path-normalize.ts` | Path canonicalization for **comparison only** — `normalizePath` and `pathsEqual`. Resolves `./`, `../`, and trailing slashes, then expresses the result relative to `process.cwd()` when it lives underneath it and absolute otherwise. Deliberately separate from `paths.ts`: that module is the write boundary and must not gain comparison helpers. Because output is cwd-relative it is **not** interchangeable with the cwd-independent keys used by `locking.ts`. |
| `snapshot.ts` | **#12** — pre-edit snapshot store (`~/.agentic-tools/snapshots/`, content-addressed, keyed by changeSet) plus `undoChangeSet`, `listChangeSets`, and retention pruning. Backs the `changesets` and `undo` commands. |
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

- **tree-sitter is a native module.** Run `bun install` before anything else — without `node_modules/`, the AST test files abort with `error: Cannot find package 'tree-sitter'` while the rest of the suite passes, so the failure looks unrelated. Green baseline is 553 pass / 0 fail.
- **AST load failures are silent.** `getParser()` (`src/core/ast-edit.ts:31-60`) catches parser-init errors and returns `null`. The router then falls back to hash/diff with no warning. If AST edits mysteriously route to diff, check that the tree-sitter bindings actually built.

### Adapter integrations

The `templates/` directory contains template files injected into agent config files during install:
- `claude-section.md` — injected into `~/.claude/CLAUDE.md`
- `opencode-skill.md`, `opencode-agent.md` — OpenCode integration
- `pi-extension.ts`, `pi-skill.md` — Pi integration

The `scripts/` directory has install, uninstall, and standalone doctor scripts.
