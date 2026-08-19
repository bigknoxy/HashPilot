import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * #108 / #109 — two undocumented invocation rules that fail *silently* or with a
 * confusing error, both now stated in docs/CLI-QUICKREF.md. These tests are the
 * executable form of that documentation: the doc cannot drift from behaviour
 * without this file failing.
 */

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "src", "cli.ts");
const QUICKREF = join(ROOT, "docs", "CLI-QUICKREF.md");

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "hp-quickref-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(args: string[]) {
  const res = spawnSync("bun", ["run", CLI, ...args], {
    encoding: "utf8",
    // Run from the scratch dir so it is the project root the write boundary
    // permits; the CLI path is absolute.
    cwd: dir,
    env: { ...process.env, HASHPILOT_TELEMETRY: "0" },
  });
  return { code: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function fixture(name: string, content: string): string {
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
}

const FN = "function f(a) {\n  return a;\n}\n";

describe("#108 replace-body owns braces and indentation", () => {
  test("a bare statement lands indented to the symbol", () => {
    const p = fixture("bare.ts", FN);
    expect(run(["ast", "replace-body", p, "f", "return a * 2;"]).code).toBe(0);
    expect(readFileSync(p, "utf8")).toBe("function f(a) {\n  return a * 2;\n}\n");
  });

  test("a braced body nests a block instead of replacing — silent, still parses", () => {
    const p = fixture("braced.ts", FN);
    expect(run(["ast", "replace-body", p, "f", "{ return a * 2; }"]).code).toBe(0);
    expect(readFileSync(p, "utf8")).toBe("function f(a) {\n  { return a * 2; }\n}\n");
  });

  test("a pre-indented body is double-indented — also silent", () => {
    const p = fixture("indented.ts", FN);
    expect(run(["ast", "replace-body", p, "f", "  return a * 2;"]).code).toBe(0);
    expect(readFileSync(p, "utf8")).toBe("function f(a) {\n    return a * 2;\n}\n");
  });

  test("a multi-line flush-left body is re-indented line by line", () => {
    const p = fixture("multi.ts", FN);
    const body = "const b = a * 2;\nif (b > 0) {\n  return b;\n}\nreturn 0;";
    expect(run(["ast", "replace-body", p, "f", body]).code).toBe(0);
    expect(readFileSync(p, "utf8")).toBe(
      "function f(a) {\n  const b = a * 2;\n  if (b > 0) {\n    return b;\n  }\n  return 0;\n}\n",
    );
  });
});

describe("#109 an import spec quotes its module path", () => {
  test("the quoted form documented in the quickref applies", () => {
    const p = fixture("ok.ts", "const x = 1;\n");
    const r = run(["ast", "add-import", p, '{ Foo } from "./bar"']);
    expect(r.code).toBe(0);
    expect(readFileSync(p, "utf8")).toContain('import { Foo } from "./bar"');
  });

  test("the unquoted form is refused with PARSE_ERROR and leaves the file alone", () => {
    const before = "const x = 1;\n";
    const p = fixture("bad.ts", before);
    const r = run(["ast", "add-import", p, "{ Foo } from ./bar"]);
    expect(r.code).not.toBe(0);
    expect(JSON.parse(r.stdout).error.code).toBe("PARSE_ERROR");
    expect(readFileSync(p, "utf8")).toBe(before);
  });
});

describe("the quickref states both rules", () => {
  const doc = () => readFileSync(QUICKREF, "utf8");

  test("replace-body's brace and indentation rules are written down", () => {
    const text = doc();
    expect(text).toContain("no braces, no indentation");
    expect(text).toContain("{ return a * 2; }");
    expect(text).toContain("double-indented");
  });

  test("the add-import example quotes its module path", () => {
    const text = doc();
    expect(text).toContain('{ Foo } from "./bar"');
    // The unquoted form may appear only as the counter-example on a ❌ line.
    for (const line of text.split("\n")) {
      if (line.includes("from ./bar")) expect(line).toContain("❌");
    }
  });
});
