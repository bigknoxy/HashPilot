---
name: backlog
description: Add, close, or re-prioritize a HashPilot backlog item. Keeps the GitHub issue, its labels and milestone, and the ROADMAP.md table consistent with each other. Use whenever a new defect or improvement is found, an issue is completed, or a roadmap row needs to move.
---

# Backlog

Every backlog item lives in two places: a GitHub issue and a row in `ROADMAP.md`.
Editing one and not the other is the failure mode this skill exists to prevent —
it has already produced a duplicated row and an out-of-order table.

`bun run lint:roadmap` is the gate. It is also run in CI (`Docs Verify`) and by
`bun test`. Never hand-verify what the linter checks.

## Conventions

- **Score** = `(Impact × 5) + (Evidence × 2) − (Effort × 2)`, each factor 1–10.
  The score ranks items *within* a table; it is not a tier threshold.
- **Priority** reflects sprint assignment, not the score: `P0`/`P1` → Sprints 1–2,
  `P2` → Sprints 3–4, `P3` → Backlog.
- **Evidence** is `verified` (reproduced live against the CLI) or `reported`
  (read at `file:line`, not executed). Do not write `verified` for something you
  only read.
- **Item** column is `B<n> — <one-line defect statement>`. `B<n>` continues the
  numbering in `AUDIT-2026-08.md`; new post-audit findings keep counting up.
- Every issue carries the `audit-2026-08` label, a `P0`–`P3` label, and a
  milestone. Milestones: `Sprint 1 — Stop the Bleeding`, `Sprint 2 — Foundations`,
  `Sprint 3 — Parity`, `Sprint 4 — Differentiation`, `Backlog`.

## Adding an item

1. Confirm it is not already tracked: `gh issue list --label audit-2026-08 --search "<keywords>" --state all`.
2. Score it. State the Impact/Evidence/Effort numbers you used in the issue body
   so the score can be re-derived later.
3. File the issue. The body must be self-contained — a memoryless agent picks
   these up one at a time and will not read the audit:

   ```
   ## Problem
   <what is wrong, at file:line>

   ## Reproduction
   <exact commands, exact observed output>

   ## Required behavior
   <what it must do instead>

   ## Acceptance criteria
   - [ ] <observable, testable statements>

   ## Tests
   <which test file, which cases>

   Score: <n> (Impact <i> × 5 + Evidence <e> × 2 − Effort <f> × 2) · <P0-P3>
   ```

   ```bash
   gh issue create --title "B<n> — <statement>" \
     --label audit-2026-08 --label P<n> \
     --milestone "<milestone>" --body-file <file>
   ```
4. Insert the row into the matching `ROADMAP.md` table **in descending score
   order**. Column count must match that table's header — the Sprint 1 table has
   an extra `Status` column.
5. Run `bun run lint:roadmap`. Fix what it reports; do not eyeball the ordering.

## Closing an item

Close via `Closes #N` in the PR body so the milestone burns down. For Sprint 1
style tables that carry a `Status` column, also set the row to `✅ done` or
`⏭ deferred to <sprint>`; deferrals must say *why* in the table's **Sequencing**
paragraph.

## Moving an item between sprints

Move the row, do not copy it — `bun run lint:roadmap` will reject a duplicate,
but only after you have already made the mistake. Update the milestone in the
same step:

```bash
gh issue edit <N> --milestone "<new milestone>"
```

If the move changes the sequencing story (something now depends on it, or no
longer does), update the destination table's **Sequencing** paragraph too. That
paragraph is the only place ordering constraints that the score cannot express
are written down.

## Always finish with

```bash
bun run lint:roadmap
```
