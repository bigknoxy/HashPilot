import { ErrorCode } from "./telemetry";
import { ExitCode, exitCodeFor, type ResultLike } from "./exit-codes";

/**
 * The single JSON shape every command writes to stdout.
 *
 * Before this existed, each of the 24 commands returned its own ad-hoc shape —
 * some a bare array, some an object — so an adapter had to special-case the
 * command it had just run, and had no field to detect a contract change with.
 * See docs/ADAPTER-CONTRACT.md and schema/hashpilot-envelope.schema.json.
 */
export interface Envelope<T = unknown> {
  /** Bumped only on a breaking change to the envelope itself. */
  apiVersion: string;
  /** The one boolean an adapter checks. Always agrees with the exit code. */
  ok: boolean;
  /** The subcommand path that produced this, e.g. `telemetry show`. */
  command: string;
  /** The per-command payload — the shape commands used to return at top level. */
  data: T | null;
  error: EnvelopeError | null;
  /** Non-fatal notices (route fallback, anchor relocation, corrupt log lines). */
  warnings: EnvelopeWarning[];
}

export interface EnvelopeError {
  /** A member of `ErrorCode`. Adapters branch on this, never on `message`. */
  code: string;
  message: string;
  /**
   * The literal next command to run, where one exists — not prose. This is what
   * turns a dead end into a retry, so prefer a runnable string over advice.
   */
  recovery?: string;
  details?: Record<string, unknown>;
}

export interface EnvelopeWarning {
  code: string;
  message: string;
  [key: string]: unknown;
}

/** Current envelope version. Bump only when the envelope's own shape breaks. */
export const API_VERSION = "1";

let currentCommand = "";
let warnings: EnvelopeWarning[] = [];

/** Records which subcommand is running, so `wrap` can name it. Set by the CLI's preAction hook. */
export function setCommand(name: string): void {
  currentCommand = name;
  warnings = [];
}

export function currentCommandName(): string {
  return currentCommand;
}

/**
 * Attach a non-fatal notice to the envelope the current command will emit.
 *
 * Route fallbacks and anchor relocations used to be entirely invisible: an AST
 * edit that silently became a diff edit looked identical to one that did not.
 */
export function addWarning(warning: EnvelopeWarning): void {
  warnings.push(warning);
}

export function takeWarnings(): EnvelopeWarning[] {
  const taken = warnings;
  warnings = [];
  return taken;
}

/** Fields a command result may carry that the envelope lifts out of `data`. */
interface ErrorBearing {
  success?: boolean;
  passed?: boolean;
  error?: unknown;
  errorCode?: string;
  message?: string;
  recovery?: string;
}

function firstFailure(payload: unknown): ErrorBearing | undefined {
  if (Array.isArray(payload)) {
    // Batch results: report the first failing element, since the exit code
    // already reflects the worst one.
    for (const item of payload) {
      const found = firstFailure(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!payload || typeof payload !== "object") return undefined;
  const p = payload as ErrorBearing & { result?: unknown };
  // `errorCode` alone counts as a failure. `verify-changes` returns neither
  // `success` nor `error` — only `errorCode` — so its failures used to reach the
  // envelope as `{code: "UNKNOWN", message: "Operation failed."}` beside a
  // perfectly specific `data.errorCode` (#106).
  const failed =
    p.success === false || p.passed === false || (p.error !== undefined && p.error !== null) || !!p.errorCode;
  if (failed) return p;
  // Wrapper shapes (route-edit, batch) nest the real outcome under `result`.
  return p.result ? firstFailure(p.result) : undefined;
}

function messageOf(p: ErrorBearing): string {
  if (typeof p.message === "string" && p.message) return p.message;
  if (typeof p.error === "string" && p.error) return p.error;
  if (p.error && typeof p.error === "object") {
    const nested = (p.error as { message?: string }).message;
    if (nested) return nested;
  }
  return "Operation failed.";
}

function codeOf(p: ErrorBearing): string {
  if (p.errorCode) return p.errorCode;
  if (p.error && typeof p.error === "object") {
    const nested = (p.error as { code?: string }).code;
    if (nested) return nested;
  }
  // An unmapped failure is still a failure. Naming it beats emitting `ok: false`
  // with no code for an adapter to branch on.
  return ErrorCode.UNKNOWN;
}

/**
 * Wrap a command result in the envelope.
 *
 * `ok` is derived from the same exit code the process will use, so the two
 * cannot disagree — an adapter that trusts `ok` and one that trusts `$?` reach
 * the same conclusion.
 */
export function wrap<T>(payload: T, code: ExitCode, command = currentCommand): Envelope<T> {
  const failure = code === ExitCode.OK ? undefined : firstFailure(payload);
  const error: EnvelopeError | null =
    code === ExitCode.OK
      ? null
      : failure
        ? {
            code: codeOf(failure),
            message: messageOf(failure),
            ...(failure.recovery ? { recovery: failure.recovery } : {}),
          }
        : { code: ErrorCode.UNKNOWN, message: "Operation failed." };

  return {
    apiVersion: API_VERSION,
    ok: code === ExitCode.OK,
    command,
    data: payload ?? null,
    error,
    warnings: takeWarnings(),
  };
}

/** Convenience for callers that have a result but not yet an exit code. */
export function wrapResult<T>(payload: T, command?: string): Envelope<T> {
  return wrap(payload, exitCodeFor(payload as ResultLike), command);
}
