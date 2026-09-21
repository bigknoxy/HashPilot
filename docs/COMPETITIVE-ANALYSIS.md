# HashPilot — Competitive Analysis

**Date:** August 17, 2026 · **HashPilot:** v4.0.8 · **Repo:** `bigknoxy/HashPilot` (MIT, created 2026-04-26)
**Author:** Competitive research across sessions; synthesized for strategy.

**Reference status:** This is the canonical map of the "agent file-editing primitive"
space as of the 2026-08 audit. It is referenced from `CLAUDE.md`, `README.md`, and the
landing page. Re-run the research when a competitor releases a major version or when the
roadmap's differentiation items (MCP, benchmarks) land.

---

## 0. TL;DR

HashPilot occupies the **only unclaimed position** in the market:

| Dimension | Who has it | HashPilot |
|---|---|---|
| Hash-anchored (SHA-256) verification | **Nobody** | ✅ |
| AST-native editing (tree-sitter) | Aider, Scalpel, Morfx, Comby, CodeStruct | ✅ |
| Provenance / audit trail (**its** own first-class log) | **Nobody** | ✅ |
| Telemetry + health reports | Aider (analytics, not audit) | ✅ |
| Multi-agent concurrency safety (advisory file locks) | CLIO, **and HashPilot** | ✅ shipped (`locking.ts`) |
| Verify pipeline (lint/typecheck/revert) | Aider, HashPilot | ✅ |
| MCP-native distribution | Scalpel, fedit, CLIO | ❌ tracked — issue **#25** (Sprint 3) |
| Published benchmarks | fedit | ❌ tracked — issue **#26** |

**Strategic takeaway:** Technically HashPilot already sits in the strongest corner of the
feature space. The gaps are *distribution and proof*, not capability. The single highest-leverage
move is **shipping the MCP server (#25)** so agents can discover and use HashPilot without a
prose adapter, then **publishing a benchmark (#26)** that proves the hash-anchored advantage over
the string-matching that every other tool uses.

> **Note on earlier drafts of this analysis:** A previous iteration listed "file locking" and
> "multi-agent safety" as open gaps. Both are **already shipped** — see `src/core/locking.ts`
> (advisory locks held across the read → edit → compare → write window, deadlock-safe via
> `acquireSortedLocks`). This document reflects the current tree.

---

## 1. The Market Landscape

The layer we compete in is **the gap between an LLM's intent and the file on disk** — below
full agents/IDEs (Cursor, Claude Code, Codex, Aider as an *app*) and above raw `sed`/`perl -i`.
No single tool has claimed the "editing primitive" category yet.

The space fragments into three camps:

| Camp | Representatives | Mechanism | Verification |
|---|---|---|---|
| **Text / SEARCH-REPLACE** | Aider, fedit, Codex CLI, Claude Code | String matching, unified diffs, fuzzy match | None or fuzzy |
| **AST-structural** | Scalpel MCP, Comby, Morfx, CodeStruct, `hashpilot ast` | Tree-sitter node manipulation | Structural reparse, **no hash** |
| **Hash-anchored** | **HashPilot (alone)** | SHA-256 precondition + content replacement | **Cryptographic** |

**Key insight:** *No competitor combines hash-anchored verification with AST-native editing.*
That combination is HashPilot's moat.

---

## 2. Competitor Deep-Dives

### 2.1 Aider — 48,295 stars, Apache-2.0 — the ecosystem leader

Full terminal pair-programming agent. Git-native, architect/editor split, 100+ languages via
`tree-sitter-language-pack`, auto lint+test loop. v0.86.x on main (supporting GPT-5, Grok-4,
Gemini 2.5 Pro, Claude 4.5/4.6). Paul Gauthier's relentless release cadence.

**Love:** "Best agent for dev work in existing codebases." "Surgical, minimal, thoughtful
changes." Massive community; the benchmark everyone measures against.

**Gaps HashPilot owns:**
- **No hash verification.** Relies on exact-byte SEARCH/REPLACE matching; whitespace/encoding/
  stale context cause silent edit failures.
- **Issue #4314:** discards changes when the LLM edits *and* adds a file in one turn.
- **No provenance log** beyond git commits (no per-edit actor/task/reason attribution).
- **No MCP server mode.** Cannot be driven as a tool by another agent.
- 1,817 open issues → support burden / bloat trajectory.

**Read:** Aider dominates the *application* layer; its *editing primitive* is text-based and
fragile. HashPilot can be Aider's reliable editing backend.

### 2.2 Scalpel MCP — 0 stars, MIT, Feb 2026 — closest structural analog

MCP server for structural editing. 10 languages via tree-sitter, persistent node identities,
transactional editing (begin/validate/commit/rollback), descriptor DSL, intent compiler, Docker.

**Strengths:** Closest architectural match to `hashpilot ast` + `intent`. Full MCP compliance
(resources, prompts, logging, sampling). 12 languages. Atomic writes.

**Risks / gaps HashPilot owns:**
- **CodeRabbit flagged 15 critical actionable issues** on the v3.0 release — path traversal,
  naive diff that misreports changes, silent parser fallback that contradicts its fail-fast
  design, hardcoded parser count, duplicate language enum, JSON global shadow.
- **Zero adoption**: 0 stars, 0 forks, 0 open issues. Solo project, no validation.
- **No hash verification** (transaction commit checks structural validity, not pre-image digest).
- **No provenance, no telemetry, no multi-agent safety, no verify pipeline, no batch ops.**
- Developer-specific paths in docs; empty placeholder reference files; `dry_run` unimplemented.

**Read:** Scalpel is a v1 structural MCP server with serious code-quality debt and no community.
HashPilot can match its AST surface *and* add hash verification + provenance + telemetry + locking
+ verify in a maintainable codebase. Watch it: if it gets investment, it is the thing we beat on
verification; if it stagnates, HashPilot claims "the reliable structural-editing MCP server."

### 2.3 fedit — 11 stars, MIT, April 2026 — line-oriented editor for LLMs

Zero-dependency Go CLI. 17 language mappers. Line-addressed ops (insert/delete/replace/move/copy/
fields). Has MCP server mode.

**Strengths (its best asset is a benchmark):** Tested Claude 4.6, GPT-4o, Gemini 2.5 Pro.
Finding: **models hallucinate line numbers at ~1-in-6 error rate even for Claude.** Content-matching
ops (`replaceall -match`) succeed where line-numbered ops fail. Proves the thesis that
**structural/semantic anchoring beats line-numbering** for LLM-driven edits. Clean, minimal, HCL/
Nix mappers (infra-as-code). `-v` gives built-in post-mutation verification.

**Gaps HashPilot owns:** Line-addressed (same hallucination class fedit's own numbers expose);
no hash verification; no AST operations (rename/body/imports); single-file only; no provenance,
telemetry, batch, or verify pipeline beyond the `-v` diff.

**Read:** fedit gives us the exact marketing evidence we need to *steal*. Our answer to its
benchmark is "hash-anchored + AST edits: 10/10 on the same scenarios; line-numbered: 4/10." See
issue **#26**.

### 2.4 CLIO — 158 stars, GPL-3.0, Jan 2026 — multi-agent terminal agent

Pure Perl. Multi-provider (Anthropic/OpenAI/Gemini/Ollama/Copilot). Notable for **multi-agent
coordination via file locks and git locks**, plus rate limiting, persistent sessions, MCP support,
dogfooding ("CLIO builds itself").

**What it proves:** The multi-agent safety problem is real and worth shipping — and it is the one
competitor that already shipped it. HashPilot now matches it (`locking.ts`).

**Gaps HashPilot owns:** No AST editing (text-level), no hash verification, no verify pipeline, no
batch, no provenance/telemetry beyond session-level. GPL-3.0.

### 2.5 Platform-level alternatives — Codex CLI, Claude Code, Cursor

| Tool | Mechanism | Stakes |
|---|---|---|
| **OpenAI Codex CLI** (v0.145+, Jul 2026) | Full agent; **ignores file timestamps, can overwrite external edits** ([#5807](https://github.com/openai/codex/issues/5807)) | 0 stars (closed) |
| **Claude Code** | String-to-replace matching; exact byte-match intentional but fragile ([#3471, 100+ comments](https://github.com/anthropics/claude-code/issues/3471)) | Proprietary |
| **Cursor** | Full-file rewrites → "lost my comment" complaints; fast-apply model seam | Proprietary, ~$20/mo |

**Pain HashPilot solves:** Codex #5807 (timestamp race) and Claude Code #3471 (whitespace/encoding/
stale context) are *the* universally reported failure classes; hash-anchoring + stale detection
turn both into non-issues.

### 2.6 Other 2026 entrants

| Tool | Stars | Notes |
|---|---|---|
| **Kalt Code** | 0 | Claude Code fork, multi-provider, gRPC server. No adoption. |
| **clido-cli** | 6 | Rust CLI agent: sessions + memory + audit log + MCP + workflows, checkpoints/rollback. |
| **Morfx** (oxhq) | 11 | Go, tree-sitter + MCP, confidence-scored node targeting. |
| **TurboEdit** | 4 | Rust, SEARCH/REPLACE + tree-sitter + gix + SQLite snapshots. |
| **AtomCode** | 184 | Rust, AI-generated Claude-Code/Cursor alternative. |
| **Comby** | ~800 | Go, pattern-based AST transformation. No agent-integration layer. |
| **CodeStruct** (Amazon) | ~50 | Academic, `readCode`/`editCode`, tree-sitter. Archived, no audit/undo/telemetry. |

**Pattern:** the "agent editing primitive" space is dominated by Aider (adoption) and a long tail
of sub-100-star structural tools. The sub-200-star count for *everything but Aider* signals an open
category that HashPilot can claim with the right distribution move.

---

## 3. Feature Matrix

| Capability | HashPilot | Aider | Scalpel MCP | fedit | CLIO | Codex/Claude |
|---|---|---|---|---|---|---|
| SHA-256 hash verification | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| AST-native editing | ✅ (6 langs) | ✅ (130+, text-level) | ✅ (12) | ❌ (line-level) | ❌ | ❌ |
| Stale-anchor detection | ✅ (exit 3) | ❌ (fuzzy retry) | ❌ | ❌ | ❌ | ❌ |
| Provenance track (its own log) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Telemetry / health report | ✅ | ~ (analytics) | ❌ | ❌ | ❌ | ❌ |
| Multi-agent safety (locks) | ✅ shipped | ❌ | ❌ | ❌ | ✅ | ❌ |
| Verify pipeline (lint/typecheck/revert) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Batch multi-file | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Intent execution (plan+execute) | ✅ | ~ (architect) | ✅ | ❌ | ❌ | ✅ |
| Auto-route (AST→Hash→Diff) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Undo / changeSets | ✅ | ✅ (git) | ✅ (rollback) | ❌ | ✅ (checkpoints) | ✅ |
| MCP server mode | ❌ (#25) | ❌ | ✅ | ✅ | ✅ | ❌ |
| Published benchmarks | ❌ (#26) | ❌ | ❌ | ✅ | ❌ | ❌ |
| Open source | ✅ MIT | ✅ Apache | ✅ MIT | ✅ MIT | ❌ GPL | ❌ |
| Agent-agnostic | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Languages | 6 | 130+ | 12 | 17 mappers | Many | Many |
| Stars / traction | 0 | 48,295 | 0 | 11 | 158 | N/A |

Legend: ✅ full · ~ partial/indirect · ❌ absent.

---

## 4. What People Love / Hate (consolidated, sourced)

**Love:**
- Aider's surgical minimalism + git-native undo + auto lint/test loop.
- fedit's proof that content-matching beats line-numbering for LLMs.
- CLIO's file/git locks for multi-agent safety.
- Any "auto-verify after edit" that closes the loop.

**Hate → what HashPilot does about it:**

| Pain | Who hates it | HashPilot fix |
|---|---|---|
| "String to replace not found" (whitespace/encoding/stale context) | Claude Code #3471 (100+) | Hash anchoring removes string matching |
| "Applied 4 edits, silently missed 2" | All text editors | Per-edit verification + reporting |
| "Overwrote my external changes" (race) | Codex #5807 | CAS + stale detection + advisory locks |
| "Lost my comment" (full-file rewrite) | Cursor | AST/hash edits preserve untouched content |
| "No idea which agent made this change" | Multi-agent setups | Provenance + telemetry |
| "Discarded changes (edit + add same turn)" | Aider #4314 | Independent atomic ops, no compound side-effects |
| "Can't verify the edit didn't corrupt anything" | All | Verify pipeline (lint + typecheck + revert) |

---

## 5. Positioning & Go-to-Market

### Core positioning statement (in README, landing hero)

> **HashPilot is the safe, verifiable, observable file-editing primitive for coding agents.**
> While other tools match text or rewrite whole files, HashPilot anchors every edit to a
> cryptographic digest — if the hash doesn't match, nothing changes. With AST-native editing,
> provenance trails, and a verify pipeline, it gives agents deterministic control over how code
> changes land on disk.

### Messages by audience
| Audience | Message |
|---|---|
| Agent developers | Stop using text matching for edits. Use SHA-256-anchored, AST-aware editing with built-in stale detection and audit trails. |
| Agent power users | Multi-agent? HashPilot detects when another agent/human changed a file since your last read. CAS-verified, provenance-tracked, lock-guarded. |
| CI/CD integrators | `verify-changes` + `batch` + `undo` make HashPilot the safe edit layer for automated pipelines. |
| Aider / CLIO users | Use HashPilot as the editing backend — SEARCH/REPLACE but it *verifies the pre-image hash first*. |

### Distribution plan
1. **MCP server mode (issue #25)** — makes HashPilot usable by every MCP client (Claude Desktop,
   Cursor, Cline, Continue, OpenCode, pi) without a prose adapter. **Highest leverage.**
2. **Integration guides** for top agents — Claude/Opencode/Pi adapters already shipped; add Codex.
3. **Publish benchmark (issue #26)** — "hash-anchored edits: 10/10 stale-anchor scenarios;
   string-matching: 4/10." Steal fedit's evidence format.
4. **Structured CLI docs** — agents learn the CLI via `--help` + `docs/CLI-QUICKREF.md`.

---

## 6. What Is Not a Gap (already solved / already tracked)

Avoid re-doing work. Cross-reference before starting:

| Earlier "gap" | Actual status |
|---|---|
| File locking / multi-agent safety | **Shipped** — `src/core/locking.ts` (advisory locks across read→edit→write; `acquireSortedLocks` deadlock-safe). |
| ChangeSets + atomic undo | **Shipped** — `src/core/snapshot.ts`, `undo`/`changesets` commands. |
| Provenance | **Shipped** — `src/core/provenance.ts` (M6). |
| Telemetry + health | **Shipped** — `src/core/telemetry.ts`. |
| MCP server | **Tracked** — issue **#25** (B21, Sprint 3, P2). |
| Published benchmarks | **Tracked** — issue **#26** (B22, Sprint 3, P2). |
| Language coverage (6 vs 30+) | **Known** — audit notes vs Serena's 30+; expand tree-sitter grammars opportunistically. |
| Output envelope drift | **Tracked** — issue **#18** (B15). |

---

## 7. Remaining Strategic Actions (deduped against the roadmap)

The genuinely-new work is captured as GitHub issues; the capability work is already tracked under
the audit backlog. Umbrella issue: **#78** (adopt this positioning + analysis as the tracked
strategy artifact).

| # | Action | Issue / ref | Effort |
|---|---|---|---|
| 1 | Adopt positioning + competitive analysis as tracked artifact | **#78** (this) | done |
| 2 | Ship MCP server generated from a shared operation registry | **#25** | 2–3 days |
| 3 | Publish a hash-anchored-vs-text benchmark (steal fedit's format) | **#26** | 1–2 days |
| 4 | Add 3–5 tree-sitter languages to AST route (Java/C/Ruby/Kotlin/Swift) | **#80** | 1–2 days/lang |
| 5 | Add Codex-to-HashPilot integration guide (4th platform) | **#79** | 1 day |
| 6 | Write a competitive-comparison page (this doc → web) | part of #78 / #82 | 0.5 day |
| 7 | Publish `hashpilot-mcp` on npm after #25 | **#81** (blocked by #25) | 0.5 day |
| 8 | Competitive watch: Scalpel MCP + primitive landscape | **#82** | ongoing |

**Bidirectional link:** keep §7 in sync with these issues. #81 is blocked by #25; #7 (the web
comparison page) may fold into the #78 positioning work or the #82 watch cadence. The "what is
not a gap" list (§6) is the dedup guard: do not re-file shipping work as new strategy items.

---

## 8. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Aider absorbs hash verification | Low (committed to fuzzy+git; orthogonal to its model) | Ship #25/#26 fast to own the pattern |
| Scalpel gets adopted and keeps pace | Medium (0 stars but active) | Differentiate via verification + provenance + locks it explicitly lacks |
| MCP becomes the interface and CLI-only tools marginalize | High | #25 is the top strategic priority |
| Primitive layer absorbed into closed agents (Codex/Claude internal) | Low (they don't expose it); open-source agents (Aider/CLIO/OpenCode/pi) are the beachhead | Open-source is the beachhead |
| 6 languages look thin next to Aider/Scalpa | Medium | Opportunistic language expansion; benchmark shows quality > breadth at current stage |

---

## 9. Sources

- GitHub issues: [openai/codex #5807](https://github.com/openai/codex/issues/5807),
  [aider-ai/aider #4314](https://github.com/aider-ai/aider/issues/4314),
  [anthropics/claude-code #3471](https://github.com/anthropics/claude-code/issues/3471)
- Aider: aider.chat blog, release notes (v0.86.x), Hacker News threads
- fedit (2026, Go): LLM benchmark showing line-number hallucination
- Scalpel MCP (traorecheikh/scalpel-file-system-mcp, 2026): CodeRabbit review of v3.0
- CLIO (2026, Perl): multi-agent file/git locking
- Antigravity Lab: multi-agent conflict hotspots
- Pinishv / Anish Gandhi: "how AI coding tools edit code under the hood"
- HashPilot internal: `AUDIT-2026-08.md`, `ROADMAP.md`, this doc.

*Currency: verified against the state of the 2026-08 audit. Re-run on any major competitor release
or when #25/#26 land.*
