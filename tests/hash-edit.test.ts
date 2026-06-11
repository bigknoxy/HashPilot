import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { computeHash, computeLineHash, readMany, readHash } from "../src/core/read";
import { replaceHash } from "../src/core/hash-edit";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TMP_DIR = join(import.meta.dir, "__tmp_test_hash__");

function setup() {
  try { mkdirSync(TMP_DIR, { recursive: true }); } catch {}
  writeFileSync(join(TMP_DIR, "sample.ts"), [
    "import { foo } from './bar';",
    "",
    "function hello() {",
    "  console.log('hello');",
    "}",
    "",
    "function world() {",
    "  return 42;",
    "}",
  ].join("\n"));
  writeFileSync(join(TMP_DIR, "other.ts"), [
    "export const x = 1;",
    "export const y = 2;",
  ].join("\n"));
}

function cleanup() {
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

describe("computeHash", () => {
  test("produces consistent 12-char hex hash", () => {
    const h = computeHash("hello world");
    expect(h.length).toBe(12);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });

  test("different content produces different hashes", () => {
    expect(computeHash("a")).not.toBe(computeHash("b"));
  });

  test("same content produces same hash", () => {
    expect(computeHash("test")).toBe(computeHash("test"));
  });
});

describe("computeLineHash", () => {
  test("produces 8-char hex hash", () => {
    const h = computeLineHash("  const x = 1;");
    expect(h.length).toBe(8);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("readMany", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("reads multiple files with hashes", async () => {
    const results = await readMany([
      join(TMP_DIR, "sample.ts"),
      join(TMP_DIR, "other.ts"),
    ]);
    expect(results.length).toBe(2);
    expect(results[0].path).toContain("sample.ts");
    expect(results[0].hash).toBeTruthy();
    expect(results[0].lines).toBeGreaterThan(0);
    expect(results[0].content).toContain("hello");
    expect(results[1].content).toContain("export const x");
  });

  test("handles missing files gracefully", async () => {
    const results = await readMany([join(TMP_DIR, "nonexistent.ts")]);
    expect(results.length).toBe(1);
    expect(results[0].error).toBeTruthy();
  });
});

describe("readHash", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("reads a line with hash and context", async () => {
    const result = await readHash(join(TMP_DIR, "sample.ts"), 3);
    expect(result.error).toBeFalsy();
    expect(result.line).toBe(3);
    expect(result.content).toBe("function hello() {");
    expect(result.lineHash).toBeTruthy();
    expect(result.contextBefore.length).toBeGreaterThan(0);
  });

  test("returns error for out-of-range line", async () => {
    const result = await readHash(join(TMP_DIR, "sample.ts"), 999);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("out of range");
  });
});

describe("replaceHash", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("replaces content matching the hash", async () => {
    const fp = join(TMP_DIR, "sample.ts");
    const content = await Bun.file(fp).text();
    const hash = computeHash(content);
    const newContent = "// replaced\n" + content;
    const result = await replaceHash(fp, hash, newContent);
    expect(result.success).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.linesChanged).toBeGreaterThan(0);
    const updated = await Bun.file(fp).text();
    expect(updated).toContain("// replaced");
  });

  test("rejects stale hash with noRecovery option", async () => {
    const fp = join(TMP_DIR, "sample.ts");
    const result = await replaceHash(fp, "badhash12345", "// new content", { noRecovery: true });
    expect(result.success).toBe(false);
    expect(result.stale).toBe(true);
    expect(result.retries).toBe(0);
  });

  test("replaces with range", async () => {
    const fp = join(TMP_DIR, "other.ts");
    const content = await Bun.file(fp).text();
    const lines = content.split("\n");
    const rangeContent = lines.slice(0, 1).join("\n");
    const rangeHash = computeHash(rangeContent);
    const result = await replaceHash(fp, rangeHash, "export const x = 99;", {
      range: { start: 1, end: 1 },
    });
    expect(result.success).toBe(true);
    const updated = await Bun.file(fp).text();
    expect(updated).toContain("export const x = 99");
  });

  test("dry run does not modify file", async () => {
    const fp = join(TMP_DIR, "sample.ts");
    const original = await Bun.file(fp).text();
    const hash = computeHash(original);
    const result = await replaceHash(fp, hash, "// dry run", { dryRun: true });
    expect(result.success).toBe(true);
    expect(result.message).toContain("Dry run");
    const after = await Bun.file(fp).text();
    expect(after).toBe(original);
  });

  test("auto-recovers from stale hash when file changed externally", async () => {
    const fp = join(TMP_DIR, "sample.ts");
    const content = await Bun.file(fp).text();
    const oldHash = computeHash(content);

    // Modify the file externally (simulates AST operation modifying the file)
    await Bun.write(fp, "// added by AST\n" + content);

    // replace-hash with the OLD hash should auto-recover:
    // newContent replaces the entire file (no range), so the external modification is replaced too
    const newContent = content.replace(/hello/g, "world");
    const result = await replaceHash(fp, oldHash, newContent);
    expect(result.success).toBe(true);
    expect(result.retries).toBe(1);
    expect(result.message).toContain("auto-recovered");

    const updated = await Bun.file(fp).text();
    expect(updated).toBe(newContent);  // Full file replaced via auto-recovery
    expect(updated).toContain("world");
    expect(updated).not.toContain("hello");
  });

  test("noRecovery option returns stale error instead of auto-recovering", async () => {
    const fp = join(TMP_DIR, "sample.ts");
    const content = await Bun.file(fp).text();
    const oldHash = computeHash(content);

    // Modify the file externally
    await Bun.write(fp, "// modified\n" + content);

    // With noRecovery, should return stale error
    const result = await replaceHash(fp, oldHash, "new content", { noRecovery: true });
    expect(result.success).toBe(false);
    expect(result.stale).toBe(true);
    expect(result.retries).toBe(0);
  });

  test("retries is 0 on successful match", async () => {
    const fp = join(TMP_DIR, "sample.ts");
    const content = await Bun.file(fp).text();
    const hash = computeHash(content);
    const result = await replaceHash(fp, hash, "// replaced\n" + content);
    expect(result.success).toBe(true);
    expect(result.retries).toBe(0);
  });
});