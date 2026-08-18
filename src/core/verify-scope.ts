/**
 * Test scoping and failure extraction for `verify-changes` (issue #24).
 *
 * Two jobs, both about making verification usable instead of merely correct:
 *
 * 1. **Scoping** — run the tests that relate to the changed files, not the
 *    whole suite. A caller must be able to tell which it got, so every
 *    invocation carries `scoped` plus a human-readable `reason`.
 * 2. **Failure extraction** — pull individual failing test names out of a
 *    runner's output so a pre-edit baseline can be subtracted from a post-edit
 *    run. Parsing is best-effort per runner; when it cannot be trusted the
 *    parser returns `null` and callers must fall back to "any failure fails".
 */

import { existsSync } from "fs";
import { basename, dirname, extname, isAbsolute, join, relative } from "path";

/** How the test command was assembled, and whether it covers the whole suite. */
export interface TestInvocation {
  /** Command string, still subject to the binary allowlist in verify.ts. */
  cmd: string;
  /** Arguments appended after the command's own built-in args. */
  args: string[];
  /** False means the full suite ran. */
  scoped: boolean;
  /** Why it is scoped (or why it could not be) — surfaced in VerifyResult. */
  reason: string;
}

/** Base command per runner. Kept separate from the scoped forms below so a
 * scoped `go test` does not inherit `./...` from the unscoped default. */
const RUNNER_BASE: Record<string, string> = {
  "bun test": "bun test",
  vitest: "npx --no-install vitest run",
  jest: "npx --no-install jest",
  pytest: "python -m pytest",
  "go test": "go test",
  "cargo test": "cargo test",
};

/** Unscoped form, used when scoping is impossible. */
const RUNNER_FULL: Record<string, string> = {
  ...RUNNER_BASE,
  "go test": "go test ./...",
};

const TEST_FILE_PATTERNS = [
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)test_[^/]+\.py$/,
  /_test\.py$/,
  /_test\.go$/,
];

// Classification is by a file's OWN name, never the directory it sits in. A
// tests-location pattern used to flag a file merely because its absolute path
// passed through a `tests/` directory: that misclassified a source file under a
// `tests/` dir as a test, fed the source into the run, and starved the
// sibling-search that would find the real `foo.test.ts`. The `tests/` location is
// already covered on the derivation side in `relatedTestFiles` (which probes
// `../tests/<base>.test.<ext>`), so the input side stays name-based.
function looksLikeTestFile(file: string): boolean {
  return TEST_FILE_PATTERNS.some((re) => re.test(file));
}

/**
 * Candidate test files for a source file, by the conventions each ecosystem
 * actually uses. Only paths that exist are returned — a guess that does not
 * resolve is worse than falling back to the full suite, because it makes the
 * runner exit non-zero on a missing path and reads as a broken change.
 */
function relatedTestFiles(file: string): string[] {
  const dir = dirname(file);
  const ext = extname(file);
  const base = basename(file, ext);
  const candidates: string[] = [];

  if (/^\.[cm]?[jt]sx?$/.test(ext)) {
    for (const suffix of [".test", ".spec"]) {
      for (const e of [ext, ".ts", ".js"]) {
        candidates.push(join(dir, `${base}${suffix}${e}`));
        candidates.push(join(dir, "__tests__", `${base}${suffix}${e}`));
        candidates.push(join(dir, "..", "tests", `${base}${suffix}${e}`));
      }
    }
  } else if (ext === ".py") {
    candidates.push(join(dir, `test_${base}.py`));
    candidates.push(join(dir, `${base}_test.py`));
    candidates.push(join(dir, "..", "tests", `test_${base}.py`));
    candidates.push(join(dir, "tests", `test_${base}.py`));
  }

  return candidates.filter((c) => existsSync(c));
}

/**
 * Build the test command for a run over `files`.
 *
 * `--test-filter` and scoping are independent: a name filter narrows *within*
 * whatever set of files is selected, so both can apply at once.
 */
export function buildTestInvocation(
  runner: string,
  files: string[],
  rootDir: string,
  opts: { scope?: boolean } = {}
): TestInvocation {
  const full = RUNNER_FULL[runner] || runner;
  if (opts.scope === false) {
    return { cmd: full, args: [], scoped: false, reason: "scoping disabled by caller" };
  }
  if (files.length === 0) {
    return { cmd: full, args: [], scoped: false, reason: "no files given to scope to" };
  }

  const base = RUNNER_BASE[runner] || runner;

  switch (runner) {
    case "jest":
      // Jest's own related-test discovery: walks the module graph, so it finds
      // tests that import the changed file indirectly. Strictly better than any
      // path convention we could guess.
      return {
        cmd: base,
        args: ["--findRelatedTests", ...files],
        scoped: true,
        reason: "jest --findRelatedTests over changed files",
      };

    case "vitest":
      // Single `--related=a,b` rather than a repeated flag: a bare positional
      // list after `--related` is parsed as test-name filters by some versions.
      return {
        cmd: base,
        args: [`--related=${files.join(",")}`],
        scoped: true,
        reason: "vitest --related over changed files",
      };

    case "bun test":
    case "pytest": {
      // Neither runner has related-test discovery, so use the changed test
      // files directly and fall back to convention-derived ones.

      // changed file is a test, a direct test is treated as the author's
      // signal of what to run, so a changed source file's sibling test is only
      // derived when no direct test is co-listed; list that source's test
      // explicitly instead.
      const direct = files.filter(looksLikeTestFile);
      const derived = direct.length > 0 ? [] : files.flatMap(relatedTestFiles);
      const targets = [...new Set([...direct, ...derived])];
      if (targets.length === 0) {
        return {
          cmd: full,
          args: [],
          scoped: false,
          reason: `no test files found for the changed files; ran the full ${runner} suite`,
        };
      }
      return {
        cmd: base,
        args: targets,
        scoped: true,
        reason: `${runner} restricted to ${targets.length} related test file(s)`,
      };
    }

    case "go test": {
      // Go scopes by package, which is the directory.
      const pkgs = [...new Set(
        files.filter((f) => f.endsWith(".go")).map((f) => {
          const dir = dirname(isAbsolute(f) ? relative(rootDir, f) : f);
          return dir === "." || dir === "" ? "." : `./${dir}`;
        })
      )];
      if (pkgs.length === 0) {
        return { cmd: full, args: [], scoped: false, reason: "no .go files to scope to" };
      }
      return {
        cmd: base,
        args: pkgs,
        scoped: true,
        reason: `go test restricted to ${pkgs.length} package(s)`,
      };
    }

    case "cargo test": {
      // Only integration tests (tests/*.rs) are individually selectable;
      // a change under src/ can affect any unit test in the crate.
      const integration = files
        .filter((f) => /(^|\/)tests\/[^/]+\.rs$/.test(f))
        .map((f) => basename(f, ".rs"));
      if (integration.length === 0 || integration.length !== files.length) {
        return {
          cmd: full,
          args: [],
          scoped: false,
          reason: "cargo cannot scope unit tests to files; ran the full crate",
        };
      }
      return {
        cmd: base,
        args: [...new Set(integration)].flatMap((t) => ["--test", t]),
        scoped: true,
        reason: `cargo test restricted to ${integration.length} integration target(s)`,
      };
    }

    default:
      return {
        cmd: full,
        args: [],
        scoped: false,
        reason: `no scoping rule for runner "${runner}"; ran it unscoped`,
      };
  }
}

/**
 * Extract failing test identifiers from a runner's output.
 *
 * Returns `null` when the output shape is not recognised — the caller must then
 * treat any failure as a real failure rather than guess. A wrong "these are the
 * same failures as before" is the one answer that destroys work.
 */
export function parseFailures(runner: string, output: string): string[] | null {
  const lines = output.split("\n");
  const out: string[] = [];

  switch (runner) {
    case "bun test": {
      for (const line of lines) {
        const m = line.match(/^\s*\(fail\)\s+(.+?)(?:\s+\[[\d.]+\s*m?s\])?\s*$/);
        if (m) out.push(m[1].trim());
      }
      return /\d+\s+fail|\(fail\)|\d+\s+pass/.test(output) ? out : null;
    }

    case "vitest":
    case "jest": {
      let file = "";
      for (const line of lines) {
        const f = line.match(/^\s*(?:FAIL|✗)\s+(\S+)/);
        if (f) { file = f[1]; continue; }
        const t = line.match(/^\s*(?:✕|×|✗)\s+(.+?)(?:\s+\(\d+\s*m?s\))?\s*$/);
        if (t) out.push(`${file}::${t[1].trim()}`);
      }
      return /Tests?\s+\d+|FAIL|PASS|Test Files/.test(output) ? out : null;
    }

    case "pytest": {
      for (const line of lines) {
        const m = line.match(/^FAILED\s+(\S+)/) || line.match(/^ERROR\s+(\S+)/);
        if (m) out.push(m[1]);
      }
      // Without the short summary there is nothing to parse reliably; verify.ts
      // adds `-rf` so this branch normally has data.
      return /=+\s*(short test summary|\d+ (passed|failed))/.test(output) ? out : null;
    }

    case "go test": {
      for (const line of lines) {
        const m = line.match(/^\s*---\s+FAIL:\s+(\S+)/);
        if (m) out.push(m[1]);
      }
      return /^(ok|FAIL|PASS|---)/m.test(output) ? out : null;
    }

    case "cargo test": {
      for (const line of lines) {
        const m = line.match(/^test\s+(\S+)\s+\.\.\.\s+FAILED/);
        if (m) out.push(m[1]);
      }
      return /test result:/.test(output) ? out : null;
    }

    default:
      return null;
  }
}
