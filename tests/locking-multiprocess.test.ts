import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { rmdirSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { acquireLock, lockPathFor, pruneStaleLocks, LockAcquireError } from "../src/core/locking";

// Every defect these tests cover was invisible to a single-process, same-cwd
// suite: the lock only fails to exclude when a second *process* is involved, or
// when the two callers disagree about the current working directory.

const LOCKING_MODULE = resolve("src/core/locking.ts");

// #110: each describe removes its own fixture, but the shared parent dirs were
// left behind and dirtied `git status` after every run. Sweep them at file end.
afterAll(() => {
  // Order matters: clear lockfiles first, then the scratch tree. A lockfile
  // outlives the directory that created it, and the locks dir lives at the
  // project root — not under tests/tmp — so removing the tree alone leaves the
  // orphan behind (#135).
  releaseTrackedLocks();
  try { rmSync("tests/tmp/locking-mp", { recursive: true, force: true }); } catch { /* ignore */ }
  try { rmdirSync("tests/tmp"); } catch { /* non-empty or already gone */ }
});

function makeTestDir(name: string): { dir: string; nested: string; cleanup: () => void } {
  const dir = resolve("tests/tmp/locking-mp", name);
  const nested = join(dir, "pkg", "deep");
  mkdirSync(nested, { recursive: true });
  return {
    dir,
    nested,
    cleanup: () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } },
  };
}

/**
 * Track every lockfile a fixture acquires so the file-level teardown can clear
 * them.
 *
 * A test that SIGKILLs a holder leaves its lockfile behind: the process is gone
 * but the lock is inside the 30s stale window, so `acquireLock` correctly
 * refuses to reclaim it. Because these fixtures use *stable* target paths, that
 * orphan is picked up as a live lock by the very next run of this file and the
 * holder child there blocks for its full timeout instead of signalling ready —
 * which is what made "a lock held by another process blocks acquisition here"
 * fail intermittently (#135). Nothing in the lock module is wrong here; the
 * fixture was leaking state into its own successor.
 */
const acquiredLockPaths = new Set<string>();

/** Record a lockfile this fixture is responsible for releasing. */
function trackLock(target: string): string {
  const lockPath = lockPathFor(target);
  acquiredLockPaths.add(lockPath);
  return lockPath;
}

/** Remove every lockfile a fixture tracked. Runs at file end. */
function releaseTrackedLocks(): void {
  for (const lockPath of acquiredLockPaths) {
    try { rmSync(lockPath, { force: true }); } catch { /* ignore */ }
  }
  acquiredLockPaths.clear();
}

/** Run a snippet in a fresh Bun process with a chosen cwd; return its stdout. */
async function runIn(cwd: string, source: string, testDir: string): Promise<string> {
  const scriptPath = join(testDir, `child-${Math.abs(hash(source))}.ts`);
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
  const { dir, nested, cleanup } = makeTestDir("cwd-independent");
  afterAll(cleanup);

  it("resolves to the same lockfile from a nested cwd", async () => {
    const target = join(dir, "shared.txt");
    writeFileSync(target, "x\n");

    // Resolve both sides: a cwd-relative return value would compare equal as a
    // *string* while pointing at two different directories on disk.
    const fromRoot = resolve(lockPathFor(target));
    const fromNested = await runIn(
      nested,
      `import { lockPathFor } from ${JSON.stringify(LOCKING_MODULE)};\n` +
        `import { resolve } from "path";\n` +
        `console.log(resolve(lockPathFor(${JSON.stringify(target)})));\n`,
      dir,
    );

    // A cwd-relative lock directory produced two different paths here, so two
    // agents editing one file from different directories excluded nobody.
    expect(fromNested).toBe(fromRoot);
  });
});

describe("mutual exclusion across processes", () => {
  const { dir, nested, cleanup } = makeTestDir("mutual-exclusion");
  afterAll(cleanup);

  it("a lock held by another process blocks acquisition here", async () => {
    const target = join(dir, "contended.txt");
    writeFileSync(target, "x\n");
    const ready = join(dir, "ready.flag");
    // The holder is killed rather than allowed to release, so the fixture owns
    // the resulting orphan. Track it and clear it in this test's teardown, not
    // only at file end — otherwise the *next* test in this file inherits a lock
    // it never took (#135).
    const lockPath = trackLock(target);

    const scriptPath = join(dir, "holder.ts");
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
      cwd: nested,
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
      holder.kill(9);
      await holder.exited;
      // The holder is SIGKILLed before its release callback can run, so the
      // lockfile it left is ours to remove.
      try { rmSync(lockPath, { force: true }); } catch { /* ignore */ }
    }
  }, 20_000);
});

describe("fixture hygiene across runs", () => {
  const { dir, nested, cleanup } = makeTestDir("fixture-hygiene");
  afterAll(cleanup);

  it("a holder killed mid-lock does not block the next acquisition", async () => {
    const target = join(dir, "orphaned.txt");
    writeFileSync(target, "x\n");
    const ready = join(dir, "hygiene-ready.flag");
    const lockPath = trackLock(target);

    const scriptPath = join(dir, "orphan-holder.ts");
    writeFileSync(
      scriptPath,
      `import { acquireLock } from ${JSON.stringify(LOCKING_MODULE)};\n` +
        `import { writeFileSync } from "fs";\n` +
        `const rel = await acquireLock(${JSON.stringify(target)}, { timeoutMs: 5000 });\n` +
        `writeFileSync(${JSON.stringify(ready)}, "1");\n` +
        `await new Promise((r) => setTimeout(r, 10_000));\n` +
        `rel();\n`,
    );

    const holder = Bun.spawn(["bun", "run", scriptPath], {
      cwd: nested,
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const deadline = Date.now() + 5000;
      while (!existsSync(ready) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(existsSync(ready)).toBe(true);

      // SIGKILL the holder: it gets no chance to run its release callback, so
      // the lockfile is orphaned by a PID that no longer exists. The lock
      // module deliberately refuses to reclaim it inside the 30s stale window,
      // so a *stable* target path makes this test's own leftover
      // deterministically poison the next run of this file (#135).
      holder.kill(9);
      await holder.exited;
      expect(existsSync(lockPath)).toBe(true);

      // The fixture teardown is what has to reclaim it. Before #135 nothing
      // did, so the orphan survived into the next run.
      releaseTrackedLocks();
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      try { holder.kill(9); } catch { /* already dead */ }
      await holder.exited;
      try { rmSync(lockPath, { force: true }); } catch { /* ignore */ }
    }
  }, 20_000);
});

describe("release is ownership-checked", () => {
  const { dir, cleanup } = makeTestDir("ownership-checked");
  afterAll(cleanup);

  it("does not unlink a lockfile another holder has since acquired", async () => {
    const target = join(dir, "stolen.txt");
    writeFileSync(target, "x\n");
    const lockPath = trackLock(target);

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
  const { dir, cleanup } = makeTestDir("stale-reclaim");
  afterAll(cleanup);

  it("reclaims an aged lockfile whose PID is dead", async () => {
    const target = join(dir, "crashed.txt");
    writeFileSync(target, "x\n");
    const lockPath = trackLock(target);
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
    const target = join(dir, "alive.txt");
    writeFileSync(target, "x\n");
    const lockPath = trackLock(target);
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
    const target = join(dir, "leftover.txt");
    writeFileSync(target, "x\n");
    const lockPath = trackLock(target);
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: 4_194_303, nonce: "old", ts: Date.now() - 60_000, targets: [target] }),
    );

    expect(pruneStaleLocks()).toBeGreaterThan(0);
    expect(existsSync(lockPath)).toBe(false);
  });
});
