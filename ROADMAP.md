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

Data-loss and silent-failure defects. **Nothing else ships until these land.** Three of these destroyed user files and reported `success: true` before Sprint 1 closed them out.

| # | Item | Score | Pri | Evidence | Area | Status |
|---|------|-------|-----|----------|------|--------|
| [#3](../../issues/3) | B1 — Stale anchor overwrites the entire file instead of refusing | 64 | P0 | verified | correctness · data-loss | ✅ done |
| [#6](../../issues/6) | B5 — `--range` with no colon (NaN) silently duplicates the file | 63 | P0 | verified | correctness · data-loss | ✅ done |
| [#5](../../issues/5) | B3 — No write boundary; paths can escape the project root | 62 | P0 | verified | security · data-loss | ✅ done |
| [#4](../../issues/4) | B2 — Every command exits 0, including on failure | 61 | P0 | verified | cli | ✅ done |
| [#8](../../issues/8) | B6 — Telemetry opt-out is a dead switch; logs contain source + secrets | 59 | P0 | verified | security | ✅ done |
| [#10](../../issues/10) | B13 — Verification result is ignored by the rollback decision | 57 | P1 | verified | correctness | ✅ done (#86, #87) |
| [#9](../../issues/9) | B11 — `remove-parameter` is structurally non-functional but advertised | 56 | P1 | verified | correctness | ✅ done |
| [#11](../../issues/11) | B20 — Version drift 0.1.0 vs v1.5.3; nothing publishes | 51 | P1 | verified | ops | ✅ done |
| [#7](../../issues/7) | B7 — `diff apply` without `--patch` crashes and exits 0 | 48 | P0 | verified | cli | ✅ done |

## Sprint 2 — Foundations

Correctness of the edit engine itself, plus the output contract everything downstream depends on.

| # | Item | Score | Pri | Evidence | Area |
|---|------|-------|-----|----------|------|
| [#139](../../issues/139) | B54 — `add-import` emits ESM syntax into CommonJS files, reports success, breaks the file | 62 | P0 | verified | correctness · data-loss · ✅ done (#143) |
| [#60](../../issues/60) | B53 — `read-hash` emits an 8-char `lineHash` that `replace-hash` rejects as stale ✅ shipped | 61 | P1 | verified | correctness |
| [#55](../../issues/55) | B50 — AST tier is non-functional on any file larger than 32KB ✅ shipped | 60 | P1 | verified | correctness |
| [#13](../../issues/13) | B8 — No `hasError` parse-validity gate; AST edits write garbage ✅ shipped | 59 | P1 | verified | correctness |
| [#12](../../issues/12) | B4 — No atomic writes, no backups, no undo ✅ shipped | 56 | P0 | verified | correctness · data-loss |
| [#161](../../issues/161) | B60 — Relative-path module-system detection walks to cwd, misdetects ESM in monorepos | 52 | P1 | verified | correctness |
| [#16](../../issues/16) | B12 — Plans inject C-style `/* TODO */` comments into Python/Go/Rust ✅ shipped | 52 | P1 | verified | correctness |
| [#18](../../issues/18) | B15 — Uniform JSON envelope with `error.code` and `error.recovery` | 52 | P1 | verified | cli · ✅ shipped |
| [#23](../../issues/23) | B31 — `--no-default-config` inverted; `--config` never reaches routing | 51 | P2 | verified | correctness |
| [#17](../../issues/17) | B14 — Rollback is best-effort and reports `reverted: true` regardless | 50 | P1 | verified | correctness · ✅ done |
| [#22](../../issues/22) | B19 — `verify-changes` executes arbitrary target-repo-chosen binaries | 50 | P1 | reported | security · ✅ done |
| [#24](../../issues/24) | B32 — Verification runs the whole unscoped suite and can revert good work | 50 | P2 | verified | correctness · ✅ done (#84) |
| [#14](../../issues/14) | B9 — `rename-symbol` has no scope analysis | 49 | P1 | verified | correctness · ✅ done (#88) |
| [#19](../../issues/19) | B16 — `--json` permanently on; no human output mode | 49 | P1 | verified | cli · ✅ done (#92) |
| [#15](../../issues/15) | B10 — `intent` reference resolution is regex text matching, skips call sites | 47 | P1 | verified | correctness · ✅ done (#91) |
| [#21](../../issues/21) | B18 — Read-modify-write TOCTOU across all tiers | 46 | P1 | reported | correctness · data-loss · ✅ done |
| [#168](../../issues/168) | B67 — Bare cloud-credential Key field names not redacted | 44 | P1 | reported | security |
| [#56](../../issues/56) | B51 — Output contract mixes bare arrays and objects | 44 | P2 | verified | cli · ✅ shipped |
| [#20](../../issues/20) | B17 — Concurrent JSONL writes corrupt telemetry; corruption swallowed | 43 | P1 | reported | correctness · ✅ done |
| [#160](../../issues/160) | B59 — Revert accounting skipped when snapshot pass fails for all files but a later step still writes | 42 | P1 | reported | correctness |

## Sprint 3 — Parity

Catching up to what competitors already ship: MCP distribution, interactivity, published numbers, and the encoding/diff fidelity the marketing claim rests on.

| # | Item | Score | Pri | Evidence | Area |
|---|------|-------|-----|----------|------|
| [#25](../../issues/25) | B21 — Ship an MCP server generated from a shared operation registry | 53 | P2 | verified | strategy |
| [#145](../../issues/145) | B56 — tree-sitter has no linux-arm64 prebuild: install fails, and a missing binding kills every command | 51 | P2 | verified | ops |
| [#28](../../issues/28) | B25 — Git-awareness, blast-radius gate, checkpointing | 50 | P2 | verified | security |
| [#147](../../issues/147) | B57 — Publish via npm OIDC trusted publishing and drop the NPM_TOKEN secret | 49 | P2 | verified | ops · security |
| [#34](../../issues/34) | B33 — CI: single OS, no typecheck, no smoke/installer test, no coverage | 48 | P2 | reported | ops |
| [#30](../../issues/30) | B27 — Encoding fidelity: trailing newline stripped, CRLF destroyed, BOM folded | 47 | P2 | verified | correctness |
| [#33](../../issues/33) | B30 — Fuzzy match window far wider than the `fuzzy` parameter implies | 47 | P2 | reported | correctness |
| [#35](../../issues/35) | B34 — Not installable without Bun; `dist/` is not published | 47 | P2 | verified | ops |
| [#135](../../issues/135) | `locking-multiprocess` test is flaky — the proof of the multi-agent safety claim is unreliable | 47 | P2 | verified | testing |
| [#96](../../issues/96) | B55 — Distribution: publish to npm under a scoped name (`hashpilot` is taken) | 46 | P2 | verified | ops |
| [#26](../../issues/26) | B22 — Publish benchmark numbers; there are none | 46 | P2 | reported | strategy |
| [#27](../../issues/27) | B24 — Interactive mode as a rendering layer over the existing flags | 46 | P2 | verified | cli |
| [#29](../../issues/29) | B26 — `--yes` and `--dry-run` on destructive operations | 46 | P2 | verified | cli |
| [#156](../../issues/156) | Published npm `hashpilot@0.1.0` self-reports as `0.2.0-optimized` at runtime | 46 | P2 | reported | correctness |
| [#31](../../issues/31) | B28 — Property test: `apply(diff(A,B)) === B` | 45 | P2 | reported | testing |
| [#141](../../issues/141) | `verify-changes` reports `overall: pass` when zero checks ran | 45 | P2 | reported | correctness |
| [#81](../../issues/81) | Publish `hashpilot-mcp` on npm as the MCP distribution surface | 43 | P2 | reported | strategy |
| [#32](../../issues/32) | B29 — Deleted line starting with `--` breaks unified-diff parsing | 42 | P2 | reported | correctness |
| [#163](../../issues/163) | B62 — `add-import` dedup uses unanchored substring match, false-refuses distinct Python/Rust imports | 42 | P2 | verified | correctness |
| [#59](../../issues/59) | B52 — Telemetry reads report corruption and I/O failure as an empty log ✅ shipped in [#61](../../pull/61) | 38 | P2 | verified | ops |
| [#170](../../issues/170) | B69 — gh-pages workflow installs/executes unpinned npm package with write-scoped token | 36 | P2 | reported | ops · security |
| [#142](../../issues/142) | bench: coverage gaps that let #139/#140/#141 through | 36 | P2 | reported | testing |
| [#78](../../issues/78) | Adopt competitive positioning & analysis as the tracked strategy artifact | 35 | P2 | reported | strategy |
| [#79](../../issues/79) | Add Codex CLI integration adapter (4th platform) | 32 | P2 | reported | strategy |
| [#164](../../issues/164) | B63 — `find-symbols` (read-only) takes the same exclusive lock as mutating AST operations | 31 | P2 | reported | correctness |
| [#162](../../issues/162) | B61 — Hash-route read failures throw out of `routeEdit` instead of recording a failed result | 29 | P2 | reported | correctness |
| [#171](../../issues/171) | B70 — Workflows use custom GH_TOKEN secret instead of default scoped GITHUB_TOKEN | 29 | P2 | reported | ops · security |
| [#165](../../issues/165) | B64 — Lock reclaim trusts bare PID liveness, vulnerable to PID reuse after a crash | 28 | P2 | reported | correctness |

**Sequencing:** B21's operation registry subsumes [#48](../../issues/48) (B46, `cli.ts` duplication) — do not fix the duplication separately. B55 (#96) flips `npmPublish` and ships the package with today's Bun-shim `bin`; it does **not** wait on B34 (#35), which owes a Bun-free runtime. [#81](../../issues/81) (publishing `hashpilot-mcp`) no longer waits on #25 — #25 shipped as the `hashpilot mcp --stdio` subcommand of the main package, not the standalone `hashpilot-mcp` package #81's acceptance criteria describe. The live blocker for #81 is now [#96](../../issues/96) (scoped npm distribution), per the reconciliation comment already posted on #81. #81 also needs its acceptance criteria rewritten to match what actually shipped (a subcommand, not a separate package) before further MCP-distribution work proceeds.

## Sprint 4 — Differentiation

| # | Item | Score | Pri | Evidence | Area |
|---|------|-------|-----|----------|------|
| [#36](../../issues/36) | B23 — LSP tier above AST for real cross-file reference resolution | 43 | P2 | reported | strategy |

**Sequencing:** this is not new architecture — [`M5_PLAN.md`](M5_PLAN.md) already specifies Layer 2 as "LSP `textDocument/references`, fallback tree-sitter + grep". Only the fallback was built. Sprint 1 is now 100% closed, so the safety-work gate that previously blocked this item is cleared. This needs an explicit re-score/reprioritization decision in the next planning pass rather than staying parked here by default.

## Backlog

| # | Item | Score | Pri | Area |
|---|------|-------|-----|------|
| [#37](../../issues/37) | B35 — Installer hygiene: template injection, unpinned clone, rc clobber, `rsync --delete` | 45 | P3 | security |
| [#44](../../issues/44) | B42 — Shell completions, help examples, `intent --schema`, `explain` | 44 | P3 | cli |
| [#38](../../issues/38) | B36 — `insert-before/after` can splice a statement into a parameter list | 42 | P3 | correctness · ✅ done |
| [#41](../../issues/41) | B39 — Unnormalized path comparison; provenance silently returns no results | 42 | P3 | correctness · ✅ done |
| [#42](../../issues/42) | B40 — Pin tree-sitter deps, add Dependabot and vulnerability scanning | 42 | P3 | security |
| [#48](../../issues/48) | B46 — Deduplicate `cli.ts` (9× provenance flags, 2× edit flags, 2× `resolveContent`) | 41 | P3 | cli · ✅ done |
| [#40](../../issues/40) | B38 — Empty-string `newContent` unroutable; hash-tier deletion impossible | 39 | P3 | correctness · ✅ done |
| [#46](../../issues/46) | B44 — `doctor` inverts stdout/stderr and always exits 0 | 39 | P3 | cli · ✅ done |
| [#49](../../issues/49) | B47 — `gh-pages` publishes the entire repository | 39 | P3 | ops · ✅ done |
| [#157](../../issues/157) | B58 — Install script version banner always shows `vunknown` under curl-pipe install | 38 | P3 | ops · ✅ done (#158) |
| [#57](../../issues/57) | B73 — `grep-many` args are positional but read as flags; Commander errors escape the JSON envelope | 38 | P3 | cli · ✅ done |
| [#39](../../issues/39) | B37 — Symbol search silently truncates at depth 10 | 37 | P3 | correctness · ✅ done |
| [#45](../../issues/45) | B43 — Publish a config JSON Schema; add `config validate` and `init` | 37 | P3 | cli |
| [#50](../../issues/50) | B48 — Telemetry retention never enforced; backup to a fixed `/tmp` path | 37 | P3 | ops · security · ✅ done |
| [#43](../../issues/43) | B41 — `intent` parses every repo file twice, serially, per invocation | 36 | P3 | performance |
| [#47](../../issues/47) | B45 — Add `--quiet`/`--verbose`/`--no-color`; respect `NO_COLOR` | 36 | P3 | cli · ✅ done |
| [#51](../../issues/51) | B49 — Long tail: seven small correctness and hygiene defects | 30 | P3 | correctness · ✅ done |
| [#166](../../issues/166) | B65 — `linesChanged` double-counts appended/removed lines in hash-edit metrics | 29 | P3 | correctness |
| [#133](../../issues/133) | Text renderers for `ast capabilities` and `read-many` emit placeholder output | 27 | P3 | cli |
| [#167](../../issues/167) | B66 — Invalid or unreadable `--config` is silently dropped with no warning | 24 | P3 | correctness |
| [#140](../../issues/140) | `add-import` bare module name yields misleading PARSE_ERROR instead of a usage error | 23 | P3 | cli |
| [#82](../../issues/82) | Competitive watch: Scalpel MCP + agent-editing primitive landscape | 21 | P3 | strategy |
| [#169](../../issues/169) | B68 — `isSensitiveFile` misses common credential files | 19 | P3 | security |
| [#172](../../issues/172) | B71 — peaceiris/actions-gh-pages pinned to floating v3 tag in write-token-holding job | 19 | P3 | ops · security |
| [#80](../../issues/80) | Expand AST language coverage beyond 6 (Java/C/Ruby/Kotlin/Swift) to match Scalpel | 18 | P3 | strategy |
| [#173](../../issues/173) | B72 — No dedicated redaction pattern for bare npm/Stripe-style tokens | 17 | P3 | security |

---

## Existing work already in the repo

These predate the audit. They are not GitHub issues; they are planning documents kept here so the audit backlog doesn't get sequenced as if the repo were greenfield.

| Doc | Status | Relationship to the backlog |
|-----|--------|-----------------------------|
| [`M5_PLAN.md`](M5_PLAN.md) | Partially shipped — `intent.ts` + `plan-executor.ts` exist | Layer 1 (intent parsing) and Layer 3 (plan executor) are built. **Layer 2 (reference discovery) shipped only its fallback tier.** [#36](../../issues/36) finishes the specified design; [#15](../../issues/15) fixes the fallback in the meantime; [#9](../../issues/9) and [#16](../../issues/16) are defects in what shipped. |
| [`M6_AUTOPLAN_REVIEW.md`](M6_AUTOPLAN_REVIEW.md) | Shipped — `provenance.ts` | Review concluded provenance is a telemetry evolution with no new infrastructure. The audit found the shared pipeline is the weak point: [#20](../../issues/20) (concurrent JSONL corruption via unbounded provenance diffs), [#8](../../issues/8) (unredacted source in logs), [#41](../../issues/41) (path normalization), [#50](../../issues/50) (retention). |
| [`docs/ADAPTER-CONTRACT.md`](docs/ADAPTER-CONTRACT.md) | Current | The frozen output contract. [#18](../../issues/18) rewrites it; any PR changing an output shape updates it in the same commit. |

## Working agreement

- One issue per PR unless the issues are explicitly sequenced together (B13 + B32).
- Conventional Commits — the prefix drives semantic-release.
- Every issue body is self-contained: reproduction, required behavior, acceptance criteria, tests. You should not need to read the audit to do the work.
- Close issues via `Closes #N` in the PR body so the milestone burns down.
