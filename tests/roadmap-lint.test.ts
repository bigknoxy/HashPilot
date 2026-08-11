import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lintRoadmap, parseTables } from "../scripts/roadmap-lint";

const ROOT = join(import.meta.dir, "..");

/** A minimal roadmap with one scored table; tests mutate copies of this. */
function roadmap(rows: string[], header = "| # | Item | Score | Pri | Evidence | Area |"): string {
  return [
    "# Roadmap",
    "",
    "## Sprint 2 — Foundations",
    "",
    header,
    "|---|------|-------|-----|----------|------|",
    ...rows,
    "",
    "Some prose after the table.",
  ].join("\n");
}

const row = (issue: number, score: number, pri = "P1") =>
  `| [#${issue}](../../issues/${issue}) | B${issue} — a thing | ${score} | ${pri} | verified | correctness |`;

describe("lintRoadmap", () => {
  test("accepts a well-formed descending table", () => {
    expect(lintRoadmap(roadmap([row(1, 60), row(2, 55), row(3, 55), row(4, 40)]))).toEqual([]);
  });

  // Regression: shipped twice during the 2026-08 audit work.
  test("flags a row duplicated into a second table", () => {
    const text = [
      "# Roadmap",
      "",
      "## Sprint 1",
      "",
      "| # | Item | Score | Pri | Evidence | Area |",
      "|---|------|-------|-----|----------|------|",
      row(55, 60),
      "",
      "## Sprint 2",
      "",
      "| # | Item | Score | Pri | Evidence | Area |",
      "|---|------|-------|-----|----------|------|",
      row(55, 60),
    ].join("\n");
    const found = lintRoadmap(text);
    expect(found).toHaveLength(1);
    expect(found[0]!.rule).toBe("duplicate-issue");
    expect(found[0]!.message).toContain("#55");
  });

  test("flags a duplicate within a single table", () => {
    const found = lintRoadmap(roadmap([row(7, 50), row(7, 50)]));
    expect(found.map((f) => f.rule)).toEqual(["duplicate-issue"]);
  });

  // Regression: the ROADMAP.md backlog table shipped with #57 (38) below #47 (36).
  test("flags a row inserted out of score order", () => {
    const found = lintRoadmap(roadmap([row(1, 60), row(2, 36), row(3, 38)]));
    expect(found).toHaveLength(1);
    expect(found[0]!.rule).toBe("score-order");
    expect(found[0]!.message).toContain("#3 (38)");
  });

  test("scores order independently per table", () => {
    const text = [
      "# Roadmap",
      "",
      "## Sprint 1",
      "",
      "| # | Item | Score | Pri | Evidence | Area |",
      "|---|------|-------|-----|----------|------|",
      row(1, 40),
      "",
      "## Sprint 2",
      "",
      "| # | Item | Score | Pri | Evidence | Area |",
      "|---|------|-------|-----|----------|------|",
      // 90 > 40, but it opens a new table so it is not a regression.
      row(2, 90),
    ].join("\n");
    expect(lintRoadmap(text)).toEqual([]);
  });

  test("flags a link whose text and target disagree", () => {
    const text = roadmap([
      "| [#12](../../issues/21) | B12 — a thing | 50 | P1 | verified | correctness |",
    ]);
    const found = lintRoadmap(text);
    expect(found.map((f) => f.rule)).toEqual(["issue-link"]);
    expect(found[0]!.message).toContain("points at issue 21");
  });

  test("flags a non-integer score and an unknown priority", () => {
    const text = roadmap([
      "| [#12](../../issues/12) | B12 — a thing | high | P9 | verified | correctness |",
    ]);
    expect(lintRoadmap(text).map((f) => f.rule).sort()).toEqual(["priority", "score"]);
  });

  test("flags a row with the wrong number of columns", () => {
    const text = roadmap(["| [#12](../../issues/12) | B12 — a thing | 50 | P1 |"]);
    expect(lintRoadmap(text).map((f) => f.rule)).toContain("column-count");
  });

  test("ignores tables that carry no Score column", () => {
    const text = [
      "# Roadmap",
      "",
      "## Existing work",
      "",
      "| Doc | Status | Relationship |",
      "|-----|--------|--------------|",
      "| [`M5_PLAN.md`](M5_PLAN.md) | Partially shipped | see [#36](../../issues/36) |",
    ].join("\n");
    expect(lintRoadmap(text)).toEqual([]);
  });

  test("tolerates the Sprint 1 table's extra Status column", () => {
    const header = "| # | Item | Score | Pri | Evidence | Area | Status |";
    const rows = [
      "| [#3](../../issues/3) | B1 — a thing | 64 | P0 | verified | correctness | ✅ done |",
      "| [#4](../../issues/4) | B2 — a thing | 61 | P0 | verified | cli | ⏭ deferred |",
    ];
    expect(lintRoadmap(roadmap(rows, header))).toEqual([]);
  });

  test("parses every scored row in the real ROADMAP.md", () => {
    const { rows, issues } = parseTables(readFileSync(join(ROOT, "ROADMAP.md"), "utf8"));
    expect(issues).toEqual([]);
    expect(rows.length).toBeGreaterThan(40);
    expect(new Set(rows.map((r) => r.table)).size).toBeGreaterThanOrEqual(5);
  });
});

describe("rules cannot be silently disabled", () => {
  // Every per-row rule is keyed off a header name, so renaming a header used to
  // turn its rule into a no-op while the file still linted clean.
  test("a scored table with no priority column is an error, not a skipped check", () => {
    const doc = roadmap(
      ["| [#3](../../issues/3) | B1 — a thing | 64 | nonsense | verified | correctness |"],
      "| # | Item | Score | Whatever | Evidence | Area |",
    );
    const found = lintRoadmap(doc);
    expect(found.map((i) => i.rule)).toContain("missing-column");
  });

  test("`Priority` is accepted as a spelling of `Pri` and still validates values", () => {
    const header = "| # | Item | Score | Priority | Evidence | Area |";
    expect(
      lintRoadmap(
        roadmap(["| [#3](../../issues/3) | B1 — a thing | 64 | P0 | verified | cli |"], header),
      ),
    ).toEqual([]);
    expect(
      lintRoadmap(
        roadmap(["| [#3](../../issues/3) | B1 — a thing | 64 | P9 | verified | cli |"], header),
      ).map((i) => i.rule),
    ).toContain("priority");
  });

  test("renaming every real ROADMAP.md priority header does not lint clean", () => {
    const real = readFileSync(join(ROOT, "ROADMAP.md"), "utf8");
    const mutated = real.replaceAll("| Pri |", "| Nope |");
    expect(mutated).not.toBe(real);
    expect(lintRoadmap(mutated).length).toBeGreaterThan(0);
  });
});

describe("ROADMAP.md", () => {
  test("is clean", () => {
    expect(lintRoadmap(readFileSync(join(ROOT, "ROADMAP.md"), "utf8"))).toEqual([]);
  });
});
