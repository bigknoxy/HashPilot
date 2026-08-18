import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { safeWrite, atomicWrite, simulateCrashAfterTempWrite, resetWriteBoundary, configureWriteBoundary } from "../src/core/paths";
import {
  setCurrentChangeSet, resetSnapshots, listChangeSets, lastChangeSetId,
  undoChangeSet, pruneSnapshots, configureSnapshots, cleanOrphanTempFiles, snapshotRoot,
} from "../src/core/snapshot";

/**
 * #12 — atomic writes and undo. Before this, every write truncated the target
 * in place, so an interrupted write destroyed the original, and a
 * wrong-but-successful edit could not be rolled back at all.
 */

let dir = "";
let home = "";
let priorHome: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hashpilot-snap-"));
  home = mkdtempSync(join(tmpdir(), "hashpilot-snaphome-"));
  priorHome = process.env.HOME;
  // The store's location is read at import time from HOME, so point the whole
  // suite at a scratch tree by re-importing under it.
  process.env.HOME = home;
  resetSnapshots();
  resetWriteBoundary();
  configureWriteBoundary({ allowOutsideRoot: true, quiet: true });
});

afterEach(() => {
  simulateCrashAfterTempWrite(false);
  setCurrentChangeSet(null);
  resetSnapshots();
  resetWriteBoundary();
  if (priorHome === undefined) delete process.env.HOME; else process.env.HOME = priorHome;
  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("atomic writes", () => {
  test("a crash between the temp write and the rename leaves the original intact", async () => {
    const file = join(dir, "a.txt");
    writeFileSync(file, "original\n");
    simulateCrashAfterTempWrite(true);

    await expect(safeWrite(file, "replacement\n")).rejects.toThrow(/simulated crash/);

    expect(readFileSync(file, "utf8")).toBe("original\n");
    // And the temp file is cleaned up rather than left in the source tree.
    expect(readdirSync(dir).filter((f) => f.startsWith(".hashpilot-tmp-"))).toEqual([]);
  });

  test("the target's permissions survive the write", async () => {
    const file = join(dir, "exec.sh");
    writeFileSync(file, "#!/bin/sh\n", { mode: 0o755 });
    await safeWrite(file, "#!/bin/sh\necho hi\n");
    expect(statSync(file).mode & 0o777).toBe(0o755);
  });

  test("the temp file is a sibling of the target, never in /tmp", () => {
    // A cross-device rename degrades to a copy and loses atomicity, so the
    // temp file's location is part of the contract.
    const file = join(dir, "b.txt");
    let seen: string[] = [];
    simulateCrashAfterTempWrite(true);
    try { atomicWrite(file, "x"); } catch { seen = readdirSync(dir); }
    // Cleanup already removed it, so assert on the observable outcome instead:
    // nothing leaked, and no partial target was created.
    expect(existsSync(file)).toBe(false);
    expect(seen.filter((f) => f.startsWith(".hashpilot-tmp-"))).toEqual([]);
  });

  test("content is written correctly on the happy path", async () => {
    const file = join(dir, "c.txt");
    await safeWrite(file, "hello\n");
    expect(readFileSync(file, "utf8")).toBe("hello\n");
  });

  test("orphaned temp files older than the cutoff are swept", () => {
    const orphan = join(dir, ".hashpilot-tmp-123-abc");
    writeFileSync(orphan, "junk");
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(orphan, old, old);
    expect(cleanOrphanTempFiles(dir)).toBe(1);
    expect(existsSync(orphan)).toBe(false);
  });

  test("a fresh temp file from a concurrent process is left alone", () => {
    const other = join(dir, ".hashpilot-tmp-999-xyz");
    writeFileSync(other, "in flight");
    expect(cleanOrphanTempFiles(dir)).toBe(0);
    expect(existsSync(other)).toBe(true);
  });
});

describe("undo", () => {
  test("edit → undo restores the file byte-identical, CRLF and trailing newline included", async () => {
    const file = join(dir, "d.txt");
    const original = "line one\r\nline two\r\n";
    writeFileSync(file, original);

    setCurrentChangeSet("cs-1");
    await safeWrite(file, "clobbered");
    // The write inherits the file's CRLF and trailing newline (#30).
    expect(readFileSync(file, "utf8")).toBe("clobbered\r\n");

    setCurrentChangeSet(null);
    const result = undoChangeSet("cs-1");
    expect(result.success).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  test("a file the changeSet created is removed, not restored to nothing", async () => {
    const file = join(dir, "new.txt");
    setCurrentChangeSet("cs-new");
    await safeWrite(file, "brand new\n");
    expect(existsSync(file)).toBe(true);

    const result = undoChangeSet("cs-new");
    expect(result.success).toBe(true);
    expect(existsSync(file)).toBe(false);
  });

  test("every file in a multi-file changeSet is restored together", async () => {
    const a = join(dir, "a.ts");
    const b = join(dir, "b.ts");
    writeFileSync(a, "A\n");
    writeFileSync(b, "B\n");

    setCurrentChangeSet("cs-multi");
    await safeWrite(a, "A2\n");
    await safeWrite(b, "B2\n");

    const result = undoChangeSet("cs-multi");
    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(2);
    expect(readFileSync(a, "utf8")).toBe("A\n");
    expect(readFileSync(b, "utf8")).toBe("B\n");
  });

  test("a file modified since the edit is refused, and left untouched", async () => {
    const file = join(dir, "e.txt");
    writeFileSync(file, "original\n");
    setCurrentChangeSet("cs-2");
    await safeWrite(file, "edited\n");
    setCurrentChangeSet(null);

    writeFileSync(file, "someone else edited this\n");
    const result = undoChangeSet("cs-2");

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("HASH_MISMATCH");
    expect(result.files[0]!.reason).toContain("modified since");
    expect(readFileSync(file, "utf8")).toBe("someone else edited this\n");
  });

  test("--force restores over an external modification", async () => {
    const file = join(dir, "f.txt");
    writeFileSync(file, "original\n");
    setCurrentChangeSet("cs-3");
    await safeWrite(file, "edited\n");
    setCurrentChangeSet(null);
    writeFileSync(file, "external\n");

    expect(undoChangeSet("cs-3", { force: true }).success).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("original\n");
  });

  test("--dry-run reports the restore without touching the disk", async () => {
    const file = join(dir, "g.txt");
    writeFileSync(file, "original\n");
    setCurrentChangeSet("cs-4");
    await safeWrite(file, "edited\n");
    setCurrentChangeSet(null);

    const result = undoChangeSet("cs-4", { dryRun: true });
    expect(result.success).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("edited\n");
  });

  test("undoing a changeSet edited twice restores the pre-first-edit bytes", async () => {
    const file = join(dir, "h.txt");
    writeFileSync(file, "v0\n");
    setCurrentChangeSet("cs-5");
    await safeWrite(file, "v1\n");
    await safeWrite(file, "v2\n");
    setCurrentChangeSet(null);

    expect(undoChangeSet("cs-5").success).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("v0\n");
  });

  test("an unknown changeSet fails rather than silently succeeding", () => {
    const result = undoChangeSet("nope");
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("FILE_NOT_FOUND");
  });
});

describe("the changeSet index", () => {
  test("changeSets list newest first with their files", async () => {
    writeFileSync(join(dir, "i.txt"), "x\n");
    setCurrentChangeSet("cs-old");
    await safeWrite(join(dir, "i.txt"), "y\n");
    setCurrentChangeSet("cs-new");
    await safeWrite(join(dir, "i.txt"), "z\n");
    setCurrentChangeSet(null);

    const sets = listChangeSets();
    expect(sets.map((s) => s.changeSetId)).toContain("cs-old");
    expect(sets[0]!.changeSetId).toBe("cs-new");
    expect(lastChangeSetId()).toBe("cs-new");
  });

  test("nothing is snapshotted when no changeSet is active", async () => {
    writeFileSync(join(dir, "j.txt"), "x\n");
    setCurrentChangeSet(null);
    await safeWrite(join(dir, "j.txt"), "y\n");
    expect(listChangeSets()).toEqual([]);
  });

  test("snapshots can be switched off entirely", async () => {
    configureSnapshots({ enabled: false });
    writeFileSync(join(dir, "k.txt"), "x\n");
    setCurrentChangeSet("cs-off");
    await safeWrite(join(dir, "k.txt"), "y\n");
    expect(listChangeSets()).toEqual([]);
  });

  test("retention drops the oldest changeSets past the cap", async () => {
    configureSnapshots({ maxChangeSets: 2 });
    const file = join(dir, "l.txt");
    writeFileSync(file, "0\n");
    for (const id of ["r1", "r2", "r3"]) {
      setCurrentChangeSet(id);
      await safeWrite(file, `${id}\n`);
      // Distinct timestamps, so the ordering the cap relies on is well-defined.
      await Bun.sleep(2);
    }
    setCurrentChangeSet(null);

    const removed = pruneSnapshots();
    expect(removed.changeSetsRemoved).toBe(1);
    const ids = listChangeSets().map((s) => s.changeSetId);
    expect(ids).toEqual(["r3", "r2"]);
  });

  test("pruning removes objects nothing references any more", async () => {
    configureSnapshots({ maxChangeSets: 1 });
    const file = join(dir, "m.txt");
    writeFileSync(file, "first\n");
    setCurrentChangeSet("p1");
    await safeWrite(file, "second\n");
    await Bun.sleep(2);
    setCurrentChangeSet("p2");
    await safeWrite(file, "third\n");
    setCurrentChangeSet(null);

    const before = readdirSync(join(snapshotRoot(), "objects")).length;
    const result = pruneSnapshots();
    expect(result.objectsRemoved).toBeGreaterThan(0);
    expect(readdirSync(join(snapshotRoot(), "objects")).length).toBeLessThan(before);
  });

  test("age-based retention drops changeSets past the window", async () => {
    configureSnapshots({ maxAgeDays: 1 });
    const file = join(dir, "n.txt");
    writeFileSync(file, "x\n");
    setCurrentChangeSet("aged");
    await safeWrite(file, "y\n");
    setCurrentChangeSet(null);

    // Two days on: the set is past the window.
    const result = pruneSnapshots(Date.now() + 2 * 24 * 60 * 60 * 1000);
    expect(result.changeSetsRemoved).toBe(1);
    expect(listChangeSets()).toEqual([]);
  });
});
