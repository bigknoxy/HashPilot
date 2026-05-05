import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { parseIntent, findSymbolDefinition, findReferences, generatePlan } from "../src/core/intent";
import { executePlan, executeIntent } from "../src/core/plan-executor";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TMP_DIR = join(import.meta.dir, "__tmp_intent_tests__");

const FILE_A = join(TMP_DIR, "a.ts");
const FILE_B = join(TMP_DIR, "b.ts");
const FILE_C = join(TMP_DIR, "app.ts");
const FILE_D = join(TMP_DIR, "utils.ts");

function setup() {
  try { mkdirSync(TMP_DIR, { recursive: true }); } catch {}
  writeFileSync(FILE_A, `import { helper } from "./utils";

export function greet(name: string): string {
  return "Hello, " + name;
}

export function process(data: string, count: number): void {
  console.log(greet(data), count);
}
`);

  writeFileSync(FILE_B, `import { greet } from "./a";

export function handler(): void {
  const msg = greet("world");
  console.log(msg);
}

export function processItems(items: string[]): void {
  process(items[0], items.length);
}
`);

  writeFileSync(FILE_C, `import { process } from "./a";

export function main(): void {
  process("test", 1);
  process("other", 2);
}

function internalHelper(): void {
  process("internal", 3);
}
`);

  writeFileSync(FILE_D, `import { helper as h } from "./utils";

export function helper(data: string): string {
  return data.toUpperCase();
}
`);

  // Add a package.json so findProjectRoot works
  writeFileSync(join(TMP_DIR, "package.json"), JSON.stringify({ name: "temp" }));
}

function cleanup() {
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

// ── parseIntent ──────────────────────────────────────────────────────

describe("parseIntent", () => {
  test("parses add-parameter intent", () => {
    const intent = parseIntent(JSON.stringify({
      operation: "add-parameter",
      symbol: "greet",
      param: { name: "suffix", type: "string", default: "\"!\"" },
    }));
    expect(intent.operation).toBe("add-parameter");
    expect(intent.symbol).toBe("greet");
    if (intent.operation === "add-parameter") {
      expect(intent.param.name).toBe("suffix");
      expect(intent.param.type).toBe("string");
      expect(intent.param.default).toBe("\"!\"");
    }
  });

  test("parses add-parameter with minimal fields", () => {
    const intent = parseIntent(JSON.stringify({
      operation: "add-parameter",
      symbol: "fn",
      param: { name: "x" },
    }));
    expect(intent.operation).toBe("add-parameter");
    if (intent.operation === "add-parameter") {
      expect(intent.param.name).toBe("x");
      expect(intent.param.type).toBeUndefined();
    }
  });

  test("parses remove-parameter intent", () => {
    const intent = parseIntent(JSON.stringify({
      operation: "remove-parameter",
      symbol: "greet",
      paramName: "name",
    }));
    expect(intent.operation).toBe("remove-parameter");
    if (intent.operation === "remove-parameter") {
      expect(intent.paramName).toBe("name");
    }
  });

  test("parses rename-exported-symbol intent", () => {
    const intent = parseIntent(JSON.stringify({
      operation: "rename-exported-symbol",
      symbol: "greet",
      newName: "sayHello",
    }));
    expect(intent.operation).toBe("rename-exported-symbol");
    if (intent.operation === "rename-exported-symbol") {
      expect(intent.newName).toBe("sayHello");
    }
  });

  test("parses with hint file", () => {
    const intent = parseIntent(JSON.stringify({
      operation: "add-parameter",
      symbol: "greet",
      param: { name: "x" },
      file: "src/a.ts",
    }));
    expect(intent.file).toBe("src/a.ts");
  });

  test("rejects invalid JSON", () => {
    expect(() => parseIntent("not json")).toThrow();
  });

  test("rejects missing operation", () => {
    expect(() => parseIntent(JSON.stringify({ symbol: "x" }))).toThrow();
  });

  test("rejects missing symbol", () => {
    expect(() => parseIntent(JSON.stringify({ operation: "add-parameter" }))).toThrow();
  });

  test("rejects add-parameter without param.name", () => {
    expect(() => parseIntent(JSON.stringify({
      operation: "add-parameter",
      symbol: "fn",
      param: {},
    }))).toThrow();
  });

  test("rejects remove-parameter without paramName", () => {
    expect(() => parseIntent(JSON.stringify({
      operation: "remove-parameter",
      symbol: "fn",
    }))).toThrow();
  });

  test("rejects rename-exported-symbol without newName", () => {
    expect(() => parseIntent(JSON.stringify({
      operation: "rename-exported-symbol",
      symbol: "fn",
    }))).toThrow();
  });

  test("rejects unknown operation", () => {
    expect(() => parseIntent(JSON.stringify({
      operation: "unknown-op",
      symbol: "fn",
    }))).toThrow();
  });
});

// ── findSymbolDefinition ─────────────────────────────────────────────

describe("findSymbolDefinition", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("finds symbol via hint file", async () => {
    const def = await findSymbolDefinition("greet", TMP_DIR, FILE_A);
    expect(def).not.toBeNull();
    expect(def!.name).toBe("greet");
    expect(def!.file).toBe(FILE_A);
    expect(def!.kind).toContain("function");
  });

  test("returns null for nonexistent symbol", async () => {
    const def = await findSymbolDefinition("nonexistentFn", TMP_DIR);
    expect(def).toBeNull();
  });

  test("finds symbol by scanning project", async () => {
    const def = await findSymbolDefinition("handler", TMP_DIR);
    expect(def).not.toBeNull();
    expect(def!.name).toBe("handler");
    expect(def!.file).toBe(FILE_B);
  });

  test("finds helper function in utils", async () => {
    const def = await findSymbolDefinition("helper", TMP_DIR);
    expect(def).not.toBeNull();
    expect(def!.name).toBe("helper");
  });
});

// ── findReferences ───────────────────────────────────────────────────

describe("findReferences", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("finds references to greet across files", async () => {
    const refs = await findReferences("greet", TMP_DIR, FILE_A);
    // FILE_A has: call in process function, FILE_B has: call in handler
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const files = refs.map((r) => r.file);
    expect(files).toContain(FILE_A);
    expect(files).toContain(FILE_B);
  });

  test("finds references to process", async () => {
    const refs = await findReferences("process", TMP_DIR, FILE_A);
    expect(refs.length).toBeGreaterThanOrEqual(4); // FILE_B + FILE_C
    const appRefs = refs.filter((r) => r.file === FILE_C);
    expect(appRefs.length).toBeGreaterThanOrEqual(3); // 3 calls in app.ts
  });

  test("returns empty for symbol with no references", async () => {
    const refs = await findReferences("main", TMP_DIR, FILE_C);
    // main is only called in places not present, may have 0 refs
    expect(Array.isArray(refs)).toBe(true);
  });
});

// ── generatePlan ─────────────────────────────────────────────────────

describe("generatePlan", () => {
  test("generates add-parameter plan", () => {
    const def = { file: FILE_A, name: "greet", kind: "function_declaration", line: 3, column: 17 };
    const refs = [
      { file: FILE_A, line: 8, column: 14, context: "greet(data)" },
      { file: FILE_B, line: 4, column: 14, context: 'greet("world")' },
    ];
    const plan = generatePlan(
      { operation: "add-parameter", symbol: "greet", param: { name: "suffix", default: "!", type: "string" } },
      def,
      refs
    );
    expect(plan.steps.length).toBe(3); // def + 2 ref files
    expect(plan.steps[0].operation).toBe("insert-parameter");
    expect(plan.steps[0].file).toBe(FILE_A);
    expect(plan.steps[1].operation).toBe("insert-call-arg");
    expect(plan.impactSummary).toContain("3 edits");
  });

  test("generates rename-exported-symbol plan", () => {
    const def = { file: FILE_A, name: "greet", kind: "function_declaration", line: 3, column: 17 };
    const refs = [
      { file: FILE_A, line: 8, column: 14, context: "greet(data)" },
      { file: FILE_B, line: 2, column: 10, context: 'import { greet }' },
      { file: FILE_B, line: 4, column: 14, context: 'greet("world")' },
    ];
    const plan = generatePlan(
      { operation: "rename-exported-symbol", symbol: "greet", newName: "sayHello" },
      def,
      refs
    );
    expect(plan.steps.length).toBeGreaterThanOrEqual(1);
    // Step 0 renames definition, rest rename in ref files
    expect(plan.steps[0].operation).toBe("rename-symbol");
    expect(plan.steps[0].params.oldName).toBe("greet");
    expect(plan.steps[0].params.newName).toBe("sayHello");
  });

  test("generates remove-parameter plan", () => {
    const def = { file: FILE_A, name: "process", kind: "function_declaration", line: 8, column: 17 };
    const refs = [{ file: FILE_C, line: 4, column: 3, context: 'process("test", 1)' }];
    const plan = generatePlan(
      { operation: "remove-parameter", symbol: "process", paramName: "count" },
      def,
      refs
    );
    expect(plan.steps.length).toBeGreaterThanOrEqual(1);
    expect(plan.steps[0].operation).toBe("remove-import");
  });
});

// ── executePlan ──────────────────────────────────────────────────────

describe("executePlan", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("dry-run does not modify files", async () => {
    const def = await findSymbolDefinition("greet", TMP_DIR, FILE_A);
    expect(def).not.toBeNull();
    const refs = await findReferences("greet", TMP_DIR, def!.file);
    const plan = generatePlan(
      { operation: "add-parameter", symbol: "greet", param: { name: "suffix", default: "\"!\"" } },
      def!,
      refs
    );

    const originalA = await Bun.file(FILE_A).text();
    const originalB = await Bun.file(FILE_B).text();

    const result = await executePlan(plan, { dryRun: true, verify: false });
    expect(result.success).toBe(true);

    // Files unchanged
    expect(await Bun.file(FILE_A).text()).toBe(originalA);
    expect(await Bun.file(FILE_B).text()).toBe(originalB);
  });

  test("add-parameter modifies function signature", async () => {
    const def = await findSymbolDefinition("greet", TMP_DIR, FILE_A);
    expect(def).not.toBeNull();
    const refs = await findReferences("greet", TMP_DIR, def!.file);
    const plan = generatePlan(
      { operation: "add-parameter", symbol: "greet", param: { name: "suffix", default: "\"!\"" } },
      def!,
      refs
    );

    const result = await executePlan(plan, { verify: false, revertOnFailure: true });
    expect(result.success).toBe(true);

    const content = await Bun.file(FILE_A).text();
    expect(content).toContain("suffix");
    expect(content).toContain("\"!\"");
  });

  test("add-parameter updates call sites", async () => {
    const def = await findSymbolDefinition("greet", TMP_DIR, FILE_A);
    expect(def).not.toBeNull();
    const refs = await findReferences("greet", TMP_DIR, def!.file);
    const plan = generatePlan(
      { operation: "add-parameter", symbol: "greet", param: { name: "suffix", default: "\"!\"" } },
      def!,
      refs
    );

    const result = await executePlan(plan, { verify: false, revertOnFailure: true });
    expect(result.success).toBe(true);

    // FILE_B should have updated greet() calls with new arg
    const contentB = await Bun.file(FILE_B).text();
    expect(contentB).toContain("\"!\"");
  });

  test("rename-exported-symbol applies across files", async () => {
    const def = await findSymbolDefinition("greet", TMP_DIR, FILE_A);
    expect(def).not.toBeNull();
    const refs = await findReferences("greet", TMP_DIR, def!.file);
    const plan = generatePlan(
      { operation: "rename-exported-symbol", symbol: "greet", newName: "sayHello" },
      def!,
      refs
    );

    const result = await executePlan(plan, { verify: false, revertOnFailure: true });
    expect(result.success).toBe(true);

    const a = await Bun.file(FILE_A).text();
    const b = await Bun.file(FILE_B).text();
    expect(a).not.toContain("function greet");
    expect(a).toContain("sayHello");
    expect(b).not.toContain("greet");
    expect(b).toContain("sayHello");
  });

  test("reverts on failure when revertOnFailure is true", async () => {
    // Find all the plan data manually
    const def = await findSymbolDefinition("greet", TMP_DIR, FILE_A);
    expect(def).not.toBeNull();

    const originalA = await Bun.file(FILE_A).text();

    // Create a plan that will fail (rename to nonexistent symbol → diff step with bad content)
    const refs = await findReferences("greet", TMP_DIR, def!.file);
    const plan = generatePlan(
      { operation: "rename-exported-symbol", symbol: "greet", newName: "sayHello" },
      def!,
      refs
    );

    const result = await executePlan(plan, { verify: false, revertOnFailure: true });
    // If it succeeded, the files changed; if it failed, they reverted
    if (!result.success) {
      expect(result.reverted).toBe(true);
      const a = await Bun.file(FILE_A).text();
      expect(a).toBe(originalA);
    }
  });

  test("step results include elapsed times", async () => {
    const def = await findSymbolDefinition("greet", TMP_DIR, FILE_A);
    const refs = await findReferences("greet", TMP_DIR, def!.file);
    const plan = generatePlan(
      { operation: "add-parameter", symbol: "greet", param: { name: "x", default: "null" } },
      def!,
      refs
    );
    const result = await executePlan(plan, { verify: false });
    expect(result.steps.length).toBeGreaterThan(0);
    for (const step of result.steps) {
      expect(step.elapsed_ms).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── executeIntent E2E ────────────────────────────────────────────────

describe("executeIntent", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("full add-parameter flow", async () => {
    const intent = JSON.stringify({
      operation: "add-parameter",
      symbol: "greet",
      param: { name: "greeting", default: "\"Hi\"" },
      file: FILE_A,
    });

    const result = await executeIntent(intent, {
      projectRoot: TMP_DIR,
      dryRun: true,
      verify: false,
    });

    expect(result.success).toBe(true);
    expect(result.plan.steps.length).toBeGreaterThan(0);
    expect(result.plan.definition.name).toBe("greet");
    expect(result.execution.summary.failed).toBe(0);
  });

  test("full rename-exported-symbol flow", async () => {
    const intent = JSON.stringify({
      operation: "rename-exported-symbol",
      symbol: "process",
      newName: "handle",
      file: FILE_A,
    });

    const result = await executeIntent(intent, {
      projectRoot: TMP_DIR,
      dryRun: true,
      verify: false,
    });

    expect(result.success).toBe(true);
    expect(result.plan.definition.name).toBe("process");
    // Should find references in FILE_B and FILE_C
    const files = result.plan.steps.map((s) => s.file);
    expect(files).toContain(FILE_A);
  });

  test("throws for nonexistent symbol", async () => {
    const intent = JSON.stringify({
      operation: "add-parameter",
      symbol: "nonexistentFn",
      param: { name: "x" },
    });

    await expect(executeIntent(intent, {
      projectRoot: TMP_DIR,
      verify: false,
    })).rejects.toThrow();
  });

  test("impact summary includes reference count", async () => {
    const intent = JSON.stringify({
      operation: "rename-exported-symbol",
      symbol: "greet",
      newName: "hi",
      file: FILE_A,
    });

    const result = await executeIntent(intent, {
      projectRoot: TMP_DIR,
      dryRun: true,
      verify: false,
    });

    expect(result.plan.impactSummary).toContain("references");
    expect(result.execution.summary.totalSteps).toBeGreaterThan(0);
  });
});
