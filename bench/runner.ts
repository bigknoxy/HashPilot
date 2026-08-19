#!/usr/bin/env bun
/**
 * HashPilot benchmark harness (#26).
 *
 * Runs every case in `bench/cases/` through the real `routeEdit` entry point —
 * the same code path the CLI and the MCP server use — against a scratch copy of
 * each fixture, and classifies the outcome. Nothing is mocked: if the router
 * would corrupt a file in production, it corrupts the scratch copy here and the
 * case is recorded as silent corruption.
 *
 *   bun run bench            # run and print the summary
 *   bun run bench --write    # also update bench/results/latest.json
 *   bun run bench --filter x # only cases whose id contains "x"
 *
 * Exit code is 0 unless a case regressed relative to `bench/results/latest.json`
 * — that is, unless a case that was `correct` there is not `correct` now. New
 * red lines on cases that are already red (known-issue guards) do not fail the
 * run, so the harness can land before the bugs it measures are fixed.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { routeEdit } from "../src/core/router";
import { computeLineRangeHashOf } from "./hash-util";
import { detectLanguage, firstParseError } from "../src/core/ast-edit";
import { configureWriteBoundary } from "../src/core/paths";
import type { BenchCase, BenchReport, CaseResult, Outcome } from "./types";
import { astCases } from "./cases/ast";
import { hashCases } from "./cases/hash";
import { diffCases } from "./cases/diff";

/** Bump when a classification rule changes, so old results are not compared to new ones. */
const HARNESS_VERSION = "1";

const ALL_CASES: BenchCase[] = [...astCases, ...hashCases, ...diffCases];

const RESULTS_PATH = join(import.meta.dir, "results", "latest.json");

async function runCase(c: BenchCase, workRoot: string): Promise<CaseResult> {
  const path = join(workRoot, c.id, c.file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, c.source);

  const language = detectLanguage(c.file) || "unknown";
  const started = Date.now();

  const edit = { ...c.edit };
  if (c.hashRange) {
    edit.oldHash = computeLineRangeHashOf(c.source, c.hashRange.start, c.hashRange.end);
  }

  let routed;
  try {
    routed = await routeEdit({ filePath: path, ...edit });
  } catch (err) {
    return {
      id: c.id,
      description: c.description,
      language,
      route: "n/a",
      outcome: "harness-error",
      unparseable: false,
      elapsed_ms: Date.now() - started,
      detail: `routeEdit threw: ${err instanceof Error ? err.message : String(err)}`,
      knownIssue: c.knownIssue,
      tags: c.tags,
    };
  }

  const elapsed_ms = Date.now() - started;
  const after = existsSync(path) ? readFileSync(path, "utf8") : "";
  const route = routed.route ?? "unknown";
  const succeeded = routed.result?.success === true;
  const unparseable = firstParseError(after, c.file) !== null;

  const base = { id: c.id, description: c.description, language, route, unparseable, elapsed_ms, knownIssue: c.knownIssue, tags: c.tags };
  const classify = (outcome: Outcome, detail?: string): CaseResult => ({ ...base, outcome, detail });

  // Refusal cases: failure plus an untouched file is the passing outcome.
  if (c.expectRefusal) {
    if (!succeeded && after === c.source) return classify("correct-refusal");
    if (succeeded) {
      return classify(
        "silent-corruption",
        `expected a refusal (${c.expectRefusal}) but the edit reported success`
      );
    }
    return classify("silent-corruption", "the edit was refused but the file was modified anyway");
  }

  // Edit cases.
  if (!succeeded) {
    if (after !== c.source) {
      return classify("silent-corruption", "the edit reported failure but the file was modified");
    }
    return classify("false-refusal", routed.result?.message || "refused with no message");
  }
  if (after === c.expected) return classify("correct");
  return classify(
    "silent-corruption",
    unparseable
      ? "reported success; the result does not parse"
      : `reported success; result differs from expected\n--- expected\n${c.expected}\n--- actual\n${after}`
  );
}

function tally(results: CaseResult[], key: (r: CaseResult) => string) {
  const out: Record<string, { cases: number; correct: number; silentCorruption: number; falseRefusal: number; correctRefusal: number }> = {};
  for (const r of results) {
    const k = key(r);
    out[k] ??= { cases: 0, correct: 0, silentCorruption: 0, falseRefusal: 0, correctRefusal: 0 };
    out[k].cases++;
    if (r.outcome === "correct") out[k].correct++;
    else if (r.outcome === "silent-corruption") out[k].silentCorruption++;
    else if (r.outcome === "false-refusal") out[k].falseRefusal++;
    else if (r.outcome === "correct-refusal") out[k].correctRefusal++;
  }
  return out;
}

function version(): string {
  try {
    return JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function commit(): Promise<string> {
  try {
    const p = Bun.spawn(["git", "rev-parse", "--short", "HEAD"], { stdout: "pipe", stderr: "ignore" });
    return (await new Response(p.stdout).text()).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

export async function runBench(filter?: string): Promise<BenchReport> {
  const cases = filter ? ALL_CASES.filter((c) => c.id.includes(filter)) : ALL_CASES;
  const workRoot = mkdtempSync(join(tmpdir(), "hashpilot-bench-"));
  // Fixtures live outside the project root by design — a scratch tree keeps the
  // repo clean and proves the boundary is configurable rather than hardcoded.
  configureWriteBoundary({ allowedRoots: [workRoot], quiet: true });

  try {
    const results: CaseResult[] = [];
    for (const c of cases) results.push(await runCase(c, workRoot));

    const correct = results.filter((r) => r.outcome === "correct").length;
    const silentCorruption = results.filter((r) => r.outcome === "silent-corruption").length;
    const falseRefusal = results.filter((r) => r.outcome === "false-refusal").length;
    const correctRefusal = results.filter((r) => r.outcome === "correct-refusal").length;
    const harnessError = results.filter((r) => r.outcome === "harness-error").length;
    const scored = results.length - correctRefusal;

    return {
      harnessVersion: HARNESS_VERSION,
      hashpilotVersion: version(),
      commit: await commit(),
      generatedAt: new Date().toISOString(),
      totals: {
        cases: results.length,
        correct,
        silentCorruption,
        falseRefusal,
        correctRefusal,
        harnessError,
        correctnessRate: scored === 0 ? 0 : Number((correct / scored).toFixed(4)),
        silentCorruptionRate: results.length === 0 ? 0 : Number((silentCorruption / results.length).toFixed(4)),
        totalElapsedMs: results.reduce((a, r) => a + r.elapsed_ms, 0),
      },
      byRoute: tally(results, (r) => r.route),
      byLanguage: tally(results, (r) => r.language),
      results,
    };
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

function printReport(report: BenchReport): void {
  const t = report.totals;
  const line = "-".repeat(64);
  console.log(line);
  console.log(`HashPilot bench  v${report.hashpilotVersion} @ ${report.commit}  harness ${report.harnessVersion}`);
  console.log(line);
  console.log(`cases                 ${t.cases}`);
  console.log(`correct               ${t.correct}`);
  console.log(`correct refusals      ${t.correctRefusal}`);
  console.log(`false refusals        ${t.falseRefusal}`);
  console.log(`SILENT CORRUPTION     ${t.silentCorruption}   (${pct(t.silentCorruption, t.cases)})`);
  if (t.harnessError) console.log(`harness errors        ${t.harnessError}`);
  console.log(`correctness rate      ${pct(t.correct, t.cases - t.correctRefusal)}  (excludes correct refusals)`);
  console.log(`wall clock            ${t.totalElapsedMs}ms total`);
  console.log(line);
  console.log("by route:");
  for (const [route, s] of Object.entries(report.byRoute)) {
    console.log(`  ${route.padEnd(8)} ${String(s.correct + s.correctRefusal).padStart(3)}/${String(s.cases).padEnd(3)} ok   corruption ${s.silentCorruption}   false-refusal ${s.falseRefusal}`);
  }
  const bad = report.results.filter((r) => r.outcome !== "correct" && r.outcome !== "correct-refusal");
  if (bad.length) {
    console.log(line);
    console.log("failing cases:");
    for (const r of bad) {
      const issue = r.knownIssue ? ` [#${r.knownIssue}]` : "";
      console.log(`  ${r.outcome.padEnd(18)} ${r.id}${issue}`);
      if (r.detail) console.log(`      ${r.detail.split("\n").join("\n      ")}`);
    }
  }
  console.log(line);
}

/**
 * Fail only on regressions. A case that is red in the committed baseline stays
 * red without failing the run — those are the known-issue guards this harness
 * exists to measure. A case that was green and is now not is a regression.
 */
function regressions(report: BenchReport): string[] {
  if (!existsSync(RESULTS_PATH)) return [];
  let baseline: BenchReport;
  try {
    baseline = JSON.parse(readFileSync(RESULTS_PATH, "utf8"));
  } catch {
    return [];
  }
  if (baseline.harnessVersion !== report.harnessVersion) return [];
  const now = new Map(report.results.map((r) => [r.id, r.outcome]));
  const passing = (o: Outcome | undefined) => o === "correct" || o === "correct-refusal";
  return baseline.results
    .filter((b) => passing(b.outcome) && !passing(now.get(b.id)))
    .map((b) => `${b.id}: ${b.outcome} -> ${now.get(b.id) ?? "missing"}`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const filterIdx = args.indexOf("--filter");
  const filter = filterIdx >= 0 ? args[filterIdx + 1] : undefined;
  const report = await runBench(filter);
  printReport(report);

  const regressed = regressions(report);

  if (args.includes("--write")) {
    mkdirSync(dirname(RESULTS_PATH), { recursive: true });
    writeFileSync(RESULTS_PATH, JSON.stringify(report, null, 2) + "\n");
    console.log(`wrote ${RESULTS_PATH}`);
  }

  if (regressed.length && !filter) {
    console.error("REGRESSIONS against bench/results/latest.json:");
    for (const r of regressed) console.error(`  ${r}`);
    process.exit(1);
  }
}
