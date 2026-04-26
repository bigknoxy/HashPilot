import { mkdirSync, appendFileSync, readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.env.HOME || "/root", ".agentic-tools", "logs");
const LOG_FILE = join(LOG_DIR, "telemetry.jsonl");

export interface TelemetryEvent {
  timestamp: string;
  operation: string;
  route: "ast" | "hash" | "diff" | "read" | "grep" | "verify" | "other";
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
}

let sessionEnabled = true;

export function enableTelemetry(on: boolean = true): void {
  sessionEnabled = on;
}

export function recordEvent(event: Omit<TelemetryEvent, "timestamp">): void {
  if (!sessionEnabled) return;
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    const entry: TelemetryEvent = {
      ...event,
      timestamp: new Date().toISOString(),
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

export function clearEvents(): void {
  try {
    if (existsSync(LOG_FILE)) {
      writeFileSync(LOG_FILE, "");
    }
  } catch {}
}

export function summary(): Record<string, { count: number; success: number; avg_ms: number }> {
  const events = readEvents(10000);
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
  const events = readEvents(10000).filter((e) => {
    const age = Date.now() - new Date(e.timestamp).getTime();
    return age < windowDays * 24 * 60 * 60 * 1000;
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
  // Previous window is the same length, ending at the start of the current window
  const previous = healthFromWindow(windowDays * 2, windowDays * 2 - windowDays);
  const changes = compareHealth(current, previous);
  return { current, previous, changes };
}

function healthFromWindow(pastDays: number, offsetDays: number): HealthReport {
  const now = Date.now();
  const windowEnd = now - offsetDays * 24 * 60 * 60 * 1000;
  const windowStart = now - pastDays * 24 * 60 * 60 * 1000;

  const events = readEvents(10000).filter((e) => {
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

  // Warnings that appeared or disappeared
  const currentWarnSet = new Set(current.warnings);
  const prevWarnSet = new Set(previous.warnings);
  for (const w of current.warnings) {
    if (!prevWarnSet.has(w)) newWarnings.push(w);
  }
  for (const w of previous.warnings) {
    if (!currentWarnSet.has(w)) resolvedWarnings.push(w);
  }

  // Error rate delta
  const curTotal = current.totalEvents || 1;
  const prevTotal = previous.totalEvents || 1;
  const curErrors = current.totalEvents - Object.values(current.routeDistribution).reduce((s, r) => s + r.success, 0);
  const prevErrors = previous.totalEvents - Object.values(previous.routeDistribution).reduce((s, r) => s + r.success, 0);
  const errorRateDelta = ((curErrors / curTotal) - (prevErrors / prevTotal)) * 100;

  // Stale anchor count delta
  const staleAnchorDelta = current.staleAnchors.total - previous.staleAnchors.total;

  // Verify failure rate delta
  const curVerifyRate = current.verifyFailures.total / Math.max(1, Object.values(current.routeDistribution).filter(r => r.count > 0).length);
  const prevVerifyRate = previous.verifyFailures.total / Math.max(1, Object.values(previous.routeDistribution).filter(r => r.count > 0).length);
  const verifyFailureDelta = (curVerifyRate - prevVerifyRate) * 100;

  // Language regressions: languages that gained failures
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

