import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  recordEvent,
  readEvents,
  clearEvents,
  exportEvents,
  pruneEvents,
  prunePayloads,
  configureTelemetry,
  MAX_RECORD_BYTES,
} from "../src/core/telemetry";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.env.HOME || "/root", ".agentic-tools", "logs");
const LOG_FILE = join(LOG_DIR, "telemetry.jsonl");
const PAYLOADS = join(LOG_DIR, "payloads");

/** A diff far past any plausible record cap — the #20 case. */
const BIG_DIFF = Array.from({ length: 4000 }, (_, i) => `+ line ${i} of a very large edit`).join("\n");

function logLines(): string[] {
  if (!existsSync(LOG_FILE)) return [];
  return readFileSync(LOG_FILE, "utf-8").trim().split("\n").filter(Boolean);
}

describe("record size cap (#20)", () => {
  beforeEach(() => clearEvents());
  afterEach(() => clearEvents());

  test("an oversized diff is stored out-of-line, not inlined in the record", () => {
    recordEvent({ operation: "cap-1", route: "ast", success: true, elapsed_ms: 1, diff: BIG_DIFF });

    const lines = logLines();
    expect(lines.length).toBe(1);
    expect(Buffer.byteLength(lines[0])).toBeLessThanOrEqual(MAX_RECORD_BYTES);

    const raw = JSON.parse(lines[0]);
    expect(raw.diff).toBeUndefined();
    expect(typeof raw.diffRef).toBe("string");
    expect(raw.diffBytes).toBe(Buffer.byteLength(BIG_DIFF));
  });

  test("readers see the diff rehydrated, so the query contract is unchanged", () => {
    recordEvent({ operation: "cap-2", route: "ast", success: true, elapsed_ms: 1, diff: BIG_DIFF });

    const [event] = readEvents(10);
    expect(event.diff).toBe(BIG_DIFF);
  });

  test("a small diff stays inline — no payload object is created", () => {
    recordEvent({ operation: "cap-3", route: "ast", success: true, elapsed_ms: 1, diff: "+ one line\n" });

    const raw = JSON.parse(logLines()[0]);
    expect(raw.diff).toBe("+ one line\n");
    expect(raw.diffRef).toBeUndefined();
  });

  test("the same diff twice costs one payload object", () => {
    recordEvent({ operation: "cap-4a", route: "ast", success: true, elapsed_ms: 1, diff: BIG_DIFF });
    recordEvent({ operation: "cap-4b", route: "ast", success: true, elapsed_ms: 1, diff: BIG_DIFF });

    expect(readdirSync(PAYLOADS).filter((f) => f.endsWith(".txt")).length).toBe(1);
    expect(exportEvents().filter((e) => e.diff === BIG_DIFF).length).toBe(2);
  });

  test("a pruned payload leaves the record readable, minus the diff", () => {
    recordEvent({ operation: "cap-5", route: "ast", success: true, elapsed_ms: 1, diff: BIG_DIFF });
    for (const f of readdirSync(PAYLOADS)) unlinkSync(join(PAYLOADS, f));

    const [event] = readEvents(10);
    expect(event.operation).toBe("cap-5");
    expect(event.diff).toBeUndefined();
    expect(event.diffBytes).toBe(Buffer.byteLength(BIG_DIFF));
  });

  test("prunePayloads deletes objects nothing references, and keeps the rest", () => {
    recordEvent({ operation: "cap-6", route: "ast", success: true, elapsed_ms: 1, diff: BIG_DIFF });
    mkdirSync(PAYLOADS, { recursive: true });
    const orphan = join(PAYLOADS, "0".repeat(32) + ".txt");
    writeFileSync(orphan, "nothing points here");

    expect(prunePayloads()).toBe(1);
    expect(existsSync(orphan)).toBe(false);
    expect(readEvents(10)[0].diff).toBe(BIG_DIFF);
  });

  test("clearEvents leaves no payloads behind", () => {
    recordEvent({ operation: "cap-7", route: "ast", success: true, elapsed_ms: 1, diff: BIG_DIFF });
    clearEvents();

    expect(existsSync(PAYLOADS) ? readdirSync(PAYLOADS) : []).toEqual([]);
  });

  test("the cap is configurable", () => {
    configureTelemetry({ maxRecordBytes: 200 });
    try {
      recordEvent({ operation: "cap-8", route: "ast", success: true, elapsed_ms: 1, diff: "x".repeat(500) });
      expect(JSON.parse(logLines()[0]).diffRef).toBeDefined();
    } finally {
      configureTelemetry({ maxRecordBytes: 4096 });
    }
  });
});

describe("concurrent writers (#20)", () => {
  beforeEach(() => clearEvents());
  afterEach(() => clearEvents());

  test("every line of the log parses after N processes write in parallel", async () => {
    const WRITERS = 8;
    const PER_WRITER = 40;
    const script = join(import.meta.dir, "__tmp_telemetry_writer__.ts");
    writeFileSync(script, `
      import { recordEvent } from "${join(import.meta.dir, "..", "src", "core", "telemetry")}";
      const diff = Array.from({ length: 4000 }, (_, i) => "+ line " + i + " of a very large edit").join("\\n");
      for (let i = 0; i < ${PER_WRITER}; i++) {
        recordEvent({ operation: "concurrent", route: "ast", success: true, elapsed_ms: 1, diff: diff + i });
      }
    `);
    try {
      await Promise.all(
        Array.from({ length: WRITERS }, () =>
          Bun.spawn(["bun", "run", script], { stdout: "ignore", stderr: "ignore" }).exited
        )
      );

      const lines = logLines();
      expect(lines.length).toBe(WRITERS * PER_WRITER);
      for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
    } finally {
      unlinkSync(script);
    }
  }, 60_000);
});

describe("rotation retention (#20)", () => {
  beforeEach(() => clearEvents());
  afterEach(() => clearEvents());

  test("pruning removes the genuinely oldest files, not the lexicographically first", () => {
    // `telemetry-2026-01-10` sorts before `telemetry-2026-01-2` as a string.
    // Retention is by the date in the name, so ordering cannot decide it.
    const old = join(LOG_DIR, "telemetry-2020-01-10.jsonl");
    const recent = join(LOG_DIR, `telemetry-${new Date().toISOString().split("T")[0]}.jsonl`);
    mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(old, "");
    writeFileSync(recent, "");

    expect(pruneEvents(30)).toBe(1);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(recent)).toBe(true);
  });
});
