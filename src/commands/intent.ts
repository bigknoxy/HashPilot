import type { Command } from "commander";
import {
  executeIntent,
  finish,
  exitCodeFor,
  getOutputFormat,
} from "../core/index";
import { withProvenance } from "./shared";

/** Register the `intent` command group. */
export function register(program: Command): void {
  withProvenance(
    program
      .command("intent")
      .description("Execute an editing intent — one command, full blast radius")
      .argument("<intent>", "Intent as JSON: {\"operation\":\"add-parameter\",\"symbol\":\"fn\",\"param\":{\"name\":\"x\"}}")
      .option("--project-root <dir>", "Project root directory")
      .option("--dry-run", "Preview plan without modifying files")
      .option("--yes", "Apply the plan even though part of the intent could not be resolved")
      .option("--no-verify", "Skip verification after execution")
      .option("--no-revert", "Don't roll back on failure")
      .option("--timeout <ms>", "Timeout per operation in ms", "30000")
  )
    .option("--context <text>", "Agent prompt/context (or @file)")

    .action(async (intent: string, opts) => {
      try {
        let context = opts.context;
        if (context && context.startsWith("@")) {
          context = await Bun.file(context.slice(1)).text();
        }

        const result = await executeIntent(intent, {
          projectRoot: opts.projectRoot || process.cwd(),
          dryRun: opts.dryRun,
          yes: Boolean(opts.yes),
          verify: opts.verify,
          revertOnFailure: opts.revert,
          timeout: parseInt(opts.timeout),
          actor: opts.actor,
          taskId: opts.taskId,
          reason: opts.reason,
          context,
        });

        if (getOutputFormat() === "json") {
          finish(result);
        } else {
          console.log(`Intent: ${result.plan.intent.operation} on '${result.plan.definition.name}'`);
          console.log(`Impact: ${result.plan.impactSummary}`);
          for (const u of result.plan.unresolved) {
            console.log(`Unresolved (${u.file}): ${u.reason}`);
            console.log(`  → ${u.resolution}`);
          }
          console.log(`Success: ${result.success}`);
          if (result.execution.verification) {
            console.log(`Verification: ${result.execution.verification.overall}`);
          }
          // Human output still has to carry the exit contract — an agent may run
          // without --json and branch on the code.
          process.exitCode = exitCodeFor(result);
        }
      } catch (err: any) {
        console.error(`Intent failed: ${err.message}`);
        process.exitCode = 1;
      }
    });
}
