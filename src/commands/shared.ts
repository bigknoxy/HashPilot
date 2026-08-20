import type { Command } from "commander";

/**
 * Parse `--range`. Accepts `N` (meaning `N:N`) or `N:M`, both 1-indexed and
 * inclusive. Returns an error string rather than throwing so the caller can
 * emit it through `usageError`.
 *
 * The old implementation was `opts.range.split(":").map(Number)`, which turned
 * `--range 5` into `{start: 5, end: NaN}` and silently duplicated the file.
 */
export function parseRange(raw: string): { range: { start: number; end: number } } | { error: string } {
  const match = /^(\d+)(?::(\d+))?$/.exec(raw.trim());
  if (!match) {
    return { error: `Invalid --range "${raw}": expected N or N:M with positive integers.` };
  }
  const start = Number(match[1]);
  const end = match[2] === undefined ? start : Number(match[2]);
  if (start < 1) return { error: `Invalid --range "${raw}": line numbers are 1-indexed.` };
  if (start > end) return { error: `Invalid --range "${raw}": start is after end.` };
  return { range: { start, end } };
}

/** Parse a numeric flag, rejecting the NaN that bare `parseInt` yields on garbage. */
export function parseIntFlag(raw: string | undefined, name: string, fallback: number): number | { error: string } {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(String(raw).trim())) {
    return { error: `Invalid ${name} "${raw}": expected a non-negative integer.` };
  }
  return Number(raw);
}

/**
 * The provenance flag trio, previously copy-pasted onto nine commands (#48).
 * Appended last so `--help` output keeps the order it always had.
 */
export function withProvenance(cmd: Command): Command {
  return cmd
    .option("--actor <name>", "Agent identity for provenance tracking")
    .option("--task-id <id>", "Task/issue reference for provenance")
    .option("--reason <text>", "Human-readable reason for the edit");
}

/** The routed-edit flag block shared by `route-edit` and `batch` (#48). */
export function withEditFlags(cmd: Command): Command {
  return cmd
    .option("--method <route>", "Force a specific route (ast, hash, diff)")
    .option("--old-hash <hash>", "Hash for hash-route verification")
    .option("--new-content <text>", "New content (or @file)")
    .option("--old-content <text>", "Old content for diff-route search-and-replace")
    .option("--range <start:end>", "Line range for hash route")
    .option("--old-name <name>", "Old symbol name (rename-symbol)")
    .option("--new-name <name>", "New symbol name (rename-symbol)")
    .option("--symbol <name>", "Symbol name (replace-body, insert-before, insert-after)")
    .option("--new-body <text>", "New body statements only — no braces, no indentation (replace-body, or @file)")
    .option("--import-spec <spec>", 'Import spec, module path quoted: \'{ Foo } from "./bar"\'')
    .option("--content <text>", "Content (insert-before, insert-after, or @file)")
    .option("--policy <json>", "Inline RoutePolicy JSON");
}

/** `--dry-run` + `--include-source`, shared by every previewing edit command. */
export function withPreview(cmd: Command, dryRunDescription = "Preview without writing"): Command {
  return cmd
    .option("--dry-run", dryRunDescription)
    .option("--include-source", "On a dry run, return the whole post-edit file instead of a diff");
}
