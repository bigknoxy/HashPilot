import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { computeHash, computeLineHash, readMany, readHash } from "../src/core/read";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const TMP_DIR = join(import.meta.dir, "__tmp_test_read__");

describe("computeHash", () => {
  test("returns consistent hash for same content", () => {
    const hash1 = computeHash("hello world");
    const hash2 = computeHash("hello world");
    expect(hash1).toBe(hash2);
  });

  test("returns different hash for different content", () => {
    const hash1 = computeHash("hello world");
    const hash2 = computeHash("goodbye world");
    expect(hash1).not.toBe(hash2);
  });

  test("returns a 12-character hex string", () => {
    const hash = computeHash("anything");
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("computeLineHash", () => {
  test("returns non-empty string for a line", () => {
    const hash = computeLineHash("const x = 1;");
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  test("returns consistent hash for same line", () => {
    const hash1 = computeLineHash("hello");
    const hash2 = computeLineHash("hello");
    expect(hash1).toBe(hash2);
  });

  test("returns an 8-character hex string", () => {
    const hash = computeLineHash("anything");
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("readMany", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test("reads files and returns content with hash", async () => {
    const filePath = join(TMP_DIR, "test.txt");
    writeFileSync(filePath, "hello world\n");

    const results = await readMany([filePath]);
    expect(results.length).toBe(1);
    expect(results[0].path).toBe(filePath);
    expect(results[0].content).toBe("hello world\n");
    expect(results[0].hash).toBeTruthy();
    expect(results[0].lines).toBe(1);
    expect(results[0].error).toBeUndefined();
  });

  test("handles multiple files", async () => {
    const fileA = join(TMP_DIR, "a.txt");
    const fileB = join(TMP_DIR, "b.txt");
    writeFileSync(fileA, "alpha\n");
    writeFileSync(fileB, "beta\n");

    const results = await readMany([fileA, fileB]);
    expect(results.length).toBe(2);
    expect(results[0].content).toBe("alpha\n");
    expect(results[1].content).toBe("beta\n");
    expect(results[0].hash).not.toBe(results[1].hash);
  });

  test("handles non-existent file with error", async () => {
    const results = await readMany(["/tmp/nonexistent-xyz-123"]);
    expect(results.length).toBe(1);
    expect(results[0].error).toBeDefined();
    expect(results[0].error!.length).toBeGreaterThan(0);
    expect(results[0].content).toBe("");
    expect(results[0].hash).toBe("");
    expect(results[0].lines).toBe(0);
  });

  test("computes correct line count", async () => {
    const filePath = join(TMP_DIR, "lines.txt");
    writeFileSync(filePath, "a\nb\nc\n");

    const results = await readMany([filePath]);
    expect(results[0].lines).toBe(3);
  });

  test("handles empty file", async () => {
    const filePath = join(TMP_DIR, "empty.txt");
    writeFileSync(filePath, "");

    const results = await readMany([filePath]);
    expect(results[0].content).toBe("");
    // "" split by "\n" returns [""], so lines = 1 - 0 = 1
    expect(results[0].lines).toBe(1);
    expect(results[0].hash).toBeTruthy();
  });
});

describe("readHash", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test("returns error for non-existent file", async () => {
    const result = await readHash("/tmp/nonexistent-xyz-123", 1);
    expect(result.error).toBeDefined();
    expect(result.error!.length).toBeGreaterThan(0);
    expect(result.content).toBe("");
    expect(result.lineHash).toBe("");
    expect(result.contextHash).toBe("");
    expect(result.contextBefore).toEqual([]);
    expect(result.contextAfter).toEqual([]);
  });

  test("returns error for out-of-range line", async () => {
    const filePath = join(TMP_DIR, "short.txt");
    writeFileSync(filePath, "only one line\n");

    const result = await readHash(filePath, 99);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("out of range");
    expect(result.content).toBe("");
  });

  test("reads a specific line with context", async () => {
    const filePath = join(TMP_DIR, "ten_lines.txt");
    const lines: string[] = [];
    for (let i = 1; i <= 10; i++) {
      lines.push(`line ${i}`);
    }
    writeFileSync(filePath, lines.join("\n") + "\n");

    const result = await readHash(filePath, 5, 2);
    expect(result.path).toBe(filePath);
    expect(result.line).toBe(5);
    expect(result.content).toBe("line 5");
    expect(result.lineHash).toMatch(/^[0-9a-f]{8}$/);
    expect(result.contextHash).toBeTruthy();
    expect(result.contextBefore).toEqual(["line 3", "line 4"]);
    expect(result.contextAfter).toEqual(["line 6", "line 7"]);
  });

  test("handles minimal context (0 context lines)", async () => {
    const filePath = join(TMP_DIR, "three_lines.txt");
    writeFileSync(filePath, "first\nsecond\nthird\n");

    const result = await readHash(filePath, 2, 0);
    expect(result.content).toBe("second");
    expect(result.contextBefore).toEqual([]);
    expect(result.contextAfter).toEqual([]);
  });

  test("clamps context at file boundaries (first line)", async () => {
    const filePath = join(TMP_DIR, "boundary.txt");
    writeFileSync(filePath, "alpha\nbeta\ncharlie\ndelta\n");

    const result = await readHash(filePath, 1, 2);
    expect(result.content).toBe("alpha");
    expect(result.contextBefore).toEqual([]);
    expect(result.contextAfter).toEqual(["beta", "charlie"]);
  });

  test("clamps context at file boundaries (last line)", async () => {
    const filePath = join(TMP_DIR, "boundary_last.txt");
    // No trailing newline so split doesn't add an empty final element
    writeFileSync(filePath, "alpha\nbeta\ncharlie\ndelta");

    const result = await readHash(filePath, 4, 2);
    expect(result.content).toBe("delta");
    expect(result.contextBefore).toEqual(["beta", "charlie"]);
    expect(result.contextAfter).toEqual([]);
  });
});
