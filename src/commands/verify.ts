import type { Command } from "commander";
import {
  verifyChanges,
  recordVerifyBaseline,
  finish,
} from "../core/index";

/** Register the `verify` command group. */
export function register(program: Command): void {
  program
    .command("verify-changes")
    .description("Run formatter, linter, typechecker, and tests on changed files")
    .argument("<files...>", "Files to verify")
    .option("--formatter <cmd>", "Formatter command")
    .option("--linter <cmd>", "Linter command")
    .option("--typecheck <cmd>", "Type checker command (e.g. 'tsc --noEmit')")
    .option("--test-filter <pattern>", "Test filter pattern")
    .option("--test-runner <runner>", "Test runner (bun test, vitest, jest, pytest, go test, cargo test)")
    .option("--formatter-args <args...>", "Formatter args")
    .option("--linter-args <args...>", "Linter args")
    .option("--test-args <args...>", "Test runner args")
    .option("--auto-detect", "Auto-detect tools from project config files")
    .option("--allow-arbitrary-tool", "Allow binaries outside the allowlist (warns on each use)")
    .option("--revert-on-failure", "Restore original file contents if any check fails")
    .option("--timeout <ms>", "Per-check timeout in ms (default 30000)", parseInt)
    .option("--no-scope-tests", "Run the whole test suite instead of only tests related to the changed files")
    .option("--use-baseline", "Ignore tests that were already failing at this commit (see --record-baseline)")
    .option("--record-baseline", "Record which tests currently fail, for later --use-baseline runs. Run this before editing.")

    .action(async (files: string[], opts) => {
      if (opts.recordBaseline) {
        const recorded = await recordVerifyBaseline(files, {
          testRunner: opts.testRunner,
          testArgs: opts.testArgs,
          autoDetect: opts.autoDetect,
          allowArbitraryTool: opts.allowArbitraryTool ?? false,
          scopeTests: opts.scopeTests,
          timeout: opts.timeout,
        });
        finish(recorded);
        return;
      }
      const result = await verifyChanges(files, {
        formatter: opts.formatter,
        linter: opts.linter,
        typecheck: opts.typecheck,
        testFilter: opts.testFilter,
        testRunner: opts.testRunner,
        formatterArgs: opts.formatterArgs,
        linterArgs: opts.linterArgs,
        testArgs: opts.testArgs,
        autoDetect: opts.autoDetect,
        allowArbitraryTool: opts.allowArbitraryTool ?? false,
        revertOnFailure: opts.revertOnFailure,
        timeout: opts.timeout,
        scopeTests: opts.scopeTests,
        useBaseline: opts.useBaseline,
      });
      finish(result);
    });
}
