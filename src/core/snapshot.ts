import {
  existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync,
  readdirSync, statSync, unlinkSync, renameSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

/**
 * Pre-edit snapshots, so an edit can be undone.
 *
 * Every write that goes through `safeWrite` first stores the file's original
 * bytes in a content-addressed object store keyed by changeSet ID. Without
 * this an agent that made a wrong-but-successful edit had nothing to roll back
 * to — and neither did the human watching (#12).
 *
 * The store lives beside the telemetry log rather than in the project tree:
 * a snapshot directory inside the repo would show up in `git status` and in
 * the agent's own file listings, and the tool must work in non-git trees.
 */

// Resolved per call rather than at import: `HOME` is what isolates a test run
// (and a sandboxed agent) from the real store, and it is not set yet when this
// module is first imported.
function root(): string {
  return join(process.env.HOME || "/root", ".agentic-tools", "snapshots");
}
function objectsDir(): string {
  return join(root(), "objects");
}
function indexFile(): string {
  return join(root(), "index.jsonl");
}

/** One file's pre-image within a changeSet. */
export interface SnapshotRecord {
  changeSetId: string;
  /** ISO-8601, when the snapshot was taken. */
  timestamp: string;
  /** Absolute, symlink-resolved path — the same path that was written. */
  file: string;
  /** SHA-256 of the original bytes, or null when the file did not exist yet. */
  beforeHash: string | null;
  /** SHA-256 of the bytes we wrote, so `undo` can detect later external edits. */
  afterHash: string;
}

export interface ChangeSetSummary {
  changeSetId: string;
  timestamp: string;
  files: string[];
}

export interface SnapshotRetention {
  /** Keep at most this many changeSets. */
  maxChangeSets: number;
  /** Drop changeSets older than this. */
  maxAgeDays: number;
}

export const DEFAULT_RETENTION: SnapshotRetention = { maxChangeSets: 200, maxAgeDays: 7 };

let retention: SnapshotRetention = { ...DEFAULT_RETENTION };
let enabled = true;
/** ChangeSet the current command's writes belong to. Set by the CLI bootstrap. */
let currentChangeSet: string | null = null;

export function configureSnapshots(options: Partial<SnapshotRetention> & { enabled?: boolean } = {}): void {
  if (options.enabled !== undefined) enabled = options.enabled;
  if (options.maxChangeSets !== undefined) retention.maxChangeSets = options.maxChangeSets;
  if (options.maxAgeDays !== undefined) retention.maxAgeDays = options.maxAgeDays;
}

/** Reset to built-in defaults. For tests. */
export function resetSnapshots(): void {
  retention = { ...DEFAULT_RETENTION };
  enabled = true;
  currentChangeSet = null;
}

export function setCurrentChangeSet(id: string | null): void {
  currentChangeSet = id;
}

export function getCurrentChangeSet(): string | null {
  return currentChangeSet;
}

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function ensureDirs(): void {
  if (!existsSync(objectsDir())) mkdirSync(objectsDir(), { recursive: true, mode: 0o700 });
}

export function snapshotRoot(): string {
  return root();
}

/**
 * Record `file`'s current bytes before it is overwritten with `newContent`.
 *
 * A no-op when snapshots are off or no changeSet is active — a library caller
 * that never opts in pays nothing. Failures here never propagate: losing a
 * snapshot must not turn a good edit into a failed one.
 */
export function recordSnapshot(file: string, newContent: string): void {
  if (!enabled || !currentChangeSet) return;
  try {
    ensureDirs();
    let beforeHash: string | null = null;
    if (existsSync(file)) {
      const original = readFileSync(file);
      beforeHash = sha256(original);
      const objectPath = join(objectsDir(), beforeHash);
      // Content-addressed: identical bytes are stored once, so re-editing the
      // same file across many changeSets does not multiply storage.
      if (!existsSync(objectPath)) writeFileSync(objectPath, original, { mode: 0o600 });
    }
    const record: SnapshotRecord = {
      changeSetId: currentChangeSet,
      timestamp: new Date().toISOString(),
      file,
      beforeHash,
      afterHash: sha256(newContent),
    };
    appendFileSync(indexFile(), JSON.stringify(record) + "\n", { mode: 0o600 });
  } catch {
    // Snapshotting is best-effort by design; see the doc comment.
  }
}

export function readIndex(): SnapshotRecord[] {
  if (!existsSync(indexFile())) return [];
  return readFileSync(indexFile(), "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try { return JSON.parse(l) as SnapshotRecord; } catch { return null; }
    })
    .filter((r): r is SnapshotRecord => r !== null);
}

/** Newest changeSet first. */
export function listChangeSets(limit = 20): ChangeSetSummary[] {
  const byId = new Map<string, ChangeSetSummary>();
  // Append order breaks timestamp ties: two writes inside the same millisecond
  // carry identical ISO timestamps, and "newest first" must still be the order
  // they actually happened in.
  const order = new Map<string, number>();
  for (const r of readIndex()) {
    if (!order.has(r.changeSetId)) order.set(r.changeSetId, order.size);
    const existing = byId.get(r.changeSetId);
    if (existing) {
      if (!existing.files.includes(r.file)) existing.files.push(r.file);
      // Keep the latest write in the set as the set's timestamp.
      if (r.timestamp > existing.timestamp) existing.timestamp = r.timestamp;
    } else {
      byId.set(r.changeSetId, { changeSetId: r.changeSetId, timestamp: r.timestamp, files: [r.file] });
    }
  }
  return [...byId.values()]
    .sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp) ||
      (order.get(b.changeSetId)! - order.get(a.changeSetId)!),
    )
    .slice(0, limit);
}

export function lastChangeSetId(): string | null {
  return listChangeSets(1)[0]?.changeSetId ?? null;
}

export interface UndoFileResult {
  file: string;
  restored: boolean;
  /** Why it was skipped, when `restored` is false. */
  reason?: string;
}

export interface UndoResult {
  success: boolean;
  changeSetId: string;
  files: UndoFileResult[];
  message: string;
  errorCode?: string;
}

/**
 * Restore every file in a changeSet to its pre-edit bytes.
 *
 * Refuses any file whose current content no longer matches what the edit
 * wrote: something else has touched it since, and clobbering that would be a
 * second data loss on top of the one undo exists to fix. `force` overrides.
 */
export function undoChangeSet(changeSetId: string, options: { force?: boolean; dryRun?: boolean } = {}): UndoResult {
  const records = readIndex().filter((r) => r.changeSetId === changeSetId);
  if (records.length === 0) {
    return {
      success: false,
      changeSetId,
      files: [],
      message: `No snapshots recorded for changeSet ${changeSetId}.`,
      errorCode: "FILE_NOT_FOUND",
    };
  }

  // Oldest snapshot per file wins: it holds the bytes from before the *first*
  // write in the set, which is what "undo the whole changeSet" means.
  const firstPerFile = new Map<string, SnapshotRecord>();
  const lastPerFile = new Map<string, SnapshotRecord>();
  for (const r of records) {
    if (!firstPerFile.has(r.file)) firstPerFile.set(r.file, r);
    lastPerFile.set(r.file, r);
  }

  const files: UndoFileResult[] = [];
  for (const [file, first] of firstPerFile) {
    const last = lastPerFile.get(file)!;
    const exists = existsSync(file);
    if (exists) {
      const current = sha256(readFileSync(file));
      if (current !== last.afterHash && !options.force) {
        files.push({
          file,
          restored: false,
          reason: "modified since the edit was applied; pass --force to restore anyway",
        });
        continue;
      }
    }

    if (first.beforeHash === null) {
      // The changeSet created this file, so undoing it means removing it.
      if (!options.dryRun && exists) {
        try { unlinkSync(file); } catch (e: unknown) {
          files.push({ file, restored: false, reason: `could not remove: ${(e as Error).message}` });
          continue;
        }
      }
      files.push({ file, restored: true, reason: "created by this changeSet; removed" });
      continue;
    }

    const objectPath = join(objectsDir(), first.beforeHash);
    if (!existsSync(objectPath)) {
      files.push({ file, restored: false, reason: "snapshot object was pruned; nothing to restore from" });
      continue;
    }
    if (!options.dryRun) {
      try {
        atomicWriteSync(file, readFileSync(objectPath));
      } catch (e: unknown) {
        files.push({ file, restored: false, reason: `restore failed: ${(e as Error).message}` });
        continue;
      }
    }
    files.push({ file, restored: true });
  }

  const failed = files.filter((f) => !f.restored);
  return {
    success: failed.length === 0,
    changeSetId,
    files,
    // HASH_MISMATCH, not a bespoke code: the refusal is exactly the anchor
    // check the hash route already exits 3 for, and adapters branch on it.
    errorCode: failed.length ? "HASH_MISMATCH" : undefined,
    message: failed.length
      ? `Restored ${files.length - failed.length}/${files.length} file(s); ${failed.length} refused.`
      : `Restored ${files.length} file(s) from changeSet ${changeSetId}.`,
  };
}

/**
 * Synchronous atomic replace, used by `undo`. The async write path lives in
 * `paths.ts`; both go temp-file → rename so a crash can never leave a
 * half-written file on disk.
 */
function atomicWriteSync(target: string, content: Buffer): void {
  const dir = join(target, "..");
  const tmp = join(dir, `.hashpilot-tmp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  let mode = 0o644;
  try { mode = statSync(target).mode & 0o777; } catch { /* new file: default mode */ }
  writeFileSync(tmp, content, { mode });
  try {
    renameSync(tmp, target);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* nothing to clean */ }
    throw e;
  }
}

/**
 * Drop changeSets past the retention limits, then any object no live record
 * still references. Called after each snapshot batch, so the store cannot grow
 * without bound in a long-running agent session.
 */
export function pruneSnapshots(now: number = Date.now()): { changeSetsRemoved: number; objectsRemoved: number } {
  if (!existsSync(indexFile())) return { changeSetsRemoved: 0, objectsRemoved: 0 };
  const records = readIndex();
  const sets = listChangeSets(Number.MAX_SAFE_INTEGER);
  const cutoff = now - retention.maxAgeDays * 24 * 60 * 60 * 1000;

  const keep = new Set(
    sets
      .filter((s, i) => i < retention.maxChangeSets && Date.parse(s.timestamp) >= cutoff)
      .map((s) => s.changeSetId),
  );
  const changeSetsRemoved = sets.length - keep.size;
  if (changeSetsRemoved === 0) return { changeSetsRemoved: 0, objectsRemoved: 0 };

  const kept = records.filter((r) => keep.has(r.changeSetId));
  writeFileSync(indexFile(), kept.map((r) => JSON.stringify(r)).join("\n") + (kept.length ? "\n" : ""), { mode: 0o600 });

  const live = new Set(kept.map((r) => r.beforeHash).filter((h): h is string => h !== null));
  let objectsRemoved = 0;
  if (existsSync(objectsDir())) {
    for (const name of readdirSync(objectsDir())) {
      if (live.has(name)) continue;
      try { unlinkSync(join(objectsDir(), name)); objectsRemoved++; } catch { /* already gone */ }
    }
  }
  return { changeSetsRemoved, objectsRemoved };
}

/**
 * Remove stale `.hashpilot-tmp-*` files in `dir`. A crash between temp-write
 * and rename leaves one behind; without this they accumulate in the user's
 * source tree forever.
 */
export function cleanOrphanTempFiles(dir: string, maxAgeMs = 60 * 60 * 1000, now: number = Date.now()): number {
  let removed = 0;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(".hashpilot-tmp-")) continue;
      const p = join(dir, name);
      try {
        if (now - statSync(p).mtimeMs < maxAgeMs) continue;
        unlinkSync(p);
        removed++;
      } catch { /* raced with another process */ }
    }
  } catch { /* unreadable directory is not our problem here */ }
  return removed;
}
