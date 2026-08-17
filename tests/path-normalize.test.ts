import { describe, test, expect } from "bun:test";
import { normalizePath, pathsEqual } from "../src/core/path-normalize";

describe("normalizePath", () => {
  test("converts absolute path to relative-to-cwd", () => {
    const abs = process.cwd() + "/src/main.ts";
    const result = normalizePath(abs);
    expect(result).toBe("src/main.ts");
  });

  test("passes through already-relative paths", () => {
    expect(normalizePath("src/main.ts")).toBe("src/main.ts");
  });

  test("resolves ./ prefix", () => {
    expect(normalizePath("./src/main.ts")).toBe("src/main.ts");
  });

  test("resolves ../ prefix", () => {
    const result = normalizePath("../" + (process.cwd().split("/").pop() || "proj") + "/src/main.ts");
    expect(result).toBe("src/main.ts");
  });

  test("handles trailing slash", () => {
    expect(normalizePath("src/main.ts/")).toBe("src/main.ts");
  });

  test("handles empty/undefined gracefully", () => {
    expect(normalizePath("")).toBe("");
    expect(normalizePath(undefined)).toBe("");
    expect(normalizePath(null)).toBe("");
    expect(normalizePath("   ")).toBe("");
  });

  test("returns cwd itself as '.'", () => {
    expect(normalizePath(process.cwd())).toBe(".");
  });

  // A path outside the project cannot be expressed relative to cwd without
  // a `../` walk, so it stays absolute. This is the branch that makes the
  // return type heterogeneous, and it was previously untested.
  test("leaves paths outside cwd absolute", () => {
    expect(normalizePath("/etc/hosts")).toBe("/etc/hosts");
    expect(normalizePath("/etc/../etc/hosts")).toBe("/etc/hosts");
  });

  test("does not treat a sibling directory sharing a prefix as inside cwd", () => {
    // cwd "/a/proj" must not swallow "/a/proj-other/x.ts" via a bare
    // startsWith on the prefix — the separator check is load-bearing.
    const sibling = process.cwd() + "-other/x.ts";
    expect(normalizePath(sibling)).toBe(sibling);
  });
});

describe("pathsEqual", () => {
  test("treats relative and absolute as equal", () => {
    const abs = process.cwd() + "/src/main.ts";
    expect(pathsEqual(abs, "src/main.ts")).toBe(true);
  });

  test("treats ./ prefix variants as equal", () => {
    expect(pathsEqual("./src/main.ts", "src/main.ts")).toBe(true);
  });

  test("treats different paths as unequal", () => {
    expect(pathsEqual("src/a.ts", "src/b.ts")).toBe(false);
  });

  // All nullish and empty forms collapse to the same canonical value, so the
  // relation must be consistent across every pairing of them.
  test("treats every nullish/empty form as equal", () => {
    const blanks = [undefined, null, "", "   "] as const;
    for (const a of blanks) {
      for (const b of blanks) {
        expect(pathsEqual(a, b)).toBe(true);
      }
    }
  });

  test("a blank never equals a real path", () => {
    expect(pathsEqual(undefined, "src/main.ts")).toBe(false);
    expect(pathsEqual(null, "src/main.ts")).toBe(false);
  });
});
