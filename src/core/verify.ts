import { spawn } from "child_process";
import { computeHash } from "./read";
import { recordEvent } from "./telemetry";

export interface VerifyResult {
  files: string[];
  formatter?: { passed: boolean; output: string };
  linter?: { passed: boolean; output: string };
  tests?: { passed: boolean; output: string };
  overall: "pass" | "fail" | "partial";
  elapsed_ms: number;
  fileHashes: Record<string, string>;
}

export interface VerifyOptions {
  formatter?: string;
  linter?: string;
  testFilter?: string;
  formatterArgs?: string[];
  linterArgs?: string[];
  testArgs?: string[];
}

export async function verifyChanges(
  files: string[],
  options: VerifyOptions = {}
): Promise<VerifyResult> {
  const start = Date.now();
  const fileHashes: Record<string, string> = {};

  for (const f of files) {
    try {
      const content = await Bun.file(f).text();
      fileHashes[f] = computeHash(content);
    } catch {
      fileHashes[f] = "ERROR";
    }
  }

  const formatter = options.formatter ? await runTool(options.formatter, [
    ...(options.formatterArgs || []),
    ...files,
  ]) : undefined;

  const linter = options.linter ? await runTool(options.linter, [
    ...(options.linterArgs || []),
    ...files,
  ]) : undefined;

  const tests = options.testFilter ? await runTool("bun", [
    "test",
    ...(options.testArgs || []),
    options.testFilter,
  ]) : undefined;

  const elapsed = Date.now() - start;

  const allPass =
    (!formatter || formatter.passed) &&
    (!linter || linter.passed) &&
    (!tests || tests.passed);

  const anyFail =
    (formatter && !formatter.passed) ||
    (linter && !linter.passed) ||
    (tests && !tests.passed);

  const failedIn: string[] = [];
  if (formatter && !formatter.passed) failedIn.push("formatter");
  if (linter && !linter.passed) failedIn.push("linter");
  if (tests && !tests.passed) failedIn.push("tests");

  const result: VerifyResult = {
    files,
    formatter: formatter || undefined,
    linter: linter || undefined,
    tests: tests || undefined,
    overall: allPass ? "pass" : anyFail ? "fail" : "partial",
    elapsed_ms: elapsed,
    fileHashes,
  };

  recordEvent({
    operation: "verify-changes",
    route: "verify",
    success: result.overall === "pass",
    verification_result: result.overall,
    failed_in: failedIn.length > 0 ? failedIn : undefined,
    elapsed_ms: elapsed,
    files_count: files.length,
  });

  return result;
}

async function runTool(
  cmd: string,
  args: string[]
): Promise<{ passed: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => {
      resolve({
        passed: code === 0,
        output: (stdout + "\n" + stderr).trim(),
      });
    });
    proc.on("error", (err) => {
      resolve({
        passed: false,
        output: `Failed to run ${cmd}: ${err.message}`,
      });
    });
  });
}