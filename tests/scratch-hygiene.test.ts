import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

// #110: `bun test` used to leave `tests/__tmp_intent_tests__/` and `tests/tmp/`
// behind, so every run dirtied the working copy and the next run started from
// stale fixtures. The guard is functional: run the owning test files in a child
// process and assert the scratch trees are gone when it exits. .gitignore
// covers the same roots as a backstop for a run that dies before afterAll fires.

const REPO_ROOT = resolve(import.meta.dir, "..");

async function runTestFile(file: string): Promise<number> {
  const proc = Bun.spawn(["bun", "test", file], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HASHPILOT_TELEMETRY: "0" },
  });
  return await proc.exited;
}

describe("test scratch hygiene (#110)", () => {
  it("intent tests leave no scratch tree under tests/", async () => {
    await runTestFile("tests/intent.test.ts");
    expect(existsSync(join(REPO_ROOT, "tests/__tmp_intent_tests__"))).toBe(false);
    expect(existsSync(join(REPO_ROOT, "tests/__tmp_b15__"))).toBe(false);
  }, 120_000);

  it("locking tests leave no tests/tmp tree behind", async () => {
    await runTestFile("tests/cas-locking.test.ts");
    expect(existsSync(join(REPO_ROOT, "tests/tmp/cas-locking"))).toBe(false);
    expect(existsSync(join(REPO_ROOT, "tests/tmp"))).toBe(false);
  }, 120_000);

  it("gitignore covers both scratch roots", () => {
    const ignore = readFileSync(join(REPO_ROOT, ".gitignore"), "utf8");
    expect(ignore).toContain("tests/__tmp_*/");
    expect(ignore).toContain("tests/tmp/");
  });
});
