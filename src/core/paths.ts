import {
  existsSync, realpathSync, writeFileSync, renameSync, unlinkSync,
  statSync, openSync, fsyncSync, closeSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { ErrorCode } from "./telemetry";
import { recordSnapshot, cleanOrphanTempFiles } from "./snapshot";

/**
 * Filesystem write boundary.
 *
 * Every write in HashPilot funnels through `assertWritable`. Enforcing this in
 * the write helpers rather than in `cli.ts` means a new command cannot forget
 * the check, and the library API is bounded too — not just the CLI.
 */

/** Thrown when a write target fails the boundary check. */
export class PathDeniedError extends Error {
  readonly errorCode = ErrorCode.PATH_DENIED;
  readonly path: string;
  readonly reason: string;

  constructor(path: string, reason: string) {
    super(`Refusing to write ${path}: ${reason}`);
    this.name = "PathDeniedError";
    this.path = path;
    this.reason = reason;
  }
}

export interface AssertWritableOptions {
  /** Directory the project root is discovered from. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Extra roots to permit, from config `allowedRoots`. Relative entries resolve against `cwd`. */
  allowedRoots?: string[];
  /** Sole bypass for the containment check. Does NOT bypass the hard-deny list. */
  allowOutsideRoot?: boolean;
  /** Suppress the stderr warning emitted when `allowOutsideRoot` is used. For tests. */
  quiet?: boolean;
}

/**
 * Process-wide defaults, set once at CLI bootstrap from config + global flags,
 * so that write helpers deep in the call graph get the boundary policy without
 * every caller threading options through.
 */
let boundaryDefaults: AssertWritableOptions = {};

export function configureWriteBoundary(options: AssertWritableOptions): void {
  boundaryDefaults = { ...boundaryDefaults, ...options };
}

/** Reset to built-in defaults. For tests. */
export function resetWriteBoundary(): void {
  boundaryDefaults = {};
}

/** macOS and Windows are case-insensitive; comparing case-sensitively there lets `/ETC/passwd` slip past. */
const CASE_INSENSITIVE = platform() === "darwin" || platform() === "win32";

function normalizeForCompare(p: string): string {
  return CASE_INSENSITIVE ? p.toLowerCase() : p;
}

/** True when `child` is `parent` or lives beneath it. Segment-aware: `/foo/bar-baz` is not inside `/foo/bar`. */
function isInside(child: string, parent: string): boolean {
  const c = normalizeForCompare(child);
  const p = normalizeForCompare(parent);
  if (c === p) return true;
  const rel = relative(p, c);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Directories and files never writable, regardless of `--allow-outside-root`
 * or `allowedRoots`. A structured editor has no legitimate reason to touch
 * credentials, agent configuration, or system config.
 */
function hardDenyTargets(): { dirs: string[]; files: string[] } {
  const home = homedir();
  return {
    dirs: [
      join(home, ".ssh"),
      join(home, ".aws"),
      join(home, ".gnupg"),
      join(home, ".claude"),
      join(home, ".config", "hashpilot"),
      join(home, ".agentic-tools"),
      "/etc",
    ],
    files: [
      ".bashrc", ".bash_profile", ".bash_login", ".profile",
      ".zshrc", ".zshenv", ".zprofile", ".zlogin",
      ".netrc", ".npmrc", ".gitconfig",
    ].map((f) => join(home, f)),
  };
}

/**
 * Resolve a path to absolute, following symlinks on the longest existing
 * ancestor. Resolving the *parent* rather than the target itself matters: the
 * target may not exist yet (a new file), and a symlinked parent directory is
 * the classic escape vector.
 */
function resolveThroughSymlinks(target: string): string {
  const abs = resolve(target);
  let existing = abs;
  const trailing: string[] = [];

  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return abs; // hit the filesystem root; nothing to resolve
    trailing.unshift(existing.slice(parent.length + 1));
    existing = parent;
  }

  try {
    return trailing.length ? join(realpathSync(existing), ...trailing) : realpathSync(existing);
  } catch {
    return abs;
  }
}

/**
 * Locate the project root: the nearest ancestor of `cwd` containing `.git`,
 * falling back to `cwd` itself for non-repo usage.
 */
export function findProjectRoot(cwd: string = process.cwd()): string {
  let dir = resolveThroughSymlinks(cwd);
  while (true) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolveThroughSymlinks(cwd);
}

/**
 * Validate that `target` may be written, and return its resolved absolute path.
 * Callers must write to the returned path, not the input — the returned value
 * is the symlink-resolved location that was actually checked.
 *
 * @throws {PathDeniedError} if the target is on the hard-deny list, or escapes
 *   the project root without `allowOutsideRoot`.
 */
export function assertWritable(target: string, options: AssertWritableOptions = {}): string {
  const { cwd = process.cwd(), allowedRoots = [], allowOutsideRoot = false, quiet = false } = {
    ...boundaryDefaults,
    ...options,
  };

  if (!target || target.trim() === "") {
    throw new PathDeniedError(String(target), "empty path");
  }
  if (target.includes("\0")) {
    throw new PathDeniedError(target, "path contains a null byte");
  }

  const resolved = resolveThroughSymlinks(target);

  // Hard-deny first: unconditional, and not bypassable by any flag or config.
  const { dirs, files } = hardDenyTargets();
  for (const rawDir of dirs) {
    // Resolve the deny target too: on macOS `/etc` is a symlink to
    // `/private/etc`, so comparing against the literal path misses everything.
    const dir = resolveThroughSymlinks(rawDir);
    if (isInside(resolved, dir)) {
      throw new PathDeniedError(resolved, `${dir} is never writable by HashPilot`);
    }
  }
  for (const rawFile of files) {
    const file = resolveThroughSymlinks(rawFile);
    if (normalizeForCompare(resolved) === normalizeForCompare(file)) {
      throw new PathDeniedError(resolved, "shell and tool configuration files are never writable by HashPilot");
    }
  }

  if (allowOutsideRoot) {
    if (!quiet) {
      console.error(
        `WARNING: --allow-outside-root is set; writing outside the project root to ${resolved}`,
      );
    }
    return resolved;
  }

  const roots = [findProjectRoot(cwd), ...allowedRoots.map((r) => resolveThroughSymlinks(resolve(cwd, r)))];
  if (roots.some((root) => isInside(resolved, root))) return resolved;

  throw new PathDeniedError(
    resolved,
    `outside the project root (${roots[0]}). Pass --allow-outside-root or add the location to "allowedRoots" in .hashpilot.json`,
  );
}

/** Batch form. Reports every rejection at once rather than failing on the first. */
export function assertAllWritable(targets: string[], options: AssertWritableOptions = {}): string[] {
  const resolved: string[] = [];
  const denied: string[] = [];
  for (const t of targets) {
    try {
      resolved.push(assertWritable(t, options));
    } catch (err) {
      denied.push(err instanceof PathDeniedError ? err.message : String(err));
    }
  }
  if (denied.length) throw new PathDeniedError(targets.join(", "), denied.join("; "));
  return resolved;
}

/**
 * The only write primitive in the codebase. Validates the boundary, then writes
 * to the *resolved* path. Call this instead of `Bun.write` for any file the
 * user or an agent supplied the path for.
 *
 * @throws {PathDeniedError} if the target fails the boundary check.
 */
export async function safeWrite(
  target: string,
  content: string,
  options: AssertWritableOptions = {},
): Promise<string> {
  const resolved = assertWritable(target, options);
  recordSnapshot(resolved, content);
  atomicWrite(resolved, content);
  return resolved;
}

/** Injectable failure point, so a test can simulate a crash mid-write. */
let crashAfterTempWrite = false;

/** Make the next atomic write throw between the temp write and the rename. For tests. */
export function simulateCrashAfterTempWrite(value: boolean): void {
  crashAfterTempWrite = value;
}

/**
 * Replace `target`'s contents without ever exposing a partial file.
 *
 * A bare truncating write that is interrupted — SIGINT, a crash, a full disk —
 * leaves the source file permanently truncated and the original content gone
 * (#12). Writing to a sibling temp file and renaming over the target avoids
 * that: `rename(2)` within a filesystem is atomic, so a concurrent reader sees
 * either the whole old file or the whole new one.
 *
 * The temp file must live in the target's own directory. In `/tmp` the rename
 * would usually cross a device boundary and degrade into a copy, which is
 * exactly the non-atomic write this replaces.
 */
export function atomicWrite(resolved: string, content: string): void {
  const dir = dirname(resolved);
  const tmp = join(dir, `.hashpilot-tmp-${process.pid}-${Math.random().toString(36).slice(2)}`);

  // Carry the target's permissions onto the replacement, or every edit
  // silently resets the file to the default mode.
  let mode = 0o644;
  try {
    if (existsSync(resolved)) mode = statSync(resolved).mode & 0o777;
  } catch { /* unreadable target: fall back to the default mode */ }

  let fd: number | undefined;
  try {
    writeFileSync(tmp, content, { mode });
    // fsync the data before the rename; otherwise a power loss can land the
    // rename in the journal while the file's blocks are still unwritten.
    fd = openSync(tmp, "r+");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;

    if (crashAfterTempWrite) throw new Error("simulated crash after temp write");

    renameSync(tmp, resolved);
  } catch (err) {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* already closed */ } }
    try { unlinkSync(tmp); } catch { /* nothing to clean up */ }
    throw err;
  }

  // fsync the directory so the rename itself is durable.
  try {
    const dirFd = openSync(dir, "r");
    fsyncSync(dirFd);
    closeSync(dirFd);
  } catch { /* not supported on every platform; the rename still applied */ }

  cleanOrphanTempFiles(dir);
}

export const PATH_SEPARATOR = sep;
