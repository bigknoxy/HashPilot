# Decision Records

Each record captures a non-obvious behavior decision: what we chose, why, and what
the alternative was. Decisions are immutable once written — if we reverse one,
write a new record that supersedes it.

Format:

```
## D001: <title>

- **Date:** YYYY-MM-DD
- **PR:** #NNN (or "initial" / "internal")
- **Context:** <what triggered this decision>
- **Decision:** <what we chose>
- **Alternatives considered:** <what we rejected and why>
- **Consequences:** <what this enables / prevents>
```

## D001: engine="off" returns empty results, not grep fallback

- **Date:** 2026-09-04
- **PR:** #197
- **Context:** The `search` command's `--engine off` option originally fell through to the grep engine as a "robust" default. This violates user intent: "off" semantically means disabled.
- **Decision:** `engine="off"` returns `{ engine: "off", hits: [], degraded: false }` without spawning any search process.
- **Alternatives considered:** (1) grep fallback — rejected because it's misleading; users set `off` to skip search entirely (e.g. when piping into another tool). (2) error — rejected because "off" is a valid configuration, not an error condition.
- **Consequences:** Tests must assert empty results for `engine=off`, not "some results." Any code that depends on `search` always returning hits must handle the empty case.

## D002: matchesSource uses basename last-dot for extension matching

- **Date:** 2026-09-04
- **PR:** #197
- **Context:** `matchesSource("foo.ats", ["*.ts"])` was returning `true` because the naive `endsWith(".ts")` matched the `.ts` inside `.ats`. This is wrong: `*.ts` means files whose extension is `.ts`, not files whose name contains `.ts`.
- **Decision:** Extract the basename, find the last `.`, and compare only the suffix after that dot. `path.extname`-equivalent: `basename.slice(lastDotIndex)`.
- **Alternatives considered:** (1) `endsWith()` — rejected: matches `foo.ats` for `*.ts`. (2) regex with word boundary — rejected: overkill, and `foo_bar.ts` has no word boundary before `.ts`. (3) segment-split on `/` then check — equivalent to basename approach but more code.
- **Consequences:** `matchesSource` is exported from `src/core/index.ts`. Any glob pattern that isn't `*.ext` form falls back to `micromatch` (existing behavior).

## D003: search adapter spawns `zg query <q>`, not `zg <q>`

- **Date:** 2026-09-04
- **PR:** #197
- **Context:** The zg CLI treats its first positional argument as a subcommand (`query`, `index`, `info`, etc.). Passing `zg "<query text>"` caused zg to interpret the query as a subcommand and exit with code 1.
- **Decision:** Always pass `["query", query, ...]` as the spawn args to zg.
- **Alternatives considered:** None — this is the documented zg CLI interface.
- **Consequences:** The fake-zg fixture must accept both `zg <q>` and `zg query <q>` for backward compatibility with any test that doesn't go through the adapter.

## D004: runZg returns structured diagnostics, not just exit code

- **Date:** 2026-09-04
- **PR:** #197
- **Context:** When zg failed to spawn (EACCES, not found), the catch block returned `code: null`, which hit the `code !== 0` branch and produced a misleading "zg exited unsuccessfully" error with no actionable detail.
- **Decision:** `runZg` returns a `ZgProcessResult` with separate `timedOut` and `spawnError` fields. The caller checks spawn errors first, then timeouts, then non-zero exits, then parses output.
- **Alternatives considered:** (1) throw on spawn error — rejected: the search command should return a structured error, not crash. (2) single `error` field — rejected: timeout and spawn-failure require different recovery paths.
- **Consequences:** `SEARCH_FAILED` errors now include actionable diagnostics (`spawnError`, `timedOut`, or `stderr`). Exit-1 with no stderr (ripgrep-style "no matches") returns empty hits, not an error.
