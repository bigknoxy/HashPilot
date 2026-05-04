import { routeEdit, RouterResult } from "./router";
import { recordEvent } from "./telemetry";
import type { RoutePolicy, EditRoute } from "./config";

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
}

export interface BatchSummary {
  total: number;
  succeeded: number;
  failed: number;
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
  });
}

export async function editMany(params: BatchParams): Promise<BatchResult> {
  const start = Date.now();

  const results = await Promise.all(
    params.files.map((f) => editOne(f, params))
  );

  const elapsed = Date.now() - start;
  const succeeded = results.filter((r) => r.result.success).length;
  const failed = results.length - succeeded;

  recordEvent({
    operation: `batch-${params.operation}`,
    route: "batch",
    files_count: params.files.length,
    success: failed === 0,
    elapsed_ms: elapsed,
  });

  return {
    results,
    summary: { total: params.files.length, succeeded, failed, elapsed_ms: elapsed },
  };
}

export async function editManySerial(params: BatchParams): Promise<BatchResult> {
  const start = Date.now();

  const results: RouterResult[] = [];
  for (const f of params.files) {
    results.push(await editOne(f, params));
  }

  const elapsed = Date.now() - start;
  const succeeded = results.filter((r) => r.result.success).length;
  const failed = results.length - succeeded;

  recordEvent({
    operation: `batch-${params.operation}-serial`,
    route: "batch",
    files_count: params.files.length,
    success: failed === 0,
    elapsed_ms: elapsed,
  });

  return {
    results,
    summary: { total: params.files.length, succeeded, failed, elapsed_ms: elapsed },
  };
}
