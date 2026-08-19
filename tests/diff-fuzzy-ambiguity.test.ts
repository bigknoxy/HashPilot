import { describe, test, expect } from "bun:test";
import { generateUnifiedDiff, applyPatchToSource, applyPatch } from "../src/core/diff-engine";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";

/**
 * Repetitive code is where a fuzzy window stops being a convenience: several
 * regions match the same context, and picking the first one silently patches
 * the wrong block (#33).
 */
function repeatedBlocks(count: number, marker = "value"): string[] {
  return Array.from({ length: count }, () => [
    "case A:",
    `  const x = ${marker};`,
    "  break;",
  ]).flat();
}

describe("fuzzy match ambiguity (#33)", () => {
  test("two candidates in the window refuse the patch instead of guessing", () => {
    // Blocks are three lines apart, so a fuzzy window of 3 reaches the next one.
    const source = repeatedBlocks(4).join("\n");
    const patch = generateUnifiedDiff(source, source.replace("value", "patched"), "f.ts");

    const result = applyPatchToSource(source, patch, { fuzzyMatch: 3 });

    expect(result.success).toBe(false);
    expect(result.message).toContain("ambiguous");
    // Every candidate is named, so the caller can disambiguate.
    expect(result.message).toMatch(/lines 1, 4/);
    expect(result.newSource).toBeUndefined();
  });

  test("the refusal says what to do next", () => {
    const source = repeatedBlocks(3).join("\n");
    const patch = generateUnifiedDiff(source, source.replace("value", "patched"), "f.ts");

    const result = applyPatchToSource(source, patch, { fuzzyMatch: 3 });

    expect(result.success).toBe(false);
    expect(result.message).toContain("more context");
    expect(result.message).toContain("hash tier");
  });

  test("a unique match still applies, and reports a zero offset", () => {
    const source = ["alpha", "beta", "gamma"].join("\n");
    const patch = generateUnifiedDiff(source, ["alpha", "BETA", "gamma"].join("\n"), "f.ts");

    const result = applyPatchToSource(source, patch, { fuzzyMatch: 3 });

    expect(result.success).toBe(true);
    expect(result.newSource).toBe(["alpha", "BETA", "gamma"].join("\n"));
    expect(result.placements).toEqual([{ expectedAt: 1, appliedAt: 1, offset: 0 }]);
    expect(result.fuzzyPlacements).toEqual([]);
  });

  test("a hunk that slides reports where it actually landed", () => {
    const source = ["alpha", "beta", "gamma"].join("\n");
    const patch = generateUnifiedDiff(source, ["alpha", "BETA", "gamma"].join("\n"), "f.ts");
    // Two extra lines above push every hunk down by two.
    const shifted = ["header 1", "header 2", ...source.split("\n")].join("\n");

    const result = applyPatchToSource(shifted, patch, { fuzzyMatch: 3 });

    expect(result.success).toBe(true);
    expect(result.newSource).toBe(["header 1", "header 2", "alpha", "BETA", "gamma"].join("\n"));
    expect(result.fuzzyPlacements).toEqual([{ expectedAt: 1, appliedAt: 3, offset: 2 }]);
    // The message must not read as an ordinary clean apply.
    expect(result.message).toContain("off their recorded position");
  });

  test("fuzzy 0 pins the recorded position, so an ambiguous file is unambiguous", () => {
    const source = repeatedBlocks(4).join("\n");
    const patch = generateUnifiedDiff(source, source.replace("value", "patched"), "f.ts");

    const result = applyPatchToSource(source, patch, { fuzzyMatch: 0 });

    expect(result.success).toBe(true);
    expect(result.newSource!.split("\n")[1]).toBe("  const x = patched;");
    // Only the first block changed.
    expect(result.newSource!.split("\n")[4]).toBe("  const x = value;");
  });

  test("the window is fuzzy lines wide regardless of hunk size", () => {
    // A 30-line hunk with fuzzy 1: a copy 10 lines away must stay out of reach.
    const block = Array.from({ length: 30 }, (_, i) => `line ${i};`);
    const source = [...block, ...Array.from({ length: 10 }, (_, i) => `pad ${i};`), ...block].join("\n");
    const patch = generateUnifiedDiff(
      block.join("\n"),
      [...block.slice(0, 29), "line 29 patched;"].join("\n"),
      "f.ts"
    );

    // Applied against a source whose first block starts 40 lines late.
    const late = [...Array.from({ length: 40 }, (_, i) => `pre ${i};`), ...block].join("\n");
    const result = applyPatchToSource(late, patch, { fuzzyMatch: 1 });

    expect(result.success).toBe(false);
    expect(result.message).toContain("context not found");
  });

  test("the on-disk path surfaces placements and refuses ambiguity without writing", async () => {
    // Under the project root: safeWrite confines every write to it.
    const dir = mkdtempSync(join(process.cwd(), ".hp-fuzzy-test-"));
    try {
      const unique = join(dir, "unique.ts");
      const source = ["alpha", "beta", "gamma"].join("\n");
      writeFileSync(unique, source);
      const patch = generateUnifiedDiff(source, ["alpha", "BETA", "gamma"].join("\n"), "unique.ts");
      const applied = await applyPatch(unique, patch, { fuzzyMatch: 3 });
      expect(applied.success).toBe(true);
      expect(applied.placements).toEqual([{ expectedAt: 1, appliedAt: 1, offset: 0 }]);
      expect(readFileSync(unique, "utf-8")).toBe(["alpha", "BETA", "gamma"].join("\n"));

      const ambiguous = join(dir, "ambiguous.ts");
      const repeated = repeatedBlocks(4).join("\n");
      writeFileSync(ambiguous, repeated);
      const ambiguousPatch = generateUnifiedDiff(repeated, repeated.replace("value", "patched"), "ambiguous.ts");
      const refused = await applyPatch(ambiguous, ambiguousPatch, { fuzzyMatch: 3 });
      expect(refused.success).toBe(false);
      expect(refused.message).toContain("ambiguous");
      // Refusal means refusal: the file on disk is untouched.
      expect(readFileSync(ambiguous, "utf-8")).toBe(repeated);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
