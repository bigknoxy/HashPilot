import { mkdirSync, appendFileSync, readFileSync, existsSync, writeFileSync, renameSync, unlinkSync, statSync, readdirSync } from "fs";
import { join } from "path";
import type { TelemetryConfig } from "./config";

const LOG_DIR = join(process.env.HOME || "/root", ".agentic-tools", "logs");
const LOG_FILE = join(LOG_DIR, "telemetry.jsonl");
const ROTATED_FILE_RE = /^telemetry-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.jsonl$/;

// Configurable defaults
export let MAX_FILE_SIZE = 10 * 1024 * 1024;
export let MAX_ROTATED_FILES = 10;
export let RETENTION_DAYS = 30;

export function configureTelemetry(cfg: TelemetryConfig): void {
  if (cfg.maxFileSize !== undefined) MAX_FILE_SIZE = cfg.maxFileSize;
  if (cfg.maxRotatedFiles !== undefined) MAX_ROTATED_FILES = cfg.maxRotatedFiles;
  if (cfg.retentionDays !== undefined) RETENTION_DAYS = cfg.retentionDays;
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
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
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

// --- Core functions ---

export function recordEvent(event: Omit<TelemetryEvent, "timestamp" | "sessionId">): void {
  if (!sessionEnabled) return;
  try {
    ensureLogDir();
    maybeRotate();
    const entry: TelemetryEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      sessionId,
    };
    appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  } catch {}
}

export function readEvents(limit: number = 100): TelemetryEvent[] {
  try {
    if (!existsSync(LOG_FILE)) return [];
    const content = readFileSync(LOG_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function readAllEvents(): TelemetryEvent[] {
  const events: TelemetryEvent[] = [];

  // Read current file first
  try {
    if (existsSync(LOG_FILE)) {
      const content = readFileSync(LOG_FILE, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      for (const l of lines) {
        try { events.push(JSON.parse(l)); } catch {}
      }
    }
  } catch {}

  // Read all rotated files
  for (const f of rotatedFiles()) {
    try {
      const content = readFileSync(f, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      for (const l of lines) {
        try { events.push(JSON.parse(l)); } catch {}
      }
    } catch {}
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

  return deleted;
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

export function health(windowDays: number = 7): HealthReport {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const events = readAllEvents().filter((e) => {
    return new Date(e.timestamp).getTime() >= cutoff;
  });

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

  const fc: Record<string, number> = {};
  for (const e of events) {
    if (e.fallback_reason) fc[e.fallback_reason] = (fc[e.fallback_reason] || 0) + 1;
  }
  const topFallbackCauses = Object.entries(fc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));

  const warnings: string[] = [];

  if (replaceHashEvents.length > 0) {
    const staleRate = staleAnchors.total / replaceHashEvents.length;
    if (staleRate > 0.1) {
      warnings.push(
        `Stale-anchor rate ${(staleRate * 100).toFixed(0)}% exceeds threshold of 10% (${staleAnchors.total}/${replaceHashEvents.length} replace-hash calls)`
      );
    }
  }

  const diffCount = routeDistribution["diff"]?.count ?? 0;
  if (events.length > 0 && diffCount / events.length > 0.1) {
    warnings.push(
      `Fallback-to-diff rate ${((diffCount / events.length) * 100).toFixed(0)}% exceeds threshold of 10%`
    );
  }

  if (verifyEvents.length > 0) {
    const verifyFailRate = verifyEvents.filter((e) => !e.success).length / verifyEvents.length;
    if (verifyFailRate > 0.2) {
      warnings.push(
        `Verify-changes failure rate ${(verifyFailRate * 100).toFixed(0)}% exceeds threshold of 20% (${verifyFailures.total}/${verifyEvents.length})`
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
    totalEvents: events.length,
    windowDays,
    routeDistribution,
    fallbackFrequency,
    staleAnchors,
    perLanguage,
    verifyFailures,
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
    windowDays: pastDays,
    routeDistribution,
    fallbackFrequency,
    staleAnchors,
    perLanguage,
    verifyFailures,
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
