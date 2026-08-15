# CLI Quick Reference

Copy-paste reference for `hashpilot`, aimed at agents driving the CLI without
prior context. The command tables below are **generated from the CLI's own `--help`**,
so they cannot drift from what the binary accepts.

- Regenerate: `bun run gen:cli-quickref`
- CI enforces freshness with `bun run gen:cli-quickref:check` (also covered by `bun test`).
- Output *shapes* and exit codes are asserted by `tests/cli-contract.test.ts` — the
  "Gotchas" section below is executable, not folklore.

Related: [`ADAPTER-CONTRACT.md`](ADAPTER-CONTRACT.md) for the machine contract,
[`ARCHITECTURE.md`](ARCHITECTURE.md) for how the routing tiers fit together.

---

## Gotchas

Each of these cost a real agent a wasted round-trip. Every claim has a test in
`tests/cli-contract.test.ts`.

### Positionals are positional — there is no `--pattern` or `--paths`

```bash
hashpilot grep-many '<pattern>' <path>...      # ✅
hashpilot grep-many --pattern x --paths src    # ❌ unknown option, exit 1
```

`symbol-lookup-many` is the exception in the search family: paths are positional but
names come from `--names n1,n2`.

### `read-many` returns a bare top-level array, not an envelope

```jsonc
[ { "path": "…", "hash": "…", "content": "…" } ]   // read-many
{ "pattern": "…", "results": [ … ] }               // grep-many
{ "checks": [ … ] }                                // doctor
```

Do not assume `.results` or `.success` on every command. The uniform envelope is
[#18 (B15)](../../issues/18); until it lands, shapes are per-command and the tables
below plus `ADAPTER-CONTRACT.md` are the source of truth.

### `telemetry show -n 0` means zero, and reads always exit 0

A telemetry query reports on *past* operations. Its exit code describes the query,
not the events: a log full of failures still exits 0. Do not infer health from the
exit code — read `telemetry health`.

`-n 0` returns `[]`. (It used to return the entire log, because `slice(-0)` is
`slice(0)`.)

A read that *cannot complete* is the exception: if the log exists but is
unreadable, the query exits `5` with `errorCode: "READ_FAILED"` instead of
returning `[]`. Malformed lines are skipped, counted, and reported on stderr
(`warning: skipped N malformed telemetry line(s)`) — stdout keeps its shape.

### The telemetry subcommand is `show`, not `recent`

`hashpilot telemetry show -n 50`. Siblings: `summary`, `health`, `clear`,
`sessions`, `export`, `prune`.

### Never read an exit code through a pipe

```bash
hashpilot doctor | head        # $? is head's status — always 0
hashpilot doctor >/dev/null 2>&1; echo $?   # ✅ the real code
```

This masked a genuine exit-70 during review and made a broken build look green.

### Exit codes are the retry contract

| Code | Meaning | What an agent should do |
|------|---------|-------------------------|
| 0 | ok | continue |
| 1 | usage error | fix the command line; do not retry as-is |
| 2 | edit failed | the edit was refused; re-read and re-plan |
| 3 | stale anchor / precondition | **re-read the file and retry** — this one is retryable |
| 4 | verification failed | the edit applied but checks failed |
| 5 | I/O error | check the path exists and is writable |
| 70 | internal error | a HashPilot bug — report it |

Batch commands return worst-wins across their files.

### `PARSE_ERROR` is not retryable — fix the source

Every AST edit refuses a file that does not already parse, and reparses its own output
before writing. Both refusals surface as `error.code: "PARSE_ERROR"` with exit 2, and the
message carries `line:column`. Re-reading and retrying will not help; either fix the
syntax error or pass the global `--allow-parse-errors` (which waives the *pre*-check only —
an edit that would corrupt a clean file is still discarded).

Hash and diff edits get the post-edit check too, whenever a parser exists for the language.

### File size is not a limit (fixed in v3.1)

Through v3.0.0 the tree-sitter Node binding rejected `parse(string)` at 32767 characters
with a bare `Invalid argument`, so AST edits silently demoted to the diff route on any
large file ([#55](../../issues/55)). Source is now streamed to the parser in chunks; there
is no size ceiling and no reason to force `--method hash` on a big file.

### `bun install` before anything else

tree-sitter is a native module. Without `node_modules/`, the AST test files abort with
`Cannot find package 'tree-sitter'` while the rest of the suite passes — the failure
looks unrelated to AST. Green baseline is `bun test` fully passing (515 pass / 0 fail).

---

## Command reference

<!-- BEGIN GENERATED: command reference -->

_35 commands, generated from `--help`. Do not edit by hand — run `bun run gen:cli-quickref`._

### Global options

Accepted before the subcommand, e.g. `hashpilot --allowed-root /srv/app read-many f.ts`.

```
hashpilot [options] [command]
```

| Flag | Meaning |
|------|---------|
| `-V, --version` | output the version number |
| `--allow-outside-root` | Permit writes outside the project root (credentials and system paths stay blocked) |
| `--allowed-root <dir...>` | Additional directory writes may target |
| `--no-telemetry` | Disable telemetry logging for this invocation |
| `--allow-parse-errors` | Edit a file that already has syntax errors (the post-edit parse check still applies) |

### Command groups

| Group | Subcommands |
|-------|-------------|
| `ast` | `capabilities`, `find-symbols`, `rename-symbol`, `replace-body`, `add-import`, `remove-import`, `insert-before`, `insert-after` |
| `diff` | `generate`, `apply` |
| `telemetry` | `show`, `summary`, `health`, `clear`, `sessions`, `export`, `prune` |
| `provenance` | `query`, `changeset` |

### Commands

#### `read-many`

Read multiple files, return content + hashes

```
hashpilot read-many [options] <files...>
```

| Positional | Meaning |
|------------|---------|
| `files` | File paths |

| Flag | Meaning |
|------|---------|
| `--json` | Output as JSON (default: true) |

#### `read-hash`

Read a line with hash and context

```
hashpilot read-hash [options] <file> <line>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `line` | Line number |

| Flag | Meaning |
|------|---------|
| `-c, --context <n>` | Context lines (default: "3") |
| `--json` | Output as JSON (default: true) |

#### `grep-many`

Search pattern across multiple paths

```
hashpilot grep-many [options] <pattern> <paths...>
```

| Positional | Meaning |
|------------|---------|
| `pattern` | Regex pattern |
| `paths` | Paths to search |

| Flag | Meaning |
|------|---------|
| `-i, --ignore-case` | Case insensitive |
| `--file-pattern <glob>` | File pattern filter |
| `--max-results <n>` | Max results |
| `--json` | Output as JSON (default: true) |

#### `symbol-lookup-many`

Find symbol definitions. Usage: symbol-lookup-many <paths...> --names n1,n2

```
hashpilot symbol-lookup-many [options] <paths...>
```

| Positional | Meaning |
|------------|---------|
| `paths` | Paths to search |

| Flag | Meaning |
|------|---------|
| `--names <names>` | Comma-separated symbol names |
| `--json` | Output as JSON (default: true) |

#### `replace-hash`

Replace content identified by hash anchor

```
hashpilot replace-hash [options] <file> <old-hash> <new-content>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `old-hash` | Hash of content to replace |
| `new-content` | New content (or @file to read from file) |

| Flag | Meaning |
|------|---------|
| `--range <start:end>` | Line range (1-indexed). N or N:M |
| `--no-recover` | Fail immediately on a stale anchor instead of attempting relocation |
| `--dry-run` | Preview without writing |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |
| `--json` | Output as JSON (default: true) |

#### `ast capabilities`

Show supported AST languages, operations, and limitations

```
hashpilot ast capabilities [options]
```

#### `ast find-symbols`

List symbols in a file

```
hashpilot ast find-symbols [options] <file>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |

#### `ast rename-symbol`

Rename a symbol across a file

```
hashpilot ast rename-symbol [options] <file> <old-name> <new-name>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `old-name` | Current symbol name |
| `new-name` | New symbol name |

| Flag | Meaning |
|------|---------|
| `--dry-run` | Preview only |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |
| `--json` | Output as JSON (default: true) |

#### `ast replace-body`

Replace function/method body

```
hashpilot ast replace-body [options] <file> <symbol> <new-body>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `symbol` | Symbol name |
| `new-body` | New body (or @file) |

| Flag | Meaning |
|------|---------|
| `--dry-run` | Preview only |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |
| `--json` | Output as JSON (default: true) |

#### `ast add-import`

Add an import statement

```
hashpilot ast add-import [options] <file> <import-spec>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `import-spec` | Import spec (e.g. '{ Foo } from ./bar') |

| Flag | Meaning |
|------|---------|
| `--dry-run` | Preview only |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |
| `--json` | Output as JSON (default: true) |

#### `ast remove-import`

Remove an import statement

```
hashpilot ast remove-import [options] <file> <import-spec>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `import-spec` | Import spec to remove |

| Flag | Meaning |
|------|---------|
| `--dry-run` | Preview only |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |
| `--json` | Output as JSON (default: true) |

#### `ast insert-before`

Insert content before a symbol

```
hashpilot ast insert-before [options] <file> <symbol> <content>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `symbol` | Symbol name |
| `content` | Content to insert (or @file) |

| Flag | Meaning |
|------|---------|
| `--dry-run` | Preview only |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |
| `--json` | Output as JSON (default: true) |

#### `ast insert-after`

Insert content after a symbol

```
hashpilot ast insert-after [options] <file> <symbol> <content>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `symbol` | Symbol name |
| `content` | Content to insert (or @file) |

| Flag | Meaning |
|------|---------|
| `--dry-run` | Preview only |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |
| `--json` | Output as JSON (default: true) |

#### `route-edit`

Auto-routed structured edit through AST → Hash → Diff pipeline

```
hashpilot route-edit [options] <file> <operation>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `operation` | Operation (rename-symbol, replace-body, add-import, remove-import, insert-before, insert-after, replace-hash, replace-content) |

| Flag | Meaning |
|------|---------|
| `--method <route>` | Force a specific route (ast, hash, diff) |
| `--old-hash <hash>` | Hash for hash-route verification |
| `--new-content <text>` | New content (or @file) |
| `--old-content <text>` | Old content for diff-route search-and-replace |
| `--range <start:end>` | Line range for hash route |
| `--old-name <name>` | Old symbol name (rename-symbol) |
| `--new-name <name>` | New symbol name (rename-symbol) |
| `--symbol <name>` | Symbol name (replace-body, insert-before, insert-after) |
| `--new-body <text>` | New body content (replace-body, or @file) |
| `--import-spec <spec>` | Import spec (add-import, remove-import) |
| `--content <text>` | Content (insert-before, insert-after, or @file) |
| `--policy <json>` | Inline RoutePolicy JSON |
| `--dry-run` | Preview without writing |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |
| `--json` | Output as JSON (default: true) |

#### `batch`

Apply the same edit to multiple files in parallel

```
hashpilot batch [options] <operation> <files...>
```

| Positional | Meaning |
|------------|---------|
| `operation` | Operation (rename-symbol, replace-body, add-import, remove-import, insert-before, insert-after, replace-hash, replace-content) |
| `files` | Files to edit |

| Flag | Meaning |
|------|---------|
| `--method <route>` | Force a specific route (ast, hash, diff) |
| `--old-hash <hash>` | Hash for hash-route verification |
| `--new-content <text>` | New content (or @file) |
| `--old-content <text>` | Old content for diff-route search-and-replace |
| `--range <start:end>` | Line range for hash route |
| `--old-name <name>` | Old symbol name (rename-symbol) |
| `--new-name <name>` | New symbol name (rename-symbol) |
| `--symbol <name>` | Symbol name (replace-body, insert-before, insert-after) |
| `--new-body <text>` | New body content (replace-body, or @file) |
| `--import-spec <spec>` | Import spec (add-import, remove-import) |
| `--content <text>` | Content (insert-before, insert-after, or @file) |
| `--policy <json>` | Inline RoutePolicy JSON |
| `--serial` | Execute sequentially instead of parallel |
| `--dry-run` | Preview without writing |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |
| `--json` | Output as JSON (default: true) |

#### `intent`

Execute an editing intent — one command, full blast radius

```
hashpilot intent [options] <intent>
```

| Positional | Meaning |
|------------|---------|
| `intent` | Intent as JSON: {"operation":"add-parameter","symbol":"fn","param":{"name":"x"}} |

| Flag | Meaning |
|------|---------|
| `--project-root <dir>` | Project root directory |
| `--dry-run` | Preview plan without modifying files |
| `--yes` | Apply the plan even though part of the intent could not be resolved |
| `--no-verify` | Skip verification after execution |
| `--no-revert` | Don't roll back on failure |
| `--timeout <ms>` | Timeout per operation in ms (default: "30000") |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |
| `--context <text>` | Agent prompt/context (or @file) |
| `--json` | Output as JSON (default: true) |

#### `diff generate`

Generate a unified diff between old and new content

```
hashpilot diff generate [options] <file> <old-content> <new-content>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path (for diff header) |
| `old-content` | Old content (or @file) |
| `new-content` | New content (or @file) |

| Flag | Meaning |
|------|---------|
| `-c, --context <n>` | Context lines (default: "3") |
| `--raw` | Print the diff text alone, without the JSON envelope |

#### `diff apply`

Apply a unified diff patch to a file

```
hashpilot diff apply [options] <file>
```

| Positional | Meaning |
|------------|---------|
| `file` | File to patch |

| Flag | Meaning |
|------|---------|
| `--patch <file>` | Patch file to apply (or '-' for stdin) |
| `--dry-run` | Preview without writing |
| `-f, --fuzzy <n>` | Fuzzy match tolerance (default: "3") |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |
| `--json` | Output as JSON (default: true) |

#### `verify-changes`

Run formatter, linter, typechecker, and tests on changed files

```
hashpilot verify-changes [options] <files...>
```

| Positional | Meaning |
|------------|---------|
| `files` | Files to verify |

| Flag | Meaning |
|------|---------|
| `--formatter <cmd>` | Formatter command |
| `--linter <cmd>` | Linter command |
| `--typecheck <cmd>` | Type checker command (e.g. 'tsc --noEmit') |
| `--test-filter <pattern>` | Test filter pattern |
| `--test-runner <runner>` | Test runner (bun test, vitest, jest, pytest, go test, cargo test) |
| `--formatter-args <args...>` | Formatter args |
| `--linter-args <args...>` | Linter args |
| `--test-args <args...>` | Test runner args |
| `--auto-detect` | Auto-detect tools from project config files |
| `--allow-arbitrary-tool` | Allow binaries outside the allowlist (warns on each use) |
| `--revert-on-failure` | Restore original file contents if any check fails |
| `--timeout <ms>` | Per-check timeout in ms (default 30000) |
| `--json` | Output as JSON (default: true) |

#### `telemetry show`

Show recent telemetry events

```
hashpilot telemetry show [options]
```

| Flag | Meaning |
|------|---------|
| `-n, --limit <n>` | Number of events (default: "20") |

#### `telemetry summary`

Show telemetry summary

```
hashpilot telemetry summary [options]
```

#### `telemetry health`

Show telemetry health report with per-language stats and threshold warnings

```
hashpilot telemetry health [options]
```

| Flag | Meaning |
|------|---------|
| `-w, --window <days>` | Time window in days (default: "7") |
| `-t, --trend` | Compare current window to previous window |

#### `telemetry clear`

Clear telemetry log

```
hashpilot telemetry clear [options]
```

#### `telemetry sessions`

List session summaries

```
hashpilot telemetry sessions [options]
```

#### `telemetry export`

Export telemetry events as NDJSON

```
hashpilot telemetry export [options]
```

| Flag | Meaning |
|------|---------|
| `--from <date>` | Start date (ISO format) |
| `--to <date>` | End date (ISO format) |
| `--session <id>` | Session ID filter |
| `--ndjson` | Stream one compact event per line instead of the JSON envelope |

#### `telemetry prune`

Delete old rotated telemetry files

```
hashpilot telemetry prune [options]
```

| Flag | Meaning |
|------|---------|
| `-d, --older-than <days>` | Days threshold (default: "30") |

#### `provenance query`

Show edit history for a file (like git blame for agent edits)

```
hashpilot provenance query [options] <file> [line]
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `line` | Optional line number to filter by |

| Flag | Meaning |
|------|---------|
| `--human` | Human-readable output |
| `--json` | JSON output (default) (default: true) |
| `--fuzzy` | Include edits without diff data in line-filtered queries |
| `--limit <n>` | Max entries to show |

#### `provenance changeset`

Show all edits in a changeSet

```
hashpilot provenance changeset [options] <changeSetId>
```

| Positional | Meaning |
|------------|---------|
| `changeSetId` | ChangeSet UUID |

| Flag | Meaning |
|------|---------|
| `--human` | Human-readable output |

#### `changesets`

List undoable changeSets, newest first

```
hashpilot changesets [options]
```

| Flag | Meaning |
|------|---------|
| `--limit <n>` | Max changeSets to list (default 20) |

#### `undo`

Restore every file in a changeSet to its pre-edit contents

```
hashpilot undo [options] [changeSetId]
```

| Positional | Meaning |
|------------|---------|
| `changeSetId` | ChangeSet to undo; omit with --last |

| Flag | Meaning |
|------|---------|
| `--last` | Undo the most recent changeSet |
| `--force` | Restore even files modified since the edit was applied |
| `--dry-run` | Report what would be restored without touching the disk |

#### `doctor`

Verify HashPilot installation health

```
hashpilot doctor [options]
```

#### `upgrade`

Upgrade HashPilot to the latest version from GitHub

```
hashpilot upgrade [options]
```

| Flag | Meaning |
|------|---------|
| `--channel <channel>` | Release channel (default: main) (default: "main") |
| `--target <dir>` | Install target directory (default: ~/.agentic-tools) |
| `--keep-telemetry` | Preserve existing telemetry on upgrade |
| `--force` | Skip confirmation prompt |
| `--dry-run` | Show what would be done without executing |

#### `uninstall`

Remove HashPilot and all its components from the system

```
hashpilot uninstall [options]
```

| Flag | Meaning |
|------|---------|
| `--keep-config` | Preserve config and telemetry data |
| `--force` | Skip confirmation prompt (auto-detected when piped) |
| `--dry-run` | Show what would be removed without deleting anything |
| `--target <dir>` | Install target directory (default: ~/.agentic-tools) |
| `--json` | Output as JSON (default: true) |

#### `route`

Show which edit route would be chosen (with detailed explanation)

```
hashpilot route [options] <file> <operation>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `operation` | Operation name |

| Flag | Meaning |
|------|---------|
| `--policy <json>` | Inline policy JSON to test |
| `--no-default-config` | Ignore config file policies |

#### `config`

Show current HashPilot configuration

```
hashpilot config [options]
```

| Flag | Meaning |
|------|---------|
| `--config <path>` | Config file path override |

<!-- END GENERATED: command reference -->
