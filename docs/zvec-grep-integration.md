# zg (zvec-grep) × HashPilot Integration

Status: **proven prototype** (Option 3: docs-only integration). HashPilot does not
depend on zg. zg is an optional, separately-installed search layer; HashPilot edits.

## What zg is / is not

- **zg answers "WHERE is the code?"** — semantic (plain-language), BM25, and ripgrep
  behind one local-first index. Repo: `zvec-ai/zvec-grep`, Apache 2.0, npm `@zvec/zvec-grep`,
  Node 22+. Default embedder `local/potion-code-16m-v2` is a static Model2Vec — no GPU.
- **HashPilot answers "HOW do I change it safely once found?"** — hash-anchored, AST-aware,
  provenance-tracked edits.
- **They do not overlap except at one point:** HashPilot's `grep-many`/`symbol-lookup-many`
  (exact/token lookup) ≈ zg's `--rg`/index path. zg's *semantic* route is the capability
  HashPilot genuinely lacks. Neither replaces the other — zg does zero editing, HashPilot
  does zero semantic search.

## The recommended pipeline (search → edit)

```
zg query "<plain language>"      →  file + line span       (the NEIGHBORHOOD)
hashpilot read-hash <file> <line> →  SHA-256 anchor         (the precision anchor)
hashpilot replace-hash <file> <hash> <new> --range N:N      (the guaranteed edit)
```

zg locates *which file & which broader region*; HashPilot needs a *single precise line* to
anchor an edit. Feed zg's span, pick the anchor line, let HashPilot guarantee the edit.

## HashPilot anchor semantics (read before scripting edits)

`replace-hash <file> <oldHash> <newContent> --range N:M` verifies against **the hash of
exactly lines N..M joined by "\n"** (`content.split("\n").slice(N-1,M).join("\n")`,
`src/core/hash-edit.ts`). Getting the anchor wrong ⇒ every edit is `HASH_MISMATCH`.

- `read-hash <file> <line>` returns two anchors, keyed `lineHash` and `contextHash`:
  - `lineHash` = hash of that one line → pair with `--range N:N`
  - `contextHash` = hash of the 7-line window (3 before + line + 3 after) → pair with a
    `--range` covering that same window. Widening/capping the range makes it no longer match.
  - There is no generic `hash` key. Multi-line edits: compute the joined-lines hash yourself.
- **Stale edits are refused, never guessed past:** mismatch → `STALE_ANCHOR` (zero window
  matches) or `AMBIGUOUS_ANCHOR` (two matches). Default recovery `relocate` only re-anchors
  when exactly one same-width window matches.
- On success `newHash` is the hash of the just-written *range* (not the file) so it chains
  directly into the next edit of the same region.
- **Scripting gotcha:** on failure hashpilot exits **status 3 but still writes JSON to
  stdout**. In `execSync` a throw ≠ the failure signal — check `e.status`, parse `e.stdout`.

## zg CLI facts observed

- **No `--json` output mode** (removed). Default is agent-markdown; parse
  `matchedBy=… (\S+):(\d+)-(\d+)`. Production JSON lives on zg's MCP server
  (`http://127.0.0.1:7999/mcp`, Streamable HTTP).
- **Default embedding ranks docs over source on code queries.** `zg query "router chooses
  edit strategy"` surfaced `*.md` before `src/core/router.ts`. Bias to source with
  `-g '*.ts'` / a language glob (`zg query "…" -g '*.ts'`).
- **Freshness is state-aware:** results report `fresh` or `possibly_stale`, and zg detects
  a HashPilot write — the edit flips the index to `possibly_stale`. Good cross-tool sensing;
  re-run same query to confirm current state.
- Index of ~140 files / ~1300 entities builds in ~14s incl. model download.
  Workspace index lives `<root>/.zvec-grep/`; runtime/model state lives in `ZVEC_GREP_HOME`.

## Working pipeline (proven end-to-end, 2026-09-03)

```
zg query "where the router decides which edit strategy" -g '*.ts'
  → src/core/router.ts:108-423
hashpilot read-hash src/core/router.ts 58
  → lineHash 940e4dd9ce34 "// 1. Check policy overrides first"
hashpilot replace-hash src/core/router.ts 940e4dd9ce34 \
    "  // 1. Check policy overrides first [zg→hashpilot pipeline live]" --range 58:58
  → ok=true success=true stale=false  (Replaced 1 lines, range 58-58)
re-run zg query → possibly_stale   (zg notices the edit)
```

Re-applying the now-stale hash was refused (`STALE_ANCHOR`, file untouched) — the anchor
guarantees the edit lands where pointed, or not at all.

## Adoption decision (kept deliberately out of HashPilot)

Three coupling tiers were considered and documented:
1. **Hard npm dependency** (`@zvec/zvec-grep` in package.json) — **rejected.** Drags the
   embedding stack + Node 22+ into a stateless editing primitive; couples release cycles.
2. **Optional adapter** (`hashpilot search <q>` shells to zg, greps fallback) — scoped but
   **not built**. See `docs/PLAN-search-adapter.md` for the falsifier + TDD breakdown.
3. **Docs-only (this file)** — adopted. The search→edit orchestration is *agent* behavior,
   not editing-primitive behavior; it belongs outside the binary.

## Environment for trying it

- zg: Node 22+. `npm i -g @zvec/zvec-grep` or local install. Model downloads on first index.
- HashPilot: Bun 1.2+.
- For a full `/` disk, point `ZVEC_GREP_HOME` (and index the workspace) on a roomy path.