import type { Command } from "commander";
import {
  replaceHash,
  detectLanguage,
  recordEvent,
  buildProvenanceFields,
  finish,
  usageError,
} from "../core/index";
import { parseRange, withProvenance } from "./shared";

/** Register the `hash` command group. */
export function register(program: Command): void {
  withProvenance(
    program
      .command("replace-hash")
      .description("Replace content identified by hash anchor")
      .argument("<file>", "File path")
      .argument("<old-hash>", "Hash of content to replace")
      .argument("<new-content>", "New content (or @file to read from file)")
      .option("--range <start:end>", "Line range (1-indexed). N or N:M")
      .option("--no-recover", "Fail immediately on a stale anchor instead of attempting relocation")
      .option("--dry-run", "Preview without writing")
  )

    .action(async (file: string, oldHash: string, newContent: string, opts) => {
      const start = Date.now();
      let content = newContent;
      if (newContent.startsWith("@")) {
        content = await Bun.file(newContent.slice(1)).text();
      }
      let range: { start: number; end: number } | undefined;
      if (opts.range) {
        const parsed = parseRange(opts.range);
        if ("error" in parsed) return usageError(parsed.error, { path: file });
        range = parsed.range;
      }
      const result = await replaceHash(file, oldHash, content, {
        range,
        dryRun: opts.dryRun,
        // Commander maps --no-recover to opts.recover === false.
        recovery: opts.recover === false ? "off" : "relocate",
        skipParseCheck: Boolean(program.opts().allowParseErrors),
      });
      const provFields = buildProvenanceFields({
        actor: opts.actor,
        taskId: opts.taskId,
        reason: opts.reason,
        filePath: file,
      });
      recordEvent({
        operation: "replace-hash",
        route: "hash",
        file,
        language: detectLanguage(file) || undefined,
        success: result.success,
        fallback_reason: result.stale ? "stale-anchor" : undefined,
        retries: result.retries ?? 0,
        elapsed_ms: Date.now() - start,
        ...provFields,
      });
      finish(result);
    });
}
