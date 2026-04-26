import { isLanguageSupported, detectLanguage } from "./ast-edit";
import { replaceHash, ReplaceHashResult } from "./hash-edit";
import { ReadResult, ReadHashResult, readMany, readHash, computeHash } from "./read";
import { recordEvent } from "./telemetry";
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
  oldHash?: string;
  newContent?: string;
  range?: { start: number; end: number };
}): Promise<RouterResult> {
  const start = Date.now();
  const { filePath, operation, method, policy, oldHash, newContent, range } = params;

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
    routeReason = `AST not supported for ${filePath}, falling back to hash`;
    fallback = "AST unsupported for this file type";
    route = "hash";
  }

  if (route === "hash") {
    if (!oldHash || !newContent) {
      route = "diff";
      fallback = "Hash edit requires oldHash and newContent";
      routeReason = `Missing hash params, falling back to diff`;
    }
  }

  routeReason = `${explanation.reasons.join("; ")}${fallback ? `; ${fallback}` : ""}`;

  switch (route) {
    case "hash":
      result = await replaceHash(filePath, oldHash!, newContent!, { range });
      break;
    default:
      result = { success: false, message: "Diff route not yet implemented directly through router; use replace-hash with explicit parameters" };
  }

  const elapsed = Date.now() - start;
  recordEvent({
    operation,
    route,
    file: filePath,
    language: detectLanguage(filePath) || undefined,
    success: result.success ?? false,
    fallback_reason: fallback,
    retries: result.retries,
    elapsed_ms: elapsed,
  });

  return { route, routeReason, fallback, result, elapsed_ms: elapsed, explanation };
}