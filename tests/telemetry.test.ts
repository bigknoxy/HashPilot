import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { recordEvent, readEvents, clearEvents, summary, health, healthTrend } from "../src/core/telemetry";

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
    // A recovered anchor (retries > 0)
    recordEvent({ operation: "replace-hash", route: "hash", success: true, retries: 1, elapsed_ms: 1 });
    // A failed stale anchor
    recordEvent({ operation: "replace-hash", route: "hash", success: false, fallback_reason: "stale-anchor", retries: 0, elapsed_ms: 1 });
    // A successful match
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
