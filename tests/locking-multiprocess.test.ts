import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { acquireLock, lockPathFor, pruneStaleLocks, LockAcquireError } from "../src/core/locking";

// Every defect these tests cover was invisible to a single-process, same-cwd
// suite: the lock only fails to exclude when a second *process* is involved, or
// when the two callers disagree about the current working directory.

const TEST_DIR = resolve("tests/tmp/locking-mp");
const NESTED_DIR = join(TEST_DIR, "pkg", "deep");
const LOCKING_MODULE = resolve("src/core/locking.ts");

function setup() {
  mkdirSync(NESTED_DIR, { recursive: true });
}
function cleanup() {
  try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
}

/** Run a snippet in a fresh Bun process with a chosen cwd; return its stdout. */
async function runIn(cwd: string, source: string): Promise<string> {
  const scriptPath = join(TEST_DIR, `child-${Math.abs(hash(source))}.ts`);
  writeFileSync(scriptPath, source);
  const proc = Bun.spawn(["bun", "run", scriptPath], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  await proc.exited;
  if (proc.exitCode !== 0) throw new Error(`child failed (${proc.exitCode}): ${err}`);
  return out.trim();
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

describe("lock path is cwd-independent", () => {
  beforeAll(setup);
  afterAll(cleanup);

  it("resolves to the same lockfile from a nested cwd", async () => {
    const target = join(TEST_DIR, "shared.txt");
    writeFileSync(target, "x\n");

    // Resolve both sides: a cwd-relative return value would compare equal as a
    // *string* while pointing at two different directories on disk.
    const fromRoot = resolve(lockPathFor(target));
    const fromNested = await runIn(
      NESTED_DIR,
      `import { lockPathFor } from ${JSON.stringify(LOCKING_MODULE)};\n` +
        `import { resolve } from "path";\n` +
        `console.log(resolve(lockPathFor(${JSON.stringify(target)})));\n`,
    );

    // A cwd-relative lock directory produced two different paths here, so two
    // agents editing one file from different directories excluded nobody.
    expect(fromNested).toBe(fromRoot);
  });
});

describe("mutual exclusion across processes", () => {
  beforeAll(setup);
  afterAll(cleanup);

  it("a lock held by another process blocks acquisition here", async () => {
    const target = join(TEST_DIR, "contended.txt");
    writeFileSync(target, "x\n");
    const ready = join(TEST_DIR, "ready.flag");

    const scriptPath = join(TEST_DIR, "holder.ts");
    writeFileSync(
      scriptPath,
      `import { acquireLock } from ${JSON.stringify(LOCKING_MODULE)};\n` +
        `import { writeFileSync } from "fs";\n` +
        `const rel = await acquireLock(${JSON.stringify(target)}, { timeoutMs: 5000 });\n` +
        `writeFileSync(${JSON.stringify(ready)}, "1");\n` +
        `await new Promise((r) => setTimeout(r, 3000));\n` +
        `rel();\n`,
    );

    // Deliberately a *different* cwd from ours: exclusion must not depend on it.
    const holder = Bun.spawn(["bun", "run", scriptPath], {
      cwd: NESTED_DIR,
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const deadline = Date.now() + 5000;
      while (!existsSync(ready) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(existsSync(ready)).toBe(true);

      let blocked = false;
      try {
        const rel = await acquireLock(target, { timeoutMs: 300 });
        rel();
      } catch (e) {
        blocked = e instanceof LockAcquireError;
      }
      expect(blocked).toBe(true);
    } finally {
      holder.kill();
      await holder.exited;
    }
  }, 20_000);
});

describe("release is ownership-checked", () => {
  beforeAll(setup);
  afterAll(cleanup);

  it("does not unlink a lockfile another holder has since acquired", async () => {
    const target = join(TEST_DIR, "stolen.txt");
    writeFileSync(target, "x\n");
    const lockPath = lockPathFor(target);

    const releaseA = await acquireLock(target, { timeoutMs: 2000 });

    // Simulate the reclaim-then-reacquire sequence: someone judged A's lock
    // stale, removed it, and took the file. A's release must not touch it.
    const foreign = { pid: process.pid, nonce: "foreign-nonce", ts: Date.now(), targets: [target] };
    writeFileSync(lockPath, JSON.stringify(foreign));

    releaseA();

    expect(existsSync(lockPath)).toBe(true);
    expect(JSON.parse(readFileSync(lockPath, "utf8")).nonce).toBe("foreign-nonce");
    rmSync(lockPath, { force: true });
  });
});

describe("stale reclaim", () => {
  beforeAll(setup);
  afterAll(cleanup);

  it("reclaims an aged lockfile whose PID is dead", async () => {
    const target = join(TEST_DIR, "crashed.txt");
    writeFileSync(target, "x\n");
    const lockPath = lockPathFor(target);
    mkdirSync(dirname(lockPath), { recursive: true });

    // PID 2^22 is above the default pid_max on Linux and macOS, so it is
    // reliably absent — no sleeping needed to age the lock either.
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: 4_194_303, nonce: "dead", ts: Date.now() - 60_000, targets: [target] }),
    );

    const rel = await acquireLock(target, { timeoutMs: 2000 });
    rel();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("does not reclaim a freshly heartbeated lockfile", async () => {
    const target = join(TEST_DIR, "alive.txt");
    writeFileSync(target, "x\n");
    const lockPath = lockPathFor(target);
    mkdirSync(dirname(lockPath), { recursive: true });

    writeFileSync(
      lockPath,
      JSON.stringify({ pid: 4_194_303, nonce: "fresh", ts: Date.now(), targets: [target] }),
    );

    let blocked = false;
    try {
      const rel = await acquireLock(target, { timeoutMs: 200 });
      rel();
    } catch (e) {
      blocked = e instanceof LockAcquireError;
    }
    expect(blocked).toBe(true);
    rmSync(lockPath, { force: true });
  });

  it("pruneStaleLocks removes reclaimable leftovers", async () => {
    const target = join(TEST_DIR, "leftover.txt");
    writeFileSync(target, "x\n");
    const lockPath = lockPathFor(target);
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: 4_194_303, nonce: "old", ts: Date.now() - 60_000, targets: [target] }),
    );

    expect(pruneStaleLocks()).toBeGreaterThan(0);
    expect(existsSync(lockPath)).toBe(false);
  });
});
