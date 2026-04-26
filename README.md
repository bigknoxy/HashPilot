# HashPilot

Global, tool-agnostic structured editing core for coding agents. HashPilot provides syntax-aware editing via tree-sitter, hash-anchored content replacement, and batched verification — all accessible from any agent platform (Claude Code, OpenCode, Pi).

## Features

- **Hash-anchored editing** — Reliable content replacement using SHA-256 hashes with stale-anchor detection
- **Syntax-aware editing** — AST-based operations via tree-sitter for TypeScript, TSX, JavaScript, Python, Go, and Rust
- **Batched operations** — Read, search, and verify multiple files in a single call
- **Smart routing** — Automatic AST → hash → fallback chain based on file type and operation
- **Verification** — Run formatter, linter, and tests in one command
- **Adapter integrations** — Native support for Claude Code, OpenCode, and Pi
- **Telemetry** — Structured JSONL logging with health reporting and trend analysis

## Quick Install

```bash
git clone https://github.com/bigknoxy/HashPilot.git
cd HashPilot
bash scripts/install.sh
```

## Requirements

- **Bun** 1.2+ (runtime)
- **Node.js** 20+ (alternative runtime)

## Documentation

- [Installation Guide](docs/INSTALL.md) — Full install, upgrade, and uninstall instructions
- [Adapter Contract](docs/ADAPTER-CONTRACT.md) — Machine-readable adapter specification
- Claude Code: [Integration](docs/INTEGRATION-CLAUDE.md)
- OpenCode: [Integration](docs/INTEGRATION-OPENCODE.md)
- Pi Agent: [Integration](docs/INTEGRATION-PI.md)

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build
bun run build

# Run doctor locally
bun run src/cli.ts doctor
```

## License

MIT
