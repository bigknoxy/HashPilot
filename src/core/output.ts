/**
 * Output control: verbosity and color (#47).
 *
 * Three global flags plus one environment variable decide how much the CLI
 * prints and whether it prints in color:
 *
 *   --quiet / -q     suppress non-essential output; errors still print
 *   --verbose / -v   diagnostic detail on **stderr** (never stdout)
 *   --no-color       disable ANSI color; `NO_COLOR` (any non-empty value) does
 *                    the same, as does a non-TTY stdout
 *
 * Two rules are load-bearing rather than cosmetic:
 *
 * 1. **JSON output is never colorized.** ANSI escapes in a piped envelope
 *    corrupt machine parsing, which makes this a correctness concern, not a
 *    styling one. Color is gated on `format === "text"` here so no renderer has
 *    to remember it.
 * 2. **Verbose output goes to stderr.** Diagnostics on stdout would land inside
 *    the JSON an agent is parsing.
 *
 * `--quiet` deliberately does **not** suppress the JSON envelope: that envelope
 * is the apiVersion 1 contract, and a caller that asked for JSON and got silence
 * cannot tell success from a crash. It suppresses text-mode success rendering
 * and verbose diagnostics.
 */
import chalk, { type ChalkInstance } from "chalk";
import type { OutputFormat } from "./format";

export type Verbosity = "quiet" | "normal" | "verbose";

let verbosity: Verbosity = "normal";
let colorOn = false;

export interface OutputOptions {
  quiet?: boolean;
  verbose?: boolean;
  /** Commander sets this to `false` when `--no-color` is passed. */
  color?: boolean;
  format?: OutputFormat;
  isTTY?: boolean;
  env?: Record<string, string | undefined>;
}

/**
 * Decide whether ANSI color may be emitted.
 *
 * Every one of these is a veto; none of them is an override. `--color` is not a
 * flag, so there is deliberately no way to force color into a pipe.
 */
export function resolveColor(opts: OutputOptions = {}): boolean {
  const env = opts.env ?? process.env;
  if (opts.color === false) return false;
  // NO_COLOR: any non-empty value disables color (no-color.org).
  if ((env.NO_COLOR ?? "") !== "") return false;
  if (env.TERM === "dumb") return false;
  // Rule 1: the machine-readable envelope stays byte-clean.
  if ((opts.format ?? "json") !== "text") return false;
  const isTTY = opts.isTTY ?? process.stdout.isTTY;
  return Boolean(isTTY);
}

/** Resolve verbosity. `--quiet` wins over `--verbose` — the quieter ask is the safer one. */
export function resolveVerbosity(opts: OutputOptions = {}): Verbosity {
  if (opts.quiet) return "quiet";
  if (opts.verbose) return "verbose";
  return "normal";
}

/** Called once by the CLI's preAction hook. */
export function configureOutput(opts: OutputOptions = {}): void {
  verbosity = resolveVerbosity(opts);
  colorOn = resolveColor(opts);
}

/** Reset to defaults. Tests use this; the CLI configures once per process. */
export function resetOutput(): void {
  verbosity = "normal";
  colorOn = false;
}

export function getVerbosity(): Verbosity {
  return verbosity;
}
export function isQuiet(): boolean {
  return verbosity === "quiet";
}
export function isVerbose(): boolean {
  return verbosity === "verbose";
}
export function colorEnabled(): boolean {
  return colorOn;
}

/**
 * Emit a diagnostic line on stderr, only under `--verbose`.
 *
 * Callers pass a thunk when the message costs something to build, so the
 * formatting work does not happen on the default path.
 */
export function verboseLog(message: string | (() => string)): void {
  if (verbosity !== "verbose") return;
  const text = typeof message === "function" ? message() : message;
  process.stderr.write(paint(chalk.dim, "[verbose] " + text) + "\n");
}

/** Apply a chalk style, or return the string untouched when color is off. */
export function paint(style: ChalkInstance, text: string): string {
  return colorOn ? style(text) : text;
}

/**
 * Colorize the status glyphs a renderer emits. Applied at the single write
 * choke point in `format.ts` so no individual renderer has to know about color,
 * and so nothing can leak an escape into a non-text path.
 */
export function colorizeGlyphs(text: string): string {
  if (!colorOn) return text;
  return text
    .replace(/✓/g, chalk.green("✓"))
    .replace(/✗/g, chalk.red("✗"))
    .replace(/⚠/g, chalk.yellow("⚠"));
}
