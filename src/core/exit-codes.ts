import { ErrorCode, recordEvent, getRecordedEventCount } from "./telemetry";
import { wrap, currentCommandName } from "./envelope";
import { resolveFormat, renderText, OutputFormat } from "./format";
import { isQuiet } from "./output";

/**
 * Process exit codes. Agents branch on these, so the numbers are a contract —
 * see docs/ADAPTER-CONTRACT.md. Never renumber an existing code.
 */
export enum ExitCode {
  /** Operation succeeded. */
  OK = 0,
  /** Bad invocation: missing/malformed flag, denied path, unsupported operation. Retrying verbatim will not help. */
  USAGE = 1,
  /** The edit itself failed (symbol not found, parse error, ambiguous match). */
  EDIT_FAILED = 2,
  /** A precondition no longer holds (stale anchor, hash mismatch). Agent-retryable after a fresh read. */
  PRECONDITION = 3,
  /** The edit applied but verification (format/lint/test) failed. */
  VERIFY_FAILED = 4,
  /** Filesystem-level failure: file missing, unreadable, or unwritable. */
  IO = 5,
  /** Uncaught internal error — a bug in HashPilot. */
  INTERNAL = 70,
}

const ERROR_CODE_EXITS: Record<string, ExitCode> = {
  [ErrorCode.STALE_ANCHOR]: ExitCode.PRECONDITION,
  [ErrorCode.LOCK_TIMEOUT]: ExitCode.PRECONDITION,
  [ErrorCode.HASH_MISMATCH]: ExitCode.PRECONDITION,
  [ErrorCode.FILE_NOT_FOUND]: ExitCode.IO,
  [ErrorCode.WRITE_FAILED]: ExitCode.IO,
  [ErrorCode.READ_FAILED]: ExitCode.IO,
  [ErrorCode.PATH_DENIED]: ExitCode.USAGE,
  [ErrorCode.INVALID_ARGUMENT]: ExitCode.USAGE,
  [ErrorCode.UNSUPPORTED_OPERATION]: ExitCode.USAGE,
  [ErrorCode.SYMBOL_NOT_FOUND]: ExitCode.EDIT_FAILED,
  [ErrorCode.PARSE_ERROR]: ExitCode.EDIT_FAILED,
  [ErrorCode.DUPLICATE_MATCH]: ExitCode.EDIT_FAILED,
    // "Same name binds more than one symbol in this file" is a failed edit
    // attempt (a precondition the caller didn't meet), not a stale/retryable
    // anchor — so it shares the EDIT_FAILED band with SYMBOL_NOT_FOUND.
    [ErrorCode.AMBIGUOUS_SYMBOL]: ExitCode.EDIT_FAILED,
  [ErrorCode.UNSUPPORTED_LANGUAGE]: ExitCode.EDIT_FAILED,
  // The file is fine and the operation exists; this particular import cannot
  // be written into this particular module system. Same band as
  // UNSUPPORTED_LANGUAGE: the edit failed on a precondition the caller can
  // fix, and retrying the same call verbatim will not help (#139).
  [ErrorCode.MODULE_SYSTEM_MISMATCH]: ExitCode.EDIT_FAILED,
  // The search did not complete, so the edit did not happen for a reason the
  // caller can act on (raise the cap, target a shallower node) — an edit
  // failure, not a retryable precondition (#39).
  [ErrorCode.SEARCH_TRUNCATED]: ExitCode.EDIT_FAILED,
  [ErrorCode.VERIFY_FAILED]: ExitCode.VERIFY_FAILED,
  // A timeout shares the verification band — the edit applied, verification did
  // not conclude — but carries its own error code so an agent can tell "your
  // change broke the tests" from "the suite ran out of time".
  [ErrorCode.VERIFY_TIMEOUT]: ExitCode.VERIFY_FAILED,
  // Same band again: the edit applied, verification produced no verdict. A
  // separate code so an agent can tell "nothing was checked" from "the checks
  // failed" and re-run with the flags it forgot (#106).
  [ErrorCode.VERIFY_NO_CHECKS]: ExitCode.VERIFY_FAILED,
  // Deliberately IO, not VERIFY_FAILED: a half-reverted tree is a filesystem
  // problem the agent must stop and inspect, not a retryable test failure.
  [ErrorCode.ROLLBACK_INCOMPLETE]: ExitCode.IO,
  [ErrorCode.INTERNAL_ERROR]: ExitCode.INTERNAL,
};

/** Shape every command result is inspected through. All fields optional — results vary by command. */
export interface ResultLike {
  success?: boolean;
  passed?: boolean;
  error?: string | { code?: string };
  errorCode?: string;
  stale?: boolean;
  [key: string]: unknown;
}

/**
 * Derive an exit code from a command result. Falls back to EDIT_FAILED for an
 * unrecognized failure rather than OK — an unmapped error must never exit 0.
 */
export function exitCodeFor(result: ResultLike | ResultLike[] | undefined): ExitCode {
  if (result === undefined) return ExitCode.OK;

  if (Array.isArray(result)) {
    // Batch: worst (highest) code wins, so a single failure is never masked.
    return result.reduce<ExitCode>((worst, r) => {
      const code = exitCodeFor(r);
      return code > worst ? code : worst;
    }, ExitCode.OK);
  }

  // Wrapper results (route-edit, batch, plan steps) carry the real outcome in
  // `result`. Ignoring it made a failed edit exit 0.
  if (result.success === undefined && result.passed === undefined && result.error === undefined
      && result.result && typeof result.result === "object") {
    return exitCodeFor(result.result as ResultLike);
  }

  const explicit = result.errorCode ?? (typeof result.error === "object" ? result.error?.code : undefined);
  if (explicit && ERROR_CODE_EXITS[explicit]) return ERROR_CODE_EXITS[explicit];

  const failed =
    result.success === false ||
    result.passed === false ||
    (result.error !== undefined && result.error !== null);
  if (!failed) return ExitCode.OK;

  if (result.stale === true) return ExitCode.PRECONDITION;
  return ExitCode.EDIT_FAILED;
}

/* ── Output format (#19 B16) ───────────────────────────────────────────── */
let outputFormat: OutputFormat = "json";
let currentCommand = "";

/** Called once by preAction; sets the global output format + running command name. */
export function setOutputFormat(fmt: OutputFormat, command: string): void {
  outputFormat = fmt;
  currentCommand = command;
}

/** Current output format — used by action handlers to branch on text vs. JSON. */
export function getOutputFormat(): OutputFormat {
  return outputFormat;
}

/** Re-export for cli.ts convenience. */
export { resolveFormat, renderText };

/**
 * Single exit point for every CLI command.
 *
 * #19 (B16): when `outputFormat === "text"` the success payload is rendered as
 * compact human-readable output via per-command renderers. Error payloads are
 * ALWAYS JSON — the API contract (apiVersion 1) is the canonical machine output
 * and must not be degraded. Commands without a renderer fall back to a compact
 * key/value dump; never raw JSON in text mode.
 */
// `telemetry *` reads, clears, and prunes the log; recording an event there
// would grow the very file the command is inspecting and skew its own report.
// `uninstall` removes the log directory outright.
const TELEMETRY_EXEMPT_COMMANDS = ["uninstall"];

const processStart = Date.now();

/**
 * CLAUDE.md says every command records a telemetry event, but a dozen commands
 * (`capabilities`, `route`, `config`, `undo`, `provenance query`, …) recorded
 * nothing, leaving silent holes in the health report's operation coverage.
 * Rather than thread a recordEvent call through every action and its several
 * finish() call sites, emit a fallback here — the one choke point every command
 * already funnels through — but only when the action recorded nothing itself,
 * so commands with richer events are not double-counted (#51).
 */
function recordFallbackEvent(exit: ExitCode): void {
  const command = currentCommandName();
  if (!command) return;
  if (getRecordedEventCount() > 0) return;
  if (command.startsWith("telemetry") || TELEMETRY_EXEMPT_COMMANDS.includes(command)) return;
  recordEvent({
    operation: command,
    route: "other",
    success: exit === ExitCode.OK,
    elapsed_ms: Date.now() - processStart,
  });
}

export function finish(payload: unknown, code?: ExitCode): void {
  const exit = code ?? exitCodeFor(payload as ResultLike);
  recordFallbackEvent(exit);
    // In text mode: success payloads get the compact renderer; errors always emit JSON.
  if (outputFormat === "text" && (payload as { success?: boolean }).success !== false) {
      // `--quiet` drops the human-readable success line. It deliberately does not
      // drop the JSON envelope below: that is the apiVersion 1 contract, and a
      // caller who asked for JSON and got silence cannot tell ok from a crash (#47).
    if (isQuiet()) {
      process.exitCode = exit;
      return;
    }
      // `wrap()` produces { apiVersion, ok, command, data, ... }; `data` carries
      // the per-command payload. Render `data` when present, else the raw payload.
    const data = (payload as { data?: Record<string, unknown> }).data;
     const rendererTarget = data || (payload as Record<string, unknown>);
    renderText(currentCommand, rendererTarget as Record<string, unknown>);
    process.exitCode = exit;
    return;
    }
    // JSON path: emit the envelope (apiVersion 1)
  console.log(JSON.stringify(wrap(payload, exit), null, 2));
  process.exitCode = exit;
}

/** Emit a usage error and exit 1. For malformed flags and missing required options. */
export function usageError(message: string, extra: Record<string, unknown> = {}): void {
  finish({ success: false, errorCode: ErrorCode.INVALID_ARGUMENT, message, ...extra }, ExitCode.USAGE);
}
