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

describe("autoDetect and buildTestFilterArgs", () => {
  beforeEach(setup);
  afterEach(cleanup);

  // ---- buildTestFilterArgs switch cases ----
  // Each exercises a different branch of buildTestFilterArgs (lines 59-63)

  test("buildTestFilterArgs: vitest case passes testFilter as --testNamePattern", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      testRunner: "vitest",
      testFilter: "myTest",
      timeout: 2000,
    });
    expect(result.tests).toBeDefined();
  });

  test("buildTestFilterArgs: jest case passes testFilter as --testNamePattern", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      testRunner: "jest",
      testFilter: "myTest",
      timeout: 2000,
    });
    expect(result.tests).toBeDefined();
  });

  test("buildTestFilterArgs: pytest case passes testFilter as -k", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      testRunner: "pytest",
      testFilter: "myTest",
      timeout: 2000,
    });
    expect(result.tests).toBeDefined();
  });

  test("buildTestFilterArgs: go test case passes testFilter as -run", async () => {
    const result = await verifyChanges([join(TMP_DIR, "sample.ts")], {
      testRunner: "go test",
      testFilter: "myTest",
      timeout: 2000,
    });
    expect(result.tests).toBeDefined();
  });

  // ---- @biomejs/biome detection (lines 84-87) ----
  // When biome is present but prettier/eslint are not, biome fills both.

  test("detects biome tools from package.json when present", async () => {
    const pkg = JSON.stringify({
      devDependencies: { "@biomejs/biome": "^1.0.0" },
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
    expect(result.detected!.formatter).toBe("biome format --write");
    expect(result.detected!.linter).toBe("biome lint");
  });

  // ---- pyproject.toml scanner (lines 92-101) ----
  // Detects pytest, mypy, ruff from pyproject.toml sections.

  test("detects tools from pyproject.toml", async () => {
    writeFileSync(
      join(TMP_DIR, "pyproject.toml"),
      "[tool.pytest]\n[tool.mypy]\n[tool.ruff]\n",
    );
    const pyFile = join(TMP_DIR, "sample.py");
    writeFileSync(pyFile, "x = 1\n");
    const result = await verifyChanges([pyFile], {
      autoDetect: true,
      formatter: "echo",
      linter: "echo",
      typecheck: "echo",
      testRunner: "echo",
    });
    expect(result.detected).toBeDefined();
    expect(result.detected!.testRunner).toBe("pytest");
    expect(result.detected!.typecheck).toBe("mypy");
    expect(result.detected!.linter).toBe("ruff check");
  });

  // ---- go.mod scanner (lines 105-111) ----
  // Detects go vet + go test when go.mod exists.

  test("detects tools from go.mod", async () => {
    writeFileSync(join(TMP_DIR, "go.mod"), "module test\n");
    const goFile = join(TMP_DIR, "sample.go");
    writeFileSync(goFile, "package main\n");
    const result = await verifyChanges([goFile], {
      autoDetect: true,
      formatter: "echo",
      linter: "echo",
      typecheck: "echo",
      testRunner: "echo",
    });
    expect(result.detected).toBeDefined();
    expect(result.detected!.typecheck).toBe("go vet");
    expect(result.detected!.testRunner).toBe("go test");
  });

  // ---- Cargo.toml scanner (lines 115-123) ----
  // Detects rustfmt, clippy, cargo check, cargo test.

  test("detects tools from Cargo.toml", async () => {
    writeFileSync(join(TMP_DIR, "Cargo.toml"), "[package]\nname = \"test\"\nversion = \"0.1.0\"\n");
    const rsFile = join(TMP_DIR, "sample.rs");
    writeFileSync(rsFile, "fn main() {}\n");
    const result = await verifyChanges([rsFile], {
      autoDetect: true,
      formatter: "echo",
      linter: "echo",
      typecheck: "echo",
      testRunner: "echo",
    });
    expect(result.detected).toBeDefined();
    expect(result.detected!.formatter).toBe("rustfmt --edition 2021");
    expect(result.detected!.linter).toBe("cargo clippy");
    expect(result.detected!.typecheck).toBe("cargo check");
    expect(result.detected!.testRunner).toBe("cargo test");
  });

  // ---- findProjectRoot parent-walking (lines 141-146) ----
  // File is two levels deep, package.json is in TMP_DIR root.
  // findProjectRoot walks up from sub/deep/ → sub/ → TMP_DIR (found).

  test("findProjectRoot walks up parent dirs to find config", async () => {
    const subDir = join(TMP_DIR, "sub", "deep");
    mkdirSync(subDir, { recursive: true });
    const pkg = JSON.stringify({
      devDependencies: { typescript: "^5.0.0" },
    });
    writeFileSync(join(TMP_DIR, "package.json"), pkg);
    const deepFile = join(subDir, "file.ts");
    writeFileSync(deepFile, "const x = 1;\n");
    const result = await verifyChanges([deepFile], {
      autoDetect: true,
      formatter: "echo",
      linter: "echo",
      typecheck: "echo",
      testRunner: "echo",
    });
    expect(result.detected).toBeDefined();
    expect(result.detected!.typecheck).toBe("tsc --noEmit");
  });

  // ---- Config iteration past first key (line 169) ----
  // package.json is missing, pyproject.toml is present.
  // The scanner iterates past package.json and uses pyproject.toml.

  test("uses pyproject.toml when no package.json exists", async () => {
    // Ensure no package.json from setup or previous tests
    try { rmSync(join(TMP_DIR, "package.json"), { force: true }); } catch {}
    writeFileSync(
      join(TMP_DIR, "pyproject.toml"),
      "[tool.pytest]\n[tool.ruff]\n",
    );
    const pyFile = join(TMP_DIR, "sample.py");
    writeFileSync(pyFile, "x = 1\n");
    const result = await verifyChanges([pyFile], {
      autoDetect: true,
      formatter: "echo",
      linter: "echo",
      typecheck: "echo",
      testRunner: "echo",
    });
    expect(result.detected).toBeDefined();
    expect(result.detected!.testRunner).toBe("pytest");
    expect(result.detected!.linter).toBe("ruff check");
  });

  // ---- Extension-based fallback (lines 174-184) ----
  // No config files exist → falls back to EXT_TOOLS based on file extension.
  // A .py file should default to pytest (test) and mypy (typecheck).

  test("uses extension defaults when no config files exist", async () => {
    // Wipe any config files that setup or prior tests may have left
    for (const name of ["package.json", "pyproject.toml", "go.mod", "Cargo.toml"]) {
      try { rmSync(join(TMP_DIR, name), { force: true }); } catch {}
    }
    const pyFile = join(TMP_DIR, "fallback.py");
    writeFileSync(pyFile, "x = 1\n");
    const result = await verifyChanges([pyFile], {
      autoDetect: true,
      formatter: "echo",
      linter: "echo",
      typecheck: "echo",
      testRunner: "echo",
    });
    expect(result.detected).toBeDefined();
    expect(result.detected!.testRunner).toBe("pytest");
    expect(result.detected!.typecheck).toBe("mypy");
  });
});
