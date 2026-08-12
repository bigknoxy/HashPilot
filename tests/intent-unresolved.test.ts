import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findSymbolDefinition, findReferences, generatePlan, parseIntent } from "../src/core/intent";
import { executePlan } from "../src/core/plan-executor";
import { firstParseError } from "../src/core/ast-edit";
import { configureWriteBoundary, resetWriteBoundary } from "../src/core/paths";

/**
 * #16 — the planner used to put a literal `/* TODO: add x *​/` string into every
 * call site when it could not compute the argument to pass. In Python that is
 * not a comment at all, so the "successful" plan wrote a syntax error to disk.
 *
 * The fix is not a per-language comment table: a placeholder in a plan step is
 * the planner admitting it could not compute the edit, so it now surfaces as an
 * `unresolved` entry instead of as text in the user's source.
 */

let dir = "";

const FIXTURES: Array<{ ext: string; def: string; call: string; symbol: string }> = [
  {
    ext: "ts",
    def: 'export function greet(name: string): string {\n  return "hi " + name;\n}\n',
    call: 'import { greet } from "./def";\n\nexport function main(): void {\n  console.log(greet("world"));\n}\n',
    symbol: "greet",
  },
  {
    ext: "py",
    def: 'def greet(name):\n    return "hi " + name\n',
    call: 'from def_mod import greet\n\n\ndef main():\n    print(greet("world"))\n',
    symbol: "greet",
  },
  {
    ext: "go",
    def: 'package main\n\nfunc greet(name string) string {\n\treturn "hi " + name\n}\n',
    call: 'package main\n\nfunc main() {\n\tprintln(greet("world"))\n}\n',
    symbol: "greet",
  },
  {
    ext: "rs",
    def: 'pub fn greet(name: &str) -> String {\n    format!("hi {}", name)\n}\n',
    call: 'use crate::greet;\n\nfn main() {\n    println!("{}", greet("world"));\n}\n',
    symbol: "greet",
  },
];

function writeFixture(ext: string, def: string, call: string) {
  // `def` is a Python keyword, so the definition module cannot be `def.py`.
  const defFile = join(dir, `def_mod.${ext}`);
  const callFile = join(dir, `call.${ext}`);
  writeFileSync(defFile, def);
  writeFileSync(callFile, call);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "tmp" }));
  return { defFile, callFile };
}

async function planFor(symbol: string, intentJson: string, hintFile: string) {
  const intent = parseIntent(intentJson);
  const definition = await findSymbolDefinition(symbol, dir, hintFile);
  expect(definition).not.toBeNull();
  const references = await findReferences(symbol, dir, definition!.file);
  return generatePlan(intent, definition!, references);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hashpilot-unresolved-"));
  resetWriteBoundary();
  configureWriteBoundary({ allowOutsideRoot: true, quiet: true });
});

afterEach(() => {
  resetWriteBoundary();
  rmSync(dir, { recursive: true, force: true });
});

describe("a plan never invents a placeholder argument", () => {
  for (const fx of FIXTURES) {
    test(`add-parameter with no default leaves call sites unresolved in .${fx.ext}`, async () => {
      const { defFile, callFile } = writeFixture(fx.ext, fx.def, fx.call);
      const plan = await planFor(
        fx.symbol,
        JSON.stringify({ operation: "add-parameter", symbol: fx.symbol, param: { name: "flag" } }),
        defFile,
      );

      // The signature step is computable; the call-site edits are not.
      expect(plan.steps.every((s) => s.operation !== "insert-call-arg")).toBe(true);
      expect(plan.unresolved.length).toBeGreaterThan(0);
      expect(plan.unresolved.some((u) => u.file === callFile)).toBe(true);
      expect(plan.unresolved[0]!.reason).toMatch(/no default/i);
      // And nothing anywhere in the plan carries a fabricated comment.
      expect(JSON.stringify(plan)).not.toContain("TODO");
    });

    test(`a blocked plan writes nothing, and the .${fx.ext} sources still parse`, async () => {
      const { defFile, callFile } = writeFixture(fx.ext, fx.def, fx.call);
      const before = [readFileSync(defFile, "utf8"), readFileSync(callFile, "utf8")];

      const plan = await planFor(
        fx.symbol,
        JSON.stringify({ operation: "add-parameter", symbol: fx.symbol, param: { name: "flag" } }),
        defFile,
      );
      const result = await executePlan(plan, { verify: false });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("UNSUPPORTED_OPERATION");
      expect([readFileSync(defFile, "utf8"), readFileSync(callFile, "utf8")]).toEqual(before);
      for (const f of [defFile, callFile]) {
        expect(firstParseError(readFileSync(f, "utf8"), f)).toBeNull();
      }
    });

    test(`--yes applies the resolvable steps and the .${fx.ext} result still parses`, async () => {
      const { defFile, callFile } = writeFixture(fx.ext, fx.def, fx.call);
      const plan = await planFor(
        fx.symbol,
        JSON.stringify({ operation: "add-parameter", symbol: fx.symbol, param: { name: "flag" } }),
        defFile,
      );
      const result = await executePlan(plan, { verify: false, yes: true, revertOnFailure: false });

      // Whether the signature edit lands is per-language; what must hold is that
      // no file was left unparseable and no placeholder text was written.
      for (const f of [defFile, callFile]) {
        const src = readFileSync(f, "utf8");
        expect(src).not.toContain("TODO");
        if (result.success) expect(firstParseError(src, f)).toBeNull();
      }
      // Call sites are untouched — the planner refused to guess, not silently skipped.
      expect(result.plan.unresolved.length).toBeGreaterThan(0);
    });
  }

  test("a default value makes the call sites resolvable again", async () => {
    const fx = FIXTURES[0]!;
    const { defFile, callFile } = writeFixture(fx.ext, fx.def, fx.call);
    const plan = await planFor(
      fx.symbol,
      JSON.stringify({
        operation: "add-parameter",
        symbol: fx.symbol,
        param: { name: "flag", default: "false" },
      }),
      defFile,
    );

    expect(plan.unresolved).toEqual([]);
    expect(plan.steps.some((s) => s.operation === "insert-call-arg" && s.file === callFile)).toBe(true);
    expect(plan.steps.every((s) => !JSON.stringify(s.params).includes("TODO"))).toBe(true);
  });

  test("the impact summary names the unresolved work rather than hiding it", async () => {
    const fx = FIXTURES[1]!; // python
    const { defFile } = writeFixture(fx.ext, fx.def, fx.call);
    const plan = await planFor(
      fx.symbol,
      JSON.stringify({ operation: "add-parameter", symbol: fx.symbol, param: { name: "flag" } }),
      defFile,
    );
    expect(plan.impactSummary).toMatch(/unresolved/i);
  });

  test("rename-exported-symbol is fully computable, so nothing is unresolved", async () => {
    const fx = FIXTURES[0]!;
    const { defFile } = writeFixture(fx.ext, fx.def, fx.call);
    const plan = await planFor(
      fx.symbol,
      JSON.stringify({ operation: "rename-exported-symbol", symbol: fx.symbol, newName: "hello" }),
      defFile,
    );
    expect(plan.unresolved).toEqual([]);
  });

  test("no source file emits a C-style placeholder any more", async () => {
    // The regression guard: the bug was one string literal, and it can come back
    // as easily as it went in.
    const proc = Bun.spawnSync(["grep", "-rn", "TODO: add", join(import.meta.dir, "..", "src")]);
    expect(proc.stdout.toString().trim()).toBe("");
  });
});
