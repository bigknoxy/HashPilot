// #160 (B59): the revert/accounting block in executePlan was gated entirely
// on `originals.size > 0`. If the pre-execution snapshot pass's readDecoded()
// call fails for *every* target file (transient read error, permission
// race, file briefly missing), `originals` stays empty even though a later
// step can still succeed in writing a file (its own read-before-write inside
// the step runs independently and can succeed). When a subsequent step then
// fails, the whole revert/unsnapshotted-accounting block used to be skipped
// solely because `originals.size === 0`, so the plan reported a bare failure
// with no `unrevertedFiles` and no `ROLLBACK_INCOMPLETE` — a file sat
// modified on disk with zero signal that manual cleanup might be needed.
//
// This file forces that exact scenario via `mock.module` on "../src/core/encoding":
// readDecoded's first call for each file (the snapshot pass) throws, and every
// call after that (the per-step read-before-write) delegates to the real
// implementation.

import { describe, test, expect, mock, afterAll } from "bun:test";
import { join } from "path";

const ENCODING_MODULE = join(import.meta.dir, "..", "src", "core", "encoding.ts");

const callCounts = new Map<string, number>();

// Capture the real implementations before mock.module replaces the module
// registry entry. `mock.module` mutates the live module namespace object in
// place, so these individual function references (rather than the namespace
// object itself) are what let the mock delegate to the real implementation,
// and what let afterAll below restore a genuinely pristine module for every
// other test file sharing this process.
const actualEncoding = await import(ENCODING_MODULE);
const realReadDecoded = actualEncoding.readDecoded;
const realDecodeText = actualEncoding.decodeText;
const realEncodeText = actualEncoding.encodeText;

mock.module(ENCODING_MODULE, () => ({
  decodeText: realDecodeText,
  encodeText: realEncodeText,
  readDecoded: async (filePath: string) => {
    const n = (callCounts.get(filePath) ?? 0) + 1;
    callCounts.set(filePath, n);
    if (n === 1) {
      throw new Error("Simulated transient read failure during snapshot pass");
    }
    return realReadDecoded(filePath);
  },
}));

// `bun test` runs every file in one process, so a module mock left in place
// after this file finishes would silently corrupt every other test file that
// imports "../src/core/encoding" (readDecoded would keep throwing on first
// call). Restore the pristine module once this file's test has run.
afterAll(() => {
  mock.module(ENCODING_MODULE, () => ({
    decodeText: realDecodeText,
    encodeText: realEncodeText,
    readDecoded: realReadDecoded,
  }));
});

import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";

// `mock.module` only intercepts modules evaluated *after* it runs. Static
// `import` declarations are hoisted by the ES module spec, so a top-level
// `import { executePlan } from "../src/core/plan-executor"` here would load
// (and bind to) the *real* "../src/core/encoding" before the mock above ever
// takes effect. A dynamic import inside the test body runs in program order,
// after the mock is registered, so plan-executor's `readDecoded` binding
// resolves to the mocked module.
const { executePlan } = await import("../src/core/plan-executor");

const TMP_DIR = join(import.meta.dir, "__tmp_b59_rollback_accounting__");
const FILE_A = join(TMP_DIR, "a.ts");
const FILE_B = join(TMP_DIR, "b.ts");

function setup() {
  callCounts.clear();
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(FILE_A, `export const a = 1;\n`);
  writeFileSync(FILE_B, `export const b = 1;\n`);
}

describe("executePlan — rollback accounting when the snapshot pass fails for all files (#160/B59)", () => {
  test("a step that still writes successfully is reported as unreverted, not swallowed", async () => {
    setup();

    const plan = {
      intent: { operation: "rename-exported-symbol", symbol: "a", newName: "aa" },
      definition: { file: FILE_A, name: "a", kind: "variable", line: 1, column: 0 },
      references: [],
      steps: [
        {
          order: 0,
          file: FILE_A,
          operation: "diff",
          description: "apply change to a.ts",
          params: { oldContent: "export const a = 1;", newContent: "export const a = 2;" },
        },
        {
          order: 1,
          file: FILE_B,
          operation: "diff",
          description: "content that is not present — forces step failure",
          params: { oldContent: "%%%NOT_FOUND%%%", newContent: "x" },
        },
      ],
      impactSummary: "",
    };

    const result = await executePlan(plan, { verify: false, dryRun: false, revertOnFailure: true });

    // The snapshot pass failed for both files (readDecoded's 1st call per file
    // throws), so originals.size === 0 — the exact precondition #160 exploited.
    // Step 0 still wrote FILE_A successfully before step 1 failed.
    expect(result.success).toBe(false);

    // Core assertion: this must NOT be a silent plain failure. The edited-but-
    // unsnapshotted file must be surfaced explicitly.
    expect(result.reverted).toBe(false);
    expect(result.unrevertedFiles).toBeDefined();
    expect(result.unrevertedFiles).toContain(FILE_A);
    expect(result.errorCode).toBe("ROLLBACK_INCOMPLETE");

    // And the file really is left modified on disk — proving there was
    // something real to revert that never got reverted.
    expect(readFileSync(FILE_A, "utf8")).toContain("export const a = 2;");

    rmSync(TMP_DIR, { recursive: true, force: true });
  });
});
