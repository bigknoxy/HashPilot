import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { computeHash } from "../src/core/read";
import { replaceHash } from "../src/core/hash-edit";
import { ErrorCode } from "../src/core/telemetry";

const TMP = join(import.meta.dir, "__tmp_test_recovery__");
const FILE = join(TMP, "sample.ts");

const BASE = [
  "const a = 1;",
  "const b = 2;",
  "function target() {",
  "  return 'payload';",
  "}",
  "const c = 3;",
];

function write(lines: string[]) {
  writeFileSync(FILE, lines.join("\n"));
}

function hashOf(lines: string[], start: number, end: number): string {
  return computeHash(lines.slice(start - 1, end).join("\n"));
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  write(BASE);
});
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("stale-anchor relocation", () => {
  test("relocates when the anchored block moved down", async () => {
    const anchor = hashOf(BASE, 3, 5);
    // Two lines inserted above: the block is now at 5-7.
    write(["// header", "// header", ...BASE]);

    const result = await replaceHash(FILE, anchor, "function target() {\n  return 'new';\n}", {
      range: { start: 3, end: 5 },
    });

    expect(result.success).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.retries).toBe(1);
    expect(result.relocatedTo).toEqual({ start: 5, end: 7 });

    const after = readFileSync(FILE, "utf-8").split("\n");
    expect(after).toHaveLength(8);
    expect(after[5]).toBe("  return 'new';");
    expect(after[0]).toBe("// header");
    expect(after[7]).toBe("const c = 3;");
  });

  test("refuses when the anchored content appears more than once", async () => {
    // A two-line block that occurs twice. The requested range no longer matches,
    // so relocation runs and finds two equally good candidates.
    const block = ["const a = 1;", "const b = 2;"];
    const anchor = computeHash(block.join("\n"));
    const lines = ["// header", "// header", ...block, "// mid", ...block];
    write(lines);

    const result = await replaceHash(FILE, anchor, "const a = 9;", { range: { start: 1, end: 2 } });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.AMBIGUOUS_ANCHOR);
    expect(readFileSync(FILE, "utf-8")).toBe(lines.join("\n"));
  });

  test("refuses when the anchored content is gone", async () => {
    const anchor = hashOf(BASE, 3, 5);
    write(["const a = 1;", "const b = 2;", "// deleted", "// deleted", "// deleted", "const c = 3;"]);

    const result = await replaceHash(FILE, anchor, "x", { range: { start: 3, end: 5 } });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.STALE_ANCHOR);
    expect(result.stale).toBe(true);
    expect(readFileSync(FILE, "utf-8")).toContain("// deleted");
  });

  test("a whole-file anchor mismatch never rewrites the file", async () => {
    // Regression: the old recovery path treated the whole file as the anchor
    // and replaced all of it with the new content.
    const anchor = computeHash(BASE.join("\n"));
    write([...BASE, "const d = 4;"]);

    const result = await replaceHash(FILE, anchor, "TOTALLY DIFFERENT");
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.STALE_ANCHOR);
    expect(readFileSync(FILE, "utf-8")).not.toContain("TOTALLY DIFFERENT");
  });

  test("recovery: \"off\" fails instead of relocating", async () => {
    const anchor = hashOf(BASE, 3, 5);
    write(["// header", ...BASE]);

    const result = await replaceHash(FILE, anchor, "x", { range: { start: 3, end: 5 }, recovery: "off" });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.STALE_ANCHOR);
  });

  test("noRecovery is still honored as the legacy spelling", async () => {
    const anchor = hashOf(BASE, 3, 5);
    write(["// header", ...BASE]);

    const result = await replaceHash(FILE, anchor, "x", { range: { start: 3, end: 5 }, noRecovery: true });
    expect(result.success).toBe(false);
  });

  test("a matching anchor applies without relocation", async () => {
    const anchor = hashOf(BASE, 3, 5);
    const result = await replaceHash(FILE, anchor, "function target() {\n  return 'new';\n}", {
      range: { start: 3, end: 5 },
    });
    expect(result.success).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.relocatedTo).toBeUndefined();
  });
});

describe("range validation", () => {
  const anchor = () => hashOf(BASE, 1, 1);

  test("rejects a NaN bound rather than duplicating the file", async () => {
    const result = await replaceHash(FILE, anchor(), "x", { range: { start: 1, end: NaN } });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.INVALID_ARGUMENT);
    expect(readFileSync(FILE, "utf-8")).toBe(BASE.join("\n"));
  });

  test("rejects a zero start (ranges are 1-indexed)", async () => {
    const result = await replaceHash(FILE, anchor(), "x", { range: { start: 0, end: 2 } });
    expect(result.errorCode).toBe(ErrorCode.INVALID_ARGUMENT);
  });

  test("rejects an inverted range", async () => {
    const result = await replaceHash(FILE, anchor(), "x", { range: { start: 3, end: 1 } });
    expect(result.errorCode).toBe(ErrorCode.INVALID_ARGUMENT);
  });

  test("rejects an end past the last line", async () => {
    const result = await replaceHash(FILE, anchor(), "x", { range: { start: 1, end: 999 } });
    expect(result.errorCode).toBe(ErrorCode.INVALID_ARGUMENT);
  });
});

describe("write boundary", () => {
  test("replaceHash refuses a target outside the project root", async () => {
    const outside = join(require("os").tmpdir(), "hashpilot-recovery-outside.ts");
    writeFileSync(outside, BASE.join("\n"));
    try {
      const result = await replaceHash(outside, computeHash(BASE.join("\n")), "x");
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.PATH_DENIED);
      expect(readFileSync(outside, "utf-8")).toBe(BASE.join("\n"));
    } finally {
      rmSync(outside, { force: true });
    }
  });

  test("a dry run needs no write permission", async () => {
    const outside = join(require("os").tmpdir(), "hashpilot-recovery-dry.ts");
    writeFileSync(outside, BASE.join("\n"));
    try {
      const result = await replaceHash(outside, computeHash(BASE.join("\n")), "x", { dryRun: true });
      expect(result.success).toBe(true);
      expect(readFileSync(outside, "utf-8")).toBe(BASE.join("\n"));
    } finally {
      rmSync(outside, { force: true });
    }
  });
});
