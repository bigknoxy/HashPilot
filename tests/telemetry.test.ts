import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  recordEvent,
  readEvents,
  clearEvents,
  summary,
  health,
  healthTrend,
  ErrorCode,
  listSessions,
  exportEvents,
  pruneEvents,
  getSessionId,
  configureTelemetry,
  MAX_FILE_SIZE,
  MAX_ROTATED_FILES,
  RETENTION_DAYS,
} from "../src/core/telemetry";
import { existsSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.env.HOME || "/root", ".agentic-tools", "logs");
const LOG_FILE = join(LOG_DIR, "telemetry.jsonl");

describe("session IDs", () => {
  beforeEach(() => clearEvents());
  afterEach(() => clearEvents());

  test("session ID is added to every event", () => {
    const events = [
      { operation: "test-1", route: "other" as const, success: true, elapsed_ms: 1 },
      { operation: "test-2", route: "other" as const, success: false, elapsed_ms: 2 },
    ];
    for (const e of events) recordEvent(e);

    const recorded = readEvents(100);
    expect(recorded.length).toBe(2);
    for (const r of recorded) {
      expect(r.sessionId).toBeDefined();
      expect(typeof r.sessionId).toBe("string");
      expect(r.sessionId.length).toBeGreaterThan(0);
    }
  });

  test("session ID persists across events in same invocation", () => {
    recordEvent({ operation: "test-1", route: "other" as const, success: true, elapsed_ms: 1 });
    recordEvent({ operation: "test-2", route: "other" as const, success: true, elapsed_ms: 1 });
    recordEvent({ operation: "test-3", route: "other" as const, success: true, elapsed_ms: 1 });

    const recorded = readEvents(100);
    const ids = new Set(recorded.map((r) => r.sessionId));
    expect(ids.size).toBe(1);
    expect(recorded[0].sessionId).toBe(getSessionId());
  });
});

describe("rotation", () => {
  const originalMaxSize = MAX_FILE_SIZE;
  const originalMaxFiles = MAX_ROTATED_FILES;

  beforeEach(() => {
    // Clean up any existing log files
    clearEvents();
  });

  afterEach(() => {
    clearEvents();
    // Restore original settings
    configureTelemetry({ maxFileSize: originalMaxSize, maxRotatedFiles: originalMaxFiles });
  });

  test("rotates file when it exceeds max file size", () => {
    // Set a very small max file size to trigger rotation quickly
    configureTelemetry({ maxFileSize: 500 });

    // Each event is ~160 bytes as JSON
    // Write enough events to exceed 500 bytes
    for (let i = 0; i < 6; i++) {
      recordEvent({
        operation: "test-rotate",
        route: "other",
        success: true,
        elapsed_ms: 1,
      });
    }

    // The original file should have been rotated and a new one started
    // The current file should contain fewer events (from the new file)
    const currentEvents = readEvents(100);
    expect(currentEvents.length).toBeGreaterThan(0);
    // We wrote 6 events total; the first few should have been rotated out,
    // so the current file should have fewer than 6 events
    expect(currentEvents.length).toBeLessThan(6);
  });

  test("enforces max rotated files limit", () => {
    // Set small max file size and limit rotated files
    configureTelemetry({ maxFileSize: 300, maxRotatedFiles: 2 });

    // Write many batches to trigger multiple rotations
    for (let batch = 0; batch < 5; batch++) {
      for (let i = 0; i < 3; i++) {
        recordEvent({
          operation: "test-limit",
          route: "other",
          success: true,
          elapsed_ms: 1,
        });
      }
    }

    // Only the events from the current file plus rotated files (max 2) should exist
    // We can verify that events are still recorded without error
    const sess = listSessions();
    expect(sess.length).toBeGreaterThan(0);
  });
});

describe("listSessions", () => {
  beforeEach(() => clearEvents());
  afterEach(() => clearEvents());

  test("returns empty array when no events", () => {
    const sessions = listSessions();
    expect(sessions).toEqual([]);
  });

  test("groups events by session ID", () => {
    // All events in this test run share the same session ID
    recordEvent({ operation: "test-1", route: "other" as const, success: true, elapsed_ms: 1 });
    recordEvent({ operation: "test-2", route: "other" as const, success: false, elapsed_ms: 2 });

    const sessions = listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].sessionId).toBe(getSessionId());
    expect(sessions[0].eventCount).toBe(2);
    expect(sessions[0].errorRate).toBe(50); // 1 out of 2 failed = 50%
  });

  test("computes session duration and timestamps", () => {
    recordEvent({ operation: "test-1", route: "other" as const, success: true, elapsed_ms: 1 });
    recordEvent({ operation: "test-2", route: "other" as const, success: true, elapsed_ms: 1 });

    const sessions = listSessions();
    expect(sessions[0].firstTimestamp).toBeDefined();
    expect(sessions[0].lastTimestamp).toBeDefined();
    expect(sessions[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  test("accurate error rate calculation", () => {
    recordEvent({ operation: "ok-1", route: "ast" as const, success: true, elapsed_ms: 1 });
    recordEvent({ operation: "ok-2", route: "ast" as const, success: true, elapsed_ms: 1 });
    recordEvent({ operation: "fail-1", route: "ast" as const, success: false, elapsed_ms: 1 });

    const sessions = listSessions();
    // 1 failure out of 3 = 33.3%, rounded to 1 decimal = 33.3
    expect(sessions[0].errorRate).toBeCloseTo(33.3, 1);
  });
});

describe("exportEvents", () => {
  beforeEach(() => clearEvents());
  afterEach(() => clearEvents());

  test("returns all events when no filters", () => {
    recordEvent({ operation: "test-1", route: "other" as const, success: true, elapsed_ms: 1 });
    recordEvent({ operation: "test-2", route: "other" as const, success: true, elapsed_ms: 1 });

    const events = exportEvents();
    expect(events.length).toBe(2);
  });

  test("filters by date range", () => {
    recordEvent({ operation: "test-1", route: "other" as const, success: true, elapsed_ms: 1 });
    recordEvent({ operation: "test-2", route: "other" as const, success: true, elapsed_ms: 1 });

    // Filter to a future range (should return nothing)
    const future = exportEvents({ from: new Date("2099-01-01") });
    expect(future.length).toBe(0);

    // Filter to include recent events
    const fromYesterday = exportEvents({ from: new Date(Date.now() - 86400000) });
    expect(fromYesterday.length).toBe(2);

    // Filter to past range
    const past = exportEvents({ to: new Date("2020-01-01") });
    expect(past.length).toBe(0);
  });

  test("filters by session ID", () => {
    const sid = getSessionId();
    recordEvent({ operation: "test-1", route: "other" as const, success: true, elapsed_ms: 1 });

    const matched = exportEvents({ sessionId: sid });
    expect(matched.length).toBe(1);
    expect(matched[0].sessionId).toBe(sid);

    const mismatched = exportEvents({ sessionId: "nonexistent-id" });
    expect(mismatched.length).toBe(0);
  });
});

describe("pruneEvents", () => {
  beforeEach(() => {
    clearEvents();
    // Ensure log dir exists
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  });

  afterEach(() => {
    clearEvents();
  });

  test("removes old rotated files", () => {
    // Create a rotated file with an old date
    const oldFile = join(LOG_DIR, "telemetry-2020-01-01.jsonl");
    writeFileSync(oldFile, '{"test":true}\n');

    // Also create a recent rotated file
    const today = new Date().toISOString().split("T")[0];
    const recentFile = join(LOG_DIR, `telemetry-${today}.jsonl`);
    writeFileSync(recentFile, '{"test":true}\n');

    const deleted = pruneEvents(30);
    // The 2020 file should be pruned (older than 30 days)
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(existsSync(oldFile)).toBe(false);

    // The recent file should still exist
    expect(existsSync(recentFile)).toBe(true);

    // Clean up recent file
    try { unlinkSync(recentFile); } catch {}
  });

  test("returns count of deleted files", () => {
    // Create multiple old files
    for (let i = 0; i < 3; i++) {
      const oldFile = join(LOG_DIR, `telemetry-2020-01-0${i + 1}.jsonl`);
      writeFileSync(oldFile, '{"test":true}\n');
    }

    const deleted = pruneEvents(30);
    expect(deleted).toBe(3);
  });

  test("no files deleted when all are recent", () => {
    const today = new Date().toISOString().split("T")[0];
    const recentFile = join(LOG_DIR, `telemetry-${today}.jsonl`);
    writeFileSync(recentFile, '{"test":true}\n');

    const deleted = pruneEvents(30);
    expect(deleted).toBe(0);

    // Clean up
    try { unlinkSync(recentFile); } catch {}
  });
});

describe("TelemetryConfig defaults", () => {
  test("MAX_FILE_SIZE defaults to 10MB", () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });

  test("MAX_ROTATED_FILES defaults to 10", () => {
    expect(MAX_ROTATED_FILES).toBe(10);
  });

  test("RETENTION_DAYS defaults to 30", () => {
    expect(RETENTION_DAYS).toBe(30);
  });

  test("configureTelemetry updates values", () => {
    const origSize = MAX_FILE_SIZE;
    const origFiles = MAX_ROTATED_FILES;
    const origDays = RETENTION_DAYS;

    configureTelemetry({ maxFileSize: 2048, maxRotatedFiles: 5, retentionDays: 7 });
    expect(MAX_FILE_SIZE).toBe(2048);
    expect(MAX_ROTATED_FILES).toBe(5);
    expect(RETENTION_DAYS).toBe(7);

    // Restore
    configureTelemetry({ maxFileSize: origSize, maxRotatedFiles: origFiles, retentionDays: origDays });
  });

  test("configureTelemetry only updates provided fields", () => {
    const origFiles = MAX_ROTATED_FILES;
    const origDays = RETENTION_DAYS;

    configureTelemetry({ maxFileSize: 5000 });
    expect(MAX_FILE_SIZE).toBe(5000);
    expect(MAX_ROTATED_FILES).toBe(origFiles);
    expect(RETENTION_DAYS).toBe(origDays);

    // Restore
    configureTelemetry({ maxFileSize: 10 * 1024 * 1024 });
  });
});

describe("ErrorCode", () => {
  test("all error codes are defined", () => {
    expect(ErrorCode.STALE_ANCHOR).toBe("STALE_ANCHOR");
    expect(ErrorCode.SYMBOL_NOT_FOUND).toBe("SYMBOL_NOT_FOUND");
    expect(ErrorCode.PARSE_ERROR).toBe("PARSE_ERROR");
    expect(ErrorCode.FILE_NOT_FOUND).toBe("FILE_NOT_FOUND");
    expect(ErrorCode.DUPLICATE_MATCH).toBe("DUPLICATE_MATCH");
    expect(ErrorCode.UNSUPPORTED_LANGUAGE).toBe("UNSUPPORTED_LANGUAGE");
    expect(ErrorCode.HASH_MISMATCH).toBe("HASH_MISMATCH");
    expect(ErrorCode.WRITE_FAILED).toBe("WRITE_FAILED");
  });

  test("errorCode can be set on events", () => {
    recordEvent({
      operation: "test-error",
      route: "ast" as const,
      success: false,
      elapsed_ms: 1,
      errorCode: ErrorCode.PARSE_ERROR,
    });

    const events = readEvents(100);
    expect(events.length).toBe(1);
    expect(events[0].errorCode).toBe(ErrorCode.PARSE_ERROR);
  });
});

describe("health", () => {
  beforeEach(() => {
    clearEvents();
  });

  afterEach(() => {
    clearEvents();
  });

  test("returns empty report when no events exist", () => {
    const report = health(7);
    expect(report.totalEvents).toBe(0);
    expect(report.warnings).toEqual([]);
    expect(Object.keys(report.routeDistribution)).toHaveLength(0);
  });

  test("reports route distribution from recorded events", () => {
    recordEvent({ operation: "read-many", route: "read", files_count: 1, success: true, elapsed_ms: 1 });
    recordEvent({ operation: "rename-symbol", route: "ast", success: true, elapsed_ms: 2 });
    recordEvent({ operation: "replace-hash", route: "hash", success: true, elapsed_ms: 3 });

    const report = health(7);
    expect(report.totalEvents).toBe(3);
    expect(report.routeDistribution["read"].count).toBe(1);
    expect(report.routeDistribution["ast"].count).toBe(1);
    expect(report.routeDistribution["hash"].count).toBe(1);
  });

  test("reports per-language aggregation", () => {
    recordEvent({ operation: "rename-symbol", route: "ast", language: "typescript", success: true, elapsed_ms: 1 });
    recordEvent({ operation: "rename-symbol", route: "ast", language: "typescript", success: true, elapsed_ms: 1 });
    recordEvent({ operation: "add-import", route: "ast", language: "python", success: true, elapsed_ms: 1 });
    recordEvent({ operation: "remove-import", route: "ast", language: "rust", success: false, elapsed_ms: 1 });

    const report = health(7);
    expect(report.perLanguage["typescript"].operations).toBe(2);
    expect(report.perLanguage["typescript"].failures).toBe(0);
    expect(report.perLanguage["python"].operations).toBe(1);
    expect(report.perLanguage["rust"].failures).toBe(1);
  });

  test("reports stale-anchor and recovery stats", () => {
    recordEvent({ operation: "replace-hash", route: "hash", success: true, retries: 1, elapsed_ms: 1 });
    recordEvent({ operation: "replace-hash", route: "hash", success: false, fallback_reason: "stale-anchor", retries: 0, elapsed_ms: 1 });
    recordEvent({ operation: "replace-hash", route: "hash", success: true, retries: 0, elapsed_ms: 1 });

    const report = health(7);
    expect(report.staleAnchors.total).toBe(2);
    expect(report.staleAnchors.recovered).toBe(1);
    expect(report.staleAnchors.failed).toBe(1);
  });

  test("reports verify-failure breakdown", () => {
    recordEvent({ operation: "verify-changes", route: "verify", success: false, failed_in: ["formatter"], elapsed_ms: 1 });
    recordEvent({ operation: "verify-changes", route: "verify", success: false, failed_in: ["linter", "tests"], elapsed_ms: 1 });
    recordEvent({ operation: "verify-changes", route: "verify", success: true, elapsed_ms: 1 });

    const report = health(7);
    expect(report.verifyFailures.total).toBe(2);
    expect(report.verifyFailures.byCheck["formatter"]).toBe(1);
    expect(report.verifyFailures.byCheck["linter"]).toBe(1);
    expect(report.verifyFailures.byCheck["tests"]).toBe(1);
  });

  test("reports fallback frequency", () => {
    recordEvent({ operation: "replace-hash", route: "hash", success: false, fallback_reason: "stale-anchor", elapsed_ms: 1 });
    recordEvent({ operation: "replace-hash", route: "hash", success: false, fallback_reason: "stale-anchor", elapsed_ms: 1 });

    const report = health(7);
    expect(report.fallbackFrequency["stale-anchor"]).toBe(2);
    expect(report.topFallbackCauses[0].reason).toBe("stale-anchor");
    expect(report.topFallbackCauses[0].count).toBe(2);
  });

  test("generates threshold warnings for high stale-anchor rate", () => {
    recordEvent({ operation: "replace-hash", route: "hash", success: false, fallback_reason: "stale-anchor", elapsed_ms: 1 });
    recordEvent({ operation: "replace-hash", route: "hash", success: true, retries: 0, elapsed_ms: 1 });

    const report = health(7);
    const staleWarnings = report.warnings.filter((w) => w.includes("Stale-anchor rate"));
    expect(staleWarnings.length).toBeGreaterThanOrEqual(1);
  });

  test("generates threshold warnings for high language failure rate", () => {
    recordEvent({ operation: "rename-symbol", route: "ast", language: "rust", success: false, elapsed_ms: 1 });
    recordEvent({ operation: "rename-symbol", route: "ast", language: "rust", success: false, elapsed_ms: 1 });
    recordEvent({ operation: "rename-symbol", route: "ast", language: "rust", success: false, elapsed_ms: 1 });
    recordEvent({ operation: "rename-symbol", route: "ast", language: "rust", success: true, elapsed_ms: 1 });

    const report = health(7);
    const rustWarnings = report.warnings.filter((w) => w.includes("'rust'"));
    expect(rustWarnings.length).toBeGreaterThanOrEqual(1);
  });

  test("healthTrend returns current, previous, and changes", () => {
    recordEvent({ operation: "rename-symbol", route: "ast", language: "typescript", success: true, elapsed_ms: 1 });
    recordEvent({ operation: "replace-hash", route: "hash", success: true, retries: 0, elapsed_ms: 1 });

    const trend = healthTrend(7);
    expect(trend.current).toBeDefined();
    expect(trend.previous).toBeDefined();
    expect(trend.changes).toBeDefined();
    expect(typeof trend.changes.totalEventsDelta).toBe("number");
    expect(typeof trend.changes.errorRateDelta).toBe("number");
  });
});
