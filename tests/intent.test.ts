import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { parseIntent, findSymbolDefinition, findReferences, generatePlan, UnsupportedIntentError } from "../src/core/intent";
import { executePlan, executeIntent } from "../src/core/plan-executor";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { simulateCrashAfterTempWrite } from "../src/core/paths";

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
  // Add minimal tsconfig to prevent tsc --noEmit from walking up to project root
  writeFileSync(join(TMP_DIR, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ESNext", module: "ESNext", strict: false, noEmit: true },
    include: ["*.ts"],
  }));
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

  test("refuses remove-parameter instead of planning a no-op", () => {
    // It was accepted but never implemented: the plan emitted an unmatchable
    // `/* TODO: remove arg */` search string at each call site and reported
    // success. Refusing at parse time is the honest answer.
    expect(() => parseIntent(JSON.stringify({
      operation: "remove-parameter",
      symbol: "greet",
      paramName: "name",
    }))).toThrow(UnsupportedIntentError);
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

  test("rename-exported-symbol: does not duplicate steps for a file spelled two ways", () => {
    // The definition is an absolute path; one reference points at that same
    // file via a relative spelling. Without normalization the `!== definition.file`
    // filter misses it and the definition file gets renamed a second time.
    const def = { file: FILE_A, name: "greet", kind: "function_declaration", line: 3, column: 17 };
    const refs = [
      { file: "tests/__tmp_intent_tests__/a.ts", line: 8, column: 14, context: "greet(data)" },
      { file: FILE_B, line: 4, column: 14, context: 'greet("world")' },
    ];
    const plan = generatePlan(
      { operation: "rename-exported-symbol", symbol: "greet", newName: "sayHello" },
      def,
      refs
    );
    const refSteps = plan.steps.filter((s) => s.order > 0);
    expect(refSteps.length).toBe(1);
    expect(refSteps[0].file).toBe("tests/__tmp_intent_tests__/b.ts");
  });

  test("add-parameter: dedupes one file reached by several spellings", () => {
    const def = { file: FILE_A, name: "process", kind: "function_declaration", line: 8, column: 17 };
    const cwd = process.cwd();
    const relC = FILE_C.replace(cwd + "/", "");
    const refs = [
      { file: "./" + relC, line: 4, column: 3, context: 'process("test", 1)' },
      { file: relC, line: 5, column: 3, context: 'process("mid", 9)' },
      { file: FILE_C, line: 6, column: 3, context: 'process("other", 2)' },
    ];
    const plan = generatePlan(
      { operation: "add-parameter", symbol: "process", param: { name: "flag", default: "false" } },
      def,
      refs
    );
    // Definition step plus exactly one call-site step for the single ref file.
    const refSteps = plan.steps.filter((s) => s.order > 0);
    expect(refSteps.length).toBe(1);
    expect(plan.steps.length).toBe(2);
  });

  test("generatePlan also refuses remove-parameter", () => {
    const def = { file: FILE_A, name: "process", kind: "function_declaration", line: 8, column: 17 };
    const refs = [{ file: FILE_C, line: 4, column: 3, context: 'process("test", 1)' }];
    expect(() => generatePlan(
      { operation: "remove-parameter", symbol: "process", paramName: "count" } as never,
      def,
      refs
    )).toThrow(UnsupportedIntentError);
  });

  // A TODO placeholder is fine as *inserted* text (add-parameter emits one as
  // the new argument for a caller to fill in), but never as text the step has
  // to find in the file — that step can only ever fail.
  test("no plan step searches for a TODO placeholder", () => {
    const def = { file: FILE_A, name: "greet", kind: "function_declaration", line: 1, column: 17 };
    const refs = [{ file: FILE_C, line: 4, column: 3, context: 'greet("test")' }];
    for (const intent of [
      { operation: "add-parameter", symbol: "greet", param: { name: "x", type: "string" } },
      { operation: "rename-exported-symbol", symbol: "greet", newName: "sayHello" },
    ] as never[]) {
      for (const step of generatePlan(intent, def, refs).steps) {
        for (const key of ["oldContent", "oldName", "search", "content"]) {
          expect(String(step.params[key] ?? "")).not.toContain("TODO:");
        }
      }
    }
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

// ── plan-executor edge cases ─────────────────────────────────────────

describe("plan-executor edge cases", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("replace-hash operation replaces file content", async () => {
    const content = await Bun.file(FILE_A).text();
    const plan = {
      intent: { operation: "add-parameter", symbol: "greet", param: { name: "x" } },
      definition: { file: FILE_A, name: "greet", kind: "function", line: 1, column: 0 },
      references: [],
      steps: [
        {
          order: 0,
          file: FILE_A,
          operation: "replace-hash",
          description: "Replace content via hash",
          params: { newContent: content + "\n// hash-modified" },
        },
      ],
      impactSummary: "",
    };

    const result = await executePlan(plan, { verify: false, dryRun: false, revertOnFailure: false });
    expect(result.success).toBe(true);
    expect(result.steps[0].success).toBe(true);
    expect(result.steps[0].operation).toBe("replace-hash");
    expect(await Bun.file(FILE_A).text()).toContain("// hash-modified");
  });

  test("diff: missing params fails with validation error", async () => {
    const plan = {
      intent: { operation: "add-parameter", symbol: "greet", param: { name: "x" } },
      definition: { file: FILE_A, name: "greet", kind: "function", line: 1, column: 0 },
      references: [],
      steps: [
        {
          order: 0,
          file: FILE_A,
          operation: "diff",
          description: "Missing params",
          params: {},
        },
      ],
      impactSummary: "",
    };

    const result = await executePlan(plan, { verify: false, dryRun: false });
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].message).toBe("Diff requires oldContent and newContent");
  });

  test("diff: content not found in file", async () => {
    const plan = {
      intent: { operation: "add-parameter", symbol: "greet", param: { name: "x" } },
      definition: { file: FILE_A, name: "greet", kind: "function", line: 1, column: 0 },
      references: [],
      steps: [
        {
          order: 0,
          file: FILE_A,
          operation: "diff",
          description: "Content not found",
          params: { oldContent: "%%%NOT_IN_FILE%%%", newContent: "replacement" },
        },
      ],
      impactSummary: "",
    };

    const result = await executePlan(plan, { verify: false, dryRun: false });
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].message).toContain("Content not found");
  });

  test("diff: ambiguous content that appears multiple times", async () => {
    // "export function" appears twice in FILE_A
    const plan = {
      intent: { operation: "add-parameter", symbol: "greet", param: { name: "x" } },
      definition: { file: FILE_A, name: "greet", kind: "function", line: 1, column: 0 },
      references: [],
      steps: [
        {
          order: 0,
          file: FILE_A,
          operation: "diff",
          description: "Ambiguous content",
          params: { oldContent: "export function", newContent: "export async function" },
        },
      ],
      impactSummary: "",
    };

    const result = await executePlan(plan, { verify: false, dryRun: false });
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].message).toContain("appears");
    expect(result.steps[0].message).toContain("disambiguate");
  });

  test("diff: happy path replaces content", async () => {
    const plan = {
      intent: { operation: "add-parameter", symbol: "greet", param: { name: "x" } },
      definition: { file: FILE_A, name: "greet", kind: "function", line: 1, column: 0 },
      references: [],
      steps: [
        {
          order: 0,
          file: FILE_A,
          operation: "diff",
          description: "Replace text",
          params: { oldContent: '"Hello, "', newContent: '"Hi, "' },
        },
      ],
      impactSummary: "",
    };

    const result = await executePlan(plan, { verify: false, dryRun: false, revertOnFailure: false });
    expect(result.steps[0].success).toBe(true);
    expect(result.steps[0].message).toBe("Replaced content");
    expect(await Bun.file(FILE_A).text()).toContain('"Hi, "');
  });

  test("catch block handles step execution errors", async () => {
    const plan = {
      intent: { operation: "add-parameter", symbol: "greet", param: { name: "x" } },
      definition: { file: "/nonexistent/file.ts", name: "greet", kind: "function", line: 1, column: 0 },
      references: [],
      steps: [
        {
          order: 0,
          file: "/nonexistent/file.ts",
          operation: "rename-symbol",
          description: "Should throw",
          params: { oldName: "greet", newName: "sayHello" },
        },
      ],
      impactSummary: "",
    };

    const result = await executePlan(plan, { verify: false, dryRun: false, revertOnFailure: false });
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].message).toContain("Error:");
  });

  test("verification runs and populates the result", async () => {
    // Use a non-.ts file so auto-detection finds no tools and returns quickly
    const txtFile = join(TMP_DIR, "verification_test.txt");
    writeFileSync(txtFile, "Hello World\nFoo Bar\n");
    const plan = {
      intent: { operation: "add-parameter", symbol: "greet", param: { name: "x" } },
      definition: { file: txtFile, name: "greet", kind: "function", line: 1, column: 0 },
      references: [],
      steps: [
        {
          order: 0,
          file: txtFile,
          operation: "diff",
          description: "Replace text",
          params: { oldContent: "World", newContent: "Universe" },
        },
      ],
      impactSummary: "",
    };

    const result = await executePlan(plan, { verify: true, dryRun: false, revertOnFailure: false });
    expect(result.verification).toBeDefined();
    expect(["pass", "fail"]).toContain(result.verification!.overall);
    // File should still be modified
    expect(await Bun.file(txtFile).text()).toContain("Universe");
  });

  test("rollback restores files when steps fail", async () => {
    const originalA = await Bun.file(FILE_A).text();

    const plan = {
      intent: { operation: "rename-exported-symbol", symbol: "greet", newName: "sayHello" },
      definition: { file: FILE_A, name: "greet", kind: "function", line: 1, column: 0 },
      references: [],
      steps: [
        {
          order: 0,
          file: FILE_A,
          operation: "rename-symbol",
          description: "Rename greet to sayHello",
          params: { oldName: "greet", newName: "sayHello" },
        },
        {
          order: 1,
          file: FILE_A,
          operation: "diff",
          description: "Content not found",
          params: { oldContent: "%%%NOT_FOUND%%%", newContent: "replacement" },
        },
      ],
      impactSummary: "",
    };

    const result = await executePlan(plan, { verify: false, dryRun: false, revertOnFailure: true });
    expect(result.reverted).toBe(true);
    expect(result.steps[0].success).toBe(true);
    expect(result.steps[1].success).toBe(false);
    expect(await Bun.file(FILE_A).text()).toBe(originalA);
  });
});

// ── Intent edge cases ────────────────────────────────────────────────

describe("intent edge cases", () => {
  beforeEach(setup);
  afterEach(cleanup);

  test("findSymbolDefinition handles hint file that cannot be read", async () => {
    // hint file is nonexistent → error caught, falls through to project scan
    const def = await findSymbolDefinition("greet", TMP_DIR, "/nonexistent/hint/file.ts");
    expect(def).not.toBeNull();
    expect(def!.name).toBe("greet");
  });
});

// ── #10 / #17: verification feedback loop and rollback correctness ────

describe("executePlan verification / rollback correctness", () => {
  const VERIFY_FAIL_DIR = join(TMP_DIR, "__verify_fail__");
  const BAD_TS = join(VERIFY_FAIL_DIR, "bad.ts");
  const BAD_PKG = join(VERIFY_FAIL_DIR, "package.json");
  const ORIGINAL_BAD_TS = "export const value = 1;\n";

  beforeEach(() => {
    simulateCrashAfterTempWrite(false);
    try { rmSync(VERIFY_FAIL_DIR, { recursive: true, force: true }); } catch {}
    mkdirSync(VERIFY_FAIL_DIR, { recursive: true });
    writeFileSync(BAD_TS, ORIGINAL_BAD_TS);
     // Auto-detection finds this package.json when walking up from BAD_TS;
     // vitest is not in node_modules, so `npx --no-install vitest run` exits
     // non-zero — a deterministic verify-overall="fail" without network flakiness.
    writeFileSync(BAD_PKG, JSON.stringify({
      name: "verify-fail-fixture",
      devDependencies: { vitest: "^1.0.0" },
     }));
   });

  afterEach(() => {
    simulateCrashAfterTempWrite(false);
    try { rmSync(VERIFY_FAIL_DIR, { recursive: true, force: true }); } catch {}
   });

  test("verification failure makes success:false and reverts changes (#10)", async () => {
    const plan = {
      intent: { operation: "add-parameter", symbol: "value", param: { name: "x" } },
      definition: { file: BAD_TS, name: "value", kind: "function", line: 1, column: 0 },
      references: [],
      steps: [
        {
          order: 0,
          file: BAD_TS,
          operation: "diff",
          description: "replace content",
          params: { oldContent: "= 1", newContent: "= 2" },
        },
      ],
      impactSummary: "",
    };

    const result = await executePlan(plan, { verify: true, dryRun: false, revertOnFailure: true });

     // #10 core invariant: a red verification result is not reported as success.
    expect(result.success).toBe(false);
    expect(result.verification).toBeDefined();
    expect(result.verification!.overall).toBe("fail");
    expect(result.errorCode).toBe("VERIFY_FAILED");

     // Rollback must fire on verification failure, not just on step failure.
    expect(result.reverted).toBe(true);
    expect(await Bun.file(BAD_TS).text()).toBe(ORIGINAL_BAD_TS);
   });

  test("rollback failure sets reverted:false and lists unrevertedFiles (#17)", async () => {
     // simulateCrashAfterTempWrite makes every atomicWrite throw after the
     // temp-file write but before the rename.  The originals snapshot uses
     // Bun.file().text() (no atomicWrite), so it is captured before the crash
     // fires.  Every safeWrite in the rollback loop then throws, proving that
     // `reverted` is never set to true over a half-reverted tree.
    setup();
    simulateCrashAfterTempWrite(true);

    const plan = {
      intent: { operation: "rename-exported-symbol", symbol: "greet", newName: "sayHello" },
      definition: { file: FILE_A, name: "greet", kind: "function", line: 1, column: 0 },
      references: [],
      steps: [
        {
          order: 0,
          file: FILE_A,
          operation: "diff",
          description: "apply change to a.ts",
          params: { oldContent: "greet", newContent: "sayHello" },
        },
        {
          order: 1,
          file: FILE_B,
          operation: "diff",
          description: "apply change to b.ts",
          params: { oldContent: "greet", newContent: "sayHello" },
        },
      ],
      impactSummary: "",
    };

    const result = await executePlan(plan, { verify: false, dryRun: false, revertOnFailure: true });

     // #17 core invariant: when the revert loop catches a write error the result
     // must not claim a clean revert.
    expect(result.reverted).toBe(false);
    expect(result.unrevertedFiles).toBeDefined();
    expect(result.unrevertedFiles!.length).toBeGreaterThan(0);
    expect(result.unrevertedFiles).toContain(FILE_A);
    expect(result.unrevertedFiles).toContain(FILE_B);
   });

  test("reverted:true when every snapshot file is restored cleanly", async () => {
     // No crash → every revert write succeeds → reverted: true, unrevertedFiles: undefined.
    setup();
    const originalA = await Bun.file(FILE_A).text();

    const plan = {
      intent: { operation: "rename-exported-symbol", symbol: "greet", newName: "sayHello" },
      definition: { file: FILE_A, name: "greet", kind: "function", line: 1, column: 0 },
      references: [],
      steps: [
        {
          order: 0,
          file: FILE_A,
          operation: "rename-symbol",
          description: "Rename greet to sayHello",
          params: { oldName: "greet", newName: "sayHello" },
        },
        {
          order: 1,
          file: FILE_A,
          operation: "diff",
          description: "Step 1 content not found — forces rollback",
          params: { oldContent: "%%%NOT_FOUND%%%", newContent: "x" },
        },
      ],
      impactSummary: "",
    };

    const result = await executePlan(plan, { verify: false, dryRun: false, revertOnFailure: true });
    expect(result.reverted).toBe(true);
    expect(result.unrevertedFiles).toBeUndefined();
    expect(await Bun.file(FILE_A).text()).toBe(originalA);
   });
});
