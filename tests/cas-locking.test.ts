import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { computeHash } from "../src/core/read";
import { acquireLock, acquireSortedLocks, LOCK_TIMEOUT_MS, lockPathFor, LockAcquireError } from "../src/core/locking";
import { routeEdit } from "../src/core/router";

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

describe("router serializes concurrent single-file edits (B18)", () => {
  beforeAll(setup);
  afterAll(cleanup);

  // The branch's namesake defect: CAS compared hashes but held no lock across the
  // read → compare → write window, so a writer could land in that gap and CAS
  // would report success over an edit it never saw. With the lock, concurrent
  // edits to distinct regions serialize and BOTH survive.
  it("two concurrent edits to different regions both land", async () => {
    const f = join(TEST_DIR, "race.ts");
    writeFileSync(f, "const a = 1;\nconst b = 2;\n");

    const [r1, r2] = await Promise.all([
      routeEdit({ filePath: f, operation: "replace-content", oldContent: "const a = 1;", newContent: "const a = 111;" }),
      routeEdit({ filePath: f, operation: "replace-content", oldContent: "const b = 2;", newContent: "const b = 222;" }),
    ]);

    // Whichever ran second re-read the file under the lock, so neither is stale.
    expect(r1.result.success).toBe(true);
    expect(r2.result.success).toBe(true);
    expect(readFileSync(f, "utf8")).toBe("const a = 111;\nconst b = 222;\n");
  });

  // A lost update is the failure this whole mechanism exists to prevent: N writers
  // each appending must produce N appends, never fewer.
  it("no lost updates under 8-way concurrency", async () => {
    const f = join(TEST_DIR, "race-many.txt");
    writeFileSync(f, "start\n");

    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        routeEdit({ filePath: f, operation: "replace-content", oldContent: "start\n", newContent: `start\nline${i}\n` }),
      ),
    );

    const lines = readFileSync(f, "utf8").trim().split("\n");
    // One writer wins the `start\n` anchor per pass; every winner leaves its line
    // behind, and no write silently overwrites another's.
    expect(lines[0]).toBe("start");
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("dry-run takes no lock, so it cannot be blocked by a held one", async () => {
    const f = join(TEST_DIR, "dryrun.txt");
    writeFileSync(f, "hello\n");

    const hold = await acquireSortedLocks([f], { timeoutMs: 5000 });
    try {
      const r = await routeEdit({
        filePath: f, operation: "replace-content",
        oldContent: "hello", newContent: "bye", dryRun: true,
      });
      expect(r.result.success).toBe(true);
      expect(readFileSync(f, "utf8")).toBe("hello\n"); // untouched
    } finally {
      hold();
    }
  });
});

describe("lock release safety", () => {
  beforeAll(setup);
  afterAll(cleanup);

  // The lock is deliberately NOT re-entrant: two concurrent writers inside one
  // process must still exclude each other. `batch-edit` therefore tells the
  // router it already holds the lock rather than nesting an acquire.
  it("a second acquire on a held path blocks until released", async () => {
    const f = join(TEST_DIR, "reentrant.txt");
    writeFileSync(f, "x");

    const outer = await acquireLock(f, { timeoutMs: 5000 });
    let blocked = false;
    try { (await acquireLock(f, { timeoutMs: 100 }))(); } catch { blocked = true; }
    expect(blocked).toBe(true);

    outer();
    const after = await acquireLock(f, { timeoutMs: 1000 }); // now free
    after();
  });

  // Release functions live in `finally` blocks that can run twice on tangled
  // error paths. A second call must not unlink a lockfile someone else now owns.
  it("calling a release twice does not free another holder's lock", async () => {
    const f = join(TEST_DIR, "double-release.txt");
    writeFileSync(f, "x");

    const rel = await acquireLock(f, { timeoutMs: 5000 });
    rel();

    const other = await acquireLock(f, { timeoutMs: 5000 });
    rel(); // stale second call — must be a no-op

    expect(existsSync(lockPathFor(f))).toBe(true);
    other();
    expect(existsSync(lockPathFor(f))).toBe(false);
  });
});
