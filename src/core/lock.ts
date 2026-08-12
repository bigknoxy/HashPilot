import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from "fs";
import { dirname, join } from "path";
import { createHash } from "crypto";
import { ErrorCode } from "./telemetry";

/** Directory for advisory lock files. Mirrors telemetry dir permission hygiene. */
const LOCK_DIR = join(process.cwd(), ".hashpilot", "locks");

/** Lock lease timeout in milliseconds — bounded wait prevents indefinite hangs. */
const LOCK_TIMEOUT_MS = 10_000;

/** How often to poll for lock availability. */
const LOCK_POLL_INTERVAL_MS = 100;

/** Minimum time a lock must be held before it can be considered stale. */
const STALE_LOCK_MIN_AGE_MS = 1_000;

export interface LockResult {
  success: boolean;
  lockPath: string;
  /** Milliseconds waited to acquire. */
  waitedMs: number;
  stale: boolean;
  message: string;
}

export interface LockAcquireOptions {
  /** Override path for testing. */
  lockDir?: string;
  /** Timeout in ms (default: 10_000). */
  timeoutMs?: number;
}

function lockDir(): string {
  return process.env.HASHPILOT_LOCK_DIR || LOCK_DIR;
}

export function lockFileForPath(realPath: string): string {
  const hash = createHash("sha256").update(realPath).digest("hex");
  return join(lockDir(), `${hash}.lock`);
}

function ensureLockDir(lockDir: string): void {
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }
}

/** Check if a PID is alive. */
function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Parse a lock file content: "<pid>\n<timestamp_ms>". */
function parseLockContent(content: string): { pid: number; timestamp: number } | null {
  const parts = content.trim().split("\n");
  if (parts.length < 2) return null;
  const pid = parseInt(parts[0], 10);
  const timestamp = parseInt(parts[1], 10);
  if (isNaN(pid) || isNaN(timestamp)) return null;
  return { pid, timestamp };
}

/**
 * Acquire an advisory lock on a file path.
 *
 * Uses atomic file creation (writeFileSync with flag 'wx') to ensure
 * that exactly one process wins the race. If the lock is stale (held by
 * a dead PID for too long), it is broken and the caller acquires it.
 *
 * Locks are acquired in sorted path order at the caller level
 * (see `acquireLocks`) to prevent deadlock.
 */
export async function acquireLock(
  filePath: string,
  opts: LockAcquireOptions = {}
): Promise<LockResult> {
  const dir = opts.lockDir || lockDir();
  const lockPath = join(dir, `${createHash("sha256").update(filePath).digest("hex")}.lock`);
  ensureLockDir(dir);

  const timeoutMs = opts.timeoutMs ?? LOCK_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  const start = Date.now();
  const myPid = process.pid;

  for (;;) {
    // Try atomic creation
    try {
      writeFileSync(lockPath, `${myPid}\n${Date.now()}\n`, { flag: "wx" });
      return {
        success: true,
        lockPath,
        waitedMs: Date.now() - start,
        stale: false,
        message: `Lock acquired immediately after ${Date.now() - start}ms`,
      };
    } catch (e: any) {
      // EEXIST means someone else holds it — check if stale
      if (e.code === "EEXIST" || e.cwd !== undefined) {
        const lockStale = await checkAndBreakStaleLock(lockPath, myPid, dir);
        if (lockStale.broken) {
          // Retry the atomic creation
          try {
            writeFileSync(lockPath, `${myPid}\n${Date.now()}\n`, { flag: "wx" });
            return {
              success: true,
              lockPath,
              waitedMs: Date.now() - start,
              stale: true,
              message: `Lock acquired after breaking stale lock from PID ${lockStale.pid}`,
            };
          } catch {
            // Lost the race to break — someone else got it. Fall through to poll.
          }
        }
      }

      // Not broken or race lost — poll
      if (Date.now() >= deadline) {
        return {
          success: false,
          lockPath,
          waitedMs: Date.now() - start,
          stale: false,
          message: `LOCK_TIMEOUT: waited ${timeoutMs}ms for lock on ${filePath}`,
        };
      }

      await new Promise((r) => setTimeout(r, LOCK_POLL_INTERVAL_MS));
    }
  }
}

interface StaleLockInfo {
  broken: boolean;
  pid: number;
}

async function checkAndBreakStaleLock(lockPath: string, myPid: number, dir: string): Promise<StaleLockInfo> {
  try {
    const content = readFileSync(lockPath, "utf-8");
    const parsed = parseLockContent(content);
    if (!parsed) return { broken: false, pid: -1 };

    const { pid, timestamp } = parsed;
    const age = Date.now() - timestamp;

    // Stale if the holding PID is dead AND the lock has been around long enough
    if (age >= STALE_LOCK_MIN_AGE_MS && !isPidAlive(pid)) {
      rmSync(lockPath, { force: true });
      return { broken: true, pid };
    }

    return { broken: false, pid };
  } catch {
    // Lock file was removed between our check and read — treat as gone
    return { broken: false, pid: -1 };
  }
}

/** Release a lock file. */
export function releaseLock(lockPath: string): void {
  try {
    rmSync(lockPath, { force: true });
  } catch {}
}

/**
 * Acquire locks for multiple file paths in sorted order.
 * Prevents deadlock by always acquiring locks in a deterministic order.
 *
 * @returns locks in the same order as the input paths
 */
export async function acquireLocks(
  filePaths: string[],
  opts: LockAcquireOptions = {}
): Promise<LockResult[]> {
  // Sort paths deterministically for lock ordering
  const sorted = [...filePaths].sort();
  const results = new Map<string, LockResult>();
  const lockPaths: string[] = [];

  try {
    for (const path of sorted) {
      const result = await acquireLock(path, opts);
      if (!result.success) {
        // Release any locks we've already acquired
        for (const lp of lockPaths) {
          releaseLock(lp);
        }
        // Fill in failed result for this path, and defaults for remaining
        results.set(path, result);
        for (const remaining of sorted) {
          if (!results.has(remaining)) {
            results.set(remaining, {
              success: false,
              lockPath: "",
              waitedMs: 0,
              stale: false,
              message: `Lock acquisition skipped: earlier lock failed on ${path}`,
            });
          }
        }
        // Return in the original order
        return filePaths.map((p) => results.get(p)!);
      }
      results.set(path, result);
      lockPaths.push(result.lockPath);
    }
  } catch (e: any) {
    for (const lp of lockPaths) {
      releaseLock(lp);
    }
    throw e;
  }

  return filePaths.map((p) => results.get(p)!);
}
