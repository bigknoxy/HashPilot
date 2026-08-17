# HashPilot — Deterministic Structured Editing for AI Coding Agents

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun_1.2%2B-black)](https://bun.sh)
[![Tree-sitter](https://img.shields.io/badge/ast-tree--sitter-green)](https://tree-sitter.github.io)
[![Tests](https://img.shields.io/badge/tests-96%25_coverage-brightgreen)](tests/)
[![Live Site](https://img.shields.io/badge/site-gh--pages-blue)](https://bigknoxy.github.io/HashPilot/)

**AI agents edit code blind. HashPilot gives them cryptographic certainty.**

Landing page: **[https://bigknoxy.github.io/HashPilot/](https://bigknoxy.github.io/HashPilot/)**
Architecture: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** · CLI reference: **[docs/CLI-QUICKREF.md](docs/CLI-QUICKREF.md)** · Roadmap & backlog: **[ROADMAP.md](ROADMAP.md)**

Every edit is anchored by a SHA-256 hash — not a fragile line number or a fuzzy text match. If the hash matches, you're editing the right content. No guessing, no retries, no silent corruption.

---

## What This Is

HashPilot is a CLI (`hashpilot`) and editing protocol that replaces fuzzy text editing with precision operations:

- **Hash-anchored replacement** — target content by its cryptographic fingerprint
- **AST-aware refactoring** — rename symbols, replace function bodies, manage imports (TypeScript, JS, Python, Go, Rust)
- **Stale-anchor detection** — catch race conditions before they corrupt files
- **Plan-and-execute intents** — describe a multi-file change, HashPilot discovers call sites and executes every step
- **Provenance tracking** — every edit records who, what, when, and why (like `git blame` for agents)

It's a global, tool-agnostic core. Claude Code, OpenCode, Pi, Codex CLI, Cursor — any agent that edits files.

---

## Why This Exists

### The Pain (If You're an Agent Editing Code)

You're editing files fundamentally differently than a human. You don't have an IDE. You can't visually locate the right line. You don't keep a working memory of the file structure. Yet most tools expect you to edit the same way a human would:

| Problem | What Happens | Cost |
|---------|-------------|------|
| **Line counting** | `"Replace line 42"` breaks when one import shifts every line | +3 retries, corrupted file |
| **Fuzzy find-replace** | Guess the right text to match — or match the wrong occurrence | Silent corruption, wasted tokens |
| **Race conditions** | Two edits to the same file interleave | Invalid syntax, agent confusion |
| **No verification** | Edit, move on. No check that it compiles | Bug ships to production |

### The Remedy

| HashPilot Feature | What It Does | For Whom |
|------------------|-------------|----------|
| SHA-256 anchors | Target content by its fingerprint — not a line number | **Agents** — never edit the wrong content |
| 3-tier routing | AST → Hash → Diff. Auto-selects the best strategy per file+op | **Agents** — one command, right tool |
| Stale recovery | Detects out-of-date edits and re-applies transparently | **Agents** — survive race conditions |
| Intents (M5) | `"Add a parameter to processData"` → discovers call sites, plans, executes | **Agents** — multi-file refactors in one shot |
| Verification bundling | Run formatter + linter + typechecker + tests in one command | **Developers** — know it works |
| Provenance | `provenance query src/utils.ts` shows edit history per line | **Teams** — audit trail for AI changes |
| Telemetry | Structured JSONL with health reports and trend analysis | **Operators** — monitor agent edit reliability |

---

## Who It's For

### 👤 You, the Developer

You use AI coding agents to ship faster. When your agent uses HashPilot:

- **Edits work on the first try.** No more "oops, that was the wrong line."
- **Every change is auditable.** Provenance tells you who changed what and why.
- **You can trust AI refactors.** Multi-file renames execute correctly across your whole codebase.
- **It's invisible.** The agent uses HashPilot automatically — you just see better results.

### 🤖 You, the AI Agent

You edit source files every time a user asks for a change. With HashPilot:

- **You know the hash is correct.** `replace-hash` targets content by its SHA-256 fingerprint. No ambiguity.
- **You don't need to re-read the file.** The hash from `read-many` is valid until the file changes. That's one less API round-trip.
- **AST edits are syntax-safe.** `rename-symbol`, `replace-body`, `add-import` — tree-sitter guarantees the edit is structurally valid.
- **Intents handle the blast radius.** One `intent` command handles definition + all call sites + verification.
- **Telemetry tells you when something's wrong.** Stale-anchor rates, per-language failure rates, verify pass rates — all queryable.

### 🏢 You, the Engineering Team

You need reproducible, auditable AI workflows:

- **Provenance = compliance.** Every edit logged with actor, task ID, and reason.
- **Config = consistency.** Team-wide route policies in `.hashpilot.json`.
- **Batch = scale.** Same edit applied across 100+ files, parallel or serial.
- **Verify = confidence.** Auto-detect project tools, run checks, revert on failure.

---

## Quick Start

### One-Line Install (auto-installs Bun if missing)

```bash
curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/install.sh | bash
```

**What it does:** Downloads HashPilot, auto-installs Bun 1.2+ if not present, installs all dependencies, configures adapters for **Claude Code**, **OpenCode**, and **Pi** automatically.

<details>
<summary><strong>📋 Copy-paste for your agent's install method</strong></summary>

**For any agent that runs shell commands:**
```bash
curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/install.sh | bash
```

**For agents with a "run command" or "execute" tool:**
```json
{
  "command": "curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/install.sh | bash",
  "description": "Install HashPilot structured editing CLI"
}
```

**Claude Code:** The installer adds HashPilot commands to `~/.claude/CLAUDE.md` automatically.

**OpenCode:** The installer adds the skill at `~/.config/opencode/skills/hashpilot/` and subagent at `~/.config/opencode/agent/hashpilot.md`.

**Pi:** The installer adds the extension at `~/.pi/agent/extensions/hashpilot.ts` with `/hp` slash command.

</details>

### Upgrade

```bash
hashpilot upgrade          # upgrade to latest from main
hashpilot upgrade --dry-run  # preview what would happen
```

### Uninstall

```bash
hashpilot uninstall              # remove everything (prompts for confirmation)
hashpilot uninstall --keep-config  # remove binaries, keep config + telemetry
hashpilot uninstall --dry-run    # preview what would be removed
hashpilot uninstall --force      # skip confirmation prompt
```

### Runtime support matrix

HashPilot is Bun-only today. The core uses Bun APIs and ships as TypeScript source, so
there is no Node-compatible build yet.

| Runtime | Supported | Notes |
|---------|-----------|-------|
| Bun ≥ 1.2 | ✅ | The only supported runtime. Enforced by `engines.bun`. |
| Bun < 1.2 | ❌ | `npm`/`bun` warn at install time via `engines`. |
| Node.js (any version) | ❌ | `hashpilot` exits **127** with an install message pointing at https://bun.sh. |

The `hashpilot` binary is a small CommonJS shim (`src/cli-node.cjs`) that any Node can
parse. It hands off to Bun and forwards Bun's exit status unchanged, so a Node-only machine
gets one actionable line instead of a syntax-error stack trace.

```bash
# Verify it works (human-readable summary; add --json for machine output)
hashpilot doctor
hashpilot doctor --json

# See your merged config
hashpilot config
```

### Your First Edit

```bash
# 1. Read a file — get its content hash
hashpilot read-many src/main.ts

# 2. Edit by hash — target the exact content
HASH="abc123..."  # from read-many output
hashpilot replace-hash src/main.ts "$HASH" "  port: 8080" --range 5:5

# 3. Verify nothing broke
hashpilot verify-changes src/main.ts --auto-detect
```

---

## How It Works

### The 3-Tier Routing Model

```
  ┌─────────────┐
  │  Your Edit   │
  └──────┬──────┘
         │
         ▼
  ┌──────────────────────┐
  │  1. AST Route        │  ◄── tree-sitter syntax-aware edits
  │  (TS/TSX/JS/Python/  │      rename-symbol, replace-body,
  │   Go/Rust)           │      add-import, remove-import,
  │                      │      insert-before/after
  └──────────┬───────────┘
             │ unsupported
             ▼
  ┌──────────────────────┐
  │  2. Hash Route       │  ◄── SHA-256 anchored replacement
  │  (any file)          │      replace-hash with stale-anchor
  │                      │      detection + auto-recovery
  └──────────┬───────────┘
             │ no hash provided
             ▼
  ┌──────────────────────┐
  │  3. Diff Route       │  ◄── LCS-based search-and-replace
  │  (fallback)          │      with duplicate detection and
  │                      │      fuzzy matching
  └──────────────────────┘
```

The router auto-selects. A single `route-edit` command tries AST first, falls back to Hash, then Diff. Every route records telemetry and provenance.

### The Canonical Flow

```
  ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │  read-  │    │ replace- │    │ verify-  │    │  done.   │
  │  many   │───▶│  hash    │───▶│ changes  │───▶│          │
  │         │    │          │    │          │    │          │
  │ hash:   │    │ content  │    │ lint     │    │ audited, │
  │ abc123  │    │ matched  │    │ typecheck│    │ verified │
  └─────────┘    │ by hash  │    │ tests    │    └──────────┘
                 └──────────┘    │ revert?  │
                                 └──────────┘
```

**Read → Edit → Verify.** Every step outputs structured JSON for agent consumption.

---

## Commands

### Read & Search

| Command | What It Does |
|---------|-------------|
| `read-many <files...>` | Batch read files with SHA-256 content hashes |
| `read-hash <file> <line>` | Read a specific line with context hash |
| `grep-many <pattern> <paths...>` | Regex search across files |
| `symbol-lookup-many <paths...> --names n1,n2` | Find symbol definitions by name |

### Upgrade

| Command | What It Does |
|---------|-------------|
| `upgrade [--dry-run] [--channel <branch>] [--target <dir>] [--keep-telemetry] [--force]` | Upgrade HashPilot from GitHub to latest version |

### Edit — Hash Route

| Command | What It Does |
|---------|-------------|
| `replace-hash <file> <hash> <content>` | Replace content identified by SHA-256 hash (auto-recovers on stale anchor) |

### Undo

| Command | What It Does |
|---------|-------------|
| `changesets [--limit N]` | List undoable changeSets, newest first |
| `undo <changeSetId>` | Restore every file in a changeSet to its pre-edit contents |
| `undo --last` | Undo the most recent changeSet |

Every write goes to a sibling temp file, is `fsync`ed, and is renamed over the
target, so an interrupted write can never leave a truncated source file — a reader
sees either the whole old file or the whole new one, and the target's permissions
are preserved. Before the write, the file's original bytes are stored in a
content-addressed snapshot store under `~/.agentic-tools/snapshots/`, keyed by the
changeSet the invocation belongs to. `undo` refuses any file that changed after the
edit was applied unless `--force` is passed, and `--dry-run` reports without writing.
Retention defaults to 200 changeSets / 7 days, configurable under `snapshots` in
`.hashpilot.json`.

### Edit — AST Route

| Command | What It Does |
|---------|-------------|
| `ast capabilities` | Show supported languages, operations, and limitations |
| `ast find-symbols <file>` | List all symbols (functions, classes, variables) |
| `ast rename-symbol <file> <old> <new>` | Rename a symbol and all its references |
| `ast replace-body <file> <symbol> <body>` | Replace a function/method body |
| `ast add-import <file> <spec>` | Add an import with grouped-import merging |
| `ast remove-import <file> <spec>` | Remove an import statement |
| `ast insert-before <file> <symbol> <content>` | Insert content before a named symbol |
| `ast insert-after <file> <symbol> <content>` | Insert content after a named symbol |

AST edits are guarded at both ends. A file that does not already parse is refused
(`PARSE_ERROR`, exit 2, with the line and column of the break) rather than edited
against a tree tree-sitter had to error-recover; and every edit is reparsed before
anything reaches disk, so an edit that would corrupt a file that parsed cleanly is
discarded instead of written. The same post-edit check applies to hash and diff
edits whenever a parser exists for the language. `--allow-parse-errors` waives the
pre-check for deliberately editing a broken file; the post-check always stands.

There is no file-size ceiling. Through v3.0.0 every AST operation failed on any
source over 32KB — the binding's string-marshalling limit — which silently
demoted large files to the diff route.

### Edit — Diff Route (Fallback)

| Command | What It Does |
|---------|-------------|
| `diff generate <file> <old> <new>` | Generate a unified diff |
| `diff apply <file> --patch <patch>` | Apply a patch with fuzzy matching |

### Multi-File & Intents

| Command | What It Does |
|---------|-------------|
| `route-edit <file> <operation>` | Auto-routed edit through AST → Hash → Diff |
| `batch <operation> <files...>` | Same edit on many files in parallel or serial |
| `intent <json>` | Declarative multi-file edit — plan, discover references, execute |
| `route <file> <operation>` | Preview which route would be chosen |

`intent` never invents source text. If part of the intent cannot be computed —
`add-parameter` with no `param.default` leaves nothing to pass at the call
sites — it lists the gap under `plan.unresolved` (`file`, `operation`, `reason`,
`resolution`) and refuses the whole plan with `UNSUPPORTED_OPERATION` rather
than applying it halfway. Give the parameter a default, or pass `--yes` to
apply only the steps it could compute.

### Verification

| Command | What It Does |
|---------|-------------|
| `verify-changes <files...>` | Run formatter + linter + typechecker + tests with auto-detection and revert-on-failure |

### Telemetry & Provenance

| Command | What It Does |
|---------|-------------|
| `telemetry summary` | Operation counts and timing |
| `telemetry health [-w <days>] [--trend]` | Health report with per-language stats and threshold warnings |
| `telemetry sessions` | List session summaries |
| `provenance query <file> [line]` | Edit history for a file (like `git blame` for agent edits) |
| `provenance changeset <id>` | All edits in a changeSet |

> All commands accept `--actor`, `--task-id`, and `--reason` for provenance tracking. Every command outputs structured JSON.

---

## Output Envelope

Every command writes the same JSON shape to stdout, so an adapter has one parse path:

```json
{
  "apiVersion": "1",
  "ok": true,
  "command": "read-many",
  "data": [{ "path": "src/api.ts", "hash": "a1b2c3d4e5f6", "content": "...", "lines": 42 }],
  "error": null,
  "warnings": []
}
```

- `data` — the per-command payload (what used to sit at the top level).
- `error` — `null` when `ok`, else `{ code, message, recovery? }`. Branch on `code`, never on `message`.
- `warnings` — non-fatal notices: `ROUTE_FALLBACK` (the edit was downgraded to a less safe
  route), `ANCHOR_RELOCATED` (the anchor moved and the edit landed elsewhere),
  `TELEMETRY_LOG_CORRUPT`.
- `ok` is derived from the exit code below, so the two never disagree.

Schema: [`schema/hashpilot-envelope.schema.json`](schema/hashpilot-envelope.schema.json).
Raw modes for piping: `diff generate --raw`, `telemetry export --ndjson`.

**Breaking in v3.0.0** (from v2.x, which returned a different shape per command) — see
[`docs/ADAPTER-CONTRACT.md`](docs/ADAPTER-CONTRACT.md) for migration.

---

## Exit Codes

Every command exits with a stable code so agents and CI can branch on the result
without parsing text.

| Code | Meaning | What to do |
|------|---------|-----------|
| `0` | Success | Continue |
| `1` | Usage error — bad arguments, denied path, unsupported operation | Fix the invocation |
| `2` | Edit failed | Try another route or report |
| `3` | Stale anchor / precondition failed | **Retryable:** re-read and retry with the fresh hash |
| `4` | Verification failed (format/lint/test) | Inspect the verify output |
| `5` | I/O error | Check the path and permissions |
| `70` | Internal error | File a bug |

Batch commands return the worst code across all items.

---

## Where HashPilot Will Write

By default HashPilot only writes inside the project root (the nearest ancestor
containing `.git`). Anything else fails with `PATH_DENIED` and exit code `1`.

```bash
hashpilot --allowed-root /srv/generated ast rename-symbol ...   # widen for one run
hashpilot --allow-outside-root ...                              # disable containment
```

```json
{ "allowedRoots": ["/srv/generated"] }
```

Some locations are **never** writable, and neither `allowedRoots` nor
`--allow-outside-root` re-enables them: `~/.ssh`, `~/.aws`, `~/.gnupg`, `/etc`,
shell startup files (`~/.zshrc`, `~/.bashrc`, `~/.profile`), and HashPilot's own
telemetry log. Symlinks are resolved before the check, so a link inside the
project that points outside it is still refused.

---

## Telemetry and Privacy

HashPilot writes a local JSONL event log to `~/.agentic-tools/logs/`. Nothing is
ever sent off the machine.

**Turning it off** — highest priority first:

```bash
hashpilot --no-telemetry ast rename-symbol ...   # one invocation
export HASHPILOT_TELEMETRY=0                           # whole shell (also: false, off, no)
```

```json
{ "telemetry": { "enabled": false } }
```

**What is in the log.** Operation name, route, file path, language, success,
elapsed time, and any `--actor` / `--task-id` / `--reason` you pass. Source code
is *not* recorded by default: the log holds content hashes, not content.

**Diff capture is opt-in.** Setting `provenance.captureDiffs` records a unified
diff of each edit, which puts real source lines on disk in plaintext:

```json
{ "provenance": { "captureDiffs": true } }
```

Even then, files that are secret by definition are never diffed — `.env*`,
`*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa`/`id_ed25519`, `credentials`,
`.npmrc`, `.netrc`, `secrets.{yaml,json,toml}`. Their hashes still record *that*
the file changed.

**Redaction.** Everything written to the log is scrubbed for credential shapes
first — AWS keys, OpenAI/Anthropic/GitHub/Slack/Google tokens, JWTs, private-key
blocks, `Authorization` headers, passwords in connection strings, and any
`secret`/`token`/`password`/`api_key`-named assignment. Matches are replaced with
`[REDACTED]`. The log directory is created `0700` and the log file `0600`;
pre-existing logs from older versions are tightened on the next write.

---

## Integrations

HashPilot installs adapters for the three major coding agent platforms:

| Platform | What Gets Installed |
|----------|-------------------|
| **Claude Code** | HashPilot section injected into `~/.claude/CLAUDE.md` teaching Claude to use `hashpilot` commands |
| **OpenCode** | Skill at `~/.config/opencode/skills/hashpilot/` + subagent at `~/.config/opencode/agent/hashpilot.md` |
| **Pi** | Native extension at `~/.pi/agent/extensions/hashpilot.ts` with 7 custom tools and `/hp` slash command |

All adapters follow the [Adapter Contract](docs/ADAPTER-CONTRACT.md) — a machine-readable JSON protocol any agent can consume.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   hashpilot CLI                         │
│                  (Commander-based, Bun)                       │
├─────────┬──────────┬──────────┬──────────┬───────────────────┤
│   Read  │   AST    │   Hash   │   Diff   │  Verify + Batch   │
│  Search │  Ops     │   Ops    │   Ops    │  + Intent + Route │
├─────────┴──────────┴──────────┴──────────┴───────────────────┤
│                    Router (auto-select)                       │
│           chooseRoute(): AST → Hash → Diff                   │
│           routeEdit(): execute + telemetry + provenance       │
├──────────────────────────────────────────────────────────────┤
│              Cross-Cutting Layers                             │
│  • Telemetry (JSONL)   • Provenance (agent git blame)        │
│  • Config (env→CLI→project→global)  • Error/exit codes       │
└──────────────────────────────────────────────────────────────┘
```

**Key Modules:** `cli.ts` (entry), `router.ts` (dispatch), `ast-edit.ts` (tree-sitter), `hash-edit.ts` (SHA-256), `diff-engine.ts` (LCS), `read.ts`, `grep.ts`, `intent.ts` (M5), `plan-executor.ts`, `verify.ts`, `provenance.ts`, `telemetry.ts`, `config.ts`, `batch-edit.ts`, `doctor.ts`.

For deep design rationale, module internals, data flow, and all architecture decisions, see the **[design doc](docs/ARCHITECTURE.md)**.

**AST Language Support:**

| Language | Extensions | All 7 Operations |
|----------|-----------|-----------------|
| TypeScript | `.ts` (not `.d.ts`) | ✓ |
| TSX | `.tsx` | ✓ |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | ✓ |
| Python | `.py` | ✓ |
| Go | `.go` | ✓ |
| Rust | `.rs` | ✓ |

---

## Configuration

Layered config. Highest priority wins:

1. `HASHPILOT_ROUTE_POLICY` env var
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
  "telemetry": { "enabled": true },
  "provenance": { "captureDiffs": false },
  "allowedRoots": []
}
```

See [Telemetry and Privacy](#telemetry-and-privacy) and
[Where HashPilot Will Write](#where-hashpilot-will-write) for what those last two do.

---

## Development

```bash
git clone https://github.com/bigknoxy/HashPilot.git
cd HashPilot
bun install
bun test              # 424 tests
bun run build         # Build CLI to dist/
bun test tests/hash-edit.test.ts   # Single test file
bun test -t "test name pattern"    # Filter by test name
```

---

## Why Not Just Use sed / grep / awk?

| Tool | Problem | HashPilot |
|------|---------|-----------|
| `sed` | Line-number based, fragile | Hash-anchored, recovery on stale anchors |
| `grep + sed` | Wrong match on first occurrence | Cryptographic content identity |
| `awk` | Pattern-based, no AST awareness | Tree-sitter AST for syntax-safe edits |
| Manual edit | 3-5 retries per change | 1-2 operations, no re-reading |

HashPilot isn't competing with Unix tools — it's the infrastructure layer that lets AI agents use those tools correctly.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Project Status

Active development. Core editing engine, AST operations, telemetry, and all three adapter integrations are production-ready. Intent-based editing (M5) and provenance tracking (M6) are available as preview features.

**Docs policy:** The landing page (README.md) and [design doc](docs/ARCHITECTURE.md) are living documents. Every PR that touches `src/` must update one or both. Every deploy is verified with browser automation. See the CI check `docs-verify`.

**Agent quick reference:** [docs/CLI-QUICKREF.md](docs/CLI-QUICKREF.md) is the one page an agent should read before invoking the CLI — every command, flag, output shape, exit code, and the gotchas that otherwise cost a guess-and-retry loop. Its command reference is generated from the CLI's own `--help`, and `bun run lint:docs` (run in CI and by `bun test`) fails if the doc drifts from the binary or if `ROADMAP.md` grows a duplicate or out-of-order row.

v1.3.1 — [Release notes](https://github.com/bigknoxy/HashPilot/releases)

<!-- agent-skills:doc-keeper:start -->
## Reference (auto-tracked by doc-keeper)

### Environment Variables
- `HASHPILOT_TELEMETRY`: set to `0`/`false`/`off`/`no` to disable telemetry logging. Overridden by `--no-telemetry`.
- `HASHPILOT_ROUTE_POLICY`: JSON route policy, highest-priority config layer.
<!-- agent-skills:doc-keeper:end -->
