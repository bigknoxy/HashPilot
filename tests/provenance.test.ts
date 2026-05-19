import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { recordEvent, readEvents, clearEvents } from "../src/core/telemetry";
import {
  createChangeSet,
  buildProvenanceFields,
  provenanceQuery,
  changeSetQuery,
  formatProvenanceHuman,
} from "../src/core/provenance";
import type { ProvenanceEntry } from "../src/core/provenance";
import { computeHash } from "../src/core/read";

describe("createChangeSet", () => {
  test("returns valid UUID string", () => {
    const id = createChangeSet();
    expect(id.length).toBe(36);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  test("each call returns unique ID", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(createChangeSet());
    expect(ids.size).toBe(100);
  });
});

describe("buildProvenanceFields", () => {
  test("returns empty object when no input provided", () => {
    const fields = buildProvenanceFields({});
    expect(Object.keys(fields).length).toBe(0);
  });

  test("copies scalar identity fields", () => {
    const fields = buildProvenanceFields({
      actor: "claude-opus",
      taskId: "GH#42",
      changeSetId: "abc-123",
      reason: "rename for clarity",
      stepIndex: 0,
      stepTotal: 3,
    });
    expect(fields.actor).toBe("claude-opus");
    expect(fields.taskId).toBe("GH#42");
    expect(fields.changeSetId).toBe("abc-123");
    expect(fields.reason).toBe("rename for clarity");
    expect(fields.stepIndex).toBe(0);
    expect(fields.stepTotal).toBe(3);
  });

  test("computes beforeHash from source", () => {
    const source = "function hello() { return 1; }";
    const fields = buildProvenanceFields({ source });
    expect(fields.beforeHash).toBe(computeHash(source));
    expect(fields.afterHash).toBeUndefined();
    expect(fields.diff).toBeUndefined();
  });

  test("computes afterHash and diff when source and newSource differ", () => {
    const source = "function hello() { return 1; }";
    const newSource = "function hello() { return 2; }";
    const fields = buildProvenanceFields({
      source,
      newSource,
      filePath: "hello.ts",
    });
    expect(fields.afterHash).toBe(computeHash(newSource));
    expect(fields.diff).toContain("--- a/hello.ts");
    expect(fields.diff).toContain("+++ b/hello.ts");
    expect(fields.diff).toContain("return 1");
    expect(fields.diff).toContain("return 2");
  });

  test("does not produce diff when source equals newSource", () => {
    const source = "function hello() { return 1; }";
    const fields = buildProvenanceFields({ source, newSource: source });
    expect(fields.afterHash).toBe(computeHash(source));
    expect(fields.diff).toBeUndefined();
  });

  test("truncates context exceeding maxContextLength", () => {
    const longContext = "x".repeat(600);
    const fields = buildProvenanceFields({ context: longContext });
    expect(fields.context!.length).toBe(503); // 500 + "..."
    expect(fields.context).toEndWith("...");
  });

  test("does not truncate short context", () => {
    const short = "short context string";
    const fields = buildProvenanceFields({ context: short });
    expect(fields.context).toBe(short);
  });

  test("truncates actor exceeding max length", () => {
    const fields = buildProvenanceFields({ actor: "x".repeat(100) });
    expect(fields.actor!.length).toBe(80);
  });

  test("truncates taskId exceeding max length", () => {
    const fields = buildProvenanceFields({ taskId: "x".repeat(100) });
    expect(fields.taskId!.length).toBe(80);
  });

  test("truncates reason exceeding max length", () => {
    const fields = buildProvenanceFields({ reason: "x".repeat(300) });
    expect(fields.reason!.length).toBe(200);
  });

  test("computes hash from empty source", () => {
    const fields = buildProvenanceFields({ source: "" });
    expect(fields.beforeHash).toBe(computeHash(""));
    expect(fields.afterHash).toBeUndefined();
    expect(fields.diff).toBeUndefined();
  });

  test("allows undefined actor when no config defaultActor is set", () => {
    const { clearConfigCache } = require("../src/core/provenance");
    clearConfigCache();
    // When no actor provided and no config default, actor should be undefined
    const fields = buildProvenanceFields({ reason: "no actor test" });
    expect(fields.actor).toBeUndefined();
  });
});

describe("provenanceQuery", () => {
  beforeEach(() => clearEvents());
  afterEach(() => clearEvents());

  test("returns empty array for file with no edits", () => {
    const results = provenanceQuery("nonexistent.ts");
    expect(results).toEqual([]);
  });

  test("returns entries sorted by timestamp descending", () => {
    recordEvent({
      operation: "rename-symbol",
      route: "ast",
      file: "test.ts",
      success: true,
      elapsed_ms: 5,
      actor: "agent-1",
    });
    // Small delay to ensure distinct timestamps
    Bun.sleepSync(5);
    recordEvent({
      operation: "replace-hash",
      route: "hash",
      file: "test.ts",
      success: true,
      elapsed_ms: 10,
      actor: "agent-2",
    });

    const results = provenanceQuery("test.ts");
    expect(results.length).toBeGreaterThanOrEqual(2);
    // Most recent first
    const timestamps = results.map((r) => new Date(r.timestamp).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
    }
  });

  test("filters by file path", () => {
    recordEvent({
      operation: "rename-symbol",
      route: "ast",
      file: "foo.ts",
      success: true,
      elapsed_ms: 5,
    });
    recordEvent({
      operation: "replace-hash",
      route: "hash",
      file: "bar.ts",
      success: true,
      elapsed_ms: 5,
    });

    const fooResults = provenanceQuery("foo.ts");
    expect(fooResults.every((r) => r.operation === "rename-symbol")).toBe(
      true
    );

    const barResults = provenanceQuery("bar.ts");
    expect(barResults.every((r) => r.operation === "replace-hash")).toBe(true);
  });

  test("filters by line when diff covers the line", () => {
    const lines = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`);
    const source = lines.join("\n") + "\n";
    lines[6] = "line 7 modified";
    const newSource = lines.join("\n") + "\n";
    const provFields = buildProvenanceFields({
      source,
      newSource,
      filePath: "mod.ts",
      actor: "claude",
      reason: "edit line 7",
    });

    recordEvent({
      operation: "replace-hash",
      route: "hash",
      file: "mod.ts",
      success: true,
      elapsed_ms: 5,
      ...provFields,
    });

    // Line 7 is covered by the diff (the changed line itself)
    const resultsLine7 = provenanceQuery("mod.ts", 7);
    expect(resultsLine7.length).toBe(1);

    // Line 14 is outside the diff hunk (7 + 3 context = 10, so line 14 is far away)
    const resultsLine14 = provenanceQuery("mod.ts", 14);
    expect(resultsLine14.length).toBe(0);
  });

  test("excludes events without diff data in line-filtered query by default", () => {
    recordEvent({
      operation: "rename-symbol",
      route: "ast",
      file: "mystery.ts",
      success: true,
      elapsed_ms: 5,
      // no diff
    });

    const results = provenanceQuery("mystery.ts", 42);
    expect(results.length).toBe(0);
  });

  test("includes no-diff events in line-filtered query when fuzzy=true", () => {
    recordEvent({
      operation: "rename-symbol",
      route: "ast",
      file: "mystery.ts",
      success: true,
      elapsed_ms: 5,
      // no diff
    });

    const results = provenanceQuery("mystery.ts", 42, true);
    expect(results.length).toBe(1);
  });
});

describe("changeSetQuery", () => {
  beforeEach(() => clearEvents());
  afterEach(() => clearEvents());

  test("returns null for nonexistent changeSetId", () => {
    const result = changeSetQuery("nonexistent-id");
    expect(result).toBeNull();
  });

  test("groups all edits with same changeSetId together", () => {
    const csId = "test-cs-1";

    recordEvent({
      operation: "rename-symbol",
      route: "ast",
      file: "a.ts",
      success: true,
      elapsed_ms: 5,
      changeSetId: csId,
      actor: "claude",
      reason: "step 1",
    });
    recordEvent({
      operation: "replace-hash",
      route: "hash",
      file: "b.ts",
      success: true,
      elapsed_ms: 10,
      changeSetId: csId,
      actor: "claude",
      reason: "step 2",
    });

    const result = changeSetQuery(csId);
    expect(result).not.toBeNull();
    expect(result!.changeSetId).toBe(csId);
    expect(result!.editCount).toBe(2);
    expect(result!.entries.length).toBe(2);
    expect(result!.actor).toBe("claude");
  });

  test("entries sorted by timestamp ascending within ChangeSet", () => {
    const csId = "test-cs-2";

    recordEvent({
      operation: "step-1",
      route: "ast",
      file: "a.ts",
      success: true,
      elapsed_ms: 5,
      changeSetId: csId,
    });
    Bun.sleepSync(5);
    recordEvent({
      operation: "step-2",
      route: "ast",
      file: "b.ts",
      success: true,
      elapsed_ms: 5,
      changeSetId: csId,
    });

    const result = changeSetQuery(csId);
    expect(result!.entries[0].operation).toBe("step-1");
    expect(result!.entries[1].operation).toBe("step-2");
    expect(result!.timeRange.first).toBe(result!.entries[0].timestamp);
    expect(result!.timeRange.last).toBe(result!.entries[1].timestamp);
  });

  test("excludes events not in the target ChangeSet", () => {
    recordEvent({
      operation: "correct",
      route: "ast",
      file: "a.ts",
      success: true,
      elapsed_ms: 5,
      changeSetId: "correct-cs",
    });
    recordEvent({
      operation: "wrong",
      route: "ast",
      file: "b.ts",
      success: true,
      elapsed_ms: 5,
      changeSetId: "wrong-cs",
    });

    const result = changeSetQuery("correct-cs");
    expect(result!.editCount).toBe(1);
    expect(result!.entries[0].operation).toBe("correct");
  });
});

describe("formatProvenanceHuman", () => {
  test('returns "No edits found for this file." for empty array', () => {
    expect(formatProvenanceHuman([])).toBe("No edits found for this file.");
  });

  test("formats entry with all fields present", () => {
    const entry: ProvenanceEntry = {
      timestamp: "2026-05-06T12:00:00.000Z",
      sessionId: "sess-1",
      actor: "claude-opus",
      taskId: "GH#42",
      changeSetId: "cs-1",
      reason: "renamed for clarity",
      operation: "rename-symbol",
      route: "ast",
      success: true,
      beforeHash: "abc123def456",
      afterHash: "789abc012def",
      diff: "@@ -1 +1 @@ ...",
      stepIndex: 0,
      stepTotal: 3,
      context: "short context",
      verification: "pass",
    };

    const output = formatProvenanceHuman([entry]);
    expect(output).toContain("claude-opus");
    expect(output).toContain("task=GH#42");
    expect(output).toContain("rename-symbol");
    expect(output).toContain("ast");
    expect(output).toContain("OK");
    expect(output).toContain("[1/3]");
  });
});

describe("telemetry integration", () => {
  beforeEach(() => clearEvents());
  afterEach(() => clearEvents());

  test("provenance fields survive recordEvent/readEvents round-trip", () => {
    const provFields = buildProvenanceFields({
      actor: "claude",
      taskId: "TSK-1",
      changeSetId: createChangeSet(),
      reason: "test round trip",
      source: "const x = 1;",
      newSource: "const x = 2;",
      stepIndex: 2,
      stepTotal: 5,
      context: "agent prompt here",
      filePath: "roundtrip.ts",
    });

    recordEvent({
      operation: "rename-symbol",
      route: "ast",
      file: "roundtrip.ts",
      success: true,
      elapsed_ms: 15,
      ...provFields,
    });

    const events = readEvents(10);
    const saved = events.find((e) => e.file === "roundtrip.ts");
    expect(saved).toBeDefined();
    expect(saved!.actor).toBe("claude");
    expect(saved!.taskId).toBe("TSK-1");
    expect(saved!.changeSetId).toBe(provFields.changeSetId);
    expect(saved!.reason).toBe("test round trip");
    expect(saved!.beforeHash).toBeDefined();
    expect(saved!.afterHash).toBeDefined();
    expect(saved!.diff).toBeDefined();
    expect(saved!.diff).toContain("--- a/roundtrip.ts");
    expect(saved!.stepIndex).toBe(2);
    expect(saved!.stepTotal).toBe(5);
    expect(saved!.context).toBe("agent prompt here");
  });

  test("provenanceQuery reads directly from telemetry log", () => {
    const source = "export function greet(name: string) { return `hi ${name}`; }";
    const newSource = "export function greet(name: string, suffix = '!') { return `hi ${name}${suffix}`; }";
    const provFields = buildProvenanceFields({
      source,
      newSource,
      filePath: "greet.ts",
      actor: "opus",
      reason: "add suffix param",
    });

    recordEvent({
      operation: "insert-parameter",
      route: "ast",
      file: "greet.ts",
      success: true,
      elapsed_ms: 42,
      ...provFields,
    });

    const results = provenanceQuery("greet.ts");
    expect(results.length).toBe(1);
    expect(results[0].actor).toBe("opus");
    expect(results[0].reason).toBe("add suffix param");
    expect(results[0].operation).toBe("insert-parameter");
    expect(results[0].beforeHash).toBeDefined();
    expect(results[0].afterHash).toBeDefined();
  });
});
