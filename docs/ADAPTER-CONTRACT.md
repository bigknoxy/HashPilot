# HashPilot — Adapter Contract

This document defines the machine-readable contract that coding agents use to interact with HashPilot. All commands are invoked via the `hashpilot` CLI and return JSON on stdout.

## Response envelope (apiVersion 1)

Every command writes the same top-level shape. Schema: [`schema/hashpilot-envelope.schema.json`](../schema/hashpilot-envelope.schema.json).

```json
{
  "apiVersion": "1",
  "ok": true,
  "command": "telemetry show",
  "data": { "...": "the per-command payload documented below" },
  "error": null,
  "warnings": []
}
```

| Field | Meaning |
|-------|---------|
| `apiVersion` | Envelope version. `"1"` today; bumped only if the envelope's own shape breaks. |
| `ok` | True exactly when the exit code is 0. `ok` and `$?` never disagree — check either, not both. |
| `command` | Space-separated subcommand path, e.g. `"telemetry show"`. |
| `data` | The per-command payload. **Every example below shows what goes here, not the top level.** |
| `error` | `null` when `ok`; otherwise `{ code, message, recovery?, details? }`. `code` is an `ErrorCode` — branch on it, never on `message`. |
| `warnings` | Non-fatal notices, each `{ code, message, ... }`. Codes: `ROUTE_FALLBACK` (the edit was downgraded to a less safe route), `ANCHOR_RELOCATED` (the anchor moved; the edit landed elsewhere), `TELEMETRY_LOG_CORRUPT` (malformed log lines were skipped). |

**Breaking change in v3.0.0 (#18, #56).** Through v2.x each command returned its own
shape at the top level — some a bare array, some an object — so an adapter had to
special-case the command it had just run and had no field to detect a contract change
with. Migration is mechanical: read `.data` where you used to read the root, and `.error.code`
where you used to read `.errorCode`.

Two commands keep a raw, unwrapped mode for piping into other tools:
`diff generate --raw` (the diff text alone) and `telemetry export --ndjson` (one compact
event per line). `--human` output on `provenance query` and `telemetry` is text, not JSON,
and is unaffected.

## Parse-validity gate

Every AST operation refuses a file that does not already parse, and reparses its own
output before the write. Two failure shapes an adapter should expect:

| Situation | `error.code` | Exit | Meaning |
|-----------|--------------|------|---------|
| Input has a syntax error | `PARSE_ERROR` | 2 | No edit was attempted. The message carries `line:column` and the offending node. |
| Edit would corrupt a clean file | `PARSE_ERROR` | 2 | Nothing was written. The file on disk is unchanged. |

Neither is retryable by re-reading — fix the source, or pass the global
`--allow-parse-errors` flag to waive the *pre*-check when editing a knowingly broken
file. The post-edit check is never waived for AST edits, because it also catches bugs
in HashPilot's own offset arithmetic. `replace-hash` honors the flag for its
post-check, since a hash edit may legitimately be the thing that repairs a broken file.

Hash and diff edits get the post-check too, whenever a parser exists for the language.
Languages with no tree-sitter grammar (and `.d.ts`) are never gated.

There is no file-size limit on AST edits. Through v3.0.0 sources over 32KB threw
inside the tree-sitter binding and fell back to the diff route.

## Atomic writes and undo

Every write is temp-file + `fsync` + `rename`, so a crash mid-edit leaves the original
file byte-identical rather than truncated. Before each write the original bytes are
snapshotted under `~/.agentic-tools/snapshots/`, keyed by a changeSet ID minted once
per CLI invocation.

| Command | Success shape | Failure |
|---------|---------------|---------|
| `changesets [--limit N]` | `data.changeSets: [{changeSetId, timestamp, files[]}]`, newest first | — |
| `undo <id>` / `undo --last` | `data: {success, changeSetId, files[], message}` | `HASH_MISMATCH`, exit 3, when a file changed after the edit |

`undo` never partially clobbers: a file that fails its check is left exactly as found
and reported in `data.files[]` with a `reason`. `--force` overrides the check;
`--dry-run` reports without touching disk. An undo is not itself snapshotted, so
`undo --last` cannot ping-pong between two states.

## Output Format (B16)

The CLI supports two output modes controlled by the global `--format` flag:

```
--format <json|text>
```

| Precedence | Condition | Format |
|------------|-----------|--------|
| 1. explicit `--format <fmt>` | `hashpilot <cmd> --format text` | text |
| 2. `--json` (deprecated) | `hashpilot <cmd> --json` | json (emits stderr: `[deprecation]`) |
| 3. `$CI` truthy | CI runner environment | json |
| 4. stdout is a TTY | interactive shell | text |
| 5. default | piped/redirected | json |

**`--json` is a hidden deprecated alias for `--format json`.** The deprecation
notice is emitted once per invocation to stderr. It will be removed in the next
minor version.

**All error output is always JSON.** The `finish()` function only uses the text
renderer for successful results (`success !== false`). Error/usage envelopes
remain the canonical apiVersion 1 payload regardless of format mode, because an
agent parsing a non-zero exit code always expects structured data.

**Text renderers** are per-command. A command without a registered renderer falls
back to a compact key/value dump. Diagnostics, progress messages, and the
deprecation warning go to **stderr** — never stdout.

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
hashpilot read-many <file1> [file2] ...
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
hashpilot read-hash <file> <line-number> [-c <context-lines>]
```

**Output:**
```json
{
  "path": "/abs/path/to/file.ts",
  "line": 10,
  "content": "  const x = foo();",
  "lineHash": "12-char-hash",
  "contextHash": "12-char-hash",
  "contextBefore": ["line 7", "line 8", "line 9"],
  "contextAfter": ["line 11", "line 12", "line 13"],
  "error": null
}
```

**Use case:** Verify exact line content before editing. Use `contextHash` to anchor edits precisely.

Both hashes are 12 hex characters — the same width `replace-hash` computes, so a
hash returned by `read-hash` can be passed straight back as an anchor. (Through
v1.5.3 `lineHash` was 8 characters and every such round-trip failed with
`STALE_ANCHOR` — [#60](../../issues/60).)

---

### grep-many

Search a regex pattern across paths.

**Invocation:**
```
hashpilot grep-many <pattern> <path1> [path2] ... [-i] [--file-pattern <glob>] [--max-results <n>]
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
hashpilot symbol-lookup-many <path1> [path2] ... --names name1,name2
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
hashpilot replace-hash <file> <old-hash> <new-content> [--range start:end] [--dry-run]
```

- `<new-content>` can be `@filepath` to read from a file
- `--range` is 1-indexed, inclusive start and exclusive end
- Provenance options: `--actor`, `--task-id`, `--reason`

**Stale-anchor recovery (relocation only).** If the anchor hash no longer matches
the requested range, the tool tries to *relocate* the anchor: it slides a window
the same height as the range over the file and looks for content whose hash
equals `<old-hash>`.

- Exactly one match → the edit applies there. `stale: true`, `retries: 1`, and
  `relocatedTo: {start, end}` reports where it landed.
- More than one match → `AMBIGUOUS_ANCHOR`. The file is not touched.
- No match → `STALE_ANCHOR`. The file is not touched.

**Breaking change:** recovery no longer applies to a whole-file anchor (no
`--range`). Previously a mismatch there caused `<new-content>` to replace the
entire file, silently discarding whatever changed since the read. That path now
fails with `STALE_ANCHOR` — re-read the file and retry with the fresh hash.

Recovery can be disabled with `--no-recovery` (or `recovery: "off"` in the API),
which turns any mismatch into an immediate `STALE_ANCHOR`.

**Range validation:** `--range` bounds must be integers, `1 <= start <= end`, and
`end` no greater than the file's last line. Anything else is `INVALID_ARGUMENT`
with no write attempted.

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

**Output (relocated):**
```json
{
  "path": "/abs/path/file.ts",
  "success": true,
  "oldHash": "abc123def456",
  "newHash": "789ghi012jkl",
  "linesChanged": 3,
  "stale": true,
  "retries": 1,
  "relocatedTo": { "start": 12, "end": 17 },
  "message": "Replaced 5 lines with 3 lines (anchor relocated to 12-17)",
  "diff": "- 12 | old line\n+ 12 | new line\n  13 | unchanged"
}
```

**Output (anchor could not be relocated):**
```json
{
  "path": "/abs/path/file.ts",
  "success": false,
  "stale": true,
  "retries": 0,
  "errorCode": "STALE_ANCHOR",
  "message": "Anchor abc123def456 no longer matches and could not be relocated. Re-read the file and retry."
}
```

An agent seeing `STALE_ANCHOR` or `AMBIGUOUS_ANCHOR` (exit code `3`) should
re-read the file and retry rather than give up.

---

### ast capabilities

Show all supported AST languages, operations per language, and known limitations.

**Invocation:**
```
hashpilot ast capabilities
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
hashpilot ast find-symbols <file>
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
    "endCol": 1,
    "startLine": 1,
    "endLine": 3,
    "startColumn": 1,
    "endColumn": 2
  }
]
```

**Line and column indexing.** Two conventions are reported side by side:

| Fields | Base | Use |
|--------|------|-----|
| `startLine`, `endLine`, `startColumn`, `endColumn` | 1-indexed | **Prefer these.** They match the `range` accepted by the hash tier, the `line` argument to `read-hash`, and editor jump-to-line. |
| `startRow`, `endRow`, `startCol`, `endCol` | 0-indexed | Raw tree-sitter coordinates. Retained for backward compatibility. |

Passing a `startRow` where a `range` is expected targets the line **above** the
symbol. That is not always an error: if the neighbouring line's content hash
happens to match the anchor you supply, the edit applies silently to the wrong
line (#99).

---

### ast rename-symbol

Rename all references to a symbol.

**Invocation:**
```
hashpilot ast rename-symbol <file> <old-name> <new-name> [--dry-run] [--actor <name>] [--task-id <id>] [--reason <text>]
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
hashpilot ast replace-body <file> <symbol-name> <new-body> [--dry-run] [--actor <name>] [--task-id <id>] [--reason <text>]
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
hashpilot ast add-import <file> <import-spec> [--dry-run] [--actor <name>] [--task-id <id>] [--reason <text>]
```

`<import-spec>` examples: `'{ Foo } from ./bar'`, `'* as React from react'`

---

### ast remove-import

Remove an import line.

**Invocation:**
```
hashpilot ast remove-import <file> <import-spec> [--dry-run] [--actor <name>] [--task-id <id>] [--reason <text>]
```

---

### ast insert-before / insert-after

Insert content before or after a named symbol.

**Invocation:**
```
hashpilot ast insert-before <file> <symbol-name> <content> [--dry-run] [--actor <name>] [--task-id <id>] [--reason <text>]
hashpilot ast insert-after <file> <symbol-name> <content> [--dry-run] [--actor <name>] [--task-id <id>] [--reason <text>]
```

---

### diff generate

Generate a unified diff between old and new content.

**Invocation:**
```
hashpilot diff generate <file> <old-content> <new-content> [-c <context-lines>]
```

`<old-content>` and `<new-content>` can be `@filepath` to read from files.

**Output:** Unified diff text (not JSON). Prints `"(no changes)"` if inputs are identical.

---

### diff apply

Apply a unified diff patch to a file.

**Invocation:**
```
hashpilot diff apply <file> [--patch <file>] [--dry-run] [-f <fuzzy>] [--actor <name>] [--task-id <id>] [--reason <text>]
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
hashpilot verify-changes <file1> [file2] ... [--formatter <cmd>] [--linter <cmd>] [--typecheck <cmd>] [--test-filter <pattern>] [--test-runner <runner>] [--auto-detect] [--no-scope-tests] [--revert-on-failure] [--timeout <ms>] [--use-baseline] [--record-baseline] [--formatter-args ...] [--linter-args ...] [--test-args ...]
```

**Options:**
- `--formatter <cmd>` — formatter command (e.g. `prettier --write`)
- `--linter <cmd>` — linter command (e.g. `eslint`, `biome lint`)
- `--typecheck <cmd>` — type checker command (e.g. `tsc --noEmit`)
- `--test-filter <pattern>` — filter tests by name pattern
- `--test-runner <runner>` — explicit test runner (`bun test`, `vitest`, `jest`, `pytest`, `go test`, `cargo test`)
- `--auto-detect` — auto-detect tools from `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`
- `--no-scope-tests` — run the whole test suite instead of only the tests related to the changed files (default: scoped to the changed files)
- `--revert-on-failure` — restore originals if any check *fails* (a timeout never triggers a revert)
- `--timeout <ms>` — per-check timeout (default 30000)
- `--use-baseline` — subtract a pre-edit baseline so only tests this edit *newly* broke count; requires an earlier `--record-baseline` at the same commit
- `--record-baseline` — record which tests currently fail and return **without running verification** — run it *before* editing so `--use-baseline` can later subtract pre-existing failures

**Output:**
```json
{
  "files": ["/abs/path/file.ts"],
  "formatter": { "passed": true, "output": "..." },
  "linter": { "passed": true, "output": "..." },
  "tests": { "passed": true, "output": "...", "timedOut": false, "truncated": false },
  "typecheck": { "passed": true, "output": "..." },
  "overall": "pass",
  "testScope": { "cmd": "bun test", "args": ["/abs/path/file.test.ts"], "scoped": true, "reason": "bun test restricted to 1 related test file(s)" },
  "baseline": { "source": "cache", "comparable": true, "preExisting": [], "newFailures": [], "reason": "all failures were already failing at \u2026" },
  "elapsed_ms": 120,
  "fileHashes": { "/abs/path/file.ts": "abc123def456" },
  "detected": { "formatter": "prettier --write", "testRunner": "vitest" },
  "revertedFiles": ["/abs/path/file.ts"]
}
```

`overall` is `"pass"`, `"fail"`, or `"timeout"`. `"timeout"` means a check
hit its `--timeout` without reaching a verdict; it is *not* a
failure and never triggers `--revert-on-failure` — a slow suite must
not destroy correct work.

Per-run fields: `timedOut` (which checks timed out, present only
when `overall` is `"timeout"`), `errorCode` (`VERIFY_TIMEOUT` on a
timeout, `VERIFY_FAILED` on a real failure, `undefined` on a pass
— both failures map to exit code `4`), `testScope` (how the test run
was scoped; `scoped: false` means the whole suite ran and why), and
`baseline` (the `--use-baseline` comparison: `comparable: false` means
no usable baseline existed, so every failure counts; `newFailures`
is the list that flips the verdict). Each tool object may also carry
`timedOut` and `truncated` (captured output hit the 256 KB cap). When
`--revert-on-failure` is set, `revertedFiles` lists files restored to
their original state; it is absent on a pass and on a timeout.

**`--record-baseline` output** (a different shape — no checks are run):
```json
{
  "recorded": true,
  "reason": "recorded 1 pre-existing failure(s) at a1b2c3d4",
  "commit": "a1b2c3d4...",
  "runner": "bun test",
  "failures": ["hp_preexisting"],
  "cached": false
}
```

`recorded: false` with `cached: true` means a baseline already exists for
this commit + runner + test scope and was left alone. `recorded: false`
without `cached` means no baseline could be taken — no git repo, no test
runner, or the baseline run itself timed out. A timed-out baseline is
never written: it would record "nothing was failing" and then mark every
real pre-existing failure as new. `failures: null` means the runner's
output could not be parsed into test names, which makes later
comparisons `comparable: false` rather than wrong.

---

### route-edit

Auto-routed structured edit through AST → Hash → Diff pipeline. One command dispatches to the best available route.

**Invocation:**
```
hashpilot route-edit <file> <operation> [options...]
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
hashpilot batch <operation> <files...> [options...]
```

Accepts the same options as `route-edit`, plus `--serial` for sequential execution.

**Output:**
```json
{
  "results": [ ... ],
  "summary": {
    "total": 5,
    "succeeded": 3,
    "failed": 1,
    "conflicts": 1,
    "elapsed_ms": 1234
  }
}
```

`conflicts` counts files that failed with a stale-anchor or lock conflict — a
concurrent writer landed, so the edit is **retryable after re-reading the file**.
These are counted separately and are *not* included in `failed`, which covers
non-retryable errors. `total == succeeded + failed + conflicts`. Top-level
`success` is true only when both `failed` and `conflicts` are zero, so an adapter
that only checks `failed` will report success on a batch that partly conflicted.

When the batch cannot acquire the advisory locks for its files up front, every
entry in `results` is reported with `"route": null`, `"routeReason": "lock
timeout"`, and `errorCode: "LOCK_TIMEOUT"` — no route was ever chosen, so there
is no route name to report. These entries carry `"stale": true` and count toward
`conflicts`, not `failed`. `route` is a string on every other path; an adapter
that indexes route names must tolerate `null` here.

---

### intent

Execute an editing intent — one command, full blast radius. Parses a structured intent, discovers symbol definitions and references, generates an edit plan, and executes it.

**Invocation:**
```
hashpilot intent '<json>' [--project-root <dir>] [--dry-run] [--yes] [--no-verify] [--no-revert] [--timeout <ms>] [--actor <name>] [--task-id <id>] [--reason <text>] [--context <text>]
```

**Intent format (JSON):**
```json
{"operation":"add-parameter","symbol":"myFunction","param":{"name":"x","type":"string","default":"\"hello\""}}
```

**Supported operations:** `add-parameter`, `rename-exported-symbol`

`remove-parameter` is **not implemented** and is rejected with
`UNSUPPORTED_OPERATION` (exit code `1`). It was previously accepted but produced
a plan whose call-site steps searched for a literal `/* TODO: remove arg */`
string that never matches. Remove a parameter with `ast replace-body` on the
signature plus `diff apply` at each call site.

**Output:**
```json
{
  "success": true,
  "plan": { "intent": {...}, "definition": {...}, "impactSummary": "...", "unresolved": [], "reconciliation": { "resolved": 3, "unresolved": 0, "ambiguous": 0 } },
  "execution": { "steps": [...], "summary": {...}, "verification": {...} }
}
```

**Rollback outcome (`execution.reverted`, `execution.unrevertedFiles`)**

A plan is rolled back when any step fails **or** verification fails. Two fields
report how that went, and an agent must read both:

| Fields | Meaning | What to do |
|--------|---------|------------|
| `reverted: false`, no `unrevertedFiles` | No rollback was needed or requested | Nothing |
| `reverted: true` | Every impacted file was restored to its pre-plan content | Safe to retry the plan |
| `reverted: false` + `unrevertedFiles: [...]` | **The rollback itself failed.** The listed files still hold edits that were supposed to be undone | **Stop.** Restore those files before any retry. Exit code is `5` with `errorCode: ROLLBACK_INCOMPLETE` |

`reverted: true` is never reported over a partial restore — if even one file
could not be written back it appears in `unrevertedFiles` and `reverted` is
`false`.

**Why the rollback happened (`execution.revertReason`).**
When `reverted: true`, a new field says *why* — one of:

| `revertReason` | Meaning |
|----------------|---------|
| `"verification-failed"` | Every step applied, but a check reported `overall: "fail"` |
| `"step-failed"` | An edit could not be applied, so a step failed |

It is **absent whenever nothing was reverted** (`reverted: false`). This is the
core of [#10](../../issues/10) (B13): the result used to say *that* a plan was
reverted but not *why*, so an agent could not distinguish a red verification
(fix the failing check and retry) from a broken plan (a step could not apply). A
verification **timeout** is its own verdict — `overall: "timeout"`, exit `4`,
`errorCode: VERIFY_TIMEOUT` — and **never reverts the edit, so it yields no
`revertReason`**.

**Verification is skipped when a step fails.** The tree is half-applied at that
point, so a suite run over it would report failures caused by the incomplete
edit rather than by the change itself. `verification` is then absent and the
exit code is `2` (edit failed), not `4`.

**Partial plans (`plan.unresolved`)**

The planner never invents source text. When part of an intent cannot be
computed — `add-parameter` with no `param.default`, so there is no argument to
pass at the call sites — it reports the gap instead of writing a placeholder
comment into your files ([#16](../../issues/16)):

```json
{
  "file": "/abs/path/app.py",
  "operation": "insert-call-arg",
  "reason": "no default given for 'flag', so the argument to pass at each call site cannot be computed",
  "resolution": "Re-run with \"param\": {\"name\": \"flag\", \"default\": \"<value>\"}, or edit the call sites in app.py yourself with `diff apply`."
}
```

A plan with a non-empty `unresolved` is **refused rather than half-applied**:
`error.code` is `UNSUPPORTED_OPERATION`, exit code `1`, and nothing is written.
Supply `param.default` (the fix in almost every case) or pass `--yes` to apply
only the steps that could be computed — the unresolved call sites stay
untouched and are still listed in `plan.unresolved`.

**Reference reconciliation (#15)**

Reference discovery was upgraded from regex `grep -w` + heuristic `isDefinitionLine` to per-language tree-sitter queries. The `plan` object now carries an optional `reconciliation` field that reports *what* reference discovery could and could not see:

```json
"reconciliation": { "resolved": 3, "unresolved": 1, "ambiguous": 0 }
```

| Field | Meaning |
|-------|---------|
| `resolved` | Count of genuine call/reference sites found in files HashPilot parses |
| `unresolved` | Count of files that mention the target symbol but are in a language HashPilot does **not** parse (e.g. `*.rb`). Each contributes one entry to `plan.unresolved` |
| `ambiguous` | Count of files that both reference and *bind* the target name more than once — HashPilot cannot tell which module's symbol. Each contributes one entry to `plan.unresolved` |

When `unresolved` or `ambiguous` > 0 the plan is **refused** via the same `plan.unresolved` guard as partial plans. Pass `--yes` to proceed with only the resolved references; the unparSED/ambiguous files are listed but not touched. `reconciliation` is absent when `generatePlan` is called without it.

---

### provenance query

Show edit history for a file — like `git blame` for agent edits.

**Invocation:**
```
hashpilot provenance query <file> [<line-number>] [--human] [--fuzzy] [--limit <n>]
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
hashpilot provenance changeset <changeSetId> [--human]
```

---

### telemetry

View or manage telemetry.

**Invocation:**
```
hashpilot telemetry show [-n <limit>]
hashpilot telemetry summary
hashpilot telemetry health [-w <days>] [--trend]
hashpilot telemetry sessions
hashpilot telemetry export [--from <date>] [--to <date>] [--session <id>]
hashpilot telemetry prune [--older-than <days>]
hashpilot telemetry clear
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
hashpilot route <file> <operation> [--policy <json>] [--no-default-config]
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
hashpilot config [--config <path>]
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
hashpilot doctor            # human-readable summary (default)
hashpilot doctor --json     # machine-readable JSON envelope
```

**Output (JSON, with `--json`):**
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

**Exit code:** always `0`. `doctor` reports installation state — read `healthy` and the per-check `status` values from the JSON (or the human summary) rather than the exit code. A non-healthy report still exits 0 so a doctor run never fails a build for reporting an incomplete install.

A standalone version is also available: `scripts/doctor.sh` (works without CLI on PATH).

---

### upgrade

Upgrade HashPilot to the latest version from GitHub. Downloads and runs `scripts/install.sh` from the specified release channel.

**Invocation:**
```
hashpilot upgrade [--channel <channel>] [--target <dir>] [--keep-telemetry] [--force] [--dry-run]
```

| Flag | Meaning |
|------|---------|
| `--channel <channel>` | Release channel (default: `main`) |
| `--target <dir>` | Install target directory (default: `~/.agentic-tools`) |
| `--keep-telemetry` | Preserve existing telemetry on upgrade |
| `--force` | Skip confirmation prompt |
| `--dry-run` | Show what would be done without executing |

**Exit code:** `0` on success, `70` on failure.

### uninstall

Remove HashPilot and all its components from the system. Downloads and runs `scripts/uninstall.sh`.

**Invocation:**
```
hashpilot uninstall [--keep-config] [--force] [--dry-run] [--target <dir>]
```

| Flag | Meaning |
|------|---------|
| `--keep-config` | Preserve config and telemetry data |
| `--force` | Skip confirmation prompt (auto-detected when piped) |
| `--dry-run` | Show what would be removed without deleting anything |
| `--target <dir>` | Install target directory (default: `~/.agentic-tools`) |

**Output (dry-run):** JSON object with `components` array listing what would be removed (or preserved with `--keep-config`).

**Exit code:** `0` on success, `70` on failure.


### telemetry

View or manage telemetry.

**Invocation:**
```
hashpilot telemetry show [-n <limit>]
hashpilot telemetry summary
hashpilot telemetry clear
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
hashpilot telemetry health [-w <days>] [--trend]
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
- `errorCode` — a stable machine-readable code (see below)
- `stale: true` on hash mismatch; `relocatedTo` when the anchor was relocated
- `message` with human-readable description

**Error codes:** `PARSE_ERROR`, `SYMBOL_NOT_FOUND`, `STALE_ANCHOR`,
`AMBIGUOUS_ANCHOR`, `AMBIGUOUS_SYMBOL`, `HASH_MISMATCH`, `INVALID_ARGUMENT`,
`PATH_DENIED`,
`UNSUPPORTED_OPERATION`, `FILE_NOT_FOUND`, `READ_FAILED`, `WRITE_FAILED`,
`VERIFY_FAILED`, `VERIFY_TIMEOUT`.

`AMBIGUOUS_SYMBOL` is returned by `ast rename-symbol` when the target name
binds more than one symbol in the file — a shadowed local, a foreign
`import`, or a duplicate top-level declaration (it maps to exit code `2`,
the `SYMBOL_NOT_FOUND` edit-failure band). The file is **not** touched. The
error `message` lists the contending binding sites, each as `line <N> (kind)`
where `kind` is the declaration type (`variable_declarator`,
`function_declaration`, `function_definition`, `class_declaration`,
`type_alias_declaration`, `interface_declaration`, `enum_declaration`,
`import`, or `parameter`). `rename-symbol` is file-scoped and binding-aware
by design: it renames a symbol and its references within the target file only,
and refuses a file-wide rename that would clobber an unintended binding.
Disambiguate by scoping the rename to the intended binding, or rename each
declaration separately.

`READ_FAILED` means the file exists but could not be read (permissions, a
directory in its place, a device error) — distinct from `FILE_NOT_FOUND`.
Telemetry queries raise it rather than reporting a broken log as an empty one.

## Exit Codes

Branch on the exit code, not on stderr text.

| Code | Meaning | What an agent should do |
|------|---------|-------------------------|
| `0` | Success | Continue |
| `1` | Usage error — bad arguments, denied path, unsupported operation | Fix the invocation; do not retry as-is |
| `2` | Edit failed — the operation ran but could not be applied | Try another route or report |
| `3` | Stale anchor / precondition failed | **Retryable:** re-read the file and reissue with the fresh hash |
| `4` | Verification failed **or timed out** — the edit applied but the suite did not pass, or hit its `--timeout` (`overall:`"timeout"`, `errorCode:`VERIFY_TIMEOUT`) | Inspect the verify output. A *timeout* is not a failure: do not retry it and it never reverts the edit. A real failure *may* have been reverted |
| `5` | I/O error — file not found, unreadable, or write failed. Also an **incomplete rollback** (`errorCode: ROLLBACK_INCOMPLETE`) | Check the path and permissions. On `ROLLBACK_INCOMPLETE`, **stop and inspect** — read `unrevertedFiles` and restore them before retrying anything |
| `70` | Internal error | Report a bug |

Batch commands return the worst code across all items; an all-success batch
returns `0`.