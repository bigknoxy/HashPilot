import { describe, test, expect } from "bun:test";
import { chooseRoute, routeEdit } from "../src/core/router";
import { computeHash } from "../src/core/read";
import { loadConfig, policyForce } from "../src/core/config";
import type { RoutePolicy } from "../src/core/config";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";

describe("chooseRoute", () => {
  test("selects AST route for TS files with AST operations", () => {
    expect(chooseRoute("foo.ts", "rename-symbol").route).toBe("ast");
    expect(chooseRoute("foo.ts", "replace-body").route).toBe("ast");
    expect(chooseRoute("foo.ts", "add-import").route).toBe("ast");
  });

  test("selects hash route for hash operations", () => {
    expect(chooseRoute("foo.ts", "replace-hash").route).toBe("hash");
    expect(chooseRoute("foo.ts", "read-hash").route).toBe("hash");
  });

  test("selects diff route for unknown operations", () => {
    expect(chooseRoute("foo.ts", "unknown-op").route).toBe("diff");
  });

  test("falls back for unsupported languages with AST operations", () => {
    expect(chooseRoute("foo.java", "rename-symbol").route).toBe("diff");
    expect(chooseRoute("foo.rb", "add-import").route).toBe("diff");
  });

  test("includes explanation with reasons array", () => {
    const { explanation } = chooseRoute("foo.ts", "rename-symbol");
    expect(explanation.reasons.length).toBeGreaterThanOrEqual(1);
    expect(explanation.policyApplied).toBe(false);
  });

  test("explanation for diff fallback includes unsupported language", () => {
    const { explanation } = chooseRoute("foo.java", "rename-symbol");
    expect(explanation.reasons.some((r) => r.includes("not supported"))).toBe(true);
    expect(explanation.route).toBe("diff");
  });
});

describe("policy enforcement", () => {
  test("language override forces route for a specific language", () => {
    const policy: RoutePolicy = { languageOverrides: { typescript: "hash" } };
    // TS normally routes to AST for rename-symbol, but policy forces hash
    expect(chooseRoute("foo.ts", "rename-symbol", policy).route).toBe("hash");
  });

  test("operation override forces route for a specific operation", () => {
    const policy: RoutePolicy = { operationOverrides: { "add-import": "diff" } };
    expect(chooseRoute("foo.ts", "add-import", policy).route).toBe("diff");
    // Other operations unaffected
    expect(chooseRoute("foo.ts", "rename-symbol", policy).route).toBe("ast");
  });

  test("language override for unsupported language still forces route", () => {
    const policy: RoutePolicy = { languageOverrides: { java: "hash" } };
    expect(chooseRoute("foo.java", "rename-symbol", policy).route).toBe("hash");
  });

  test("language override for unsupported language with override still includes policy info", () => {
    const policy: RoutePolicy = { languageOverrides: { java: "hash" } };
    const { explanation } = chooseRoute("foo.java", "rename-symbol", policy);
    expect(explanation.policyApplied).toBe(true);
  });

  test("conflictResolution language wins", () => {
    const policy: RoutePolicy = {
      languageOverrides: { typescript: "hash" },
      operationOverrides: { "rename-symbol": "ast" },
      conflictResolution: "language",
    };
    expect(chooseRoute("foo.ts", "rename-symbol", policy).route).toBe("hash");
  });

  test("conflictResolution operation wins (default)", () => {
    const policy: RoutePolicy = {
      languageOverrides: { typescript: "hash" },
      operationOverrides: { "rename-symbol": "diff" },
    };
    expect(chooseRoute("foo.ts", "rename-symbol", policy).route).toBe("diff");
  });

  test("conflictResolution strictest picks lowest precedence", () => {
    // "diff" < "hash" < "ast" in precedence
    const policy: RoutePolicy = {
      languageOverrides: { typescript: "ast" },
      operationOverrides: { "rename-symbol": "diff" },
      conflictResolution: "strictest",
    };
    expect(chooseRoute("foo.ts", "rename-symbol", policy).route).toBe("diff");
  });

  test("no overrides yields normal routing", () => {
    const policy: RoutePolicy = {};
    expect(chooseRoute("foo.ts", "rename-symbol", policy).route).toBe("ast");
    expect(chooseRoute("foo.rs", "replace-hash", policy).route).toBe("hash");
  });

  test("policyForce returns undefined for empty policy", () => {
    expect(policyForce(undefined, "typescript", "rename-symbol")).toBeUndefined();
  });

  test("policyForce returns override for matching language", () => {
    const policy: RoutePolicy = { languageOverrides: { typescript: "hash" } };
    expect(policyForce(policy, "typescript", "rename-symbol")).toBe("hash");
  });

  test("policyForce returns override for matching operation", () => {
    const policy: RoutePolicy = { operationOverrides: { "add-import": "diff" } };
    expect(policyForce(policy, "typescript", "add-import")).toBe("diff");
  });

  test("policyForce returns undefined for non-matching", () => {
    const policy: RoutePolicy = { languageOverrides: { python: "hash" } };
    expect(policyForce(policy, "typescript", "rename-symbol")).toBeUndefined();
  });
});

describe("config loading", () => {
  test("loadConfig returns defaults when no files exist", () => {
    const config = loadConfig("/nonexistent/config.json");
    expect(config.telemetry?.enabled).toBe(true);
    expect(config.routePolicy).toBeUndefined();
  });
});

describe("routeEdit", () => {
  const tmpDir = "/tmp/hashpilot-route-edit-tests";

  function setup(filePath: string, content: string) {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(filePath, content);
  }

  function teardown(filePath: string) {
    try { rmSync(filePath); } catch {}
  }

  test("AST: rename-symbol via routeEdit", async () => {
    const file = `${tmpDir}/rename.ts`;
    setup(file, "function hello() {\n  return 1;\n}\n\ncall(hello);\n");
    const result = await routeEdit({
      filePath: file,
      operation: "rename-symbol",
      oldName: "hello",
      newName: "world",
    });
    expect(result.route).toBe("ast");
    expect(result.result.success).toBe(true);
    const updated = readFileSync(file, "utf-8");
    expect(updated).toContain("function world()");
    expect(updated).toContain("call(world)");
    expect(updated).not.toContain("hello");
    teardown(file);
  });

  test("AST: replace-body via routeEdit", async () => {
    const file = `${tmpDir}/body.ts`;
    setup(file, "function foo() {\n  return 1;\n}\n");
    const result = await routeEdit({
      filePath: file,
      operation: "replace-body",
      symbolName: "foo",
      newBody: "return 2;",
    });
    expect(result.route).toBe("ast");
    expect(result.result.success).toBe(true);
    const updated = readFileSync(file, "utf-8");
    expect(updated).toContain("return 2;");
    expect(updated).not.toContain("return 1;");
    teardown(file);
  });

  test("AST: add-import via routeEdit", async () => {
    const file = `${tmpDir}/addimport.ts`;
    setup(file, "const x = 1;\n");
    const result = await routeEdit({
      filePath: file,
      operation: "add-import",
      importSpec: "{ z } from ./mod",
    });
    expect(result.route).toBe("ast");
    expect(result.result.success).toBe(true);
    const updated = readFileSync(file, "utf-8");
    expect(updated).toContain("import { z } from ./mod");
    teardown(file);
  });

  test("AST: remove-import via routeEdit", async () => {
    const file = `${tmpDir}/removeimport.ts`;
    setup(file, "import { z } from './mod';\nconst x = 1;\n");
    const result = await routeEdit({
      filePath: file,
      operation: "remove-import",
      importSpec: "z",
    });
    expect(result.route).toBe("ast");
    expect(result.result.success).toBe(true);
    const updated = readFileSync(file, "utf-8");
    expect(updated).not.toContain("import { z } from './mod'");
    teardown(file);
  });

  test("AST: insert-before via routeEdit", async () => {
    const file = `${tmpDir}/insertbefore.ts`;
    setup(file, "function bar() {\n  return 1;\n}\n");
    const result = await routeEdit({
      filePath: file,
      operation: "insert-before",
      symbolName: "bar",
      content: "// before bar",
    });
    expect(result.route).toBe("ast");
    expect(result.result.success).toBe(true);
    const updated = readFileSync(file, "utf-8");
    expect(updated).toContain("// before bar");
    expect(updated.indexOf("// before bar")).toBeLessThan(updated.indexOf("function bar"));
    teardown(file);
  });

  test("AST: insert-after via routeEdit", async () => {
    const file = `${tmpDir}/insertafter.ts`;
    setup(file, "function baz() {\n  return 1;\n}\n");
    const result = await routeEdit({
      filePath: file,
      operation: "insert-after",
      symbolName: "baz",
      content: "// after baz",
    });
    expect(result.route).toBe("ast");
    expect(result.result.success).toBe(true);
    const updated = readFileSync(file, "utf-8");
    expect(updated).toContain("// after baz");
    expect(updated.indexOf("// after baz")).toBeGreaterThan(updated.indexOf("function baz"));
    teardown(file);
  });

  test("AST: find-symbols via routeEdit", async () => {
    const file = `${tmpDir}/findsyms.ts`;
    setup(file, "function hello() {\n  return 1;\n}\nfunction world() {\n  return 2;\n}\n");
    const result = await routeEdit({
      filePath: file,
      operation: "find-symbols",
    });
    expect(result.route).toBe("ast");
    expect(result.result.success).toBe(true);
    expect(result.result.symbols).toBeDefined();
    const names = result.result.symbols.map((s: any) => s.name);
    expect(names).toContain("hello");
    expect(names).toContain("world");
    teardown(file);
  });

  test("AST: rename-symbol failure for non-existent symbol", async () => {
    const file = `${tmpDir}/notfound.ts`;
    setup(file, "function real() { return 1; }\n");
    const result = await routeEdit({
      filePath: file,
      operation: "rename-symbol",
      oldName: "nonexistent",
      newName: "newname",
    });
    expect(result.route).toBe("ast");
    expect(result.result.success).toBe(false);
    teardown(file);
  });

  test("Hash: replace-hash via routeEdit", async () => {
    const file = `${tmpDir}/hash.ts`;
    const original = "line1\nline2\nline3\n";
    setup(file, original);
    const hash = computeHash(original);
    const result = await routeEdit({
      filePath: file,
      operation: "replace-hash",
      oldHash: hash,
      newContent: "alpha\nbeta\ngamma",
    });
    expect(result.route).toBe("hash");
    expect(result.result.success).toBe(true);
    const updated = readFileSync(file, "utf-8");
    expect(updated).toBe("alpha\nbeta\ngamma");
    teardown(file);
  });

  test("Diff: replace-content via routeEdit", async () => {
    const file = `${tmpDir}/diff.rb`;
    setup(file, "def hello\n  puts 'hi'\nend\n");
    const result = await routeEdit({
      filePath: file,
      operation: "replace-content",
      oldContent: "  puts 'hi'",
      newContent: "  puts 'hello world'",
    });
    expect(result.route).toBe("diff");
    expect(result.result.success).toBe(true);
    const updated = readFileSync(file, "utf-8");
    expect(updated).toContain("puts 'hello world'");
    expect(updated).not.toContain("puts 'hi'");
    teardown(file);
  });

  test("Diff: detects duplicates", async () => {
    const file = `${tmpDir}/dup.rb`;
    setup(file, "puts 'hi'\nputs 'there'\nputs 'hi'\n");
    const result = await routeEdit({
      filePath: file,
      operation: "replace-content",
      oldContent: "puts 'hi'",
      newContent: "puts 'bye'",
    });
    expect(result.route).toBe("diff");
    expect(result.result.success).toBe(false);
    expect(result.result.message).toContain("appears 2 times");
    teardown(file);
  });

  test("Diff: content not found", async () => {
    const file = `${tmpDir}/notfound.rb`;
    setup(file, "puts 'hello'\n");
    const result = await routeEdit({
      filePath: file,
      operation: "replace-content",
      oldContent: "nonexistent",
      newContent: "replacement",
    });
    expect(result.route).toBe("diff");
    expect(result.result.success).toBe(false);
    expect(result.result.message).toContain("not found");
    teardown(file);
  });

  test("Diff: fails without oldContent/newContent", async () => {
    const file = `${tmpDir}/noparams.rb`;
    setup(file, "def hello\n  puts 'hi'\nend\n");
    const result = await routeEdit({
      filePath: file,
      operation: "replace-content",
      newContent: "  puts 'bye'",
    });
    expect(result.route).toBe("diff");
    expect(result.result.success).toBe(false);
    expect(result.result.message).toContain("requires oldContent");
    teardown(file);
  });

  test("explicit method override forces route", async () => {
    const file = `${tmpDir}/force.ts`;
    setup(file, "function ok() { return 1; }\n");
    // TypeScript rename-symbol would normally route to AST, but we force hash
    const result = await routeEdit({
      filePath: file,
      operation: "rename-symbol",
      method: "hash",
      oldHash: "fakehash",
      newContent: "function ok() { return 2; }\n",
    });
    expect(result.route).toBe("hash");
    // Fails because oldHash is fake, but the routing decision is correct
    teardown(file);
  });

  test("method: diff override forces diff route", async () => {
    const file = `${tmpDir}/methoddiff.rb`;
    setup(file, "def hello\n  puts 'hi'\nend\n");
    const result = await routeEdit({
      filePath: file,
      operation: "replace-content",
      method: "diff",
      oldContent: "  puts 'hi'",
      newContent: "  puts 'updated'",
    });
    expect(result.route).toBe("diff");
    expect(result.result.success).toBe(true);
    const updated = readFileSync(file, "utf-8");
    expect(updated).toContain("puts 'updated'");
    expect(updated).not.toContain("puts 'hi'");
    teardown(file);
  });

  test("method: ast override forces ast route", async () => {
    const file = `${tmpDir}/methodast.ts`;
    setup(file, "function greet() { return 1; }\ncall(greet);\n");
    const result = await routeEdit({
      filePath: file,
      operation: "rename-symbol",
      method: "ast",
      oldName: "greet",
      newName: "welcome",
    });
    expect(result.route).toBe("ast");
    expect(result.result.success).toBe(true);
    const updated = readFileSync(file, "utf-8");
    expect(updated).toContain("function welcome()");
    expect(updated).toContain("call(welcome)");
    teardown(file);
  });

  test("policy language override changes routeEdit routing", async () => {
    const file = `${tmpDir}/policy.ts`;
    setup(file, "function xyz() { return 1; }\n");
    const policy: RoutePolicy = { languageOverrides: { typescript: "hash" } };
    const hash = computeHash("function xyz() { return 1; }");
    const result = await routeEdit({
      filePath: file,
      operation: "rename-symbol",
      policy,
      oldHash: hash,
      newContent: "function abc() { return 2; }",
    });
    expect(result.route).toBe("hash");
    expect(result.result.success).toBe(true);
    teardown(file);
  });

  test("unsupported language diff replace succeeds with oldContent/newContent", async () => {
    const file = `${tmpDir}/javadiff.java`;
    setup(file, "class Hello {\n  void greet() {\n    System.out.println(\"hi\");\n  }\n}\n");
    const result = await routeEdit({
      filePath: file,
      operation: "replace-content",
      oldContent: "class Hello",
      newContent: "class Goodbye",
    });
    expect(result.route).toBe("diff");
    expect(result.result.success).toBe(true);
    const updated = readFileSync(file, "utf-8");
    expect(updated).toContain("class Goodbye");
    teardown(file);
  });

  test("unsupported language diff fails without oldContent/newContent", async () => {
    const file = `${tmpDir}/javafail.java`;
    setup(file, "class Hello {\n  void greet() {\n    System.out.println(\"hi\");\n  }\n}\n");
    const result = await routeEdit({
      filePath: file,
      operation: "rename-symbol",
      oldName: "Hello",
      newName: "Goodbye",
    });
    expect(result.route).toBe("diff");
    expect(result.result.success).toBe(false);
    expect(result.result.message).toContain("requires oldContent");
    teardown(file);
  });

  test("routeEdit returns explanation with reasons", async () => {
    const file = `${tmpDir}/explain.ts`;
    setup(file, "const a = 1;\n");
    const result = await routeEdit({
      filePath: file,
      operation: "replace-content",
      oldContent: "const a = 1;",
      newContent: "const a = 2;",
    });
    expect(result.explanation).toBeDefined();
    expect(result.explanation!.reasons.length).toBeGreaterThan(0);
    teardown(file);
  });

  // Cleanup
  try { rmSync(tmpDir, { recursive: true }); } catch {}
});
