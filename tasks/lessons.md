# Lessons Learned

## 2026-06-11: Prompt Optimization Cycle (GEPA)

### Failure Modes

1. **Scorer over-specificity** — Initial tool-choice scorer only matched exact phrase "AST route first." Causes false negatives for valid alternative phrasing like "Prefer AST" or "Use AST when available."
   - **Signal**: Variants that were clearly structurally better scored lower than expected.
   - **Prevention**: Use `findInText()` with lowercase, normalized substring matching. Accept multiple valid phrasings. Test counterexamples.

2. **Variants start from different bases** — When generating variants, the baseline structure strongly influenced variant A/B/C (they inherited baseline's numbered principles and workflow headers). Only variant C broke away with "how to think about editing" framing.
   - **Signal**: Initial variants all scored similarly (baseline ±1 point).
   - **Prevention**: After first round, do a "stretch" round where you force radical format changes (Q&A format, decision trees, anti-patterns). The best variant (D) came from the second round.

3. **Refinement trap** — Trying to merge winner strengths by adding more sections (workflows + examples + anti-patterns) reduced concision and dropped the score.
   - **Signal**: variant-perfect scored lower (107.5) than the simpler variant-final (108.5).
   - **Prevention**: More text ≠ better prompt. When two winners tie, pick the shorter one. Concision is a reliable proxy for prompt quality.

4. **Context inflation** — Keeping 11 variants + full eval output + iterative analysis consumes massive context.
   - **Signal**: Reached compression limits mid-session.
   - **Prevention**: Compress aggressively between rounds. Keep only: winner file, runner-up file, eval harness. Discard early iterations once superseded.

### Process Recommendations

1. **First pass: keyword coverage** — Run baseline against scorer to identify gaps. Fix gaps first, then optimize.
2. **Second pass: format exploration** — Generate 3-4 structurally different variants (not just rewordings).
3. **Third pass (if needed): refinement** — Merge top 2 variants' strengths.
4. **Final: verify on actual file** — Always replace the real file and run eval one more time.
5. **Save variants** — Keep all variants in /tmp/prompt-variants/ for reference during refinement.
