/**
 * insert-before / insert-after anchor selection (#38).
 *
 * The old implementation anchored on any node with a `name` field, so a symbol
 * that also appeared as a function parameter spliced a statement into the
 * parameter list and reported success.
 */
import { describe, expect, test } from "bun:test";
import { insertAfterSymbol, insertBeforeSymbol } from "../src/core/ast-edit";

const PARAM_TS = `function handler(config: string): void {
  console.log(config);
}
`;

describe("insert anchors — non-statement targets refuse", () => {
  test("a name that is only a parameter is refused, not spliced", () => {
    const result = insertAfterSymbol(PARAM_TS, "sample.ts", "config", "const injected = 1;");
    expect(result.success).toBe(false);
    expect(result.newSource).toBeUndefined();
    expect(result.errorCode).toBe("SYMBOL_NOT_FOUND");
  });

  test("insert-before refuses the same target", () => {
    const result = insertBeforeSymbol(PARAM_TS, "sample.ts", "config", "const injected = 1;");
    expect(result.success).toBe(false);
    expect(result.newSource).toBeUndefined();
  });

  test("an import specifier is named as what it is, not spliced", () => {
    const src = `import { readFile } from "node:fs";\n`;
    const result = insertAfterSymbol(src, "sample.ts", "readFile", "const x = 1;");
    expect(result.success).toBe(false);
    expect(result.message).toContain("not a statement or declaration");
    expect(result.message).toContain("hash tier");
  });

  test("a Go parameter name is refused rather than spliced into the list", () => {
    const src = `package main\n\nfunc handler(config string) {}\n`;
    const result = insertAfterSymbol(src, "sample.go", "config", "var x = 1");
    expect(result.success).toBe(false);
    expect(result.newSource).toBeUndefined();
  });

  test("a Python parameter name is refused", () => {
    const src = "def handler(config):\n    return config\n";
    const result = insertAfterSymbol(src, "sample.py", "config", "x = 1");
    expect(result.success).toBe(false);
  });
});

describe("insert anchors — ambiguity", () => {
  test("two declarations of the same name refuse and list both", () => {
    const src = `class A {\n  run() {}\n}\nclass B {\n  run() {}\n}\n`;
    const result = insertAfterSymbol(src, "sample.ts", "run", "// note");
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("AMBIGUOUS_SYMBOL");
    expect(result.message).toContain("line 2");
    expect(result.message).toContain("line 5");
  });
});

describe("insert anchors — indentation", () => {
  test("insert-after matches the anchor's indentation instead of column 0", () => {
    const src = `class A {\n  run() {\n    return 1;\n  }\n}\n`;
    const result = insertAfterSymbol(src, "sample.ts", "run", "// after run");
    expect(result.success).toBe(true);
    expect(result.newSource).toBe(`class A {\n  run() {\n    return 1;\n  }\n  // after run\n}\n`);
  });

  test("multi-line content keeps its relative shape at the anchor's indent", () => {
    const src = `class A {\n  run() {\n    return 1;\n  }\n}\n`;
    const result = insertAfterSymbol(src, "sample.ts", "run", "stop() {\n  return 2;\n}");
    expect(result.newSource).toBe(
      `class A {\n  run() {\n    return 1;\n  }\n  stop() {\n    return 2;\n  }\n}\n`
    );
  });

  test("insert-before puts content on its own line above the anchor", () => {
    const src = `class A {\n  run() {}\n}\n`;
    const result = insertBeforeSymbol(src, "sample.ts", "run", "// doc");
    expect(result.newSource).toBe(`class A {\n  // doc\n  run() {}\n}\n`);
  });
});

describe("insert anchors — declaration promotion", () => {
  test("a const declarator anchors on the whole statement, not the declarator", () => {
    const src = `const alpha = 1;\nconst beta = 2;\n`;
    const result = insertAfterSymbol(src, "sample.ts", "alpha", "// between");
    expect(result.newSource).toBe(`const alpha = 1;\n// between\nconst beta = 2;\n`);
  });

  test("a Go type_spec anchors on its type declaration", () => {
    const src = `package main\n\ntype Alpha struct{}\n`;
    const result = insertAfterSymbol(src, "sample.go", "Alpha", "// tail");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("type Alpha struct{}\n// tail\n");
  });

  test("a Rust struct still anchors normally", () => {
    const src = `struct Alpha {}\n`;
    const result = insertBeforeSymbol(src, "sample.rs", "Alpha", "// doc");
    expect(result.newSource).toBe(`// doc\nstruct Alpha {}\n`);
  });
});

describe("insert anchors — result still parses", () => {
  test("inserting into a class body yields a parseable file", () => {
    const src = `class A {\n  run() {}\n}\n`;
    const result = insertAfterSymbol(src, "sample.ts", "run", "stop() {}");
    // The parse-validity gate discards an edit whose result would not parse,
    // so a successful result is itself the assertion that it parses.
    expect(result.success).toBe(true);
  });
});
