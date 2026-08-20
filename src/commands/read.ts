import type { Command } from "commander";
import {
  readMany,
  readHash,
  grepMany,
  symbolLookupMany,
  recordEvent,
  safeWrite,
  finish,
  usageError,
} from "../core/index";
import { parseIntFlag } from "./shared";

/** Register the `read` command group. */
export function register(program: Command): void {
  program
    .command("read-many")
    .description("Read multiple files, return content + hashes")
    .argument("<files...>", "File paths")

    .action(async (files: string[], opts) => {
      const start = Date.now();
      const results = await readMany(files);
      recordEvent({
        operation: "read-many",
        route: "read",
        files_count: files.length,
        success: !results.some((r) => r.error),
        elapsed_ms: Date.now() - start,
      });
      finish(results);
    });

  program
    .command("read-hash")
    .description("Read a line with hash and context")
    .argument("<file>", "File path")
    .argument("<line>", "Line number", parseInt)
    .option("-c, --context <n>", "Context lines", "3")

    .action(async (file: string, line: number, opts) => {
      const start = Date.now();
      const context = parseIntFlag(opts.context, "--context", 3);
      if (typeof context === "object") return usageError(context.error, { path: file });
      const result = await readHash(file, line, context);
      recordEvent({
        operation: "read-hash",
        route: "hash",
        file,
        success: !result.error,
        lines_read: 1 + (result.contextBefore?.length || 0) + (result.contextAfter?.length || 0),
        elapsed_ms: Date.now() - start,
      });
      finish(result);
    });

  program
    .command("grep-many")
    .description(
      'Search pattern across multiple paths. Usage: grep-many "safeWrite" src/ ' +
        '(or the flag form: grep-many --pattern "safeWrite" --path src/)',
    )
    .argument("[pattern]", "Regex pattern (or use --pattern)")
    .argument("[paths...]", "Paths to search (or use --path)")
    .option("-i, --ignore-case", "Case insensitive")
    .option("--pattern <p>", "Regex pattern, flag form of the positional")
    .option(
      "--path <dir>",
      "Path to search, flag form of the positional (repeatable)",
      (value: string, previous: string[]) => previous.concat([value]),
      [] as string[],
    )
    .option("--file-pattern <glob>", "File pattern filter")
    .option("--max-results <n>", "Max results", parseInt)

    .action(async (patternArg: string | undefined, pathsArg: string[], opts) => {
      if (patternArg !== undefined && opts.pattern !== undefined) {
        return usageError('Pass the pattern positionally or as --pattern, not both.');
      }
      if (pathsArg.length > 0 && opts.path.length > 0) {
        return usageError("Pass the paths positionally or as --path, not both.");
      }
      const pattern = patternArg ?? opts.pattern;
      const paths = pathsArg.length > 0 ? pathsArg : opts.path;
      if (!pattern) {
        return usageError('A pattern is required: grep-many "<pattern>" <paths...> (or --pattern/--path).');
      }
      if (paths.length === 0) {
        return usageError('At least one path is required: grep-many "<pattern>" <paths...> (or --pattern/--path).');
      }
      const result = await grepMany(pattern, paths, {
        ignoreCase: opts.ignoreCase,
        filePattern: opts.filePattern,
        maxResults: opts.maxResults,
      });
      recordEvent({
        operation: "grep-many",
        route: "grep",
        files_count: paths.length,
        success: !result.error,
        elapsed_ms: result.elapsed_ms,
      });
      finish(result);
    });

  program
    .command("symbol-lookup-many")
    .description("Find symbol definitions. Usage: symbol-lookup-many <paths...> --names n1,n2")
    .argument("<paths...>", "Paths to search")
    .option("--names <names>", "Comma-separated symbol names")

    .action(async (paths: string[], opts) => {
      const names = (opts.names || "").split(",").filter(Boolean);
      const results = await symbolLookupMany(names, paths);
      finish(results);
    });
}
