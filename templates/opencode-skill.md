---
name: hashpilot
description: HashPilot structured editing core for coding agents. Provides hash-anchored editing (replace-hash), syntax-aware AST editing via tree-sitter (TypeScript, TSX, JavaScript, Python, Go, Rust), batched read/search, verification bundling, and telemetry. Use when editing files precisely to reduce retries and token waste.
---

# HashPilot — Structured Editing for Coding Agents

## Install HashPilot

```bash
curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/install.sh | bash
```

This installs the `hashpilot` CLI and registers the OpenCode skill + subagent.

---

HashPilot is a global, tool-agnostic structured editing system that improves coding-agent efficiency by preferring syntax-aware edits when possible, hash-anchored edits otherwise, and providing verification batching.

### Preferred: use the MCP server

If your host speaks MCP, register HashPilot once and call its tools directly
instead of shelling out:

```json
{ "mcpServers": { "hashpilot": { "command": "hashpilot", "args": ["mcp", "--stdio"] } } }
```

The MCP tools mirror the CLI one-for-one (`rename_symbol`, `replace_hash`,
`route_edit`, `verify_changes`, plus the read and search tools), and multi-line
content with quotes or backticks rides inside JSON rather than through shell
quoting. Per-host setup lives in `docs/INTEGRATION-MCP.md`.

The CLI commands below remain fully supported and are the fallback when MCP is
not available.

## When to Use This Skill

- **Editing supported languages**: Use AST commands for precise symbol-level edits (TypeScript, TSX, JavaScript, Python, Go, Rust)
- **Editing any file with hash anchoring**: Use `replace-hash` to avoid line-counting errors
- **Reading multiple files**: Use `read-many` to batch reads with hashes
- **Searching across codebases**: Use `grep-many` for structured search results
- **Verifying changes**: Use `verify-changes` to bundle formatter + linter + tests

## When NOT to Use This Skill

- **Creating new files**: Use direct write/edit instead (hashpilot edits existing files)
- **Deleting files/directories**: Use raw bash (`rm`, `rmdir`)
- **Renaming/moving files**: Use raw bash (`mv`, `git mv`)
- **Simple single-line edits in non-critical files**: Direct edit is cheaper and just as safe
- **Exploratory single-file reads**: Raw read has no overhead
- **File system operations** (copy, move, delete, symlink): Use bash

## Prerequisites

HashPilot must be installed at `~/.agentic-tools/structured-editing/` with the CLI at `~/.agentic-tools/bin/hashpilot`.

Verify installation:
```bash
hashpilot --version
```

If not installed, see `~/.agentic-tools/structured-editing/docs/INSTALL.md`.

## Routing Strategy

Always prefer the highest-confidence route:

1. **AST route** — For supported languages (TypeScript, TSX, JavaScript, Python, Go, Rust) with symbol-level operations (rename, replace-body, add/remove import, insert before/after)
2. **Hash route** — For all other edits where you have a content hash
3. **Diff route** — Fallback for unsupported operations

Check routing: `hashpilot route <file> <operation>`

## Core Commands

### read-many — Batch read files with hashes

```bash
hashpilot read-many <file1> [file2] ...
```

Returns the standard envelope; `data` is an array of `{ path, content, hash, lines }`.
Store `hash` for subsequent `replace-hash` calls.

**Usage pattern**: Read all relevant files at once, use hashes for editing.

```bash
# Read multiple files
result=$(hashpilot read-many src/api.ts src/utils.ts src/config.ts)
# Extract hash for later editing
hash=$(echo "$result" | jq -r '.data[] | select(.path | contains("api.ts")) | .hash')
```

### read-hash — Read line with context hash

```bash
hashpilot read-hash <file> <line-number> [-c <context-lines>]
```

Returns `lineHash`, `contextHash`, `contextBefore`, `contextAfter`. Use `contextHash` for anchoring edits to specific line ranges.

### grep-many — Search across paths

```bash
hashpilot grep-many <pattern> <paths...> [-i] [--file-pattern <glob>] [--max-results <n>]
```

### symbol-lookup-many — Find symbol definitions

```bash
hashpilot symbol-lookup-many <paths...> --names name1,name2
```

### replace-hash — Hash-anchored content replacement

```bash
hashpilot replace-hash <file> <old-hash> <new-content> [--range start:end] [--dry-run]
```

**Critical**: If result shows `"stale": true`, the file changed since the hash was computed. Re-read the file and retry with the new hash.

**Range format**: `--range 5:10` means lines 5 through 10 (1-indexed, end exclusive).

**File input**: Use `@filepath` to read new content from a file instead of inline.

## AST Commands (TypeScript, TSX, JavaScript, Python, Go, Rust)

### find-symbols — List all symbols

```bash
hashpilot ast find-symbols <file>
```

Returns array of `{name, kind, startRow, endRow, startCol, endCol}`.

### rename-symbol — Rename all references

```bash
hashpilot ast rename-symbol <file> <old-name> <new-name> [--dry-run]
```

### replace-body — Replace function/method body

```bash
hashpilot ast replace-body <file> <symbol-name> <new-body> [--dry-run]
```

Body can be `@filepath` to read from a file.

### add-import — Add import statement

```bash
hashpilot ast add-import <file> '<import-spec>' [--dry-run]
```

Examples:
- `hashpilot ast add-import src/app.ts '{ Router } from express'`
- `hashpilot ast add-import src/app.ts '* as React from react'`

### remove-import — Remove import line

```bash
hashpilot ast remove-import <file> '<import-spec>' [--dry-run]
```

### insert-before / insert-after — Insert content relative to a symbol

```bash
hashpilot ast insert-before <file> <symbol-name> <content> [--dry-run]
hashpilot ast insert-after <file> <symbol-name> <content> [--dry-run]
```

## verify-changes — Bundle formatter + linter + tests

```bash
hashpilot verify-changes <files...> [--formatter <cmd>] [--linter <cmd>] [--test-filter <pattern>]
```

Returns `{overall: "pass"|"fail"|"partial", formatter, linter, tests, fileHashes}`.

## Telemetry

```bash
hashpilot telemetry show [-n <limit>]
hashpilot telemetry summary
hashpilot telemetry clear
```

## Workflow Patterns

### Pattern 1: TypeScript symbol rename

```bash
# 1. Find the symbol
hashpilot ast find-symbols src/api.ts
# 2. Rename
hashpilot ast rename-symbol src/api.ts oldName newName
# 3. Verify
hashpilot verify-changes src/api.ts --formatter prettier --linter eslint
```

### Pattern 2: Hash-anchored edit (any file)

```bash
# 1. Read file with hash
data=$(hashpilot read-many config.yaml)
hash=$(echo "$data" | jq -r '.[0].hash')
# 2. Edit with hash anchor
hashpilot replace-hash config.yaml "$hash" "new: content"
# 3. On stale hash: re-read and retry
```

### Pattern 3: Batch read + selective edit

```bash
# 1. Batch read
hashpilot read-many src/a.ts src/b.ts src/c.ts
# 2. Extract hash for target file
# 3. Replace targeted range
hashpilot replace-hash src/b.ts "$hash" "replacement content" --range 10:15
```

## Error Recovery

| Error | Cause | Recovery |
|-------|-------|----------|
| `stale: true` | File changed since hash computed | Re-read file, get new hash, retry |
| `success: false` | Symbol not found, parse error, etc. | Check file content, verify symbol name |
| Parse error | Invalid source code | Fix syntax errors first |
| `error` field | File not found, permissions | Check file path and permissions |

## Telemetry Event Schema

Every operation logs:
- `operation`: Command name
- `route`: `ast`, `hash`, `diff`, `read`, `grep`, `verify`
- `success`: Boolean
- `fallback_reason`: Why a lower route was chosen
- `elapsed_ms`: Duration
- `file`, `files_count`, `lines_read`: Scope info