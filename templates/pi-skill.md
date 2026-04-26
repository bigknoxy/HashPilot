---
name: hashpilot
description: HashPilot structured editing — prefers AST edits for TypeScript, hash-anchored edits otherwise, with stale-anchor safety and batched verification. Use when editing files, renaming symbols, replacing function bodies, managing imports, or verifying changes.
---

# HashPilot Pi — Structured Editing Skill

You have access to HashPilot structured editing tools that are more reliable and token-efficient than raw text editing.

## Routing Hierarchy

Always follow this priority when editing files:

1. **AST route** — For `.ts` and `.tsx` files, prefer `hashpilot_ast` for:
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

### Editing a TypeScript file
```
1. hashpilot_ast operation="find-symbols" file="src/foo.ts"
2. hashpilot_ast operation="rename-symbol" file="src/foo.ts" name="oldFunc" newName="newFunc"
3. hashpilot_verify files=["src/foo.ts"] formatter="prettier" linter="eslint"
```

### Editing a non-TypeScript file
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

When `hashpilot_replace_hash` returns `"stale": true`:
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