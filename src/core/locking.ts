import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, statSync } from "fs";
import { join, resolve as pathResolve } from "path";

const LOCK_DIR = ".hashpilot/locks";

/** Maximum wait before abandoning a lock acquisition. */
export const LOCK_TIMEOUT_MS = 10_000;

/** How often to retry when waiting for a lock (ms). */
const LOCK_RETRY_MS = 50;

/** If the PID in a lock file hasn't written in this many ms, treat it as stale. */
const STALE_THRESHOLD_MS = 30_000;

/** Per-lockfile bookkeeping so we can release our own locks. */
interface HeldLock {
  filePath: string;  // target file being locked
  lockPath: string;  // path to the .lock file on disk
  pid: number;
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
 * Derive a unique lock-file name from an absolute target path.
 */
export function lockPathFor(targetFile: string): string {
  const resolved = pathResolve(targetFile);
  // Lightweight hash: just fold the path into a short hex-ish string so we don't blow out the
  // filesystem with extremely deep nesting on Windows. md5/sha256 would round-trip to node_modules
  // and this is an advisory lock, not cryptography.
  const raw = Buffer.from(resolved, "utf8");
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h + raw[i]) | 0; // djb2-ish fold
  }
  const key = Math.abs(h).toString(36);
  return join(LOCK_DIR, `${key}.lock`);
}

/** Ensure the lock directory exists with safe permissions. */
function ensureLockDir(): void {
  mkdirSync(LOCK_DIR, { recursive: true, mode: 0o755 });
}

/** Check whether a PID is alive (best-effort). */
function isPidAlive(pid: number): boolean {
  try {
    // send signal 0 — checks process existence without delivering anything.
    // On Windows process.kill works via Node's internal check too.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Read a lockfile back into structured data (or null). */
function readLockFile(lockPath: string): { pid: number; targets: string[]; ts: number } | null {
  try {
    const raw = readFileSync(lockPath, "utf8");
    return JSON.parse(raw) as { pid: number; targets: string[]; ts: number };
  } catch {
    return null; // broken file => treat as stale
  }
}

/**
 * Attempt to acquire (or update) a lockfile. Returns `true` on success.
 */
function tryLock(lockPath: string, pid: number, targets: string[], exclusive: boolean): boolean {
  ensureLockDir();
  try {
    const payload = JSON.stringify({ pid, ts: Date.now(), targets, exclusive });
    if (exclusive) {
      // Fail if the file already exists.
      if (existsSync(lockPath)) return false;
      writeFileSync(lockPath, payload);
      return true;
    } else {
      // Shared write — always succeeds (just updates timestamp for liveness).
      writeFileSync(lockPath, payload);
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Acquire an advisory lock for the given target file(s).
 *
 * Returns a callback that releases (writes heartbeat / removes) the lock on next call.
 * Callers MUST invoke the release function even on error paths (e.g., in `finally`).
 */
export async function acquireLock(
  targetPath: string,
  opts?: { timeoutMs?: number },
): Promise<() => void> {
  const maxWait = opts?.timeoutMs ?? LOCK_TIMEOUT_MS;
  const lockFile = lockPathFor(targetPath);

  const deadline = Date.now() + maxWait;

  while (Date.now() < deadline) {
    const existing = readLockFile(lockFile);
    if (!existing) {
      // No lock exists → acquire.
      if (tryLock(lockFile, process.pid, [targetPath], true)) {
        return once(() => releaseLock(lockFile));
      }
      continue;
    }

    // Lock exists — check staleness.
    const age = Date.now() - existing.ts;
    if (age > STALE_THRESHOLD_MS && !isPidAlive(existing.pid)) {
      try {
        unlinkSync(lockFile);
      } catch { /* someone else raced us */ }
      continue; // retry the loop
    }

    // Lock is held by a live PID — wait and retry.
    await sleep(LOCK_RETRY_MS);
  }

  throw new LockAcquireError(
    `Lock on ${targetPath} timed out after ${maxWait}ms (held by PID ${readLockFile(lockFile)?.pid ?? "?"})`,
    "timeout",
  );
}

/**
 * Wrap a release so extra calls are no-ops.
 *
 * Release functions land in `finally` blocks that can run more than once on
 * tangled error paths. Without this, a second call would decrement past our own
 * acquisition and unlink a lockfile a *different* process had since acquired —
 * silently handing two writers the same file, which is the exact race the lock exists to stop.
 */
function once(fn: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}

/** Release / remove a lockfile. */
function releaseLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch { /* stale delete — already gone */ }
}

/** Sleep for `ms` milliseconds (async). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acquire locks for multiple file paths in deterministic sorted order to prevent deadlock.
 * Returns a single release function that undoes all acquisitions (best-effort; partial
 * failure only releases what was acquired).
 */
export let acquireSortedLocks = async (
  paths: string[],
  opts?: { timeoutMs?: number },
): Promise<() => void> => {
  const sorted = [...new Set(paths)].sort((a, b) => a.localeCompare(b));
  const releases: (() => void)[] = [];

  for (const p of sorted) {
    try {
      releases.push(await acquireLock(p, opts));
    } catch (err) {
      // Release everything we already acquired on failure.
      for (const rel of releases) {
        try { rel(); } catch { /* ignore */ }
      }
      throw err;
    }
  }

  return () => {
    // Release in reverse order (LIFO).
    for (let i = releases.length - 1; i >= 0; i--) {
      try { releases[i](); } catch { /* ignore */ }
    }
  };
};
