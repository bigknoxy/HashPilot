import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { grepMany, symbolLookupMany } from "../src/core/grep";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

const TMP_DIR = join(import.meta.dir, "__tmp_test_grep__");

function setup() {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(
    join(TMP_DIR, "a.ts"),
    [
      "const foo = 1;",
      "const bar = 2;",
      "let myLet = 3;",
      "var myVar = 4;",
      "const foobar = 10;",
      "export const baz = 20;",
    ].join("\n") + "\n"
  );
  writeFileSync(
    join(TMP_DIR, "b.ts"),
    [
      "function foo() {}",
      "class MyClass {}",
      "interface FooInterface {}",
      "type MyType = string;",
      "export function exportedFn() {}",
      "const special$char = 30;",
    ].join("\n") + "\n"
  );
}

function cleanup() {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {}
}

// ──────────────────────────────────────────────────
// grepMany tests
// ──────────────────────────────────────────────────
describe("grepMany", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("basic pattern: returns results across multiple files", async () => {
    const result = await grepMany("foo", [TMP_DIR]);
    expect(result.error).toBeUndefined();
    // "foo" matches: const foo (a.ts:1), const foobar (a.ts:5), function foo (b.ts:1) = 3
    expect(result.results.length).toBe(3);
    const paths = result.results.map((r) => r.path);
    expect(paths.filter((p) => p.endsWith("a.ts")).length).toBe(2);
    expect(paths.filter((p) => p.endsWith("b.ts")).length).toBe(1);
    result.results.forEach((r) => {
      expect(r.line).toBeGreaterThan(0);
      expect(r.content).toBeTruthy();
      expect(r.match).toBe("foo");
    });
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
    // Verify column defaults to 1 for multi-file format
    result.results.forEach((r) => {
      expect(r.column).toBe(1);
    });
  });

  test("single-file input produces line:content parse path", async () => {
    // When only one file is searched, grep omits the filename prefix,
    // which exercises the (\d+):(.*) regex branch (lines 57-62)
    const singlePath = join(TMP_DIR, "a.ts");
    const result = await grepMany("foo", [singlePath]);
    expect(result.results.length).toBe(2); // "const foo" and "const foobar"
    result.results.forEach((r) => {
      expect(r.path).toBe(singlePath);
      expect(r.column).toBe(1);
    });
  });

  test("multi-file directory input produces file:line parse path", async () => {
    // When a directory is searched, grep outputs file:line:content,
    // which exercises the ([^:]+):(\d+):(.*) regex branch (lines 66-72)
    const result = await grepMany("foo", [TMP_DIR]);
    expect(result.results.length).toBe(3);
    // All results should have correct paths (not just line numbers)
    result.results.forEach((r) => {
      // path must contain a file name with extension, not be a bare line number
      expect(r.path).toMatch(/\.ts$/);
    });
  });

  test("ignoreCase option: matches case-insensitively", async () => {
    const result = await grepMany("FOO", [TMP_DIR], { ignoreCase: true });
    expect(result.error).toBeUndefined();
    // "FOO" case-insensitively matches: const foo (a.ts:1), const foobar (a.ts:5),
    // function foo (b.ts:1), interface FooInterface (b.ts:3) = 4
    expect(result.results.length).toBe(4);
  });

  test("wordMatch option: prevents substring matching", async () => {
    // Without wordMatch, "foo" matches "foobar" as a substring
    // With wordMatch, "foo" must be a whole word — "foobar" should not match
    const result = await grepMany("foo", [TMP_DIR], { wordMatch: true });
    expect(result.error).toBeUndefined();
    // "const foo" (a.ts:1) and "function foo" (b.ts:1) = 2 hits
    expect(result.results.length).toBe(2);
    const hasFoobar = result.results.some((r) =>
      r.content.includes("foobar")
    );
    expect(hasFoobar).toBe(false);
  });

  test("filePattern option: filters results to matching file extension", async () => {
    const result = await grepMany("foo", [TMP_DIR], { filePattern: "*.py" });
    expect(result.results.length).toBe(0);
  });

  test("maxResults option: limits the number of results", async () => {
    // Without limit we get 3 results; with maxResults the per-file limit kicks in
    const unlimited = await grepMany("foo", [TMP_DIR]);
    const limited = await grepMany("foo", [TMP_DIR], { maxResults: 1 });
    expect(limited.results.length).toBeLessThan(unlimited.results.length);
    expect(limited.error).toBeUndefined();
  });

  test("no match returns empty results (exit code 1)", async () => {
    const result = await grepMany("NonExistentPatternXYZ_", [TMP_DIR]);
    expect(result.results).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  test("non-existent path returns error field", async () => {
    // grep on a non-existent path produces stderr + exit code 2
    // The catch branch (lines 82-86) should set error
    const result = await grepMany("foo", ["/nonexistent_path_xyz123_"]);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
    expect(result.error!.length).toBeGreaterThan(0);
    expect(result.results).toEqual([]);
  });
});

// ──────────────────────────────────────────────────
// symbolLookupMany tests
// ──────────────────────────────────────────────────
describe("symbolLookupMany", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("finds class definitions -> kind 'class'", async () => {
    const results = await symbolLookupMany(["MyClass"], [TMP_DIR]);
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("MyClass");
    expect(results[0].kind).toBe("class");
    expect(results[0].path).toContain("b.ts");
    expect(results[0].line).toBeGreaterThan(0);
  });

  test("finds interface definitions -> kind 'interface'", async () => {
    const results = await symbolLookupMany(["FooInterface"], [TMP_DIR]);
    expect(results.length).toBe(1);
    expect(results[0].kind).toBe("interface");
  });

  test("finds type definitions -> kind 'type'", async () => {
    const results = await symbolLookupMany(["MyType"], [TMP_DIR]);
    expect(results.length).toBe(1);
    expect(results[0].kind).toBe("type");
  });

  test("finds function and const definitions for same name", async () => {
    // "foo" appears as both "const foo" (a.ts) and "function foo" (b.ts)
    const results = await symbolLookupMany(["foo"], [TMP_DIR]);
    expect(results.length).toBe(2);
    const kinds = results.map((r) => r.kind).sort();
    expect(kinds).toEqual(["const", "function"]);
  });

  test("finds export function definitions -> kind 'function'", async () => {
    // "export function exportedFn() {}"
    const results = await symbolLookupMany(["exportedFn"], [TMP_DIR]);
    expect(results.length).toBe(1);
    expect(results[0].kind).toBe("function");
  });

  test("finds let definitions -> kind 'let'", async () => {
    const results = await symbolLookupMany(["myLet"], [TMP_DIR]);
    expect(results.length).toBe(1);
    expect(results[0].kind).toBe("let");
  });

  test("finds var definitions -> kind 'var'", async () => {
    const results = await symbolLookupMany(["myVar"], [TMP_DIR]);
    expect(results.length).toBe(1);
    expect(results[0].kind).toBe("var");
  });

  test("returns 'unknown' for export const pattern", async () => {
    // "export const baz = 20;" — grep matches "const baz" but detectSymbolKind
    // sees the full line "export const baz = 20;", which doesn't start with "const "
    const results = await symbolLookupMany(["baz"], [TMP_DIR]);
    expect(results.length).toBe(1);
    expect(results[0].kind).toBe("unknown");
  });

  test("handles special regex chars via escapeRegex", async () => {
    // "special$char" contains $, which must be escaped in the regex pattern
    const results = await symbolLookupMany(["special$char"], [TMP_DIR]);
    expect(results.length).toBe(1);
    expect(results[0].kind).toBe("const");
  });

  test("non-existent symbol returns empty array", async () => {
    const results = await symbolLookupMany(["NonExistent_XYZ_"], [TMP_DIR]);
    expect(results).toEqual([]);
  });

  test("handles multiple names in one call", async () => {
    const results = await symbolLookupMany(["foo", "bar"], [TMP_DIR]);
    // foo: const foo (a.ts) + function foo (b.ts) = 2
    // bar: const bar (a.ts) = 1
    // Total: 3
    expect(results.length).toBe(3);
    const names = results.map((r) => r.name);
    expect(names.filter((n) => n === "foo").length).toBe(2);
    expect(names.filter((n) => n === "bar").length).toBe(1);
  });
});
