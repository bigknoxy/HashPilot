/**
 * Pre-edit test baselines for `verify-changes` (issue #24).
 *
 * The destructive case this exists to close: a repo has one already-broken
 * test, an agent makes a correct edit, verification runs, the suite fails for a
 * reason the agent never touched, and `--revert-on-failure` deletes correct
 * work. Subtracting a baseline recorded *before* the edit turns that into a
 * pass, and leaves a genuinely new failure still failing.
 *
 * The baseline is keyed by commit SHA because that is the granularity at which
 * "which tests were already broken" actually changes; every edit at the same
 * commit reuses one recorded run.
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { createHash } from "crypto";

export interface Baseline {
  /** Commit the baseline was recorded at. */
  commit: string;
  /** Runner the failures were parsed from — a baseline is not portable across runners. */
  runner: string;
  /**
   * Signature of the test selection the baseline was recorded with. A baseline
   * taken over one scoped subset says nothing about tests it never ran, so a
   * differing scope must not be subtracted.
   */
  scopeKey: string;
  /** Failing test identifiers, or null when the output could not be parsed. */
  failures: string[] | null;
  /** True when the baseline run itself passed cleanly. */
  clean: boolean;
  recorded_at: string;
}

/** Where a baseline came from, reported back to the caller. */
export type BaselineSource = "cache" | "recorded" | "none";

export interface BaselineReport {
  source: BaselineSource;
  commit?: string;
  /** Failures already present before the edit. */
  preExisting?: string[];
  /** Failures present now that were not in the baseline. */
  newFailures?: string[];
  /**
   * False when the comparison could not be trusted — no baseline, a different
   * runner, or unparseable output on either side. The caller must then treat
   * any failure as a failure.
   */
  comparable: boolean;
  /** Human-readable explanation, always set. */
  reason: string;
}

function baselineDir(): string {
  // Overridable so tests can isolate the cache. Left as the real global path by
  // default, but the project's own suite must point it elsewhere: otherwise the
  // suite records baselines for ITS OWN commit and a stale entry then suppresses
  // a later real run's regression. HASHPILOT_VERIFY_BASELINE_DIR is read at
  // call time, so a test flips it for one scenario and the next reads a fresh dir.
  return (
    process.env.HASHPILOT_VERIFY_BASELINE_DIR ||
    join(homedir(), ".agentic-tools", "verify-baselines")
  );
}

function baselineKey(rootDir: string, commit: string, runner: string, scopeKey: string): string {
  const h = createHash("sha256")
    .update(`${rootDir}\0${commit}\0${runner}\0${scopeKey}`)
    .digest("hex")
    .slice(0, 32);
  return join(baselineDir(), `${h}.json`);
}

/**
 * Current commit SHA for `rootDir`, or undefined outside a git repo. A dirty
 * tree still maps to its HEAD commit: the baseline records which tests were
 * broken at that commit, and uncommitted edits are exactly what we are testing.
 */
export async function currentCommit(rootDir: string): Promise<string | undefined> {
  try {
    const proc = Bun.spawn(["git", "-C", rootDir, "rev-parse", "HEAD"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const sha = (await new Response(proc.stdout).text()).trim();
    const code = await proc.exited;
    return code === 0 && /^[0-9a-f]{40}$/.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

/** Stable signature for a test selection, used to key baselines. */
export function scopeSignature(args: string[]): string {
  return createHash("sha256").update([...args].sort().join("\0")).digest("hex").slice(0, 16);
}

export async function readBaseline(
  rootDir: string,
  commit: string,
  runner: string,
  scopeKey: string
): Promise<Baseline | undefined> {
  try {
    const raw = await readFile(baselineKey(rootDir, commit, runner, scopeKey), "utf8");
    const parsed = JSON.parse(raw) as Baseline;
    return parsed.commit === commit && parsed.runner === runner && parsed.scopeKey === scopeKey
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

export async function writeBaseline(rootDir: string, baseline: Baseline): Promise<void> {
  await mkdir(baselineDir(), { recursive: true });
  await writeFile(
    baselineKey(rootDir, baseline.commit, baseline.runner, baseline.scopeKey),
    JSON.stringify(baseline, null, 2),
    "utf8"
  );
}

/**
 * Compare a post-edit run against a baseline.
 *
 * Every uncertainty resolves to `comparable: false`. Subtracting a baseline we
 * are not sure about would suppress a real regression, which is worse than
 * making the caller re-run the suite themselves.
 */
export function compareToBaseline(
  baseline: Baseline | undefined,
  runner: string,
  scopeKey: string,
  currentFailures: string[] | null
): BaselineReport {
  if (!baseline) {
    return {
      source: "none",
      comparable: false,
      reason: "no baseline recorded for this commit; every failure counts",
    };
  }
  if (baseline.runner !== runner) {
    return {
      source: "cache",
      commit: baseline.commit,
      comparable: false,
      reason: `baseline was recorded with "${baseline.runner}" but this run used "${runner}"`,
    };
  }
  if (baseline.scopeKey !== scopeKey) {
    return {
      source: "cache",
      commit: baseline.commit,
      comparable: false,
      reason: "baseline was recorded over a different set of tests than this run covered",
    };
  }
  if (baseline.failures === null || currentFailures === null) {
    return {
      source: "cache",
      commit: baseline.commit,
      comparable: false,
      reason: "test output could not be parsed into individual test names; every failure counts",
    };
  }

  const known = new Set(baseline.failures);
  const newFailures = currentFailures.filter((f) => !known.has(f));
  return {
    source: "cache",
    commit: baseline.commit,
    preExisting: baseline.failures,
    newFailures,
    comparable: true,
    reason:
      newFailures.length > 0
        ? `${newFailures.length} test(s) newly failing vs the baseline at ${baseline.commit.slice(0, 8)}`
        : `all failures were already failing at ${baseline.commit.slice(0, 8)}`,
  };
}
