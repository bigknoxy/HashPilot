# HashPilot

**Deterministic structured editing for AI coding agents.**

HashPilot is a global, tool-agnostic structured editing core that replaces fuzzy text editing with precision operations — hash-anchored replacements, AST-aware refactors, and batched verification — all accessible via a single CLI (`structured-edit`). Built for Claude Code, OpenCode, Pi, Codex CLI, and any agent that edits files.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun_1.2%2B-black)](https://bun.sh)
[![Tree-sitter](https://img.shields.io/badge/ast-tree--sitter-green)](https://tree-sitter.github.io)

---

## Why HashPilot Exists

### The Problem

AI coding agents edit files fundamentally differently than humans. They don't have an IDE, they can't visually locate the right line, and they don't keep a working memory of the file structure. Yet most tools expect agents to edit the same way a human would:

- **Line counting errors** — "Replace line 42" is brittle. One added import shifts every line number.
- **Fuzzy find-replace** — Agents guess content to match, which either fails to find it (wasted retry) or matches the wrong occurrence (silent corruption).
- **Race conditions** — Multiple edits to the same file can interleave and produce invalid syntax.
- **No verification** — After an edit, agents move on. There's no built-in check that the code compiles or tests pass.

The result: 3–5 retries per edit, token waste, and hard-to-debug corruption.

### The Solution

HashPilot replaces guesswork with cryptography and syntax analysis:

- **Hash-anchored edits** identify content by its SHA-256 hash — if the hash matches, you're editing the right content. No ambiguity.
- **AST operations** use tree-sitter to understand code structure — rename a symbol everywhere, replace a function body, add or remove imports without counting lines.
- **Stale anchor detection** catches race conditions and out-of-date edits before they corrupt files.
- **Automatic recovery** — when a hash is stale (file changed since read), HashPilot transparently re-applies the edit to the current content.
- **Intents (M5)** — describe what you want (e.g., `"add a parameter to a function"`) and HashPilot plans the multi-file edit, discovers call sites, and executes every step.
- **Provenance tracking** — every edit records who, what, when, and why, queryable like `git blame` for agent edits.
- **Verification batching** — run formatter, linter, type checker, and tests in one command, with optional revert-on-failure.

---

## Who Benefits

**AI Coding Agents**
Claude Code, OpenCode, Pi, Codex CLI, Cursor, and any agent that edits source files gets deterministic, verifiable edit operations. No more guessing line numbers or retrying fuzzy searches.

**Developers Using AI Tools**
When your AI assistant uses HashPilot, edits work on the first try. No "oops, that was the wrong line" or "file looks corrupted." You get auditable, safe modifications.

**Teams That Need Reproducible Workflows**
Every edit is logged with telemetry and provenance data. Audit trails, rollback information, and impact analysis are built in — critical for regulated environments and CI pipelines.

**Tool Builders Creating Agent-Powered Workflows**
HashPilot exposes a JSON-protocol CLI that any agent can consume. The adapter contract (read → edit → verify → log) is language-agnostic and composable. Build your own skills, agents, and automations on top.

---

## The Benefit

| Dimension | Without HashPilot | With HashPilot |
|-----------|------------------|----------------|
| **Precision** | Fuzzy search matches wrong content | SHA-256 hash anchors guarantee correct content |
| **Safety** | Silent corruption on race conditions | Stale anchor detection blocks or auto-recovers |
| **Speed** | 3–5 retries per edit, re-reading files | 1–2 operations per edit, no re-reading |
| **Complex refactors** | Manual multi-file search-and-replace | `rename-symbol` across files, plan-and-execute intents |
| **Verification** | None — agent moves on | Bundled formatter + linter + typecheck + tests with revert |
| **Auditability** | No record of what changed | Full telemetry + provenance query (`structured-edit provenance query`) |
| **Token efficiency** | Wastes tokens on retries and re-reads | One `read-many` + one `replace-hash` = done |
| **Language support** | Text-based, any language | AST support for TypeScript, TSX, JavaScript, Python, Go, Rust |

---

## How to Use It

### Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/install.sh | sh
```

This clones the repo, installs dependencies, creates the `structured-edit` CLI, adds it to PATH, and configures integration for Claude Code, OpenCode, and Pi — all user-scoped (no sudo required).

**Requirements:** [Bun](https://bun.sh) 1.2+

```bash
# Verify installation
structured-edit doctor

# View configuration
structured-edit config
```

> **One-Line Uninstall:**
> ```bash
> curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/uninstall.sh | sh -s -- -f
> ```

---

### Core Workflow

The canonical HashPilot flow is: **Read → Edit → Verify**.

#### 1. Read files with hashes

```bash
# Batch read — get content + SHA-256 hash for every file
structured-edit read-many src/core/read.ts src/core/hash-edit.ts

# Read a specific line with context hash
structured-edit read-hash src/core/read.ts 10 -c 3
```

The hash from `read-many` is your anchor. As long as the file content hasn't changed, that hash uniquely identifies it.

#### 2. Edit with precision

**Hash-anchored replacement** (any file, any language):

```bash
# Replace entire file content
HASH=$(structured-edit read-many myfile.ts | jq -r '.[0].hash')
structured-edit replace-hash myfile.ts "$HASH" "// new content"

# Replace a specific line range
structured-edit replace-hash myfile.ts "$HASH" "  port: 8080" --range 5:6

# Preview without writing
structured-edit replace-hash myfile.ts "$HASH" "new content" --dry-run
```

**AST operations** (TypeScript, TSX, JavaScript, Python, Go, Rust):

```bash
# Find all symbols in a file
structured-edit ast find-symbols src/utils.ts

# Rename a symbol everywhere in the file
structured-edit ast rename-symbol src/utils.ts oldName newName

# Replace a function body
structured-edit ast replace-body src/utils.ts formatDate 'return new Date(d).toISOString();'

# Add or remove imports
structured-edit ast add-import src/utils.ts "{ Foo } from './bar'"
structured-edit ast remove-import src/utils.ts './bar'

# Insert before or after a symbol
structured-edit ast insert-before src/utils.ts myFunction "// helper\n"
structured-edit ast insert-after src/utils.ts myFunction "\n// end helper\n"
```

**Diff operations** (fallback for unsupported languages):

```bash
# Generate a unified diff
structured-edit diff generate myfile.ts "old content" "new content"

# Apply a patch with fuzzy matching
structured-edit diff apply myfile.ts --patch changes.patch --fuzzy 3
```

#### 3. Verify

```bash
# Run formatter + linter + typecheck + tests
structured-edit verify-changes src/utils.ts --formatter prettier --linter eslint

# Auto-detect tools from project config
structured-edit verify-changes src/*.ts --auto-detect

# Filter specific tests
structured-edit verify-changes src/utils.ts --test-filter "formatDate"

# Revert on failure
structured-edit verify-changes src/utils.ts --auto-detect --revert-on-failure
```

---

### Advanced Features

#### Multi-file Batch Editing

Apply the same edit to many files in parallel:

```bash
# Rename a symbol across multiple TypeScript files
structured-edit batch rename-symbol src/*.ts --old-name oldName --new-name newName

# Parallel execution (default)
structured-edit batch add-import src/**/*.ts --import-spec "{ z } from 'zod'"

# Serial execution for dependent files
structured-edit batch replace-body src/*.ts --symbol handleError --new-body @newBody.txt --serial
```

#### Routing — AST → Hash → Diff

HashPilot automatically chooses the best edit strategy for every operation:

```
  ┌─────────────┐
  │  Your Edit   │
  └──────┬──────┘
         │
         ▼
  ┌──────────────────┐
  │  1. AST Route    │  ◄── Tree-sitter syntax-aware edits
  │  (TS/TSX/JS/     │      rename-symbol, replace-body,
  │   Python/Go/Rust)│      add-import, remove-import,
  │                  │      insert-before/after
  └────────┬─────────┘
           │ (unsupported)
           ▼
  ┌──────────────────┐
  │  2. Hash Route   │  ◄── SHA-256 anchored replacement
  │  (any file type) │      replace-hash with stale-anchor
  │                  │      detection and auto-recovery
  └────────┬─────────┘
           │ (no hash)
           ▼
  ┌──────────────────┐
  │  3. Diff Route   │  ◄── LCS-based search-and-replace
  │  (fallback)      │      with duplicate detection and
  │                  │      fuzzy matching
  └──────────────────┘
```

Preview which route will be used:

```bash
structured-edit route src/main.ts rename-symbol
# → { route: "ast", language: "typescript", ... }

# Test policy overrides
structured-edit route src/main.py rename-symbol --policy '{"languageOverrides":{"python":"hash"}}'
# → { route: "hash", policyApplied: true, ... }
```

Policies can force specific routes per language or operation via config:

```json
{
  "routePolicy": {
    "languageOverrides": { "python": "hash" },
    "operationOverrides": { "add-import": "diff" }
  }
}
```

#### Intents — Declarative Multi-File Edits (M5)

Describe the edit you want and let HashPilot plan and execute the full multi-file refactor:

```bash
# Add a parameter to a function — discovers definition and all call sites
structured-edit intent '{
  "operation": "add-parameter",
  "symbol": "processData",
  "param": { "name": "config", "type": "Config", "default": "{}" }
}'

# Rename an exported symbol everywhere it's used
structured-edit intent '{
  "operation": "rename-exported-symbol",
  "symbol": "calculateTotal",
  "newName": "computeTotal"
}'

# Preview the plan without executing
structured-edit intent '{...}' --dry-run
```

Intents produce a full `EditPlan` with blast radius summary, ordered steps, and reference discovery — then execute every step with optional verification and revert-on-failure.

#### Provenance — `git blame` for Agent Edits

Every edit records who changed what and why:

```bash
# Show edit history for a file
structured-edit provenance query src/utils.ts --human

# Filter to a specific line
structured-edit provenance query src/utils.ts 15 --human

# View a whole changeset
structured-edit provenance changeset <changeSetId> --human
```

Provenance fields (actor, task ID, reason) are passed via CLI flags:

```bash
structured-edit replace-hash src/config.ts "$HASH" "new config" \
  --actor "claude-code" --task-id "PROJ-123" --reason "Update database config"
```

#### Telemetry and Health Monitoring

All operations are logged to structured JSONL for debugging and health analysis:

```bash
structured-edit telemetry summary          # Operation counts and timing
structured-edit telemetry show -n 50       # Last 50 events
structured-edit telemetry health -w 7      # 7-day health report with threshold warnings
structured-edit telemetry health -w 7 --trend  # Compare to previous window
structured-edit telemetry clear            # Clear log
```

The health report includes per-language failure rates, stale-anchor rates, verify-changes pass rates, and automatic threshold warnings (stale anchors > 10%, diff fallback > 10%, verify failures > 20%).

---

### All Commands

| Command | Description |
|---------|-------------|
| `doctor` | Verify HashPilot installation health |
| `config` | Show merged configuration (global → project → CLI → env) |
| **Read & Search** | |
| `read-many <files...>` | Batch read files with SHA-256 content hashes |
| `read-hash <file> <line>` | Read a specific line with context hash |
| `grep-many <pattern> <paths...>` | Regex search across files |
| `symbol-lookup-many <paths...> --names n1,n2` | Find symbol definitions by name |
| **Edit — Hash Route** | |
| `replace-hash <file> <hash> <content>` | Replace content identified by hash anchor (auto-recovers on stale anchor) |
| **Edit — AST Route** | |
| `ast capabilities` | Show supported languages, operations, and limitations |
| `ast find-symbols <file>` | List all symbols (functions, classes, variables) in a file |
| `ast rename-symbol <file> <old> <new>` | Rename a symbol and all its references |
| `ast replace-body <file> <symbol> <body>` | Replace a function/method body |
| `ast add-import <file> <spec>` | Add an import statement with grouped-import merging |
| `ast remove-import <file> <spec>` | Remove an import statement |
| `ast insert-before <file> <symbol> <content>` | Insert content before a named symbol |
| `ast insert-after <file> <symbol> <content>` | Insert content after a named symbol |
| **Edit — Diff Route** | |
| `diff generate <file> <old-content> <new-content>` | Generate a unified diff |
| `diff apply <file> --patch <patch>` | Apply a unified diff patch with fuzzy matching |
| **Unified Entry Point** | |
| `route-edit <file> <operation>` | Auto-routed edit through AST → Hash → Diff pipeline |
| `batch <operation> <files...>` | Apply same edit to multiple files (parallel or serial) |
| `intent <json>` | Declarative multi-file edit — plan, discover references, execute |
| `route <file> <operation>` | Show which route would be chosen with detailed explanation |
| **Verification** | |
| `verify-changes <files...>` | Run formatter + linter + typechecker + tests with auto-detection and revert-on-failure |
| **Telemetry** | |
| `telemetry show [-n <count>]` | Recent telemetry events |
| `telemetry summary` | Operation counts and timing |
| `telemetry health [-w <days>] [--trend]` | Health report with per-language stats, threshold warnings, and trend comparison |
| `telemetry sessions` | List session summaries |
| `telemetry export [--from <date>] [--to <date>]` | Export events as NDJSON |
| `telemetry prune --older-than <days>` | Delete old rotated telemetry files |
| `telemetry clear` | Clear telemetry log |
| **Provenance** | |
| `provenance query <file> [line]` | Edit history for a file (like `git blame` for agent edits) |
| `provenance changeset <id>` | All edits in a changeSet |

> **Tip:** All commands accept `--actor`, `--task-id`, and `--reason` flags for provenance tracking. Every command outputs structured JSON for agent consumption.

---

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     structured-edit CLI                      │
│                    (Commander-based, Bun)                    │
└──────────┬──────────┬──────────┬──────────┬─────────────────┘
           │          │          │          │
     ┌─────▼────┐ ┌──▼───┐ ┌───▼───┐ ┌───▼──────┐
     │  Read &   │ │ AST  │ │ Hash  │ │  Diff    │
     │  Search   │ │ Ops  │ │ Ops   │ │  Ops     │
     │ (read,    │ │(tree-│ │(SHA-  │ │(unified  │
     │  grep,    │ │sitter│ │256    │ │ diff,    │
     │  symbol)  │ │ ops) │ │anchor)│ │ patch)   │
     └───────────┘ └──────┘ └───────┘ └──────────┘
           │          │        │           │
           ▼          ▼        ▼           ▼
     ┌──────────────────────────────────────────────┐
     │            Router (auto-select)               │
     │  chooseRoute(): AST → Hash → Diff             │
     │  routeEdit(): execute + telemetry + provenance │
     └──────────────────────┬────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
     ┌───────────┐ ┌──────────────┐ ┌────────────┐
     │ Intent/M5 │ │ Batch Edit   │ │ Verify     │
     │ Plan +    │ │ (parallel or │ │ (formatter, │
     │ Execute   │ │  serial)     │ │ linter, ts, │
     └───────────┘ └──────────────┘ │ tests)      │
                                    └────────────┘
              ┌──────────────────────────────────────┐
              │      Cross-Cutting Layers             │
              │  • Telemetry (JSONL logging)          │
              │  • Provenance (agent git blame)       │
              │  • Config (env → CLI → project → global)│
              │  • Error codes & exit codes           │
              └──────────────────────────────────────┘
```

**Key modules:**

| Module | Responsibility |
|--------|---------------|
| `cli.ts` | Commander-based CLI entry point — every command records telemetry |
| `router.ts` | Route selection (`chooseRoute`) and unified dispatch (`routeEdit`) with auto AST → Hash → Diff fallback |
| `ast-edit.ts` | Tree-sitter parsing, symbol finding, rename, body replacement, import add/remove, insert |
| `hash-edit.ts` | SHA-256 anchored content replacement with stale-anchor auto-recovery |
| `diff-engine.ts` | LCS-based unified diff generation and patch application with fuzzy matching |
| `read.ts` | Batch file reads with SHA-256 hashes and line-level context hashes |
| `grep.ts` | Regex search via system grep and symbol definition lookup |
| `intent.ts` | Parses structured intents, resolves symbol definitions and references, generates EditPlan |
| `plan-executor.ts` | Executes EditPlan steps with dry-run, verify, and revert-on-failure |
| `verify.ts` | Runs formatter, linter, typechecker, tests — auto-detects tools from project config |
| `provenance.ts` | Edit history tracking with changeSet IDs — `provenanceQuery(file, line?)` |
| `telemetry.ts` | JSONL telemetry logging with health reports and trend comparison |
| `config.ts` | Layered config (env var → CLI → project → global → defaults) |
| `batch-edit.ts` | Parallel and serial batch editing |
| `doctor.ts` | Full installation health check |

**AST language support:**

| Language | File extensions | Operations |
|----------|----------------|------------|
| TypeScript | `.ts` (not `.d.ts`) | All 7 AST operations |
| TSX | `.tsx` | All 7 AST operations |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | All 7 AST operations |
| Python | `.py` | All 7 AST operations |
| Go | `.go` | All 7 AST operations |
| Rust | `.rs` | All 7 AST operations |

---

### Integration

HashPilot integrates natively with the three major coding agent platforms:

#### Claude Code

The installer appends a HashPilot section to `~/.claude/CLAUDE.md`, teaching Claude to use `structured-edit` commands as shell tools. Claude automatically prefers AST operations for supported languages and hash-anchored edits for everything else.

[→ Full Claude integration guide](docs/INTEGRATION-CLAUDE.md)

#### OpenCode

HashPilot installs as both a **skill** (inline guidance at `~/.config/opencode/skills/hashpilot/SKILL.md`) and a **subagent** (delegated editing at `~/.config/opencode/agent/hashpilot.md`). OpenCode auto-discovers both from its config directory.

```bash
# In OpenCode, delegate complex multi-file edits
/agent hashpilot
Rename the function 'processData' to 'transformData' across all files.
```

[→ Full OpenCode integration guide](docs/INTEGRATION-OPENCODE.md)

#### Pi

HashPilot installs as a **native Pi extension** (`~/.pi/agent/extensions/hashpilot.ts`) that registers 7 custom tools (`hashpilot_read`, `hashpilot_search`, `hashpilot_replace_hash`, `hashpilot_ast`, `hashpilot_verify`, etc.) and a `/hp` slash command — all available in every Pi session.

[→ Full Pi integration guide](docs/INTEGRATION-PI.md)

#### Adapter Contract

All integrations follow the same [Adapter Contract](docs/ADAPTER-CONTRACT.md) — a machine-readable JSON protocol that any agent or tool can consume. Every command returns structured JSON with consistent error handling, exit codes, and telemetry.

---

### Documentation

- [Installation Guide](docs/INSTALL.md) — Full install options, project structure, troubleshooting
- [Adapter Contract](docs/ADAPTER-CONTRACT.md) — JSON protocol reference for all commands
- [Claude Code Integration](docs/INTEGRATION-CLAUDE.md)
- [OpenCode Integration](docs/INTEGRATION-OPENCODE.md)
- [Pi Integration](docs/INTEGRATION-PI.md)

---

### Development

```bash
git clone https://github.com/bigknoxy/HashPilot.git
cd HashPilot
bun install
bun test              # Run all tests
bun run build         # Build CLI to dist/
bun run build && structured-edit doctor  # Build + health check
```

Run a single test file:

```bash
bun test tests/router.test.ts
bun test tests/hash-edit.test.ts
bun test -t "test name pattern"
```

---

### Configuration

HashPilot uses a layered config system. Override priority (highest wins):

1. `HASHPILOT_ROUTE_POLICY` environment variable
2. `--config <path>` CLI flag
3. `.hashpilot.json` in project root
4. `~/.config/hashpilot/config.json`
5. Built-in defaults

```json
{
  "routePolicy": {
    "languageOverrides": { "python": "hash" },
    "operationOverrides": { "add-import": "diff" },
    "conflictResolution": "operation"
  },
  "telemetry": {
    "enabled": true
  }
}
```

---

### License

MIT — see [LICENSE](LICENSE) for details.

---

### Project Status

HashPilot is in active development (v0.1.0). The core editing engine, AST operations, telemetry, and all three adapter integrations are production-ready. Intent-based editing (M5) and provenance tracking (M6) are available as preview features.
