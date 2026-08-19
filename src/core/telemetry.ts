import { mkdirSync, appendFileSync, readFileSync, existsSync, writeFileSync, renameSync, unlinkSync, statSync, readdirSync, chmodSync } from "fs";
import { join } from "path";
import type { TelemetryConfig } from "./config";
import { redactEvent } from "./redact";
import { createHash } from "crypto";

const LOG_DIR = join(process.env.HOME || "/root", ".agentic-tools", "logs");
const LOG_FILE = join(LOG_DIR, "telemetry.jsonl");
const ROTATED_FILE_RE = /^telemetry-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.jsonl$/;

// Configurable defaults
export let MAX_FILE_SIZE = 10 * 1024 * 1024;
export let MAX_ROTATED_FILES = 10;
export let RETENTION_DAYS = 30;
/**
 * Cap on one serialized record. A captured diff is unbounded — one edit to a
 * large file used to write megabytes into a line of the log, which made the
 * log expensive to read, unbounded between rotation checks, and impossible to
 * stream (#20). Oversized payloads move to a content-addressed store beside
 * the log and the record keeps only the hash.
 */
export let MAX_RECORD_BYTES = 4096;

export function configureTelemetry(cfg: TelemetryConfig | undefined): void {
  if (!cfg) return;
  if (cfg.maxFileSize !== undefined) MAX_FILE_SIZE = cfg.maxFileSize;
  if (cfg.maxRotatedFiles !== undefined) MAX_ROTATED_FILES = cfg.maxRotatedFiles;
  if (cfg.retentionDays !== undefined) RETENTION_DAYS = cfg.retentionDays;
  if (cfg.maxRecordBytes !== undefined) MAX_RECORD_BYTES = cfg.maxRecordBytes;
  // `enabled` used to be parsed and then ignored, so opting out via config did
  // nothing. It is the lowest-priority switch: env and CLI still override it.
  if (cfg.enabled !== undefined) sessionEnabled = cfg.enabled;
}

/**
 * Resolve the telemetry kill switch. Precedence, highest first:
 *   CLI `--no-telemetry` > `HASHPILOT_TELEMETRY=0` > config `telemetry.enabled` > on.
 */
export function resolveTelemetryEnabled(cfg: TelemetryConfig | undefined, cliDisabled: boolean): boolean {
  if (cliDisabled) return false;
  const env = process.env.HASHPILOT_TELEMETRY;
  if (env !== undefined && ["0", "false", "off", "no"].includes(env.trim().toLowerCase())) return false;
  if (cfg?.enabled !== undefined) return cfg.enabled;
  return true;
}

export enum ErrorCode {
  STALE_ANCHOR = "STALE_ANCHOR",
  SYMBOL_NOT_FOUND = "SYMBOL_NOT_FOUND",
  PARSE_ERROR = "PARSE_ERROR",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  DUPLICATE_MATCH = "DUPLICATE_MATCH",
  UNSUPPORTED_LANGUAGE = "UNSUPPORTED_LANGUAGE",
  HASH_MISMATCH = "HASH_MISMATCH",
  WRITE_FAILED = "WRITE_FAILED",
  /** Write target is outside the project root or on the hard-deny list. */
  PATH_DENIED = "PATH_DENIED",
  /** A flag or argument was malformed (bad --range, non-numeric value). */
  INVALID_ARGUMENT = "INVALID_ARGUMENT",
  /** The requested operation exists in the CLI surface but is not implemented for this input. */
  UNSUPPORTED_OPERATION = "UNSUPPORTED_OPERATION",
  /** The edit applied but format/lint/test verification failed. */
  VERIFY_FAILED = "VERIFY_FAILED",
  /**
   * A verification check was killed at its timeout. Distinct from
   * VERIFY_FAILED: the check never reached a verdict, so it is evidence of
   * nothing about the edit and must not trigger a revert on its own.
   */
  VERIFY_TIMEOUT = "VERIFY_TIMEOUT",
  /** verify-changes ran no checks at all, so it verified nothing (#106). */
  VERIFY_NO_CHECKS = "VERIFY_NO_CHECKS",
  /**
   * A rollback ran but could not restore every file, so the tree is left in a
   * state that is neither the original nor the intended result. Strictly more
   * serious than the failure that triggered the rollback — see
   * `PlanResult.unrevertedFiles` for the files still holding edits.
   */
  ROLLBACK_INCOMPLETE = "ROLLBACK_INCOMPLETE",
  /** The anchor could not be relocated unambiguously (multiple candidate matches). */
  AMBIGUOUS_ANCHOR = "AMBIGUOUS_ANCHOR",
   /**
    * rename-symbol was asked to rename a name that binds **more than one**
    * distinct symbol in the file — a shadowed local, a foreign import of the
    * same name, or two top-level declarations. A file-wide textual rename would
    * clobber a binding the caller did not mean to touch, so the operation
    * refuses and names the contending binding sites.
    */
  AMBIGUOUS_SYMBOL = "AMBIGUOUS_SYMBOL",
  /**
   * An AST search hit the runaway depth guard before it finished, so "not
   * found" would be a claim the search never earned. Distinct from
   * SYMBOL_NOT_FOUND: the symbol may well exist below the cap (#39).
   */
  SEARCH_TRUNCATED = "SEARCH_TRUNCATED",
  /** A file exists but could not be read (permissions, device error). Distinct from FILE_NOT_FOUND. */
  READ_FAILED = "READ_FAILED",
  /** Lock acquisition timed out — another process holds the advisory lock. */
  LOCK_TIMEOUT = "LOCK_TIMEOUT",
  /** A failure that carried no code of its own. Better than an empty `error.code`. */
  UNKNOWN = "UNKNOWN",
  /** Uncaught internal error — a bug in HashPilot. */
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export interface TelemetryEvent {
  timestamp: string;
  sessionId: string;
  operation: string;
  route: "ast" | "hash" | "diff" | "read" | "grep" | "verify" | "intent" | "other";
  file?: string;
  files_count?: number;
  lines_read?: number;
  language?: string;
  success: boolean;
  fallback_reason?: string;
  retries?: number;
  recovered?: boolean;
  verification_result?: "pass" | "fail" | "skip";
  failed_in?: string[];
  elapsed_ms: number;
  detail?: string;
  errorCode?: ErrorCode;

  // ── M6: Provenance fields (all optional) ──────────────────────────
  /** Agent identity (e.g. "claude-opus-4.7@anthropic") */
  actor?: string;
  /** Task or issue reference (e.g. "ISSUE-142", "GH#123") */
  taskId?: string;
  /** UUID linking multi-step edits into one logical change */
  changeSetId?: string;
  /** Human-readable reason for the edit */
  reason?: string;
  /** SHA-256 hash of file content before edit (12-char truncated) */
  beforeHash?: string;
  /** SHA-256 hash of file content after edit (12-char truncated) */
  afterHash?: string;
  /** Unified diff of the change */
  diff?: string;
  /**
   * Hash of a diff held in the payload store because inlining it would blow
   * past `MAX_RECORD_BYTES` (#20). Readers rehydrate `diff` from it, so
   * consumers never have to know which of the two a record was written with.
   */
  diffRef?: string;
  /** Size of the spilled diff in bytes, so a reader can report it unresolved. */
  diffBytes?: number;
  /** 0-indexed position of this step within a changeSet */
  stepIndex?: number;
  /** Total number of steps in the changeSet */
  stepTotal?: number;
  /** Truncated agent prompt/context that produced this edit */
  context?: string;
}

export interface SessionSummary {
  sessionId: string;
  eventCount: number;
  errorRate: number;
  firstTimestamp: string;
  lastTimestamp: string;
  durationMs: number;
}

// Generated once per CLI invocation at module load
const sessionId = crypto.randomUUID();

let sessionEnabled = true;

export function enableTelemetry(on: boolean = true): void {
  sessionEnabled = on;
}

export function getSessionId(): string {
  return sessionId;
}

// --- File helpers ---

function ensureLogDir(): void {
  // 0700/0600: the log can contain file paths, edit reasons, and (when
  // provenance.captureDiffs is on) source lines. Other users on the box have
  // no business reading it.
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Narrow permissions on a log dir/file created by an older version, which used
 * the process umask. The `mode` options above only apply at creation time.
 */
function tightenLogPermissions(): void {
  try {
    if ((statSync(LOG_DIR).mode & 0o077) !== 0) chmodSync(LOG_DIR, 0o700);
    if (existsSync(LOG_FILE) && (statSync(LOG_FILE).mode & 0o077) !== 0) chmodSync(LOG_FILE, 0o600);
  } catch {}
}

function rotatedFiles(): string[] {
  if (!existsSync(LOG_DIR)) return [];
  return readdirSync(LOG_DIR)
    .filter((f) => ROTATED_FILE_RE.test(f))
    .sort()
    .map((f) => join(LOG_DIR, f));
}

function parseRotatedDate(filename: string): string | null {
  const match = filename.match(ROTATED_FILE_RE);
  return match ? match[1] : null;
}

function maybeRotate(): void {
  if (!existsSync(LOG_FILE)) return;
  const stat = statSync(LOG_FILE);
  if (stat.size < MAX_FILE_SIZE) return;

  const date = new Date().toISOString().split("T")[0];
  let rotatedPath = join(LOG_DIR, `telemetry-${date}.jsonl`);
  let counter = 1;
  while (existsSync(rotatedPath)) {
    counter++;
    rotatedPath = join(LOG_DIR, `telemetry-${date}-${counter}.jsonl`);
  }

  renameSync(LOG_FILE, rotatedPath);

  // Enforce max rotated files
  const files = rotatedFiles();
  while (files.length > MAX_ROTATED_FILES) {
    const oldest = files.shift()!;
    try { unlinkSync(oldest); } catch {}
  }
}

/** Content-addressed store for payloads too large to inline in a record. */
function payloadsDir(): string {
  return join(LOG_DIR, "payloads");
}

function payloadPath(ref: string): string {
  return join(payloadsDir(), `${ref}.txt`);
}

/**
 * Write a payload out-of-line and return its hash. Content-addressed, so the
 * same diff recorded twice costs one object. Written temp-then-rename: a reader
 * must never see a half-written payload behind a reference that already landed
 * in the log.
 */
function storePayload(content: string): string {
  const ref = createHash("sha256").update(content).digest("hex").slice(0, 32);
  const dest = payloadPath(ref);
  if (existsSync(dest)) return ref;
  mkdirSync(payloadsDir(), { recursive: true, mode: 0o700 });
  const tmp = `${dest}.${process.pid}.tmp`;
  writeFileSync(tmp, content, { mode: 0o600 });
  renameSync(tmp, dest);
  return ref;
}

function loadPayload(ref: string): string | undefined {
  try {
    return readFileSync(payloadPath(ref), "utf-8");
  } catch {
    return undefined;
  }
}

/**
 * Bring one record under `MAX_RECORD_BYTES`.
 *
 * The diff is the only genuinely unbounded field, so it spills to the payload
 * store first and the record keeps `diffRef` plus the original byte count.
 * `context` and `detail` are bounded by their own callers but can still be long
 * enough to matter, so they are truncated as a backstop. A record that is still
 * oversized after all that is written as-is: dropping telemetry to satisfy a
 * size cap would lose the very events most worth having.
 */
export function capRecord(entry: TelemetryEvent): TelemetryEvent {
  if (Buffer.byteLength(JSON.stringify(entry)) <= MAX_RECORD_BYTES) return entry;

  const capped: TelemetryEvent = { ...entry };
  if (capped.diff !== undefined) {
    const diff = capped.diff;
    capped.diffBytes = Buffer.byteLength(diff);
    capped.diffRef = storePayload(diff);
    delete capped.diff;
  }
  if (Buffer.byteLength(JSON.stringify(capped)) <= MAX_RECORD_BYTES) return capped;

  for (const field of ["context", "detail"] as const) {
    const value = capped[field];
    if (typeof value !== "string" || value.length <= 200) continue;
    capped[field] = value.slice(0, 200) + "...";
    if (Buffer.byteLength(JSON.stringify(capped)) <= MAX_RECORD_BYTES) return capped;
  }
  return capped;
}

/**
 * Put a spilled diff back on the record. Readers (health, provenance) see the
 * same shape they always did; the out-of-line store is a storage detail, not a
 * change to the query contract. A payload pruned by retention leaves the
 * reference in place so the record still says a diff existed.
 */
function rehydrate(entry: TelemetryEvent): TelemetryEvent {
  if (entry.diff !== undefined || entry.diffRef === undefined) return entry;
  const diff = loadPayload(entry.diffRef);
  return diff === undefined ? entry : { ...entry, diff };
}

// --- Core functions ---

export function recordEvent(event: Omit<TelemetryEvent, "timestamp" | "sessionId">): void {
  if (!sessionEnabled) return;
  try {
    ensureLogDir();
    tightenLogPermissions();
    maybeRotate();
    const entry: TelemetryEvent = redactEvent({
      ...event,
      timestamp: new Date().toISOString(),
      sessionId,
    });
    appendFileSync(LOG_FILE, JSON.stringify(capRecord(entry)) + "\n", { mode: 0o600 });
  } catch {}
}

/**
 * A log file exists but could not be read (permissions, a directory in its
 * place, a device error). Distinct from "no telemetry has been recorded yet",
 * which is an empty result, not an error.
 */
export class TelemetryReadError extends Error {
  readonly file: string;
  constructor(file: string, cause: unknown) {
    super(`cannot read telemetry log ${file}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "TelemetryReadError";
    this.file = file;
  }
}

/**
 * Malformed lines skipped by the most recent read. Corruption must not be
 * silently indistinguishable from a short log, but the query payloads are a
 * published contract, so the count is reported alongside them rather than
 * inside them (see `docs/ADAPTER-CONTRACT.md`).
 */
let lastSkipped = 0;
export function lastReadSkipped(): number {
  return lastSkipped;
}

/** Reads one JSONL file, counting unparseable lines instead of dropping them. */
function parseLog(file: string): { events: TelemetryEvent[]; skipped: number } {
  let content: string;
  try {
    content = readFileSync(file, "utf-8");
  } catch (err) {
    throw new TelemetryReadError(file, err);
  }
  const events: TelemetryEvent[] = [];
  let skipped = 0;
  for (const line of content.trim().split("\n")) {
    if (!line) continue;
    try {
      events.push(rehydrate(JSON.parse(line)));
    } catch {
      skipped++;
    }
  }
  return { events, skipped };
}

/**
 * Most recent `limit` events from the active log.
 *
 * Throws `TelemetryReadError` if the log exists but cannot be read — returning
 * `[]` there reports a broken log as a clean one.
 */
export function readEvents(limit: number = 100): TelemetryEvent[] {
  lastSkipped = 0;
  if (!existsSync(LOG_FILE)) return [];
  // `slice(-0)` is `slice(0)` — a request for zero events would return the
  // entire log. Asking for none means none.
  if (limit <= 0) return [];
  const { events, skipped } = parseLog(LOG_FILE);
  lastSkipped = skipped;
  return events.slice(-limit);
}

function readAllEvents(): TelemetryEvent[] {
  lastSkipped = 0;
  const events: TelemetryEvent[] = [];

  // Current file first, then every rotated file.
  const files = existsSync(LOG_FILE) ? [LOG_FILE, ...rotatedFiles()] : rotatedFiles();
  for (const f of files) {
    const parsed = parseLog(f);
    events.push(...parsed.events);
    lastSkipped += parsed.skipped;
  }

  return events;
}

export function exportEvents(options?: { from?: Date; to?: Date; sessionId?: string }): TelemetryEvent[] {
  const all = readAllEvents();
  return all.filter((e) => {
    if (options?.from || options?.to) {
      const ts = new Date(e.timestamp).getTime();
      if (options.from && ts < options.from.getTime()) return false;
      if (options.to && ts > options.to.getTime()) return false;
    }
    if (options?.sessionId && e.sessionId !== options.sessionId) return false;
    return true;
  });
}

export function listSessions(): SessionSummary[] {
  const all = readAllEvents();
  const groups: Record<string, TelemetryEvent[]> = {};
  for (const e of all) {
    if (!groups[e.sessionId]) groups[e.sessionId] = [];
    groups[e.sessionId].push(e);
  }

  return Object.entries(groups)
    .map(([sid, evts]) => {
      const sorted = evts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const firstTs = new Date(first.timestamp).getTime();
      const lastTs = new Date(last.timestamp).getTime();
      const errors = sorted.filter((e) => !e.success).length;
      return {
        sessionId: sid,
        eventCount: sorted.length,
        errorRate: Math.round((errors / sorted.length) * 1000) / 10,
        firstTimestamp: first.timestamp,
        lastTimestamp: last.timestamp,
        durationMs: lastTs - firstTs,
      };
    })
    .sort((a, b) => new Date(b.firstTimestamp).getTime() - new Date(a.firstTimestamp).getTime());
}

export function pruneEvents(olderThanDays: number = RETENTION_DAYS): number {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  for (const f of rotatedFiles()) {
    const basename = f.split("/").pop() || "";
    const dateStr = parseRotatedDate(basename);
    if (!dateStr) continue;

    const fileDate = new Date(dateStr + "T00:00:00Z").getTime();
    if (fileDate < cutoff) {
      try {
        unlinkSync(f);
        deleted++;
      } catch {}
    }
  }

  prunePayloads();
  return deleted;
}

/**
 * Delete payload objects no surviving record points at. Pruning events without
 * this leaves the store growing forever — the object outlives the only line
 * that could ever ask for it.
 */
export function prunePayloads(): number {
  if (!existsSync(payloadsDir())) return 0;
  const referenced = new Set<string>();
  for (const e of readAllEvents()) if (e.diffRef) referenced.add(e.diffRef);

  let removed = 0;
  for (const f of readdirSync(payloadsDir())) {
    const ref = f.replace(/\.txt$/, "");
    if (f === ref || referenced.has(ref)) continue;
    try { unlinkSync(join(payloadsDir(), f)); removed++; } catch {}
  }
  return removed;
}

export function clearEvents(): void {
  try {
    if (existsSync(LOG_FILE)) {
      writeFileSync(LOG_FILE, "");
    }
    // Also clean up rotated files
    for (const f of rotatedFiles()) {
      try { unlinkSync(f); } catch {}
    }
    // Payloads outlive the records that referenced them unless swept here, and
    // a "cleared" log that still has megabytes of diffs under it is not clear.
    if (existsSync(payloadsDir())) {
      for (const f of readdirSync(payloadsDir())) {
        try { unlinkSync(join(payloadsDir(), f)); } catch {}
      }
    }
  } catch {}
}

export function summary(): Record<string, { count: number; success: number; avg_ms: number }> {
  const events = readAllEvents().slice(-10000);
  const buckets: Record<string, { count: number; success: number; total_ms: number }> = {};
  for (const e of events) {
    const key = `${e.route}:${e.operation}`;
    if (!buckets[key]) buckets[key] = { count: 0, success: 0, total_ms: 0 };
    buckets[key].count++;
    if (e.success) buckets[key].success++;
    buckets[key].total_ms += e.elapsed_ms;
  }
  const result: Record<string, { count: number; success: number; avg_ms: number }> = {};
  for (const [k, v] of Object.entries(buckets)) {
    result[k] = {
      count: v.count,
      success: v.success,
      avg_ms: Math.round(v.total_ms / v.count),
    };
  }
  return result;
}

export interface HealthReport {
  totalEvents: number;
  windowDays: number;
  routeDistribution: Record<string, { count: number; success: number }>;
  fallbackFrequency: Record<string, number>;
  staleAnchors: { total: number; recovered: number; failed: number };
  perLanguage: Record<string, { operations: number; failures: number }>;
  verifyFailures: { total: number; byCheck: Record<string, number> };
  topFallbackCauses: { reason: string; count: number }[];
  warnings: string[];
}

function computeHealthFromEvents(events: TelemetryEvent[], windowDays: number): Omit<HealthReport, "topFallbackCauses" | "warnings"> {
  const routeDistribution: Record<string, { count: number; success: number }> = {};
  for (const e of events) {
    const r = routeDistribution[e.route] || (routeDistribution[e.route] = { count: 0, success: 0 });
    r.count++;
    if (e.success) r.success++;
  }

  const fallbackFrequency: Record<string, number> = {};
  for (const e of events) {
    if (e.fallback_reason) {
      fallbackFrequency[e.fallback_reason] = (fallbackFrequency[e.fallback_reason] || 0) + 1;
    }
  }

  const replaceHashEvents = events.filter((e) => e.operation === "replace-hash");
  const staleAnchors = {
    total: replaceHashEvents.filter((e) => (e.retries ?? 0) > 0 || e.fallback_reason === "stale-anchor").length,
    recovered: replaceHashEvents.filter((e) => (e.retries ?? 0) > 0).length,
    failed: replaceHashEvents.filter((e) => e.fallback_reason === "stale-anchor" && !e.success).length,
  };

  const perLanguage: Record<string, { operations: number; failures: number }> = {};
  for (const e of events) {
    if (e.language) {
      const l = perLanguage[e.language] || (perLanguage[e.language] = { operations: 0, failures: 0 });
      l.operations++;
      if (!e.success) l.failures++;
    }
  }

  const verifyEvents = events.filter((e) => e.operation === "verify-changes");
  const verifyFailures = { total: 0, byCheck: {} as Record<string, number> };
  for (const e of verifyEvents) {
    if (!e.success) verifyFailures.total++;
    if (e.failed_in) {
      for (const check of e.failed_in) {
        verifyFailures.byCheck[check] = (verifyFailures.byCheck[check] || 0) + 1;
      }
    }
  }

  return {
    totalEvents: events.length,
    windowDays,
    routeDistribution,
    fallbackFrequency,
    staleAnchors,
    perLanguage,
    verifyFailures,
  };
}

export function health(windowDays: number = 7): HealthReport {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const events = readAllEvents().filter((e) => {
    return new Date(e.timestamp).getTime() >= cutoff;
  });

  const base = computeHealthFromEvents(events, windowDays);
  const { routeDistribution, staleAnchors, perLanguage, verifyFailures } = base;

  const replaceHashCount = events.filter((e) => e.operation === "replace-hash").length;
  const verifyEventCount = events.filter((e) => e.operation === "verify-changes").length;
  const verifyFailCount = verifyFailures.total;

  const fc: Record<string, number> = {};
  for (const e of events) {
    if (e.fallback_reason) fc[e.fallback_reason] = (fc[e.fallback_reason] || 0) + 1;
  }
  const topFallbackCauses = Object.entries(fc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));

  const warnings: string[] = [];

  if (replaceHashCount > 0) {
    const staleRate = staleAnchors.total / replaceHashCount;
    if (staleRate > 0.1) {
      warnings.push(
        `Stale-anchor rate ${(staleRate * 100).toFixed(0)}% exceeds threshold of 10% (${staleAnchors.total}/${replaceHashCount} replace-hash calls)`
      );
    }
  }

  const diffCount = routeDistribution["diff"]?.count ?? 0;
  if (events.length > 0 && diffCount / events.length > 0.1) {
    warnings.push(
      `Fallback-to-diff rate ${((diffCount / events.length) * 100).toFixed(0)}% exceeds threshold of 10%`
    );
  }

  if (verifyEventCount > 0) {
    const verifyFailRate = verifyFailCount / verifyEventCount;
    if (verifyFailRate > 0.2) {
      warnings.push(
        `Verify-changes failure rate ${(verifyFailRate * 100).toFixed(0)}% exceeds threshold of 20% (${verifyFailCount}/${verifyEventCount})`
      );
    }
  }

  for (const [lang, stats] of Object.entries(perLanguage)) {
    if (stats.operations >= 3 && stats.failures / stats.operations > 0.3) {
      warnings.push(
        `Language '${lang}' failure rate ${((stats.failures / stats.operations) * 100).toFixed(0)}% exceeds threshold of 30% (${stats.failures}/${stats.operations})`
      );
    }
  }

  return {
    ...base,
    topFallbackCauses,
    warnings,
  };
}

export interface HealthTrend {
  current: HealthReport;
  previous: HealthReport;
  changes: {
    totalEventsDelta: number;
    errorRateDelta: number; // percentage points
    staleAnchorDelta: number;
    verifyFailureDelta: number;
    newWarnings: string[];
    resolvedWarnings: string[];
    languageRegressions: string[];
  };
}

export function healthTrend(windowDays: number = 7): HealthTrend {
  const current = health(windowDays);
  const previous = healthFromWindow(windowDays * 2, windowDays);
  const changes = compareHealth(current, previous);
  return { current, previous, changes };
}

function healthFromWindow(pastDays: number, offsetDays: number): HealthReport {
  const now = Date.now();
  const windowEnd = now - offsetDays * 24 * 60 * 60 * 1000;
  const windowStart = now - pastDays * 24 * 60 * 60 * 1000;

  const events = readAllEvents().filter((e) => {
    const ts = new Date(e.timestamp).getTime();
    return ts >= windowStart && ts < windowEnd;
  });

  const base = computeHealthFromEvents(events, pastDays);
  return {
    ...base,
    topFallbackCauses: [],
    warnings: [],
  };
}

function compareHealth(current: HealthReport, previous: HealthReport): HealthTrend["changes"] {
  const newWarnings: string[] = [];
  const resolvedWarnings: string[] = [];

  const currentWarnSet = new Set(current.warnings);
  const prevWarnSet = new Set(previous.warnings);
  for (const w of current.warnings) {
    if (!prevWarnSet.has(w)) newWarnings.push(w);
  }
  for (const w of previous.warnings) {
    if (!currentWarnSet.has(w)) resolvedWarnings.push(w);
  }

  const curTotal = current.totalEvents || 1;
  const prevTotal = previous.totalEvents || 1;
  const curErrors = current.totalEvents - Object.values(current.routeDistribution).reduce((s, r) => s + r.success, 0);
  const prevErrors = previous.totalEvents - Object.values(previous.routeDistribution).reduce((s, r) => s + r.success, 0);
  const errorRateDelta = ((curErrors / curTotal) - (prevErrors / prevTotal)) * 100;

  const staleAnchorDelta = current.staleAnchors.total - previous.staleAnchors.total;

  const curVerifyOps = current.routeDistribution["verify"]?.count || 1;
  const curVerifyRate = current.verifyFailures.total / curVerifyOps;
  const prevVerifyOps = previous.routeDistribution["verify"]?.count || 1;
  const prevVerifyRate = previous.verifyFailures.total / prevVerifyOps;
  const verifyFailureDelta = (curVerifyRate - prevVerifyRate) * 100;

  const languageRegressions: string[] = [];
  for (const [lang, curStats] of Object.entries(current.perLanguage)) {
    const prevStats = previous.perLanguage[lang];
    if (prevStats) {
      const curFailRate = curStats.failures / Math.max(1, curStats.operations);
      const prevFailRate = prevStats.failures / Math.max(1, prevStats.operations);
      if (curFailRate > prevFailRate && curFailRate > 0.1) {
        languageRegressions.push(`${lang} (${(prevFailRate * 100).toFixed(0)}% → ${(curFailRate * 100).toFixed(0)}% failure rate)`);
      }
    }
  }

  return {
    totalEventsDelta: current.totalEvents - previous.totalEvents,
    errorRateDelta: Math.round(errorRateDelta * 10) / 10,
    staleAnchorDelta,
    verifyFailureDelta: Math.round(verifyFailureDelta * 10) / 10,
    newWarnings,
    resolvedWarnings,
    languageRegressions,
  };
}
