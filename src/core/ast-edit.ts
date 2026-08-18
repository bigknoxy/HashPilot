import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import Python from "tree-sitter-python";
import JavaScript from "tree-sitter-javascript";
import Go from "tree-sitter-go";
import Rust from "tree-sitter-rust";
import { escapeRegex } from "./utils";
import { ErrorCode } from "./telemetry";

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
    return null;
  }
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
  /** Where the offending syntax error is, when `errorCode` is PARSE_ERROR. */
  parseIssue?: ParseIssue;
}
export interface SymbolInfo {
  name: string;
  kind: string;
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

export function findSymbols(source: string, filePath: string): SymbolInfo[] {
  const lang = detectLanguage(filePath);
  if (!lang) return [];
  const cfg = configFor(lang);
  if (!cfg) return [];
  const parser = getParser(lang);
  if (!parser) return [];
  const tree = parseSource(parser, source);
  const symbols: SymbolInfo[] = [];

  function walk(node: Parser.SyntaxNode, depth: number = 0) {
    if (depth > 10) return;
    if (cfg!.symbolKinds.includes(node.type)) {
      const nameNode =
        node.childForFieldName("name") ||
        node.children.find((c) => IDENTIFIER_TYPES.has(c.type));
      if (nameNode) {
        symbols.push({
          name: nameNode.text,
          kind: node.type,
          startRow: node.startPosition.row,
          endRow: node.endPosition.row,
          startCol: node.startPosition.column,
          endCol: node.endPosition.column,
        });
      }
    }
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }

  walk(tree.rootNode);
  return symbols;
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

  // Dedup check: search source for existing import containing the spec text
  const dedupPattern = new RegExp(`(import|from|use).*${escapeRegex(importSpec)}`);
  if (dedupPattern.test(source)) {
    return { success: false, path: filePath, operation: "add-import", changes: 0, message: `Import for '${importSpec}' already exists` };
  }

  const tree = parseSource(parser, source);
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
      let insertPos = lastImportEnd;
      while (source[insertPos] === "\n") insertPos++;
      newSource = source.slice(0, insertPos) + "\n" + newImportLine + source.slice(insertPos);
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

  // --- Other languages: remove entire import node containing the spec ---
  const removals: { start: number; end: number }[] = [];
  function collectRemovals(node: Parser.SyntaxNode) {
    if (icfg && icfg.nodeTypes.includes(node.type) && node.text.includes(importSpec)) {
      removals.push({ start: node.startIndex, end: node.endIndex });
      return;
    }
    for (let i = 0; i < node.childCount; i++) {
      collectRemovals(node.child(i));
    }
  }
  collectRemovals(tree.rootNode);

  if (removals.length === 0) {
    return { success: false, path: filePath, operation: "remove-import", changes: 0, message: `No import for '${importSpec}' found` };
  }

  removals.sort((a, b) => b.start - a.start);
  let newSource = source;
  for (const r of removals) {
    let end = r.end;
    while (end < newSource.length && newSource[end] === "\n") end++;
    newSource = newSource.slice(0, r.start) + newSource.slice(end);
  }

  return { success: true, path: filePath, operation: "remove-import", changes: removals.length, message: `Removed ${removals.length} import(s) for '${importSpec}'`, newSource };
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
  let insertPos = -1;

  function find(node: Parser.SyntaxNode): boolean {
    const nameNode = node.childForFieldName("name");
    if (nameNode && nameNode.text === symbolName) {
      insertPos = node.startIndex;
      return true;
    }
    for (const child of node.children) {
      if (find(child)) return true;
    }
    return false;
  }
  find(tree.rootNode);

  if (insertPos === -1) return { success: false, path: filePath, operation: "insert-before", changes: 0, message: `Symbol '${symbolName}' not found`, errorCode: ErrorCode.SYMBOL_NOT_FOUND };

  const lineStart = source.lastIndexOf("\n", insertPos) + 1;
  const indent = source.slice(lineStart, insertPos).match(/^\s*/)?.[0] || "";
  const indented = content.split("\n").map((l) => indent + l).join("\n") + "\n";
  const newSource = source.slice(0, insertPos) + indented + source.slice(insertPos);
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
  let insertPos = -1;

  function find(node: Parser.SyntaxNode): boolean {
    const nameNode = node.childForFieldName("name");
    if (nameNode && nameNode.text === symbolName) {
      insertPos = node.endIndex;
      return true;
    }
    for (const child of node.children) {
      if (find(child)) return true;
    }
    return false;
  }
  find(tree.rootNode);

  if (insertPos === -1) return { success: false, path: filePath, operation: "insert-after", changes: 0, message: `Symbol '${symbolName}' not found`, errorCode: ErrorCode.SYMBOL_NOT_FOUND };

  const nextNewline = source.indexOf("\n", insertPos);
  const pos = nextNewline !== -1 ? nextNewline + 1 : source.length;
  const lineStart = source.lastIndexOf("\n", pos - 1) + 1;
  const indent = source.slice(lineStart, pos).match(/^\s*/)?.[0] || "";
  const indented = content.split("\n").map((l) => indent + l).join("\n") + "\n";
  const newSource = source.slice(0, pos) + indented + source.slice(pos);
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

  function find(node: Parser.SyntaxNode, depth: number): boolean {
    if (depth > 15) return false;
    if (cfg!.functionTypes.includes(node.type)) {
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
          return true;
        }
      }
    }
    for (const child of node.children) {
      if (find(child, depth + 1)) return true;
    }
    return false;
  }

  find(tree.rootNode, 0);

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
