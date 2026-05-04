import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { editMany, editManySerial } from "../src/core/batch-edit";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TMP_DIR = join(import.meta.dir, "__tmp_batch_tests__");

const FILE_A = join(TMP_DIR, "a.ts");
const FILE_B = join(TMP_DIR, "b.ts");
const FILE_C = join(TMP_DIR, "c.ts");

function setup() {
  try { mkdirSync(TMP_DIR, { recursive: true }); } catch {}
  writeFileSync(FILE_A, "const foo = 1;\nfunction bar() { return foo; }\n");
  writeFileSync(FILE_B, "const foo = 2;\nfunction baz() { return foo; }\n");
  writeFileSync(FILE_C, "const foo = 3;\nfunction qux() { return foo + 1; }\n");
}

function cleanup() {
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

describe("editMany", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("renames symbol across multiple files", async () => {
    const result = await editMany({
      files: [FILE_A, FILE_B, FILE_C],
      operation: "rename-symbol",
      oldName: "foo",
      newName: "value",
    });

    expect(result.summary.total).toBe(3);
    expect(result.summary.succeeded).toBe(3);
    expect(result.summary.failed).toBe(0);

    // Verify each file was actually modified
    for (const f of [FILE_A, FILE_B, FILE_C]) {
      const content = await Bun.file(f).text();
      expect(content).not.toContain("const foo");
      expect(content).toContain("const value");
    }
  });

  test("handles partial failure gracefully", async () => {
    const result = await editMany({
      files: [FILE_A, FILE_B, FILE_C],
      operation: "rename-symbol",
      oldName: "nonexistent",
      newName: "value",
    });

    expect(result.summary.total).toBe(3);
    expect(result.summary.failed).toBe(3);

    // Original content preserved
    for (const f of [FILE_A, FILE_B, FILE_C]) {
      const content = await Bun.file(f).text();
      expect(content).toContain("const foo");
    }
  });

  test("dry-run does not modify files", async () => {
    const result = await editMany({
      files: [FILE_A, FILE_B],
      operation: "rename-symbol",
      oldName: "foo",
      newName: "renamed",
      dryRun: true,
    });

    expect(result.summary.succeeded).toBe(2);

    // Files should be unchanged
    const a = await Bun.file(FILE_A).text();
    expect(a).toContain("function bar");

    const b = await Bun.file(FILE_B).text();
    expect(b).toContain("function baz");
  });

  test("add-import across multiple files", async () => {
    const result = await editMany({
      files: [FILE_A, FILE_B],
      operation: "add-import",
      importSpec: "{ hello } from './world'",
    });

    expect(result.summary.succeeded).toBe(2);

    for (const f of [FILE_A, FILE_B]) {
      const content = await Bun.file(f).text();
      expect(content).toContain("import { hello }");
    }
  });

  test("partial success mixed results", async () => {
    // FILE_A has "bar", FILE_C has "qux"
    const result = await editMany({
      files: [FILE_A, FILE_B, FILE_C],
      operation: "rename-symbol",
      oldName: "bar",
      newName: "renamedBar",
    });

    // FILE_B doesn't have "bar" — only "baz"
    expect(result.summary.succeeded).toBe(1);
    expect(result.summary.failed).toBe(2);

    // FILE_A should have been modified
    const a = await Bun.file(FILE_A).text();
    expect(a).toContain("function renamedBar");

    // FILE_B should be unchanged
    const b = await Bun.file(FILE_B).text();
    expect(b).toContain("function baz");
  });
});

describe("editManySerial", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("processes files sequentially", async () => {
    const result = await editManySerial({
      files: [FILE_A, FILE_B, FILE_C],
      operation: "rename-symbol",
      oldName: "foo",
      newName: "value",
    });

    expect(result.summary.total).toBe(3);
    expect(result.summary.succeeded).toBe(3);

    for (const f of [FILE_A, FILE_B, FILE_C]) {
      const content = await Bun.file(f).text();
      expect(content).toContain("const value");
    }
  });

  test("serial mode handles failures without affecting subsequent files", async () => {
    const result = await editManySerial({
      files: [FILE_A, FILE_B, FILE_C],
      operation: "rename-symbol",
      oldName: "bar",
      newName: "renamed",
    });

    // Only FILE_A has "bar"
    expect(result.summary.succeeded).toBe(1);
    expect(result.summary.failed).toBe(2);
  });
});
