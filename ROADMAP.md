# HashPilot Roadmap

Single source of truth for what is being worked on and in what order.

- **Source of the backlog:** [`AUDIT-2026-08.md`](AUDIT-2026-08.md) — full repo audit (Aug 2026), 49 scored items. Items B50+ were found later, during review of the sprint work itself.
- **Tracking:** every item is a GitHub issue labeled `audit-2026-08`, with a `P0`–`P3` label and a sprint milestone.
- **Scoring:** `Score = (Impact × 5) + (Evidence × 2) − (Effort × 2)`. The score ranks items *within* a sprint; it is not a tier threshold.
- **Priority tier** reflects sprint assignment, not a score band: **P0**/**P1** = Sprints 1–2 (safety, then engine correctness) · **P2** = Sprints 3–4 · **P3** = Backlog. A high score does not by itself make an item P0 — sequencing risk does. B7 scores only 48 but ships in Sprint 1 as a one-line companion to B2; B33 scores 48 and waits for Sprint 3 because nothing depends on it.
- **Evidence:** `verified` = reproduced live against the CLI. `reported-unverified` = read at `file:line` by a reviewer, not executed.

Milestones: [Sprint 1 — Stop the Bleeding](../../milestone/1) · [Sprint 2 — Foundations](../../milestone/2) · [Sprint 3 — Parity](../../milestone/3) · [Sprint 4 — Differentiation](../../milestone/4) · [Backlog](../../milestone/5)

---

## Sprint 1 — Stop the Bleeding

Data-loss and silent-failure defects. **Nothing else ships until these land.** Three of these destroy user files today and report `success: true`.

| # | Item | Score | Pri | Evidence | Area | Status |
|---|------|-------|-----|----------|------|--------|
| [#3](../../issues/3) | B1 — Stale anchor overwrites the entire file instead of refusing | 64 | P0 | verified | correctness · data-loss | ✅ done |
| [#6](../../issues/6) | B5 — `--range` with no colon (NaN) silently duplicates the file | 63 | P0 | verified | correctness · data-loss | ✅ done |
| [#5](../../issues/5) | B3 — No write boundary; paths can escape the project root | 62 | P0 | verified | security · data-loss | ✅ done |
| [#4](../../issues/4) | B2 — Every command exits 0, including on failure | 61 | P0 | verified | cli | ✅ done |
| [#8](../../issues/8) | B6 — Telemetry opt-out is a dead switch; logs contain source + secrets | 59 | P0 | verified | security | ✅ done |
| [#10](../../issues/10) | B13 — Verification result is ignored by the rollback decision | 57 | P1 | reported | correctness | ⏭ deferred to Sprint 2 |
| [#9](../../issues/9) | B11 — `remove-parameter` is structurally non-functional but advertised | 56 | P1 | verified | correctness | ✅ done |
| [#11](../../issues/11) | B20 — Version drift 0.1.0 vs v1.5.3; nothing publishes | 51 | P1 | verified | ops | ✅ done |
| [#7](../../issues/7) | B7 — `diff apply` without `--patch` crashes and exits 0 | 48 | P0 | verified | cli | ✅ done |

**Sequencing:** B13 must ship with or after [#24](../../issues/24) (B32, unscoped test runs) — otherwise honoring the verify result turns a silent no-op into an aggressive footgun that reverts good work on an unrelated pre-existing test failure. It is therefore deferred into Sprint 2 alongside #24; the other eight items landed.

## Sprint 2 — Foundations

Correctness of the edit engine itself, plus the output contract everything downstream depends on.

| # | Item | Score | Pri | Evidence | Area |
|---|------|-------|-----|----------|------|
| [#60](../../issues/60) | B53 — `read-hash` emits an 8-char `lineHash` that `replace-hash` rejects as stale ✅ shipped | 61 | P1 | verified | correctness |
| [#55](../../issues/55) | B50 — AST tier is non-functional on any file larger than 32KB ✅ shipped | 60 | P1 | verified | correctness |
| [#13](../../issues/13) | B8 — No `hasError` parse-validity gate; AST edits write garbage ✅ shipped | 59 | P1 | verified | correctness |
| [#12](../../issues/12) | B4 — No atomic writes, no backups, no undo ✅ shipped | 56 | P0 | verified | correctness · data-loss |
| [#16](../../issues/16) | B12 — Plans inject C-style `/* TODO */` comments into Python/Go/Rust ✅ shipped | 52 | P1 | verified | correctness |
| [#18](../../issues/18) | B15 — Uniform JSON envelope with `error.code` and `error.recovery` ✅ shipped | 52 | P1 | verified | cli |
| [#23](../../issues/23) | B31 — `--no-default-config` inverted; `--config` never reaches routing | 51 | P2 | verified | correctness |
| [#17](../../issues/17) | B14 — Rollback is best-effort and reports `reverted: true` regardless | 50 | P1 | reported | correctness |
| [#22](../../issues/22) | B19 — `verify-changes` executes arbitrary target-repo-chosen binaries | 50 | P1 | reported | security |
| [#24](../../issues/24) | B32 — Verification runs the whole unscoped suite and can revert good work | 50 | P2 | reported | correctness |
| [#14](../../issues/14) | B9 — `rename-symbol` has no scope analysis ✅ done (#88) | 49 | P1 | verified | correctness |
| [#19](../../issues/19) | B16 — `--json` permanently on; no human output mode | 49 | P1 | verified | cli |
| [#15](../../issues/15) | B10 — `intent` reference resolution is regex text matching, skips call sites | 47 | P1 | verified | correctness · ✅ done (#91) |
| [#21](../../issues/21) | B18 — Read-modify-write TOCTOU across all tiers | 46 | P1 | reported | correctness · data-loss |
| [#56](../../issues/56) | B51 — Output contract mixes bare arrays and objects ✅ shipped (in B15) | 44 | P2 | verified | cli |
| [#20](../../issues/20) | B17 — Concurrent JSONL writes corrupt telemetry; corruption swallowed | 43 | P1 | reported | correctness |

**Sequencing:** [#60](../../issues/60) (B53) is first — it is a one-line width mismatch that currently makes the read → write round-trip unusable, and the `STALE_ANCHOR` it produces is documented as retryable, so an agent loops on it forever. B15's envelope is the contract for the CLI work in Sprint 3 and for the MCP server ([#25](../../issues/25)); land it before either. Changing output shapes requires updating [`docs/ADAPTER-CONTRACT.md`](docs/ADAPTER-CONTRACT.md) and the affected tests in the same PR. [#56](../../issues/56) (B51) must land *inside* B15 rather than before it, so consumers absorb one breaking output change instead of two. [#55](../../issues/55) (B50) and [#13](../../issues/13) (B8) touch the same tree-sitter call sites — sequence them together.

## Sprint 3 — Parity

Catching up to what competitors already ship: MCP distribution, interactivity, published numbers, and the encoding/diff fidelity the marketing claim rests on.

| # | Item | Score | Pri | Evidence | Area |
|---|------|-------|-----|----------|------|
| [#25](../../issues/25) | B21 — Ship an MCP server generated from a shared operation registry | 53 | P2 | verified | strategy |
| [#28](../../issues/28) | B25 — Git-awareness, blast-radius gate, checkpointing | 50 | P2 | verified | security |
| [#34](../../issues/34) | B33 — CI: single OS, no typecheck, no smoke/installer test, no coverage | 48 | P2 | reported | ops |
| [#30](../../issues/30) | B27 — Encoding fidelity: trailing newline stripped, CRLF destroyed, BOM folded | 47 | P2 | verified | correctness |
| [#33](../../issues/33) | B30 — Fuzzy match window far wider than the `fuzzy` parameter implies | 47 | P2 | reported | correctness |
| [#35](../../issues/35) | B34 — Not installable without Bun; `dist/` is not published | 47 | P2 | verified | ops |
| [#26](../../issues/26) | B22 — Publish benchmark numbers; there are none | 46 | P2 | reported | strategy |
| [#27](../../issues/27) | B24 — Interactive mode as a rendering layer over the existing flags | 46 | P2 | verified | cli |
| [#29](../../issues/29) | B26 — `--yes` and `--dry-run` on destructive operations | 46 | P2 | verified | cli |
| [#31](../../issues/31) | B28 — Property test: `apply(diff(A,B)) === B` | 45 | P2 | reported | testing |
| [#32](../../issues/32) | B29 — Deleted line starting with `--` breaks unified-diff parsing | 42 | P2 | reported | correctness |
| [#59](../../issues/59) | B52 — Telemetry reads report corruption and I/O failure as an empty log ✅ shipped in [#61](../../pull/61) | 38 | P2 | verified | ops |

**Sequencing:** B21's operation registry subsumes [#48](../../issues/48) (B46, `cli.ts` duplication) — do not fix the duplication separately. B34 must be resolved before flipping `npmPublish` in B20's fix.

## Sprint 4 — Differentiation

| # | Item | Score | Pri | Evidence | Area |
|---|------|-------|-----|----------|------|
| [#36](../../issues/36) | B23 — LSP tier above AST for real cross-file reference resolution | 43 | P2 | reported | strategy |

**Sequencing:** this is not new architecture — [`M5_PLAN.md`](M5_PLAN.md) already specifies Layer 2 as "LSP `textDocument/references`, fallback tree-sitter + grep". Only the fallback was built. Do not start until the Sprint 1 safety work has landed; an LSP tier on top of non-atomic, non-bounded writes multiplies blast radius.

## Backlog

| # | Item | Score | Pri | Area |
|---|------|-------|-----|------|
| [#37](../../issues/37) | B35 — Installer hygiene: template injection, unpinned clone, rc clobber, `rsync --delete` | 45 | P3 | security |
| [#44](../../issues/44) | B42 — Shell completions, help examples, `intent --schema`, `explain` | 44 | P3 | cli |
| [#38](../../issues/38) | B36 — `insert-before/after` can splice a statement into a parameter list | 42 | P3 | correctness |
| [#41](../../issues/41) | B39 — Unnormalized path comparison; provenance silently returns no results | 42 | P3 | correctness |
| [#42](../../issues/42) | B40 — Pin tree-sitter deps, add Dependabot and vulnerability scanning | 42 | P3 | security |
| [#48](../../issues/48) | B46 — Deduplicate `cli.ts` (9× provenance flags, 2× edit flags, 2× `resolveContent`) | 41 | P3 | cli |
| [#40](../../issues/40) | B38 — Empty-string `newContent` unroutable; hash-tier deletion impossible | 39 | P3 | correctness |
| [#46](../../issues/46) | B44 — `doctor` inverts stdout/stderr and always exits 0 | 39 | P3 | cli |
| [#49](../../issues/49) | B47 — `gh-pages` publishes the entire repository | 39 | P3 | ops |
| [#57](../../issues/57) | B52 — `grep-many` args are positional but read as flags; Commander errors escape the JSON envelope | 38 | P3 | cli |
| [#39](../../issues/39) | B37 — Symbol search silently truncates at depth 10 | 37 | P3 | correctness |
| [#45](../../issues/45) | B43 — Publish a config JSON Schema; add `config validate` and `init` | 37 | P3 | cli |
| [#50](../../issues/50) | B48 — Telemetry retention never enforced; backup to a fixed `/tmp` path | 37 | P3 | ops · security |
| [#43](../../issues/43) | B41 — `intent` parses every repo file twice, serially, per invocation | 36 | P3 | performance |
| [#47](../../issues/47) | B45 — Add `--quiet`/`--verbose`/`--no-color`; respect `NO_COLOR` | 36 | P3 | cli |
| [#51](../../issues/51) | B49 — Long tail: seven small correctness and hygiene defects | 30 | P3 | correctness |

---

## Existing work already in the repo

These predate the audit. They are not GitHub issues; they are planning documents kept here so the audit backlog doesn't get sequenced as if the repo were greenfield.

| Doc | Status | Relationship to the backlog |
|-----|--------|-----------------------------|
../../issues/15) fixes the fallback in the meantime; [#9](../../issues/9) and [#16](../../issues/16) are defects in what shipped. |
| [`M6_AUTOPLAN_REVIEW.md`](M6_AUTOPLAN_REVIEW.md) | Shipped — `provenance.ts` | Review concluded provenance is a telemetry evolution with no new infrastructure. The audit found the shared pipeline is the weak point: [#20](../../issues/20) (concurrent JSONL corruption via unbounded provenance diffs), [#8](../../issues/8) (unredacted source in logs), [#41](../../issues/41) (path normalization), [#50](../../issues/50) (retention). |
| [`docs/ADAPTER-CONTRACT.md`](docs/ADAPTER-CONTRACT.md) | Current | The frozen output contract. [#18](../../issues/18) rewrites it; any PR changing an output shape updates it in the same commit. |

## Working agreement

- One issue per PR unless the issues are explicitly sequenced together (B13 + B32).
- Conventional Commits — the prefix drives semantic-release.
- Every issue body is self-contained: reproduction, required behavior, acceptance criteria, tests. You should not need to read the audit to do the work.
- Close issues via `Closes #N` in the PR body so the milestone burns down.
