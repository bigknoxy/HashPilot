import type { Command } from "commander";
import {
  routeEdit,
  editMany,
  editManySerial,
  resolveContent,
  finish,
} from "../core/index";
import { withEditFlags, withProvenance } from "./shared";

/** Register the `edit` command group. */
export function register(program: Command): void {
  withProvenance(
    withEditFlags(
      program
        .command("route-edit")
        .description("Auto-routed structured edit through AST → Hash → Diff pipeline")
        .argument("<file>", "File path")
        .argument("<operation>", "Operation (rename-symbol, replace-body, add-import, remove-import, insert-before, insert-after, replace-hash, replace-content)")
    )
      .option("--dry-run", "Preview without writing")
      .option("--include-source", "On a dry run, return the whole post-edit file instead of a diff")
  )

    .action(async (file: string, operation: string, opts) => {
      const result = await routeEdit({
        filePath: file,
        operation,
        method: opts.method,
        oldHash: opts.oldHash,
        newContent: await resolveContent(opts.newContent),
        oldContent: opts.oldContent,
        range: opts.range ? (([s, e]: number[]) => ({ start: s, end: e }))(opts.range.split(":").map(Number)) : undefined,
        oldName: opts.oldName,
        newName: opts.newName,
        symbolName: opts.symbol,
        newBody: await resolveContent(opts.newBody),
        importSpec: opts.importSpec,
        content: await resolveContent(opts.content),
        policy: opts.policy ? JSON.parse(opts.policy) : undefined,
        dryRun: opts.dryRun,
        includeSource: opts.includeSource,
        actor: opts.actor,
        taskId: opts.taskId,
        reason: opts.reason,
      });

      finish(result);
    });

  withProvenance(
    withEditFlags(
      program
        .command("batch")
        .description("Apply the same edit to multiple files in parallel")
        .argument("<operation>", "Operation (rename-symbol, replace-body, add-import, remove-import, insert-before, insert-after, replace-hash, replace-content)")
        .argument("<files...>", "Files to edit")
    )
      .option("--serial", "Execute sequentially instead of parallel")
      .option("--dry-run", "Preview without writing")
      .option("--include-source", "On a dry run, return the whole post-edit file instead of a diff")
  )

    .action(async (operation: string, files: string[], opts) => {
      const batchParams = {
        files,
        operation,
        method: opts.method,
        oldHash: opts.oldHash,
        newContent: await resolveContent(opts.newContent),
        oldContent: opts.oldContent,
        range: opts.range ? (([s, e]: number[]) => ({ start: s, end: e }))(opts.range.split(":").map(Number)) : undefined,
        oldName: opts.oldName,
        newName: opts.newName,
        symbolName: opts.symbol,
        newBody: await resolveContent(opts.newBody),
        importSpec: opts.importSpec,
        content: await resolveContent(opts.content),
        policy: opts.policy ? JSON.parse(opts.policy) : undefined,
        dryRun: opts.dryRun,
        includeSource: opts.includeSource,
        actor: opts.actor,
        taskId: opts.taskId,
        reason: opts.reason,
      };

      const result = opts.serial
        ? await editManySerial(batchParams)
        : await editMany(batchParams);

      finish(result);
    });
}
