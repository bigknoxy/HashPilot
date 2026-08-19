/**
 * Property tests for the diff engine (#31).
 *
 * The engine had example-based tests only, and two real defects -- the
 * "--"-prefixed-line parse break and the over-wide fuzzy match window -- were
 * both in the space a single round-trip property covers.
 *
 * The generator's alphabet deliberately contains every token the unified-diff
 * format reserves ("-", "--", "---", "+", "+++", "@@", "\"), plus empty and
 * whitespace-only lines, repeated identical lines (what breaks fuzzy matching),
 * CR characters, long lines, and astral-plane characters. Equality is asserted
 * on bytes, never on similarity.
 *
 * Runs are seeded so CI is reproducible; `FC_RANDOM_SEED=1` in the environment
 * switches to an unseeded run for the nightly randomized sweep.
 */

import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { generateUnifiedDiff, applyPatchToSource } from "../src/core/diff-engine";

/* ── Generators ───────────────────────────────────────────────────────── */

/** Every reserved unified-diff token, plus the shapes that break matching. */
const LINE_ALPHABET = [
  // reserved unified-diff tokens, bare and with the trailing space that makes
  // a prefixed content line look like a file header
  "-",
  "--",
  "---",
  "-- x",
  "-- a/file.ts",
  "--- a/file.ts",
  "+",
  "++",
  "+++",
  "+++ b/file.ts",
  "@@",
  "@@ -1,1 +1,1 @@",
  "\\ No newline at end of file",
  // empty / whitespace-only
  "",
  " ",
  "\t",
  "   ",
  // ordinary content
  "a",
  "b",
  "const x = 1;",
  "  indented",
  // repeated identical lines: three copies so the generator produces runs
  "same",
  "same",
  "same",
  // CR, long line, non-ASCII incl. astral plane
  "\r",
  "trailing cr\r",
  "z".repeat(300),
  "café — 🎉 𝕏",
];

const line = fc.constantFrom(...LINE_ALPHABET);
const source = fc.array(line, { maxLength: 40 }).map((ls) => ls.join("\n"));

/** Seeded by default; nightly sweeps set FC_RANDOM_SEED=1 for a random seed. */
const RUNS = 2000;
const params: fc.Parameters =
  process.env.FC_RANDOM_SEED === "1" ? { numRuns: RUNS } : { numRuns: RUNS, seed: 20260819 };

/* ── Properties ───────────────────────────────────────────────────────── */

describe("diff engine properties (#31)", () => {
  test("apply(diff(A, B)) === B, byte for byte", () => {
    fc.assert(
      fc.property(source, source, (a, b) => {
        const patch = generateUnifiedDiff(a, b, "f.txt");
        if (patch === "") return a === b;
        const result = applyPatchToSource(a, patch);
        return result.success === true && result.newSource === b;
      }),
      params
    );
  });

  test("strict mode (fuzzy 0) round-trips exactly as well as fuzzy mode", () => {
    fc.assert(
      fc.property(source, source, (a, b) => {
        const patch = generateUnifiedDiff(a, b, "f.txt");
        if (patch === "") return a === b;
        const result = applyPatchToSource(a, patch, { fuzzyMatch: 0 });
        return result.success === true && result.newSource === b;
      }),
      params
    );
  });

  test("diff(A, A) is empty", () => {
    fc.assert(
      fc.property(source, (a) => generateUnifiedDiff(a, a, "f.txt") === ""),
      params
    );
  });

  test("applying a patch twice fails cleanly rather than corrupting", () => {
    fc.assert(
      fc.property(source, source, (a, b) => {
        const patch = generateUnifiedDiff(a, b, "f.txt");
        if (patch === "") return true;
        const first = applyPatchToSource(a, patch, { fuzzyMatch: 0 });
        if (!first.success) return false;
        const second = applyPatchToSource(first.newSource!, patch, { fuzzyMatch: 0 });
        // Either it refuses, or it is a no-op. It must never produce a third state.
        return !second.success || second.newSource === b;
      }),
      params
    );
  });
});

/* ── Minimized counterexamples, committed as regression fixtures ──────── */

describe("diff engine regression fixtures (#31)", () => {
  test("a removed line rendering as '--- ...' does not truncate the hunk", () => {
    // Minimized from the round-trip property. Content "-- x" is prefixed with
    // "-" for removal, producing "--- x", which the old marker-scanning parser
    // mistook for the next file header and dropped the rest of the hunk.
    const a = "-- x";
    const b = "";
    const patch = generateUnifiedDiff(a, b, "f.txt");
    const result = applyPatchToSource(a, patch);
    expect(result.success).toBe(true);
    expect(result.newSource).toBe(b);
  });

  test("strict mode refuses a patch that has already been applied", () => {
    // Minimized from the apply-twice property. A pure insertion still matches
    // its own old side after landing, so the second apply used to duplicate it.
    const a = "b";
    const b = "b\n-";
    const patch = generateUnifiedDiff(a, b, "f.txt");
    const first = applyPatchToSource(a, patch, { fuzzyMatch: 0 });
    expect(first.newSource).toBe(b);

    const second = applyPatchToSource(first.newSource!, patch, { fuzzyMatch: 0 });
    expect(second.success).toBe(false);
    expect(second.message).toContain("already applied");
  });

  test("strict mode refuses when the recorded offset does not match exactly", () => {
    const a = "x\ny\nz";
    const patch = generateUnifiedDiff(a, "x\nY\nz", "f.txt");
    // Shift the file by one line: fuzzy mode would still find it, strict must not.
    const shifted = "pad\n" + a;
    const strict = applyPatchToSource(shifted, patch, { fuzzyMatch: 0 });
    expect(strict.success).toBe(false);
    expect(strict.message).toContain("strict mode");

    const fuzzyResult = applyPatchToSource(shifted, patch, { fuzzyMatch: 3 });
    expect(fuzzyResult.success).toBe(true);
    expect(fuzzyResult.newSource).toBe("pad\nx\nY\nz");
  });
});
