import { findSymbols, insertParameter, insertCallArg, getParser, parseSource, detectLanguage } from "./ast-edit";
import { glob } from "glob";
import { escapeRegex } from "./utils";
import { normalizePath, pathsEqual } from "./path-normalize";

// ── Intent types ──────────────────────────────────────────────────────

/** Thrown for an intent operation the planner cannot perform. Maps to exit code 1. */
export class UnsupportedIntentError extends Error {
  readonly errorCode = "UNSUPPORTED_OPERATION";
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedIntentError";
  }
}

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

/**
 * Work the planner could not compute, surfaced to the caller instead of being
 * papered over. The planner used to write a C-style TODO comment placeholder
 * into the source at each of these sites — which is not even a comment in
 * Python, so a "successful" plan wrote a syntax error to disk (#16).
 */
export interface UnresolvedItem {
  file: string;
  operation: string;
  /** Why the planner could not compute this edit. */
  reason: string;
  /** What the caller can do about it. */
  resolution: string;
}

export interface EditPlan {
  intent: StructuredIntent;
  definition: SymbolDefinition;
  references: ReferenceLocation[];
  steps: EditStep[];
  /** Non-empty when part of the intent could not be planned; blocks execution without `yes`. */
  unresolved: UnresolvedItem[];
  impactSummary: string;
        /** Counts the reconciled reference resolution (#15): resolved / unresolved /
        * ambiguous. `ambiguous > 0` blocks execution without `--yes`. */
  reconciliation?: ReferenceReconciliation;
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
      // Never implemented. The plan it used to generate emitted a no-op
      // `remove-import` for the signature and a literal
      // `/* TODO: remove arg for X */` string as the search text at every call
      // site — which never matches, so the plan reported steps it could not
      // perform. Refusing is strictly safer than advertising it.
      throw new UnsupportedIntentError(
        "remove-parameter is not implemented. Use rename-exported-symbol, or edit the signature with `ast replace-body` and each call site with `diff apply`.",
      );
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
      throw new Error(`Unknown intent operation: ${obj.operation}. Supported: add-parameter, rename-exported-symbol`);
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
//
// #15: references are resolved with tree-sitter, not regex text matching.
// The old approach (`grep -w` plus `isDefinitionLine`) matched a symbol's
// spelling inside comments, string literals, and foreign imports, and — worse —
// *dropped* legitimate call sites that happened to sit on a `const`/`function`/
// `def` line ("const x = foo(1)" was read as the symbol's own definition, so the
// call site was skipped). A syntactic walk removes all of that: a "reference" is
// a bare identifier that is neither a declaration name, a member/property access,
// nor an import binding.

/** Identifiers that, when bare, can be references a caller wants to rename/reach. */
const REF_IDENTS = new Set(["identifier", "type_identifier"]);

/**
* A node whose PARENT has one of these types is a *declaration name* — it binds
* the local symbol, it does not use it, so it is excluded from the reference set.
* Language-agnostic across the six grammars.
*/
const DECL_NAME_PARENTS = new Set([
   "function_declaration", "class_declaration", "interface_declaration",
   "type_alias_declaration", "enum_declaration", "variable_declarator",
   "lexical_declaration", "variable_declaration", "function_definition",
   "function_item", "method_declaration", "method_definition", "constant_item",
   "type_parameter", "enum_variant", "field_declaration", "struct_item",
]);

/**
* A node whose PARENT has one of these types accesses the name as a *member of
* something else* (`obj.foo`, `a::b`), not as the top-level symbol, so it is
* excluded. In TS/JS such names are `property_identifier` (already outside
* `REF_IDENTS`); this set covers Python/Rust where the member is an `identifier`.
*/
const MEMBER_PARENTS = new Set([
   "member_expression", "property_access_expression", "selector_expression",
   "attribute", "field_expression", "type_path", "scoped_identifier",
   "qualified_identifier", "field_access",
]);

/**
* Any ancestor of this type means the identifier is *binding* another origin's
* name rather than using the top-level symbol (an import/export/re-export), so it
* is excluded from references. "pair" is deliberately absent: it is the JS
* object-literal property node, not an import (#14).
*/
const BINDING_CONTEXT = new Set([
/* Only the name-carrying LEAF nodes of an import/export/re-export — never the
 * statement-level containers (export_statement / import_from_statement / ...),
 * which wrap the WHOLE body of an exported/imported declaration and would
 * otherwise mark every reference inside it as a "binding". Leaf types sit
 * shallow, so an ancestor-walk over them cannot catch a reference buried in a
 * function body. (Object-literal property keys are `property_identifier`,
 * already excluded by REF_IDENTS — "pair" is deliberately absent, #14.)
 */
    // TS / JS / TSX / JSX
    "import_specifier", "named_imports", "named_import", "namespace_import",
    "default_import", "export_specifier", "exported_names", "export_clause",
    // Python
    "dotted_name", "alias", "import_prefix",
    // Go
    "import_spec", "imported_path",
    // Rust
    "use_list", "scoped_use_list", "scoped_identifier", "identifier_path",
    "use_as_clause", "use_tree", "group_use_delimiter", "nested_use_delimiter",
]);

/**
* Source extensions HashPilot has no tree-sitter grammar for, that nonetheless
* might *mention* the symbol by text. These are surfaced as `unresolved` — an
* honest "I cannot see these" — instead of being regex-guessed or silently
* ignored.
*/
const UNPARSED_EXTS = [
     "**/*.rb", "**/*.java", "**/*.c", "**/*.cc", "**/*.cpp", "**/*.h",
     "**/*.hpp", "**/*.cs", "**/*.php", "**/*.swift", "**/*.scala", "**/*.kt",
];

/** Counts the reconciled resolution of a symbol's references. */
export interface ReferenceReconciliation {
   /** References found syntactically that the planner can act on. */
  resolved: number;
   /** Files that mention the symbol but HashPilot cannot parse / resolve. */
  unresolved: number;
   /**
   * Bare references located in a file that also binds the same name more than
   * once (e.g. an aliased import plus a local declaration) — the wrong module's
   * symbol could be reached. True cross-module disambiguation is the LSP-tier
   * successor (textDocument/references); this narrow flag is a proxy.
   */
  ambiguous: number;
}

interface FileResolution {
   refs: ReferenceLocation[];
   unresolvable: boolean;
   reason?: string;
   /** Number of binding sites for `symbol` in this file (used for ambiguity). */
  bindings: number;
}

/**
* Resolve every bare reference to `symbol` in ONE file's source using that
* language's tree-sitter grammar, and report whether the file could not be
* resolved (no grammar / did not parse).
*/
function resolveFile(source: string, absPath: string, symbol: string): FileResolution {
  const lang = detectLanguage(absPath);
  const parser = getParser(lang || "");
  // No grammar, or the parser cannot be initialised: we cannot see this file.
  if (!lang || !parser) {
    return { refs: [], unresolvable: true, reason: `no parser for ${lang ?? "this language"}`, bindings: 0 };
    }

   let tree;
  try {
    tree = parseSource(parser, source);
    } catch {
    return { refs: [], unresolvable: true, reason: "file does not parse", bindings: 0 };
    }

   const lines = source.split("\n");
  const refs: ReferenceLocation[] = [];
  let bindings = 0;
  const seenRefs = new Set<number>();

   function inBindingContext(node: any): boolean {
    let p = node.parent;
    while (p && p.type) {
      if (BINDING_CONTEXT.has(p.type)) return true;
      p = p.parent;
       }
    return false;
    }

  function walk(node: any) {
    if (REF_IDENTS.has(node.type) && node.text === symbol) {
      const parent = node.parent;
      const isDeclName =
         parent && (DECL_NAME_PARENTS.has(parent.type) || MEMBER_PARENTS.has(parent.type));
      const isBindingSite = isDeclName || inBindingContext(node);
      if (isBindingSite) {
        bindings += 1;
         } else if (!seenRefs.has(node.startIndex)) {
        seenRefs.add(node.startIndex);
        refs.push({
          file: absPath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          context: (lines[node.startPosition.row] || symbol).trim(),
         });
        }
       }
    for (const child of node.children) walk(child);
    }

  walk(tree.rootNode);
  return { refs, unresolvable: false, bindings };
}

/**
* Resolve references to `symbol` across the project.
*
* Supported-language files are parsed and their bare references collected. Files
* in languages HashPilot cannot parse are reported as `unresolved` (an honest
* "I cannot see these") rather than guessed at, and any bare reference that also
* lives in a file which binds the name more than once is reported under
* `ambiguous` — a genuine cross-module clash the planner should not silently
* rename.
*/
export async function resolveReferences(
  symbol: string,
  projectRoot: string,
  _definitionFile: string
): Promise<{
   references: ReferenceLocation[];
  unresolved: UnresolvedItem[];
  reconciliation: ReferenceReconciliation;
}> {
  const sourceFiles = await glob(LANG_EXTS, { cwd: projectRoot, ignore: IGNORE_GLOBS });
  const references: ReferenceLocation[] = [];
  const unresolved: UnresolvedItem[] = [];
  let ambiguous = 0;

  for (const rel of sourceFiles) {
    const absPath = `${projectRoot}/${rel}`;
    let source: string;
    try {
      source = await Bun.file(absPath).text();
       } catch {
      continue;
       }
     const { refs, unresolvable, reason, bindings } = resolveFile(source, absPath, symbol);
    if (refs.length > 0) {
      references.push(...refs);
      // A bare reference that lives in a file binding the same name more than
      // once is ambiguous: it may reach a different module's symbol.
      if (bindings > 1) ambiguous += refs.length;
       }
    if (unresolvable) {
      unresolved.push({
        file: absPath,
        operation: "resolve-references",
        reason: `${rel}: ${reason ?? "file could not be resolved"}`,
        resolution: `HashPilot cannot resolve references in this file; inspect and edit it manually, or add a grammar for its language.`,
        });
       }
     }

   // Languages outside LANG_EXTS that merely *mention the symbol by text* are
   // surfaced as unresolved rather than silently ignored or regex-guessed.
   for (const rel of await glob(UNPARSED_EXTS, { cwd: projectRoot, ignore: IGNORE_GLOBS })) {
      const absPath = `${projectRoot}/${rel}`;
     let source: string;
      try {
        source = await Bun.file(absPath).text();
          } catch {
        continue;
          }
       if (new RegExp(`\\b${escapeRegex(symbol)}\\b`).test(source)) {
        unresolved.push({
          file: absPath,
          operation: "resolve-references",
          reason: `${rel} mentions '${symbol}', but its language has no parser in HashPilot`,
          resolution: `Inspect ${rel} manually; HashPilot will not guess references in a language it cannot parse.`,
            });
        }
      }

  return {
    references,
    unresolved,
    reconciliation: {
      resolved: references.length,
      unresolved: unresolved.length,
      ambiguous,
      },
    };
}

/**
* Back-compat entry point used by existing callers and tests: the rich
* `resolveReferences` result, projected down to just the reference list.
*/
export async function findReferences(
  symbol: string,
  projectRoot: string,
  _definitionFile: string
): Promise<ReferenceLocation[]> {
  const { references } = await resolveReferences(symbol, projectRoot, _definitionFile);
  return references;
}

// ── Plan generation ───────────────────────────────────────────────────

export function generatePlan(
  intent: StructuredIntent,
  definition: SymbolDefinition,
  references: ReferenceLocation[],
  reconciliation?: ReferenceReconciliation
): EditPlan {
  const steps: EditStep[] = [];
  const unresolved: UnresolvedItem[] = [];

  switch (intent.operation) {
    case "add-parameter": {
      const paramParts = [intent.param.name];
      if (intent.param.type) paramParts.push(intent.param.type);
      const paramStr = paramParts.join(": ");
      const defaultVal = intent.param.default ?? undefined;

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

      // Steps 1..N: Insert argument at each call site file.
      //
      // Only possible when the caller gave a default: without one there is no
      // value to pass, and inventing a placeholder means writing text that is
      // wrong in every language and a syntax error in Python. Report it instead.
      // Normalize before deduping: the same file reached via "src/a.ts",
      // "./src/a.ts", and "/abs/proj/src/a.ts" is one file, and without this
      // it produced one plan step per spelling.
      const refFiles = [...new Set(references.map((r) => normalizePath(r.file)))];
      if (defaultVal === undefined) {
        for (const file of refFiles) {
          unresolved.push({
            file,
            operation: "insert-call-arg",
            reason: `no default given for '${intent.param.name}', so the argument to pass at each call site cannot be computed`,
            resolution: `Re-run with "param": {"name": "${intent.param.name}", "default": "<value>"}, or edit the call sites in ${shortPath(file)} yourself with \`diff apply\`.`,
          });
        }
        break;
      }
      refFiles.forEach((file, i) => {
        steps.push({
          order: i + 1,
          file,
          operation: "insert-call-arg",
          description: `Add argument '${defaultVal}' at all call sites in ${shortPath(file)}`,
          params: {
            functionName: intent.symbol,
            argValue: defaultVal,
          },
        });
      });
      break;
    }

    case "remove-parameter": {
      throw new UnsupportedIntentError("remove-parameter is not implemented.");
    }

    case "rename-exported-symbol": {
      steps.push({
        order: 0,
        file: definition.file,
        operation: "rename-symbol",
        description: `Rename '${intent.symbol}' → '${intent.newName}' in definition`,
        params: { oldName: intent.symbol, newName: intent.newName },
      });

      // Normalized compare, so a reference spelled differently from the
      // definition still filters out and does not get renamed twice.
      const refFiles = [...new Set(references.map((r) => normalizePath(r.file)))]
        .filter((f) => !pathsEqual(f, definition.file));
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
    unresolved,
    impactSummary:
      `${steps.length} edits across ${impactedFiles.length} files` +
      (references.length > 0 ? ` (${references.length} references found)` : "") +
          (unresolved.length > 0
            ? `; ${unresolved.length} unresolved in ${new Set(unresolved.map((u) => u.file)).size} files`
            : "") +
            (reconciliation
             ? `; reconciliation: ${reconciliation.resolved} resolved, ${reconciliation.unresolved} unresolved-language, ${reconciliation.ambiguous} ambiguous`
             : ""),
   reconciliation,
    };
}

// ── Helpers ───────────────────────────────────────────────────────────

function shortPath(file: string): string {
  const idx = file.lastIndexOf("/src/");
  if (idx !== -1) return file.slice(idx + 1);
  const idx2 = file.lastIndexOf("/tests/");
  if (idx2 !== -1) return file.slice(idx2 + 1);
  return file.split("/").pop() || file;
}
