import type { Command } from "commander";
import {
  ErrorCode,
  setCurrentChangeSet,
  listChangeSets,
  lastChangeSetId,
  undoChangeSet,
  provenanceQuery,
  changeSetQuery,
  formatProvenanceHuman,
  finish,
  usageError,
  ExitCode,
  exitCodeFor,
} from "../core/index";
import { parseIntFlag } from "./shared";

/** Register the `provenance` command group. */
export function register(program: Command): void {
  const provCmd = program
    .command("provenance")
    .description("Query edit provenance — who changed what, when, and why");

  provCmd
    .command("query")
    .description("Show edit history for a file (like git blame for agent edits)")
    .argument("<file>", "File path")
    .argument("[line]", "Optional line number to filter by")
    .option("--human", "Human-readable output")

    .option("--fuzzy", "Include edits without diff data in line-filtered queries")
    .option("--limit <n>", "Max entries to show")
    .action((file, line, opts) => {
      const lineNum = line ? parseInt(line) : undefined;
      let results = provenanceQuery(file, lineNum, !!opts.fuzzy);
      if (opts.limit) results = results.slice(0, parseInt(opts.limit));
      if (opts.human) {
        console.log(formatProvenanceHuman(results));
        return;
      }
      // A file with no recorded edits is an empty history, not a failure.
      finish(results, ExitCode.OK);
    });

  provCmd
    .command("changeset")
    .description("Show all edits in a changeSet")
    .argument("<changeSetId>", "ChangeSet UUID")
    .option("--human", "Human-readable output")
    .action((changeSetId, opts) => {
      const result = changeSetQuery(changeSetId);
      if (!result) {
        return finish(
          {
            success: false,
            errorCode: ErrorCode.FILE_NOT_FOUND,
            changeSetId,
            message: `No edits found for changeSet: ${changeSetId}`,
            recovery: "hashpilot telemetry sessions",
          },
          ExitCode.USAGE,
        );
      }
      if (opts.human) {
        console.log(`ChangeSet: ${result.changeSetId}`);
        console.log(`Actor: ${result.actor}`);
        console.log(`Task: ${result.taskId ?? "N/A"}`);
        console.log(`Reason: ${result.reason}`);
        console.log(`Edits: ${result.editCount}`);
        console.log(`Time: ${result.timeRange.first} -- ${result.timeRange.last}\n`);
        console.log(formatProvenanceHuman(result.entries));
        process.exitCode = exitCodeFor(result);
      } else {
        finish(result);
      }
    });

  program
    .command("changesets")
    .description("List undoable changeSets, newest first")
    .option("--limit <n>", "Max changeSets to list (default 20)")
    .action((opts) => {
      const limit = parseIntFlag(opts.limit, "--limit", 20);
      if (typeof limit === "object") return usageError(limit.error);
      finish({ changeSets: listChangeSets(limit) }, ExitCode.OK);
    });

  program
    .command("undo")
    .description("Restore every file in a changeSet to its pre-edit contents")
    .argument("[changeSetId]", "ChangeSet to undo; omit with --last")
    .option("--last", "Undo the most recent changeSet")
    .option("--force", "Restore even files modified since the edit was applied")
    .option("--dry-run", "Report what would be restored without touching the disk")
    .action((changeSetId, opts) => {
      const id = opts.last ? lastChangeSetId() : changeSetId;
      if (!id) {
        return usageError(
          opts.last
            ? "No changeSets have been recorded yet."
            : "Provide a changeSet ID, or pass --last.",
          { recovery: "hashpilot changesets" },
        );
      }
      // The undo's own write must not be snapshotted as a new changeSet — that
      // would make `undo --last` toggle between two states forever.
      setCurrentChangeSet(null);
      const result = undoChangeSet(id, { force: Boolean(opts.force), dryRun: Boolean(opts.dryRun) });
      finish(result, result.success ? ExitCode.OK : ExitCode.PRECONDITION);
    });
}
