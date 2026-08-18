import { realpathSync } from "fs";
import { join, dirname, resolve } from "path";
import { computeHash } from "./read";
// Aliased: this module already has its own async `findProjectRoot` that walks up
// looking for tool config files. That one answers "which tools apply here"; this
// one answers "where is the write boundary" and must not be confused with it.
import { safeWrite, findProjectRoot as findWriteRoot } from "./paths";
import { recordEvent, ErrorCode } from "./telemetry";
import { buildTestInvocation, parseFailures, type TestInvocation } from "./verify-scope";
import {
  compareToBaseline,
  currentCommit,
  readBaseline,
  scopeSignature,
  writeBaseline,
  type Baseline,
  type BaselineReport,
} from "./verify-baseline";

/** One tool invocation's outcome. */
export interface ToolRun {
  passed: boolean;
  output: string;
  resolved?: string;
  /** The tool was killed at the timeout. Never a pass, and never a plain fail. */
  timedOut?: boolean;
  /** Captured output hit the cap and was cut; see MAX_CAPTURED_OUTPUT. */
  truncated?: boolean;
}

export interface VerifyResult {
  files: string[];
  formatter?: ToolRun;
  linter?: ToolRun;
  tests?: ToolRun;
  typecheck?: ToolRun;
  /**
   * `timeout` is deliberately its own state: a suite that ran out of time says
   * nothing about the edit, so collapsing it into `fail` both misreports the
   * change and (with --revert-on-failure) destroys it.
   */
  overall: "pass" | "fail" | "timeout";
  /** Which checks timed out, when `overall` is "timeout". */
  timedOut?: string[];
  /** Set on any non-pass outcome so callers get a stable exit code. */
  errorCode?: string;
  /** How the test command was scoped — `scoped: false` means the full suite ran. */
  testScope?: TestInvocation;
  /** Baseline comparison, when one was requested. */
  baseline?: BaselineReport;
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
  /** When true, allow any binary name. When false (default), only allowlisted tools are permitted. */
  allowArbitraryTool?: boolean;
  /**
   * Restrict the test run to the changed files. Default true — the full suite
   * is the fallback, not the norm. `VerifyResult.testScope` always reports
   * which one actually happened.
   */
  scopeTests?: boolean;
  /**
   * Subtract the baseline recorded for this commit, so only *newly* failing
   * tests fail verification. Off by default: without a baseline on disk it
   * changes nothing, and turning it on silently would hide the fact that the
   * caller never recorded one.
   */
  useBaseline?: boolean;
}

// ---- Security: allowlist of known-safe binaries (B19) ----
// Any binary not on this list requires --allow-arbitrary-tool.
// The allowlist is checked against the first token (the actual executable),
// not against arguments — e.g. "tsc" passes but "/tmp/evil.sh" does not.
const ALLOWED_BINARIES = new Set([
  // JavaScript/TypeScript tooling
  "prettier", "biome", "eslint", "tsc",
  "bun", "node", "npx",
  "vitest", "jest",
  // Python
  "python", "python3", "mypy", "ruff", "black", "pytest",
  // Go
  "go",
  // Rust
  "cargo", "rustfmt", "clippy", "rustc",
  // Generic/unix tools (safe for formatting/linting)
  "gofmt",
]);

// Arguments that turn an allowlisted tool into an arbitrary-code interpreter.
// Matched against every argument, not just the first — `node --experimental-x -e`
// is the same hole as `node -e`.
const DENIED_ARGS: Record<string, RegExp> = {
  node: /^(-e|--eval|-p|--print|--input-type)$/,
  bun: /^(-e|--eval|--print|repl|exec|x)$/,
  python: /^(-c|-m)$/,
  python3: /^(-c|-m)$/,
  npx: /^(-c|--call|-p|--package)$/,
  go: /^(run|generate|install)$/,
  cargo: /^(run|install)$/,
};

/** The one directory a path-form binary may live in: the project's own bin shims. */
function allowedBinDir(): string {
  return join(findWriteRoot(), "node_modules", ".bin");
}

/** Resolve a command string to [binary, ...args]. Validates the binary against
 * the allowlist unless `allowArbitrary` is true. Returns an error string instead.
 */
function resolveCommand(cmd: string, allowArbitrary: boolean): { binary: string; args: string[] } | { error: string } {
  const parts = cmd.trim().split(/\s+/).filter(Boolean);
  const binary = parts[0];
  if (!binary) return { error: `empty command` };
  const args = parts.slice(1);
  if (allowArbitrary) return { binary, args };

  // A path is checked by where it actually points, not by its basename.
  // Basename matching let `/tmp/evil/tsc` through: the name is on the allowlist
  // while the file is anything the caller chose to drop there.
  if (/[\\/]/.test(binary)) {
    let real: string;
    try {
      real = realpathSync(binary);
    } catch {
      return { error: `binary "${binary}" could not be resolved` };
    }
    const binDir = allowedBinDir();
    if (dirname(real) !== binDir && dirname(resolve(binary)) !== binDir) {
      return { error: `binary "${binary}" is a path outside ${binDir}. Use --allow-arbitrary-tool to override.` };
    }
    return { binary: real, args };
  }

  if (!ALLOWED_BINARIES.has(binary)) {
    return {
      error: `binary "${binary}" is not in the allowlist. Use --allow-arbitrary-tool to override. Allowed: ${[...ALLOWED_BINARIES].sort().join(", ")}`,
    };
  }

  // An allowlisted binary is only safe with the arguments it was allowlisted for.
  // `node`, `python`, `go` and friends all have a flag that turns them into a
  // general-purpose interpreter, which defeats the allowlist entirely.
  const denied = DENIED_ARGS[binary];
  if (denied) {
    const bad = args.find((a) => denied.test(a));
    if (bad) {
      return { error: `argument "${bad}" is not permitted for "${binary}" — it executes arbitrary code. Use --allow-arbitrary-tool to override.` };
    }
  }

  return { binary, args };
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

// Test runner command mapping — never uses `npx` without --no-install (B19).
// A missing package is an error instead of a network fetch.
const TEST_RUNNER_MAP: Record<string, string> = {
  "bun test": "bun test",
  "vitest": "npx --no-install vitest run",
  "jest": "npx --no-install jest",
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
  const effective = {
    ...options,
    formatter: options.formatter || detected.formatter,
    linter: options.linter || detected.linter,
    typecheck: options.typecheck || detected.typecheck,
    testRunner: options.testRunner || detected.testRunner,
  };

  // Warn when auto-detect fills in a tool from the target repo (B19)
  for (const key of ["formatter", "linter", "typecheck", "testRunner"] as const) {
    if (!options[key] && detected[key]) {
      console.error(`[verify-changes] auto-detected ${key} from project config: ${detected[key]}`);
    }
  }

  return { detected, effective };
}

// ---- Process execution ----

/**
 * Cap on captured output per stream. Beyond this we keep reading (so the child
 * never blocks on a full pipe) but stop retaining, and append the marker below
 * so a caller can tell truncation from a tool that simply said little.
 */
const MAX_CAPTURED_OUTPUT = 256 * 1024;
const TRUNCATION_MARKER = "\n[hashpilot: output truncated at 256KB]";

/**
 * Read a stream to completion, retaining at most `cap` bytes.
 *
 * Draining past the cap is the point: a child writing more than the pipe buffer
 * holds blocks until someone reads, so a parent that stops reading and waits on
 * exit deadlocks. Both streams are drained concurrently for the same reason —
 * reading stdout to EOF first hangs on a child that fills stderr.
 */
async function drainStream(
  stream: ReadableStream<Uint8Array> | null | undefined,
  cap: number
): Promise<{ text: string; truncated: boolean }> {
  if (!stream) return { text: "", truncated: false };
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let text = "";
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (truncated) continue; // keep draining, stop retaining
      text += decoder.decode(value, { stream: true });
      if (text.length > cap) {
        text = text.slice(0, cap);
        truncated = true;
      }
    }
  } catch {
    // A killed child can tear the stream down mid-read; keep what we have.
  }
  return { text, truncated };
}

async function runTool(
  cmd: string,
  args: string[],
  timeoutMs: number = 30000,
  allowArbitrary: boolean = false
): Promise<ToolRun> {
  // Validate binary against allowlist (B19)
  const resolved = resolveCommand(cmd, allowArbitrary);
  if ("error" in resolved) {
    return { passed: false, output: `security: ${resolved.error}` };
  }

  const { binary, args: builtinArgs } = resolved;
  const allArgs = [...builtinArgs, ...args];
  const resolvedLine = `${binary} ${allArgs.filter(a => a.trim()).join(" ")}`;

  // Log the command that is about to execute (B19 requirement)
  console.error(`[verify-changes] running: ${resolvedLine}`);

  // `--allow-arbitrary-tool` is a real escape hatch, so say so when it is what
  // let this command through. Otherwise the override is invisible in the log
  // and an audit cannot tell a vetted tool from a bypassed one.
  if (allowArbitrary && "error" in resolveCommand(cmd, false)) {
    console.error(`[verify-changes] WARNING: running non-allowlisted command "${resolvedLine}" (--allow-arbitrary-tool)`);
  }

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    // Always spawn without shell (B19): argv array keeps shell metacharacters inert
    const proc = Bun.spawn([binary, ...allArgs], {
      stdout: "pipe",
      stderr: "pipe",
    });
    timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill(); } catch {}
    }, timeoutMs);

    const [out, err] = await Promise.all([
      drainStream(proc.stdout as ReadableStream<Uint8Array>, MAX_CAPTURED_OUTPUT),
      drainStream(proc.stderr as ReadableStream<Uint8Array>, MAX_CAPTURED_OUTPUT),
    ]);
    const exitCode = await proc.exited;
    const truncated = out.truncated || err.truncated;
    const output = (out.text + "\n" + err.text).trim() + (truncated ? TRUNCATION_MARKER : "");
    return {
      passed: !timedOut && exitCode === 0,
      output: timedOut ? `${output}\n[hashpilot: killed after ${timeoutMs}ms timeout]`.trim() : output,
      resolved: resolvedLine,
      ...(timedOut ? { timedOut: true } : {}),
      ...(truncated ? { truncated: true } : {}),
    };
  } catch (err: any) {
    return {
      passed: false,
      output: `Failed to run ${cmd}: ${err.message}`,
      resolved: resolvedLine,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The full test selection: scoping plus anything the caller narrowed it with.
 *
 * Baselines are keyed off this, not off `invocation.args` alone. A `--test-filter`
 * or extra `--test-args` changes *which tests ran*, and a baseline recorded over
 * one selection says nothing about another — keying on the scoping args only
 * would let a narrow run be subtracted from a wide one.
 */
function selectionArgs(
  runner: string,
  invocation: TestInvocation,
  options: VerifyOptions
): string[] {
  return [
    ...invocation.args,
    ...(options.testArgs || []),
    ...(options.testFilter ? buildTestFilterArgs(runner, options.testFilter) : []),
  ];
}

/**
 * Failure list for a run, or null when it cannot be trusted.
 *
 * Truncated output is treated as unparseable: the tail we dropped is exactly
 * where a runner prints its failure summary, so a partial list would look like
 * "fewer failures" and let baseline subtraction pass a real regression.
 */
function runFailures(runner: string, run: ToolRun): string[] | null {
  return run.truncated ? null : parseFailures(runner, run.output);
}

/** Directory scoping and baseline keys are resolved against. */
async function testRootFor(files: string[]): Promise<string> {
  if (files.length === 0) return ".";
  return findProjectRoot(files[0].split("/").slice(0, -1).join("/") || ".");
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
  const allowArbitrary = options.allowArbitraryTool ?? false;

  // Formatter
  const formatter = effective.formatter ? await runTool(
    effective.formatter,
    [...(options.formatterArgs || []), ...files],
    timeout,
    allowArbitrary
  ) : undefined;

  // Linter
  const linter = effective.linter ? await runTool(
    effective.linter,
    [...(options.linterArgs || []), ...files],
    timeout,
    allowArbitrary
  ) : undefined;

  // Typecheck
  const typecheck = effective.typecheck ? await runTool(
    effective.typecheck,
    files,
    timeout,
    allowArbitrary
  ) : undefined;

  // Tests
  let tests: ToolRun | undefined;
  let testScope: TestInvocation | undefined;
  let baselineReport: BaselineReport | undefined;
  if (effective.testRunner || options.testFilter) {
    const runner = effective.testRunner || "bun test";
    const rootDir = await testRootFor(files);
    const invocation = buildTestInvocation(runner, files, rootDir, { scope: options.scopeTests });
    testScope = invocation;
    const selection = selectionArgs(runner, invocation, options);
    const testArgs = [
      ...(runner === "pytest" ? ["-rf"] : []), // guarantees the parseable summary
      ...selection,
    ];
    tests = await runTool(invocation.cmd, testArgs, timeout, allowArbitrary);

    // Baseline subtraction. A timeout is never compared — it has no failure
    // list, only an absence of information.
    if (options.useBaseline && !tests.timedOut) {
      const scopeKey = scopeSignature(selection);
      const commit = await currentCommit(rootDir);
      const baseline = commit ? await readBaseline(rootDir, commit, runner, scopeKey) : undefined;
      baselineReport = commit
        ? compareToBaseline(baseline, runner, scopeKey, runFailures(runner, tests))
        : { source: "none", comparable: false, reason: "not a git repository; cannot key a baseline" };

      // Only newly failing tests count. A run that fails purely on tests that
      // were already broken at this commit is what makes --revert-on-failure
      // safe to enable.
      if (!tests.passed && baselineReport.comparable && baselineReport.newFailures?.length === 0) {
        tests = { ...tests, passed: true };
      }
    }
  }

  const elapsed = Date.now() - start;

  const allPass =
    (!formatter || formatter.passed) &&
    (!linter || linter.passed) &&
    (!typecheck || typecheck.passed) &&
    (!tests || tests.passed);

  const failedIn: string[] = [];
  if (formatter && !formatter.passed) failedIn.push("formatter");
  if (linter && !linter.passed) failedIn.push("linter");
  if (typecheck && !typecheck.passed) failedIn.push("typecheck");
  if (tests && !tests.passed) failedIn.push("tests");

  const timedOut = ([
    ["formatter", formatter],
    ["linter", linter],
    ["typecheck", typecheck],
    ["tests", tests],
  ] as const).filter(([, run]) => run?.timedOut).map(([name]) => name);

  // Timeout outranks failure: a check that never finished has not judged the
  // edit, and reporting "fail" would license a revert on no evidence.
  const overall: "pass" | "fail" | "timeout" =
    timedOut.length > 0 ? "timeout" : allPass ? "pass" : "fail";

  const result: VerifyResult = {
    files,
    formatter: formatter || undefined,
    linter: linter || undefined,
    typecheck: typecheck || undefined,
    tests: tests || undefined,
    overall,
    timedOut: timedOut.length > 0 ? [...timedOut] : undefined,
    errorCode:
      overall === "timeout"
        ? ErrorCode.VERIFY_TIMEOUT
        : overall === "fail"
          ? ErrorCode.VERIFY_FAILED
          : undefined,
    testScope,
    baseline: baselineReport,
    elapsed_ms: elapsed,
    fileHashes,
    detected: Object.keys(detected).length > 0 ? detected : undefined,
  };

  // Revert on failure. Deliberately not on `timeout` — deleting the caller's
  // work because a suite was slow is the destructive half of issue #24.
  if (overall === "fail" && options.revertOnFailure && originals.size > 0) {
    const reverted: string[] = [];
    for (const [f, original] of originals) {
      try { await safeWrite(f, original); reverted.push(f); } catch {}
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

export interface RecordBaselineResult {
  recorded: boolean;
  reason: string;
  commit?: string;
  runner?: string;
  failures?: string[] | null;
  /** True when a usable baseline already existed for this commit and scope. */
  cached?: boolean;
}

/**
 * Record which tests already fail, for later subtraction by `useBaseline`.
 *
 * Must be called on the pre-edit tree — it runs the suite as-is and believes
 * what it sees. `plan-executor` calls it before applying any step; a human or
 * agent can call it directly via `verify-changes --record-baseline`.
 *
 * Cached per commit SHA (and per test selection), so the cost is paid once per
 * commit rather than once per edit.
 */
export async function recordVerifyBaseline(
  files: string[],
  options: VerifyOptions = {}
): Promise<RecordBaselineResult> {
  const { effective } = await detectTools(files, options);
  const runner = effective.testRunner || options.testRunner;
  if (!runner) return { recorded: false, reason: "no test runner configured or detected" };

  const rootDir = await testRootFor(files);
  const commit = await currentCommit(rootDir);
  if (!commit) return { recorded: false, reason: "not a git repository; a baseline needs a commit to key on" };

  const invocation = buildTestInvocation(runner, files, rootDir, { scope: options.scopeTests });
  const selection = selectionArgs(runner, invocation, options);
  const scopeKey = scopeSignature(selection);

  const existing = await readBaseline(rootDir, commit, runner, scopeKey);
  if (existing) {
    return { recorded: false, cached: true, reason: "baseline already recorded for this commit", commit, runner, failures: existing.failures };
  }

  const run = await runTool(
    invocation.cmd,
    [...(runner === "pytest" ? ["-rf"] : []), ...selection],
    options.timeout ?? 30000,
    options.allowArbitraryTool ?? false
  );
  if (run.timedOut) {
    // A timed-out baseline would record "nothing was failing", which would then
    // mark every real pre-existing failure as new. Refuse to write it.
    return { recorded: false, reason: "baseline run timed out; not recording an unreliable baseline", commit, runner };
  }

  const baseline: Baseline = {
    commit,
    runner,
    scopeKey,
    failures: runFailures(runner, run),
    clean: run.passed,
    recorded_at: new Date().toISOString(),
  };
  await writeBaseline(rootDir, baseline);
  return { recorded: true, reason: "baseline recorded", commit, runner, failures: baseline.failures };
}
