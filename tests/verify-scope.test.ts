/**
 * Issue #24 — scoped test runs, baseline comparison, timeout as its own
 * outcome, and pipe-deadlock safety.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { buildTestInvocation, parseFailures } from "../src/core/verify-scope";
import { verifyChanges, recordVerifyBaseline } from "../src/core/verify";
import { exitCodeFor } from "../src/core/exit-codes";

const TMP = join(import.meta.dir, "__tmp_verify_scope__");

function sh(cmd: string[], cwd: string): void {
  const proc = Bun.spawnSync(cmd, { cwd, stdout: "ignore", stderr: "ignore" });
  if (proc.exitCode !== 0) throw new Error(`${cmd.join(" ")} failed in ${cwd}`);
}

describe("buildTestInvocation (issue #24, scoping)", () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });
  afterEach(() => rmSync(TMP, { recursive: true, force: true }));

  test("jest uses --findRelatedTests and reports scoped", () => {
    const inv = buildTestInvocation("jest", ["src/a.ts"], TMP);
    expect(inv.scoped).toBe(true);
    expect(inv.args).toEqual(["--findRelatedTests", "src/a.ts"]);
    expect(inv.reason).toContain("findRelatedTests");
  });

  test("vitest uses a single --related= argument", () => {
    const inv = buildTestInvocation("vitest", ["src/a.ts", "src/b.ts"], TMP);
    expect(inv.scoped).toBe(true);
    expect(inv.args).toEqual(["--related=src/a.ts,src/b.ts"]);
  });

  test("bun test scopes to changed test files", () => {
    const f = join(TMP, "a.test.ts");
    writeFileSync(f, "");
    const inv = buildTestInvocation("bun test", [f], TMP);
    expect(inv.scoped).toBe(true);
    expect(inv.args).toEqual([f]);
  });

  test("bun test falls back to the full suite and says so when no test file relates", () => {
    const f = join(TMP, "lonely.ts");
    writeFileSync(f, "export const x = 1;\n");
    const inv = buildTestInvocation("bun test", [f], TMP);
    expect(inv.scoped).toBe(false);
    expect(inv.reason).toContain("full");
  });

  test("bun test finds a sibling .test.ts for a changed source file", () => {
    writeFileSync(join(TMP, "widget.ts"), "export const x = 1;\n");
    writeFileSync(join(TMP, "widget.test.ts"), "");
    const inv = buildTestInvocation("bun test", [join(TMP, "widget.ts")], TMP);
    expect(inv.scoped).toBe(true);
    expect(inv.args).toEqual([join(TMP, "widget.test.ts")]);
  });

  test("pytest scopes to changed test files", () => {
    const f = join(TMP, "test_thing.py");
    writeFileSync(f, "");
    const inv = buildTestInvocation("pytest", [f], TMP);
    expect(inv.scoped).toBe(true);
    expect(inv.args).toEqual([f]);
  });

  test("go test scopes to the packages of the changed files, not ./...", () => {
    const inv = buildTestInvocation("go test", ["pkg/a/x.go", "pkg/a/y.go", "pkg/b/z.go"], TMP);
    expect(inv.scoped).toBe(true);
    expect(inv.cmd).toBe("go test");
    expect(inv.args).toEqual(["./pkg/a", "./pkg/b"]);
  });

  test("cargo test scopes integration targets and refuses to pretend for src/ changes", () => {
    const scoped = buildTestInvocation("cargo test", ["tests/api.rs"], TMP);
    expect(scoped.args).toEqual(["--test", "api"]);

    const unscoped = buildTestInvocation("cargo test", ["src/lib.rs"], TMP);
    expect(unscoped.scoped).toBe(false);
    expect(unscoped.cmd).toBe("cargo test");
  });

  test("scoping can be turned off explicitly, and go test then gets ./...", () => {
    const inv = buildTestInvocation("go test", ["pkg/a/x.go"], TMP, { scope: false });
    expect(inv.scoped).toBe(false);
    expect(inv.cmd).toBe("go test ./...");
  });
});

describe("parseFailures (issue #24)", () => {
  test("bun test", () => {
    const out = "(pass) adds [1.00ms]\n(fail) subtracts [2.00ms]\n 1 pass\n 1 fail\n";
    expect(parseFailures("bun test", out)).toEqual(["subtracts"]);
  });

  test("go test", () => {
    expect(parseFailures("go test", "--- FAIL: TestFoo (0.00s)\nFAIL\n")).toEqual(["TestFoo"]);
  });

  test("pytest", () => {
    const out = "=== short test summary info ===\nFAILED tests/test_a.py::test_x - AssertionError\n";
    expect(parseFailures("pytest", out)).toEqual(["tests/test_a.py::test_x"]);
  });

  test("cargo test", () => {
    expect(parseFailures("cargo test", "test api::works ... FAILED\ntest result: FAILED\n")).toEqual([
      "api::works",
    ]);
  });

  test("unrecognised output returns null rather than an empty failure list", () => {
    // An empty list would read as "nothing failed", which is the answer that
    // suppresses a real regression during baseline comparison.
    expect(parseFailures("bun test", "some unrelated text")).toBeNull();
    expect(parseFailures("mocha", "1 failing")).toBeNull();
  });
});

describe("baseline comparison (issue #24)", () => {
  const REPO = join(import.meta.dir, "__tmp_verify_baseline__");
  const passing = () => join(REPO, "good.test.ts");
  const broken = () => join(REPO, "broken.test.ts");
   // These scenarios share the enclosing repo's commit, so without isolation they
   // resolve to one global cache entry: a sibling test or a stale entry from a
   // prior run would then suppress a later test's regression. Point the cache at a
   // per-run dir and start every test from an empty cache.
  const BASELINE_DIR = join(import.meta.dir, "__tmp_verify_baseline_cache__");
   const BASELINE_ENV = "HASHPILOT_VERIFY_BASELINE_DIR";

   beforeEach(() => {
     process.env[BASELINE_ENV] = BASELINE_DIR;
     rmSync(BASELINE_DIR, { recursive: true, force: true });
     rmSync(REPO, { recursive: true, force: true });
     mkdirSync(REPO, { recursive: true });
    writeFileSync(
      passing(),
      'import { test, expect } from "bun:test";\ntest("hp_good", () => { expect(1).toBe(1); });\n'
    );
    // Pre-existing failure: nothing the agent did.
    writeFileSync(
      broken(),
      'import { test, expect } from "bun:test";\ntest("hp_preexisting", () => { expect(1).toBe(2); });\n'
    );
    sh(["git", "init", "-q"], REPO);
    sh(["git", "add", "-A"], REPO);
    sh(["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], REPO);
  });
  afterEach(() => {
    rmSync(REPO, { recursive: true, force: true });
     rmSync(BASELINE_DIR, { recursive: true, force: true });
     delete process.env[BASELINE_ENV];
     });

  test("a pre-existing failure does not fail an unrelated correct edit", async () => {
    const files = [passing(), broken()];
    const rec = await recordVerifyBaseline(files, { testRunner: "bun test" });
    expect(rec.recorded).toBe(true);
    expect(rec.failures).toContain("hp_preexisting");

    const result = await verifyChanges(files, { testRunner: "bun test", useBaseline: true });
    expect(result.baseline?.comparable).toBe(true);
    expect(result.baseline?.newFailures).toEqual([]);
    expect(result.overall).toBe("pass");
  }, 30000);

  test("breaking a different test still fails, baseline or not", async () => {
    const files = [passing(), broken()];
    await recordVerifyBaseline(files, { testRunner: "bun test" });

    writeFileSync(
      passing(),
      'import { test, expect } from "bun:test";\ntest("hp_good", () => { expect(1).toBe(3); });\n'
    );

    const result = await verifyChanges(files, { testRunner: "bun test", useBaseline: true });
    expect(result.baseline?.newFailures).toEqual(["hp_good"]);
    expect(result.overall).toBe("fail");
    expect(exitCodeFor(result as any)).toBe(4);
  }, 30000);

  test("the baseline is cached per commit SHA", async () => {
    const files = [passing(), broken()];
    const first = await recordVerifyBaseline(files, { testRunner: "bun test" });
    expect(first.recorded).toBe(true);
    const second = await recordVerifyBaseline(files, { testRunner: "bun test" });
    expect(second.recorded).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.commit).toBe(first.commit!);
  }, 30000);

  test("without a baseline, every failure counts", async () => {
    const result = await verifyChanges([broken()], { testRunner: "bun test", useBaseline: true });
    expect(result.baseline?.comparable).toBe(false);
    expect(result.overall).toBe("fail");
  }, 30000);
});

describe("timeout and large output (issue #24)", () => {
  const DIR = join(import.meta.dir, "__tmp_verify_proc__");

  beforeEach(() => {
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, "sample.ts"), "export const x = 1;\n");
  });
  afterEach(() => rmSync(DIR, { recursive: true, force: true }));

  test("a timeout is its own outcome, never a pass, and never reverts", async () => {
    const file = join(DIR, "sample.ts");
    const edited = "export const x = 2;\n";
    writeFileSync(file, edited);

    const slow = join(DIR, "slow.js");
writeFileSync(slow, "setTimeout(() => {}, 30000);\n");
// verify-changes appends the changed file as an operand, so the mock
// must tolerate extra args: `sleep 30 sample.ts` exits in error on
// macOS instead of sleeping, masking the timeout path under test.
 const result = await verifyChanges([file], {
      formatter: `node ${slow}`,
      allowArbitraryTool: true,
      timeout: 500,
      revertOnFailure: true,
    });

    expect(result.overall).toBe("timeout");
    expect(result.timedOut).toEqual(["formatter"]);
    expect(result.errorCode).toBe("VERIFY_TIMEOUT");
    expect(result.formatter?.passed).toBe(false);
    // The destructive half of #24: a slow tool must not delete the edit.
    expect(result.revertedFiles).toBeUndefined();
    expect(await Bun.file(file).text()).toBe(edited);
  }, 30000);

  test("a child emitting >1 MB on both streams does not deadlock", async () => {
    const script = join(DIR, "loud.js");
    writeFileSync(
      script,
      `const chunk = "x".repeat(64 * 1024);
for (let i = 0; i < 24; i++) { process.stdout.write(chunk); process.stderr.write(chunk); }
process.exit(0);
`
    );

    const started = Date.now();
    const result = await verifyChanges([join(DIR, "sample.ts")], {
      formatter: `node ${script}`,
      allowArbitraryTool: true,
      timeout: 20000,
    });
    const elapsed = Date.now() - started;

    expect(result.formatter?.passed).toBe(true);
    expect(result.formatter?.truncated).toBe(true);
    expect(result.formatter?.output).toContain("output truncated at 256KB");
    // Deadlock would burn the whole 20s timeout and come back as timedOut.
    expect(result.overall).toBe("pass");
    expect(elapsed).toBeLessThan(15000);
  }, 30000);
});
