/**
 * Issue #30 — byte fidelity across the read/edit/write boundary.
 *
 * Fixtures are generated rather than committed: a file whose whole point is
 * its CRLF endings or its BOM is exactly the file git's autocrlf and
 * text-normalization settings are most likely to rewrite on checkout, which
 * would silently turn these into no-op tests on someone else's machine.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { decodeText, encodeText, readDecoded } from "../src/core/encoding";
import { readMany, computeHash } from "../src/core/read";
import { replaceHash } from "../src/core/hash-edit";
import { routeEdit } from "../src/core/router";

const BOM = "﻿";

/** name -> raw bytes, covering every layout the tiers have to survive. */
const FIXTURES: Record<string, string> = {
  lf: "alpha\nbeta\ngamma\n",
  crlf: "alpha\r\nbeta\r\ngamma\r\n",
  cr: "alpha\rbeta\rgamma\r",
  mixed: "alpha\r\nbeta\ngamma\r\n",
  "no-trailing-newline": "alpha\nbeta\ngamma",
  "bom-lf": `${BOM}alpha\nbeta\ngamma\n`,
  "bom-crlf": `${BOM}alpha\r\nbeta\r\ngamma\r\n`,
  emoji: "const label = \"\u{1F680}\u{1F680} astral\";\nconst other = 1;\n",
  cjk: "const 名前 = \"漢字テスト\";\nconst other = 1;\n",
  "cjk-ext-b": "const x = \"\u{20BB7}\u{2A6B2}\";\nconst other = 1;\n",
};

const DIR = join(import.meta.dir, "__tmp_encoding__");
const write = (name: string, raw: string): string => {
  const p = join(DIR, `${name}.ts`);
  writeFileSync(p, raw, "utf8");
  return p;
};
const bytes = (p: string): string => readFileSync(p, "utf8");

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
});
afterEach(() => rmSync(DIR, { recursive: true, force: true }));

describe("decodeText / encodeText (issue #30)", () => {
  for (const [name, raw] of Object.entries(FIXTURES)) {
    test(`${name} round-trips byte-for-byte`, () => {
      const { text, encoding } = decodeText(raw);
      expect(text).not.toContain("\r");
      expect(encodeText(text, encoding)).toBe(raw);
    });
  }

  test("the BOM is stripped from the text, not folded into line 1", () => {
    const { text } = decodeText(FIXTURES["bom-lf"]);
    expect(text.startsWith("alpha")).toBe(true);
    // Line 1's hash must not depend on a byte-order mark the agent never sees.
    expect(text).toBe(decodeText(FIXTURES.lf).text);
  });

  test("a mixed-ending file records per-line endings; a consistent one does not", () => {
    expect(decodeText(FIXTURES.mixed).encoding.endings).toEqual(["\r\n", "\n", "\r\n"]);
    expect(decodeText(FIXTURES.crlf).encoding.endings).toBeUndefined();
  });

  test("a file with no line endings at all defaults to LF for new lines", () => {
    const { encoding } = decodeText("solo");
    expect(encoding.eol).toBe("\n");
    expect(encoding.trailingNewline).toBe(false);
  });

  test("emptying a file yields an empty file, not a blank line", () => {
    const { encoding } = decodeText(FIXTURES.crlf);
    expect(encodeText("", encoding)).toBe("");
  });

  test("readDecoded normalizes what the tiers see", async () => {
    const p = write("crlf", FIXTURES.crlf);
    expect((await readDecoded(p)).text).toBe(FIXTURES.lf);
  });
});

describe("read tier sees normalized text (issue #30)", () => {
  test("the same logical content hashes the same regardless of layout", async () => {
    const paths = [write("lf", FIXTURES.lf), write("crlf", FIXTURES.crlf), write("bom-lf", FIXTURES["bom-lf"])];
    const results = await readMany(paths);
    const hashes = new Set(results.map((r) => r.hash));
    expect(hashes.size).toBe(1);
    expect([...hashes][0]).toBe(computeHash(FIXTURES.lf));
  });
});

describe("edit tiers preserve byte layout (issue #30)", () => {
  const layouts = ["lf", "crlf", "cr", "mixed", "no-trailing-newline", "bom-lf", "bom-crlf"];

  for (const name of layouts) {
    test(`hash tier: replacing content with itself leaves ${name} byte-identical`, async () => {
      const p = write(name, FIXTURES[name]);
      const { text } = await readDecoded(p);
      const result = await replaceHash(p, computeHash(text), text);
      expect(result.success).toBe(true);
      expect(bytes(p)).toBe(FIXTURES[name]);
    });

    test(`diff tier: replacing content with itself leaves ${name} byte-identical`, async () => {
      const p = write(name, FIXTURES[name]);
      const { text } = await readDecoded(p);
      const result = await routeEdit({
        filePath: p, operation: "search-replace", method: "diff",
        oldContent: text, newContent: text,
      });
      expect(result.result.success).toBe(true);
      expect(bytes(p)).toBe(FIXTURES[name]);
    });
  }

  test("a one-line edit in a CRLF file changes exactly one line", async () => {
    const p = write("crlf", FIXTURES.crlf);
    const result = await routeEdit({
      filePath: p, operation: "search-replace", method: "diff",
      oldContent: "beta", newContent: "BETA",
    });
    expect(result.result.success).toBe(true);
    expect(bytes(p)).toBe("alpha\r\nBETA\r\ngamma\r\n");
  });

  test("an edit does not invent a trailing newline the file never had", async () => {
    const p = write("no-trailing-newline", FIXTURES["no-trailing-newline"]);
    await routeEdit({
      filePath: p, operation: "search-replace", method: "diff",
      oldContent: "gamma", newContent: "GAMMA",
    });
    expect(bytes(p)).toBe("alpha\nbeta\nGAMMA");
  });

  test("the BOM survives an edit and stays out of line 1", async () => {
    const p = write("bom-crlf", FIXTURES["bom-crlf"]);
    await routeEdit({
      filePath: p, operation: "search-replace", method: "diff",
      oldContent: "alpha", newContent: "ALPHA",
    });
    expect(bytes(p)).toBe(`${BOM}ALPHA\r\nbeta\r\ngamma\r\n`);
  });

  test("AST offsets line up with JS string offsets past the BMP", async () => {
    for (const name of ["emoji", "cjk", "cjk-ext-b"]) {
      const p = write(name, FIXTURES[name]);
      const result = await routeEdit({
        filePath: p, operation: "rename-symbol", oldName: "other", newName: "renamed",
      });
      expect(result.result.success).toBe(true);
      expect(bytes(p)).toBe(FIXTURES[name].replace("other", "renamed"));
    }
  });
});
