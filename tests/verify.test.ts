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

  // Existing tests — unchanged behavior
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

  // New tests — typechecking
  test("runs typecheck when specified", async () => {
    // Use echo as a mock typecheck that passes
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      typecheck: "echo",
    });
    expect(result.typecheck).toBeDefined();
    expect(result.typecheck!.passed).toBe(true);
  });

  test("reports typecheck failure", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      typecheck: "nonexistent-typechecker-tool-xyz",
    });
    expect(result.typecheck).toBeDefined();
    expect(result.typecheck!.passed).toBe(false);
    expect(result.overall).toBe("fail");
  });

  // New tests — overall verdict
  test("overall pass when all checks pass", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      formatter: "echo",
      linter: "echo",
    });
    expect(result.overall).toBe("pass");
  });

  test("overall fail when any check fails", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      formatter: "echo",
      linter: "nonexistent-linter-tool",
    });
    expect(result.overall).toBe("fail");
  });

  // Revert-on-failure
  test("revert-on-failure restores original content after failed check", async () => {
    const filePath = join(TMP_DIR, "sample.ts");
    const originalContent = await Bun.file(filePath).text();

    // Write something different first (simulating a pre-edit state to restore to)
    // Our verify snapshot captures the current state, so if we set revertOnFailure
    // and a check fails, it restores to what was snapshotted.
    const result = await verifyChanges([filePath], {
      linter: "nonexistent-linter-tool",
      revertOnFailure: true,
    });

    expect(result.overall).toBe("fail");
    expect(result.revertedFiles).toBeDefined();
    expect(result.revertedFiles).toContain(filePath);

    const restored = await Bun.file(filePath).text();
    expect(restored).toBe(originalContent);
  });

  test("no revert when all checks pass", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      formatter: "echo",
      revertOnFailure: true,
    });
    expect(result.overall).toBe("pass");
    expect(result.revertedFiles).toBeUndefined();
  });

  // Timeout
  test("timeout kills slow process", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      formatter: "sleep 10",
      timeout: 500,
    });
    expect(result.formatter).toBeDefined();
    expect(result.formatter!.passed).toBe(false);
    expect(result.overall).toBe("fail");
  });

  // Auto-detection from package.json
  test("auto-detects tools from package.json", async () => {
    const pkg = JSON.stringify({
      devDependencies: { vitest: "^1.0.0", typescript: "^5.0.0", prettier: "^3.0.0" },
    });
    writeFileSync(join(TMP_DIR, "package.json"), pkg);

    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      autoDetect: true,
      formatter: "echo",
      linter: "echo",
      typecheck: "echo",
      testRunner: "echo",  // Override detected vitest to avoid slow npx
    });

    expect(result.detected).toBeDefined();
    expect(result.detected!.testRunner).toBe("vitest");
    expect(result.detected!.typecheck).toBe("tsc --noEmit");
  });

  // Test-runner command mapping
  test("uses testRunner when specified", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      testRunner: "echo",
      testFilter: "myTest",
    });
    expect(result.tests).toBeDefined();
  });

  // testArgs are passed through
  test("passes testArgs to runner", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      testRunner: "echo",
      testArgs: ["hello"],
    });
    expect(result.tests).toBeDefined();
  });

  // detected report in result
  test("includes detected report when autoDetect is enabled", async () => {
    const pkg = JSON.stringify({
      devDependencies: { jest: "^29.0.0" },
    });
    writeFileSync(join(TMP_DIR, "package.json"), pkg);

    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      autoDetect: true,
      formatter: "echo",
      linter: "echo",
      typecheck: "echo",
      testRunner: "echo",
    });

    expect(result.detected).toBeDefined();
    expect(result.detected!.testRunner).toBe("jest");
  });
});
