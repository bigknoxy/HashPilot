import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, policyForce } from "../src/core/config";
import { addWarning, takeWarnings } from "../src/core/envelope";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const TMP_DIR = join(import.meta.dir, "__tmp_test_config__");

describe("loadConfig", () => {
  // `loadConfig` merges ~/.config/hashpilot/config.json when it exists, so on a
  // machine where HashPilot is actually installed these tests read the
  // developer's real config and the "returns defaults" assertions fail. Point
  // HOME at the temp dir so the global layer is genuinely absent.
  const REAL_HOME = process.env.HOME;

  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
    process.env.HOME = TMP_DIR;
  });

  afterEach(() => {
    process.env.HOME = REAL_HOME;
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test("loads config with project file", () => {
    const cfg = { routePolicy: { languageOverrides: { python: "hash" } } };
    const filePath = join(TMP_DIR, ".hashpilot.json");
    writeFileSync(filePath, JSON.stringify(cfg));
    const config = loadConfig(filePath);
    expect(config.routePolicy?.languageOverrides?.python).toBe("hash");
  });

  test("loads config with provenance", () => {
    const cfg = { provenance: { defaultActor: "bot", maxContextLength: 500 } };
    const filePath = join(TMP_DIR, ".hashpilot.json");
    writeFileSync(filePath, JSON.stringify(cfg));
    const config = loadConfig(filePath);
    expect(config.provenance?.defaultActor).toBe("bot");
    expect(config.provenance?.maxContextLength).toBe(500);
  });

  test("loadConfig routePolicy merge — languageOverrides and operationOverrides both present", () => {
    const cfg = {
      routePolicy: {
        languageOverrides: { python: "hash", ts: "ast" },
        operationOverrides: { "rename-symbol": "ast", "add-import": "diff" },
      },
    };
    const filePath = join(TMP_DIR, ".hashpilot.json");
    writeFileSync(filePath, JSON.stringify(cfg));
    const config = loadConfig(filePath);
    expect(config.routePolicy?.languageOverrides?.python).toBe("hash");
    expect(config.routePolicy?.languageOverrides?.ts).toBe("ast");
    expect(config.routePolicy?.operationOverrides?.["rename-symbol"]).toBe("ast");
    expect(config.routePolicy?.operationOverrides?.["add-import"]).toBe("diff");
  });

  test("loadConfig with bad JSON does not throw and returns defaults", () => {
    const filePath = join(TMP_DIR, ".hashpilot.json");
    writeFileSync(filePath, "{bad json}");
    const config = loadConfig(filePath);
    expect(config).toBeDefined();
    // Bad JSON should be silently ignored; routePolicy should remain undefined
    expect(config.routePolicy).toBeUndefined();
    expect(config.provenance).toBeUndefined();
  });

  test("loadConfig with env var override", () => {
    const orig = process.env.HASHPILOT_ROUTE_POLICY;
    try {
      process.env.HASHPILOT_ROUTE_POLICY = '{"languageOverrides":{"python":"hash"}}';
      const config = loadConfig();
      expect(config.routePolicy?.languageOverrides?.python).toBe("hash");
    } finally {
      if (orig === undefined) {
        delete process.env.HASHPILOT_ROUTE_POLICY;
      } else {
        process.env.HASHPILOT_ROUTE_POLICY = orig;
      }
    }
  });

  test("loadConfig returns defaults for non-existent path", () => {
    const config = loadConfig("/nonexistent/path/.hashpilot.json");
    expect(config).toBeDefined();
    expect(config.routePolicy).toBeUndefined();
    expect(config.provenance).toBeUndefined();
  });

  test("env var malformed JSON silently fails", () => {
    const orig = process.env.HASHPILOT_ROUTE_POLICY;
    try {
      process.env.HASHPILOT_ROUTE_POLICY = "not-json";
      const config = loadConfig();
      expect(config).toBeDefined();
      // Parsing failed, so routePolicy should remain unset
      expect(config.routePolicy).toBeUndefined();
    } finally {
      if (orig === undefined) {
        delete process.env.HASHPILOT_ROUTE_POLICY;
      } else {
        process.env.HASHPILOT_ROUTE_POLICY = orig;
      }
    }
  });

  test("warns when --config path does not exist", () => {
    takeWarnings(); // clear any residual warnings
    const config = loadConfig("/nonexistent/path/.hashpilot.json");
    const warnings = takeWarnings();
    expect(config).toBeDefined();
    expect(warnings.length).toBe(1);
    expect(warnings[0].code).toBe("CONFIG_NOT_FOUND");
    expect(warnings[0].message).toContain("/nonexistent/path/.hashpilot.json");
  });

  test("warns when --config file has malformed JSON", () => {
    takeWarnings(); // clear any residual warnings
    const badPath = join(TMP_DIR, "bad-config.json");
    writeFileSync(badPath, "{bad json}");
    const config = loadConfig(badPath);
    const warnings = takeWarnings();
    expect(config).toBeDefined();
    expect(warnings.length).toBe(1);
    expect(warnings[0].code).toBe("CONFIG_PARSE_ERROR");
    expect(warnings[0].message).toContain(badPath);
  });

  test("warns when HASHPILOT_ROUTE_POLICY has malformed JSON", () => {
    takeWarnings(); // clear any residual warnings
    const orig = process.env.HASHPILOT_ROUTE_POLICY;
    try {
      process.env.HASHPILOT_ROUTE_POLICY = "not-json";
      const config = loadConfig();
      const warnings = takeWarnings();
      expect(config).toBeDefined();
      expect(warnings.length).toBe(1);
      expect(warnings[0].code).toBe("CONFIG_PARSE_ERROR");
    } finally {
      if (orig === undefined) {
        delete process.env.HASHPILOT_ROUTE_POLICY;
      } else {
        process.env.HASHPILOT_ROUTE_POLICY = orig;
      }
    }
  });

  test("no warning when project config is absent and no --config passed", () => {
    takeWarnings(); // clear any residual warnings
    const origHome = process.env.HOME;
    try {
      process.env.HOME = TMP_DIR; // no global config, no project config in TMP_DIR
      const config = loadConfig();
      const warnings = takeWarnings();
      expect(config).toBeDefined();
      expect(warnings.length).toBe(0);
    } finally {
      process.env.HOME = origHome;
    }
  });
});

describe("policyForce", () => {
  test("returns undefined for undefined policy", () => {
    expect(policyForce(undefined, "ts", "rename-symbol")).toBeUndefined();
  });

  test("returns override for matching language", () => {
    const policy = { languageOverrides: { ts: "hash" as const } };
    expect(policyForce(policy, "ts", "rename-symbol")).toBe("hash");
  });

  test("returns override for matching operation", () => {
    const policy = { operationOverrides: { "rename-symbol": "hash" as const } };
    expect(policyForce(policy, "ts", "rename-symbol")).toBe("hash");
  });

  test("returns undefined when nothing matches", () => {
    const policy = { languageOverrides: { py: "hash" as const } };
    expect(policyForce(policy, "ts", "rename-symbol")).toBeUndefined();
  });

  test("conflictResolution strictest prefers lowest-precedence route", () => {
    const policy = {
      languageOverrides: { ts: "ast" as const },
      operationOverrides: { "rename-symbol": "diff" as const },
      conflictResolution: "strictest" as const,
    };
    // "ast" = index 2, "diff" = index 0. Strictest picks the lower index ("diff").
    expect(policyForce(policy, "ts", "rename-symbol")).toBe("diff");
  });

  test("conflictResolution defaults to operation", () => {
    const policy = {
      languageOverrides: { ts: "hash" as const },
      operationOverrides: { "rename-symbol": "ast" as const },
    };
    // Default conflictResolution is "operation", so operationOverrides wins.
    expect(policyForce(policy, "ts", "rename-symbol")).toBe("ast");
  });
});
