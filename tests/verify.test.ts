import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { verifyChanges } from "../src/core/verify";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const TMP_DIR = join(import.meta.dir, "__tmp_test_verify__");

function setup() {
  try { mkdirSync(TMP_DIR, { recursive: true }); } catch {}
  writeFileSync(join(TMP_DIR, "sample.ts"), "const x = 1;\n");
}

function cleanup() {
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

describe("verifyChanges", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("computes file hashes", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")]);
    expect(result.fileHashes[join(TMP_DIR, "sample.ts")]).toBeTruthy();
    expect(result.overall).toBeDefined();
  });

  test("skips formatter/linter when not specified", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")]);
    expect(result.formatter).toBeUndefined();
    expect(result.linter).toBeUndefined();
  });

  test("reports failure for unavailable formatter", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      formatter: "nonexistent-formatter-tool-xyz",
    });
    expect(result.formatter).toBeDefined();
    expect(result.formatter!.passed).toBe(false);
  });
});