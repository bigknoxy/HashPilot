import { describe, test, expect } from "bun:test";
import { chooseRoute } from "../src/core/router";
import { loadConfig, policyForce } from "../src/core/config";
import type { RoutePolicy } from "../src/core/config";

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
