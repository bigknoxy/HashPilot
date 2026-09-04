import { describe, test, expect, afterAll } from "bun:test";
import { join } from "path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";

// #145 (B56): on a platform with no usable tree-sitter native binding (no
// prebuild, e.g. linux-arm64, or a from-source build that failed), the
// top-level `import Parser from "tree-sitter"` that used to sit at the top
// of src/core/ast-edit.ts threw at *module load* — before any try/catch in
// the file could run — crashing every command, including ones that never
// touch AST at all (`--version`, `doctor`, `config`, `read-many`, ...) with a
// raw stack trace instead of a JSON envelope.
//
// The fix makes the tree-sitter imports lazy (`require()` inside
// `getParser()`'s try/catch, with only a type-only `import type Parser`
// surviving at the top of the file). This file proves the degraded-not-
// crashed behavior end to end, using tests/fixtures/tree-sitter-absent-preload.ts
// (loaded via `bun --preload`) to simulate the missing binding without
// requiring an actual arm64 runner.

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const PRELOAD = join(import.meta.dir, "fixtures", "tree-sitter-absent-preload.ts");
const dirs: string[] = [];

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "hp-parser-absent-"));
  dirs.push(dir);
  return dir;
}

/** Run the real CLI in a subprocess with tree-sitter's module resolution stubbed to throw. */
async function runWithBrokenParser(args: string[]) {
  const proc = Bun.spawn(["bun", "--preload", PRELOAD, CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { stdout, stderr, code: await proc.exited };
}

afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("degraded (not crashed) behavior with no usable tree-sitter binding (#145)", () => {
  test("--version still works and prints a bare version, no envelope needed, no stack trace", async () => {
    const { stdout, stderr, code } = await runWithBrokenParser(["--version"]);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(stderr).not.toContain("ERR_DLOPEN_FAILED");
    expect(stderr).not.toContain("No native build was found");
  });

  test("config succeeds — it needs no parser", async () => {
    const { stdout, stderr, code } = await runWithBrokenParser(["config"]);
    expect(code).toBe(0);
    const env = JSON.parse(stdout);
    expect(env.ok).toBe(true);
    expect(stderr).toBe("");
  });

  test("changesets succeeds — it needs no parser", async () => {
    const { stdout, stderr, code } = await runWithBrokenParser(["changesets"]);
    expect(code).toBe(0);
    const env = JSON.parse(stdout);
    expect(env.ok).toBe(true);
    expect(stderr).toBe("");
  });

  test("read-many succeeds — it needs no parser", async () => {
    const dir = scratchDir();
    const file = join(dir, "a.txt");
    writeFileSync(file, "hello\n");
    const { stdout, stderr, code } = await runWithBrokenParser(["read-many", file]);
    expect(code).toBe(0);
    const env = JSON.parse(stdout);
    expect(env.ok).toBe(true);
    expect(stderr).toBe("");
  });

  test("grep-many succeeds — it needs no parser", async () => {
    const dir = scratchDir();
    writeFileSync(join(dir, "a.txt"), "needle\n");
    const { stdout, stderr, code } = await runWithBrokenParser(["grep-many", "needle", dir]);
    expect(code).toBe(0);
    const env = JSON.parse(stdout);
    expect(env.ok).toBe(true);
    expect(stderr).toBe("");
  });

  test("doctor reports ast-parsers: fail cleanly, with a real reason, and exits non-zero — it does not crash itself", async () => {
    const { stdout, stderr, code } = await runWithBrokenParser(["doctor"]);
    expect(stderr).toBe("");
    const env = JSON.parse(stdout);
    expect(env.apiVersion).toBe("1");
    expect(env.ok).toBe(false);
    expect(code).not.toBe(0);
    expect(env.data.healthy).toBe(false);

    const astCheck = env.data.checks.find((c: { name: string }) => c.name === "ast-parsers");
    expect(astCheck.status).toBe("fail");
    expect(astCheck.message).toContain("simulated");

    expect(env.data.parsers).toHaveLength(6);
    for (const p of env.data.parsers) {
      expect(p.loaded).toBe(false);
      expect(p.error).toBeTruthy();
    }
  });

  test("an AST operation fails with a stable error code and no stack trace, instead of crashing", async () => {
    const dir = scratchDir();
    const file = join(dir, "a.js");
    writeFileSync(file, "function foo() { return 1; }\n");

    const { stdout, stderr, code } = await runWithBrokenParser(["ast", "rename-symbol", file, "foo", "bar"]);
    expect(stderr).toBe("");
    expect(code).not.toBe(0);

    const env = JSON.parse(stdout);
    expect(env.apiVersion).toBe("1");
    expect(env.ok).toBe(false);
    expect(env.error).toBeTruthy();
    expect(env.error.code).toBeTruthy();
  });
});
