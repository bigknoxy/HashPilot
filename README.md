# HashPilot

Global, tool-agnostic structured editing core for coding agents. Syntax-aware editing via tree-sitter, hash-anchored content replacement, and batched verification — accessible from Claude Code, OpenCode, and Pi.

## One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/install.sh | sh
```

This clones the repo, installs dependencies, creates the `structured-edit` CLI, adds it to PATH, and installs adapter integrations for Claude Code, OpenCode, and Pi.

## One-Line Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/uninstall.sh | sh -s -- -f
```

## Quick Start

```bash
# Run the health check
structured-edit doctor

# Read files with hashes
structured-edit read-many file.ts

# Search across files
structured-edit grep-many "pattern" src/

# Syntax-aware rename
structured-edit ast rename-symbol file.ts oldName newName
```

## Requirements

- **Bun** 1.2+

## Commands

| Command | Description |
|---------|-------------|
| `doctor` | Verify installation health |
| `config` | Show merged configuration |
| `read-many` | Read files with SHA-256 hashes |
| `grep-many` | Search across files |
| `replace-hash` | Hash-anchored content replacement |
| `ast` | AST operations (find-symbols, rename-symbol, replace-body, add/remove-import, insert-before/after) |
| `verify-changes` | Run formatter + linter + tests |
| `route` | Show routing decision (AST → hash → fallback) |
| `telemetry` | View health, summary, and events |

## Documentation

- [Installation Guide](docs/INSTALL.md)
- [Adapter Contract](docs/ADAPTER-CONTRACT.md)
- [Claude Code Integration](docs/INTEGRATION-CLAUDE.md)
- [OpenCode Integration](docs/INTEGRATION-OPENCODE.md)
- [Pi Integration](docs/INTEGRATION-PI.md)

## Development

```bash
bun install
bun test
```

## License

MIT
