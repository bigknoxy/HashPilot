import type { Command } from "commander";
import {
  search,
  loadConfig,
  recordEvent,
  finish,
  DEFAULT_SOURCE_GLOBS,
} from "../core/index";
import type { SearchResult } from "../core/index";

/** Restrict `--engine` to the supported values; commander enforces via `.choices`. */
const ENGINE_CHOICES = ["auto", "zg", "grep", "off"] as const;

function collectGlob(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

/** Register the `search` command group. */
export function register(program: Command): void {
  program
    .command("search")
    .description(
      "Search a workspace: zg (zvec-grep) semantic/lexical when available, grep fallback. " +
        "Usage: search \"<query>\" (zg) or search --engine grep \"<pattern>\" [paths...]",
    )
    .argument("<query>", "Query text (plain language for zg; a regex only makes sense on the grep engine)")
    .argument("[paths...]", "Paths to search (grep engine only; zg searches its indexed workspace)")
    .option(
      "--engine <engine>",
      `Search engine: ${ENGINE_CHOICES.join(", ")} (default: config or auto)`,
      "auto",
    )
    .option(
      "--glob <glob>",
      "Source glob filter, repeatable (default: code extensions)",
      collectGlob,
      [] as string[],
    )
    .option("--zg-bin <path>", "Path to the zg binary (default: ZG_BIN env, then PATH)")

    .action(async (query: string, paths: string[], opts) => {
      const start = Date.now();
      const config = loadConfig();
      // Config defaults apply only when the CLI flag is left at its "auto" default.
      const engine = (opts.engine === "auto" && config.search?.engine ? config.search.engine : opts.engine) as
        | (typeof ENGINE_CHOICES)[number]
        | undefined;
      const sourceGlobs = opts.glob.length > 0 ? opts.glob : (config.search?.sourceGlobs ?? DEFAULT_SOURCE_GLOBS);
      const zgBin = opts.zgBin ?? config.search?.zgBin;

      const res: SearchResult = await search(query, paths ?? [], {
        engine,
        sourceGlobs,
        zgBin,
        root: process.cwd(),
      });

      const hitCount = res.engine === "zg" ? res.hits.length : res.results.length;
      recordEvent({
        operation: "search",
        engine: res.engine,
        hits: hitCount,
        degraded: "degraded" in res ? Boolean(res.degraded) : false,
        noIndex: res.engine === "zg" && Boolean(res.noIndex),
        success: !("error" in res && res.error),
        elapsed_ms: Date.now() - start,
      });
      finish(res);
    });
}
