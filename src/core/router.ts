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
import { replaceHash } from "./hash-edit";
import { readMany, readHash, computeHash } from "./read";
import { recordEvent, ErrorCode } from "./telemetry";
import { buildProvenanceFields } from "./provenance";
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
  // Provenance params
  actor?: string;
  taskId?: string;
  reason?: string;
}): Promise<RouterResult> {
  const start = Date.now();
  let editSource: string | undefined;
  let editResult: string | undefined;
  const { filePath, operation, method, policy, oldHash, newContent, range, oldName, newName, symbolName, newBody, importSpec, content: insertContent, oldContent, dryRun, actor, taskId, reason } = params;

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
          editSource = source;
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
      // Write result to file if successful
      if (result.success && (result as any).newSource && !dryRun) {
        await Bun.write(filePath, (result as any).newSource);
        editResult = (result as any).newSource;
      }
      break;
    }
    case "hash":
      editSource = await Bun.file(filePath).text();
      result = await replaceHash(filePath, oldHash!, newContent!, { range, dryRun });
      editResult = (await Bun.file(filePath).text());
      break;
    case "diff": {
      if (!oldContent || !newContent) {
        result = { success: false, message: "Diff route requires oldContent and newContent" };
        break;
      }
      let source: string;
      try {
        source = await Bun.file(filePath).text();
          editSource = source;
      } catch (e: any) {
        result = { success: false, message: `Failed to read file: ${e.message}` };
        break;
      }
      result = applyTextReplace(source, filePath, oldContent, newContent);
      if (result.success && (result as any).newSource && !dryRun) {
        await Bun.write(filePath, (result as any).newSource);
        editResult = (result as any).newSource;
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
    if (result.stale) {
      errorCode = ErrorCode.STALE_ANCHOR;
    } else if (result.message?.includes("not found") || result.message?.includes("ENOENT")) {
      errorCode = ErrorCode.FILE_NOT_FOUND;
    } else if (result.message?.includes("hash")) {
      errorCode = ErrorCode.HASH_MISMATCH;
    }
  }

  const provenanceFields = buildProvenanceFields({
    actor,
    taskId,
    reason,
    source: editSource,
    newSource: editResult,
    filePath,
  });

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
    ...provenanceFields,
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