import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { detectModuleSystem, nearestPackageType } from "../src/core/module-system";

/**
 * #139 — the detection these tests pin down is what stops `add-import` from
 * writing `import` into a CommonJS file. tree-sitter parses either syntax, so
 * the parse-validity gate cannot be the backstop here.
 */
function sandbox(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "hp-modsys-"));
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

describe("detectModuleSystem — extension", () => {
  test(".cjs is CommonJS even under a type:module package", () => {
    const root = sandbox({ "package.json": '{"type":"module"}', "a.cjs": "" });
    try {
      const v = detectModuleSystem(join(root, "a.cjs"), "");
      expect(v.system).toBe("cjs");
      expect(v.signal).toBe("extension");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(".mjs is ESM even under a type:commonjs package", () => {
    const root = sandbox({ "package.json": '{"type":"commonjs"}', "a.mjs": "" });
    try {
      expect(detectModuleSystem(join(root, "a.mjs"), "").system).toBe("esm");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("detectModuleSystem — package.json", () => {
  test('"type": "module" makes a .js file ESM', () => {
    const root = sandbox({ "package.json": '{"type":"module"}', "src/a.js": "" });
    try {
      const v = detectModuleSystem(join(root, "src/a.js"), "");
      expect(v.system).toBe("esm");
      expect(v.signal).toBe("package.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an absent type field means CommonJS, per Node's own default", () => {
    const root = sandbox({ "package.json": '{"name":"x"}', "a.js": "" });
    try {
      expect(detectModuleSystem(join(root, "a.js"), "").system).toBe("cjs");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the nearest package.json wins over one further up", () => {
    const root = sandbox({
      "package.json": '{"type":"module"}',
      "packages/inner/package.json": '{"name":"inner"}',
      "packages/inner/a.js": "",
    });
    try {
      expect(detectModuleSystem(join(root, "packages/inner/a.js"), "").system).toBe("cjs");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a malformed package.json is not a signal — the walk continues", () => {
    const root = sandbox({
      "package.json": '{"type":"module"}',
      "inner/package.json": "{ this is not json",
      "inner/a.js": "",
    });
    try {
      expect(detectModuleSystem(join(root, "inner/a.js"), "").system).toBe("esm");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("nearestPackageType returns null when there is no package.json above", () => {
    const root = sandbox({ "a.js": "" });
    try {
      expect(nearestPackageType(root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * #161 — `path.parse().root` is `""` for a relative path, so the ancestor
   * walk's stop condition (`dir === root`) never fired against a relative
   * `startDir`: the walk quietly stopped at `cwd` instead of continuing to
   * the real filesystem root. In a monorepo, that means a relative-path
   * lookup from a subpackage misses a `package.json` that sits above `cwd`
   * and falls through to the wrong default, while the identical absolute
   * path correctly finds it.
   */
  test("relative and absolute paths from a monorepo subpackage agree (#161)", () => {
    const root = sandbox({
      "package.json": '{"name":"monorepo"}', // no "type" field: CommonJS per Node's default
      "packages/pkgA/src/bare.js": "",
    });
    const prevCwd = process.cwd();
    try {
      process.chdir(join(root, "packages/pkgA"));
      const relative = detectModuleSystem("src/bare.js", "");
      const absolute = detectModuleSystem(join(root, "packages/pkgA/src/bare.js"), "");
      expect(relative).toEqual(absolute);
      expect(relative.system).toBe("cjs");
      expect(relative.signal).toBe("package.json");
    } finally {
      process.chdir(prevCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("nearestPackageType itself agrees on a relative vs. absolute startDir", () => {
    const root = sandbox({
      "package.json": '{"name":"monorepo"}',
      "packages/pkgA/src/bare.js": "",
    });
    const prevCwd = process.cwd();
    try {
      process.chdir(join(root, "packages/pkgA"));
      const relative = nearestPackageType("src");
      const absolute = nearestPackageType(join(root, "packages/pkgA/src"));
      expect(relative).toEqual(absolute);
      expect(relative?.system).toBe("cjs");
    } finally {
      process.chdir(prevCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("detectModuleSystem — content sniff", () => {
  const bare = (source: string) => {
    const root = sandbox({ "a.js": source });
    try {
      return detectModuleSystem(join(root, "a.js"), source);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  test("require() alone reads as CommonJS", () => {
    const v = bare('const a = require("a");\n');
    expect(v.system).toBe("cjs");
    expect(v.signal).toBe("content");
  });

  test("module.exports alone reads as CommonJS", () => {
    expect(bare("module.exports = {};\n").system).toBe("cjs");
  });

  test("a top-level import reads as ESM", () => {
    expect(bare('import a from "a";\n').system).toBe("esm");
  });

  test("a top-level export reads as ESM", () => {
    expect(bare("export const x = 1;\n").system).toBe("esm");
  });

  test("both markers yield no verdict rather than a guess", () => {
    const v = bare('const a = require("a");\nimport b from "b";\n');
    expect(v.system).toBeNull();
    expect(v.detail).toContain("mixes");
  });

  test("a method named .require is not a CommonJS marker", () => {
    expect(bare("obj.require(1);\nexport const x = 1;\n").system).toBe("esm");
  });

  test("no signal at all falls back to ESM, and says so", () => {
    const v = bare("const x = 1;\n");
    expect(v.system).toBe("esm");
    expect(v.signal).toBe("default");
  });
});
