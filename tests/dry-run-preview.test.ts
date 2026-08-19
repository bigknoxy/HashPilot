import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { routeEdit } from "../src/core/router";

const TMP_DIR = join(import.meta.dir, "__tmp_dry_run_preview__");
const FILE = join(TMP_DIR, "sample.ts");

// Long enough that "the whole file" is visibly more expensive than "the hunk" —
// the entire point of #98 is the size difference a caller pays for a preview.
const SOURCE = [
  "export function keep(): number {",
  ...Array.from({ length: 40 }, (_, i) => `  const filler${i} = ${i};`),
  "  return 1;",
  "}",
  "",
  "function target(): string {",
  "  return 'target';",
  "}",
  "",
  "export const used = target();",
].join("\n");

function setup() {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(FILE, SOURCE);
}
function cleanup() {
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

describe("a dry run previews instead of dumping the file (#98)", () => {
  beforeEach(setup);
  afterEach(cleanup);

  const rename = (extra: Record<string, unknown> = {}) =>
    routeEdit({
      filePath: FILE,
      operation: "rename-symbol",
      oldName: "target",
      newName: "renamed",
      dryRun: true,
      ...extra,
    } as any);

  test("returns a unified diff and no newSource", async () => {
    const r = await rename();
    expect(r.result.success).toBe(true);
    expect(r.result.newSource).toBeUndefined();
    expect(r.result.sourceOmitted).toBe(true);
    expect(r.result.diff).toContain("--- a/");
    expect(r.result.diff).toContain("-function target(): string {");
    expect(r.result.diff).toContain("+function renamed(): string {");
    // Still nothing on disk: the preview change must not have been written.
    expect(readFileSync(FILE, "utf-8")).toBe(SOURCE);
  });

  test("the preview is far smaller than the file it previews", async () => {
    const r = await rename();
    expect(r.result.diff.length).toBeLessThan(SOURCE.length / 2);
  });

  test("includeSource brings the whole post-edit text back", async () => {
    const r = await rename({ includeSource: true });
    expect(r.result.sourceOmitted).toBeUndefined();
    expect(r.result.diff).toBeUndefined();
    expect(r.result.newSource).toContain("function renamed(): string {");
  });

  test("a real edit still reports newSource", async () => {
    const r = await routeEdit({
      filePath: FILE,
      operation: "rename-symbol",
      oldName: "target",
      newName: "renamed",
    } as any);
    expect(r.result.success).toBe(true);
    expect(r.result.newSource).toContain("function renamed(): string {");
    expect(r.result.sourceOmitted).toBeUndefined();
    expect(readFileSync(FILE, "utf-8")).toContain("function renamed(): string {");
  });

  test("a failed dry run is untouched — nothing to preview", async () => {
    const r = await routeEdit({
      filePath: FILE,
      operation: "rename-symbol",
      oldName: "noSuchSymbol",
      newName: "whatever",
      dryRun: true,
    } as any);
    expect(r.result.success).toBe(false);
    expect(r.result.diff).toBeUndefined();
    expect(r.result.sourceOmitted).toBeUndefined();
  });

  test("the diff tier previews too", async () => {
    const r = await routeEdit({
      filePath: FILE,
      operation: "replace-content",
      method: "diff",
      oldContent: "  return 'target';",
      newContent: "  return 'replaced';",
      dryRun: true,
    } as any);
    expect(r.result.success).toBe(true);
    expect(r.result.newSource).toBeUndefined();
    expect(r.result.diff).toContain("+  return 'replaced';");
    expect(readFileSync(FILE, "utf-8")).toBe(SOURCE);
  });
});
