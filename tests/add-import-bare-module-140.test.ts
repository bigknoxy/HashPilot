import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { addImport } from "../src/core/ast-edit";

/**
 * #140 — a bare module name (`fs`) is a usage error, not a corrupt file.
 *
 * The old path templated `import fs;` from the raw spec, failed the parse-validity
 * gate, and surfaced PARSE_ERROR ("this edit would have corrupted the file"), which
 * reads as a HashPilot bug and sends an agent retrying or escalating. The CJS branch
 * already returns INVALID_ARGUMENT with a `recovery` hint; these tests pin the same
 * contract for the ESM/TS branch so a bad argument is never reported as a parse fault.
 */

function sandbox(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "hp-bare-import-"));
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

describe("add-import — bare module name is a usage error (#140)", () => {
  test("JS/TS bare spec returns INVALID_ARGUMENT, not PARSE_ERROR", () => {
    const root = sandbox({
      "package.json": '{"type":"module"}',
      "app.js": "export const x = 1;\n",
    });
    try {
      const path = join(root, "app.js");
      const r = addImport(readFileSync(path, "utf8"), path, "fs");
      expect(r.success).toBe(false);
      expect(r.errorCode).toBe("INVALID_ARGUMENT");
      // The file must be left untouched — a rejected argument is not an edit.
      expect(r.newSource).toBeUndefined();
      expect(readFileSync(path, "utf8")).toBe("export const x = 1;\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the usage error carries a recovery hint naming the correct spec format", () => {
    const root = sandbox({
      "package.json": '{"type":"module"}',
      "app.js": "export const x = 1;\n",
    });
    try {
      const path = join(root, "app.js");
      const r = addImport(readFileSync(path, "utf8"), path, "fs");
      expect(r.recovery).toBeTruthy();
      expect(r.recovery).toContain("from");
      expect(r.recovery).toContain("fs");
      // Must not repeat the scary "would have corrupted the file" framing.
      expect(r.message ?? "").not.toContain("corrupted the file");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a full import clause still succeeds (no over-rejection)", () => {
    const root = sandbox({
      "package.json": '{"type":"module"}',
      "app.js": "export const x = 1;\n",
    });
    try {
      const path = join(root, "app.js");
      const r = addImport(readFileSync(path, "utf8"), path, '{ readFile } from "fs"');
      expect(r.success).toBe(true);
      expect(r.newSource).toContain('import { readFile } from "fs";');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the same bare spec is a usage error in TypeScript too", () => {
    const root = sandbox({ "a.ts": "export const x = 1;\n" });
    try {
      const path = join(root, "a.ts");
      const r = addImport(readFileSync(path, "utf8"), path, "fs");
      expect(r.success).toBe(false);
      expect(r.errorCode).toBe("INVALID_ARGUMENT");
      expect(r.recovery).toBeTruthy();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
