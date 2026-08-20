import type { Command } from "commander";
import {
  detectLanguage,
  recordEvent,
  generateUnifiedDiff,
  applyPatch,
  buildProvenanceFields,
  finish,
  usageError,
  ExitCode,
} from "../core/index";
import { join } from "path";
import { parseIntFlag, withProvenance } from "./shared";

/** Register the `diff` command group. */
export function register(program: Command): void {
  const diffCmd = program
    .command("diff")
    .description("Unified diff generation and patch application");

  diffCmd
    .command("generate")
    .description("Generate a unified diff between old and new content")
    .argument("<file>", "File path (for diff header)")
    .argument("<old-content>", "Old content (or @file)")
    .argument("<new-content>", "New content (or @file)")
    .option("-c, --context <n>", "Context lines", "3")
    .option("--raw", "Print the diff text alone, without the JSON envelope")
    .action(async (file: string, oldContent: string, newContent: string, opts) => {
      const start = Date.now();
      let oldSrc = oldContent;
      let newSrc = newContent;
      if (oldContent.startsWith("@")) oldSrc = await Bun.file(oldContent.slice(1)).text();
      if (newContent.startsWith("@")) newSrc = await Bun.file(newContent.slice(1)).text();
      const diff = generateUnifiedDiff(oldSrc, newSrc, file, parseInt(opts.context));
      recordEvent({
        operation: "diff-generate",
        route: "diff",
        file,
        success: true,
        elapsed_ms: Date.now() - start,
      });
      // The diff itself is the payload; it rides the envelope like every other
      // command so a consumer has one parse path (`--raw` prints it bare).
      if (opts.raw) {
        console.log(diff || "(no changes)");
        return;
      }
      finish({ path: file, changed: diff.length > 0, diff }, ExitCode.OK);
    });

  withProvenance(
    diffCmd
      .command("apply")
      .description("Apply a unified diff patch to a file")
      .argument("<file>", "File to patch")
      .option("--patch <file>", "Patch file to apply (or '-' for stdin)")
      .option("--dry-run", "Preview without writing")
      .option("-f, --fuzzy <n>", "Fuzzy match tolerance in lines; 0 = strict (exact offset and content, refuses otherwise)", "3")
  )

    .action(async (file: string, opts) => {
      const start = Date.now();
      let patchText: string;
      if (opts.patch === "-") {
        // Read from stdin
        const chunks: string[] = [];
        for await (const chunk of Bun.stdin.stream()) {
          chunks.push(Buffer.from(chunk).toString());
        }
        patchText = chunks.join("");
      } else if (opts.patch) {
        patchText = await Bun.file(opts.patch).text();
      } else {
        // Must return: without it, patchText is unassigned and applyPatch throws.
        return usageError("--patch is required", { path: file });
      }
      const fuzzy = parseIntFlag(opts.fuzzy, "--fuzzy", 3);
      if (typeof fuzzy === "object") return usageError(fuzzy.error, { path: file });
      const result = await applyPatch(file, patchText, {
        dryRun: opts.dryRun,
        fuzzyMatch: fuzzy,
      });
      const provFields = buildProvenanceFields({
        actor: opts.actor, taskId: opts.taskId, reason: opts.reason, filePath: file,
      });
      recordEvent({
        operation: "diff-apply",
        route: "diff",
        file,
        language: detectLanguage(file) || undefined,
        success: result.success,
        elapsed_ms: Date.now() - start,
        ...provFields,
      });
      finish(result);
    });
}
