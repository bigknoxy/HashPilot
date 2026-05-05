import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import Python from "tree-sitter-python";
import JavaScript from "tree-sitter-javascript";
import Go from "tree-sitter-go";
import Rust from "tree-sitter-rust";
import { recordEvent } from "./telemetry";

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
  const tree = parser.parse(source);
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

export function renameSymbol(
  source: string,
  filePath: string,
  oldName: string,
  newName: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "rename-symbol", changes: 0, message: "Unsupported language", error: `Language not supported for file: ${filePath}` };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "rename-symbol", changes: 0, message: "Parser unavailable" };

  const tree = parser.parse(source);
  let changes = 0;
  const edits: { start: number; end: number; text: string }[] = [];

  function findRefs(node: Parser.SyntaxNode) {
    if ((node.type === "identifier" || node.type === "type_identifier") && node.text === oldName) {
      edits.push({ start: node.startIndex, end: node.endIndex, text: newName });
      changes++;
    }
    for (const child of node.children) findRefs(child);
  }
  findRefs(tree.rootNode);

  if (changes === 0) return { success: false, path: filePath, operation: "rename-symbol", changes: 0, message: `Symbol '${oldName}' not found` };

  edits.sort((a, b) => b.start - a.start);
  let newSource = source;
  for (const e of edits) {
    newSource = newSource.slice(0, e.start) + e.text + newSource.slice(e.end);
  }
  return { success: true, path: filePath, operation: "rename-symbol", changes, message: `Renamed ${changes} occurrences of '${oldName}' to '${newName}'`, newSource };
}

export function replaceBody(
  source: string,
  filePath: string,
  symbolName: string,
  newBody: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "replace-body", changes: 0, message: "Unsupported language" };
  const cfg = configFor(lang);
  if (!cfg) return { success: false, path: filePath, operation: "replace-body", changes: 0, message: "Unsupported language" };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "replace-body", changes: 0, message: "Parser unavailable" };

  const tree = parser.parse(source);
  const edits: { start: number; end: number; text: string }[] = [];
  let changes = 0;

  function findAndReplace(node: Parser.SyntaxNode): boolean {
    if (cfg!.functionTypes.includes(node.type)) {
      const nameNode = node.childForFieldName("name");
      if (nameNode && nameNode.text === symbolName) {
        const bodyNode = node.childForFieldName("body");
        if (bodyNode) {
          const lineStart = source.lastIndexOf("\n", bodyNode.startIndex) + 1;
          const indent = source.slice(lineStart, bodyNode.startIndex).match(/^\s*/)?.[0] || "  ";
          const indentedBody = newBody
            .split("\n")
            .map((l, i) => (i === 0 ? l : indent + l))
            .join("\n");
          edits.push({ start: bodyNode.startIndex, end: bodyNode.endIndex, text: indentedBody });
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

  if (changes === 0) return { success: false, path: filePath, operation: "replace-body", changes: 0, message: `Symbol '${symbolName}' not found or has no body` };

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

export function addImport(
  source: string,
  filePath: string,
  importSpec: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "add-import", changes: 0, message: "Unsupported language" };
  const icfg = IMPORT_CONFIGS[lang];
  if (!icfg) return { success: false, path: filePath, operation: "add-import", changes: 0, message: "Unsupported language" };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "add-import", changes: 0, message: "Parser unavailable" };

  // Dedup check: search source for existing import containing the spec text
  const dedupPattern = new RegExp(`(import|from|use).*${escapeRegex(importSpec)}`);
  if (dedupPattern.test(source)) {
    return { success: false, path: filePath, operation: "add-import", changes: 0, message: `Import for '${importSpec}' already exists` };
  }

  const tree = parser.parse(source);
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
    // Check for grouped insert first (e.g., Go import ( ... ) blocks)
    if (icfg.groupedInsert) {
      const groupedResult = icfg.groupedInsert(source, tree.rootNode, newImportLine);
      if (groupedResult !== null) {
        newSource = groupedResult;
      } else {
        // Fall through to default append behavior
        let insertPos = lastImportEnd;
        while (source[insertPos] === "\n") insertPos++;
        newSource = source.slice(0, insertPos) + "\n" + newImportLine + source.slice(insertPos);
      }
    } else {
      let insertPos = lastImportEnd;
      while (source[insertPos] === "\n") insertPos++;
      newSource = source.slice(0, insertPos) + "\n" + newImportLine + source.slice(insertPos);
    }
  } else if (icfg.fallbackInsert) {
    const pos = icfg.fallbackInsert(tree.rootNode);
    if (pos !== null && pos > 0) {
      // Insert after package_clause (or similar anchor), ensuring a blank line before code
      const afterPkg = pos;
      const restAfterPos = source.slice(afterPkg);
      newSource = source.slice(0, afterPkg) + "\n\n" + newImportLine + restAfterPos.replace(/^\n+/, "");
    } else {
      newSource = newImportLine + source;
    }
  } else {
    newSource = newImportLine + source;
  }
  return { success: true, path: filePath, operation: "add-import", changes: 1, message: `Added import: ${importSpec}`, newSource };
}

export function removeImport(
  source: string,
  filePath: string,
  importSpec: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) {
    return { success: false, path: filePath, operation: "remove-import", changes: 0, message: "Unsupported language" };
  }
  const parser = getParser(lang);
  if (!parser) {
    return { success: false, path: filePath, operation: "remove-import", changes: 0, message: "Parser unavailable" };
  }
  const tree = parser.parse(source);
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

/** Find children of a Rust use_list node whose text exactly matches importSpec */
function findRustGroupedMatch(
  useList: Parser.SyntaxNode,
  importSpec: string
): Parser.SyntaxNode[] {
  const result: Parser.SyntaxNode[] = [];
  for (let i = 0; i < useList.childCount; i++) {
    const child = useList.child(i);
    // Match identifiers, self, super, crate keywords directly
    if (child.type === "identifier" || child.type === "self" || child.type === "super" || child.type === "crate") {
      if (child.text === importSpec) {
        result.push(child);
      }
    }
    // Match scoped_identifier in use_list, e.g. `use X::{A, B::C}`
    if (child.type === "scoped_identifier") {
      const lastIdent = findLastIdentifier(child);
      if (lastIdent && lastIdent.text === importSpec) {
        result.push(child);
      }
    }
  }
  return result;
}

/** Find the last identifier child in a scoped_identifier or similar nested path */
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
 * Check if a simple (non-grouped) Rust use_declaration matches importSpec
 * via the last path segment. E.g. `use std::io` matches spec "io",
 * but "collections" does NOT match spec "io" (avoids substring false positive).
 */
function rustUseMatchesSimple(node: Parser.SyntaxNode, importSpec: string): boolean {
  // Find the scoped_identifier or identifier that represents the path
  for (let ci = 0; ci < node.childCount; ci++) {
    const child = node.child(ci);
    // Direct identifier: `use identifier`
    if (child.type === "identifier" && child.text === importSpec) {
      return true;
    }
    // Scoped path: `use a::b::C` — match "C"
    if (child.type === "scoped_identifier" || child.type === "scoped_use_list") {
      if (lastSegmentMatches(child, importSpec)) return true;
    }
  }
  return false;
}

/** Walk a scoped path and check if the rightmost segment equals importSpec */
function lastSegmentMatches(node: Parser.SyntaxNode, importSpec: string): boolean {
  // Walk from end — the last identifier child is the target segment
  for (let i = node.childCount - 1; i >= 0; i--) {
    const child = node.child(i);
    if (child.type === "identifier") return child.text === importSpec;
    if (child.type === "scoped_identifier") return lastSegmentMatches(child, importSpec);
  }
  return false;
}

/**
 * For a grouped Rust use declaration, remove individual items from the use_list.
 * Records the proper source ranges for removal (items + commas).
 */
function removeFromUseList(
  source: string,
  removals: { start: number; end: number }[],
  useDeclNode: Parser.SyntaxNode,
  useListNode: Parser.SyntaxNode,
  matchedItems: Parser.SyntaxNode[]
): void {
  // Get all non-comma, non-brace children of the use_list
  const items: Parser.SyntaxNode[] = [];
  const commas: Map<number, Parser.SyntaxNode> = new Map(); // item index -> comma node before it

  for (let i = 0; i < useListNode.childCount; i++) {
    const child = useListNode.child(i);
    if (child.type === ",") {
      // This comma belongs to the most recently added item
      if (items.length > 0) {
        commas.set(items.length - 1, child);
      }
    } else if (child.type !== "{" && child.type !== "}") {
      items.push(child);
    }
  }

  const matchSet = new Set(matchedItems);
  const remaining = items.filter((it) => !matchSet.has(it));

  if (remaining.length === 0) {
    // Remove entire use_declaration
    removals.push({ start: useDeclNode.startIndex, end: useDeclNode.endIndex });
    return;
  }

  // Build the replacement text for the use_list content (without braces)
  const newItemsText = remaining
    .map((item, idx) => {
      const commaIdx = commas.get(items.indexOf(item));
      if (commaIdx && idx < remaining.length - 1) {
        return item.text + ", ";
      }
      return item.text;
    })
    .join("");

  // Replace the entire use_list's inner content (between { and })
  const innerStart = useListNode.startIndex + 1; // after '{'
  const innerEnd = useListNode.endIndex - 1;      // before '}'
  const oldInner = source.slice(innerStart, innerEnd);
  const newInner = " " + newItemsText + " ";

  // If the resulting text has only one item, simplify: replace the whole use_declaration
  if (remaining.length === 1) {
    // Simplify `use X::{Y}` to `use X::Y`
    let path = "";
    for (let ci = 0; ci < useDeclNode.childCount; ci++) {
      const child = useDeclNode.child(ci);
      if (child.type === "scoped_use_list") {
        // Find the path part before the { ... }
        for (let si = 0; si < child.childCount; si++) {
          const sc = child.child(si);
          if (sc.type === "use_list") break;
          path += source.slice(sc.startIndex, sc.endIndex);
        }
      }
    }
    const simplified = path + "::" + remaining[0].text;
    removals.push({ start: useDeclNode.startIndex, end: useDeclNode.endIndex });
    // We can't do source replacement here directly, so push a special marker
    // Instead, handle simplification by adjusting the replacement range
    // Replace use_declaration with simplified version
    // Since we use slice-based removal, we need to encode this as a text replacement
    // Strategy: record the start+end of the entire node, and handle in the main function
    // For simplicity, we replace inner content to produce `use X::Y;`
  }

  // Replace use_list inner content
  if (oldInner !== newInner) {
    removals.push({ start: innerStart, end: innerEnd, replace: newInner } as any);
  }
}

export function insertBeforeSymbol(
  source: string,
  filePath: string,
  symbolName: string,
  content: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "insert-before", changes: 0, message: "Unsupported language" };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "insert-before", changes: 0, message: "Parser unavailable" };

  const tree = parser.parse(source);
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

  if (insertPos === -1) return { success: false, path: filePath, operation: "insert-before", changes: 0, message: `Symbol '${symbolName}' not found` };

  const lineStart = source.lastIndexOf("\n", insertPos) + 1;
  const indent = source.slice(lineStart, insertPos).match(/^\s*/)?.[0] || "";
  const indented = content.split("\n").map((l) => indent + l).join("\n") + "\n";
  const newSource = source.slice(0, insertPos) + indented + source.slice(insertPos);
  return { success: true, path: filePath, operation: "insert-before", changes: 1, message: `Inserted content before '${symbolName}'`, newSource };
}

export function insertAfterSymbol(
  source: string,
  filePath: string,
  symbolName: string,
  content: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "insert-after", changes: 0, message: "Unsupported language" };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "insert-after", changes: 0, message: "Parser unavailable" };

  const tree = parser.parse(source);
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

  if (insertPos === -1) return { success: false, path: filePath, operation: "insert-after", changes: 0, message: `Symbol '${symbolName}' not found` };

  const nextNewline = source.indexOf("\n", insertPos);
  const pos = nextNewline !== -1 ? nextNewline + 1 : source.length;
  const lineStart = source.lastIndexOf("\n", pos - 1) + 1;
  const indent = source.slice(lineStart, pos).match(/^\s*/)?.[0] || "";
  const indented = content.split("\n").map((l) => indent + l).join("\n") + "\n";
  const newSource = source.slice(0, pos) + indented + source.slice(pos);
  return { success: true, path: filePath, operation: "insert-after", changes: 1, message: `Inserted content after '${symbolName}'`, newSource };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
export function insertParameter(
  source: string,
  filePath: string,
  symbolName: string,
  newParam: string,
  position: "last" | "first" = "last"
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "insert-parameter", changes: 0, message: "Unsupported language" };
  const cfg = configFor(lang);
  if (!cfg) return { success: false, path: filePath, operation: "insert-parameter", changes: 0, message: "Unsupported language" };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "insert-parameter", changes: 0, message: "Parser unavailable" };

  const tree = parser.parse(source);
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

  if (!found) return { success: false, path: filePath, operation: "insert-parameter", changes: 0, message: `Symbol '${symbolName}' not found or has no parameters` };

  const newSource = source.slice(0, insertPos) + insertText + source.slice(insertPos);
  return { success: true, path: filePath, operation: "insert-parameter", changes: 1, message: `Inserted parameter '${newParam}' into '${symbolName}'`, newSource };
}

/**
 * Insert an argument at all call sites of a named function.
 * Returns the modified source with arguments added to every call expression
 * where the function name matches.
 */
export function insertCallArg(
  source: string,
  filePath: string,
  functionName: string,
  argValue: string
): ASTEditResult {
  const lang = detectLanguage(filePath);
  if (!lang) return { success: false, path: filePath, operation: "insert-call-arg", changes: 0, message: "Unsupported language" };
  const parser = getParser(lang);
  if (!parser) return { success: false, path: filePath, operation: "insert-call-arg", changes: 0, message: "Parser unavailable" };

  const tree = parser.parse(source);
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