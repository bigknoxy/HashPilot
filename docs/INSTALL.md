# HashPilot — Installation Guide

## Overview

HashPilot is a global, tool-agnostic structured editing core that improves coding-agent efficiency across multiple tools (Claude Code, OpenCode, Pi). It provides:

- **Hash-anchored editing**: Reliable content replacement using SHA-256 hashes
- **Syntax-aware editing**: AST-based operations via tree-sitter (see supported languages below)
- **Verification batching**: Run formatter + linter + tests in one call
- **Telemetry**: Structured JSONL logging of all operations
- **Routing**: Automatic AST → hash → diff fallback

## Supported AST Languages

HashPilot Core supports AST-backed editing for these languages:

| Language      | File extensions         | Grammar package             | Status |
|---------------|------------------------|-----------------------------|--------|
| TypeScript    | `.ts` (not `.d.ts`)    | `tree-sitter-typescript`    | Full   |
| TSX           | `.tsx`                 | `tree-sitter-typescript`    | Full   |
| JavaScript    | `.js`, `.jsx`, `.mjs`, `.cjs` | `tree-sitter-javascript` | Full   |
| Python        | `.py`                  | `tree-sitter-python`        | Full   |
| Go            | `.go`                  | `tree-sitter-go`            | Full   |
| Rust          | `.rs`                  | `tree-sitter-rust`          | Full   |

### Per-language operation support

| Operation              | TypeScript | TSX | JavaScript | Python | Go  | Rust |
|------------------------|:----------:|:---:|:----------:|:------:|:---:|:----:|
| `find-symbols`         | ✓          | ✓   | ✓          | ✓      | ✓   | ✓    |
| `rename-symbol`        | ✓          | ✓   | ✓          | ✓      | ✓   | ✓    |
| `replace-body`         | ✓          | ✓   | ✓          | ✓      | ✓   | ✓    |
| `add-import`           | ✓          | ✓   | ✓          | ✓*     | ✓*  | ✓    |
| `remove-import`        | ✓          | ✓   | ✓          | ✓      | ✓   | ✓    |
| `insert-before`        | ✓          | ✓   | ✓          | ✓      | ✓   | ✓    |
| `insert-after`         | ✓          | ✓   | ✓          | ✓      | ✓   | ✓    |

**Notes:**
- Python `add-import` supports `import X` (e.g., `json`), `from X import Y` (e.g., `from sys import argv`), and `from X import Y, Z` (multi-import). When adding to an existing `from X import ...` for the same module, it auto-merges the new names.
- Go `add-import`: with no existing imports inserts after the `package` clause; with a grouped `import ( ... )` block inserts inside the group; with mixed simple + grouped, inserts into the grouped block.
- Rust `remove-import`: simple `use X;` declarations use exact path-segment matching (no substring false positives). Grouped `use X::{Y, Z}` supports surgical per-item removal. Removing the last item from a group simplifies to `use X::Y`. Removing all items removes the entire declaration.
- `rename-symbol` renames identifier-like references (`identifier`, `type_identifier`, `property_identifier`). It does not rename string literals or comments.
- JavaScript `.jsx` files use the same grammar as `.js` (the `tree-sitter-javascript` grammar handles JSX syntax).

### Installed grammar packages

```
tree-sitter@^0.21.1          # Core parser library
tree-sitter-typescript@^0.21.2  # TypeScript + TSX
tree-sitter-javascript@^0.21.4  # JavaScript + JSX
tree-sitter-python@^0.21.0      # Python
tree-sitter-go@^0.21.2          # Go
tree-sitter-rust@^0.24.0        # Rust
```

## Requirements

- **Bun** 1.2+ (runtime)
- **grep** (for search operations)

> **Note:** HashPilot is Bun-only. It uses Bun-specific APIs (Bun.file(), Bun.write(), Bun.spawn()) and runs via `#!/usr/bin/env bun`. Node.js is not supported as a runtime.

## Supported Environments

- **macOS** (arm64, x86_64) — bash, zsh
- **Linux** (any distro) — bash
- **User-scope install** — no admin privileges required
- **CI/containers** — same install path; set `HASHPILOT_SHELL_RC` env var to control rc file

## Installation

### Quick install (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/install.sh | sh
```

This auto-detects your platform, clones HashPilot from GitHub, installs dependencies, and configures all adapters.

### Clone and install (for development)

```bash
git clone https://github.com/bigknoxy/HashPilot.git ~/hashpilot
cd ~/hashpilot
bash scripts/install.sh
```

The installer handles all of these automatically:
- Copies HashPilot Core to `~/.agentic-tools/structured-editing`
- Installs dependencies via `bun install`
- Creates the `structured-edit` CLI launcher
- Adds `~/.agentic-tools/bin` to your PATH (via shell rc file)
- Installs Claude Code integration (appends to `~/.claude/CLAUDE.md`)
- Installs OpenCode skill + agent
- Installs Pi extension + skill
- Bootstraps a default config file (if one doesn't exist)
- Writes a manifest for clean upgrades and uninstall

### Verification

After installation, verify with:

```bash
structured-edit doctor
```

This checks core files, CLI, PATH, config, and all adapter integrations.

### Options

```bash
# Install from a different source (tarball, dotfiles)
bash scripts/install.sh --source /path/to/hashpilot

# Install to a custom target directory
bash scripts/install.sh --target ~/custom-tools

# Reinstall without prompting
bash scripts/install.sh --force

# Preserve telemetry on reinstall
bash scripts/install.sh --keep-telemetry
```

## Configuration

HashPilot uses a layered config system. A default config is created at `~/.config/hashpilot/config.json` during install.

```json
{
  "routePolicy": {
    "languageOverrides": { "python": "hash" },
    "operationOverrides": { "add-import": "diff" }
  },
  "telemetry": {
    "enabled": true
  },
  "provenance": {
    "maxContextLength": 500
  }
}
```

Override priority (highest wins): `HASHPILOT_ROUTE_POLICY` env var > `--config` CLI flag > `.hashpilot.json` > `~/.config/hashpilot/config.json` > defaults.

View current config:
```bash
structured-edit config
```

## Quick Start

```bash
# Read files with hashes
structured-edit read-many src/core/read.ts src/core/hash-edit.ts

# Read a specific line with hash and context
structured-edit read-hash src/core/read.ts 10

# Search across paths
structured-edit grep-many "function\\s+\\w+" src/

# Replace content using hash anchor
# First read the hash, then replace
HASH=$(structured-edit read-many myfile.ts | jq -r '.[0].hash')
structured-edit replace-hash myfile.ts "$HASH" "// new content"

# Replace a specific line range
structured-edit replace-hash myfile.ts "$HASH" "new content" --range 5:10

# Rename a symbol (TypeScript/TSX)
structured-edit ast rename-symbol myfile.ts oldName newName

# Replace a function body
structured-edit ast replace-body myfile.ts myFunction "return 42;"

# Add/remove imports
structured-edit ast add-import myfile.ts "{ Foo } from './bar'"
structured-edit ast remove-import myfile.ts './bar'

# Find symbols
structured-edit ast find-symbols myfile.ts

# Show supported AST languages, operations, and limitations
structured-edit ast capabilities

# Verify changes (run formatter + linter + tests)
structured-edit verify-changes myfile.ts --formatter prettier --linter eslint

# Check routing decision with detailed explanation
structured-edit route myfile.ts rename-symbol
structured-edit route myfile.ts add-import --policy '{"operationOverrides":{"add-import":"diff"}}'

# View or test policy config
structured-edit config

# View telemetry
structured-edit telemetry summary
structured-edit telemetry show -n 50
structured-edit telemetry health -w 7
structured-edit telemetry sessions
structured-edit telemetry export --from 2026-01-01

# Telemetry health with trend comparison
structured-edit telemetry health -w 7 --trend

# Generate and apply unified diffs
structured-edit diff generate myfile.ts "$(cat old.ts)" "$(cat new.ts)"
structured-edit diff apply myfile.ts --patch changes.patch

# Batch edit across files
structured-edit batch add-import src/*.ts --import-spec "{ z } from zod"

# Route decisions and config
structured-edit route myfile.ts add-import --policy '{"operationOverrides":{"add-import":"diff"}}'
structured-edit config

# Edit history (provenance)
structured-edit provenance query myfile.ts --human
structured-edit provenance changeset <changeSetId> --human

# Intent-based multi-step editing
structured-edit intent '{"operation":"add-parameter","symbol":"myFunc","param":{"name":"x"}}' --dry-run
```

## Running Tests

```bash
cd ~/.agentic-tools/structured-editing
bun test
```

## Updating / Upgrading

To upgrade an existing HashPilot installation:

```bash
# From a cloned repo
cd ~/hashpilot
git pull
bash scripts/install.sh --force

# From a tarball/dotfiles
bash scripts/install.sh --source /path/to/new-version --force
```

The installer detects the existing install, upgrades core files, preserves your config, and updates all adapters.

## Uninstalling

To completely remove HashPilot:

```bash
curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/uninstall.sh | sh -s -- -f
```

Or from a local clone:

```bash
bash scripts/uninstall.sh
```

This removes:
- HashPilot Core (`~/.agentic-tools/structured-editing`)
- CLI launcher (`~/.agentic-tools/bin/structured-edit`)
- Claude integration (removes section from `~/.claude/CLAUDE.md`)
- OpenCode skill and agent
- Pi extension and skill
- PATH entry from shell rc files
- Telemetry logs
- Config file
- Manifest

### Options

```bash
# Preserve config and telemetry data
bash scripts/uninstall.sh --keep-config

# Skip confirmation prompt
bash scripts/uninstall.sh --force
```

### What remains after uninstall

- `~/.agentic-tools/` (removed if empty; preserved if other files exist)
- Any custom modifications you made to adapter files (the uninstaller only touches files it installed)
- Your shell rc file (PATH marker line is removed, rest preserved)

## Directory Structure

```
~/.agentic-tools/
  manifest.json             # Managed file inventory (installer writes, uninstaller reads)
  bin/
    structured-edit         # CLI launcher (bash script)
  structured-editing/       # Core source + dependencies
    package.json
    tsconfig.json
    src/
      cli.ts
      core/
        config.ts           # Config loading and policy
        router.ts           # Routing logic
        doctor.ts           # Doctor check logic
        ast-edit.ts         # Tree-sitter AST operations
        hash-edit.ts        # Hash-anchored editing
        read.ts             # File reading
        grep.ts             # Search operations
        verify.ts           # Verification (bundled checks)
        telemetry.ts        # Telemetry logging and health
        diff-engine.ts      # LCS-based unified diff + patch
        batch-edit.ts       # Parallel/serial batch editing
        intent.ts           # M5 intent parsing and plan generation
        plan-executor.ts    # M5 plan execution with rollback
        provenance.ts       # M6 edit history tracking
        utils.ts            # Shared utilities
    scripts/
      install.sh            # Portable installer
      doctor.sh             # Standalone doctor
      uninstall.sh          # Clean uninstall
    templates/
      claude-section.md     # Claude integration section
      opencode-skill.md     # OpenCode skill definition
      opencode-agent.md     # OpenCode agent definition
      pi-extension.ts       # Pi extension
      pi-skill.md           # Pi skill definition
    docs/                   # Documentation
    tests/                  # Test suite
  logs/
    telemetry.jsonl         # Telemetry event log

~/.config/hashpilot/
  config.json               # Global config (bootstrapped by installer)

~/.claude/CLAUDE.md               # Claude Code integration (modified)
~/.config/opencode/skills/hashpilot/SKILL.md
~/.config/opencode/agent/hashpilot.md
~/.pi/agent/extensions/hashpilot.ts
~/.pi/agent/skills/hashpilot/SKILL.md
```

## OpenCode Integration

HashPilot integrates with OpenCode as both a **skill** and a **subagent**.

### What's installed

- **Skill** at `~/.config/opencode/skills/hashpilot/SKILL.md` — Provides instructions for using HashPilot commands
- **Agent** at `~/.config/opencode/agent/hashpilot.md` — A subagent that uses HashPilot for precise editing

These are auto-discovered by OpenCode from the `skills/` and `agent/` directories under `~/.config/opencode/`.

### Using in OpenCode

1. **Skill trigger**: The skill activates when you ask to edit files precisely, use structured editing, or mention hash-anchored edits
2. **Agent invocation**: Use the HashPilot subagent via `/agent hashpilot` (or OpenCode dispatches it automatically for editing tasks)

### PATH requirement

Ensure `~/.agentic-tools/bin` is in PATH before launching OpenCode:

```bash
export PATH="$HOME/.agentic-tools/bin:$PATH"
```

## Managed File Inventory

HashPilot maintains a manifest at `~/.agentic-tools/manifest.json`. This JSON file records every file and configuration that the installer creates or modifies. The uninstaller uses it for clean removal.

**What's tracked:**
- Core directory and source files
- CLI launcher binary
- Config file location
- Claude CLAUDE.md modifications
- OpenCode skill and agent files
- Pi extension and skill files
- Telemetry log directory
- Shell rc PATH entries

## Troubleshooting

- **"command not found"**: Ensure `~/.agentic-tools/bin` is in your PATH (run `structured-edit doctor` to check)
- **"Module not found"**: Run `cd ~/.agentic-tools/structured-editing && bun install`
- **Installer fails**: Verify bun is installed (`bun --version`), check `~/.agentic-tools/` is writable
- **Tree-sitter errors**:
  - Ensure all `tree-sitter-*` packages are installed via `bun install`
  - If a grammar fails to load, check that the grammar version is compatible with `tree-sitter` v0.21.x
  - On first load, prebuilds from `node_modules/*/prebuilds/` are used automatically
  - If you see `"nodeTypeNamesById.length"` errors, a grammar is too new for the core parser — downgrade to the latest 0.21.x version of the grammar
- **Unsupported language**: Files with unsupported extensions (.rb, .java, .c, etc.) will route to hash or diff, never silently fall through to AST
- **Doctor reports failures after install**: Run `bash scripts/doctor.sh` for detailed diagnostics
- **OpenCode not finding skill**: Verify `~/.config/opencode/skills/hashpilot/SKILL.md` exists
- **Work/regulated environment**: Everything is user-scoped (no sudo, no /usr/local). All files go under `~/.agentic-tools/`, `~/.config/hashpilot/`, and adapter-specific config directories.