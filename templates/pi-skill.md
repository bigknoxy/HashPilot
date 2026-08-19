---
name: hashpilot
description: HashPilot structured editing — prefers AST edits for TypeScript, hash-anchored edits otherwise, with stale-anchor safety and batched verification. Use when editing files, renaming symbols, replacing function bodies, managing imports, or verifying changes.
---

# HashPilot Pi — Structured Editing Skill

## Install HashPilot

```bash
curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/install.sh | bash
```

This installs the `hashpilot` CLI and registers the Pi extension with `/hp` slash command.

---

You have access to HashPilot structured editing tools that are more reliable and token-efficient than raw text editing.

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

## When to Use

- Editing existing files in supported AST languages (TS/JS/Python/Go/Rust)
- Editing any file where you need precision (hash-anchored avoids line-counting errors)
- Renaming symbols, replacing function bodies, managing imports
- Batch reading multiple files
- Verifying changes after edits

## When NOT to Use

- Creating new files → use raw write instead
- Deleting files/directories → use bash
- Moving/renaming files → use bash
- Simple one-off edits → direct edit is cheaper
- File system operations (cp, mv, rm) → use bash

## Routing Hierarchy

Always follow this priority when editing files:

1. **AST route** — For supported languages (TypeScript, TSX, JavaScript, Python, Go, Rust), prefer `hashpilot_ast` for:
   - `find-symbols` — list symbols in a file
   - `rename-symbol` — rename a symbol across all references
   - `replace-body` — replace a function/method body
   - `add-import` — add an import statement
   - `remove-import` — remove an import statement
   - `insert-before` / `insert-after` — insert content around a symbol

2. **Hash route** — For all other files or when AST is not applicable, use:
   - `hashpilot_read` to get file content and hash
   - `hashpilot_replace_hash` to edit with hash anchoring

3. **Fallback** — Only use raw text editing when hash and AST routes fail.

## Workflow

### Editing a supported language file (TypeScript, TSX, JavaScript, Python, Go, Rust)
```
1. hashpilot_ast operation="find-symbols" file="src/foo.ts"
2. hashpilot_ast operation="rename-symbol" file="src/foo.ts" name="oldFunc" newName="newFunc"
3. hashpilot_verify files=["src/foo.ts"] formatter="prettier" linter="eslint"
```

### Editing an unsupported file type
```
1. hashpilot_read files=["config.yaml"]
   → get hash from response
2. hashpilot_replace_hash file="config.yaml" oldHash="<hash>" newContent="new content"
3. hashpilot_verify files=["config.yaml"]
```

### Batch reading
```
hashpilot_read files=["src/a.ts", "src/b.ts", "src/c.ts"]
```

### Searching
```
hashpilot_search pattern="function\\s+\\w+" paths=["src/"]
```

## Stale Anchor Recovery

Every command returns the envelope `{ apiVersion, ok, command, data, error, warnings }` —
read the payload from `data` and branch on `error.code`, never on `error.message`.

When `hashpilot_replace_hash` returns `"stale": true` (`error.code: "STALE_ANCHOR"`):
1. The file changed since you read it — your hash is outdated
2. Re-read the file: `hashpilot_read files=["target.ts"]`
3. Retry the edit with the new hash
4. Never guess or reuse old hashes

## Verification

Always verify after edits:
- Use `hashpilot_verify` with appropriate formatter and linter
- Pass `formatter` and `linter` params when available
- Pass `testFilter` for targeted test runs

## Status and Debugging

- `hashpilot_status action="route" file="src/foo.ts" operation="rename-symbol"` — check which route would be used
- `hashpilot_status action="telemetry"` — review recent operations

## Enable/Disable

The `hashpilot_enabled` flag controls whether HashPilot tools are active. Default: enabled.