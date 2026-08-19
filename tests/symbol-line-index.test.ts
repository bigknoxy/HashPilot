import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { findSymbols } from "../src/core/ast-edit";
import { readHash } from "../src/core/read";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * #99 — `findSymbols` reports tree-sitter's 0-indexed rows, while every other
 * line number in HashPilot (the hash tier's `range`, `read-hash`, editor
 * jump-to-line) is 1-indexed. Feeding `startRow` straight into a hash edit
 * therefore targets the line *above* the symbol, and because the anchor hash of
 * that neighbouring line can legitimately match, the edit lands silently on the
 * wrong line rather than failing.
 *
 * Nothing asserted these values before, so neither the original off-by-one nor
 * a botched normalisation would have been caught. These tests pin the contract:
 * `startLine` is 1-indexed and agrees with `readHash`, and `startRow` stays
 * 0-indexed for the callers that already depend on it.
 */

const TMP_DIR = join(import.meta.dir, "__tmp_symbol_index__");

// A leading blank line is the point: it is what `startRow` wrongly selects, and
// it hashes to the SHA-256 of the empty string, which is how the bug surfaced.
const SOURCE = `
export type OutputFormat = "json" | "text";

export function resolveFormat(): OutputFormat {
  return "json";
}
`;

describe("findSymbols line indexing (#99)", () => {
  const file = join(TMP_DIR, "sample.ts");

  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(file, SOURCE);
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test("startLine is 1-indexed and resolves to the symbol's own line", async () => {
    const symbols = findSymbols(SOURCE, file);
    const target = symbols.find((s) => s.name === "resolveFormat");
    expect(target).toBeDefined();

    // The authority on what line N contains is the reader the hash tier uses.
    const read = await readHash(file, target!.startLine);
    expect(read.error).toBeUndefined();
    expect(read.content).toContain("resolveFormat");
  });

  test("startRow remains 0-indexed, and is off by one against readHash", async () => {
    const symbols = findSymbols(SOURCE, file);
    const target = symbols.find((s) => s.name === "resolveFormat");

    expect(target!.startRow).toBe(target!.startLine - 1);

    // Guard the reason the new field exists: the old one points somewhere else.
    const read = await readHash(file, target!.startRow);
    expect(read.content).not.toContain("resolveFormat");
  });

  test("endLine and columns are 1-indexed too", async () => {
    const symbols = findSymbols(SOURCE, file);
    const target = symbols.find((s) => s.name === "resolveFormat");

    expect(target!.endLine).toBe(target!.endRow + 1);
    expect(target!.startColumn).toBe(target!.startCol + 1);
    expect(target!.endColumn).toBe(target!.endCol + 1);

    const read = await readHash(file, target!.endLine);
    expect(read.error).toBeUndefined();
    expect(read.content).toContain("}");
  });

  test("every symbol's startLine round-trips through readHash", async () => {
    const symbols = findSymbols(SOURCE, file);
    expect(symbols.length).toBeGreaterThan(0);

    for (const s of symbols) {
      const read = await readHash(file, s.startLine);
      expect(read.error).toBeUndefined();
      // The declaration line must mention the symbol it declares.
      expect(read.content).toContain(s.name);
    }
  });
});
