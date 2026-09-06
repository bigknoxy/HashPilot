/**
 * LineMetrics — blast-radius metrics for line-level edits.
 *
 * Computes how many lines a replace operation touches, WITHOUT double-counting
 * lines that are both appended/removed AND reflected in the size delta.
 *
 * SOLID design:
 * - Single responsibility: this module only measures line deltas. It does not
 *   apply edits, write files, or build diffs.
 * - Open for extension: the comparison predicate is injectable (see
 *   `countChangedBy`), so callers can define their own notion of "changed"
 *   (e.g. ignore whitespace) without editing core.
 * - Idempotent: pure function of its inputs. Same (old, new) → same result.
 * - Dual-format: `compute` returns a structured, agent-parseable object;
 *   `describe` renders the same data as human-readable text. Human text is
 *   generated FROM the structured value, never maintained separately.
 */

/** Structured line-metrics result (agent-parseable shape). */
export interface LineMetrics {
  /** Lines present in new but not old. */
  added: number;
  /** Lines present in old but not new. */
  removed: number;
  /** Lines present in both but different. */
  modified: number;
  /**
   * Total lines touched by the edit. NEVER double-counts: a line is counted
   * exactly once — as added, removed, or modified. Pure append of N lines is
   * `added=N, changed=N` (not `2N`).
   */
  changed: number;
}

/** Predicate defining when a line occupying the same slot is "changed". */
export type LineComparer = (oldLine: string, newLine: string) => boolean;

/**
 * Compute line metrics between two line arrays.
 *
 * The tricky case (fixed here): a line that exists on only one side of the
 * comparison is "added" or "removed", NOT "modified". Naive implementations
 * (e.g. `old[i] ?? "" !== new[i] ?? ""`) count such lines as "modified", so a
 * pure append of N lines reports N added + N modified = 2N. This module counts
 * each line exactly once.
 *
 * Idempotence guarantee: `compute(a, b) === compute(a, b)` for identical
 * inputs — no state, no randomness, no mutation.
 */
export function computeLineMetrics(
  oldLines: string[],
  newLines: string[],
  isChanged: LineComparer = (a, b) => a !== b,
): LineMetrics {
  let added = 0;
  let removed = 0;
  let modified = 0;

  const shared = Math.min(oldLines.length, newLines.length);
  for (let i = 0; i < shared; i++) {
    if (isChanged(oldLines[i], newLines[i])) modified++;
  }
  // Tail beyond the shorter array is purely added or purely removed.
  if (newLines.length > oldLines.length) {
    added = newLines.length - oldLines.length;
  } else if (oldLines.length > newLines.length) {
    removed = oldLines.length - newLines.length;
  }

  return { added, removed, modified, changed: added + removed + modified };
}

/** Human-readable rendering of {@link LineMetrics} (generated from structured). */
export function describeLineMetrics(m: LineMetrics): string {
  const parts: string[] = [];
  if (m.added) parts.push(`${m.added} added`);
  if (m.removed) parts.push(`${m.removed} removed`);
  if (m.modified) parts.push(`${m.modified} modified`);
  const detail = parts.length ? ` (${parts.join(", ")})` : "";
  return `${m.changed} line${m.changed === 1 ? "" : "s"} touched${detail}`;
}

/**
 * Convenience: compute metrics for a range replacement given the OLD target
 * lines and NEW replacement lines. Keeps the "changed" number available both
 * as an object and as a plain count for callers that only need the scalar.
 */
export function computeChangedLinesScore(
  oldLines: string[],
  newLines: string[],
  isChanged?: LineComparer,
): { metrics: LineMetrics; changed: number } {
  const metrics = computeLineMetrics(oldLines, newLines, isChanged);
  return { metrics, changed: metrics.changed };
}