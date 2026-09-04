# PLAN — Optional zg Search Adapter (`hashpilot search`)

Status: **scoped, NOT built.** Decision artifact for `docs/zvec-grep-integration.md` Option 2.
This is what it would take, enumerated as *falsifiers* (tests that invalidate the naive
design) plus a TDD implementation plan. Follow `test-driven-development`.

**Goal:** an optional `hashpilot search` subcommand that uses zg for semantic/lexical search
when available and configured, degrading to the existing `grep-many` otherwise — with zero
change to HashPilot's standalone behavior.

**Boundary rules (from Option 1 rejection):** zg stays an external CLI. No `@zvec/zvec-grep`
npm dependency. Node 22+ is a *documented* optional requirement, never an enforcement.
`grep-many` and the entire editing core are untouched.

---

## Falsifier set (the design is wrong if any of these tests pass)

Each row: the naive assumption → the falsifying test → the design it forces.

- **F1 — "semantic output is strictly better, pass it through."**
  Observed: default Model2Vec ranks `.md` docs over source. *Test:* pointer that the top zg
  hit for a code query is a `.md` file → `search` MUST NOT return docs when
  `sourceGlobs` is set. *Forces:* `sourceGlobs` filter (default `*.ts,*.js,*.py,*.go,*.rs`),
  passed to zg as `-g`.

- **F2 — "zg is always on PATH."**
  *Test:* `ZG_BIN` unset / zg absent → `search` returns grep-many-equivalent results, exit 0,
  telemetry records a `search_degraded` reason. *Forces:* a resolve step + clean degraded
  path with a named exit code, never a crash.

- **F3 — "semantic search works with no index."**
  *Test:* fresh tree, no `.zvec-grep/` → `zg query` fails. `search` MUST surface an
  actionable error ("run `zg index` first", a dedicated errorCode), not an opaque spawn
  failure. *Forces:* index-state detection before querying.

- **F4 — "one output shape across all zg routes."**
  *Test:* parser fed captured hybrid / fts / vector / rg outputs (with header + freshness
  lines) yields the same `{file,startLine,endLine}` regardless of route. *Forces:* a
  route-aware parser, golden-tested on fixture artifacts.

- **F5 — "grep fallback equals grep-many."**
  *Test (parity):* `search "<regex>"` with engine=grep and zg absent produces the
  *byte-identical* JSON body that `grep-many "<regex>"` produces for the same inputs.
  *Forces:* a shared result mapper; no drift between the two search paths.

- **F6 — "config toggle is cosmetic."**
  *Test:* `engine: "off"` with a real zg present → a fake zg records **zero** invocations.
  *Forces:* the policy check runs *before* any spawn; `off` never touches zg.

- **F7 — "search may build convenience indexes."**
  zg's own rule: *an agent must never silently create/rebuild a persistent index.*
  *Test:* running `search` on an unindexed tree must NOT create `.zvec-grep/`.
  *Forces:* query-only; missing index ⇒ error, never build.

- **F8 — "spawn exit 0 ⇒ success."**
  HashPilot's grep lesson (`core/grep.ts:156-180`): code 1 + empty stderr = zero matches,
  nonzero + JSON stdout = real error. *Test:* zg exits 2 with stderr but emits parseable
  markdown → reported as a search *error*, not silently dropped. *Forces:* replicate grep.ts
  `runCommand` semantics.

- **F9 — "results fit GrepResult, just add semantics."**
  zg has no column and emits grouped line spans; forcing it into `{path,line,column,content}`
  is lossy and lies. *Test:* a `SearchResult` must carry `{file,startLine,endLine,heading?,
  scope?}` and NOT claim a `column`. *Forces:* a distinct type; no cross-field duplication
  with `GrepResult`.

---

## Files touched

- **Create** `src/core/search.ts` — the adapter + parser + resolve + fallback (models
  `core/grep.ts:156` `runCommand` and `parseGrepLine`).
- **Create** `src/commands/search.ts` — commander registration mirroring `commands/read.ts`
  (single `search` command: `<query>` positional, `--line`/`--glob`/`--engine` flags).
- **Modify** `src/cli.ts` — `register(searchCommands)`.
- **Modify** `src/core/config.ts` — add to `HashPilotConfig` (`#56-63`):
  ```ts
  search?: {
    engine?: "auto" | "zg" | "grep";   // auto: use zg if resolvable
    sourceGlobs?: string[];            // default ["*.ts","*.js","*.py","*.go","*.rs"]
  };
  ```
  Read from `.hashpilot.json` via `loadConfig` (`config.ts:111`).
- **Modify** `src/core/doctor.ts` — report zg presence in the environment health check.
- **Modify** `src/core/index.ts` — export `search`.
- **Docs gate:** regenerate `docs/CLI-QUICKREF.md` (`bun run gen:cli-quickref`) and add a
  ROADMAP row (`lint:roadmap`). Both are CI-enforced contracts.

---

## TDD implementation (vertical tracer bullets, RED→GREEN each)

A **fake `zg` fixture** (env-injected via `ZG_BIN`) keeps tests hermetic — real subprocess
(no mock), printed canned agent-markdown per query. Same style as `tests/grep.test.ts`
(real subprocess, temp trees, no mocks).

- **TB1 (F2/F4):** `search` resolves fake zg + parses one hybrid query → `SearchResult[]`.
  RED: `tests/search.test.ts` — "search parses zg hybrid hits into file+span".
- **TB2 (F5):** zg absent / `--engine grep` → result JSON byte-identical to `grep-many`.
  RED: parity test against a call of the real `grepMany`.
- **TB3 (F6):** `engine:"off"` never spawns zg (fake zg invocation counter stays 0).
  RED: policy test; GREEN: check-policy-before-spawn.
- **TB4 (F1):** sourceGlobs filters the doc hit out of results.
  RED: seed fake zg with a `.md`-first fixture; expect it dropped under source mode.
- **TB5 (F3/F7):** unindexed tree → actionable error and no `.zvec-grep/` created.
  RED: assert errorCode + `!existsSync(".zvec-grep")`.
- **TB6:** CLI contract — `hashpilot search "<q>"` wires end-to-end; quickref regenerated.
  Uses `tests/cli-contract.test.ts` pattern.

**Spike first (throwaway, delete after):** parse one real `zg query` hybrid/fts/vector/rg
output into a fixture, choose the regex — proves the parser before TDD (allowed: exploration
thrown away, then TDD).

---

## Effort

~2 new files + 4 small edits (config, cli, index, doctor), ~400–550 LOC incl. tests.
~6 TDD bullets, one focused session each. Biggest risk is **agend-markdown parser
brittleness** — mitigated by golden fixtures; the durable fix is zg's MCP JSON endpoint
(swap the parser for an MCP call in a follow-up, keep the same `SearchResult` type).

## Risks / notes
- zg's CLI has **no `--json`** — the whole adapter's stability rests on the agent-markdown
  format. Acceptable for a prototype; MCP path is the production answer.
- Default embedding ranks docs over source — hence `sourceGlobs` is a hard requirement, not
  a nice-to-have (F1).
- zero behavior change to grep-many/editing (boundary rule) is itself a falsifier: the full
  existing suite must stay green.
