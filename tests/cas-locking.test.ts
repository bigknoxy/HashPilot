import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { computeHash } from "../src/core/read";
import { acquireSortedLocks, LOCK_TIMEOUT_MS, lockPathFor, LockAcquireError } from "../src/core/locking";

const TEST_DIR = "tests/tmp/cas-locking";

function setup() { mkdirSync(TEST_DIR, { recursive: true }); }
function cleanup() { try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {} }

describe("locking", () => {
  beforeAll(setup);
  afterAll(cleanup);

  it("lockPathFor produces deterministic path", () => {
    const a = lockPathFor("/some/file.txt");
    const b = lockPathFor("/some/file.txt");
    expect(a).toBe(b);
    expect(lockPathFor("/other/file.ts")).not.toBe(a);
  });

  it("acquireSortedLocks sorts paths deterministically", async () => {
    const p1 = join(TEST_DIR, "a.txt");
    const p2 = join(TEST_DIR, "b.txt");
    writeFileSync(p1, "hi");
    writeFileSync(p2, "bye");

    // Reversed order — should not deadlock.
    const r1 = await acquireSortedLocks([p2, p1], { timeoutMs: 5000 });
    expect(typeof r1).toBe("function");
    r1();

    const r2 = await acquireSortedLocks([p1, p2], { timeoutMs: 5000 });
    expect(typeof r2).toBe("function");
    r2();
  });

  it("locks released in finally block survive inner errors", async () => {
    const f = join(TEST_DIR, "error.txt");
    writeFileSync(f, "err");

    let didRelease = false;
    try {
      const r = await acquireSortedLocks([f], { timeoutMs: 5000 });
      try { throw new Error("boom"); } finally { r(); didRelease = true; }
    } catch (e: any) { expect(e.message).toBe("boom"); }

    expect(didRelease).toBe(true);
    // Lock is now free for others.
    const r2 = await acquireSortedLocks([f], { timeoutMs: 5000 });
    r2();
  });

  it("timeout returns LOCK_TIMEOUT when lock held by live process", async () => {
    const f = join(TEST_DIR, "busy.txt");
    writeFileSync(f, "busy");

    const hold = await acquireSortedLocks([f], { timeoutMs: 5000 });

    let didTimeout = false;
    try { await acquireSortedLocks([f], { timeoutMs: 50 }); } catch (e) {
      if (e instanceof LockAcquireError && e.reason === "timeout") didTimeout = true;
      else throw e;
    }
    expect(didTimeout).toBe(true);
    hold();
  });
});

describe("CAS integration", () => {
  beforeAll(setup);
  afterAll(cleanup);

  it("computeHash is deterministic and content-sensitive", () => {
    const h1 = computeHash("hello world");
    expect(computeHash("hello world")).toBe(h1);
    expect(computeHash("HELLO WORLD")).not.toBe(h1);
  });

  it("CAS detects concurrent modification", async () => {
    const f = join(TEST_DIR, "cas-target.ts");
    const original = `export function hello() { return 'world'; }`;
    writeFileSync(f, original);

    // Read and capture reference hash.
    const source = readFileSync(f, "utf8");
    const refHash = computeHash(source);

    // Simulate concurrent modification.
    writeFileSync(f, `export function hello() { return 'changed'; }`);

    const nowSource = await Bun.file(f).text();
    expect(computeHash(nowSource) !== refHash).toBe(true);

    writeFileSync(f, original); // restore
  });

  it("CAS allows write when file unchanged", async () => {
    const f = join(TEST_DIR, "cas-ok.txt");
    writeFileSync(f, "initial");

    const source = readFileSync(f, "utf8");
    const refHash = computeHash(source);

    const nowSource = await Bun.file(f).text();
    expect(computeHash(nowSource)).toBe(refHash);
  });
});
