import { describe, test, expect } from "bun:test";
import { addImport } from "../src/core/ast-edit";

// B62 (#163): the bare-import dedup check matched the import spec as an
// unanchored substring against the whole file, so any existing identifier that
// merely *contained* the requested spec (Python `requests_toolbelt`, Rust
// `HashMapExtra`) was refused as "already exists". The check must be anchored
// to a whole import spec, not a substring.

describe("addImport dedup — Python bare imports (#163)", () => {
  test("adds `requests` when only `requests_toolbelt` is imported", () => {
    const src = "import requests_toolbelt\n\nx = 1\n";
    const r = addImport(src, "sample.py", "requests");
    expect(r.success).toBe(true);
    expect(r.newSource).toContain("import requests\n");
  });

  test("still refuses a true duplicate bare import", () => {
    const src = "import requests\n\nx = 1\n";
    const r = addImport(src, "sample.py", "requests");
    expect(r.success).toBe(false);
    expect(r.message).toContain("already exists");
  });

  // `import os.path` really does bind `os`, so a bare `os` request is a
  // genuine duplicate and must stay refused. Guards against over-correcting
  // the anchoring into a false *negative*.
  test("still refuses `os` when `import os.path` is present", () => {
    const src = "import os.path\n\nx = 1\n";
    const r = addImport(src, "sample.py", "os");
    expect(r.success).toBe(false);
    expect(r.message).toContain("already exists");
  });
});

describe("addImport dedup — Rust use specs (#163)", () => {
  test("adds HashMap when only HashMapExtra is in scope", () => {
    const src = "use std::collections::HashMapExtra;\n\nfn main() {}\n";
    const r = addImport(src, "main.rs", "std::collections::HashMap");
    expect(r.success).toBe(true);
    expect(r.newSource).toContain("use std::collections::HashMap;");
  });

  test("still refuses a true duplicate use spec", () => {
    const src = "use std::collections::HashMap;\n\nfn main() {}\n";
    const r = addImport(src, "main.rs", "std::collections::HashMap");
    expect(r.success).toBe(false);
    expect(r.message).toContain("already exists");
  });

  test("adds a distinct module when a longer one shares its prefix", () => {
    const src = "use serde_json::Value;\n\nfn main() {}\n";
    const r = addImport(src, "main.rs", "serde");
    expect(r.success).toBe(true);
    expect(r.newSource).toContain("use serde;");
  });
});

describe("addImport dedup — Go / grouped imports (#163)", () => {
  test("adds `fmt` when only `fmtx` is imported", () => {
    const src = 'package main\n\nimport "fmtx"\n\nfunc main() {}\n';
    const r = addImport(src, "main.go", "fmt");
    expect(r.success).toBe(true);
    expect(r.newSource).toContain('import "fmt"');
  });

  test("still refuses a true duplicate Go import", () => {
    const src = 'package main\n\nimport "fmt"\n\nfunc main() {}\n';
    const r = addImport(src, "main.go", "fmt");
    expect(r.success).toBe(false);
    expect(r.message).toContain("already exists");
  });
});
