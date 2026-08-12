import {
  isLanguageSupported,
  detectLanguage,
  renameSymbol,
  replaceBody,
  addImport,
  removeImport,
  insertBeforeSymbol,
  insertAfterSymbol,
  findSymbols,
} from "./ast-edit";
import { replaceHash, ReplaceHashResult } from "./hash-edit";
import { ReadResult, ReadHashResult, readMany, readHash, computeHash } from "./read";
import { acquireLock, releaseLock } from "./lock";
import { recordEvent, ErrorCode } from "./telemetry";
import { loadConfig, policyForce, RoutePolicy } from "./config";

export type EditRoute = "ast" | "hash" | "diff";

export interface RouteExplanation {
  route: EditRoute;
  reasons: string[];
  policyApplied: boolean;
  policySource?: string;
}

export interface RouterResult {
  route: EditRoute;
  routeReason: string;
  fallback?: string;
  result: any;
  elapsed_ms: number;
  explanation?: RouteExplanation;
}

export function chooseRoute(
  filePath: string,
  operation: string,
  policy?: RoutePolicy
): { route: EditRoute; explanation: RouteExplanation } {
  const lang = detectLanguage(filePath);
  const reasons: string[] = [];
  let policyApplied = false;
  let policySource: string | undefined;

  // Derive a language key from extension for policy matching (even for unsupported langs)
  const extMatch = filePath.match(/\.([^.]+)$/);
  const extKey = lang || (extMatch ? extMatch[1] : null);

  // 1. Check policy overrides first
  const forced = policyForce(policy, extKey, operation);
  if (forced) {
    const src = lang && policy?.languageOverrides?.[lang]
      ? `language override for '${lang}'`
      : `operation override for '${operation}'`;
    const fromConf = lang && policy?.languageOverrides?.[lang] ? "language" : "operation";
    reasons.push(`Policy ${fromConf} forces route '${forced}'`);
    policyApplied = true;
    policySource = forced !== chooseRoute(filePath, operation).route ? fromConf : undefined;
    return { route: forced, explanation: { route: forced, reasons, policyApplied, policySource } };
  }

  // 2. Language + AST operation check
  if (isLanguageSupported(filePath) && isASTOperation(operation)) {
    reasons.push(`Language '${lang}' supports AST operations`);
    return { route: "ast", explanation: { route: "ast", reasons, policyApplied: false } };
  }

  // 3. Hash operations
  if (isHashOperation(operation)) {
    reasons.push(`Operation '${operation}' uses hash-based editing`);
    return { route: "hash", explanation: { route: "hash", reasons, policyApplied: false } };
  }

  // 4. Diff fallback
  const unsupported = !isLanguageSupported(filePath)
    ? `Language '${lang || "unknown"}' not supported for AST`
    : `Operation '${operation}' not available via AST or hash`;
  reasons.push(unsupported);
  reasons.push(`Falling back to diff route`);
  return { route: "diff", explanation: { route: "diff", reasons, policyApplied: false } };
}

function isASTOperation(op: string): boolean {
  return [
    "rename-symbol",
    "replace-body",
    "add-import",
    "remove-import",
    "insert-before",
    "insert-after",
    "find-symbols",
  ].includes(op);
}

function isHashOperation(op: string): boolean {
  return ["read-hash", "replace-hash"].includes(op);
}

/**
 * Read a file and compute its hash for CAS (compare-and-swap) gating.
 * Used by callers that want to capture a hash before editing, then pass
 * it back to routeEdit as oldHash.
 */
export async function routeRead(
  filePath: string,
  _operation: string = "read"
): Promise<{ content: string; hash: string | null; lines: number; stale: boolean }> {
  let content: string;
  try {
    content = await Bun.file(filePath).text();
  } catch {
    return { content: "", hash: null, lines: 0, stale: false };
  }
  return {
    content,
    hash: computeHash(content),
    lines: content.split("\n").length,
    stale: false,
  };
}

/**
 * CAS (Compare-And-Swap) write gateway.
 *
 * Re-reads the file immediately before writing. If oldHash is provided and
 * the file's hash no longer matches, the write is aborted with STALE_ANCHOR
 * and the caller is given the fresh hash to retry with.
 *
 * This makes every tier (AST, hash, diff) safe against concurrent edits,
 * not just the hash tier.
 */
async function casWrite(
  filePath: string,
  newContent: string,
  oldHash: string | undefined,
  dryRun: boolean = false
): Promise<{ success: boolean; stale: boolean; newHash: string; message: string }> {
  if (dryRun) {
    return { success: true, stale: false, newHash: "", message: "Dry run: write suppressed" };
  }

  // Acquire advisory lock around the read-modify-write window
  const lockResult = await acquireLock(filePath);
  if (!lockResult.success) {
    return { success: false, stale: false, newHash: "", message: lockResult.message };
  }

  try {
    let currentContent: string;
    try {
      currentContent = await Bun.file(filePath).text();
    } catch (e: any) {
      return { success: false, stale: false, newHash: "", message: `Failed to read file for CAS: ${e.message}` };
    }

    // If caller provided a hash, verify it still matches before writing
    if (oldHash !== undefined) {
      const currentHash = computeHash(currentContent);
      if (currentHash !== oldHash) {
        return {
          success: false,
          stale: true,
          newHash: currentHash,
          message: `STALE ANCHOR: File was modified since hash '${oldHash}' was computed. Current hash: '${currentHash}'. Re-read and retry.`,
        };
      }
    }

    try {
      await Bun.write(filePath, newContent);
      return { success: true, stale: false, newHash: computeHash(newContent), message: "Write succeeded (CAS verified)" };
    } catch (e: any) {
      return { success: false, stale: false, newHash: "", message: `Write failed: ${e.message}` };
    }
  } finally {
    releaseLock(lockResult.lockPath);
  }
}

export async function routeEdit(params: {
  filePath: string;
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
  // Diff params (search-and-replace fallback)
  oldContent?: string;
  dryRun?: boolean;
}): Promise<RouterResult> {
  const start = Date.now();
  const { filePath, operation, method, policy, oldHash, newContent, range, oldName, newName, symbolName, newBody, importSpec, content: insertContent, oldContent, dryRun } = params;

  let route: EditRoute;
  let explanation: RouteExplanation;

  // Load config-based policy if not explicitly provided
  const resolvedPolicy = policy || loadConfig().routePolicy;

  if (method) {
    route = method;
    explanation = { route, reasons: [`Explicit method override: ${method}`], policyApplied: false };
  } else {
    const decision = chooseRoute(filePath, operation, resolvedPolicy);
    route = decision.route;
    explanation = decision.explanation;
  }

  let result: any;
  let routeReason = explanation.reasons.join("; ");
  let fallback: string | undefined;

  if (route === "ast" && !isLanguageSupported(filePath)) {
    if (method) {
      result = { success: false, message: `Cannot force AST route: ${filePath} is not a supported language file` };
    } else {
      fallback = "AST unsupported for this file type";
      route = "hash";
    }
  }

  if (route === "hash") {
    if (!oldHash || !newContent) {
      route = "diff";
      fallback = "Hash edit requires oldHash and newContent";
    }
  }

  routeReason = `${explanation.reasons.join("; ")}${fallback ? `; ${fallback}` : ""}`;

  if (!result) {
    switch (route) {
      case "ast": {
        let source: string;
        try {
          source = await Bun.file(filePath).text();
        } catch (e: any) {
          result = { success: false, message: `Failed to read file: ${e.message}` };
          break;
        }
        switch (operation) {
        case "rename-symbol":
          result = renameSymbol(source, filePath, oldName!, newName!);
          break;
        case "replace-body":
          result = replaceBody(source, filePath, symbolName!, newBody!);
          break;
        case "add-import":
          result = addImport(source, filePath, importSpec!);
          break;
        case "remove-import":
          result = removeImport(source, filePath, importSpec!);
          break;
        case "insert-before":
          result = insertBeforeSymbol(source, filePath, symbolName!, insertContent!);
          break;
        case "insert-after":
          result = insertAfterSymbol(source, filePath, symbolName!, insertContent!);
          break;
        case "find-symbols":
          result = { success: true, symbols: findSymbols(source, filePath), message: "Symbols found" };
          break;
        default:
          result = { success: false, message: `Unknown AST operation: ${operation}` };
      }
      // Write result to file if successful — with CAS gate
      if (result.success && (result as any).newSource) {
        const writeResult = await casWrite(filePath, (result as any).newSource, oldHash, dryRun);
        if (!writeResult.success) {
          (result as any).success = false;
          (result as any).stale = writeResult.stale;
          (result as any).message = writeResult.message;
          (result as any).newHash = writeResult.newHash;
        }
      }
      break;
    }
    case "hash": {
      if (!dryRun) {
        const lockResult = await acquireLock(filePath);
        if (!lockResult.success) {
          result = { success: false, stale: false, message: lockResult.message, lockTimeout: true };
          break;
        }
        try {
          result = await replaceHash(filePath, oldHash!, newContent!, { range, dryRun, noRecovery: oldHash !== undefined });
        } finally {
          releaseLock(lockResult.lockPath);
        }
      } else {
        result = await replaceHash(filePath, oldHash!, newContent!, { range, dryRun, noRecovery: oldHash !== undefined });
      }
      break;
    }
    case "diff": {
      if (!oldContent || !newContent) {
        result = { success: false, message: "Diff route requires oldContent and newContent" };
        break;
      }
      let source: string;
      try {
        source = await Bun.file(filePath).text();
      } catch (e: any) {
        result = { success: false, message: `Failed to read file: ${e.message}` };
        break;
      }
      result = applyTextReplace(source, filePath, oldContent, newContent);
      if (result.success && (result as any).newSource) {
        const writeResult = await casWrite(filePath, (result as any).newSource, oldHash, dryRun);
        if (!writeResult.success) {
          (result as any).success = false;
          (result as any).stale = writeResult.stale;
          (result as any).message = writeResult.message;
          (result as any).newHash = writeResult.newHash;
        }
      }
      break;
    }
    default:
      result = { success: false, message: `Unknown route: ${route}` };
    }
  }

  const elapsed = Date.now() - start;

  let errorCode: ErrorCode | undefined;
  if (!result.success) {
    if (result.lockTimeout) {
      errorCode = ErrorCode.LOCK_TIMEOUT;
    } else if (result.stale) {
      errorCode = ErrorCode.STALE_ANCHOR;
    } else if (result.message?.includes("not found") || result.message?.includes("ENOENT")) {
      errorCode = ErrorCode.FILE_NOT_FOUND;
    } else if (result.message?.includes("hash")) {
      errorCode = ErrorCode.HASH_MISMATCH;
    }
  }

  recordEvent({
    operation,
    route,
    file: filePath,
    language: detectLanguage(filePath) || undefined,
    success: result.success ?? false,
    fallback_reason: fallback,
    retries: result.retries,
    elapsed_ms: elapsed,
    errorCode,
  });

  return { route, routeReason, fallback, result, elapsed_ms: elapsed, explanation };
}

/**
 * Search-and-replace fallback for the diff route.
 * Detects duplicates and reports the count. If oldContent appears more than once,
 * fails with a message listing occurrences so the caller can disambiguate.
 */
function applyTextReplace(
  source: string,
  filePath: string,
  oldContent: string,
  newContent: string
): { success: boolean; message: string; newSource?: string } {
  // Count exact occurrences in the full source
  const occurrences: number[] = [];
  let idx = 0;
  while ((idx = source.indexOf(oldContent, idx)) !== -1) {
    const lineNum = source.slice(0, idx).split("\n").length;
    occurrences.push(lineNum);
    idx += oldContent.length;
  }

  if (occurrences.length === 0) {
    return { success: false, message: `Content not found in ${filePath}. File may have changed — re-read and retry.` };
  }

  if (occurrences.length > 1) {
    const locs = occurrences.map((l) => `line ${l}`).join(", ");
    return {
      success: false,
      message: `Content appears ${occurrences.length} times (${locs}). Provide more context to disambiguate.`,
    };
  }

  const newSource = source.split(oldContent).join(newContent);
  return {
    success: true,
    message: `Replaced content at line ${occurrences[0]}`,
    newSource,
  };
}