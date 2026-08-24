import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import Python from "tree-sitter-python";
import JavaScript from "tree-sitter-javascript";
import Go from "tree-sitter-go";
import Rust from "tree-sitter-rust";
import { escapeRegex } from "./utils";
import { detectModuleSystem } from "./module-system";
import { ErrorCode } from "./telemetry";
import { addWarning } from "./envelope";

// Language registry: maps internal language IDs to parser + metadata
interface LangEntry {
  parser: Parser;
  extensions: string[];
}

const SUPPORTED_LANGUAGES: Record<string, LangEntry> = {};

// Mapping from file extension to language ID (longest suffix first for correctness)
const EXTENSION_MAP: [string, string][] = [
  [".d.ts", "__typescript_decl__"], // reserved, excluded from AST
  [".tsx", "tsx"],
  [".ts", "typescript"],
  [".jsx", "javascript"],
  [".js", "javascript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".py", "python"],
  [".go", "go"],
  [".rs", "rust"],
];

/** Every language with a tree-sitter binding, in `ast capabilities` order. */
export const AST_LANGUAGES = ["typescript", "tsx", "javascript", "python", "go", "rust"] as const;

/**
 * Why a parser failed to initialize, keyed by language. `getParser` returns
 * `null` on failure and the router then silently falls back to hash/diff, so
 * without this the only symptom of a broken native build is mysteriously worse
 * edits. `doctor` reads this to report the real reason (#46).
 */
const PARSER_ERRORS: Record<string, string> = {};

function getParser(lang: string): Parser | null {
  if (SUPPORTED_LANGUAGES[lang]) return SUPPORTED_LANGUAGES[lang].parser;
  try {
    const p = new Parser();
    switch (lang) {
      case "typescript":
        p.setLanguage(TypeScript.typescript);
        break;
      case "tsx":
        p.setLanguage(TypeScript.tsx);
        break;
      case "javascript":
        p.setLanguage(JavaScript);
        break;
      case "python":
        p.setLanguage(Python);
        break;
      case "go":
        p.setLanguage(Go);
        break;
      case "rust":
        p.setLanguage(Rust);
        break;
      default:
        return null;
    }
    SUPPORTED_LANGUAGES[lang] = { parser: p, extensions: [] };
    return p;
  } catch (e) {
    PARSER_ERRORS[lang] = e instanceof Error ? e.message : String(e);
    return null;
  }
}

/** One language's tree-sitter binding status, as reported by `doctor`. */
export interface ParserProbe {
  lang: string;
  loaded: boolean;
  /** Present only when the binding failed to initialize. */
  error?: string;
}

/**
 * Attempt to initialize every supported language's parser and report the
 * outcome. This is the only way to distinguish "HashPilot routed to diff
 * because the operation is unsupported" from "HashPilot routed to diff because
 * tree-sitter never loaded" (#46).
 */
export function probeParsers(): ParserProbe[] {
  return AST_LANGUAGES.map((lang): ParserProbe => {
    const parser = getParser(lang);
    if (parser) return { lang, loaded: true };
    return { lang, loaded: false, error: PARSER_ERRORS[lang] || "parser returned null" };
  });
}

/**
 * Chunk size for the callback-form parse. Anything comfortably under the
 * binding's 32KB marshalling buffer works.
 */
const PARSE_CHUNK = 16 * 1024;

/**
 * Parse source of any size.
 *
 * `parser.parse(string)` marshals the whole string through a fixed 32KB buffer
 * in the node-tree-sitter binding and throws a bare `Invalid argument` at 32767
 * characters. Every AST operation used that overload, so the top tier of the
 * edit hierarchy was dead on exactly the large files where a structured edit
 * beats a hand-written diff (#55). The callback form streams the source in
 * chunks and has no such limit.
 */
export function parseSource(parser: Parser, source: string) {
  return parser.parse((index: number) => {
    if (index >= source.length) return null;
    let end = Math.min(index + PARSE_CHUNK, source.length);
    // Never split a surrogate pair across chunks — half a code point would
    // reach the parser as a lone surrogate and corrupt every offset after it.
    const last = source.charCodeAt(end - 1);
    if (end < source.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    return source.slice(index, end);
  });
}

/** Detect language from file path. Returns null for unsupported files. */
export function detectLanguage(filePath: string): string | null {
  for (const [ext, lang] of EXTENSION_MAP) {
    if (filePath.endsWith(ext)) {
      // .d.ts files are excluded from AST editing (declaration files)
      if (lang === "__typescript_decl__") return null;
      return lang;
    }
  }
  return null;
}

export function isLanguageSupported(filePath: string): boolean {
  return detectLanguage(filePath) !== null;
}

/** Return the list of supported language IDs. */
export function supportedLanguages(): string[] {
  return ["typescript", "tsx", "javascript", "python", "go", "rust"];
}

/**
 * Machine-readable capability matrix for all supported AST languages.
 * Each entry lists the language, associated extensions, supported operations,
 * and any known limitations.
 */
export function astCapabilities(): LanguageCapability[] {
  return [
    {
      lang: "typescript",
      extensions: [".ts"],
      operations: ALL_AST_OPS,
      limitations: [".d.ts files are excluded"],
    },
    {
      lang: "tsx",
      extensions: [".tsx"],
      operations: ALL_AST_OPS,
      limitations: [],
    },
    {
      lang: "javascript",
      extensions: [".js", ".jsx", ".mjs", ".cjs"],
      operations: ALL_AST_OPS,
      limitations: [],
    },
    {
      lang: "python",
      extensions: [".py"],
      operations: ALL_AST_OPS,
      limitations: [
        "add-import supports `import X`, `from X import Y`, and `from X import Y, Z`; auto-merges into existing from-import for the same module",
      ],
    },
    {
      lang: "go",
      extensions: [".go"],
      operations: ALL_AST_OPS,
      limitations: [
        "add-import: with no existing imports inserts after `package` clause; with grouped `import ( ... )` block inserts inside the group",
      ],
    },
    {
      lang: "rust",
      extensions: [".rs"],
      operations: ALL_AST_OPS,
      limitations: [
        "remove-import: grouped `use X::{Y, Z}` supports surgical per-item removal; last item simplifies to `use X::Y`; no substring false positives",
      ],
    },
  ];
}

export interface LanguageCapability {
  /** Language identifier (e.g. "typescript", "go") */
  lang: string;
  /** File extensions associated with this language */
  extensions: string[];
  /** Operations fully supported */
  operations: string[];
  /** Any known limitations for this language */
  limitations: string[];
}

const ALL_AST_OPS = [
  "find-symbols",
  "rename-symbol",
  "replace-body",
  "add-import",
  "remove-import",
  "insert-before",
  "insert-after",
];

// ── Per-language AST configuration ─────────────────────────────────────

interface LangConfig {
  /** Node types representing named symbol declarations */
  symbolKinds: string[];
  /** Node types that can have a function/method body */
  functionTypes: string[];
}

const LANG_CONFIGS: Record<string, LangConfig> = {
  typescript: {
    symbolKinds: [
      "function_declaration", "method_definition", "class_declaration",
      "interface_declaration", "type_alias_declaration", "variable_declarator",
    ],
    functionTypes: ["function_declaration", "method_definition", "arrow_function"],
  },
  tsx: {
    symbolKinds: [
      "function_declaration", "method_definition", "class_declaration",
      "interface_declaration", "type_alias_declaration", "variable_declarator",
    ],
    functionTypes: ["function_declaration", "method_definition", "arrow_function"],
  },
  javascript: {
    symbolKinds: [
      "function_declaration", "method_definition", "class_declaration",
      "variable_declarator",
    ],
    functionTypes: ["function_declaration", "method_definition", "arrow_function"],
  },
  python: {
    symbolKinds: ["function_definition", "class_definition"],
    functionTypes: ["function_definition"],
  },
  go: {
    symbolKinds: ["function_declaration", "method_declaration", "type_spec", "var_spec"],
    functionTypes: ["function_declaration", "method_declaration"],
  },
  rust: {
    symbolKinds: [
      "function_item", "struct_item", "enum_item", "trait_item",
      "type_item", "const_item", "static_item",
    ],
    functionTypes: ["function_item"],
  },
};

function configFor(lang: string): LangConfig | null {
  return LANG_CONFIGS[lang] ?? null;
}

/** Common identifier node types recognized across all supported grammars */
const IDENTIFIER_TYPES = new Set(["identifier", "type_identifier", "property_identifier"]);

export interface ASTEditResult {
  success: boolean;
  path: string;
  operation: string;
  changes: number;
  message: string;
  error?: string;
  newSource?: string;
  symbolFound?: boolean;
  /** Set when the parse-validity gate rejected the edit. Always PARSE_ERROR. */
  errorCode?: string;
  /**
   * What the caller can do about a refusal. Surfaced as `error.recovery` in the
   * JSON envelope, so a refusal an agent cannot act on is a bug, not a style
   * choice.
   */
  recovery?: string;
  /** Where the offending syntax error is, when `errorCode` is PARSE_ERROR. */
  parseIssue?: ParseIssue;
}
export interface SymbolInfo {
  name: string;
  kind: string;
  /**
   * Zero-indexed tree-sitter coordinates. Kept for backward compatibility;
   * prefer the 1-indexed `startLine`/`endLine`/`startColumn`/`endColumn` below,
   * which match every other line number HashPilot reports — notably the `range`
   * accepted by the hash tier and the lines returned by `read-hash` (#99).
   */
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
  /** 1-indexed line of the symbol's first character. */
  startLine: number;
  /** 1-indexed line of the symbol's last character. */
  endLine: number;
  /** 1-indexed column of the symbol's first character. */
  startColumn: number;
  /** 1-indexed column of the symbol's last character. */
  endColumn: number;
}

/**
 * Runaway guard for AST walks, far above any realistic nesting depth (#39).
 *
 * The two walks used to stop at 10 and 15 *silently*, so a symbol nested more
 * deeply than that — routine in React trees or heavily generic TypeScript — was
 * reported as "not found". A wrong answer indistinguishable from a right one is
 * the worst failure a lookup can have, so the cap is now shared, far higher,
 * and reported when it is hit. Both walks are iterative, so depth costs heap
 * rather than stack.
 */
export const MAX_AST_DEPTH = 200;

export interface SymbolSearch {
  symbols: SymbolInfo[];
  /** True when the walk stopped at MAX_AST_DEPTH with subtrees left unvisited. */
  truncated: boolean;
}

/**
 * Symbol search that reports whether it completed. `findSymbols` keeps the
 * bare-array shape its callers expect; this is the variant that can distinguish
 * "no symbols" from "stopped looking".
 */
export function findSymbolsDetailed(source: string, filePath: string): SymbolSearch {
  const empty = { symbols: [], truncated: false };
  const lang = detectLanguage(filePath);
  if (!lang) return empty;
  const cfg = configFor(lang);
  if (!cfg) return empty;
  const parser = getParser(lang);
  if (!parser) return empty;
  const tree = parseSource(parser, source);
  const symbols: SymbolInfo[] = [];
  let truncated = false;

  // Explicit work stack: a recursive walk on a pathologically deep tree
  // overflows before it reaches any cap.
  const stack: Array<{ node: Parser.SyntaxNode; depth: number }> = [{ node: tree.rootNode, depth: 0 }];
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (depth > MAX_AST_DEPTH) {
      truncated = true;
      continue;
    }
    if (cfg.symbolKinds.includes(node.type)) {
      const nameNode =
        node.childForFieldName("name") ||
        node.children.find((c) => IDENTIFIER_TYPES.has(c.type));
      if (nameNode) {
        // tree-sitter counts rows and columns from 0. Everything else
        // HashPilot reports — `read-hash`, the hash tier's `range`, editor
        // jump-to-line — counts from 1, so emit both rather than leaving each
        // caller to remember which convention this one function uses (#99).
        symbols.push({
          name: nameNode.text,
          kind: node.type,
          startRow: node.startPosition.row,
          endRow: node.endPosition.row,
          startCol: node.startPosition.column,
          endCol: node.endPosition.column,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          startColumn: node.startPosition.column + 1,
          endColumn: node.endPosition.column + 1,
        });
      }
    }
    // Push in reverse so children are visited in source order.
    const kids = node.children;
    for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i], depth: depth + 1 });
  }

  if (truncated) {
    addWarning({
      code: "SEARCH_TRUNCATED",
      message: `Symbol search stopped at depth ${MAX_AST_DEPTH} in ${filePath}; symbols nested deeper were not visited.`,
    });
  }
  return { symbols, truncated };
}

/** Symbols in a file. Returns the bare array; see `findSymbolsDetailed` for truncation. */
export function findSymbols(source: string, filePath: string): SymbolInfo[] {
  return findSymbolsDetailed(source, filePath).symbols;
}

/**
* Node types whose presence in an ancestor chain marks an identifier as an
* imported name (rather than a local use). Conservative across the six
* grammars — better to over-flag a binding than to miss one.
*/
const IMPORT_CONTEXT = new Set([
   // TypeScript / JavaScript
  "import_statement", "import_clause", "named_import", "import",
   // Python
  "import_from_statement", "import_prefix", "alias", "dotted_name",
   // Go
  "import_declaration", "import_spec", "imported_path",
   // Rust
  "use_declaration", "use_as_clause", "nested_use_delimiter",
  "identifier_path", "scoped_identifier",
]);


/**
* Node types whose presence in an ancestor chain marks an identifier as a
* *parameter*. A name bound as a parameter is a fresh scope, so two parameters
* — or a parameter and a local — of the same name in one file are two bindings
* (shadowing), and a file-wide rename is unsafe. Parameter node names differ
* across the six grammars, so the list is approximate and deliberately
* conservative (better to refuse than to clobber).
*/
const PARAM_CONTEXT = new Set([
    // TypeScript / JavaScript
    "function_parameter", "variable_pattern", "pattern",
    // Python
    "parameters", "typed_parameter", "default_parameter", "optional_parameter",
    "required_parameter", "simple_parameter",
    // Go / Rust
    "parameter_declaration", "parameter_list", "function_parameter", "parameter",
    "formal_parameters",
]);

/** A place in a file where a name is *bound* (declared or imported). */
interface BindingSite {
  row: number;
  kind: string;
}

/**
* Collect every location that binds `oldName`: each declaration whose symbol
* name equals it (a shadow is simply a *second* declaration at an inner scope)
* plus each import that binds the name. `rename-symbol` is file-safe only when
* there is at most one such site; more than one means the name is genuinely
* multi-bound and a file-wide textual rename would clobber an unintended one.
*
* Property keys, string literals, and comments are never `identifier`/
* `type_identifier` nodes here, so they are excluded for free — the only gap
* this fills is the *binding* gap (which of several same-named symbols targeted).
*/
function collectBindingSites(
  tree: Parser.SyntaxTree,
  oldName: string,
  cfg: LangConfig
): BindingSite[] {
  const sites: BindingSite[] = [];
  const seen = new Set<number>();
  const push = (row: number, kind: string, idx: number) => {
    if (!seen.has(idx)) {
       seen.add(idx);
      sites.push({ row, kind });
     }
   };

  function isImportBinding(node: Parser.SyntaxNode): boolean {
    let p = node.parent;
    while (p && p.type) {
      if (IMPORT_CONTEXT.has(p.type)) return true;
      p = p.parent;
      }
    return false;
    }

  function isParamBinding(node: Parser.SyntaxNode): boolean {
    let p = node.parent;
    while (p && p.type) {
      if (PARAM_CONTEXT.has(p.type)) return true;
      p = p.parent;
      }
    return false;
    }

  function walk(node: Parser.SyntaxNode) {
     // Declaration site: a symbol-kind node whose declared name matches.
    if (cfg.symbolKinds.includes(node.type)) {
      const nameNode =
        node.childForFieldName("name") ||
        node.children.find((c) => IDENTIFIER_TYPES.has(c.type));
      if (nameNode && nameNode.text === oldName) {
        push(node.startPosition.row + 1, node.type, node.startIndex);
        }
      }
     // An identifier that is not a declaration may still bind the name as an
     // import or as a parameter. Only one of those applies to a given node.
    const isIdent = node.type === "identifier" || node.type === "type_identifier";
    if (isIdent && node.text === oldName) {
      if (isImportBinding(node)) {
        push(node.startPosition.row + 1, "import", node.startIndex);
        return; // an import is a binding on its own; don't re-count as a param
        }
      if (isParamBinding(node)) {
        push(node.startPosition.row + 1, "parameter", node.startIndex);
        }
      }
    for (const child of node.children) walk(child);
    }

  walk(tree.rootNode);
  return sites;
}

function renameSymbolUnchecked(
  source: string,
  filePath: string,
  oldName: string,
  newName: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "rename-symbol", changes: 0, message: "Unsupported language", error: `Language not supported for file: ${filePath}` };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "rename-symbol", changes: 0, message: "Parser unavailable", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };

  const tree = parseSource(parser, source);
  let changes = 0;
  const edits: { start: number; end: number; text: string }[] = [];

   // #14 (B9): a file-wide rename is only safe when the name binds at most one
   // symbol in this file. Detect the bindings first; if there is more than one
   // (a shadow/local, a foreign import, or duplicate top-level declarations)
   // refuse and name the sites. The node-type filter below already spares
   // property keys, string literals, and comments.
  const cfg = configFor(lang);
  const bindingSites = cfg ? collectBindingSites(tree, oldName, cfg) : [];
  if (bindingSites.length > 1) {
    const where = bindingSites
       .map((s) => `   line ${s.row} (${s.kind})`)
       .join("\n");
    return {
      success: false,
      path: filePath,
      operation: "rename-symbol",
      changes: 0,
      message:
         `Symbol '${oldName}' binds ${bindingSites.length} distinct locations in this ` +
         `file (a shadow, a foreign import, or duplicate declarations); refusing a ` +
         `file-wide rename that would clobber an unintended binding. Disambiguate by ` +
         `scoping the rename or renaming each declaration separately:\n${where}`,
      errorCode: ErrorCode.AMBIGUOUS_SYMBOL,
      symbolFound: true,
      };
   }
  function findRefs(node: Parser.SyntaxNode) {
    if ((node.type === "identifier" || node.type === "type_identifier") && node.text === oldName) {
      edits.push({ start: node.startIndex, end: node.endIndex, text: newName });
      changes++;
    }
    for (const child of node.children) findRefs(child);
  }
  findRefs(tree.rootNode);

  if (changes === 0) return { success: false, path: filePath, operation: "rename-symbol", changes: 0, message: `Symbol '${oldName}' not found`, errorCode: ErrorCode.SYMBOL_NOT_FOUND };

  edits.sort((a, b) => b.start - a.start);
  let newSource = source;
  for (const e of edits) {
    newSource = newSource.slice(0, e.start) + e.text + newSource.slice(e.end);
  }
  return { success: true, path: filePath, operation: "rename-symbol", changes, message: `Renamed ${changes} occurrences of '${oldName}' to '${newName}'`, newSource };
}

function replaceBodyUnchecked(
  source: string,
  filePath: string,
  symbolName: string,
  newBody: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "replace-body", changes: 0, message: "Unsupported language", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };
  const cfg = configFor(lang);
  if (!cfg) return { success: false, path: filePath, operation: "replace-body", changes: 0, message: "Unsupported language", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "replace-body", changes: 0, message: "Parser unavailable", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };

  const tree = parseSource(parser, source);
  const edits: { start: number; end: number; text: string }[] = [];
  let changes = 0;

  function findAndReplace(node: Parser.SyntaxNode): boolean {
    if (cfg!.functionTypes.includes(node.type)) {
      const nameNode = node.childForFieldName("name");
      if (nameNode && nameNode.text === symbolName) {
        const bodyNode = node.childForFieldName("body");
        if (bodyNode) {
          // Indent of the line the signature starts on — the body's own closing
          // delimiter lines up with that, not with the body node's start column.
          const declLineStart = source.lastIndexOf("\n", node.startIndex) + 1;
          const outerIndent = source.slice(declLineStart, node.startIndex).match(/^\s*/)?.[0] ?? "";
          const indent = outerIndent + "  ";
          const indentedBody = newBody
            .split("\n")
            .map((l) => (l.length ? indent + l : l))
            .join("\n");

          // Brace-delimited bodies keep their braces. Replacing the whole body
          // node with bare statement text stripped them, producing
          // `function f(): string return x;` — which does not parse. The parse
          // gate now catches that, but the delimiters have to survive anyway.
          const open = bodyNode.firstChild;
          const close = bodyNode.lastChild;
          const braced = open?.text === "{" && close?.text === "}" && open !== close;
          if (braced) {
            edits.push({
              start: open!.endIndex,
              end: close!.startIndex,
              text: `\n${indentedBody}\n${outerIndent}`,
            });
          } else {
            // Indentation-delimited (Python): the block node is the body.
            edits.push({ start: bodyNode.startIndex, end: bodyNode.endIndex, text: indentedBody.trimStart() });
          }
          changes++;
          return true;
        }
      }
    }
    for (const child of node.children) {
      if (findAndReplace(child)) return true;
    }
    return false;
  }
  findAndReplace(tree.rootNode);

  if (changes === 0) return { success: false, path: filePath, operation: "replace-body", changes: 0, message: `Symbol '${symbolName}' not found or has no body`, errorCode: ErrorCode.SYMBOL_NOT_FOUND };

  edits.sort((a, b) => b.start - a.start);
  let newSource = source;
  for (const e of edits) {
    newSource = newSource.slice(0, e.start) + e.text + newSource.slice(e.end);
  }
  return { success: true, path: filePath, operation: "replace-body", changes, message: `Replaced body of '${symbolName}'`, newSource };
}

// ── Language-specific import config ────────────────────────────────────

/**
 * Optional function to determine where to insert inside a grouped import block
 * (e.g., inside Go's `import ( ... )`). If provided and returns non-null,
 * it takes precedence over the default append-after-last-import behavior.
 */
type GroupedInsertFn = (source: string, rootNode: Parser.SyntaxNode, newImportLine: string) => string | null;

interface ImportConfig {
  /** Node types that represent import/use statements */
  nodeTypes: string[];
  /** Template for new import text. {spec} is replaced with importSpec. */
  lineTemplate: string;
  /**
   * Optional function to transform the user-provided importSpec before
   * substituting into lineTemplate. Used for backward-compatible wrapping.
   */
  transformSpec?: (spec: string) => string;
  /**
   * Optional function to determine where to insert when no existing import
   * node is found. Receives the parsed tree root. Returns a source index
   * position (must be >= 0) or null to fall back to position 0.
   * Default: null (inserts at position 0).
   */
  fallbackInsert?: (rootNode: Parser.SyntaxNode) => number | null;
  /**
   * Optional function to insert into an existing grouped import block
   * (e.g., Go's `import ( ... )`). Returns the new source or null to
   * fall through to default append-after-last-import behavior.
   */
  groupedInsert?: GroupedInsertFn;
}

const IMPORT_CONFIGS: Record<string, ImportConfig> = {
  typescript: { nodeTypes: ["import_statement"], lineTemplate: "import {spec};\n" },
  tsx:        { nodeTypes: ["import_statement"], lineTemplate: "import {spec};\n" },
  javascript: { nodeTypes: ["import_statement"], lineTemplate: "import {spec};\n" },
  python: {
    nodeTypes: ["import_statement", "import_from_statement"],
    lineTemplate: "{spec}\n",
    transformSpec: (s: string) =>
      s.startsWith("import ") || s.startsWith("from ") ? s : "import " + s,
  },
  go: {
    nodeTypes: ["import_declaration"],
    lineTemplate: "import \"{spec}\"\n",
    fallbackInsert: (root) => {
      // Insert after package_clause when no imports exist
      function findPkg(n: Parser.SyntaxNode): number | null {
        if (n.type === "package_clause") return n.endIndex;
        for (let i = 0; i < n.childCount; i++) {
          const r = findPkg(n.child(i));
          if (r !== null) return r;
        }
        return null;
      }
      return findPkg(root);
    },
    // Insert into existing grouped import block (import ( ... )) rather than creating a new line
    groupedInsert: (source, root, newImportLine) => {
      // Find the last grouped import_declaration (has import_spec_list child)
      let grouped: Parser.SyntaxNode | null = null;
      function findLastGrouped(n: Parser.SyntaxNode) {
        if (n.type === "import_declaration") {
          for (let i = 0; i < n.childCount; i++) {
            if (n.child(i).type === "import_spec_list") {
              grouped = n;
              break;
            }
          }
        }
        for (let i = 0; i < n.childCount; i++) findLastGrouped(n.child(i));
      }
      findLastGrouped(root);
      if (!grouped) return null;

      // Find the import_spec_list and its closing paren
      for (let i = 0; i < grouped.childCount; i++) {
        if (grouped.child(i).type === "import_spec_list") {
          const specList = grouped.child(i);
          const closeParen = specList.child(specList.childCount - 1);
          if (closeParen && closeParen.type === ")") {
            // Extract just the package name from newImportLine: `import "X"` → `\t"X"\n`
            const specContent = newImportLine.replace(/^import\s+/, "").replace(/;\s*$/, "\n");
            const insertContent = "\t" + specContent;
            const insertAt = closeParen.startIndex;
            return source.slice(0, insertAt) + insertContent + source.slice(insertAt);
          }
        }
      }
      return null;
    },
  },
  rust: { nodeTypes: ["use_declaration"], lineTemplate: "use {spec};\n" },
};

/** The clause of a JS/TS import spec, split into the pieces a merge needs. */
interface JsImportSpecParts {
  module: string;
  /** Named bindings as written, e.g. `writeFileSync`, `a as b`. */
  named: string[];
  defaultName?: string;
  /** True for `import type { .. } from "m"`. Type and value imports never merge. */
  isType: boolean;
}

/** The local binding a named specifier introduces: `a as b` binds `b`. */
function jsLocalName(specifierText: string): string {
  const parts = specifierText.split(/\s+as\s+/);
  return (parts[parts.length - 1] ?? specifierText).trim();
}

/**
 * Parse a JS/TS importSpec (`{ a, b as c } from "mod"`, `def from "mod"`).
 * Returns null for forms with no merge semantics (namespace imports,
 * side-effect imports, anything without a `from` clause).
 */
function parseJsImportSpec(spec: string): JsImportSpecParts | null {
  const m = spec.trim().match(/^(.*?)\s+from\s+['"]([^'"]+)['"];?$/);
  if (!m) return null;
  let clause = m[1].trim();
  const module = m[2];
  let isType = false;
  if (/^type\s/.test(clause)) {
    isType = true;
    clause = clause.slice(4).trim();
  }
  if (clause.startsWith("*")) return null;

  const named: string[] = [];
  const namedMatch = clause.match(/\{([^}]*)\}/);
  if (namedMatch) {
    for (const part of namedMatch[1].split(",")) {
      const t = part.trim();
      if (t) named.push(t);
    }
  }
  const before = namedMatch ? clause.slice(0, namedMatch.index).replace(/,\s*$/, "").trim() : clause;
  if (before.startsWith("*")) return null;
  const defaultName = before.length > 0 ? before : undefined;
  if (named.length === 0 && !defaultName) return null;
  return { module, named, defaultName, isType };
}

/**
 * Merge a JS/TS import into an existing statement for the same module (#103).
 *
 * Returns null when there is nothing to merge into, so the caller falls through
 * to inserting a fresh statement. Previously every add-import inserted a new
 * statement, so an agent adding one name at a time accumulated one duplicate
 * `import ... from "node:fs"` per call while each call reported success.
 */
function addJsImportMerged(
  source: string,
  tree: Parser,
  filePath: string,
  importSpec: string
): ASTEditResult | null {
  const parts = parseJsImportSpec(importSpec);
  if (!parts) return null;

  let target: Parser.SyntaxNode | null = null;
  function findTarget(node: Parser.SyntaxNode) {
    if (target) return;
    if (node.type === "import_statement") {
      // `import type { .. }` erases its bindings at compile time, so merging a
      // value import into one would silently delete it from the output (#103).
      const stmtIsType = node.children.some((c) => c.type === "type");
      if (stmtIsType === parts!.isType) {
        for (const c of node.children) {
          if (c.type === "string" && unquoteLiteral(c.text) === parts!.module) {
            target = node;
            return;
          }
        }
      }
    }
    for (const child of node.children) findTarget(child);
  }
  findTarget(tree.rootNode);
  if (!target) return null;

  const clause = findChildByType(target, "import_clause");
  if (!clause) return null; // side-effect import: nothing to merge into

  let namedNode: Parser.SyntaxNode | null = null;
  let defaultNode: Parser.SyntaxNode | null = null;
  for (const c of clause.children) {
    if (c.type === "named_imports") namedNode = c;
    else if (c.type === "identifier") defaultNode = c;
    else if (c.type === "namespace_import") return null; // `import * as ns` has no merge form
  }

  const existing: string[] = [];
  if (namedNode) {
    for (const s of namedNode.children) {
      if (s.type === "import_specifier") existing.push(s.text.trim());
    }
  }
  const existingLocals = new Set(existing.map(jsLocalName));
  const fresh = parts.named.filter((n) => !existingLocals.has(jsLocalName(n)));
  const needDefault = parts.defaultName !== undefined && defaultNode === null;

  if (fresh.length === 0 && !needDefault) {
    return { success: false, path: filePath, operation: "add-import", changes: 0, message: `Import for '${importSpec}' already exists` };
  }

  const clauseParts: string[] = [];
  const defaultText = defaultNode ? defaultNode.text : needDefault ? parts.defaultName! : null;
  if (defaultText) clauseParts.push(defaultText);
  const allNamed = [...existing, ...fresh];
  if (allNamed.length > 0) clauseParts.push("{ " + allNamed.join(", ") + " }");

  const newSource =
    source.slice(0, clause.startIndex) + clauseParts.join(", ") + source.slice(clause.endIndex);

  return {
    success: true,
    path: filePath,
    operation: "add-import",
    changes: 1,
    message: `Added import: ${importSpec}`,
    newSource,
  };
}

/**
 * A JS import spec broken into the pieces a `require` call needs (#139).
 *
 * `single` covers both `import d from "m"` and `import * as d from "m"`: each
 * binds exactly one local name, and in CommonJS both resolve to the module
 * object. For a namespace import that is exact; for a default import it is the
 * usual `module.exports`-is-the-default interop convention.
 */
interface CjsSpecParts {
  module: string;
  /** `{ a, b as c }` bindings, kept in their source form. */
  named: string[];
  /** The single local name bound by a default or namespace import. */
  single?: string;
  isType: boolean;
}

/** Local name a `{ a }` / `{ a as b }` binding introduces. */
function cjsBindingLocal(binding: string): string {
  const m = binding.match(/\bas\s+([A-Za-z_$][\w$]*)\s*$/);
  return m ? m[1] : binding.trim();
}

/** `a as b` → `a: b`, the CommonJS destructuring spelling of a rename. */
function cjsBindingText(binding: string): string {
  const m = binding.trim().match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
  return m ? `${m[1]}: ${m[2]}` : binding.trim();
}

/**
 * Parse an import spec for the CommonJS emitter. Unlike `parseJsImportSpec`
 * this accepts `* as ns`, because a namespace import has a direct `require`
 * form even though it has no ESM merge form.
 */
function parseCjsImportSpec(spec: string): CjsSpecParts | null {
  const m = spec.trim().match(/^(.*?)\s+from\s+['"]([^'"]+)['"];?$/);
  if (!m) return null;
  let clause = m[1].trim();
  const module = m[2];
  let isType = false;
  if (/^type\s/.test(clause)) {
    isType = true;
    clause = clause.slice(4).trim();
  }

  const named: string[] = [];
  const namedMatch = clause.match(/\{([^}]*)\}/);
  if (namedMatch) {
    for (const part of namedMatch[1].split(",")) {
      const t = part.trim();
      if (t) named.push(t);
    }
  }
  const before = namedMatch ? clause.slice(0, namedMatch.index).replace(/,\s*$/, "").trim() : clause;

  let single: string | undefined;
  if (before.length > 0) {
    const ns = before.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (ns) single = ns[1];
    else if (/^[A-Za-z_$][\w$]*$/.test(before)) single = before;
    else return null;
  }

  if (named.length === 0 && single === undefined) return null;
  return { module, named, single, isType };
}

/** The `const ... = require("m");` line for a parsed spec. */
function cjsRequireLine(parts: CjsSpecParts): string {
  const binding =
    parts.single !== undefined
      ? parts.single
      : "{ " + parts.named.map(cjsBindingText).join(", ") + " }";
  return `const ${binding} = require("${parts.module}");\n`;
}

/** A `const x = require("m")` / `const { x } = require("m")` declaration. */
interface CjsRequireDecl {
  /** The whole declaration statement, including its semicolon. */
  node: Parser.SyntaxNode;
  module: string;
  /** `object_pattern` for a destructured require, `identifier` for a whole-module one. */
  pattern: Parser.SyntaxNode;
}

/** The module string of a `require("m")` call expression, or null. */
function requireCallModule(node: Parser.SyntaxNode | null): string | null {
  if (!node || node.type !== "call_expression") return null;
  const fn = node.child(0);
  if (!fn || fn.type !== "identifier" || fn.text !== "require") return null;
  const args = findChildByType(node, "arguments");
  if (!args) return null;
  const strings = args.children.filter((c) => c.type === "string");
  if (strings.length !== 1) return null;
  return unquoteLiteral(strings[0].text);
}

function collectRequireDecls(root: Parser.SyntaxNode): CjsRequireDecl[] {
  const found: CjsRequireDecl[] = [];
  function walk(node: Parser.SyntaxNode) {
    if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
      const declarators = node.children.filter((c) => c.type === "variable_declarator");
      // `const a = require("x"), b = require("y")` shares one statement, so
      // editing it by statement would take both bindings out. Leave those alone.
      if (declarators.length === 1) {
        const d = declarators[0];
        const pattern = d.child(0);
        const value = d.childForFieldName ? d.childForFieldName("value") : null;
        const module = requireCallModule(value ?? d.children[d.children.length - 1] ?? null);
        if (module !== null && pattern && (pattern.type === "object_pattern" || pattern.type === "identifier")) {
          found.push({ node, module, pattern });
          return;
        }
      }
    }
    for (const child of node.children) walk(child);
  }
  walk(root);
  return found;
}

/** Bindings inside a `const { a, b: c } = require(...)` pattern. */
function cjsPatternEntries(pattern: Parser.SyntaxNode): { node: Parser.SyntaxNode; names: string[] }[] {
  const entries: { node: Parser.SyntaxNode; names: string[] }[] = [];
  for (const c of pattern.children) {
    if (c.type === "shorthand_property_identifier_pattern") {
      entries.push({ node: c, names: [c.text] });
    } else if (c.type === "pair_pattern") {
      const names = c.children.filter((n) => n.type !== ":").map((n) => n.text);
      entries.push({ node: c, names });
    }
  }
  return entries;
}

function moduleSystemRefusal(
  filePath: string,
  operation: string,
  message: string,
  recovery: string
): ASTEditResult {
  return {
    success: false,
    path: filePath,
    operation,
    changes: 0,
    message,
    errorCode: ErrorCode.MODULE_SYSTEM_MISMATCH,
    recovery,
  };
}

/**
 * Add an import to a CommonJS JavaScript file as a `require` declaration (#139).
 *
 * Emitting the ESM form here is the one outcome that must not happen: it parses,
 * so the validity gate passes it, and the file then fails to load at runtime.
 */
function addCjsImport(
  source: string,
  tree: Parser,
  filePath: string,
  importSpec: string
): ASTEditResult {
  const parts = parseCjsImportSpec(importSpec);
  if (!parts) {
    return {
      success: false,
      path: filePath,
      operation: "add-import",
      changes: 0,
      message: `Could not read '${importSpec}' as an import clause`,
      errorCode: ErrorCode.INVALID_ARGUMENT,
      recovery:
        'Pass a full import clause, e.g. \'{ join } from "path"\', \'path from "path"\', or \'* as path from "path"\'.',
    };
  }
  if (parts.isType) {
    return moduleSystemRefusal(
      filePath,
      "add-import",
      `'${importSpec}' is a type-only import, which has no CommonJS form`,
      "Type-only imports are erased at compile time; drop the `type` keyword, or make the edit in a TypeScript file.",
    );
  }
  if (parts.single !== undefined && parts.named.length > 0) {
    return moduleSystemRefusal(
      filePath,
      "add-import",
      `'${importSpec}' combines a default and named bindings, which has no single CommonJS declaration`,
      `Add them in two calls: '${parts.single} from "${parts.module}"' and '{ ${parts.named.join(", ")} } from "${parts.module}"'.`,
    );
  }

  const decls = collectRequireDecls(tree.rootNode);
  const sameModule = decls.filter((d) => d.module === parts.module);

  // Merge into an existing destructured require for the same module, mirroring
  // the ESM merge (#103) so repeated one-name-at-a-time calls do not accumulate
  // a duplicate declaration per call.
  if (parts.single === undefined) {
    const mergeTarget = sameModule.find((d) => d.pattern.type === "object_pattern");
    if (mergeTarget) {
      const existing = cjsPatternEntries(mergeTarget.pattern);
      const existingLocals = new Set(existing.map((e) => cjsBindingLocal(e.node.text)));
      const fresh = parts.named.filter((n) => !existingLocals.has(cjsBindingLocal(n)));
      if (fresh.length === 0) {
        return { success: false, path: filePath, operation: "add-import", changes: 0, message: `Import for '${importSpec}' already exists` };
      }
      const all = [...existing.map((e) => e.node.text), ...fresh.map(cjsBindingText)];
      const newSource =
        source.slice(0, mergeTarget.pattern.startIndex) +
        "{ " + all.join(", ") + " }" +
        source.slice(mergeTarget.pattern.endIndex);
      return { success: true, path: filePath, operation: "add-import", changes: 1, message: `Added import: ${importSpec}`, newSource };
    }
  } else {
    const already = sameModule.find((d) => d.pattern.type === "identifier" && d.pattern.text === parts.single);
    if (already) {
      return { success: false, path: filePath, operation: "add-import", changes: 0, message: `Import for '${importSpec}' already exists` };
    }
  }

  const line = cjsRequireLine(parts);

  // Anchor: after the last existing require declaration, else after any shebang
  // and leading comments, so the declaration lands with the other imports rather
  // than above the file's header.
  let insertAt: number;
  if (decls.length > 0) {
    const lastEnd = Math.max(...decls.map((d) => d.node.endIndex));
    insertAt = lastEnd;
    if (source[insertAt] === "\r") insertAt++;
    if (source[insertAt] === "\n") insertAt++;
    return {
      success: true,
      path: filePath,
      operation: "add-import",
      changes: 1,
      message: `Added import: ${importSpec}`,
      newSource: source.slice(0, insertAt) + line + source.slice(insertAt),
    };
  }

  insertAt = 0;
  for (const child of tree.rootNode.children) {
    if (child.type === "hash_bang_line" || child.type === "comment") {
      insertAt = child.endIndex;
      continue;
    }
    break;
  }
  if (insertAt === 0) {
    return {
      success: true,
      path: filePath,
      operation: "add-import",
      changes: 1,
      message: `Added import: ${importSpec}`,
      newSource: line + source,
    };
  }
  if (source[insertAt] === "\r") insertAt++;
  if (source[insertAt] === "\n") insertAt++;
  return {
    success: true,
    path: filePath,
    operation: "add-import",
    changes: 1,
    message: `Added import: ${importSpec}`,
    newSource: source.slice(0, insertAt) + line + source.slice(insertAt),
  };
}

/**
 * Remove a `require` declaration, or one binding out of a destructured one
 * (#139). Returns a failure the caller may ignore when nothing matched, so a
 * file holding both `require` and `import` still gets the ESM pass.
 */
function removeCjsImport(
  source: string,
  tree: Parser,
  filePath: string,
  importSpec: string
): ASTEditResult {
  const form = parseImportSpecForm(importSpec);
  const wantModule = form.module;
  const wantName = form.name ?? (wantModule ? undefined : importSpec.trim());

  const decls = collectRequireDecls(tree.rootNode).filter(
    (d) => wantModule === undefined || d.module === wantModule
  );

  const edits: { start: number; end: number; replace?: string }[] = [];
  let changes = 0;

  for (const decl of decls) {
    if (wantName === undefined) {
      edits.push({ start: decl.node.startIndex, end: decl.node.endIndex });
      changes++;
      continue;
    }
    if (decl.pattern.type === "identifier") {
      if (decl.pattern.text === wantName || (wantModule === undefined && decl.module === wantName)) {
        edits.push({ start: decl.node.startIndex, end: decl.node.endIndex });
        changes++;
      }
      continue;
    }
    const entries = cjsPatternEntries(decl.pattern);
    const matched = entries.filter((e) => e.names.includes(wantName));
    if (matched.length === 0) {
      // A bare spec may name the module rather than a binding.
      if (wantModule === undefined && decl.module === wantName) {
        edits.push({ start: decl.node.startIndex, end: decl.node.endIndex });
        changes++;
      }
      continue;
    }
    const keep = entries.filter((e) => !matched.includes(e));
    if (keep.length === 0) {
      edits.push({ start: decl.node.startIndex, end: decl.node.endIndex });
    } else {
      edits.push({
        start: decl.pattern.startIndex,
        end: decl.pattern.endIndex,
        replace: "{ " + keep.map((e) => e.node.text).join(", ") + " }",
      });
    }
    changes += matched.length;
  }

  if (edits.length === 0) {
    return { success: false, path: filePath, operation: "remove-import", changes: 0, message: `No import for '${importSpec}' found` };
  }

  edits.sort((a, b) => b.start - a.start);
  let newSource = source;
  for (const e of edits) {
    if (e.replace !== undefined) {
      newSource = newSource.slice(0, e.start) + e.replace + newSource.slice(e.end);
    } else {
      // Exactly one line ending, never a run of them: `add-import` inserts one
      // line, so consuming every following newline would swallow the blank line
      // separating the requires from the code and break the round-trip.
      let end = e.end;
      if (newSource[end] === "\r") end++;
      if (newSource[end] === "\n") end++;
      newSource = newSource.slice(0, e.start) + newSource.slice(end);
    }
  }

  return { success: true, path: filePath, operation: "remove-import", changes, message: `Removed ${changes} import(s) for '${importSpec}'`, newSource };
}

function addImportUnchecked(
  source: string,
  filePath: string,
  importSpec: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "add-import", changes: 0, message: "Unsupported language", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };
  const icfg = IMPORT_CONFIGS[lang];
  if (!icfg) return { success: false, path: filePath, operation: "add-import", changes: 0, message: "Unsupported language", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "add-import", changes: 0, message: "Parser unavailable", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };

  const tree = parseSource(parser, source);

  // JavaScript has two module systems and only one of them takes `import`.
  // tree-sitter parses either, so the validity gate cannot tell them apart —
  // the module system has to be established before any syntax is chosen (#139).
  if (lang === "javascript") {
    const verdict = detectModuleSystem(filePath, source);
    if (verdict.system === null) {
      return moduleSystemRefusal(
        filePath,
        "add-import",
        `Cannot tell whether ${filePath} is ESM or CommonJS: ${verdict.detail}`,
        'Rename the file to .mjs or .cjs, or set "type" in the nearest package.json, then retry.',
      );
    }
    if (verdict.system === "cjs") return addCjsImport(source, tree, filePath, importSpec);
  }

  // JS/TS merge into an existing import of the same module, which also covers
  // the duplicate check for that module (#103).
  if (lang === "typescript" || lang === "tsx" || lang === "javascript") {
    const merged = addJsImportMerged(source, tree, filePath, importSpec);
    if (merged) return merged;
  }

  // Dedup check: search source for existing import containing the spec text
  const dedupPattern = new RegExp(`(import|from|use).*${escapeRegex(importSpec)}`);
  if (dedupPattern.test(source)) {
    return { success: false, path: filePath, operation: "add-import", changes: 0, message: `Import for '${importSpec}' already exists` };
  }

  let lastImportEnd = 0;
  function findLastImport(node: Parser.SyntaxNode) {
    if (icfg!.nodeTypes.includes(node.type)) lastImportEnd = Math.max(lastImportEnd, node.endIndex);
    for (const child of node.children) findLastImport(child);
  }
  findLastImport(tree.rootNode);

  const resolvedSpec = icfg.transformSpec ? icfg.transformSpec(importSpec) : importSpec;
  const newImportLine = icfg.lineTemplate.replace("{spec}", resolvedSpec);

  // Python from-import merging: if `from X import Y`, merge into existing statement for module X
  if (lang === "python" && importSpec.startsWith("from ")) {
    const parsed = parsePythonFromImport(importSpec, source, tree);
    if (parsed) {
      return parsed;
    }
  }

  let newSource: string;
  if (lastImportEnd > 0) {
    // Try grouped insert first (e.g., Go import ( ... ) blocks), then fall back to appending after last import
    const groupedResult = icfg.groupedInsert?.(source, tree.rootNode, newImportLine) ?? null;
    if (groupedResult !== null) {
      newSource = groupedResult;
    } else {
      // Insert on the line right after the last import: consume exactly one
      // newline, never the blank line that separates the import block from the
      // code below it (#103).
      let insertPos = lastImportEnd;
      if (source[insertPos] === "\r") insertPos++;
      // No newline after the last import (EOF without a trailing newline): open
      // one, otherwise the two statements would be glued onto the same line.
      const prefix = source[insertPos] === "\n" ? (insertPos++, "") : "\n";
      newSource = source.slice(0, insertPos) + prefix + newImportLine + source.slice(insertPos);
    }
  } else if (icfg.fallbackInsert) {
    const pos = icfg.fallbackInsert(tree.rootNode);
    if (pos !== null && pos > 0) {
      // Insert after package_clause (or similar anchor), ensuring a blank line before code
      const restAfterPos = source.slice(pos);
      newSource = source.slice(0, pos) + "\n\n" + newImportLine + restAfterPos.replace(/^\n+/, "");
    } else {
      newSource = newImportLine + source;
    }
  } else {
    newSource = newImportLine + source;
  }
  return { success: true, path: filePath, operation: "add-import", changes: 1, message: `Added import: ${importSpec}`, newSource };
}

function removeImportUnchecked(
  source: string,
  filePath: string,
  importSpec: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) {
    return { success: false, path: filePath, operation: "remove-import", changes: 0, message: "Unsupported language", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };
  }
  const parser = getParser(lang);
  if (!parser) {
    return { success: false, path: filePath, operation: "remove-import", changes: 0, message: "Parser unavailable", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };
  }
  const tree = parseSource(parser, source);
  const icfg = IMPORT_CONFIGS[lang];

  // --- Rust grouped-use: separate code path for surgical removal ---
  if (lang === "rust") {
    return removeRustImport(source, tree, filePath, importSpec);
  }

  // A CommonJS `require` declaration is not an `import_statement`, so the
  // generic model never sees it. Try it first for JavaScript and fall through
  // when nothing matched, which keeps mixed files working (#139).
  if (lang === "javascript") {
    const cjs = removeCjsImport(source, tree, filePath, importSpec);
    if (cjs.success) return cjs;
  }

  // --- Other languages: binding-level surgical removal (#102) ---
  return removeImportGeneric(source, tree, filePath, importSpec, lang);
}

/** One removable binding inside an import statement. */
interface ImportItem {
  node: Parser.SyntaxNode;
  /** Every token that may legitimately select this binding. */
  names: string[];
}

/** An import statement reduced to the pieces remove-import can act on. */
interface ImportModel {
  node: Parser.SyntaxNode;
  /** Module identifiers that select the whole statement. */
  modules: string[];
  items: ImportItem[];
  /**
   * Rewrite the statement so only `keep` survives. Returns null when nothing
   * survives, which means the caller should delete the whole statement.
   */
  rewrite: (keep: ImportItem[]) => { start: number; end: number; replace: string } | null;
}

/** Strip surrounding quotes from a string literal's source text. */
function unquoteLiteral(text: string): string {
  return text.replace(/^['"`]|['"`]$/g, "");
}

/**
 * Split an importSpec into an optional binding name and optional module.
 * Accepts the bare form (`statSync`, `node:fs`) and the documented full forms
 * (`{ statSync } from "node:fs"`, `statSync from "node:fs"`,
 * `from node:fs import statSync`). #102: the full form used to fail outright
 * because it was matched as a literal substring.
 */
function parseImportSpecForm(spec: string): { name?: string; module?: string } {
  const trimmed = spec.trim();
  const jsForm = trimmed.match(/^\{?\s*([A-Za-z_$][\w$]*)\s*\}?\s+from\s+['"]([^'"]+)['"]$/);
  if (jsForm) return { name: jsForm[1], module: jsForm[2] };
  const pyForm = trimmed.match(/^from\s+([\w.]+)\s+import\s+([\w.]+)$/);
  if (pyForm) return { name: pyForm[2], module: pyForm[1] };
  const pyPlain = trimmed.match(/^import\s+([\w.]+)$/);
  if (pyPlain) return { name: pyPlain[1] };
  return {};
}

/** Names that select a TS/JS import specifier: the imported name and its alias. */
function tsSpecifierNames(spec: Parser.SyntaxNode): string[] {
  const names: string[] = [];
  for (const c of spec.children) {
    if (c.type === "identifier" || c.type === "type_identifier") names.push(c.text);
  }
  return names.length > 0 ? names : [spec.text.trim()];
}

function buildTsImportModel(node: Parser.SyntaxNode): ImportModel {
  const clause = findChildByType(node, "import_clause");
  const modules: string[] = [];
  for (const c of node.children) {
    if (c.type === "string") modules.push(unquoteLiteral(c.text));
  }

  let defaultItem: ImportItem | null = null;
  let nsItem: ImportItem | null = null;
  const named: ImportItem[] = [];
  if (clause) {
    for (const c of clause.children) {
      if (c.type === "identifier") {
        defaultItem = { node: c, names: [c.text] };
      } else if (c.type === "namespace_import") {
        const id = findLastIdentifier(c);
        nsItem = { node: c, names: id ? [id.text] : [] };
      } else if (c.type === "named_imports") {
        for (const s of c.children) {
          if (s.type === "import_specifier") named.push({ node: s, names: tsSpecifierNames(s) });
        }
      }
    }
  }

  const items = [defaultItem, nsItem, ...named].filter((i): i is ImportItem => i !== null);

  return {
    node,
    modules,
    items,
    rewrite(keep) {
      if (!clause) return null;
      const parts: string[] = [];
      if (defaultItem && keep.includes(defaultItem)) parts.push(defaultItem.node.text);
      if (nsItem && keep.includes(nsItem)) {
        parts.push(nsItem.node.text);
      } else {
        const keptNamed = named.filter((n) => keep.includes(n));
        if (keptNamed.length > 0) parts.push("{ " + keptNamed.map((n) => n.node.text).join(", ") + " }");
      }
      if (parts.length === 0) return null;
      return { start: clause.startIndex, end: clause.endIndex, replace: parts.join(", ") };
    },
  };
}

/** Names that select a Python imported item: full dotted path, last segment, alias. */
function pyItemNames(item: Parser.SyntaxNode): string[] {
  const names = new Set<string>();
  const add = (t: string) => {
    names.add(t);
    const last = t.split(".").pop();
    if (last) names.add(last);
  };
  if (item.type === "aliased_import") {
    for (const c of item.children) if (c.type !== "as") add(c.text);
  } else {
    add(item.text);
  }
  return [...names];
}

function buildPyImportModel(node: Parser.SyntaxNode): ImportModel {
  const isFrom = node.type === "import_from_statement";
  const modules: string[] = [];
  const itemNodes: Parser.SyntaxNode[] = [];
  let seenImportKeyword = !isFrom;

  for (const c of node.children) {
    if (c.type === "import" || c.text === "import") {
      seenImportKeyword = true;
      continue;
    }
    if (c.type === "from" || c.type === "," || c.type === "(" || c.type === ")") continue;
    if (!seenImportKeyword) {
      modules.push(c.text);
      continue;
    }
    if (c.type === "wildcard_import") continue;
    itemNodes.push(c);
  }

  const items = itemNodes.map((n) => ({ node: n, names: pyItemNames(n) }));

  return {
    node,
    modules,
    items,
    rewrite(keep) {
      const kept = items.filter((i) => keep.includes(i));
      if (kept.length === 0 || itemNodes.length === 0) return null;
      return {
        start: itemNodes[0].startIndex,
        end: itemNodes[itemNodes.length - 1].endIndex,
        replace: kept.map((i) => i.node.text).join(", "),
      };
    },
  };
}

/** Names that select a Go import spec: full path, last path segment, alias. */
function goSpecNames(spec: Parser.SyntaxNode): string[] {
  const names = new Set<string>();
  for (const c of spec.children) {
    if (c.type === "interpreted_string_literal" || c.type === "raw_string_literal") {
      const path = unquoteLiteral(c.text);
      names.add(path);
      const last = path.split("/").pop();
      if (last) names.add(last);
    } else if (c.type === "package_identifier" || c.type === "identifier" || c.type === "dot" || c.type === "blank_identifier") {
      names.add(c.text);
    }
  }
  if (names.size === 0) {
    const path = unquoteLiteral(spec.text);
    names.add(path);
    const last = path.split("/").pop();
    if (last) names.add(last);
  }
  return [...names];
}

function buildGoImportModel(node: Parser.SyntaxNode): ImportModel {
  const specList = findChildByType(node, "import_spec_list");
  const specNodes: Parser.SyntaxNode[] = [];
  const container = specList ?? node;
  for (const c of container.children) {
    if (c.type === "import_spec") specNodes.push(c);
    else if (!specList && (c.type === "interpreted_string_literal" || c.type === "raw_string_literal")) specNodes.push(c);
  }

  const items = specNodes.map((n) => ({ node: n, names: goSpecNames(n) }));

  return {
    node,
    modules: [],
    items,
    rewrite(keep) {
      const kept = items.filter((i) => keep.includes(i));
      if (kept.length === 0 || specNodes.length === 0) return null;
      return {
        start: specNodes[0].startIndex,
        end: specNodes[specNodes.length - 1].endIndex,
        replace: kept.map((i) => i.node.text).join("\n\t"),
      };
    },
  };
}

function buildImportModel(node: Parser.SyntaxNode, lang: string): ImportModel | null {
  if (lang === "typescript" || lang === "tsx" || lang === "javascript") {
    return node.type === "import_statement" ? buildTsImportModel(node) : null;
  }
  if (lang === "python") {
    return node.type === "import_statement" || node.type === "import_from_statement" ? buildPyImportModel(node) : null;
  }
  if (lang === "go") {
    return node.type === "import_declaration" ? buildGoImportModel(node) : null;
  }
  return null;
}

/**
 * Binding-level remove-import for TS/TSX/JS/Python/Go (#102).
 *
 * The old implementation deleted any import statement whose text *contained*
 * importSpec, so removing `statSync` from
 * `import { readFileSync, writeFileSync, statSync } from "node:fs"` silently
 * deleted all three bindings, and `"fs"` matched `from "node:fs"`. Matching is
 * now against parsed binding tokens: a name that is one of several bindings is
 * removed from the clause, and the statement is deleted only when nothing
 * survives it.
 */
function removeImportGeneric(
  source: string,
  tree: Parser,
  filePath: string,
  importSpec: string,
  lang: string
): ASTEditResult {
  const icfg = IMPORT_CONFIGS[lang];
  const form = parseImportSpecForm(importSpec);
  const wantModule = form.module;
  const wantName = form.name ?? (wantModule ? undefined : importSpec.trim());

  const models: ImportModel[] = [];
  function collect(node: Parser.SyntaxNode) {
    if (icfg && icfg.nodeTypes.includes(node.type)) {
      const model = buildImportModel(node, lang);
      if (model) {
        models.push(model);
        return;
      }
    }
    for (const child of node.children) collect(child);
  }
  collect(tree.rootNode);

  const edits: { start: number; end: number; replace?: string }[] = [];
  let changeCount = 0;

  for (const model of models) {
    if (wantModule !== undefined && !model.modules.includes(wantModule)) continue;

    if (wantName === undefined) {
      // Module-only spec: the whole statement goes.
      edits.push({ start: model.node.startIndex, end: model.node.endIndex });
      changeCount++;
      continue;
    }

    const matched = model.items.filter((i) => i.names.includes(wantName));
    if (matched.length === 0) {
      // A bare spec may name the module rather than a binding.
      if (wantModule === undefined && model.modules.includes(wantName)) {
        edits.push({ start: model.node.startIndex, end: model.node.endIndex });
        changeCount++;
      }
      continue;
    }

    const keep = model.items.filter((i) => !matched.includes(i));
    const rewrite = keep.length > 0 ? model.rewrite(keep) : null;
    if (rewrite) {
      edits.push(rewrite);
    } else {
      edits.push({ start: model.node.startIndex, end: model.node.endIndex });
    }
    changeCount += matched.length;
  }

  if (edits.length === 0) {
    return { success: false, path: filePath, operation: "remove-import", changes: 0, message: `No import for '${importSpec}' found` };
  }

  edits.sort((a, b) => b.start - a.start);
  let newSource = source;
  for (const e of edits) {
    if (e.replace !== undefined) {
      newSource = newSource.slice(0, e.start) + e.replace + newSource.slice(e.end);
    } else {
      let end = e.end;
      while (end < newSource.length && newSource[end] === "\n") end++;
      newSource = newSource.slice(0, e.start) + newSource.slice(end);
    }
  }

  return { success: true, path: filePath, operation: "remove-import", changes: changeCount, message: `Removed ${changeCount} import(s) for '${importSpec}'`, newSource };
}

/**
 * Rust-specific remove-import using precise AST matching for both
 * simple (use X; or use X::Y;) and grouped (use X::{A, B, C}) declarations.
 */
function removeRustImport(source: string, tree: Parser, filePath: string, importSpec: string): ASTEditResult {
  const changes: { start: number; end: number; replace?: string }[] = [];
  let changeCount = 0;

  function walk(node: Parser.SyntaxNode) {
    if (node.type !== "use_declaration") {
      for (let i = 0; i < node.childCount; i++) walk(node.child(i));
      return;
    }

    // Check if this use_declaration has a grouped use_list
    const scopeList = findChildByType(node, "scoped_use_list");
    if (scopeList) {
      const useList = findChildByType(scopeList, "use_list");
      if (useList) {
        // Grouped: `use X::{A, B, C}`
        const matched = findUseListMatches(useList, importSpec);
        if (matched.length === 0) return;

        const nonMatched = getUseListItems(useList).filter((it) => !matched.has(it));
        changeCount += matched.size;

        if (nonMatched.length === 0) {
          // Remove entire use_declaration
          changes.push({ start: node.startIndex, end: node.endIndex });
        } else if (nonMatched.length === 1) {
          // Simplify `use X::{Y}` → `use X::Y`
          const pathBeforeBraces = source.slice(scopeList.startIndex, useList.startIndex);
          const pathStr = pathBeforeBraces.replace(/::\s*$/, "").trim();
          const replacement = `use ${pathStr}::${nonMatched[0].text};`;
          changes.push({ start: node.startIndex, end: node.endIndex, replace: replacement });
        } else {
          // Replace inner content of use_list
          const itemTexts = nonMatched.map((it) => it.text);
          const newInner = " " + itemTexts.join(", ") + " ";
          changes.push({ start: useList.startIndex + 1, end: useList.endIndex - 1, replace: newInner });
        }
        return;
      }
    }

    // Simple use declaration: match by last path segment
    if (rustUseMatchesSimple(node, importSpec)) {
      changes.push({ start: node.startIndex, end: node.endIndex });
      changeCount++;
    }
  }

  walk(tree.rootNode);

  if (changes.length === 0 || changeCount === 0) {
    return { success: false, path: filePath, operation: "remove-import", changes: 0, message: `No import for '${importSpec}' found` };
  }

  // Apply changes in reverse index order
  changes.sort((a, b) => b.start - a.start);
  let newSource = source;
  for (const c of changes) {
    if (c.replace !== undefined) {
      newSource = newSource.slice(0, c.start) + c.replace + newSource.slice(c.end);
    } else {
      let end = c.end;
      while (end < newSource.length && newSource[end] === "\n") end++;
      newSource = newSource.slice(0, c.start) + newSource.slice(end);
    }
  }

  return { success: true, path: filePath, operation: "remove-import", changes: changeCount, message: `Removed ${changeCount} import(s) for '${importSpec}'`, newSource };
}

/** Find first child with the given type */
function findChildByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).type === type) return node.child(i);
  }
  return null;
}

/** Get usable items from a use_list (excluding braces and commas) */
function getUseListItems(useList: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const items: Parser.SyntaxNode[] = [];
  for (let i = 0; i < useList.childCount; i++) {
    const c = useList.child(i);
    if (c.type !== "{" && c.type !== "}" && c.type !== ",") items.push(c);
  }
  return items;
}

/** Find items in a Rust use_list that match importSpec exactly */
function findUseListMatches(useList: Parser.SyntaxNode, importSpec: string): Set<Parser.SyntaxNode> {
  const matched = new Set<Parser.SyntaxNode>();
  for (const item of getUseListItems(useList)) {
    // Direct match: identifier, self, super, crate
    if ((item.type === "identifier" || item.type === "self" || item.type === "super" || item.type === "crate") && item.text === importSpec) {
      matched.add(item);
    }
    // Scoped identifier match by last segment: `B::C` matches "C"
    if (item.type === "scoped_identifier") {
      const last = findLastIdentifier(item);
      if (last && last.text === importSpec) matched.add(item);
    }
  }
  return matched;
}

/** Check if a simple (non-grouped) Rust use_declaration matches importSpec via last path segment */
function rustUseMatchesSimple(node: Parser.SyntaxNode, importSpec: string): boolean {
  for (let ci = 0; ci < node.childCount; ci++) {
    const child = node.child(ci);
    if (child.type === "identifier" && child.text === importSpec) return true;
    if (child.type === "scoped_identifier" && lastSegmentMatches(child, importSpec)) return true;
    if (child.type === "scoped_use_list" && lastSegmentMatches(child, importSpec)) return true;
  }
  return false;
}

/** Walk a scoped path and check if the rightmost segment equals importSpec */
function lastSegmentMatches(node: Parser.SyntaxNode, importSpec: string): boolean {
  for (let i = node.childCount - 1; i >= 0; i--) {
    const child = node.child(i);
    if (child.type === "identifier") return child.text === importSpec;
    if (child.type === "scoped_identifier") return lastSegmentMatches(child, importSpec);
  }
  return false;
}

/** Find the last identifier in a scoped_identifier tree */
function findLastIdentifier(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  for (let i = node.childCount - 1; i >= 0; i--) {
    const child = node.child(i);
    if (child.type === "identifier") return child;
    const found = findLastIdentifier(child);
    if (found) return found;
  }
  return null;
}

/**
 * Statement- and declaration-level node types that may anchor an insertion (#38).
 *
 * `insert-before`/`insert-after` used to match any node carrying a `name` field.
 * In tree-sitter grammars that includes function parameters, import specifiers,
 * object properties and type parameters, so inserting relative to a name that
 * also appears as a parameter spliced a whole statement into the middle of a
 * parameter list — and reported success.
 */
const INSERT_ANCHOR_TYPES: Record<string, Set<string>> = {
  typescript: new Set([
    "function_declaration", "generator_function_declaration", "class_declaration",
    "abstract_class_declaration", "interface_declaration", "type_alias_declaration",
    "enum_declaration", "internal_module", "module", "method_definition",
    "public_field_definition", "variable_declarator",
  ]),
  python: new Set(["function_definition", "class_definition"]),
  go: new Set([
    "function_declaration", "method_declaration", "type_spec", "const_spec", "var_spec",
  ]),
  rust: new Set([
    "function_item", "struct_item", "enum_item", "trait_item", "mod_item",
    "const_item", "static_item", "type_item", "union_item",
  ]),
};

/**
 * Nodes that name a declaration but are not themselves the statement: anchoring
 * on them would insert inside `const a = 1, b = 2;` rather than around it.
 */
const ANCHOR_PROMOTIONS: Record<string, string[]> = {
  variable_declarator: ["lexical_declaration", "variable_declaration"],
  type_spec: ["type_declaration"],
  const_spec: ["const_declaration"],
  var_spec: ["var_declaration"],
  function_definition: ["decorated_definition"],
  class_definition: ["decorated_definition"],
};

function anchorTypesFor(lang: string): Set<string> {
  return INSERT_ANCHOR_TYPES[lang] ?? INSERT_ANCHOR_TYPES.typescript;
}

/** Walk up from a named node to the statement that should carry the insertion. */
function promoteAnchor(node: Parser.SyntaxNode): Parser.SyntaxNode {
  const wanted = ANCHOR_PROMOTIONS[node.type];
  if (!wanted) return node;
  let cur = node.parent;
  for (let hops = 0; cur && hops < 3; hops++, cur = cur.parent) {
    if (wanted.includes(cur.type)) return cur;
  }
  return node;
}

interface AnchorLookup {
  node?: Parser.SyntaxNode;
  /** Nodes carrying the name that are not legal anchors, for the refusal message. */
  rejected: Parser.SyntaxNode[];
  /** Legal anchors; more than one means ambiguous. */
  candidates: Parser.SyntaxNode[];
}

function findInsertAnchor(tree: Parser.Tree, lang: string, symbolName: string): AnchorLookup {
  const allowed = anchorTypesFor(lang);
  const candidates: Parser.SyntaxNode[] = [];
  const rejected: Parser.SyntaxNode[] = [];

  function walk(node: Parser.SyntaxNode) {
    const nameNode = node.childForFieldName("name");
    if (nameNode && nameNode.text === symbolName) {
      if (allowed.has(node.type)) candidates.push(promoteAnchor(node));
      else rejected.push(node);
    }
    for (const child of node.children) walk(child);
  }
  walk(tree.rootNode);

  // Promotion can map two declarators onto the same statement.
  const seen = new Set<number>();
  const unique = candidates.filter((c) => (seen.has(c.startIndex) ? false : (seen.add(c.startIndex), true)));
  return unique.length === 1
    ? { node: unique[0], rejected, candidates: unique }
    : { rejected, candidates: unique };
}

/** 1-based line number of a byte offset, for refusal messages. */
function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

/** Leading whitespace of the line containing `index`. */
function indentAt(source: string, index: number): string {
  const lineStart = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  return source.slice(lineStart).match(/^[ \t]*/)![0];
}

/**
 * Re-indent inserted content to the anchor's own indentation, preserving the
 * content's internal relative structure. The previous insert-after computed an
 * indent string that was always empty, so every insertion landed at column 0.
 */
function reindent(content: string, indent: string): string {
  const lines = content.replace(/\n+$/, "").split("\n");
  const base = lines
    .filter((l) => l.trim().length > 0)
    .reduce((min, l) => Math.min(min, l.match(/^[ \t]*/)![0].length), Infinity);
  const strip = Number.isFinite(base) ? base : 0;
  return lines.map((l) => (l.trim().length === 0 ? "" : indent + l.slice(strip))).join("\n");
}

/** Build the refusal for a lookup that produced no single anchor. */
function anchorFailure(
  source: string,
  filePath: string,
  operation: "insert-before" | "insert-after",
  symbolName: string,
  lookup: AnchorLookup
): ASTEditResult {
  if (lookup.candidates.length > 1) {
    const where = lookup.candidates
      .map((c) => `${c.type} at line ${lineOf(source, c.startIndex)}`)
      .join(", ");
    return {
      success: false, path: filePath, operation, changes: 0,
      message: `Symbol '${symbolName}' is ambiguous: ${where}. Narrow the target, or use the hash tier to anchor on content.`,
      errorCode: ErrorCode.AMBIGUOUS_SYMBOL,
    };
  }
  if (lookup.rejected.length > 0) {
    const found = [...new Set(lookup.rejected.map((r) => r.type))].join(", ");
    return {
      success: false, path: filePath, operation, changes: 0,
      message: `Symbol '${symbolName}' names a ${found}, not a statement or declaration; inserting there would splice code into an expression. Target a declaration, or use the hash tier.`,
      errorCode: ErrorCode.SYMBOL_NOT_FOUND,
    };
  }
  return {
    success: false, path: filePath, operation, changes: 0,
    message: `Symbol '${symbolName}' not found`,
    errorCode: ErrorCode.SYMBOL_NOT_FOUND,
  };
}

function insertBeforeSymbolUnchecked(
  source: string,
  filePath: string,
  symbolName: string,
  content: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "insert-before", changes: 0, message: "Unsupported language", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "insert-before", changes: 0, message: "Parser unavailable", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };

  const tree = parseSource(parser, source);
  const lookup = findInsertAnchor(tree, lang, symbolName);
  if (!lookup.node) return anchorFailure(source, filePath, "insert-before", symbolName, lookup);

  const anchor = lookup.node;
  const indent = indentAt(source, anchor.startIndex);
  // Insert at the start of the anchor's line so the statement lands on its own
  // line even when the anchor shares a line with something else.
  const insertPos = source.lastIndexOf("\n", Math.max(0, anchor.startIndex - 1)) + 1;
  const newSource = source.slice(0, insertPos) + reindent(content, indent) + "\n" + source.slice(insertPos);
  return { success: true, path: filePath, operation: "insert-before", changes: 1, message: `Inserted content before '${symbolName}'`, newSource };
}

function insertAfterSymbolUnchecked(
  source: string,
  filePath: string,
  symbolName: string,
  content: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "insert-after", changes: 0, message: "Unsupported language", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "insert-after", changes: 0, message: "Parser unavailable", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };

  const tree = parseSource(parser, source);
  const lookup = findInsertAnchor(tree, lang, symbolName);
  if (!lookup.node) return anchorFailure(source, filePath, "insert-after", symbolName, lookup);

  const anchor = lookup.node;
  const indent = indentAt(source, anchor.startIndex);
  // Past the rest of the anchor's final line (trailing semicolon, comment).
  const nextNewline = source.indexOf("\n", anchor.endIndex);
  const pos = nextNewline !== -1 ? nextNewline + 1 : source.length;
  const prefix = pos === source.length && !source.endsWith("\n") ? "\n" : "";
  const newSource = source.slice(0, pos) + prefix + reindent(content, indent) + "\n" + source.slice(pos);
  return { success: true, path: filePath, operation: "insert-after", changes: 1, message: `Inserted content after '${symbolName}'`, newSource };
}

/**
 * Parse a `from X import Y, Z` spec and attempt to merge into an existing
 * import_from_statement for the same module X. Returns the ASTEditResult
 * if handled, or null to fall through to default add-import behavior.
 */
function parsePythonFromImport(
  spec: string,
  source: string,
  tree: Parser
): ASTEditResult | null {
  // Pattern: from <module> import <names>
  const match = spec.match(/^from\s+(\S+)\s+import\s+(.+)/);
  if (!match) return null; // malformed, shouldn't happen since we checked startsWith("from ")

  const [, targetModule, namesPart] = match;
  const newNames = namesPart.split(",").map((n) => n.trim()).filter(Boolean);
  if (newNames.length === 0) return null;

  // Walk AST to find existing import_from_statement for the same module
  let existingNode: Parser.SyntaxNode | null = null;
  function findExisting(n: Parser.SyntaxNode) {
    if (n.type === "import_from_statement") {
      // Check if the module matches
      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child.type === "dotted_name" && i > 0) {
          // First dotted_name after "from" is the module
          if (child.text === targetModule) {
            existingNode = n;
            return;
          }
        }
      }
    }
    for (let i = 0; i < n.childCount; i++) findExisting(n.child(i));
  }
  findExisting(tree.rootNode);

  if (existingNode) {
    // Merge: append new names to existing from-import
    const existingLine = source.slice(existingNode.startIndex, existingNode.endIndex);
    const existingImportMatch = existingLine.match(/^(from\s+\S+\s+import\s+)(.*)/);
    if (!existingImportMatch) return null;

    const [, prefix, existingNamesStr] = existingImportMatch;
    const existingNames = existingNamesStr.split(",").map((n) => n.trim());

    // Check for duplicates
    const allNew = newNames.filter((n) => !existingNames.includes(n));
    if (allNew.length === 0) {
      return { success: false, path: "", operation: "add-import", changes: 0, message: `Import for '${spec}' already exists` };
    }

    const mergedNames = [...existingNames, ...allNew];
    const newLine = prefix + mergedNames.join(", ");
    return {
      success: true,
      path: "",
      operation: "add-import",
      changes: 1,
      message: `Added import: ${spec}`,
      newSource: source.slice(0, existingNode.startIndex) + newLine + source.slice(existingNode.endIndex),
    };
  }

  // No existing from-import for this module — create new statement
  // Ensure no name duplicates with existing imports
  for (const name of newNames) {
    const dupRegex = new RegExp(`(?:from\\s+\\S+\\s+import|import)\\s+.*\\b${escapeRegex(name)}\\b`);
    if (dupRegex.test(source)) {
      return { success: false, path: "", operation: "add-import", changes: 0, message: `Name '${name}' already imported` };
    }
  }

  return null; // fall through to default add-import logic
}

// ── Parameter/argument insertion (for M5 intent engine) ───────────────

const PARAM_NODE_TYPES = new Set([
  "formal_parameters", "parameter_list", "parameters",
]);

const ARG_NODE_TYPES = new Set([
  "arguments", "argument_list",
]);

/**
 * Insert a parameter into a function/method signature.
 * Returns the modified source with the new parameter added.
 */
function insertParameterUnchecked(
  source: string,
  filePath: string,
  symbolName: string,
  newParam: string,
  position: "last" | "first" = "last"
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "insert-parameter", changes: 0, message: "Unsupported language", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };
  const cfg = configFor(lang);
  if (!cfg) return { success: false, path: filePath, operation: "insert-parameter", changes: 0, message: "Unsupported language", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "insert-parameter", changes: 0, message: "Parser unavailable", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };

  const tree = parseSource(parser, source);
  let found = false;
  let insertPos = -1;
  let insertText = "";

  let truncated = false;
  // Same shared cap and same iterative walk as findSymbols: a silent stop at 15
  // reported a deeply nested function as missing (#39).
  const stack: Array<{ node: Parser.SyntaxNode; depth: number }> = [{ node: tree.rootNode, depth: 0 }];
  while (stack.length > 0 && !found) {
    const { node, depth } = stack.pop()!;
    if (depth > MAX_AST_DEPTH) {
      truncated = true;
      continue;
    }
    if (cfg.functionTypes.includes(node.type)) {
      const nameNode = node.childForFieldName("name");
      if (nameNode && nameNode.text === symbolName) {
        // Find the parameters node
        const paramsNode = node.children.find((c) => PARAM_NODE_TYPES.has(c.type));
        if (paramsNode) {
          // Get existing parameter text to decide about leading comma
          const inner = source.slice(paramsNode.startIndex + 1, paramsNode.endIndex - 1).trim();

          if (position === "first") {
            insertPos = paramsNode.startIndex + 1;
            insertText = newParam + (inner.length > 0 ? ", " : "");
          } else {
            insertPos = paramsNode.endIndex - 1;
            insertText = (inner.length > 0 ? ", " : "") + newParam;
          }

          found = true;
          break;
        }
      }
    }
    const kids = node.children;
    for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i], depth: depth + 1 });
  }

  if (!found && truncated) {
    return {
      success: false, path: filePath, operation: "insert-parameter", changes: 0,
      message: `Search for '${symbolName}' stopped at depth ${MAX_AST_DEPTH} in ${filePath}, so the symbol may exist below the cap. Not reported as not-found.`,
      errorCode: ErrorCode.SEARCH_TRUNCATED,
    };
  }
  if (!found) return { success: false, path: filePath, operation: "insert-parameter", changes: 0, message: `Symbol '${symbolName}' not found or has no parameters`, errorCode: ErrorCode.SYMBOL_NOT_FOUND };

  const newSource = source.slice(0, insertPos) + insertText + source.slice(insertPos);
  return { success: true, path: filePath, operation: "insert-parameter", changes: 1, message: `Inserted parameter '${newParam}' into '${symbolName}'`, newSource };
}

/**
 * Insert an argument at all call sites of a named function.
 * Returns the modified source with arguments added to every call expression
 * where the function name matches.
 */
function insertCallArgUnchecked(
  source: string,
  filePath: string,
  functionName: string,
  argValue: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "insert-call-arg", changes: 0, message: "Unsupported language", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "insert-call-arg", changes: 0, message: "Parser unavailable", errorCode: ErrorCode.UNSUPPORTED_LANGUAGE };

  const tree = parseSource(parser, source);
  const edits: { start: number; end: number; text: string }[] = [];

  // Collect call_expression / call nodes where function name matches
  function findCalls(node: Parser.SyntaxNode) {
    // TypeScript/JS/Go/Rust: call_expression; Python: call
    if (node.type === "call_expression" || node.type === "call") {
      const fnNode = node.childForFieldName("function");
      if (fnNode) {
        const fnName = extractCallableName(fnNode);
        if (fnName === functionName) {
          const argsNode = node.children.find((c) => ARG_NODE_TYPES.has(c.type));
          if (argsNode) {
            const inner = source.slice(argsNode.startIndex + 1, argsNode.endIndex - 1).trim();
            const insertText = (inner.length > 0 ? ", " : "") + argValue;
            edits.push({ start: argsNode.endIndex - 1, end: argsNode.endIndex - 1, text: insertText });
          }
        }
      }
    }
    for (const child of node.children) findCalls(child);
  }

  findCalls(tree.rootNode);

  if (edits.length === 0) return { success: false, path: filePath, operation: "insert-call-arg", changes: 0, message: `No call sites for '${functionName}' found` };

  // Apply edits in reverse order (to preserve indices)
  edits.sort((a, b) => b.start - a.start);
  let newSource = source;
  for (const e of edits) {
    newSource = newSource.slice(0, e.start) + e.text + newSource.slice(e.end);
  }

  return { success: true, path: filePath, operation: "insert-call-arg", changes: edits.length, message: `Inserted argument at ${edits.length} call site(s) for '${functionName}'`, newSource };
}

/**
 * Extract the callable name from a function expression node.
 * Handles: simple identifiers, member expressions (obj.method), and scoped identifiers.
 */
function extractCallableName(node: Parser.SyntaxNode): string | null {
  if (node.type === "identifier") return node.text;
  if (node.type === "property_identifier") return node.text;
  // For member_expression (obj.method), return the property name
  if (node.type === "member_expression") {
    const prop = node.childForFieldName("property");
    if (prop) return extractCallableName(prop);
  }
  // Walk children for scoped identifiers (e.g., Rust's scoped_identifier)
  for (const child of node.children) {
    if (child.type === "identifier" || child.type === "property_identifier") {
      return child.text;
    }
  }
  return null;
}

export { getParser, SUPPORTED_LANGUAGES };

/** Location of the first `ERROR`/`MISSING` node tree-sitter recovered from. */
export interface ParseIssue {
  /** 1-indexed, to match every other line number the CLI prints. */
  line: number;
  column: number;
  nodeType: string;
}

/**
 * tree-sitter is an error-recovering parser: handed a broken file it returns a
 * tree containing ERROR nodes rather than failing. Right for an editor,
 * dangerous here — we compute byte offsets from that tree and then write to
 * disk. Returns the first bad node, or null for a clean parse (and for files
 * with no parser at all).
 */
export function firstParseError(source: string, filePath: string): ParseIssue | null {
  const lang = detectLanguage(filePath);
  if (!lang) return null;
  const parser = getParser(lang);
  if (!parser) return null;
  const tree = parseSource(parser, source);
  if (!tree.rootNode.hasError) return null;

  // Walk to the deepest first offender so the reported position is the actual
  // syntax problem, not the whole file.
  let found: Parser.SyntaxNode | null = null;
  const visit = (node: Parser.SyntaxNode): boolean => {
    if (node.type === "ERROR" || node.isMissing) {
      found = node;
      return true;
    }
    for (const child of node.children) {
      if (child.hasError && visit(child)) return true;
    }
    return false;
  };
  visit(tree.rootNode);
  const node: Parser.SyntaxNode = found ?? tree.rootNode;
  return {
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
    nodeType: node.isMissing ? `MISSING ${node.type}` : node.type,
  };
}

let allowParseErrors = false;

/**
 * Escape hatch for deliberately editing a file that does not parse. Off by
 * default and never inferred — the CLI sets it only from `--allow-parse-errors`.
 */
export function setAllowParseErrors(value: boolean): void {
  allowParseErrors = value;
}

export function getAllowParseErrors(): boolean {
  return allowParseErrors;
}

function parseErrorResult(filePath: string, operation: string, message: string, issue: ParseIssue): ASTEditResult {
  return {
    success: false,
    path: filePath,
    operation,
    changes: 0,
    message,
    error: message,
    errorCode: ErrorCode.PARSE_ERROR,
    parseIssue: issue,
  };
}

/**
 * Wraps an AST operation in the two checks from the SWE-agent ACI paper
 * (arXiv 2405.15793), which found that rejecting edits whose result does not
 * parse materially improves agent task success:
 *
 *   pre  — refuse to compute offsets against a tree that already has errors.
 *   post — reparse the edited source before anyone writes it. This one also
 *          catches bugs in our own offset arithmetic, so it stays on even when
 *          `--allow-parse-errors` waives the pre-check.
 */
function gated<F extends (source: string, filePath: string, ...rest: never[]) => ASTEditResult>(
  fn: F,
  operation: string,
): F {
  return function (this: unknown, source: string, filePath: string, ...rest: never[]): ASTEditResult {
    const before = firstParseError(source, filePath);
    if (before && !allowParseErrors) {
      return parseErrorResult(
        filePath,
        operation,
        `File has a syntax error at line ${before.line}:${before.column} (${before.nodeType}); refusing to edit a tree that did not parse cleanly. Fix the file, or pass --allow-parse-errors.`,
        before,
      );
    }

    const result = fn(source, filePath, ...rest);
    if (!result.success || result.newSource === undefined) return result;

    // Only meaningful when the input was clean: an already-broken file is
    // expected to still be broken afterwards.
    if (before) return result;
    const after = firstParseError(result.newSource, filePath);
    if (after) {
      return parseErrorResult(
        filePath,
        operation,
        `Edit was discarded: the result does not parse (syntax error at line ${after.line}:${after.column} — ${after.nodeType}). The input parsed cleanly, so this edit would have corrupted the file.`,
        after,
      );
    }
    return result;
  } as F;
}

export const renameSymbol = gated(renameSymbolUnchecked, "rename-symbol");
export const replaceBody = gated(replaceBodyUnchecked, "replace-body");
export const addImport = gated(addImportUnchecked, "add-import");
export const removeImport = gated(removeImportUnchecked, "remove-import");
export const insertBeforeSymbol = gated(insertBeforeSymbolUnchecked, "insert-before");
export const insertAfterSymbol = gated(insertAfterSymbolUnchecked, "insert-after");
export const insertParameter = gated(insertParameterUnchecked, "add-parameter");
export const insertCallArg = gated(insertCallArgUnchecked, "add-call-arg");
