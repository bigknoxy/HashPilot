// New test — overall should be "skipped" when no checks are specified
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { verifyChanges } from "../src/core/verify";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const TMP_DIR = join(import.meta.dir, "__tmp_test_no_checks__");

function setup() {
  try { mkdirSync(TMP_DIR, { recursive: true }); } catch {}
  writeFileSync(join(TMP_DIR, "sample.ts"), "const x = 1;\n");
}

function cleanup() {
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

describe("verifyChanges — no checks ran", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("overall is 'skipped' when no checks specified", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")]);
    expect(result.overall).toBe("skipped");
  });

  test("overall is 'skipped' when all check options are undefined", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      formatter: undefined as any,
      linter: undefined as any,
      typecheck: undefined as any,
      testRunner: undefined as any,
      testFilter: undefined as any,
      allowArbitraryTool: false,
    });
    expect(result.overall).toBe("skipped");
  });
});
