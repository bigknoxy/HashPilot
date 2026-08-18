import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  generateUnifiedDiff,
  parsePatch,
  applyPatchToSource,
  applyPatch,
} from "../src/core/diff-engine";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { configureWriteBoundary, resetWriteBoundary } from "../src/core/paths";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hashpilot-diff-"));
const testFile = path.join(tmpDir, "test.txt");

function writeFile(content: string) {
  fs.writeFileSync(testFile, content, "utf-8");
}

function readFile(): string {
  return fs.readFileSync(testFile, "utf-8");
}

beforeAll(() => {
  // Fixtures live in the OS temp dir, outside the project write boundary.
  configureWriteBoundary({ allowedRoots: [tmpDir] });
  writeFile(`line1
line2
line3
line4
line5
line6
line7
line8
line9
line10`);
});

afterAll(() => {
  resetWriteBoundary();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("generateUnifiedDiff", () => {
  test("produces correct unified diff for a two-line change", () => {
    const oldSrc = "line1\nline2\nline3\n";
    const newSrc = "line1\nline2 modified\nline3\n";
    const diff = generateUnifiedDiff(oldSrc, newSrc, "foo.txt");

    expect(diff).toContain("--- a/foo.txt");
    expect(diff).toContain("+++ b/foo.txt");
    expect(diff).toContain("-line2");
    expect(diff).toContain("+line2 modified");
    expect(diff).toMatch(/^@@ -1,\d+ \+1,\d+ @@/m);
  });

  test("returns empty string when no changes", () => {
    const src = "line1\nline2\n";
    const diff = generateUnifiedDiff(src, src, "foo.txt");
    expect(diff).toBe("");
  });

  test("produces multi-hunk diff for separated changes", () => {
    const oldSrc = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n";
    const newSrc = "a\nB\nc\nd\ne\nf\nG\nh\ni\nj\n";
    const diff = generateUnifiedDiff(oldSrc, newSrc, "foo.txt", 1);

    const hunkCount = (diff.match(/^@@ /gm) || []).length;
    expect(hunkCount).toBe(2);
  });

  test("handles empty old source (adding all lines)", () => {
    const oldSrc = "";
    const newSrc = "hello\nworld\n";
    const diff = generateUnifiedDiff(oldSrc, newSrc, "foo.txt");

    expect(diff).toContain("--- a/foo.txt");
    expect(diff).toContain("+++ b/foo.txt");
    expect(diff).toContain("+hello");
    expect(diff).toContain("+world");
  });

  test("handles empty new source (removing all lines)", () => {
    const oldSrc = "hello\nworld\n";
    const newSrc = "";
    const diff = generateUnifiedDiff(oldSrc, newSrc, "foo.txt");

    expect(diff).toContain("-hello");
    expect(diff).toContain("-world");
  });

  test("respects contextLines parameter", () => {
    const oldSrc = "a\nb\nc\nd\ne\nf\ng\n";
    const newSrc = "a\nb\nCHANGED\nd\ne\nf\ng\n";

    // contextLines=0 should produce minimal context
    const diff0 = generateUnifiedDiff(oldSrc, newSrc, "foo.txt", 0);
    const contextLines0 = diff0
      .split("\n")
      .filter((l) => l.startsWith(" ") && l.length > 1).length;
    expect(contextLines0).toBe(0);

    // contextLines=2 should have context
    const diff2 = generateUnifiedDiff(oldSrc, newSrc, "foo.txt", 2);
    const contextLines2 = diff2
      .split("\n")
      .filter((l) => l.startsWith(" ") && l.length > 1).length;
    expect(contextLines2).toBeGreaterThan(0);
  });

  test("hunk headers have correct line counts", () => {
    const oldSrc = "a\nb\nc\nd\n";
    const newSrc = "a\nb\nX\nY\nc\nd\n";
    const diff = generateUnifiedDiff(oldSrc, newSrc, "foo.txt");

    const hdrMatch = diff.match(/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/m);
    expect(hdrMatch).not.toBeNull();
    expect(hdrMatch![1]).toBe("1");
    expect(hdrMatch![3]).toBe("1");
  });
});

describe("parsePatch", () => {
  test("parses a unified diff into hunks", () => {
    const patch = `--- a/foo.txt
+++ b/foo.txt
@@ -1,4 +1,5 @@
 context
-old
+new
+extra
 more`;

    const parsed = parsePatch(patch);
    expect(parsed.filePath).toBe("foo.txt");
    expect(parsed.hunks.length).toBe(1);
    expect(parsed.hunks[0].oldStart).toBe(1);
    expect(parsed.hunks[0].oldLines).toBe(4);
    expect(parsed.hunks[0].newStart).toBe(1);
    expect(parsed.hunks[0].newLines).toBe(5);
    expect(parsed.hunks[0].lines).toHaveLength(5);
  });

  test("parses multi-hunk patch", () => {
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,3 @@
 a
-b
+B
 c
@@ -5,3 +5,3 @@
 e
-f
+F
 g`;

    const parsed = parsePatch(patch);
    expect(parsed.hunks.length).toBe(2);
    expect(parsed.hunks[0].lines).toHaveLength(4);
    expect(parsed.hunks[1].oldStart).toBe(5);
  });

  test("handles empty patch", () => {
    const parsed = parsePatch("");
    expect(parsed.hunks.length).toBe(0);
  });

  test("extracts file path from --- a/ header", () => {
    const patch = `--- a/src/app.ts
+++ b/src/app.ts
@@ -1 +1 @@
-old
+new`;

    const parsed = parsePatch(patch);
    expect(parsed.filePath).toBe("src/app.ts");
  });
});

describe("applyPatchToSource", () => {
  test("applies exact matching patch", () => {
    const source = "line1\nline2\nline3\nline4";
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1,4 +1,4 @@
 line1
-line2
+LINE2
 line3
 line4`;

    const result = applyPatchToSource(source, patch);
    expect(result.success).toBe(true);
    expect(result.newSource).toBe("line1\nLINE2\nline3\nline4");
    expect(result.hunksApplied).toBe(1);
  });

  test("applies fuzzy matching patch (shifted by 2 lines)", () => {
    const source = "a\nb\nc\nd\ne\nf\ng\nh";
    // Patch says oldStart=6 but content is actually at line 4 — fuzzy=3 allows shift of 2
    const shifted = `--- a/test.txt
+++ b/test.txt
@@ -6,3 +6,3 @@
 d
 e
-f
+FFF`;

    const result = applyPatchToSource(source, shifted, { fuzzyMatch: 3 });
    expect(result.success).toBe(true);
    expect(result.newSource).toBe("a\nb\nc\nd\ne\nFFF\ng\nh");
  });

  test("returns failure when context not found", () => {
    const source = "line1\nline2\nline3";
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,3 @@
 nonexistent
 context
 here`;

    const result = applyPatchToSource(source, patch);
    expect(result.success).toBe(false);
    expect(result.hunksApplied).toBe(0);
    expect(result.hunksFailed).toBeGreaterThan(0);
  });

  test("applies multi-hunk patch", () => {
    const source = "a\nb\nc\nd\ne\nf\ng\nh";
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1,4 +1,4 @@
 a
-b
+BBB
 c
 d
@@ -5,4 +5,4 @@
 e
-f
+FFF
 g
 h`;

    const result = applyPatchToSource(source, patch);
    expect(result.success).toBe(true);
    expect(result.hunksApplied).toBe(2);
    expect(result.newSource).toBe("a\nBBB\nc\nd\ne\nFFF\ng\nh");
  });

  test("handles no hunks in patch", () => {
    const result = applyPatchToSource("source", "");
    expect(result.success).toBe(false);
    expect(result.message).toContain("No hunks");
  });

  test("handles add-only hunk (no removed lines)", () => {
    const source = "line1\nline2";
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1,2 +1,3 @@
 line1
+line1.5
 line2`;

    const result = applyPatchToSource(source, patch);
    expect(result.success).toBe(true);
    expect(result.newSource).toBe("line1\nline1.5\nline2");
  });

  test("handles remove-only hunk (no added lines)", () => {
    const source = "line1\nline2\nline3";
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,2 @@
 line1
-line2
 line3`;

    const result = applyPatchToSource(source, patch);
    expect(result.success).toBe(true);
    expect(result.newSource).toBe("line1\nline3");
  });
});

describe("applyPatch (file I/O)", () => {
  test("applies patch to file on disk", async () => {
    writeFile("alpha\nbeta\ngamma\ndelta");
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1,4 +1,4 @@
 alpha
-beta
+BETA
 gamma
 delta`;

    const result = await applyPatch(testFile, patch);
    expect(result.success).toBe(true);
    expect(result.hunksApplied).toBe(1);
    expect(readFile()).toBe("alpha\nBETA\ngamma\ndelta");
  });

  test("dryRun does not modify file", async () => {
    writeFile("line1\nline2\nline3");
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,3 @@
 line1
-line2
+MODIFIED
 line3`;

    const result = await applyPatch(testFile, patch, { dryRun: true });
    expect(result.success).toBe(true);
    expect(result.newSource).toBe("line1\nMODIFIED\nline3");
    // File should remain unchanged
    expect(readFile()).toBe("line1\nline2\nline3");
  });

  test("returns failure for nonexistent file", async () => {
    const result = await applyPatch("/nonexistent/file.txt", "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new");
    expect(result.success).toBe(false);
    expect(result.message).toContain("Cannot read file");
  });
});

describe("generate + apply roundtrip", () => {
  test("generated diff can be parsed and applied back", () => {
    const oldSrc = "first\nsecond\nthird\nfourth\nfifth\n";
    const newSrc = "first\nSECOND\nthird\nfourth\nFIFTH\n";
    const diff = generateUnifiedDiff(oldSrc, newSrc, "test.txt");

    const result = applyPatchToSource(oldSrc, diff);
    expect(result.success).toBe(true);
    expect(result.newSource).toBe(newSrc);
  });
});

describe("applyPatchToSource — fuzzy window correctness (issue #33)", () => {
  test("fuzzy: 0 requires exact position — refuses shifted match", () => {
    // Content is at line 1 but patch claims oldStart=6. With fuzzy=0, no shift allowed.
    const source = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj";
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -6,3 +6,3 @@
 d
 e
-f
+FFF`;

    const result = applyPatchToSource(source, patch, { fuzzyMatch: 0 });
    expect(result.success).toBe(false);
    expect(result.hunksApplied).toBe(0);
  });

  test("match window is exactly [expected ± fuzzy], independent of hunk size (issue #33 req 1)", () => {
    // The buggy code widened the search window by hunk.oldLines, letting a large
    // hunk drift far from the expected position. The fix makes the START-position
    // window exactly [expected - fuzzy, expected + fuzzy], independent of hunk size.
    //
    // Source: "b c d e f" (the hunk content) lives ONLY at 0-indexed positions 4-8.
    // The patch claims oldStart=1 (0-indexed 0). With fuzzy=1 the window covers
    // positions 0..2 (lines 1-3), and "b c d e -f" does not appear there
    // (positions 0..2 hold "a b c"). The match at position 4 is outside ±1.
    // The old buggy window (widened by oldLines=5) reached position 4 and matched.
    const source = "a\nb\nc\nd\nb\nc\nd\ne\nf\ng\n";
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1,5 +1,5 @@
 b
 c
 d
 e
-f
+F`;

    const result = applyPatchToSource(source, patch, { fuzzyMatch: 1 });
    expect(result.success).toBe(false);
  });

  test("fuzzy: 0 refuses non-exact-content match at exact position (issue #33 req 2)", () => {
    // fuzzy=0 means exact position AND exact content, or fail. The position matches
    // but the content differs, so it must be refused.
    const source = "a\nb\nc\nd\ne";
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1,1 +1,1 @@
 b
-B`;

    const result = applyPatchToSource(source, patch, { fuzzyMatch: 0 });
    expect(result.success).toBe(false);
    expect(result.hunksApplied).toBe(0);
  });

  test("ambiguous match within window → error listing candidates, no write (issue #33 req 3)", () => {
    // Two identical candidate positions within the fuzzy window must refuse and
    // report both line numbers.
    const source = [
      "x", "a", "b", "T", "c", // block 0 at 0-idx 0 (lines 1-5)
      "x", "a", "b", "T", "c", // block 1 at 0-idx 5 (lines 6-10)
      "x",
    ].join("\n");
    // oldStart=1, oldLines=4 (x, a, b, T). Matches at 0-idx 0 and 0-idx 5.
    // fuzzy=5 → window [0-5, 0+5] = positions -5..5 → covers both candidates.
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1,4 +1,4 @@
 x
 a
 b
-T
+TT`;

    const result = applyPatchToSource(source, patch, { fuzzyMatch: 5 });
    expect(result.success).toBe(false);
    expect(result.hunksApplied).toBe(0);
    expect(result.message).toMatch(/ambig/i);
  });

  test("regression: repeated blocks do not misapply to wrong location (issue #33)", () => {
    // Two near-identical blocks. Block 0's marker differs from block 1's, so a
    // hunk built for block 1's content does NOT match at the expected position
    // (block 0). Only the shifted position (block 1) matches. The buggy code
    // widened the search window by hunk.oldLines, so it found block 1 and
    // silently misapplied; the fix's ±fuzzy window must refuse it.
    const source = [
      "block0", "context-a", "context-b", "context-c", // block 0 at 0-idx 0
      "block1", "context-a", "context-b", "context-c", // block 1 at 0-idx 4
    ].join("\n");
    // Hunk for block 1's 4 lines, claims oldStart=1 (0-idx 0 = block 0's start).
    // Content "block1 / context-a / context-b / context-c" only matches at 0-idx 4.
    // fuzzy=2 → fixed window [0-2, 0+2] = positions -2..2; pos 4 is OUTSIDE → refuse.
    // Buggy window: searchEnd = 0 + 2 + 4 + 1 = 7, reaching pos 4 → misapply (success).
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1,4 +1,4 @@
 block1
 context-a
 context-b
 context-c`;

    const result = applyPatchToSource(source, patch, { fuzzyMatch: 2 });
    // Correct behavior: refuse (success=false). Old buggy behavior: succeeds
    // by drifting far enough to match block 1.
    expect(result.success).toBe(false);
  });

  test("successful fuzzy match reports appliedAt, expectedAt, offset (issue #33 req 4)", () => {
    const source = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj";
    // Content "b" (line 1, 0-idx 1) then removed "c" lives at oldStart=2; patch
    // claims oldStart=1 (0-idx 0). fuzzy=3 catches the 1-line shift.
    // Body = 1 context + 1 removed = 2 old lines, 2 new lines.
    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1,2 +1,2 @@
 b
-c
+C`;

    const result = applyPatchToSource(source, patch, { fuzzyMatch: 3 });
    expect(result.success).toBe(true);
    expect(result.appliedAt).toBeDefined();
    expect(result.expectedAt).toBeDefined();
    expect(result.offset).toBe(result.appliedAt! - result.expectedAt!);
  });
});
