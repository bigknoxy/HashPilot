# HashPilot — Adapter Contract

This document defines the machine-readable contract that coding agents use to interact with HashPilot. All commands are invoked via the `structured-edit` CLI and return JSON on stdout.

## Command Reference

### Configuration

HashPilot is configured via config files and environment variables, merged with the following priority (highest wins):

1. `HASHPILOT_ROUTE_POLICY` env var (JSON string)
2. CLI `--config <path>` override
3. Project `.hashpilot.json` in current working directory
4. Global `~/.config/hashpilot/config.json`
5. Defaults (telemetry enabled, no route policy)

**Config file schema (`config.json` / `.hashpilot.json`):**
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

**`routePolicy.languageOverrides`** — Force a specific route (ast/hash/diff) for files matching a given language key (language ID for supported AST languages, file extension otherwise).

**`routePolicy.operationOverrides`** — Force a specific route for a given operation name (e.g., `"rename-symbol"`, `"add-import"`, `"replace-hash"`).

**`routePolicy.conflictResolution`** — When both language and operation overrides match: `"language"` (language wins), `"operation"` (operation wins, default), or `"strictest"` (lowest-precedence route wins: diff < hash < ast).

**`telemetry.enabled`** — Set to `false` to disable telemetry recording (default: `true`).

**Environment variables:**
- `HASHPILOT_ROUTE_POLICY` — JSON string overriding route policy. Example: `'{"languageOverrides":{"python":"hash"}}'`

---

### provenance tracking (optional on all write commands)

The following options are available on all write operations (`replace-hash`, `ast rename-symbol`, `ast replace-body`, `ast add-import`, `ast remove-import`, `ast insert-before`, `ast insert-after`, `diff apply`, `batch`):

| Option | Description |
|--------|-------------|
| `--actor <name>` | Agent identity for provenance tracking (e.g. `"claude-opus-4.7"`) |
| `--task-id <id>` | Task/issue reference (e.g. `"ISSUE-142"`, `"GH#123"`) |
| `--reason <text>` | Human-readable reason for the edit |

These are recorded alongside telemetry and queryable via `provenance query`.

---

### read-many

Read multiple files with content hashes.

**Invocation:**
```
structured-edit read-many <file1> [file2] ...
```

**Output:**
```json
[
  {
    "path": "/abs/path/to/file.ts",
    "content": "full file content",
    "hash": "12-char-sha256-prefix",
    "lines": 42,
    "error": null
  }
]
```

**Use case:** Batch file reads to minimize round trips. Use `hash` for subsequent `replace-hash` calls.

---

### read-hash

Read a specific line with its hash and surrounding context.

**Invocation:**
```
structured-edit read-hash <file> <line-number> [-c <context-lines>]
```

**Output:**
```json
{
  "path": "/abs/path/to/file.ts",
  "line": 10,
  "content": "  const x = foo();",
  "lineHash": "8-char-hash",
  "contextHash": "12-char-hash",
  "contextBefore": ["line 7", "line 8", "line 9"],
  "contextAfter": ["line 11", "line 12", "line 13"],
  "error": null
}
```

**Use case:** Verify exact line content before editing. Use `contextHash` to anchor edits precisely.

---

### grep-many

Search a regex pattern across paths.

**Invocation:**
```
structured-edit grep-many <pattern> <path1> [path2] ... [-i] [--file-pattern <glob>] [--max-results <n>]
```

**Output:**
```json
{
  "pattern": "function\\s+\\w+",
  "results": [
    {
      "path": "/abs/path/file.ts",
      "line": 5,
      "column": 1,
      "content": "function hello() {",
      "match": "function\\s+\\w+"
    }
  ],
  "error": null,
  "elapsed_ms": 12
}
```

---

### symbol-lookup-many

Look up symbol definitions across paths.

**Invocation:**
```
structured-edit symbol-lookup-many <path1> [path2] ... --names name1,name2
```

**Output:**
```json
[
  {
    "name": "hello",
    "path": "/abs/path/file.ts",
    "line": 5,
    "kind": "function"
  }
]
```

---

### replace-hash

Replace file content identified by hash anchor.

**Invocation:**
```
structured-edit replace-hash <file> <old-hash> <new-content> [--range start:end] [--dry-run]
```

- `<new-content>` can be `@filepath` to read from a file
- `--range` is 1-indexed, inclusive start and exclusive end
- Provenance options: `--actor`, `--task-id`, `--reason`

**Auto-recovery:** If the file was modified since the hash was computed (stale anchor), the tool auto-recovers by default, applying the edit to the current file content. Returns `retries: 1` on recovery. For full-file replaces (no `--range`), this is always safe. For range-based replaces, the edit applies to the current range content. To disable auto-recovery and force stale-anchor failure, pass `--no-recovery` (internal API only).

**Output (success):**
```json
{
  "path": "/abs/path/file.ts",
  "success": true,
  "oldHash": "abc123def456",
  "newHash": "789ghi012jkl",
  "linesChanged": 3,
  "stale": false,
  "retries": 0,
  "message": "Replaced 5 lines with 3 lines (range 10-15)",
  "diff": "- 10 | old line\n+ 10 | new line\n  11 | unchanged"
}
```

**Output (auto-recovered):**
```json
{
  "path": "/abs/path/file.ts",
  "success": true,
  "oldHash": "abc123def456",
  "newHash": "789ghi012jkl",
  "linesChanged": 3,
  "stale": false,
  "retries": 1,
  "message": "Replaced 5 lines with 3 lines (auto-recovered from stale anchor, range 10-15)",
  "diff": "- 10 | old line\n+ 10 | new line\n  11 | unchanged"
}
```

---

### ast capabilities

Show all supported AST languages, operations per language, and known limitations.

**Invocation:**
```
structured-edit ast capabilities
```

**Output:**
```json
[
  {
    "lang": "go",
    "extensions": [".go"],
    "operations": ["find-symbols", "rename-symbol", "replace-body", "add-import", "remove-import", "insert-before", "insert-after"],
    "limitations": ["add-import with no existing imports inserts after `package` clause"]
  }
]
```

---

### ast find-symbols

List symbols in a file.

**Invocation:**
```
structured-edit ast find-symbols <file>
```

**Output:**
```json
[
  {
    "name": "hello",
    "kind": "function_declaration",
    "startRow": 0,
    "endRow": 2,
    "startCol": 0,
    "endCol": 1
  }
]
```

---

### ast rename-symbol

Rename all references to a symbol.

**Invocation:**
```
structured-edit ast rename-symbol <file> <old-name> <new-name> [--dry-run] [--actor <name>] [--task-id <id>] [--reason <text>]
```

**Output:**
```json
{
  "success": true,
  "path": "/abs/path/file.ts",
  "operation": "rename-symbol",
  "changes": 5,
  "message": "Renamed 5 occurrences of 'oldName' to 'newName'"
}
```

---

### ast replace-body

Replace a function/method body.

**Invocation:**
```
structured-edit ast replace-body <file> <symbol-name> <new-body> [--dry-run] [--actor <name>] [--task-id <id>] [--reason <text>]
```

`<new-body>` can be `@filepath` to read from a file.

**Output:**
```json
{
  "success": true,
  "path": "/abs/path/file.ts",
  "operation": "replace-body",
  "changes": 1,
  "message": "Replaced body of 'myFunction'"
}
```

---

### ast add-import

Add an import statement.

**Invocation:**
```
structured-edit ast add-import <file> <import-spec> [--dry-run] [--actor <name>] [--task-id <id>] [--reason <text>]
```

`<import-spec>` examples: `'{ Foo } from ./bar'`, `'* as React from react'`

---

### ast remove-import

Remove an import line.

**Invocation:**
```
structured-edit ast remove-import <file> <import-spec> [--dry-run] [--actor <name>] [--task-id <id>] [--reason <text>]
```

---

### ast insert-before / insert-after

Insert content before or after a named symbol.

**Invocation:**
```
structured-edit ast insert-before <file> <symbol-name> <content> [--dry-run] [--actor <name>] [--task-id <id>] [--reason <text>]
structured-edit ast insert-after <file> <symbol-name> <content> [--dry-run] [--actor <name>] [--task-id <id>] [--reason <text>]
```

---

### diff generate

Generate a unified diff between old and new content.

**Invocation:**
```
structured-edit diff generate <file> <old-content> <new-content> [-c <context-lines>]
```

`<old-content>` and `<new-content>` can be `@filepath` to read from files.

**Output:** Unified diff text (not JSON). Prints `"(no changes)"` if inputs are identical.

---

### diff apply

Apply a unified diff patch to a file.

**Invocation:**
```
structured-edit diff apply <file> [--patch <file>] [--dry-run] [-f <fuzzy>] [--actor <name>] [--task-id <id>] [--reason <text>]
```

- `--patch <file>` — patch file to apply (use `-` for stdin)
- `-f, --fuzzy <n>` — fuzzy match tolerance (default 3)

**Output:**
```json
{
  "success": true,
  "hunksApplied": 1,
  "hunksFailed": 0,
  "message": "Applied 1 hunk(s)",
  "newSource": "..."
}
```

---

### verify-changes

Run formatter, linter, typechecker, and tests on changed files. Supports auto-detection from project config files.

**Invocation:**
```
structured-edit verify-changes <file1> [file2] ... [--formatter <cmd>] [--linter <cmd>] [--typecheck <cmd>] [--test-filter <pattern>] [--test-runner <runner>] [--auto-detect] [--revert-on-failure] [--timeout <ms>] [--formatter-args ...] [--linter-args ...] [--test-args ...]
```

**Options:**
- `--formatter <cmd>` — formatter command (e.g. `prettier --write`)
- `--linter <cmd>` — linter command (e.g. `eslint`, `biome lint`)
- `--typecheck <cmd>` — type checker command (e.g. `tsc --noEmit`)
- `--test-filter <pattern>` — filter tests by name pattern
- `--test-runner <runner>` — explicit test runner (`bun test`, `vitest`, `jest`, `pytest`, `go test`, `cargo test`)
- `--auto-detect` — auto-detect tools from `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`
- `--revert-on-failure` — restore originals if any check fails
- `--timeout <ms>` — per-check timeout (default 30000)

**Output:**
```json
{
  "files": ["/abs/path/file.ts"],
  "formatter": { "passed": true, "output": "..." },
  "linter": { "passed": true, "output": "..." },
  "tests": { "passed": true, "output": "..." },
  "typecheck": { "passed": true, "output": "..." },
  "overall": "pass",
  "elapsed_ms": 120,
  "fileHashes": { "/abs/path/file.ts": "abc123def456" },
  "detected": { "formatter": "prettier --write", "testRunner": "vitest" },
  "revertedFiles": ["/abs/path/file.ts"]
}
```

`overall` is `"pass"` or `"fail"`. When `--revert-on-failure` is set, `revertedFiles` lists files restored to their original state.

---

### route-edit

Auto-routed structured edit through AST → Hash → Diff pipeline. One command dispatches to the best available route.

**Invocation:**
```
structured-edit route-edit <file> <operation> [options...]
```

**Operations:** `rename-symbol`, `replace-body`, `add-import`, `remove-import`, `insert-before`, `insert-after`, `replace-hash`, `replace-content`

**Key options:**
- `--method <route>` — force a specific route (`ast`, `hash`, `diff`)
- `--policy <json>` — inline RoutePolicy JSON for testing
- `--dry-run` — preview without writing
- All provenance options: `--actor`, `--task-id`, `--reason`
- AST-specific: `--symbol`, `--old-name`, `--new-name`, `--new-body`, `--import-spec`, `--content`
- Hash-specific: `--old-hash`, `--new-content`, `--range`
- Diff-specific: `--old-content`, `--new-content`

**Output:** Same as the underlying route operation.

---

### batch

Apply the same edit to multiple files in parallel (or serial with `--serial`).

**Invocation:**
```
structured-edit batch <operation> <files...> [options...]
```

Accepts the same options as `route-edit`, plus `--serial` for sequential execution.

**Output:**
```json
{
  "results": [ ... ],
  "summary": {
    "total": 5,
    "succeeded": 4,
    "failed": 1,
    "elapsed_ms": 1234
  }
}
```

---

### intent

Execute an editing intent — one command, full blast radius. Parses a structured intent, discovers symbol definitions and references, generates an edit plan, and executes it.

**Invocation:**
```
structured-edit intent '<json>' [--project-root <dir>] [--dry-run] [--no-verify] [--no-revert] [--timeout <ms>] [--actor <name>] [--task-id <id>] [--reason <text>] [--context <text>]
```

**Intent format (JSON):**
```json
{"operation":"add-parameter","symbol":"myFunction","param":{"name":"x","type":"string","default":"\"hello\""}}
```

**Supported operations:** `add-parameter`, `remove-parameter`, `rename-exported-symbol`

**Output:**
```json
{
  "success": true,
  "plan": { "intent": {...}, "definition": {...}, "impactSummary": "..." },
  "execution": { "steps": [...], "summary": {...}, "verification": {...} }
}
```

---

### provenance query

Show edit history for a file — like `git blame` for agent edits.

**Invocation:**
```
structured-edit provenance query <file> [<line-number>] [--human] [--fuzzy] [--limit <n>]
```

- `--human` — human-readable table format
- `--fuzzy` — include edits without diff data in line-filtered queries

**Output (JSON):**
```json
[
  {
    "timestamp": "2026-05-19T00:00:00.000Z",
    "actor": "agent-name",
    "taskId": "ISSUE-142",
    "reason": "Rename function per spec",
    "operation": "rename-symbol",
    "route": "ast",
    "success": true,
    "diff": "@@ -10,3 +10,3 @@\n-oldFunc\n+newFunc"
  }
]
```

---

### provenance changeset

Show all edits belonging to a changeSet (multi-step edit group).

**Invocation:**
```
structured-edit provenance changeset <changeSetId> [--human]
```

---

### telemetry

View or manage telemetry.

**Invocation:**
```
structured-edit telemetry show [-n <limit>]
structured-edit telemetry summary
structured-edit telemetry health [-w <days>] [--trend]
structured-edit telemetry sessions
structured-edit telemetry export [--from <date>] [--to <date>] [--session <id>]
structured-edit telemetry prune [--older-than <days>]
structured-edit telemetry clear
```

**`telemetry show`** — Show recent telemetry events (default 20).

**`telemetry summary`** — Aggregate counts by route:operation with success rate and average timing.

**`telemetry sessions`** — List session-level summaries (event count, error rate, duration).

**`telemetry export`** — Export events as NDJSON with optional date range or session ID filter.

**`telemetry prune`** — Delete rotated telemetry files older than N days (default 30).

**Event schema:**

### route

Show which edit route would be chosen, with detailed explanation including policy matches.

**Invocation:**
```
structured-edit route <file> <operation> [--policy <json>] [--no-default-config]
```

**`--policy <json>`** — inline policy JSON for testing override behavior.

**`--no-default-config`** — ignore config file policies.

**Output:**
```json
{
  "file": "src/foo.ts",
  "operation": "rename-symbol",
  "language": "typescript",
  "route": "ast",
  "explanation": {
    "route": "ast",
    "reasons": ["Language 'typescript' supports AST operations"],
    "policyApplied": false
  }
}
```

**Output with policy override:**
```json
{
  "file": "src/foo.py",
  "operation": "rename-symbol",
  "language": "python",
  "route": "hash",
  "explanation": {
    "route": "hash",
    "reasons": ["Policy language override for 'python' forces route 'hash'"],
    "policyApplied": true,
    "policySource": "language"
  }
}
```

---

### config

Show the current HashPilot configuration after merging global, project, CLI, and env overrides.

**Invocation:**
```
structured-edit config [--config <path>]
```

**Output:**
```json
{
  "routePolicy": {
    "languageOverrides": { "python": "hash" },
    "operationOverrides": { "add-import": "diff" }
  },
  "telemetry": { "enabled": true }
}
```

---

### doctor

Verify the full user-scope HashPilot installation. Checks core files, CLI on PATH, config, and all adapter integrations.

**Invocation:**
```
structured-edit doctor
```

**Output (JSON):**
```json
{
  "checks": [
    { "name": "core-directory", "status": "pass", "message": "Found: /home/user/.agentic-tools/structured-editing" },
    { "name": "cli-executable", "status": "pass", "message": "CLI works: 0.1.0" },
    { "name": "claude-integration", "status": "pass", "message": "HashPilot section found in CLAUDE.md" },
    { "name": "config-file", "status": "skip", "message": "No config file — using defaults" }
  ],
  "healthy": true,
  "timestamp": "2026-04-26T00:00:00.000Z",
  "version": "0.1.0"
}
```

**Status values:**
- `pass` — check passed
- `fail` — action required
- `warn` — non-blocking issue
- `skip` — component not applicable

**Exit code:** `0` if all checks pass, `1` otherwise.

A standalone version is also available: `scripts/doctor.sh` (works without CLI on PATH).

---


### telemetry

View or manage telemetry.

**Invocation:**
```
structured-edit telemetry show [-n <limit>]
structured-edit telemetry summary
structured-edit telemetry clear
```

**Event schema:**
```json
{
  "timestamp": "2025-01-01T00:00:00.000Z",
  "operation": "replace-hash",
  "route": "hash",
  "file": "/abs/path/file.ts",
  "files_count": 1,
  "language": "typescript",
  "success": true,
  "fallback_reason": null,
  "retries": 0,
  "verification_result": "pass",
  "elapsed_ms": 5
}
```

**Fields added in Phase 7:**
- `language` — detected language for AST/hash operations (e.g., `"typescript"`, `"python"`, `"go"`)
- `retries` — number of auto-retries performed (1 if auto-recovered from stale anchor, 0 otherwise)

### telemetry health

Show an operational health report with per-language stats, failure breakdowns, and threshold warnings.

**Invocation:**
```
structured-edit telemetry health [-w <days>] [--trend]
```

- `-w, --window <days>` — time window in days (default 7)
- `-t, --trend` — compare current window to the previous window of the same length, reporting deltas and regressions

Default window is 7 days.

**Output:**
```json
{
  "totalEvents": 203,
  "windowDays": 7,
  "routeDistribution": {
    "ast": { "count": 93, "success": 82 },
    "verify": { "count": 72, "success": 50 },
    "read": { "count": 19, "success": 19 },
    "hash": { "count": 19, "success": 14 }
  },
  "fallbackFrequency": { "stale-anchor": 5 },
  "staleAnchors": { "total": 6, "recovered": 1, "failed": 5 },
  "perLanguage": {
    "rust": { "operations": 21, "failures": 5 },
    "python": { "operations": 10, "failures": 1 }
  },
  "verifyFailures": { "total": 22, "byCheck": { "formatter": 6 } },
  "topFallbackCauses": [{ "reason": "stale-anchor", "count": 5 }],
  "warnings": [
    "Stale-anchor rate 43% exceeds threshold of 10%"
  ]
}
```

**Thresholds** (trigger `warnings` when exceeded):
- Stale-anchor rate > 10% of replace-hash calls
- Fallback-to-diff rate > 10% of all events
- Verify-changes failure rate > 20%
- Per-language failure rate > 30% (when >= 3 operations)

### telemetry health --trend

Compare the current window against the previous window of the same length.

**Output:**
```json
{
  "current": { "...": "standard HealthReport for current window" },
  "previous": { "...": "standard HealthReport for preceding window" },
  "changes": {
    "totalEventsDelta": 15,
    "errorRateDelta": -2.3,
    "staleAnchorDelta": 1,
    "verifyFailureDelta": 0,
    "newWarnings": ["Stale-anchor rate 43% exceeds threshold of 10%"],
    "resolvedWarnings": ["Verify-changes failure rate 25% exceeds threshold of 20%"],
    "languageRegressions": ["rust (10% → 40% failure rate)"]
  }
}
```

---

## Routing Priority

1. **AST** — If the file's language is supported (TypeScript, TSX, JavaScript, Python, Go, Rust) and the operation is AST-compatible (rename, replace-body, add/remove import, insert)
2. **Hash** — If the operation provides hash-anchored content identification
3. **Diff** — Fallback for unsupported operations

## Error Handling

All commands return JSON with:
- `success: false` on operation failure
- `error` field on file-level failures
- `stale: true` on hash mismatch (auto-recovered by default, `"retries": 1` on recovery)
- `message` with human-readable description

## Exit Codes

- `0`: Success
- `1`: General error (file not found, parse error, stale anchor, etc.)