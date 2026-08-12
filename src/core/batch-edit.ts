import { routeEdit, RouterResult } from "./router";
import { recordEvent, ErrorCode } from "./telemetry";
import type { RoutePolicy, EditRoute } from "./config";
import { acquireSortedLocks, LOCK_TIMEOUT_MS, LockAcquireError } from "./locking";

export interface BatchParams {
  files: string[];
  operation: string;
  method?: EditRoute;
  policy?: RoutePolicy;
  // Hash params
  oldHash?: string;
  newContent?: string;
  range?: { start: number; end: number };
  // AST params
  oldName?: string;
  newName?: string;
  symbolName?: string;
  newBody?: string;
  importSpec?: string;
  content?: string;
  // Diff params
  oldContent?: string;
  dryRun?: boolean;
  // Provenance params
  actor?: string;
  taskId?: string;
  reason?: string;
}

export interface BatchSummary {
  total: number;
  succeeded: number;
  failed: number;
  conflicts: number;   // CAS/STALE_ANCHOR failures (distinct from other errors)
  elapsed_ms: number;
}

export interface BatchResult {
  results: RouterResult[];
  summary: BatchSummary;
}

async function editOne(
  file: string,
  params: BatchParams
): Promise<RouterResult> {
  return routeEdit({
    filePath: file,
    operation: params.operation,
    method: params.method,
    policy: params.policy,
    oldHash: params.oldHash,
    newContent: params.newContent,
    range: params.range,
    oldName: params.oldName,
    newName: params.newName,
    symbolName: params.symbolName,
    newBody: params.newBody,
    importSpec: params.importSpec,
    content: params.content,
    oldContent: params.oldContent,
    dryRun: params.dryRun,
    actor: params.actor,
    taskId: params.taskId,
    reason: params.reason,
  });
}
export type BatchEditOptions = { timeoutMs?: number };

export async function editMany(params: BatchParams, opts?: BatchEditOptions): Promise<BatchResult> {
  const start = Date.now();
  const uniqueFiles = [...new Set(params.files)];

  // Acquire advisory locks in sorted path order (deterministic lock ordering)
  // to prevent deadlock when two plans touch overlapping file sets ({A,B} vs {B,A}).
  let releaseLocks: (() => void) | undefined;

  try {
    releaseLocks = await acquireSortedLocks(uniqueFiles, {
      timeoutMs: opts?.timeoutMs ?? LOCK_TIMEOUT_MS,
    });
  } catch (err: any) {
    // Lock acquisition failed — report per-file LOCK_TIMEOUT instead of aborting.
    const lockFailed: RouterResult[] = uniqueFiles.map((f) => ({
      route: null as any,
      routeReason: "lock timeout",
      result: {
        success: false,
        errorCode: ErrorCode.LOCK_TIMEOUT,
        message: `Cannot acquire lock for ${f}: ${err.message}`,
        recovery: "Retry; the file may be locked by another HashPilot process.",
      },
      elapsed_ms: Date.now() - start,
    }));

    recordEvent({
      operation: `batch-${params.operation}`,
      route: "batch",
      files_count: uniqueFiles.length,
      success: false,
      elapsed_ms: Date.now() - start,
    });

    return {
      results: lockFailed,
      summary: { total: uniqueFiles.length, succeeded: 0, failed: uniqueFiles.length, conflicts: 0, elapsed_ms: Date.now() - start },
    };
  }

  try {
    const results = await Promise.all(
      uniqueFiles.map((f) => editOne(f, params))
    );

    // Distinguish CAS/STALE_ANCHOR conflicts from other per-file failures.
    const succeeded = results.filter((r) => r.result.success).length;
    const conflicts = results.filter(
      (r) => !r.result.success && (
        r.result.errorCode === ErrorCode.STALE_ANCHOR ||
        r.result.stale === true
      ),
    ).length;
    const failed = results.length - succeeded - conflicts;

    recordEvent({
      operation: `batch-${params.operation}`,
      route: "batch",
      files_count: uniqueFiles.length,
      success: failed === 0 && conflicts === 0,
      elapsed_ms: Date.now() - start,
    });

    return {
      results,
      summary: { total: uniqueFiles.length, succeeded, failed, conflicts, elapsed_ms: Date.now() - start },
    };
  } finally {
    releaseLocks();
  }
}
export async function editManySerial(params: BatchParams): Promise<BatchResult> {
  const start = Date.now();

  const results: RouterResult[] = [];
  for (const f of params.files) {
    results.push(await editOne(f, params));
  }

  const elapsed = Date.now() - start;
  const succeeded = results.filter((r) => r.result.success).length;
  const conflicts = results.filter(
    (r) => !r.result.success && (
      r.result.errorCode === ErrorCode.STALE_ANCHOR ||
      r.result.stale === true
    ),
  ).length;
  const failed = results.length - succeeded - conflicts;

  recordEvent({
    operation: `batch-${params.operation}-serial`,
    route: "batch",
    files_count: params.files.length,
    success: failed === 0 && conflicts === 0,
    elapsed_ms: elapsed,
  });

  return {
    results,
    summary: { total: params.files.length, succeeded, failed, conflicts, elapsed_ms: elapsed },
  };
}
