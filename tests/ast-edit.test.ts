import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  findSymbols,
  renameSymbol,
  replaceBody,
  addImport,
  removeImport,
  insertBeforeSymbol,
  insertAfterSymbol,
  insertParameter,
  insertCallArg,
  detectLanguage,
  isLanguageSupported,
  supportedLanguages,
  astCapabilities,
} from "../src/core/ast-edit";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TMP_DIR = join(import.meta.dir, "__tmp_test_ast__");

// ── Sample sources per language ────────────────────────────────────────

const SAMPLE_TS = `import { foo } from './bar';

function greet(name: string): string {
  return "Hello, " + name;
}

function add(a: number, b: number): number {
  return a + b;
}

class Calculator {
  result: number = 0;

  compute(x: number): number {
    this.result = x * 2;
    return this.result;
  }
}

type Point = { x: number; y: number };
`;

const SAMPLE_JS = `import { foo } from './bar';

function greet(name) {
  return "Hello, " + name;
}

function add(a, b) {
  return a + b;
}

class Calculator {
  constructor() {
    this.result = 0;
  }

  compute(x) {
    this.result = x * 2;
    return this.result;
  }
}
`;

const SAMPLE_PY = `import os
import sys

def greet(name):
    return "Hello, " + name

def add(a, b):
    return a + b

class Calculator:
    def compute(self, x):
        self.result = x * 2
        return self.result
`;

const SAMPLE_GO = `package main

import "fmt"

func greet(name string) string {
    return "Hello, " + name
}

func add(a int, b int) int {
    return a + b
}

type Point struct {
    X int
    Y int
}
`;

const SAMPLE_RUST = `use std::collections::HashMap;

fn greet(name: &str) -> String {
    format!("Hello, {}", name)
}

fn add(a: i32, b: i32) -> i32 {
    a + b
}

struct Point {
    x: i32,
    y: i32,
}

impl Point {
    fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}
`;

// ── detectLanguage ─────────────────────────────────────────────────────

describe("detectLanguage", () => {
  test("detects TypeScript", () => {
    expect(detectLanguage("foo.ts")).toBe("typescript");
    expect(detectLanguage("foo.d.ts")).toBeNull();
  });

  test("detects TSX", () => {
    expect(detectLanguage("Foo.tsx")).toBe("tsx");
  });

  test("detects JavaScript variants", () => {
    expect(detectLanguage("foo.js")).toBe("javascript");
    expect(detectLanguage("foo.jsx")).toBe("javascript");
    expect(detectLanguage("foo.mjs")).toBe("javascript");
    expect(detectLanguage("foo.cjs")).toBe("javascript");
  });

  test("detects Python", () => {
    expect(detectLanguage("foo.py")).toBe("python");
  });

  test("detects Go", () => {
    expect(detectLanguage("foo.go")).toBe("go");
  });

  test("detects Rust", () => {
    expect(detectLanguage("foo.rs")).toBe("rust");
  });

  test("returns null for truly unsupported extensions", () => {
    expect(detectLanguage("foo.rb")).toBeNull();
    expect(detectLanguage("foo.java")).toBeNull();
    expect(detectLanguage("foo.c")).toBeNull();
    expect(detectLanguage("Makefile")).toBeNull();
  });
});

// ── isLanguageSupported ────────────────────────────────────────────────

describe("isLanguageSupported", () => {
  test("supports all target languages", () => {
    expect(isLanguageSupported("foo.ts")).toBe(true);
    expect(isLanguageSupported("foo.tsx")).toBe(true);
    expect(isLanguageSupported("foo.js")).toBe(true);
    expect(isLanguageSupported("foo.py")).toBe(true);
    expect(isLanguageSupported("foo.go")).toBe(true);
    expect(isLanguageSupported("foo.rs")).toBe(true);
  });

  test("rejects unsupported languages", () => {
    expect(isLanguageSupported("foo.java")).toBe(false);
    expect(isLanguageSupported("foo.rb")).toBe(false);
  });
});

describe("supportedLanguages", () => {
  test("returns all 6 target languages", () => {
    const langs = supportedLanguages();
    expect(langs).toContain("typescript");
    expect(langs).toContain("tsx");
    expect(langs).toContain("javascript");
    expect(langs).toContain("python");
    expect(langs).toContain("go");
    expect(langs).toContain("rust");
    expect(langs.length).toBe(6);
  });
});

// ── findSymbols ────────────────────────────────────────────────────────

describe("findSymbols — TypeScript", () => {
  test("finds functions, classes, and types", () => {
    const symbols = findSymbols(SAMPLE_TS, "sample.ts");
    const names = symbols.map((s) => s.name);
    expect(names).toContain("greet");
    expect(names).toContain("add");
    expect(names).toContain("Calculator");
    expect(names).toContain("Point");
  });
});

describe("findSymbols — JavaScript", () => {
  test("finds functions, classes", () => {
    const symbols = findSymbols(SAMPLE_JS, "sample.js");
    const names = symbols.map((s) => s.name);
    expect(names).toContain("greet");
    expect(names).toContain("add");
    expect(names).toContain("Calculator");
  });
});

describe("findSymbols — Python", () => {
  test("finds functions and classes", () => {
    const symbols = findSymbols(SAMPLE_PY, "sample.py");
    const names = symbols.map((s) => s.name);
    expect(names).toContain("greet");
    expect(names).toContain("add");
    expect(names).toContain("Calculator");
  });
});

describe("findSymbols — Go", () => {
  test("finds functions and types", () => {
    const symbols = findSymbols(SAMPLE_GO, "sample.go");
    const names = symbols.map((s) => s.name);
    expect(names).toContain("greet");
    expect(names).toContain("add");
    expect(names).toContain("Point");
  });
});

describe("findSymbols — Rust", () => {
  test("finds functions and structs", () => {
    const symbols = findSymbols(SAMPLE_RUST, "sample.rs");
    const names = symbols.map((s) => s.name);
    expect(names).toContain("greet");
    expect(names).toContain("add");
    expect(names).toContain("Point");
  });
});

describe("findSymbols — unsupported", () => {
  test("returns empty for unsupported language", () => {
    const symbols = findSymbols(SAMPLE_TS, "sample.rb");
    expect(symbols).toEqual([]);
  });
});

// ── renameSymbol ───────────────────────────────────────────────────────

describe("renameSymbol — TypeScript", () => {
  test("renames all occurrences of a symbol", () => {
    const result = renameSymbol(SAMPLE_TS, "sample.ts", "greet", "sayHello");
    expect(result.success).toBe(true);
    expect(result.changes).toBeGreaterThan(0);
    expect(result.newSource).toContain("sayHello");
    expect(result.newSource).not.toContain("greet");
  });

  test("fails when symbol not found", () => {
    const result = renameSymbol(SAMPLE_TS, "sample.ts", "nonexistent", "foo");
    expect(result.success).toBe(false);
  });
});

describe("renameSymbol — Python", () => {
  test("renames a function name", () => {
    const result = renameSymbol(SAMPLE_PY, "sample.py", "greet", "sayHello");
    expect(result.success).toBe(true);
    expect(result.changes).toBeGreaterThan(0);
    expect(result.newSource).toContain("sayHello");
  });
});

describe("renameSymbol — Go", () => {
  test("renames a function name", () => {
    const result = renameSymbol(SAMPLE_GO, "sample.go", "greet", "sayHello");
    expect(result.success).toBe(true);
    expect(result.changes).toBeGreaterThan(0);
    expect(result.newSource).toContain("sayHello");
  });
});

describe("renameSymbol — Rust", () => {
  test("renames a function name", () => {
    const result = renameSymbol(SAMPLE_RUST, "sample.rs", "greet", "sayHello");
    expect(result.success).toBe(true);
    expect(result.changes).toBeGreaterThan(0);
    expect(result.newSource).toContain("sayHello");
  });
});

// ── replaceBody ────────────────────────────────────────────────────────

describe("replaceBody — TypeScript", () => {
  test("replaces function body", () => {
    const result = replaceBody(SAMPLE_TS, "sample.ts", "greet", 'return "Hi, " + name;');
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("Hi, ");
    expect(result.newSource).not.toContain("Hello, ");
  });

  test("fails for non-existent symbol", () => {
    const result = replaceBody(SAMPLE_TS, "sample.ts", "nonexistent", "body");
    expect(result.success).toBe(false);
  });
});

describe("replaceBody — Python", () => {
  test("replaces function body", () => {
    const result = replaceBody(SAMPLE_PY, "sample.py", "greet", 'return "Hi, " + name');
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("Hi, ");
  });
});

describe("replaceBody — Go", () => {
  test("replaces function body", () => {
    const result = replaceBody(SAMPLE_GO, "sample.go", "greet", 'return "Hi, " + name');
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("Hi, ");
  });
});

describe("replaceBody — Rust", () => {
  test("replaces function body", () => {
    const result = replaceBody(SAMPLE_RUST, "sample.rs", "greet", 'format!("Hi, {{}}", name)');
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("Hi");
  });
});

// ── addImport ──────────────────────────────────────────────────────────

describe("addImport — TypeScript", () => {
  test("adds an import statement", () => {
    const result = addImport(SAMPLE_TS, "sample.ts", "{ baz } from './qux'");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("baz");
  });

  test("does not add duplicate import", () => {
    const result = addImport(SAMPLE_TS, "sample.ts", "{ foo } from './bar'");
    expect(result.success).toBe(false);
  });
});

describe("addImport — Python", () => {
  const PY_NO_IMPORTS = "def greet():\n    return 1\n";
  const PY_WITH_IMPORTS = "import os\n\nx = 1\n";

  test("adds a simple import after existing imports", () => {
    const result = addImport(SAMPLE_PY, "sample.py", "json");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("import json");
  });

  test("adds a simple import to file with no imports", () => {
    const result = addImport(PY_NO_IMPORTS, "sample.py", "json");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("import json");
  });

  test("supports from-import spec format", () => {
    const result = addImport(PY_WITH_IMPORTS, "sample.py", "from os import path");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("from os import path");
  });

  test("does not add duplicate from-import", () => {
    const result = addImport(PY_WITH_IMPORTS, "sample.py", "os");
    expect(result.success).toBe(false);
  });

  test("from-import with multiple names", () => {
    const result = addImport(PY_NO_IMPORTS, "sample.py", "from sys import argv, path");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("from sys import argv, path");
  });

  test("from-import merges into existing statement for same module", () => {
    const src = "from os import path\n\ndef f():\n    pass\n";
    const result = addImport(src, "sample.py", "from os import getcwd");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("from os import path, getcwd");
  });

  test("from-import merge rejects duplicate names", () => {
    const src = "from os import path\n\ndef f():\n    pass\n";
    const result = addImport(src, "sample.py", "from os import path");
    expect(result.success).toBe(false);
    expect(result.message).toContain("already exists");
  });
});

describe("addImport — Go", () => {
  const GO_NO_IMPORTS = "package main\n\nfunc main() {}\n";
  const GO_SINGLE = 'package main\n\nimport "fmt"\n\nfunc main() {}\n';
  const GO_GROUPED = 'package main\n\nimport (\n\t"fmt"\n\t"os"\n)\n\nfunc main() {}\n';

  test("adds import to file with single existing import", () => {
    const result = addImport(SAMPLE_GO, "sample.go", "strings");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain('import "strings"');
    // Should be after existing imports
    expect(result.newSource!.indexOf('import "strings"')).toBeGreaterThan(
      result.newSource!.indexOf("package main")
    );
  });

  test("inserts after package clause when no imports exist", () => {
    const result = addImport(GO_NO_IMPORTS, "sample.go", "fmt");
    expect(result.success).toBe(true);
    const idx = result.newSource!.indexOf('import "fmt"');
    expect(idx).toBeGreaterThan(result.newSource!.indexOf("package main"));
    // Should NOT be at position 0
    expect(idx).toBeGreaterThan(0);
  });

  test("inserts into existing grouped import block rather than creating new line", () => {
    const result = addImport(GO_GROUPED, "sample.go", "strings");
    expect(result.success).toBe(true);
    // Should be inside the grouped import block, not a separate line
    expect(result.newSource).toContain('"strings"');
    expect(result.newSource).toContain('"fmt"');
    expect(result.newSource).toContain('"os"');
    // There should be only one import_declaration (the grouped block)
    const importCount = (result.newSource!.match(/import/g) || []).length;
    expect(importCount).toBe(1);
  });

  test("inserts into grouped over simple in mixed import file (Go)", () => {
    const GO_MIXED = 'package main\n\nimport "fmt"\nimport (\n\t"os"\n)\n\nfunc main() {}\n';
    const result = addImport(GO_MIXED, "sample.go", "strings");
    expect(result.success).toBe(true);
    // Should go into the grouped block, not after the simple import
    expect(result.newSource).toContain("\"strings\"");
    // Verify it's inside the grouped block by checking it appears after "os"
    const osIdx = result.newSource!.indexOf("\"os\"");
    const strIdx = result.newSource!.indexOf("\"strings\"");
    expect(strIdx).toBeGreaterThan(osIdx);
  });
});

describe("addImport — Rust", () => {
  test("adds a use statement", () => {
    const result = addImport(SAMPLE_RUST, "sample.rs", "std::io::Write");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("use std::io::Write;");
  });
});

// ── removeImport ───────────────────────────────────────────────────────

describe("removeImport", () => {
  test("removes an import line (TypeScript)", () => {
    const result = removeImport(SAMPLE_TS, "sample.ts", "./bar");
    expect(result.success).toBe(true);
    expect(result.newSource).not.toContain("from './bar'");
  });

  test("removes an import line (Python)", () => {
    const result = removeImport(SAMPLE_PY, "sample.py", "os");
    expect(result.success).toBe(true);
    expect(result.newSource).not.toContain("import os");
  });

  test("removes an import line (Go)", () => {
    const result = removeImport(SAMPLE_GO, "sample.go", "fmt");
    expect(result.success).toBe(true);
    expect(result.newSource).not.toContain('import "fmt"');
  });

  test("removes a simple use declaration (Rust, AST-aware)", () => {
    const result = removeImport(SAMPLE_RUST, "sample.rs", "HashMap");
    expect(result.success).toBe(true);
    expect(result.newSource).not.toContain("HashMap");
  });

  test("no-op when target import is not found (Rust)", () => {
    const result = removeImport(SAMPLE_RUST, "sample.rs", "NonExistentCrate");
    expect(result.success).toBe(false);
    expect(result.changes).toBe(0);
  });

  test("no-op when target import is not found (Go)", () => {
    const result = removeImport(SAMPLE_GO, "sample.go", "nonexistent");
    expect(result.success).toBe(false);
    expect(result.changes).toBe(0);
  });

  // ── Rust grouped-use removal ───────────────────────────────────────────
  const RUST_GROUPED = `use std::collections::HashMap;
use std::io::{self, Write, Read};
use serde::Serialize;

fn main() {}
`;

  test("removes one item from grouped use (Rust)", () => {
    const result = removeImport(RUST_GROUPED, "sample.rs", "Write");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("self");
    expect(result.newSource).toContain("Read");
    expect(result.newSource).not.toContain("Write");
    // Other imports preserved
    expect(result.newSource).toContain("HashMap");
    expect(result.newSource).toContain("Serialize");
  });

  test("removes 'self' from grouped use", () => {
    const result = removeImport(RUST_GROUPED, "sample.rs", "self");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("Write");
    expect(result.newSource).not.toContain("self");
  });

  test("simplifies grouped to simple when one item remains (Rust)", () => {
    const src = `use std::io::{Write, Read};
fn main() {}
`;
    const result = removeImport(src, "sample.rs", "Write");
    expect(result.success).toBe(true);
    // Should simplify to `use std::io::Read;` (no braces in import line)
    expect(result.newSource).toContain("use std::io::Read;");
    expect(result.newSource).not.toContain("::io::{");
  });

  test("removes entire use_declaration when last item removed from group (Rust)", () => {
    const src = `use std::io::{Write};
fn main() {}
`;
    const result = removeImport(src, "sample.rs", "Write");
    expect(result.success).toBe(true);
    expect(result.newSource).not.toContain("use std::io");
  });

  test("no partial match on substrings in Rust (io != collections)", () => {
    const result = removeImport(RUST_GROUPED, "sample.rs", "io");
    expect(result.success).toBe(false);
    expect(result.changes).toBe(0);
  });

  test("preserves unrelated imports when removing from group (Rust)", () => {
    const result = removeImport(RUST_GROUPED, "sample.rs", "Read");
    expect(result.newSource).toContain("HashMap");
    expect(result.newSource).toContain("Serialize");
    expect(result.newSource).toContain("self");
    expect(result.newSource).not.toContain("Read");
  });
});

// ── insertBeforeSymbol / insertAfterSymbol ─────────────────────────────

describe("insertBeforeSymbol — TypeScript", () => {
  test("inserts content before a symbol", () => {
    const result = insertBeforeSymbol(SAMPLE_TS, "sample.ts", "greet", "// before greet");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("// before greet");
  });
});

describe("insertBeforeSymbol — Python", () => {
  test("inserts content before a function", () => {
    const result = insertBeforeSymbol(SAMPLE_PY, "sample.py", "greet", "# before greet");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("# before greet");
  });
});

describe("insertBeforeSymbol — Go", () => {
  test("inserts content before a function", () => {
    const result = insertBeforeSymbol(SAMPLE_GO, "sample.go", "greet", "// before greet");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("// before greet");
  });
});

describe("insertBeforeSymbol — Rust", () => {
  test("inserts content before a function", () => {
    const result = insertBeforeSymbol(SAMPLE_RUST, "sample.rs", "greet", "// before greet");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("// before greet");
  });
});

describe("insertAfterSymbol — TypeScript", () => {
  test("inserts content after a symbol", () => {
    const result = insertAfterSymbol(SAMPLE_TS, "sample.ts", "greet", "// after greet");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("// after greet");
  });
});

describe("insertAfterSymbol — Python", () => {
  test("inserts content after a function", () => {
    const result = insertAfterSymbol(SAMPLE_PY, "sample.py", "greet", "# after greet");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("# after greet");
  });
});

describe("insertAfterSymbol — Go", () => {
  test("inserts content after a function", () => {
    const result = insertAfterSymbol(SAMPLE_GO, "sample.go", "greet", "// after greet");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("// after greet");
  });
});

describe("insertAfterSymbol — Rust", () => {
  test("inserts content after a function", () => {
    const result = insertAfterSymbol(SAMPLE_RUST, "sample.rs", "greet", "// after greet");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("// after greet");
  });
});

// ── astCapabilities ────────────────────────────────────────────────────

describe("astCapabilities", () => {
  test("returns entries for all 6 languages", () => {
    const caps = astCapabilities();
    expect(caps.length).toBe(6);
  });

  test("each entry has lang, extensions, operations, limitations", () => {
    const caps = astCapabilities();
    for (const c of caps) {
      expect(c.lang).toBeTruthy();
      expect(c.extensions.length).toBeGreaterThan(0);
      expect(c.operations.length).toBeGreaterThan(0);
      expect(Array.isArray(c.limitations)).toBe(true);
    }
  });

  test("all entries include find-symbols and rename-symbol", () => {
    const caps = astCapabilities();
    for (const c of caps) {
      expect(c.operations).toContain("find-symbols");
      expect(c.operations).toContain("rename-symbol");
    }
  });

  test("has correct extensions for each language", () => {
    const caps = astCapabilities();
    const byLang = Object.fromEntries(caps.map((c) => [c.lang, c]));
    expect(byLang.typescript.extensions).toContain(".ts");
    expect(byLang.javascript.extensions).toContain(".js");
    expect(byLang.python.extensions).toContain(".py");
    expect(byLang.go.extensions).toContain(".go");
    expect(byLang.rust.extensions).toContain(".rs");
  });
});

describe("unsupported language error handling", () => {
  test("all operations return error for unsupported files", () => {
    const file = "sample.rb";
    expect(findSymbols(SAMPLE_TS, file)).toEqual([]);
    expect(renameSymbol(SAMPLE_TS, file, "x", "y").success).toBe(false);
    expect(replaceBody(SAMPLE_TS, file, "x", "y").success).toBe(false);
    expect(addImport(SAMPLE_TS, file, "x").success).toBe(false);
    expect(insertBeforeSymbol(SAMPLE_TS, file, "x", "y").success).toBe(false);
    expect(insertAfterSymbol(SAMPLE_TS, file, "x", "y").success).toBe(false);
  });
});

// ── TSX file support ──────────────────────────────────────────────────

const SAMPLE_TSX = `import { Component } from 'react';

interface Props {
  name: string;
}

function App(props: Props): JSX.Element {
  return <div>Hello, {props.name}</div>;
}

function greet(name: string): string {
  return "Hello, " + name;
}
`;

describe("findSymbols — TSX", () => {
  test("finds symbols in a TSX/JSX file", () => {
    const symbols = findSymbols(SAMPLE_TSX, "component.tsx");
    const names = symbols.map((s) => s.name);
    expect(names).toContain("App");
    expect(names).toContain("greet");
    expect(names).toContain("Props");
  });
});

// ── insertParameter ────────────────────────────────────────────────────

describe("insertParameter", () => {
  test("inserts parameter at last position", () => {
    const source =
      "function greet(name: string): string {\n" +
      '  return `hello ${name}`;\n' +
      "}\n";
    const result = insertParameter(source, "test.ts", "greet", "age: number", "last");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("greet(name: string, age: number)");
  });

  test("inserts parameter at first position", () => {
    const source =
      "function greet(name: string): string {\n" +
      '  return `hello ${name}`;\n' +
      "}\n";
    const result = insertParameter(source, "test.ts", "greet", "age: number", "first");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("greet(age: number, name: string)");
  });

  test("inserts parameter into function with no existing params", () => {
    const source =
      "function greet(): string {\n" +
      '  return "hello";\n' +
      "}\n";
    const result = insertParameter(source, "test.ts", "greet", "name: string", "last");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("greet(name: string)");
  });

  test("inserts parameter at first position when no existing params", () => {
    const source =
      "function greet(): string {\n" +
      '  return "hello";\n' +
      "}\n";
    const result = insertParameter(source, "test.ts", "greet", "name: string", "first");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("greet(name: string)");
  });

  test("returns error for non-existent symbol", () => {
    const source =
      "function greet(): string {\n" +
      '  return "hello";\n' +
      "}\n";
    const result = insertParameter(source, "test.ts", "nonexistent", "x: number", "last");
    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
  });

  test("returns error for unsupported language", () => {
    const source =
      "function greet(): string {\n" +
      '  return "hello";\n' +
      "}\n";
    const result = insertParameter(source, "test.rb", "greet", "x: number", "last");
    expect(result.success).toBe(false);
  });
});

// ── insertCallArg ──────────────────────────────────────────────────────

describe("insertCallArg", () => {
  test("inserts argument into function call with no existing args", () => {
    const source = 'const result = greet();\n';
    const result = insertCallArg(source, "test.ts", "greet", '"world"');
    expect(result.success).toBe(true);
    expect(result.newSource).toContain('greet("world")');
  });

  test("inserts argument into function call with existing args", () => {
    const source = 'const result = greet("hello");\n';
    const result = insertCallArg(source, "test.ts", "greet", '"world"');
    expect(result.success).toBe(true);
    expect(result.newSource).toContain('greet("hello", "world")');
  });

  test("inserts argument into multiple call sites", () => {
    const source =
      'const a = greet("hello");\n' +
      'const b = greet("hi");\n';
    const result = insertCallArg(source, "test.ts", "greet", '"world"');
    expect(result.success).toBe(true);
    expect(result.changes).toBe(2);
    expect(result.newSource).toContain('greet("hello", "world")');
    expect(result.newSource).toContain('greet("hi", "world")');
  });

  test("returns error when no call sites found", () => {
    const source = 'const result = foo();\n';
    const result = insertCallArg(source, "test.ts", "greet", '"world"');
    expect(result.success).toBe(false);
  });

  test("returns error for unsupported language", () => {
    const source = 'const result = greet();\n';
    const result = insertCallArg(source, "test.rb", "greet", '"world"');
    expect(result.success).toBe(false);
  });

  test("inserts argument into Python function call", () => {
    const source = 'result = greet()\n';
    const result = insertCallArg(source, "test.py", "greet", '"world"');
    expect(result.success).toBe(true);
    expect(result.newSource).toContain('greet("world")');
  });

  test("inserts argument into Go function call", () => {
    const source = 'result := greet()\n';
    const result = insertCallArg(source, "test.go", "greet", '"world"');
    expect(result.success).toBe(true);
    expect(result.newSource).toContain('greet("world")');
  });
});

// ── Python from-import edge cases ──────────────────────────────────────

describe("addImport — Python from-import edge cases", () => {
  const PY_OS_IMPORT = "from os import path\n\nx = 1\n";
  const PY_NO_IMPORTS = "def f():\n    pass\n";

  test("from-import creates new import when module doesn't match existing", () => {
    const src = "from os import path\n\nx = 1\n";
    const result = addImport(src, "test.py", "from sys import argv");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("from os import path");
    expect(result.newSource).toContain("from sys import argv");
  });

  test("from-import duplicate name detection with no existing from-import", () => {
    const src = "import os\n\nx = 1\n";
    const result = addImport(src, "test.py", "from os import path");
    expect(result.success).toBe(true);
    // Should create new from-import since no existing `from os import` exists
    expect(result.newSource).toContain("from os import path");
  });

  test("from-import with no existing imports at all", () => {
    const result = addImport(PY_NO_IMPORTS, "test.py", "from sys import argv");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("from sys import argv");
  });

  test("from-import merging appends only non-duplicate names", () => {
    const src = "from os import path, getcwd\n\nx = 1\n";
    const result = addImport(src, "test.py", "from os import path");
    expect(result.success).toBe(false);
    expect(result.message).toContain("already exists");
  });
});

// ── Go addImport without package declaration ───────────────────────────

describe("addImport — Go without package declaration", () => {
  test("adds import to Go file with no package clause", () => {
    const GO_NO_PACKAGE = 'func main() {}\n';
    const result = addImport(GO_NO_PACKAGE, "test.go", "fmt");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain('import "fmt"');
  });
});

// ── removeImport edge cases ────────────────────────────────────────────

describe("removeImport — edge cases", () => {
  test("returns error for unsupported language (.rb)", () => {
    const result = removeImport(SAMPLE_TS, "test.rb", "anything");
    expect(result.success).toBe(false);
  });

  test("removes import from TSX file", () => {
    const TSX_SOURCE = `import { Component } from 'react';\n\nconst x = 1;\n`;
    const result = removeImport(TSX_SOURCE, "test.tsx", "react");
    expect(result.success).toBe(true);
    expect(result.newSource).not.toContain("react");
  });
});

// ── replaceBody on interface/abstract method ───────────────────────────

describe("replaceBody — interface method (no body)", () => {
  test("returns error when symbol has no body (interface method declaration)", () => {
    const SOURCE = `interface Greeter {\n  greet(name: string): string;\n}\n`;
    const result = replaceBody(SOURCE, "test.ts", "greet", "return 'hi';");
    expect(result.success).toBe(false);
    expect(result.message).toContain("no body");
  });
});
