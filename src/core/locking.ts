import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, statSync, readdirSync } from "fs";
import { createHash, randomBytes } from "crypto";
import { join, dirname, resolve as pathResolve } from "path";
import { findProjectRoot } from "./paths";

/** Lock directory, relative to the *target file's* project root — never to cwd. */
const LOCK_DIR_NAME = join(".hashpilot", "locks");

/** Maximum wait before abandoning a lock acquisition. */
export const LOCK_TIMEOUT_MS = 10_000;

/** How often to retry when waiting for a lock (ms). */
const LOCK_RETRY_MS = 50;

/** How often a held lock refreshes its `ts` so others can see it is alive. */
const HEARTBEAT_MS = 5_000;

/** If the holder hasn't refreshed `ts` in this many ms, treat the lock as stale. */
const STALE_THRESHOLD_MS = 30_000;

/** On-disk lock payload. */
interface LockPayload {
  pid: number;
  /** Per-acquisition token. Release only unlinks a file still carrying our nonce. */
  nonce: string;
  ts: number;
  targets: string[];
}

/** Errors thrown by this module. */
export class LockAcquireError extends Error {
  public readonly reason: "timeout" | "stale";

  constructor(message: string, reason: "timeout" | "stale") {
    super(message);
    this.name = "LockAcquireError";
    this.reason = reason;
  }
}

/**
 * Derive the lock-file path for a target file.
 *
 * The key is a SHA-256 of the *absolute* target path, and the directory is
 * anchored to that target's project root. Both halves must be cwd-independent:
 * a cwd-relative lock directory combined with an absolute key means two
 * processes editing the same file from different working directories write to
 * different lock files and never exclude each other.
 */
export function lockPathFor(targetFile: string): string {
  const resolved = pathResolve(targetFile);
  const root = findProjectRoot(dirname(resolved));
  const key = createHash("sha256").update(resolved).digest("hex").slice(0, 32);
  return join(root, LOCK_DIR_NAME, `${key}.lock`);
}

/** Ensure the lock directory exists with safe permissions. */
function ensureLockDir(lockPath: string): void {
  mkdirSync(dirname(lockPath), { recursive: true, mode: 0o755 });
}

/** Check whether a PID is alive (best-effort). */
function isPidAlive(pid: number): boolean {
  try {
    // send signal 0 — checks process existence without delivering anything.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Read a lockfile back into structured data. `null` means absent or unreadable. */
function readLockFile(lockPath: string): LockPayload | null {
  try {
    return JSON.parse(readFileSync(lockPath, "utf8")) as LockPayload;
  } catch {
    return null;
  }
}

/**
 * Age of a lock, in ms. Prefers the payload's heartbeat `ts`; falls back to the
 * file's mtime when the payload is unreadable (a torn write, or a lockfile from
 * an older version). Returns `null` if the file is gone.
 */
function lockAgeMs(lockPath: string, payload: LockPayload | null): number | null {
  if (payload && typeof payload.ts === "number") return Date.now() - payload.ts;
  try {
    return Date.now() - statSync(lockPath).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Atomically create the lockfile. Returns `true` only if *we* created it.
 *
 * `wx` is O_CREAT|O_EXCL: the existence check and the create are one syscall.
 * An `existsSync` guard followed by a plain write is check-then-act — two
 * processes can both observe no lockfile and both write, which is precisely the
 * race this lock exists to prevent.
 */
function tryCreateLock(lockPath: string, payload: LockPayload): boolean {
  ensureLockDir(lockPath);
  try {
    writeFileSync(lockPath, JSON.stringify(payload), { flag: "wx" });
    return true;
  } catch {
    return false; // EEXIST (held) or an I/O error — either way we did not acquire.
  }
}

/** Refresh the heartbeat, but only while the lockfile is still ours. */
function heartbeat(lockPath: string, payload: LockPayload): void {
  const current = readLockFile(lockPath);
  if (!current || current.nonce !== payload.nonce) return; // no longer ours
  payload.ts = Date.now();
  try {
    writeFileSync(lockPath, JSON.stringify(payload));
  } catch {
    /* transient I/O — the next tick retries */
  }
}

/**
 * Release a lock we own.
 *
 * Unlinks only if the lockfile still carries our nonce. Unlinking by path alone
 * is unsafe: if our lock was reclaimed as stale and another process acquired it,
 * a blind unlink would delete *their* lockfile and hand a third writer the same
 * file — two writers, silently.
 */
function releaseOwnedLock(lockPath: string, payload: LockPayload, timer: ReturnType<typeof setInterval>): void {
  clearInterval(timer);
  const current = readLockFile(lockPath);
  if (!current || current.nonce !== payload.nonce) return; // reclaimed by someone else
  try {
    unlinkSync(lockPath);
  } catch {
    /* already gone */
  }
}

/**
 * Acquire an advisory lock for the given target file.
 *
 * Returns a release callback. Callers MUST invoke it even on error paths
 * (e.g. in a `finally`). Extra calls are no-ops.
 *
 * Locks are **not** re-entrant: acquiring the same file twice in one process
 * blocks until the timeout. Callers that already hold a lock must say so rather
 * than nesting an acquire.
 */
export async function acquireLock(
  targetPath: string,
  opts?: { timeoutMs?: number },
): Promise<() => void> {
  const maxWait = opts?.timeoutMs ?? LOCK_TIMEOUT_MS;
  const lockFile = lockPathFor(targetPath);
  const deadline = Date.now() + maxWait;

  while (Date.now() < deadline) {
    const payload: LockPayload = {
      pid: process.pid,
      nonce: randomBytes(12).toString("hex"),
      ts: Date.now(),
      targets: [targetPath],
    };

    if (tryCreateLock(lockFile, payload)) {
      const timer = setInterval(() => heartbeat(lockFile, payload), HEARTBEAT_MS);
      // Never hold the event loop open just to heartbeat.
      (timer as unknown as { unref?: () => void }).unref?.();
      return once(() => releaseOwnedLock(lockFile, payload, timer));
    }

    // Creation failed — someone holds it (or it is a leftover). Check staleness.
    const existing = readLockFile(lockFile);
    const age = lockAgeMs(lockFile, existing);
    if (age === null) {
      // Vanished between create and read — retry immediately-ish.
      await sleep(LOCK_RETRY_MS);
      continue;
    }
    // Reclaim only when the holder stopped heartbeating AND its PID is gone.
    // An unreadable payload has no PID to check, so age alone decides.
    const holderGone = !existing || !isPidAlive(existing.pid);
    if (age > STALE_THRESHOLD_MS && holderGone) {
      try {
        unlinkSync(lockFile);
      } catch {
        /* someone else raced us to the reclaim */
      }
    }

    // Always yield. A `continue` without sleeping busy-spins a core for the
    // whole timeout, starving the very edit we are waiting on.
    await sleep(LOCK_RETRY_MS);
  }

  const holder = readLockFile(lockFile)?.pid ?? "?";
  throw new LockAcquireError(
    `Lock on ${targetPath} timed out after ${maxWait}ms (held by PID ${holder})`,
    "timeout",
  );
}

/** Wrap a release so extra calls are no-ops. */
function once(fn: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}

/** Sleep for `ms` milliseconds (async). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acquire locks for multiple files in deterministic order to prevent deadlock.
 *
 * Deduplication is by *lock path*, not by input path: two different inputs that
 * map to the same lockfile would otherwise make this function block against
 * itself, since locks are not re-entrant.
 */
export async function acquireSortedLocks(
  paths: string[],
  opts?: { timeoutMs?: number },
): Promise<() => void> {
  const byLockPath = new Map<string, string>();
  for (const p of paths) {
    const lp = lockPathFor(p);
    if (!byLockPath.has(lp)) byLockPath.set(lp, p);
  }
  const sorted = [...byLockPath.keys()].sort((a, b) => a.localeCompare(b));
  const releases: (() => void)[] = [];

  for (const lp of sorted) {
    try {
      releases.push(await acquireLock(byLockPath.get(lp)!, opts));
    } catch (err) {
      // Release everything we already acquired on failure.
      for (const rel of releases) {
        try { rel(); } catch { /* ignore */ }
      }
      throw err;
    }
  }

  return once(() => {
    // Release in reverse order (LIFO).
    for (let i = releases.length - 1; i >= 0; i--) {
      try { releases[i](); } catch { /* ignore */ }
    }
  });
}

/**
 * Remove reclaimable lockfiles left behind by crashed processes.
 * Returns the number of lockfiles removed. Safe to call at startup.
 */
export function pruneStaleLocks(root: string = findProjectRoot()): number {
  const dir = join(root, LOCK_DIR_NAME);
  if (!existsSync(dir)) return 0;
  let removed = 0;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of entries) {
    if (!name.endsWith(".lock")) continue;
    const lockPath = join(dir, name);
    const payload = readLockFile(lockPath);
    const age = lockAgeMs(lockPath, payload);
    if (age === null) continue;
    const holderGone = !payload || !isPidAlive(payload.pid);
    if (age > STALE_THRESHOLD_MS && holderGone) {
      try {
        unlinkSync(lockPath);
        removed++;
      } catch { /* ignore */ }
    }
  }
  return removed;
}
