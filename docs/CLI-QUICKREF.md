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

### Positionals are positional — `grep-many` is the one that also takes flags

```bash
hashpilot grep-many '<pattern>' <path>...              # ✅ positional form
hashpilot grep-many --pattern x --path src --path lib  # ✅ flag form (--path repeatable)
hashpilot grep-many x --pattern x src                  # ❌ both forms, exit 1
hashpilot grep-many --pattern x --paths src            # ❌ the flag is --path, exit 1
```

`symbol-lookup-many` is the exception in the search family: paths are positional but
names come from `--names n1,n2`.

Every other command is positional-only. A wrong flag is no longer a bare Commander
line on stderr: any parse error — unknown flag, missing positional, unknown
subcommand — writes the usage envelope to stdout with `INVALID_ARGUMENT`, a
`recovery` pointing at `--help`, and exit 1, with nothing on stderr (#57).

### `replace-body` takes statements only — no braces, no indentation

`replace-body` owns both the braces and the indentation of the body it writes.
Whatever you pass is placed *inside* the existing braces and indented to the
symbol. Passing either back produces a file that still parses, so the mistake is
silent (#108).

```bash
hashpilot ast replace-body f.ts f 'return a * 2;'        # ✅
hashpilot ast replace-body f.ts f '{ return a * 2; }'    # ❌ nested block inside the body
hashpilot ast replace-body f.ts f '  return a * 2;'      # ❌ double-indented
```

Multi-line bodies are written flush-left, one statement per line; the command
re-indents every line to the symbol.

### An import spec quotes its module path

The module path is a string literal in every supported language, and the spec is
parsed as source. An unquoted path is `PARSE_ERROR` (#109).

```bash
hashpilot ast add-import f.ts '{ Foo } from "./bar"'     # ✅
hashpilot ast add-import f.ts '{ Foo } from ./bar'       # ❌ PARSE_ERROR
```

### A JavaScript import spec is always written in ESM form

You pass the same `'{ join } from "path"'` spec whatever the file's module system
is. For a CommonJS JavaScript file, `add-import` translates it and writes
`const { join } = require("path");` — passing `require` syntax as the spec is not
supported. The module system is decided by, in order: a `.cjs`/`.mjs` extension,
the nearest `package.json` `type` field (absent ⇒ CommonJS, per Node), then a
content sniff.

```bash
hashpilot ast add-import mod.cjs '{ join } from "path"'   # → const { join } = require("path");
hashpilot ast add-import mod.mjs '{ join } from "path"'   # → import { join } from "path";
```

A JavaScript file that mixes `require` and `import` with no extension or
`package.json` to settle it is refused with `MODULE_SYSTEM_MISMATCH` rather than
guessing — emitting either syntax risks a file that parses but will not load
(#139). Two specs have no single CommonJS declaration and are also refused:
a combined default-and-named spec (`'fs, { join } from "path"'` — issue it as two
calls) and a `type`-only spec. TypeScript and TSX are unaffected: they are always
emitted in ESM form.

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

_36 commands, generated from `--help`. Do not edit by hand — run `bun run gen:cli-quickref`._

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
| `--format <fmt>` | Output format: json or text (default: json if piped/CI, text if TTY) |
| `--json` | [deprecated: use --format json] Force JSON output (default: false) |
| `-q, --quiet` | Suppress the human-readable success line (the JSON envelope is never suppressed) |
| `-v, --verbose` | Write routing and timing diagnostics to stderr |
| `--no-color` | Disable ANSI color in text output (also honors NO_COLOR) |

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

#### `grep-many`

Search pattern across multiple paths. Usage: grep-many "safeWrite" src/ (or the flag form: grep-many --pattern "safeWrite" --path src/)

```
hashpilot grep-many [options] [pattern] [paths...]
```

| Positional | Meaning |
|------------|---------|
| `pattern` | Regex pattern (or use --pattern) |
| `paths` | Paths to search (or use --path) |

| Flag | Meaning |
|------|---------|
| `-i, --ignore-case` | Case insensitive |
| `--pattern <p>` | Regex pattern, flag form of the positional |
| `--path <dir>` | Path to search, flag form of the positional (repeatable) (default: []) |
| `--file-pattern <glob>` | File pattern filter |
| `--max-results <n>` | Max results |

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

File-scoped, binding-aware rename of a symbol and its references. Refuses with AMBIGUOUS_SYMBOL when the name binds more than one symbol in the file (a shadowed local, a foreign import, or a duplicate declaration).

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
| `--include-source` | On a dry run, return the whole post-edit file instead of a diff |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |

#### `ast replace-body`

Replace function/method body

```
hashpilot ast replace-body [options] <file> <symbol> <new-body>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `symbol` | Symbol name |
| `new-body` | New body statements only — no braces, no indentation (or @file) |

| Flag | Meaning |
|------|---------|
| `--dry-run` | Preview only |
| `--include-source` | On a dry run, return the whole post-edit file instead of a diff |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |

#### `ast add-import`

Add an import statement

```
hashpilot ast add-import [options] <file> <import-spec>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `import-spec` | Import spec, module path quoted: '{ Foo } from "./bar"' |

| Flag | Meaning |
|------|---------|
| `--dry-run` | Preview only |
| `--include-source` | On a dry run, return the whole post-edit file instead of a diff |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |

#### `ast remove-import`

Remove an import statement

```
hashpilot ast remove-import [options] <file> <import-spec>
```

| Positional | Meaning |
|------------|---------|
| `file` | File path |
| `import-spec` | Import spec to remove, e.g. '{ Foo } from "./bar"' or a bare binding name |

| Flag | Meaning |
|------|---------|
| `--dry-run` | Preview only |
| `--include-source` | On a dry run, return the whole post-edit file instead of a diff |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |

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
| `--include-source` | On a dry run, return the whole post-edit file instead of a diff |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |

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
| `--include-source` | On a dry run, return the whole post-edit file instead of a diff |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |

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
| `--new-body <text>` | New body statements only — no braces, no indentation (replace-body, or @file) |
| `--import-spec <spec>` | Import spec, module path quoted: '{ Foo } from "./bar"' |
| `--content <text>` | Content (insert-before, insert-after, or @file) |
| `--policy <json>` | Inline RoutePolicy JSON |
| `--dry-run` | Preview without writing |
| `--include-source` | On a dry run, return the whole post-edit file instead of a diff |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |

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
| `--new-body <text>` | New body statements only — no braces, no indentation (replace-body, or @file) |
| `--import-spec <spec>` | Import spec, module path quoted: '{ Foo } from "./bar"' |
| `--content <text>` | Content (insert-before, insert-after, or @file) |
| `--policy <json>` | Inline RoutePolicy JSON |
| `--serial` | Execute sequentially instead of parallel |
| `--dry-run` | Preview without writing |
| `--include-source` | On a dry run, return the whole post-edit file instead of a diff |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |

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
| `-f, --fuzzy <n>` | Fuzzy match tolerance in lines; 0 = strict (exact offset and content, refuses otherwise) (default: "3") |
| `--actor <name>` | Agent identity for provenance tracking |
| `--task-id <id>` | Task/issue reference for provenance |
| `--reason <text>` | Human-readable reason for the edit |

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
| `--no-scope-tests` | Run the whole test suite instead of only tests related to the changed files |
| `--use-baseline` | Ignore tests that were already failing at this commit (see --record-baseline) |
| `--record-baseline` | Record which tests currently fail, for later --use-baseline runs. Run this before editing. |

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

#### `mcp`

Run HashPilot as an MCP server over stdio

```
hashpilot mcp [options]
```

| Flag | Meaning |
|------|---------|
| `--stdio` | Speak MCP over stdin/stdout (the only transport, and the default) |

#### `doctor`

Verify HashPilot installation health

```
hashpilot doctor [options]
```

#### `upgrade`

Upgrade HashPilot to the latest version (npm, falling back to GitHub)

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
