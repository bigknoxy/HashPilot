import { describe, test, expect } from "bun:test";
import {
  computeLineMetrics,
  describeLineMetrics,
  computeChangedLinesScore,
} from "../src/core/line-metrics";

const A = ["a", "b", "c"];
const B = ["a", "b", "c", "d", "e"];

describe("computeLineMetrics", () => {
  test("pure append: reports added=N and changed=N, NOT 2N (#166 falsifier)", () => {
    const m = computeLineMetrics(A, B);
    expect(m.added).toBe(2);
    expect(m.removed).toBe(0);
    expect(m.modified).toBe(0);
    // The bug this guards against: naive `|Δ| + positional-diff` double-counts
    // appended lines, yielding changed=4. Correct is 2 — appends counted once.
    expect(m.changed).toBe(2);
  });

  test("identical lines: all metrics zero (anti-falsifier)", () => {
    const m = computeLineMetrics(A, [...A]);
    expect(m).toEqual({ added: 0, removed: 0, modified: 0, changed: 0 });
  });

  test("pure truncation: removed=N, changed=N (falsifier)", () => {
    const m = computeLineMetrics(B, A);
    expect(m.removed).toBe(2);
    expect(m.added).toBe(0);
    expect(m.modified).toBe(0);
    expect(m.changed).toBe(2);
  });

  test("mixed append + in-place modification counts each once (#166 requires)", () => {
    // old: a,b,c  new: a,X,c,d,e
    // position 1 modified (b→X); positions 3-4 appended (d,e)
    // changed must be 1 modified + 2 added = 3, never 4.
    const m = computeLineMetrics(A, ["a", "X", "c", "d", "e"]);
    expect(m.modified).toBe(1);
    expect(m.added).toBe(2);
    expect(m.changed).toBe(3);
  });

  test("mixed truncation + modification counts each once (anti-falsifier)", () => {
    // old: a,b,c,d,e  new: a,X,c
    // position 1 modified (b→X); positions 3-4 removed (d,e)
    // changed must be 1 modified + 2 removed = 3.
    const m = computeLineMetrics(["a", "b", "c", "d", "e"], ["a", "X", "c"]);
    expect(m.modified).toBe(1);
    expect(m.removed).toBe(2);
    expect(m.changed).toBe(3);
  });

  test("single replacement: changed=1 (anti-falsifier)", () => {
    const m = computeLineMetrics(["a", "b", "c"], ["a", "X", "c"]);
    expect(m).toEqual({ added: 0, removed: 0, modified: 1, changed: 1 });
  });

  test("idempotent: same inputs → identical results (twice)", () => {
    const first = computeLineMetrics(A, B);
    const second = computeLineMetrics(A, B);
    expect(second).toEqual(first);
  });

  test("custom comparer extends behavior (whitespace-insensitive)", () => {
    const whitespaceBlind = (a: string, b: string) => a.trim() !== b.trim();
    const m = computeLineMetrics(["a", "b"], ["a ", "c"], whitespaceBlind);
    // index 0: "a" vs "a " — equal when trimmed → not modified
    // index 1: "b" vs "c" → modified
    expect(m.modified).toBe(1);
    expect(m.changed).toBe(1);
  });

  test("empty vs non-empty: all added (anti-falsifier)", () => {
    const m = computeLineMetrics([], ["x", "y"]);
    expect(m.added).toBe(2);
    expect(m.changed).toBe(2);
  });
});

describe("describeLineMetrics", () => {
  test("renders human text, generated from structured value", () => {
    const m = computeLineMetrics(A, B);
    expect(describeLineMetrics(m)).toContain("2");
    expect(describeLineMetrics(m)).toContain("added");
  });

  test("pluralizes correctly", () => {
    expect(describeLineMetrics({ added: 1, removed: 0, modified: 0, changed: 1 })).toContain(
      "1 line touched",
    );
    expect(describeLineMetrics({ added: 2, removed: 0, modified: 0, changed: 2 })).toContain(
      "2 lines touched",
    );
  });
});

describe("computeChangedLinesScore", () => {
  test("exposes both structured metrics and plain count", () => {
    const { metrics, changed } = computeChangedLinesScore(A, B);
    expect(metrics.changed).toBe(2);
    expect(changed).toBe(2);
  });
});