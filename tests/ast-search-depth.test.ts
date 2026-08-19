/**
 * Depth limits in AST search (#39).
 *
 * findSymbols stopped at depth 10 and insertParameter at 15, both silently, so
 * a deeply nested symbol came back as "not found" — a wrong answer the caller
 * could not distinguish from a right one.
 */
import { describe, expect, test } from "bun:test";
import { findSymbols, findSymbolsDetailed, MAX_AST_DEPTH } from "../src/core/ast-edit";
import { insertParameter } from "../src/core/ast-edit";

/** A function nested `depth` blocks deep, so the AST depth exceeds `depth`. */
function nested(depth: number, name = "deepTarget"): string {
  const open = Array.from({ length: depth }, (_, i) => `${"  ".repeat(i)}function wrap${i}() {`);
  const inner = `${"  ".repeat(depth)}function ${name}(a: number) { return a; }`;
  const close = Array.from({ length: depth }, (_, i) => `${"  ".repeat(depth - 1 - i)}}`);
  return [...open, inner, ...close].join("\n") + "\n";
}

describe("findSymbols depth", () => {
  test("a symbol nested 20 functions deep is found", () => {
    const symbols = findSymbols(nested(20), "deep.ts");
    expect(symbols.some((s) => s.name === "deepTarget")).toBe(true);
  });

  test("a symbol nested 60 deep is found — well past the old limit of 10", () => {
    const symbols = findSymbols(nested(60), "deep.ts");
    expect(symbols.some((s) => s.name === "deepTarget")).toBe(true);
  });

  test("a completed search reports truncated: false", () => {
    const search = findSymbolsDetailed(nested(20), "deep.ts");
    expect(search.truncated).toBe(false);
    expect(search.symbols.length).toBeGreaterThan(20);
  });

  test("symbols come back in source order", () => {
    const src = "function a() {}\nfunction b() {}\nfunction c() {}\n";
    expect(findSymbols(src, "order.ts").map((s) => s.name)).toEqual(["a", "b", "c"]);
  });

  test("a tree deeper than the guard reports truncated instead of silently stopping", () => {
    const search = findSymbolsDetailed(nested(MAX_AST_DEPTH + 20), "deep.ts");
    expect(search.truncated).toBe(true);
  });

  test("a pathologically deep file does not stack-overflow", () => {
    // 5000 nested blocks: the recursive walk this replaced blew the stack long
    // before any cap applied.
    const src = "let x = " + "(".repeat(5000) + "1" + ")".repeat(5000) + ";\n";
    expect(() => findSymbolsDetailed(src, "deep.ts")).not.toThrow();
  });
});

describe("insertParameter depth", () => {
  test("a function nested 20 deep gets its parameter", () => {
    const result = insertParameter(nested(20), "deep.ts", "deepTarget", "b: string");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("function deepTarget(a: number, b: string)");
  });

  test("an incomplete search reports SEARCH_TRUNCATED, never SYMBOL_NOT_FOUND", () => {
    const result = insertParameter(nested(MAX_AST_DEPTH + 20, "unreachable"), "deep.ts", "unreachable", "b: string");
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("SEARCH_TRUNCATED");
  });

  test("a genuinely absent symbol still reports SYMBOL_NOT_FOUND", () => {
    const result = insertParameter("function a() {}\n", "shallow.ts", "nosuch", "b: string");
    expect(result.errorCode).toBe("SYMBOL_NOT_FOUND");
  });
});

describe("shared constant", () => {
  test("the runaway guard is far above realistic AST depth", () => {
    expect(MAX_AST_DEPTH).toBeGreaterThanOrEqual(200);
  });
});
