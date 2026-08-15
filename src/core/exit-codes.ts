import { ErrorCode } from "./telemetry";
import { wrap } from "./envelope";

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
  [ErrorCode.UNSUPPORTED_LANGUAGE]: ExitCode.EDIT_FAILED,
  [ErrorCode.VERIFY_FAILED]: ExitCode.VERIFY_FAILED,
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

/**
 * Single exit point for every CLI command: emit the JSON payload, then set the
 * exit code. Uses `process.exitCode` rather than `process.exit()` so pending
 * stdout writes and telemetry flushes are not truncated.
 */
export function finish(payload: unknown, code?: ExitCode): void {
  const exit = code ?? exitCodeFor(payload as ResultLike);
  // Wrapped, not raw: every command emits the same envelope so an adapter has
  // one parse path. See src/core/envelope.ts.
  console.log(JSON.stringify(wrap(payload, exit), null, 2));
  process.exitCode = exit;
}

/** Emit a usage error and exit 1. For malformed flags and missing required options. */
export function usageError(message: string, extra: Record<string, unknown> = {}): void {
  finish({ success: false, errorCode: ErrorCode.INVALID_ARGUMENT, message, ...extra }, ExitCode.USAGE);
}
