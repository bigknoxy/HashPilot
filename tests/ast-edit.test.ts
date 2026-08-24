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
  firstParseError,
  setAllowParseErrors,
} from "../src/core/ast-edit";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
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

describe("addImport — merging into an existing module import (#103)", () => {
  const BASE = 'import { readFileSync } from "node:fs";\n\nexport function go(): string {\n  return String(readFileSync("a"));\n}\n';

  test("merges a new name into the existing grouped import", () => {
    const result = addImport(BASE, "svc.ts", '{ writeFileSync } from "node:fs"');
    expect(result.success).toBe(true);
    expect(result.newSource).toBe(
      'import { readFileSync, writeFileSync } from "node:fs";\n\nexport function go(): string {\n  return String(readFileSync("a"));\n}\n'
    );
  });

  test("merges several names at once", () => {
    const result = addImport(BASE, "svc.ts", '{ a, b } from "node:fs"');
    expect(result.success).toBe(true);
    expect(result.newSource).toContain('import { readFileSync, a, b } from "node:fs";');
  });

  test("refuses a name already bound from that module", () => {
    const result = addImport(BASE, "svc.ts", '{ readFileSync } from "node:fs"');
    expect(result.success).toBe(false);
    expect(result.changes).toBe(0);
  });

  test("refuses a name already bound under an alias", () => {
    const result = addImport('import { a as z } from "m";\n', "svc.ts", '{ a as z } from "m"');
    expect(result.success).toBe(false);
  });

  test("adds named bindings alongside an existing default import", () => {
    const result = addImport('import def from "m";\n\nconst x = 1;\n', "svc.ts", '{ a } from "m"');
    expect(result.success).toBe(true);
    expect(result.newSource).toBe('import def, { a } from "m";\n\nconst x = 1;\n');
  });

  test("adds a default import alongside existing named bindings", () => {
    const result = addImport('import { a } from "m";\n\nconst x = 1;\n', "svc.ts", 'def from "m"');
    expect(result.success).toBe(true);
    expect(result.newSource).toBe('import def, { a } from "m";\n\nconst x = 1;\n');
  });

  test("inserts a separate statement for a different module without eating the blank line", () => {
    const result = addImport(BASE, "svc.ts", '{ join } from "node:path"');
    expect(result.success).toBe(true);
    expect(result.newSource).toBe(
      'import { readFileSync } from "node:fs";\nimport { join } from "node:path";\n\nexport function go(): string {\n  return String(readFileSync("a"));\n}\n'
    );
  });

  test("falls back to a separate statement for a namespace import", () => {
    const result = addImport('import * as ns from "m";\n\nconst x = 1;\n', "svc.ts", '{ a } from "m"');
    expect(result.success).toBe(true);
    expect(result.newSource).toBe('import * as ns from "m";\nimport { a } from "m";\n\nconst x = 1;\n');
  });

  test("preserves the blank line after a Python import block", () => {
    const result = addImport("import os\n\nx = 1\n", "svc.py", "json");
    expect(result.success).toBe(true);
    expect(result.newSource).toBe("import os\nimport json\n\nx = 1\n");
  });

  test("does not merge a value import into a type-only import", () => {
    const src = 'import type { Foo } from "./m";\n\nexport const x = 1;\n';
    const result = addImport(src, "svc.ts", '{ bar } from "./m"');
    expect(result.success).toBe(true);
    // `import type` erases its bindings, so `bar` must land on its own statement.
    expect(result.newSource).toContain('import type { Foo } from "./m";');
    expect(result.newSource).toContain('import { bar } from "./m";');
  });

  test("merges a type import into the existing type-only import", () => {
    const src = 'import type { Foo } from "./m";\n\nexport const x = 1;\n';
    const result = addImport(src, "svc.ts", 'type { Bar } from "./m"');
    expect(result.success).toBe(true);
    expect(result.newSource).toContain('import type { Foo, Bar } from "./m";');
  });

  test("does not merge a type import into a value import", () => {
    const src = 'import { a } from "./m";\n\nexport const x = a;\n';
    const result = addImport(src, "svc.ts", 'type { Bar } from "./m"');
    expect(result.success).toBe(true);
    expect(result.newSource).toContain('import { a } from "./m";');
    expect(result.newSource).toContain('import type { Bar } from "./m";');
  });

  test("keeps statements on separate lines when the file has no trailing newline", () => {
    const src = 'import { a } from "./a";';
    const result = addImport(src, "svc.ts", '{ b } from "./b"');
    expect(result.success).toBe(true);
    expect(result.newSource).toBe('import { a } from "./a";\nimport { b } from "./b";\n');
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

// ── removeImport binding-level removal (#102) ─────────────────────────

describe("removeImport — grouped bindings (#102)", () => {
  const GROUPED_TS = 'import { readFileSync, writeFileSync, statSync } from "node:fs";\nconst x = 1;\n';

  test("removes one name from a grouped TS import, leaving the rest", () => {
    const result = removeImport(GROUPED_TS, "svc.ts", "statSync");
    expect(result.success).toBe(true);
    expect(result.changes).toBe(1);
    expect(result.newSource).toBe('import { readFileSync, writeFileSync } from "node:fs";\nconst x = 1;\n');
  });

  test("accepts the documented full spec form", () => {
    const result = removeImport(GROUPED_TS, "svc.ts", '{ statSync } from "node:fs"');
    expect(result.success).toBe(true);
    expect(result.newSource).toBe('import { readFileSync, writeFileSync } from "node:fs";\nconst x = 1;\n');
  });

  test("refuses a substring of the module path", () => {
    const result = removeImport(GROUPED_TS, "svc.ts", "fs");
    expect(result.success).toBe(false);
    expect(result.changes).toBe(0);
  });

  test("refuses a substring of a binding name", () => {
    const result = removeImport(GROUPED_TS, "svc.ts", "read");
    expect(result.success).toBe(false);
    expect(result.changes).toBe(0);
  });

  test("the exact module path still removes the whole statement", () => {
    const result = removeImport(GROUPED_TS, "svc.ts", "node:fs");
    expect(result.success).toBe(true);
    expect(result.newSource).toBe("const x = 1;\n");
  });

  test("removing the last named binding drops the statement", () => {
    const result = removeImport('import { a } from "m";\nconst x = 1;\n', "svc.ts", "a");
    expect(result.success).toBe(true);
    expect(result.newSource).toBe("const x = 1;\n");
  });

  test("keeps the default import when a named binding is removed", () => {
    const result = removeImport('import def, { a } from "m";\n', "svc.ts", "a");
    expect(result.success).toBe(true);
    expect(result.newSource).toBe('import def from "m";\n');
  });

  test("keeps named bindings when the default import is removed", () => {
    const result = removeImport('import def, { a } from "m";\n', "svc.ts", "def");
    expect(result.success).toBe(true);
    expect(result.newSource).toBe('import { a } from "m";\n');
  });

  test("matches a named import by its alias", () => {
    const result = removeImport('import { a as b, c } from "m";\n', "svc.ts", "b");
    expect(result.success).toBe(true);
    expect(result.newSource).toBe('import { c } from "m";\n');
  });

  test("removes one name from a Python from-import", () => {
    const result = removeImport("from os.path import join, dirname\n", "svc.py", "join");
    expect(result.success).toBe(true);
    expect(result.newSource).toBe("from os.path import dirname\n");
  });

  test("removes one module from a Python multi-import", () => {
    const result = removeImport("import os, sys\n", "svc.py", "sys");
    expect(result.success).toBe(true);
    expect(result.newSource).toBe("import os\n");
  });

  test("removes one spec from a Go grouped import", () => {
    const src = 'package main\n\nimport (\n\t"fmt"\n\t"os"\n)\n';
    const result = removeImport(src, "svc.go", "os");
    expect(result.success).toBe(true);
    expect(result.newSource).toBe('package main\n\nimport (\n\t"fmt"\n)\n');
  });

  test("matches a Go import by its last path segment", () => {
    const src = 'package main\n\nimport (\n\t"net/http"\n\t"os"\n)\n';
    const result = removeImport(src, "svc.go", "http");
    expect(result.success).toBe(true);
    expect(result.newSource).toBe('package main\n\nimport (\n\t"os"\n)\n');
  });
});

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

// ── #55: sources larger than the binding's 32KB marshalling buffer ─────

/**
 * `parser.parse(string)` throws a bare `Invalid argument` at 32767 characters,
 * so every AST operation was dead on exactly the large files where a structured
 * edit beats a hand-written diff. These fail on the string overload.
 */
describe("AST edits on files over 32KB (#55)", () => {
  /** Padding that is valid in every supported language. */
  function pad(chars: number): string {
    const line = "// " + "x".repeat(76) + "\n";
    return line.repeat(Math.ceil(chars / line.length));
  }

  const BIG_CASES: Array<[label: string, file: string, source: string, symbol: string]> = [
    ["TypeScript", "big.ts", `${pad(100_000)}\nfunction target(a: number): number {\n  return a + 1;\n}\n`, "target"],
    ["JavaScript", "big.js", `${pad(100_000)}\nfunction target(a) {\n  return a + 1;\n}\n`, "target"],
    ["Go", "big.go", `package main\n\n${pad(100_000)}\nfunc target(a int) int {\n\treturn a + 1\n}\n`, "target"],
    ["Rust", "big.rs", `${pad(100_000)}\nfn target(a: i32) -> i32 {\n    a + 1\n}\n`, "target"],
  ];

  for (const [label, file, source, symbol] of BIG_CASES) {
    test(`${label}: renames a symbol in a ~100KB file`, () => {
      expect(source.length).toBeGreaterThan(32_767);
      const result = renameSymbol(source, file, symbol, "renamed");
      expect(result.success).toBe(true);
      expect(result.newSource).toContain("renamed");
      expect(result.newSource).not.toContain(`${symbol}(`);
    });
  }

  test("Python: renames a symbol in a ~100KB file", () => {
    const source = `${pad(100_000).replace(/\/\//g, "##")}\ndef target(a):\n    return a + 1\n`;
    expect(source.length).toBeGreaterThan(32_767);
    const result = renameSymbol(source, "big.py", "target", "renamed");
    expect(result.success).toBe(true);
    expect(result.newSource).toContain("def renamed(a):");
  });

  test("finds symbols past the 32KB boundary", () => {
    const source = `${pad(100_000)}\nfunction late(): void {}\n`;
    const names = findSymbols(source, "big.ts").map((s) => s.name);
    expect(names).toContain("late");
  });

  test("multi-byte source is chunked without splitting a surrogate pair", () => {
    // A naive slice at a fixed offset can cut an emoji in half; the lone
    // surrogate then corrupts every byte offset after it.
    const block = "// \u{1F389} émoji 中文\n";
    const source = `${block.repeat(4000)}\nfunction target(): number { return 1; }\n`;
    expect(source.length).toBeGreaterThan(32_767);
    const result = renameSymbol(source, "uni.ts", "target", "renamed");
    expect(result.success).toBe(true);
    expect(result.newSource!.split("\u{1F389}").length - 1).toBe(4000);
    expect(result.newSource).toContain("function renamed(): number");
  });
});

// ── #13: the parse-validity gate ───────────────────────────────────────

describe("parse-validity gate (#13)", () => {
  const BROKEN = `function greet(name: string): string {\n  return "hi" +\n}\n`;

  test("firstParseError locates the syntax error", () => {
    const issue = firstParseError(BROKEN, "broken.ts");
    expect(issue).not.toBeNull();
    expect(issue!.line).toBeGreaterThan(0);
  });

  test("firstParseError returns null for a clean file", () => {
    expect(firstParseError(SAMPLE_TS, "sample.ts")).toBeNull();
  });

  test("refuses to edit a file that does not parse", () => {
    const result = renameSymbol(BROKEN, "broken.ts", "greet", "hello");
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("PARSE_ERROR");
    expect(result.parseIssue).toBeDefined();
    expect(result.newSource).toBeUndefined();
  });

  test("--allow-parse-errors lets the pre-check through", () => {
    setAllowParseErrors(true);
    try {
      const result = renameSymbol(BROKEN, "broken.ts", "greet", "hello");
      expect(result.success).toBe(true);
      expect(result.newSource).toContain("hello");
    } finally {
      setAllowParseErrors(false);
    }
  });

  test("discards an edit whose result would not parse", () => {
    // Replacing a body with an unbalanced brace corrupts the file.
    const result = replaceBody(SAMPLE_TS, "sample.ts", "greet", 'return "hi" +');
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("PARSE_ERROR");
    expect(result.newSource).toBeUndefined();
  });

  test("a valid edit is unaffected by the gate", () => {
    const result = replaceBody(SAMPLE_TS, "sample.ts", "greet", 'return "Hi, " + name;');
    expect(result.success).toBe(true);
    expect(result.errorCode).toBeUndefined();
    expect(result.newSource).toContain('return "Hi, " + name;');
  });

  test("languages with no parser are not gated", () => {
    // .d.ts is excluded from AST editing, so nothing here should claim a parse error.
    expect(firstParseError("this is (not code", "notes.txt")).toBeNull();
    expect(firstParseError("export declare const x: number", "types.d.ts")).toBeNull();
  });
});

// ── renameSymbol — binding-aware ambiguity guard (#14) ──────────────────
// #14: a file-wide `rename-symbol` used to rename every reference of a name
// in the file with no notion of *which* symbol was intended, silently
// clobbering a shadowed local, a foreign import, or a duplicate top-level
// declaration. `rename-symbol` is now file-scoped AND binding-aware: it
// refuses with AMBIGUOUS_SYMBOL when the name binds more than one symbol.

const SHADOW_TS = `const config = 1;
function useConfig(x: number) {
  const config = 99;
  return x + config;
}
export function handle() { return config; }`;

const FOREIGN_IMPORT_TS = `import { value } from "./other-binder";
const value = 1;
console.log(value);`;

const DUPLICATE_TS = `function foo() { return 1; }
const foo = 2;
function bar() { return 3; }
const bar = 4;`;

const PY_PARAM_SHADOW = `def outer(x):
  def inner(x):
    return x + 1
  return inner(x) + x`;

// AC3: a single binding where the same spelling also appears as a property key,
// a string literal, and a comment — none of which are references and must be
// left untouched by a successful rename.
const PROPERTY_KEY_TS = `const data = 1;
function f() {
  const label = "data"; // a string literal and a comment mention of data
  return { data: data, label };
}`;

const CLEAN_TS = `function hello() {
    const x = 1;
    return x;
   }
export { hello };`;

describe("renameSymbol — binding-aware ambiguity guard (#14)", () => {
   // AC1: a name shadowed by a local at an inner scope is multi-bound → refuse.
  test("AC1 — refuses a rename shadowed by a local (TS)", () => {
    const r = renameSymbol(SHADOW_TS, "shadow.ts", "config", "renamed");
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe("AMBIGUOUS_SYMBOL");
    expect(r.changes).toBe(0);
    });

   // AC2: a foreign import of the same name is a second binding → refuse.
  test("AC2 — refuses a rename shadowed by a foreign import (TS)", () => {
    const r = renameSymbol(FOREIGN_IMPORT_TS, "foreign.ts", "value", "renamed");
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe("AMBIGUOUS_SYMBOL");
    expect(r.changes).toBe(0);
    });

   // AC3 part 1: duplicate top-level declarations → refuse.
  test("AC3 — refuses a rename with duplicate top-level declarations (TS)", () => {
    const r = renameSymbol(DUPLICATE_TS, "dup.ts", "foo", "renamed");
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe("AMBIGUOUS_SYMBOL");
    expect(r.changes).toBe(0);
    });

   // AC3 part 2: property keys, string literals, and comments are never
   // references, so a rename of a single-bound name leaves them untouched and
   // still succeeds.
  test("AC3 — property keys / strings / comments are not renamed (TS)", () => {
    const r = renameSymbol(PROPERTY_KEY_TS, "pk.ts", "data", "renamed");
    expect(r.success).toBe(true);
    expect(r.changes).toBeGreaterThan(0);
    expect(r.newSource).toContain("renamed");
     // the string literal and comment mention survive untouched:
    expect(r.newSource).toContain('"data"');
    expect(r.newSource).toContain("comment mention of data");
    });

   // Python: a name reused as a parameter across nested defs is a shadow.
  test("shadow across nested function parameters (Python)", () => {
    const r = renameSymbol(PY_PARAM_SHADOW, "outer.py", "x", "renamed");
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe("AMBIGUOUS_SYMBOL");
    });

   // No over-refusal: a clean single-binding symbol still renames everywhere.
  test("does NOT over-refuse a clean single binding (TS)", () => {
    const r = renameSymbol(CLEAN_TS, "hello.ts", "hello", "greet");
    expect(r.success).toBe(true);
    expect(r.changes).toBeGreaterThanOrEqual(2);
    expect(r.newSource).toContain("greet");
    });

   // The error message names the symbol so the caller can disambiguate.
  test("error message names the contending symbol", () => {
    const r = renameSymbol(SHADOW_TS, "shadow.ts", "config", "renamed");
    expect(r.message).toContain("config");
    expect(r.message).toMatch(/binding/i);
    });
});

// ── #139: add-import must not write ESM syntax into a CommonJS file ──────

describe("addImport — module system (#139)", () => {
  const CJS_DIR = join(TMP_DIR, "cjs");

  /** Write a file under its own directory, optionally with a package.json above it. */
  function fixture(name: string, source: string, pkg?: string): string {
    const dir = join(CJS_DIR, name.replace(/\W/g, "_"));
    mkdirSync(dir, { recursive: true });
    if (pkg !== undefined) writeFileSync(join(dir, "package.json"), pkg);
    const path = join(dir, name);
    writeFileSync(path, source);
    return path;
  }

  const CJS_SOURCE = 'const path = require("path");\n\nmodule.exports = {};\n';

  beforeEach(() => mkdirSync(CJS_DIR, { recursive: true }));
  afterEach(() => rmSync(CJS_DIR, { recursive: true, force: true }));

  test("a .cjs file gets a require declaration, not an import statement", () => {
    const p = fixture("a.cjs", CJS_SOURCE);
    const r = addImport(CJS_SOURCE, p, '{ join } from "path"');
    expect(r.success).toBe(true);
    expect(r.newSource).toContain('const { join } = require("path");');
    expect(r.newSource).not.toContain("import ");
  });

  test("the require declaration lands with the other requires, above the code", () => {
    const p = fixture("order.cjs", CJS_SOURCE);
    const r = addImport(CJS_SOURCE, p, '{ join } from "path"');
    expect(r.newSource).toBe(
      'const path = require("path");\nconst { join } = require("path");\n\nmodule.exports = {};\n',
    );
  });

  test("a .js file under a package.json with no type field is CommonJS", () => {
    const p = fixture("plain.js", CJS_SOURCE, '{"name":"fixture"}');
    const r = addImport(CJS_SOURCE, p, '{ join } from "path"');
    expect(r.success).toBe(true);
    expect(r.newSource).toContain('const { join } = require("path");');
  });

  test('a .js file under "type": "module" still gets ESM', () => {
    const src = "export const x = 1;\n";
    const p = fixture("esm.js", src, '{"type":"module"}');
    const r = addImport(src, p, '{ join } from "path"');
    expect(r.success).toBe(true);
    expect(r.newSource).toContain('import { join } from "path";');
  });

  test(".mjs is ESM and .cjs is CommonJS regardless of package.json", () => {
    const mjsSrc = "export const x = 1;\n";
    const mjs = fixture("forced.mjs", mjsSrc, '{"type":"commonjs"}');
    expect(addImport(mjsSrc, mjs, '{ join } from "path"').newSource).toContain('import { join } from "path";');

    const cjs = fixture("forced.cjs", CJS_SOURCE, '{"type":"module"}');
    expect(addImport(CJS_SOURCE, cjs, '{ join } from "path"').newSource).toContain('const { join } = require("path");');
  });

  // The content sniff is only reachable with no package.json anywhere above the
  // file, so these two fixtures live outside the repo — HashPilot's own
  // package.json would otherwise settle the question first, and correctly.
  test("content decides when there is no extension or package.json signal", () => {
    const dir = mkdtempSync(join(tmpdir(), "hp-sniff-"));
    const src = 'const a = require("a");\n';
    const p = join(dir, "sniff.js");
    writeFileSync(p, src);
    try {
      const r = addImport(src, p, '{ join } from "path"');
      expect(r.success).toBe(true);
      expect(r.newSource).toContain('const { join } = require("path");');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a file mixing require and import is refused, and left byte-identical", () => {
    const dir = mkdtempSync(join(tmpdir(), "hp-mixed-"));
    const src = 'const a = require("a");\nimport b from "b";\n';
    const p = join(dir, "mixed.js");
    writeFileSync(p, src);
    try {
      const r = addImport(src, p, '{ join } from "path"');
      expect(r.success).toBe(false);
      expect(r.errorCode).toBe("MODULE_SYSTEM_MISMATCH");
      expect(r.recovery).toBeTruthy();
      expect(r.newSource).toBeUndefined();
      expect(readFileSync(p, "utf8")).toBe(src);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.each([
    ['{ join } from "path"', 'const { join } = require("path");'],
    ['{ join, resolve } from "path"', 'const { join, resolve } = require("path");'],
    ['{ join as j } from "path"', 'const { join: j } = require("path");'],
    ['pathmod from "path"', 'const pathmod = require("path");'],
    ['* as pathns from "path"', 'const pathns = require("path");'],
  ])("spec %p emits %p", (spec, expected) => {
    const src = "module.exports = {};\n";
    const p = fixture(`form_${spec.replace(/\W/g, "")}.cjs`, src);
    const r = addImport(src, p, spec);
    expect(r.success).toBe(true);
    expect(r.newSource).toContain(expected);
  });

  test("a second name for the same module merges instead of duplicating", () => {
    const src = 'const { join } = require("path");\n\nmodule.exports = {};\n';
    const p = fixture("merge.cjs", src);
    const r = addImport(src, p, '{ resolve } from "path"');
    expect(r.success).toBe(true);
    expect(r.newSource).toBe('const { join, resolve } = require("path");\n\nmodule.exports = {};\n');
  });

  test("re-adding a binding that is already required is refused", () => {
    const src = 'const { join } = require("path");\n';
    const p = fixture("dupe.cjs", src);
    const r = addImport(src, p, '{ join } from "path"');
    expect(r.success).toBe(false);
    expect(r.message).toContain("already exists");
  });

  test("a combined default-and-named spec is refused with the two calls to make", () => {
    const src = "module.exports = {};\n";
    const p = fixture("combined.cjs", src);
    const r = addImport(src, p, 'fs, { join } from "path"');
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe("MODULE_SYSTEM_MISMATCH");
    expect(r.recovery).toContain('{ join } from "path"');
  });

  test("a type-only spec is refused rather than emitted into JavaScript", () => {
    const src = "module.exports = {};\n";
    const p = fixture("typeonly.cjs", src);
    const r = addImport(src, p, 'type { Stats } from "fs"');
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe("MODULE_SYSTEM_MISMATCH");
  });

  test("a bare module name is a usage error naming the accepted form", () => {
    const src = "module.exports = {};\n";
    const p = fixture("bare.cjs", src);
    const r = addImport(src, p, "fs");
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe("INVALID_ARGUMENT");
    expect(r.recovery).toContain("from");
  });

  test("the require declaration goes below a shebang, not above it", () => {
    const src = "#!/usr/bin/env node\nmodule.exports = {};\n";
    const p = fixture("shebang.cjs", src);
    const r = addImport(src, p, '{ join } from "path"');
    expect(r.success).toBe(true);
    expect(r.newSource!.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(r.newSource).toContain('const { join } = require("path");');
  });

  test("TypeScript is untouched by module-system detection", () => {
    const src = "export const x = 1;\n";
    const p = fixture("still-esm.ts", src, '{"name":"cjs-package"}');
    const r = addImport(src, p, '{ join } from "path"');
    expect(r.success).toBe(true);
    expect(r.newSource).toContain('import { join } from "path";');
  });
});

describe("removeImport — CommonJS require declarations (#139)", () => {
  const CJS_DIR = join(TMP_DIR, "cjs-remove");
  beforeEach(() => mkdirSync(CJS_DIR, { recursive: true }));
  afterEach(() => rmSync(CJS_DIR, { recursive: true, force: true }));

  function fixture(name: string, source: string): string {
    const path = join(CJS_DIR, name);
    writeFileSync(path, source);
    return path;
  }

  test("add then remove returns the file to its original bytes", () => {
    const original = 'const path = require("path");\n\nmodule.exports = {};\n';
    const p = fixture("roundtrip.cjs", original);
    const added = addImport(original, p, '{ join } from "path"');
    expect(added.success).toBe(true);
    const removed = removeImport(added.newSource!, p, '{ join } from "path"');
    expect(removed.success).toBe(true);
    expect(removed.newSource).toBe(original);
  });

  test("removing one binding keeps the rest of the destructure", () => {
    const src = 'const { join, resolve } = require("path");\n';
    const p = fixture("partial.cjs", src);
    const r = removeImport(src, p, '{ join } from "path"');
    expect(r.success).toBe(true);
    expect(r.newSource).toBe('const { resolve } = require("path");\n');
  });

  test("removing the last binding deletes the declaration", () => {
    const src = 'const { join } = require("path");\nmodule.exports = {};\n';
    const p = fixture("last.cjs", src);
    const r = removeImport(src, p, '{ join } from "path"');
    expect(r.success).toBe(true);
    expect(r.newSource).toBe("module.exports = {};\n");
  });

  test("a whole-module require is removed by its local name", () => {
    const src = 'const path = require("path");\nmodule.exports = {};\n';
    const p = fixture("whole.cjs", src);
    const r = removeImport(src, p, 'path from "path"');
    expect(r.success).toBe(true);
    expect(r.newSource).toBe("module.exports = {};\n");
  });

  test("a require that is not there reports not-found and changes nothing", () => {
    const src = 'const { join } = require("path");\n';
    const p = fixture("missing.cjs", src);
    const r = removeImport(src, p, '{ readFile } from "fs"');
    expect(r.success).toBe(false);
    expect(r.message).toContain("No import");
    expect(r.newSource).toBeUndefined();
  });
});
