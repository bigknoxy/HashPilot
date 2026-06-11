# HashPilot — Architecture & Design

A living document capturing the architecture, design decisions, and data flow of the HashPilot structured editing system.

**Landing page:** https://bigknoxy.github.io/HashPilot/ — problem statement, audience, quick start.

---

## Why This Document Exists

HashPilot has two complementary docs that must always be kept in sync with the code:

| Document | Purpose | Audience |
|----------|---------|----------|
| **README.md** | Product landing page — what, why, quick start | Developers, agents, teams |
| **ARCHITECTURE.md** (this) | Design doc — how it works, why it's built this way | Engineers, contributors, reviewers |

**Verification rule:** Every PR that touches `src/` must update one or both docs. A CI check (`docs-verify`) validates that if `src/` files change, either `README.md` or `docs/ARCHITECTURE.md` must also change.

---

## Design Philosophy

1. **Correctness over cleverness** — Boring, readable solutions that are easy to maintain. Every edit should be verifiable.
2. **Smallest change that works** — Minimize blast radius. Don't refactor adjacent code unless it reduces risk.
3. **Leverage existing patterns** — Follow project conventions before introducing new abstractions.
4. **Cryptographic certainty** — SHA-256 content identity eliminates fuzzy matching. If the hash matches, you're editing the right content.
5. **Auto-recovery** — Stale anchors, failed verifies, race conditions. The system detects and recovers transparently.
6. **Auditability** — Every edit records who, what, when, and why. Provenance is a first-class concern.

---

## Module Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        structured-edit CLI                        │
│                    (Commander-based, Bun runtime)                  │
├───────────┬───────────┬──────────┬──────────┬────────────────────┤
│   Read    │    AST    │   Hash   │   Diff   │  Verify + Batch    │
│   Search  │   Ops     │   Ops    │   Ops    │  + Intent + Route  │
├───────────┴───────────┴──────────┴──────────┴────────────────────┤
│                        Router (auto-select)                       │
│               chooseRoute(): AST → Hash → Diff                    │
│               routeEdit(): execute + telemetry + provenance        │
├──────────────────────────────────────────────────────────────────┤
│                     Cross-Cutting Layers                          │
│   • Telemetry (JSONL)     • Provenance (agent git blame)          │
│   • Config (env→CLI→project→global)  • Error/exit codes           │
│   • Doctor (health check)  • Batch (parallel/serial edits)        │
└──────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

#### `src/cli.ts` — CLI Entry Point (~750 lines)
- Commander-based command registration
- Every command wraps its action in `recordEvent({...})` for telemetry
- Subcommands: `read-many`, `read-hash`, `replace-hash`, `grep-many`, `symbol-lookup-many`, `ast *`, `diff *`, `route-edit`, `batch`, `intent`, `verify-changes`, `telemetry *`, `provenance *`, `doctor`, `config`

#### `src/router.ts` — Route Selection & Dispatch
- `chooseRoute(file, operation)`: Determines AST vs Hash vs Diff based on:
  - File extension and language detection
  - Operation type (rename, replace, insert, etc.)
  - User-configured route policies that can override per language or per operation
  - Conflict resolution: `"language"`, `"operation"`, or `"strictest"`
- `routeEdit(file, operation, args)`: Unified execution entry point
  - Routes the edit, applies it, records telemetry event
  - Returns `{ route, success, error?, message? }`
- Route policy merge priority: env var → CLI flag → project config → global config → defaults

#### `src/ast-edit.ts` — Tree-Sitter AST Operations
- Tree-sitter parsing for TS, TSX, JS, Python, Go, Rust
- `.d.ts` files excluded from AST editing
- Operations:
  - `findSymbols(file)` — enumerate all functions, classes, methods, variables
  - `renameSymbol(file, oldName, newName)` — rename + all references via tree queries
  - `replaceBody(file, symbolName, newBody)` — replace function/method body
  - `addImport(file, specifier, source)` — add import with grouped-import merging
  - `removeImport(file, specifier)` — remove import statement
  - `insertBefore(file, symbolName, content)` — insert content before symbol
  - `insertAfter(file, symbolName, content)` — insert content after symbol
- Per-language configs for import formatting and grouped import handling
- Returns `{ success, symbolFound, edits: SyntaxEdits[], error? }`

#### `src/hash-edit.ts` — SHA-256 Anchored Content Replacement
- `replaceHash(file, hash, content, options?)`:
  - Computes SHA-256 of target file content
  - Matches against provided hash
  - If match: performs the replacement at byte range
  - If stale: auto-recovers by re-reading the file
  - Returns `{ success, stale, newHash?, error? }`
- Stale-anchor recovery protocol:
  1. Read current file content and hash
  2. Match against expected hash
  3. If mismatch: report stale anchor, re-read, retry with new hash
- Critical for concurrent editing scenarios where two agents may edit the same file

#### `src/diff-engine.ts` — LCS-Based Unified Diff
- Longest Common Subsequence (LCS) algorithm
- Generates unified diffs (`diff -u` format)
- Applies patches with fuzzy matching
- Duplicate detection: if oldContent matches multiple locations, fails with disambiguation hints
- Fallback route for unsupported languages and operations

#### `src/read.ts` — Batch & Contextual File Reading
- `readMany(files)`: Batch read files returning content + SHA-256 hashes
- `readHash(file, line)`: Read single line with surrounding context + hashes
- Both return structured JSON for agent consumption

#### `src/grep.ts` — Regex Search
- `grepMany(pattern, paths)`: System grep wrapper
- `symbolLookupMany(paths, names)`: Regex-based symbol definition search
- Compact, deterministic output

#### `src/intent.ts` — Intent-Based Editing (M5)
- Parses structured intents (e.g., `{"operation":"add-parameter","symbol":"fn","param":{"name":"x"}}`)
- Resolves symbol definitions and all call sites
- Generates an `EditPlan` with:
  - Ordered steps (definition first, then references)
  - Blast radius summary (how many files affected)
  - Prerequisite checks
- Returns `{ success, plan: EditPlan, steps: EditStep[], error? }`

#### `src/plan-executor.ts` — Edit Plan Execution
- Executes `EditPlan` steps through the router
- Supports: dry-run mode, per-step verify, revert-on-failure
- `executeIntent(intentJSON)`: Top-level entry:
  1. Parse intent JSON
  2. Resolve symbols and references
  3. Generate EditPlan
  4. Execute through router
  5. Verify results
  6. Return `{ success, changeset, steps: [{file, operation, status, error?}] }`

#### `src/provenance.ts` — Edit History (M6)
- ChangeSet-based tracking (group of related edits)
- `provenanceQuery(file, line?)`: Shows edit history per file/line
- Like `git blame` for agent edits
- Records: actor, taskId, reason, timestamp, operation, file, hash

#### `src/telemetry.ts` — Structured JSONL Logging
- Logs to `~/.agentic-tools/logs/`
- Every CLI command records: operation name, route, file, language, success, elapsed_ms
- Health reports with threshold warnings:
  - Stale-anchor rate (warns >10%)
  - Diff fallback rate (warns >15%)
  - Verify failure rate (warns >5%)
  - Per-language failure rate (warns >10%)
- Trend comparison: compares current window vs previous window
- Sessions: group events by session ID

#### `src/verify.ts` — Verification Bundling
- `verifyChanges(files, options)`: Run checks on specified files
- All checks opt-in via CLI flags
- Auto-detects tools from:
  - `package.json` (lint-staged, eslint, prettier, typescript, jest, vitest, bun:test)
  - `pyproject.toml` (ruff, mypy, pytest)
  - `go.mod` (gofmt, go vet)
  - `Cargo.toml` (cargo fmt, cargo clippy, cargo test)
- Revert-on-failure: if verify fails, undo the edit

#### `src/config.ts` — Layered Configuration
- Merge priority: env var → CLI flag → project `.hashpilot.json` → global `~/.config/hashpilot/config.json` → defaults
- Route policies can override routing per language or per operation
- Config schema validated at load time

#### `src/doctor.ts` — Installation Health Check
- Verifies: core files exist, CLI is on PATH, config is valid
- Checks adapter integrations: Claude Code, OpenCode, Pi
- Reports: installation status, missing components, version info
- Single command: `structured-edit doctor`

#### `src/batch-edit.ts` — Batch Editing
- `editMany(operation, files)`: Same edit applied to many files in parallel
- `editManySerial(operation, files)`: Serial execution for dependent operations
- Parallel mode uses `Promise.all` for concurrent file processing

#### `src/index.ts` — Barrel File
- Re-exports all public API surface from core modules

---

## Data Flow

### The Canonical Edit Cycle

```
  READ                     EDIT                        VERIFY
  ┌─────┐                 ┌───────┐                   ┌───────┐
  │     │   hash + content │       │   edit result      │       │
  │ src/ ├────────────────▶│ route │───────────────────▶│ verify│
  │ .ts  │                 │ .edit │                    │ .ts   │
  │     │ ◀────────────────│       │                   │       │
  └─────┘  stale? re-read  └───────┘                   └───────┘
                                                             │
                                   ┌─────┐                   │
                                   │     │    pass            │
                                   │ done│◀───────────────────│
                                   │     │                   │
                                   └─────┘                   │
                                                             │ fail
                                                             ▼
                                                        ┌─────────┐
                                                        │ revert  │
                                                        └─────────┘
```

### Intent Flow (Multi-File)

```
  ┌────────┐    ┌───────────┐    ┌──────────┐    ┌──────────────┐
  │ intent │───▶│  resolve  │───▶│  plan    │───▶│  execute      │
  │ parse  │    │  symbols  │    │  steps   │    │  (via router) │
  └────────┘    │ discover  │    └──────────┘    └──────┬───────┘
                │ refs     │                      │
                └───────────┘                      ▼
                                              ┌─────────┐
                                              │ verify  │
                                              │ steps   │
                                              └─────────┘
```

---

## Edit Lifecycle (Step by Step)

1. **Agent reads** a file via `read-many` → gets content + SHA-256 hash
2. **Agent calls** `route-edit` (or `replace-hash`, `ast rename-symbol`, etc.)
3. **Router determines** the best strategy:
   - AST route: for supported languages + operations, tree-sitter guarantees structural validity
   - Hash route: for all other cases, SHA-256 anchor guarantees content identity
   - Diff route: fallback, LCS-based with fuzzy matching
4. **Edit is applied** — returns success/failure + new hash if applicable
5. **Telemetry records** the event (operation, route, file, language, success, elapsed_ms)
6. **Provenance records** the change (actor, taskId, reason, timestamp)
7. **(Optional) Verify** runs format + lint + typecheck + tests
8. **(Optional) Auto-revert** if verify fails

---

## Key Design Decisions

### 1. Tree-sitter for AST (not Babel, not TypeScript Compiler API)
- **Why:** Tree-sitter is incremental, fast, and supports multiple languages in one library. Babel/TypeScript are JS-only and require full project context. Tree-sitter queries are declarative and composable.
- **Cost:** Limited to 6 languages. Rust/Go work well; no Java, Kotlin, Swift, C#, or PHP support yet.
- **Mitigation:** Hash and Diff routes cover all languages. AST is a best-effort optimization, not a requirement.

### 2. SHA-256 for Content Identity (not line numbers, not CRC)
- **Why:** SHA-256 is the standard for content verification. Collision-resistant, fast, and universally understood. Line numbers drift. CRCs are weak.
- **Cost:** Must read the file to compute the hash. Cannot hash without I/O.
- **Mitigation:** `read-many` returns both content and hash in one call. Cached by the agent.

### 3. LCS for Diff (not Myers, not Patience)
- **Why:** LCS is simple, well-understood, and sufficient for search-and-replace with fuzzy matching. Myers and Patience are better for human diffs but overkill for machine-driven replacements.
- **Cost:** O(n²) on old+new content size. Long files with many changes hit quadratic behaviour.
- **Mitigation:** Content lengths are bounded by file size; typical edits are small (1-50 lines).

### 4. 3-Tier Routing (not just one strategy)
- **Why:** No single strategy works for all files and all edits. AST requires a supported language. Hash requires knowing the old content. Diff is the catch-all.
- **Cost:** Routing logic adds complexity to the codebase.
- **Mitigation:** The router is a simple decision tree (~100 lines). Defaults are safe for all cases.

### 5. Telemetry-First Design (not bolt-on)
- **Why:** AI agents are non-deterministic. Telemetry is the only way to know if edits are working correctly. Every CLI command records an event.
- **Cost:** Logs to `~/.agentic-tools/logs/` — disk usage proportional to usage.
- **Mitigation:** Health reports provide actionable signals (stale-anchor rate, diff-fallback rate).

### 6. Provenance as First-Class Concern (not afterthought)
- **Why:** AI-generated changes need audit trails. Teams need to know which agent changed what and why.
- **Cost:** Every edit records additional metadata. Adds storage overhead.
- **Mitigation:** Provenance data is queryable per file/line — indexed for fast retrieval.

---

## Language Support Matrix

| Language | Extensions | AST Ops | Hash Ops | Diff Ops |
|----------|-----------|---------|----------|----------|
| TypeScript | `.ts` (not `.d.ts`) | All 7 | ✓ | ✓ |
| TSX | `.tsx` | All 7 | ✓ | ✓ |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | All 7 | ✓ | ✓ |
| Python | `.py` | All 7 | ✓ | ✓ |
| Go | `.go` | All 7 | ✓ | ✓ |
| Rust | `.rs` | All 7 | ✓ | ✓ |
| Any other | any | — | ✓ | ✓ |

---

## Configuration Reference

```json
{
  "routePolicy": {
    "languageOverrides": {
      "python": "hash",
      "javascript": "ast"
    },
    "operationOverrides": {
      "add-import": "diff",
      "replace-body": "ast"
    },
    "conflictResolution": "operation"
  },
  "telemetry": {
    "enabled": true,
    "logDir": "~/.agentic-tools/logs"
  },
  "provenance": {
    "enabled": true,
    "storageDir": "~/.agentic-tools/provenance"
  }
}
```

Merge priority: `env var` → `CLI --config` → `.hashpilot.json` → `~/.config/hashpilot/config.json` → defaults.

Route policies:
- `languageOverrides`: force a route for a specific language (e.g., Python → hash)
- `operationOverrides`: force a route for a specific operation (e.g., add-import → diff)
- `conflictResolution`: when language and operation rules conflict — `"language"`, `"operation"`, or `"strictest"` (the most restrictive wins)

---

## Adapters

HashPilot integrates with three coding agent platforms via the [Adapter Contract](ADAPTER-CONTRACT.md):

| Platform | Mechanism | Files |
|----------|-----------|-------|
| **Claude Code** | CLAUDE.md injection | `~/.claude/CLAUDE.md` + agent bindings |
| **OpenCode** | Skill + subagent | `~/.config/opencode/skills/hashpilot/` + `~/.config/opencode/agent/hashpilot.md` |
| **Pi** | Native extension | `~/.pi/agent/extensions/hashpilot.ts` + 7 custom tools |

Each adapter teaches the agent to use `structured-edit` commands instead of raw file editing.

---

## Telemetry & Health

### Event Schema
```json
{
  "ts": "2026-06-11T20:12:45Z",
  "operation": "replace-hash",
  "route": "hash",
  "file": "src/main.ts",
  "language": "typescript",
  "success": true,
  "elapsed_ms": 42,
  "actor": "claude",
  "taskId": "abc123",
  "reason": "Refactor port to config"
}
```

### Health Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Stale-anchor rate | >10% | >25% |
| Diff fallback rate | >15% | >30% |
| Verify failure rate | >5% | >15% |
| Per-language failure | >10% | >20% |

### Trend Tracking
Health reports compare the current window against the previous window (same duration). Worsening trends are flagged even if absolute rates are below thresholds.

---

## Error Handling

### Error Codes
| Code | Meaning | Recovery |
|------|---------|----------|
| `PARSE_ERROR` | Could not parse file | Fall back to hash route |
| `SYMBOL_NOT_FOUND` | Symbol not in tree | Fall back to hash route |
| `STALE_ANCHOR` | Hash mismatch (file changed) | Auto-recover: re-read and retry |
| `FILE_NOT_FOUND` | File does not exist | Return error to agent |
| `UNSUPPORTED_LANGUAGE` | AST not available | Fall back to hash route |
| `AMBIGUOUS_MATCH` | Diff found N > 1 matches | Return disambiguation hints |
| `VERIFY_FAILED` | Post-edit verification failed | Auto-revert (if configured) |

### Recovery Strategy
- **Stale anchors:** Re-read the file, compute new hash, retry the edit. If still stale, report error.
- **Failed verifies:** If `--revert-on-fail` is set, undo the edit. Otherwise, return error with verify output.
- **Parse errors:** Router automatically falls back down the tier (AST → Hash → Diff).

---

## Future Directions

### Planned
- **More AST languages:** Java, Kotlin, PHP, C#, Swift (blocked on tree-sitter grammar quality)
- **Batch verification:** Parallel verify across changed files
- **Provenance UI:** Web-based timeline of agent edits

### Exploratory
- **Intent library:** Pre-built intents for common refactoring patterns
- **Learning mode:** Telemetry-driven route optimization (auto-select best route based on success rates)
- **Stale-anchor prediction:** Warn before stale anchor occurs (based on file change frequency)

---

## Post-Deploy Verification

Every deploy to GitHub Pages **must** be verified with browser automation:

```yaml
# In gh-pages.yml — after peaceiris/actions-gh-pages
- name: Verify site with browser automation
  run: |
    SITE_URL="https://bigknoxy.github.io/HashPilot/"
    agent-browser open "$SITE_URL"
    agent-browser wait --load networkidle
    TITLE=$(agent-browser eval "document.title")
    HAS_PILOT=$(agent-browser eval "document.body.innerText.includes('HashPilot')")
    if [ "$HAS_PILOT" = "true" ]; then
      echo "✓ Site verified — $TITLE"
    else
      echo "✗ Verification failed"
      agent-browser screenshot /tmp/deploy-failed.png
      exit 1
    fi
    agent-browser screenshot /tmp/deploy-verified.png
    agent-browser close
```

**Why:** `curl` alone cannot verify JavaScript-rendered SPAs, console errors, or layout issues. Browser automation catches: broken assets, missing content, JS errors, incorrect routing, and visual regressions.

**Rule:** A deploy is not complete until browser verification passes with evidence (screenshot + text assertion). The verification must check for the correct branding/content on the live URL.

---

## How to Update This Document

1. **When adding a new module:** Update the Module Architecture section. Add the module file to the table.
2. **When changing routing logic:** Update the Router description. Note any new route policies.
3. **When adding a new language:** Update the Language Support Matrix.
4. **When changing the edit cycle:** Update the Data Flow section.
5. **Every PR that touches `src/`:** Confirm that README.md and/or ARCHITECTURE.md reflects the change.
6. **After every deploy:** Browser-verify the live site (see Post-Deploy Verification above).

The CI check `docs-verify` enforces rule 5 — if `src/` files change but neither landing nor design doc changes, the PR fails.
