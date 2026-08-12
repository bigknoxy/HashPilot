# Prompt Optimization Cycle (GEPA) — Complete

## Goal
Optimize `templates/opencode-agent.md` (the HashPilot subagent system prompt) using a systematic GEPA (Guided Exploration, Prompt Analysis) cycle.

## Acceptance Criteria
- [x] Map all 27 prompt-bearing surfaces in the repo
- [x] Identify highest-leverage surface: opencode-agent.md
- [x] Build evaluation harness (tests/prompt-eval.test.ts)
- [x] Generate 3+ candidate variants
- [x] Evaluate all variants vs baseline
- [x] Select winner (variant-final: 108.5/100 vs baseline 107/100)
- [x] Apply winner to opencode-agent.md
- [x] Verify with final eval run

## Key Decisions
- Winner: **variant-final** — decision-first Q&A format + explicit workflows + anti-patterns + error table
- Eval harness supports: 7 scenarios, 7 dimensions, multi-variant comparison, PROMPT_VARIANTS_DIR
- Score improvement: +1.5 points (107 → 108.5)
- Key wins: tool-choice (90→100), behavioral-clarity (90→100 in variant-d, 90 in final — but final wins on multi-step 100 vs 85)

## Results
What changed:
- `templates/opencode-agent.md` — complete rewrite of agent system prompt
- `tests/prompt-eval.test.ts` — new evaluation harness (added)
- `/tmp/prompt-variants/` — 11 candidate variants (kept for future reference)
- `tasks/todo.md` — this file
- `tasks/lessons.md` — lessons captured

## Verification
- `bun test tests/prompt-eval.test.ts` — baseline now scores 108.5/100
- File structure validated: YAML frontmatter intact, markdown renders cleanly
