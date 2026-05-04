import { computeHash } from "./read";
import { recordEvent } from "./telemetry";

export interface VerifyResult {
  files: string[];
  formatter?: { passed: boolean; output: string };
  linter?: { passed: boolean; output: string };
  tests?: { passed: boolean; output: string };
  typecheck?: { passed: boolean; output: string };
  overall: "pass" | "fail";
  elapsed_ms: number;
  fileHashes: Record<string, string>;
  detected?: {
    formatter?: string;
    linter?: string;
    typecheck?: string;
    testRunner?: string;
  };
  revertedFiles?: string[];
}

export interface VerifyOptions {
  formatter?: string;
  linter?: string;
  testFilter?: string;
  formatterArgs?: string[];
  linterArgs?: string[];
  testArgs?: string[];
  typecheck?: string;
  testRunner?: string;
  autoDetect?: boolean;
  revertOnFailure?: boolean;
  timeout?: number;
}

// Extension-based tool defaults (used when autoDetect finds no config files)
const EXT_TOOLS: Record<string, { typecheck?: string; test: string }> = {
  ".ts": { typecheck: "tsc --noEmit", test: "bun test" },
  ".tsx": { typecheck: "tsc --noEmit", test: "bun test" },
  ".py": { typecheck: "mypy", test: "pytest" },
  ".go": { typecheck: "go vet", test: "go test" },
  ".rs": { typecheck: "cargo check", test: "cargo test" },
  ".js": { test: "bun test" },
  ".jsx": { test: "bun test" },
};

const TEST_RUNNER_MAP: Record<string, string> = {
  "bun test": "bun test",
  "vitest": "npx vitest run",
  "jest": "npx jest",
  "pytest": "python -m pytest",
  "go test": "go test ./...",
  "cargo test": "cargo test",
};

// How each test runner accepts a name filter
function buildTestFilterArgs(runner: string, filter: string): string[] {
  switch (runner) {
    case "bun test": return [filter];
    case "vitest": return ["--testNamePattern", filter];
    case "jest": return ["--testNamePattern", filter];
    case "pytest": return ["-k", filter];
    case "go test": return ["-run", filter];
    case "cargo test": return [filter];
    default: return [filter];
  }
}

// ---- Auto-detection scanners ----

type DetectedTools = { formatter?: string; linter?: string; typecheck?: string; testRunner?: string };

async function scanPackageJson(rootDir: string): Promise<DetectedTools> {
  const tools: DetectedTools = {};
  try {
    const raw = await Bun.file(`${rootDir}/package.json`).text();
    const pkg = JSON.parse(raw);
    const deps = { ...pkg.devDependencies, ...pkg.dependencies };
    if (deps.prettier) tools.formatter = "prettier --write";
    if (deps.eslint) tools.linter = "eslint";
    if (deps.vitest) tools.testRunner = "vitest";
    else if (deps.jest) tools.testRunner = "jest";
    if (deps.typescript) tools.typecheck = "tsc --noEmit";
    if (deps["@biomejs/biome"]) {
      if (!tools.formatter) tools.formatter = "biome format --write";
      if (!tools.linter) tools.linter = "biome lint";
    }
  } catch {}
  return tools;
}

async function scanPyprojectToml(rootDir: string): Promise<DetectedTools> {
  const tools: DetectedTools = {};
  try {
    const raw = await Bun.file(`${rootDir}/pyproject.toml`).text();
    if (/\[tool\.pytest\]/.test(raw)) tools.testRunner = "pytest";
    if (/\[tool\.mypy\]/.test(raw)) tools.typecheck = "mypy";
    if (/\[tool\.ruff\]/.test(raw)) {
      if (!tools.linter) tools.linter = "ruff check";
    }
  } catch {}
  return tools;
}

async function scanGoMod(rootDir: string): Promise<DetectedTools> {
  const tools: DetectedTools = {};
  try {
    await Bun.file(`${rootDir}/go.mod`).text();
    tools.typecheck = "go vet";
    tools.testRunner = "go test";
  } catch {}
  return tools;
}

async function scanCargoToml(rootDir: string): Promise<DetectedTools> {
  const tools: DetectedTools = {};
  try {
    await Bun.file(`${rootDir}/Cargo.toml`).text();
    tools.formatter = "rustfmt --edition 2021";
    tools.linter = "cargo clippy";
    tools.typecheck = "cargo check";
    tools.testRunner = "cargo test";
  } catch {}
  return tools;
}

const CONFIG_SCANNERS: Record<string, (rootDir: string) => Promise<DetectedTools>> = {
  "package.json": scanPackageJson,
  "pyproject.toml": scanPyprojectToml,
  "go.mod": scanGoMod,
  "Cargo.toml": scanCargoToml,
};

// Walk up from a directory looking for config files
async function findProjectRoot(fromDir: string): Promise<string> {
  let dir = fromDir;
  for (let i = 0; i < 10; i++) {
    for (const fname of Object.keys(CONFIG_SCANNERS)) {
      const f = Bun.file(`${dir}/${fname}`);
      if (await f.exists()) return dir;
    }
    const parent = dir.split("/").slice(0, -1).join("/") || "/";
    if (parent === dir) break;
    dir = parent;
  }
  return fromDir;
}

async function detectTools(
  files: string[],
  options: VerifyOptions
): Promise<{ detected: DetectedTools; effective: VerifyOptions }> {
  if (!options.autoDetect) return { detected: {}, effective: options };

  const detected: DetectedTools = {};
  const rootDir = files.length > 0
    ? await findProjectRoot(files[0].split("/").slice(0, -1).join("/") || ".")
    : ".";

  for (const [fname, scanner] of Object.entries(CONFIG_SCANNERS)) {
    const exists = await Bun.file(`${rootDir}/${fname}`).exists();
    if (exists) {
      const tools = await scanner(rootDir);
      if (tools.formatter) detected.formatter = tools.formatter;
      if (tools.linter) detected.linter = tools.linter;
      if (tools.typecheck) detected.typecheck = tools.typecheck;
      if (tools.testRunner) detected.testRunner = tools.testRunner;
      break; // Use first matching config file
    }
  }

  // Extension-based fallback if no config file found
  if (!detected.testRunner && files.length > 0) {
    const exts = new Set(files.map((f) => {
      const m = f.match(/\.([^.]+)$/);
      return m ? `.${m[1]}` : "";
    }));
    for (const ext of exts) {
      const defs = EXT_TOOLS[ext];
      if (defs) {
        if (!detected.testRunner) detected.testRunner = defs.test;
        if (!detected.typecheck && defs.typecheck) detected.typecheck = defs.typecheck;
      }
    }
  }

  // Merge: explicit options win over detected
  return {
    detected,
    effective: {
      ...options,
      formatter: options.formatter || detected.formatter,
      linter: options.linter || detected.linter,
      typecheck: options.typecheck || detected.typecheck,
      testRunner: options.testRunner || detected.testRunner,
    },
  };
}

// ---- Process execution ----

async function runTool(
  cmd: string,
  args: string[],
  timeoutMs: number = 30000
): Promise<{ passed: boolean; output: string }> {
  const parts = cmd.split(" ");
  const binary = parts[0];
  const builtinArgs = parts.slice(1);
  const allArgs = [...builtinArgs, ...args];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const proc = Bun.spawn([binary, ...allArgs], {
      stdout: "pipe",
      stderr: "pipe",
      signal: controller.signal,
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    return {
      passed: exitCode === 0,
      output: (stdout + "\n" + stderr).trim(),
    };
  } catch (err: any) {
    return {
      passed: false,
      output: `Failed to run ${cmd}: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---- Main entry point ----

export async function verifyChanges(
  files: string[],
  options: VerifyOptions = {}
): Promise<VerifyResult> {
  const start = Date.now();
  const fileHashes: Record<string, string> = {};
  const timeout = options.timeout ?? 30000;

  // Snapshot originals for revert-on-failure
  const originals = new Map<string, string>();
  if (options.revertOnFailure) {
    for (const f of files) {
      try { originals.set(f, await Bun.file(f).text()); } catch {}
    }
  }

  for (const f of files) {
    try {
      const content = await Bun.file(f).text();
      fileHashes[f] = computeHash(content);
    } catch {
      fileHashes[f] = "ERROR";
    }
  }

  const { detected, effective } = await detectTools(files, options);

  // Formatter
  const formatter = effective.formatter ? await runTool(
    effective.formatter,
    [...(options.formatterArgs || []), ...files],
    timeout
  ) : undefined;

  // Linter
  const linter = effective.linter ? await runTool(
    effective.linter,
    [...(options.linterArgs || []), ...files],
    timeout
  ) : undefined;

  // Typecheck
  const typecheck = effective.typecheck ? await runTool(
    effective.typecheck,
    files,
    timeout
  ) : undefined;

  // Tests
  let tests: { passed: boolean; output: string } | undefined;
  if (effective.testRunner || options.testFilter) {
    const runner = effective.testRunner || "bun test";
    const runnerCmd = TEST_RUNNER_MAP[runner] || runner;
    const testArgs = [
      ...(options.testArgs || []),
      ...(options.testFilter ? buildTestFilterArgs(runner, options.testFilter) : []),
    ];
    tests = await runTool(runnerCmd, testArgs, timeout);
  }

  const elapsed = Date.now() - start;

  const allPass =
    (!formatter || formatter.passed) &&
    (!linter || linter.passed) &&
    (!typecheck || typecheck.passed) &&
    (!tests || tests.passed);

  const anyFail =
    (!!formatter && !formatter.passed) ||
    (!!linter && !linter.passed) ||
    (!!typecheck && !typecheck.passed) ||
    (!!tests && !tests.passed);

  const failedIn: string[] = [];
  if (formatter && !formatter.passed) failedIn.push("formatter");
  if (linter && !linter.passed) failedIn.push("linter");
  if (typecheck && !typecheck.passed) failedIn.push("typecheck");
  if (tests && !tests.passed) failedIn.push("tests");

  const overall: "pass" | "fail" = allPass ? "pass" : "fail";

  const result: VerifyResult = {
    files,
    formatter: formatter || undefined,
    linter: linter || undefined,
    typecheck: typecheck || undefined,
    tests: tests || undefined,
    overall,
    elapsed_ms: elapsed,
    fileHashes,
    detected: Object.keys(detected).length > 0 ? detected : undefined,
  };

  // Revert on failure
  if (overall === "fail" && options.revertOnFailure && originals.size > 0) {
    const reverted: string[] = [];
    for (const [f, original] of originals) {
      try { await Bun.write(f, original); reverted.push(f); } catch {}
    }
    result.revertedFiles = reverted;
  }

  recordEvent({
    operation: "verify-changes",
    route: "verify",
    success: overall === "pass",
    verification_result: overall,
    failed_in: failedIn.length > 0 ? failedIn : undefined,
    elapsed_ms: elapsed,
    files_count: files.length,
  });

  return result;
}
