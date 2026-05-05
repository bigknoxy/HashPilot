import { findSymbols, insertParameter, insertCallArg } from "./ast-edit";
import { grepMany } from "./grep";
import { glob } from "glob";

// ── Intent types ──────────────────────────────────────────────────────

export type IntentOperation =
  | "add-parameter"
  | "remove-parameter"
  | "rename-exported-symbol";

export interface AddParameterIntent {
  operation: "add-parameter";
  symbol: string;
  param: { name: string; type?: string; default?: string };
  file?: string;
}

export interface RemoveParameterIntent {
  operation: "remove-parameter";
  symbol: string;
  paramName: string;
  file?: string;
}

export interface RenameExportedSymbolIntent {
  operation: "rename-exported-symbol";
  symbol: string;
  newName: string;
  file?: string;
}

export type StructuredIntent =
  | AddParameterIntent
  | RemoveParameterIntent
  | RenameExportedSymbolIntent;

// ── Reference types ───────────────────────────────────────────────────

export interface ReferenceLocation {
  file: string;
  line: number;
  column: number;
  context: string;
}

export interface SymbolDefinition {
  file: string;
  name: string;
  kind: string;
  line: number;
  column: number;
}

// ── Edit step ─────────────────────────────────────────────────────────

export interface EditStep {
  order: number;
  file: string;
  operation: string;
  description: string;
  params: Record<string, any>;
}

export interface EditPlan {
  intent: StructuredIntent;
  definition: SymbolDefinition;
  references: ReferenceLocation[];
  steps: EditStep[];
  impactSummary: string;
}

// ── Intent parsing ────────────────────────────────────────────────────

export function parseIntent(raw: string): StructuredIntent {
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON: ${raw}`);
  }

  if (!obj.operation) throw new Error("Intent requires 'operation' field");
  if (!obj.symbol || typeof obj.symbol !== "string") {
    throw new Error("Intent requires 'symbol' field (string)");
  }

  switch (obj.operation) {
    case "add-parameter": {
      if (!obj.param || !obj.param.name) throw new Error("add-parameter requires 'param.name'");
      return {
        operation: "add-parameter",
        symbol: obj.symbol,
        param: {
          name: obj.param.name,
          type: obj.param.type,
          default: obj.param.default,
        },
        file: obj.file,
      };
    }
    case "remove-parameter": {
      if (!obj.paramName) throw new Error("remove-parameter requires 'paramName'");
      return {
        operation: "remove-parameter",
        symbol: obj.symbol,
        paramName: obj.paramName,
        file: obj.file,
      };
    }
    case "rename-exported-symbol": {
      if (!obj.newName) throw new Error("rename-exported-symbol requires 'newName'");
      return {
        operation: "rename-exported-symbol",
        symbol: obj.symbol,
        newName: obj.newName,
        file: obj.file,
      };
    }
    default:
      throw new Error(`Unknown intent operation: ${obj.operation}. Supported: add-parameter, remove-parameter, rename-exported-symbol`);
  }
}

// ── Symbol definition discovery ───────────────────────────────────────

const LANG_EXTS = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.py", "**/*.go", "**/*.rs"];
const IGNORE_GLOBS = ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/__pycache__/**", "**/target/**", "**/vendor/**"];

export async function findSymbolDefinition(
  symbol: string,
  projectRoot: string,
  hintFile?: string
): Promise<SymbolDefinition | null> {
  // Check hint file first
  if (hintFile) {
    try {
      const source = await Bun.file(hintFile).text();
      const symbols = findSymbols(source, hintFile);
      const match = symbols.find((s) => s.name === symbol);
      if (match) {
        return {
          file: hintFile,
          name: match.name,
          kind: match.kind,
          line: match.startRow + 1,
          column: match.startCol + 1,
        };
      }
    } catch {}
  }

  const sourceFiles = await glob(LANG_EXTS, { cwd: projectRoot, ignore: IGNORE_GLOBS });
  for (const relPath of sourceFiles) {
    const absPath = `${projectRoot}/${relPath}`;
    try {
      const source = await Bun.file(absPath).text();
      const symbols = findSymbols(source, absPath);
      const match = symbols.find((s) => s.name === symbol);
      if (match) {
        return {
          file: absPath,
          name: match.name,
          kind: match.kind,
          line: match.startRow + 1,
          column: match.startCol + 1,
        };
      }
    } catch {}
  }

  return null;
}

// ── Reference discovery ───────────────────────────────────────────────

const DEF_PATTERNS = [
  /^(export\s+)?(async\s+)?function\s+/,
  /^(export\s+)?(const|let|var)\s+/,
  /^(export\s+)?class\s+/,
  /^(export\s+)?interface\s+/,
  /^(export\s+)?type\s+/,
  /^def\s+/,
  /^func\s+/,
  /^pub\s+fn\s+/,
];

function isDefinitionLine(content: string, symbol: string): boolean {
  return DEF_PATTERNS.some((p) => p.test(content) && content.includes(symbol));
}

export async function findReferences(
  symbol: string,
  projectRoot: string,
  _definitionFile: string
): Promise<ReferenceLocation[]> {
  const sourceFiles = await glob(LANG_EXTS, { cwd: projectRoot, ignore: IGNORE_GLOBS });
  if (sourceFiles.length === 0) return [];

  const absPaths = sourceFiles.map((f) => `${projectRoot}/${f}`);

  const grepResult = await grepMany(escapeRegex(symbol), absPaths, {
    maxResults: 500,
    wordMatch: true,
  });

  if (grepResult.error) return [];

  const references: ReferenceLocation[] = [];
  for (const r of grepResult.results) {
    if (isDefinitionLine(r.content.trim(), symbol)) continue;
    references.push({ file: r.path, line: r.line, column: r.column, context: r.content.trim() });
  }

  return references;
}

// ── Plan generation ───────────────────────────────────────────────────

export function generatePlan(
  intent: StructuredIntent,
  definition: SymbolDefinition,
  references: ReferenceLocation[]
): EditPlan {
  const steps: EditStep[] = [];

  switch (intent.operation) {
    case "add-parameter": {
      const paramParts = [intent.param.name];
      if (intent.param.type) paramParts.push(intent.param.type);
      const paramStr = paramParts.join(": ");
      const defaultVal = intent.param.default ?? undefined;
      const argValue = defaultVal ?? `/* TODO: add ${intent.param.name} */`;

      // Step 0: Insert parameter into function signature
      steps.push({
        order: 0,
        file: definition.file,
        operation: "insert-parameter",
        description: `Add parameter '${paramStr}' to function '${intent.symbol}'`,
        params: {
          symbolName: intent.symbol,
          newParam: paramStr,
          paramType: intent.param.type,
          paramDefault: defaultVal,
        },
      });

      // Steps 1..N: Insert argument at each call site file
      const refFiles = [...new Set(references.map((r) => r.file))];
      refFiles.forEach((file, i) => {
        steps.push({
          order: i + 1,
          file,
          operation: "insert-call-arg",
          description: `Add argument '${argValue}' at all call sites in ${shortPath(file)}`,
          params: {
            functionName: intent.symbol,
            argValue,
          },
        });
      });
      break;
    }

    case "remove-parameter": {
      steps.push({
        order: 0,
        file: definition.file,
        operation: "remove-import",
        description: `Remove parameter '${intent.paramName}' from '${intent.symbol}' — requires manual signature edit`,
        params: {},
      });

      const refFiles = [...new Set(references.map((r) => r.file))];
      refFiles.forEach((file, i) => {
        steps.push({
          order: i + 1,
          file,
          operation: "diff",
          description: `Remove argument '${intent.paramName}' from call sites in ${shortPath(file)}`,
          params: {
            oldContent: `/* TODO: remove arg for ${intent.paramName} */`,
            newContent: "",
          },
        });
      });
      break;
    }

    case "rename-exported-symbol": {
      steps.push({
        order: 0,
        file: definition.file,
        operation: "rename-symbol",
        description: `Rename '${intent.symbol}' → '${intent.newName}' in definition`,
        params: { oldName: intent.symbol, newName: intent.newName },
      });

      const refFiles = [...new Set(references.map((r) => r.file))].filter((f) => f !== definition.file);
      refFiles.forEach((file, i) => {
        steps.push({
          order: i + 1,
          file,
          operation: "rename-symbol",
          description: `Rename in ${shortPath(file)}`,
          params: { oldName: intent.symbol, newName: intent.newName },
        });
      });
      break;
    }
  }

  const impactedFiles = [...new Set(steps.map((s) => s.file))];

  return {
    intent,
    definition,
    references,
    steps,
    impactSummary: `${steps.length} edits across ${impactedFiles.length} files${references.length > 0 ? ` (${references.length} references found)` : ""}`,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shortPath(file: string): string {
  const idx = file.lastIndexOf("/src/");
  if (idx !== -1) return file.slice(idx + 1);
  const idx2 = file.lastIndexOf("/tests/");
  if (idx2 !== -1) return file.slice(idx2 + 1);
  return file.split("/").pop() || file;
}
