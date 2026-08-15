import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { normalizePath, pathsEqual } from "../src/core/paths";

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

  test("handles undefined on both sides", () => {
    expect(pathsEqual(undefined, undefined)).toBe(true);
  });
});
