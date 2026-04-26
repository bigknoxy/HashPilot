# HashPilot — Claude Code Integration Guide

## Integration Pattern

Claude Code can call `structured-edit` as a shell command, capturing JSON output for structured editing operations.

## Setup

Add to your project's `CLAUDE.md` or `~/.claude/CLAUDE.md`:

```markdown
## HashPilot Structured Editing

Use `structured-edit` for file operations instead of raw text editing when available.

### Routing Rules
1. For supported AST languages (TypeScript, TSX, JavaScript, Python, Go, Rust), prefer AST commands (`ast rename-symbol`, `ast replace-body`, etc.)
2. For all other edits, use hash-anchored editing (`replace-hash`)
3. Use `read-hash` to anchor before editing, then `replace-hash` with the hash
4. Use `verify-changes` after editing to run formatter + linter + tests

### Key Commands
- `structured-edit read-many <files>` — batch read with hashes
- `structured-edit read-hash <file> <line>` — read line with context hash
- `structured-edit replace-hash <file> <hash> <content> [--range start:end]` — hash-anchored edit
- `structured-edit ast find-symbols <file>` — list symbols
- `structured-edit ast capabilities` — show supported languages and limitations
- `structured-edit ast rename-symbol <file> <old> <new>` — rename
- `structured-edit ast replace-body <file> <symbol> <body>` — replace function body
- `structured-edit ast add-import <file> <spec>` — add import
- `structured-edit ast remove-import <file> <spec>` — remove import
- `structured-edit route <file> <op> [--policy <json>]` — detailed route explanation with policy testing
- `structured-edit config` — show current merged configuration
- `structured-edit verify-changes <files>` — run formatter + linter + tests
- `structured-edit telemetry summary` — check usage stats
- `structured-edit telemetry health [-w <days>] [--trend]` — health report with per-language stats and trend comparison

### Config file

Create `~/.config/hashpilot/config.json` or `.hashpilot.json` in your project to set routing policies:

```json
{
  "routePolicy": {
    "languageOverrides": { "python": "hash" },
    "operationOverrides": { "add-import": "diff" }
  }
}
```
```

## Workflow Example

### Edit a TypeScript function body
```bash
# 1. Find the symbol
structured-edit ast find-symbols src/utils.ts
# → find "formatDate" at line 15

# 2. Replace its body
structured-edit ast replace-body src/utils.ts formatDate 'return new Date(d).toISOString();'
# → success, body replaced

# 3. Verify
structured-edit verify-changes src/utils.ts --formatter prettier --linter eslint
```

### Hash-anchored edit for a non-TS file
```bash
# 1. Read file with hash
HASH=$(structured-edit read-many config.yaml | jq -r '.[0].hash')

# 2. Replace entire file via hash
structured-edit replace-hash config.yaml "$HASH" "new: content\nhere: true"

# 3. Or read a line range with hash
structured-edit read-hash config.yaml 5 -c 2
# → get contextHash for line 5

# 4. Replace a specific range
structured-edit replace-hash config.yaml "$HASH" "  port: 8080" --range 5:6
```

## Token Efficiency Tips

1. **Batch reads**: Use `read-many` to read multiple files in one call
2. **Use hashes**: Never re-read a file you just read — use the hash to anchor edits
3. **Symbol-aware**: For TypeScript, use `ast` commands to avoid line-counting errors
4. **Verify once**: Bundle all verification into one `verify-changes` call

## Error Recovery

When `replace-hash` returns `"stale": true`:
1. Re-read the file: `structured-edit read-many <file>`
2. Get the new hash from the response
3. Retry `replace-hash` with the new hash