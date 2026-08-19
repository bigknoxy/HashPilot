/**
 * The shared operation registry (#25 / B21).
 *
 * HashPilot has two front doors: the Commander CLI and the MCP server. Written
 * separately they would drift, and a drifted MCP surface is worse than no MCP
 * surface — it disagrees silently with the documented CLI. So each operation is
 * declared once here (name, model-facing description, typed parameters,
 * handler) and both front doors read from this list.
 *
 * The CLI's Commander definitions still own their own flag parsing, `@file`
 * expansion, and telemetry; what this registry guarantees is that every entry
 * corresponds to a real CLI command and that the parameter names agree.
 * `tests/operations-parity.test.ts` enforces both directions.
 *
 * Handlers deliberately route edits through `routeEdit` rather than calling the
 * tier functions directly: that is the path that takes the advisory lock, does
 * the compare-and-swap, records the snapshot, and writes provenance. An MCP
 * caller must not get a weaker guarantee than a CLI caller.
 */

import { readMany, readHash } from "./read";
import { grepMany, symbolLookupMany } from "./grep";
import { findSymbols, astCapabilities } from "./ast-edit";
import { routeEdit } from "./router";
import { verifyChanges } from "./verify";

/* ── Types ───────────────────────────────────────────────────────────── */

export type ParamType = "string" | "number" | "boolean" | "string[]";

export interface OperationParam {
  /** Parameter name, in camelCase. Must match the CLI's argument or option name. */
  name: string;
  type: ParamType;
  required: boolean;
  /** Written for a model: what to put here, not what the field is called. */
  description: string;
}

export interface Operation {
  /** MCP tool name. snake_case, because that is what MCP hosts display. */
  name: string;
  /** The CLI command path this mirrors, e.g. `["ast", "rename-symbol"]`. */
  cliCommand: string[];
  /** One line, shown in tool lists. */
  summary: string;
  /**
   * The model-facing description. Every entry states when NOT to use the tool —
   * an agent picking the wrong tier is the common failure, not a wrong argument.
   */
  description: string;
  params: OperationParam[];
  /** True for anything that can write. Hosts surface this as a consent prompt. */
  mutates: boolean;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/* ── Argument coercion ───────────────────────────────────────────────── */

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  // An explicit empty string is meaningful (a deletion, #40), so only
  // undefined/null count as absent.
  return v === undefined || v === null ? undefined : String(v);
}

function num(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function bool(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true || args[key] === "true";
}

function strArray(args: Record<string, unknown>, key: string): string[] {
  const v = args[key];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v !== "") return [v];
  return [];
}

/** `"3:9"` → `{start: 3, end: 9}`; `"3"` → `{start: 3, end: 3}`. */
function parseRangeArg(raw: string | undefined): { start: number; end: number } | undefined {
  if (!raw) return undefined;
  const [s, e] = raw.split(":").map(Number);
  if (!Number.isFinite(s)) return undefined;
  return { start: s, end: Number.isFinite(e) ? e : s };
}

/** Provenance parameters every mutating operation accepts. */
const PROVENANCE_PARAMS: OperationParam[] = [
  { name: "actor", type: "string", required: false, description: "Your agent identity, recorded in the edit history." },
  { name: "taskId", type: "string", required: false, description: "Task or issue reference this edit belongs to." },
  { name: "reason", type: "string", required: false, description: "Why this edit is being made, in one line." },
  { name: "dryRun", type: "boolean", required: false, description: "Compute the edit and report it without writing to disk. The result is a unified `diff` of the changed hunks, not the whole file." },
];

/**
 * Opt-in on the operations whose dry run would otherwise hand back a whole file
 * (#98). The hash tier already answers with a diff, so it does not carry this.
 */
const PREVIEW_PARAM: OperationParam = {
  name: "includeSource",
  type: "boolean",
  required: false,
  description: "On a dry run, return the full post-edit text as `newSource` instead of just the diff. Costs one whole file of context.",
};

/** Shared handler for every edit: one path, so locking and provenance are uniform. */
function editHandler(
  operation: string,
  method: "ast" | "hash" | "diff" | undefined,
  map: (args: Record<string, unknown>) => Record<string, unknown>
) {
  return async (args: Record<string, unknown>) =>
    routeEdit({
      filePath: str(args, "file")!,
      operation,
      method,
      dryRun: bool(args, "dryRun"),
      includeSource: bool(args, "includeSource"),
      actor: str(args, "actor"),
      taskId: str(args, "taskId"),
      reason: str(args, "reason"),
      ...map(args),
    } as Parameters<typeof routeEdit>[0]);
}

const FILE_PARAM: OperationParam = {
  name: "file",
  type: "string",
  required: true,
  description: "Path to the file to edit, relative to the project root.",
};

/* ── The registry ────────────────────────────────────────────────────── */

export const OPERATIONS: Operation[] = [
  /* — Reading — */
  {
    name: "read_many",
    cliCommand: ["read-many"],
    summary: "Read whole files and get a SHA-256 hash for each.",
    description:
      "Read one or more files, returning content plus a content hash per file. " +
      "Read this way before any hash-anchored edit: the hash you get back is the " +
      "anchor `replace_hash` verifies against, which is what makes the edit refuse " +
      "rather than clobber when the file changed underneath you. " +
      "Do NOT use it to scan a large tree looking for something — use `grep_many`, " +
      "which returns matches instead of whole files.",
    params: [{ name: "files", type: "string[]", required: true, description: "Paths of the files to read, relative to the project root." }],
    mutates: false,
    handler: async (a) => readMany(strArray(a, "files")),
  },
  {
    name: "read_hash",
    cliCommand: ["read-hash"],
    summary: "Read a single line with its hash and surrounding context.",
    description:
      "Read one line of a file plus N lines of context, with a hash for the line. " +
      "Use it when you already know the line you intend to change and do not want " +
      "the whole file in context. Do NOT use it to read a region — pass a `range` " +
      "to `replace_hash` instead of stitching single lines together.",
    params: [
      { name: "file", type: "string", required: true, description: "Path to the file to read." },
      { name: "line", type: "number", required: true, description: "1-indexed line number." },
      { name: "context", type: "number", required: false, description: "Lines of context either side. Default 3." },
    ],
    mutates: false,
    handler: async (a) => readHash(str(a, "file")!, num(a, "line")!, num(a, "context") ?? 3),
  },
  {
    name: "grep_many",
    cliCommand: ["grep-many"],
    summary: "Regex search across paths.",
    description:
      "Search a regex across files or directories and get back file, line number, " +
      "and matching text. This is the cheapest way to locate code. " +
      "Do NOT use it to find where a symbol is defined — `symbol_lookup_many` " +
      "understands definitions and will not drown you in call sites.",
    params: [
      { name: "pattern", type: "string", required: true, description: "Regular expression to search for." },
      { name: "paths", type: "string[]", required: true, description: "Files or directories to search." },
      { name: "ignoreCase", type: "boolean", required: false, description: "Case-insensitive match." },
      { name: "filePattern", type: "string", required: false, description: "Glob limiting which files are searched, e.g. '*.ts'." },
      { name: "maxResults", type: "number", required: false, description: "Cap on returned matches." },
    ],
    mutates: false,
    handler: async (a) =>
      grepMany(str(a, "pattern")!, strArray(a, "paths"), {
        ignoreCase: bool(a, "ignoreCase"),
        filePattern: str(a, "filePattern"),
        maxResults: num(a, "maxResults"),
      }),
  },
  {
    name: "symbol_lookup_many",
    cliCommand: ["symbol-lookup-many"],
    summary: "Find where symbols are defined.",
    description:
      "Locate the definitions of named symbols across paths. Use it to answer " +
      "'where does this function live' before editing it. " +
      "Do NOT use it to find call sites — it reports definitions only; use `grep_many` for references.",
    params: [
      { name: "names", type: "string[]", required: true, description: "Symbol names whose definitions you want located." },
      { name: "paths", type: "string[]", required: true, description: "Files or directories to search." },
    ],
    mutates: false,
    handler: async (a) => symbolLookupMany(strArray(a, "names"), strArray(a, "paths")),
  },
  {
    name: "find_symbols",
    cliCommand: ["ast", "find-symbols"],
    summary: "List every symbol declared in one file.",
    description:
      "Parse a file and list the symbols it declares, with their kinds and lines. " +
      "Line and column numbers come in two conventions: `startLine`/`endLine`/" +
      "`startColumn`/`endColumn` are 1-indexed and are what you want — they match " +
      "the `range` the hash tier accepts. `startRow`/`endRow`/`startCol`/`endCol` " +
      "are the raw 0-indexed tree-sitter coordinates, kept for compatibility; " +
      "passing one of those as a `range` targets the line above the symbol. " +
      "Use it to orient yourself in an unfamiliar file before an AST edit. " +
      "Do NOT use it on an unsupported language — check `ast_capabilities` first, " +
      "or the call returns a parse error.",
    params: [FILE_PARAM],
    mutates: false,
    handler: async (a) => {
      const file = str(a, "file")!;
      // A path that does not exist is the caller's mistake, not ours. Without
      // this it surfaces as INTERNAL_ERROR, which reads to a model as "the tool
      // is broken" rather than "fix the path".
      const handle = Bun.file(file);
      if (!(await handle.exists())) {
        return { success: false, errorCode: "FILE_NOT_FOUND", error: `No such file: ${file}` };
      }
      return findSymbols(await handle.text(), file);
    },
  },
  {
    name: "ast_capabilities",
    cliCommand: ["ast", "capabilities"],
    summary: "List languages and operations the AST tier supports.",
    description:
      "Report which languages have tree-sitter support and which AST operations " +
      "exist. Call it once when you are unsure whether a file can be edited " +
      "structurally. Do NOT call it before every edit — the answer does not change " +
      "within a session, and `route_edit` falls back on its own.",
    params: [],
    mutates: false,
    handler: async () => astCapabilities(),
  },

  /* — Hash tier — */
  {
    name: "replace_hash",
    cliCommand: ["replace-hash"],
    summary: "Replace content anchored to a SHA-256 hash you read earlier.",
    description:
      "Replace a region of a file identified by the hash returned from `read_many` " +
      "or `read_hash`. If the file changed since you read it, the edit refuses or " +
      "relocates the anchor rather than overwriting someone else's work — this is " +
      "the safest edit HashPilot offers and the right default for any language " +
      "without AST support. " +
      "Do NOT use it for a rename that spans call sites: `rename_symbol` understands " +
      "bindings and this does not. " +
      "On success it returns `newHash` (the hash of the content it just wrote) and " +
      "`newRange`: pass that pair straight back as `oldHash`/`range` to edit the same " +
      "region again without re-reading the file. `fileHash` is the whole file after " +
      "the edit and is not an anchor.",
    params: [
      FILE_PARAM,
      { name: "oldHash", type: "string", required: true, description: "The hash of the content you are replacing, from a prior read." },
      { name: "newContent", type: "string", required: true, description: "Replacement text. An empty string deletes the region." },
      { name: "range", type: "string", required: false, description: "Line range as 'start:end' or a single 'N', 1-indexed." },
      ...PROVENANCE_PARAMS,
    ],
    mutates: true,
    handler: editHandler("replace-hash", "hash", (a) => ({
      oldHash: str(a, "oldHash"),
      newContent: str(a, "newContent"),
      range: parseRangeArg(str(a, "range")),
    })),
  },
  {
    name: "replace_content",
    cliCommand: ["route-edit"],
    summary: "Search-and-replace fallback for content you cannot hash or parse.",
    description:
      "Replace an exact block of text with another. Refuses when the old text " +
      "appears more than once, so an ambiguous match fails loudly instead of " +
      "editing the wrong copy. " +
      "Do NOT reach for this first — prefer `replace_hash` (verified) or an AST " +
      "tool (structural). This tier exists for languages and shapes the other two cannot handle.",
    params: [
      FILE_PARAM,
      { name: "oldContent", type: "string", required: true, description: "Exact existing text to replace. Must occur exactly once." },
      { name: "newContent", type: "string", required: true, description: "Replacement text. An empty string deletes the block." },
      ...PROVENANCE_PARAMS,
      PREVIEW_PARAM,
    ],
    mutates: true,
    handler: editHandler("replace-content", "diff", (a) => ({
      oldContent: str(a, "oldContent"),
      newContent: str(a, "newContent"),
    })),
  },

  /* — AST tier — */
  {
    name: "rename_symbol",
    cliCommand: ["ast", "rename-symbol"],
    summary: "Rename a symbol and its references within one file.",
    description:
      "Rename a declaration and every reference bound to it in the same file, using " +
      "the syntax tree rather than text matching — so a string containing the name, " +
      "or a different symbol that happens to share it, is left alone. Refuses with " +
      "AMBIGUOUS_SYMBOL when the name binds more than once in the file. " +
      "Do NOT expect it to cross file boundaries: it is file-scoped by design. " +
      "Rename each file, or use `intent` for a cross-file plan.",
    params: [
      FILE_PARAM,
      { name: "oldName", type: "string", required: true, description: "Current symbol name." },
      { name: "newName", type: "string", required: true, description: "New symbol name." },
      ...PROVENANCE_PARAMS,
      PREVIEW_PARAM,
    ],
    mutates: true,
    handler: editHandler("rename-symbol", "ast", (a) => ({
      oldName: str(a, "oldName"),
      newName: str(a, "newName"),
    })),
  },
  {
    name: "replace_body",
    cliCommand: ["ast", "replace-body"],
    summary: "Replace a function or method body, keeping its signature.",
    description:
      "Swap the body of a named function or method without touching its signature, " +
      "decorators, or surrounding code. The result is reparsed and the edit is " +
      "discarded if it would not parse. " +
      "Do NOT use it to change the signature — that is `intent` with add-parameter, " +
      "which also updates call sites.",
    params: [
      FILE_PARAM,
      { name: "symbol", type: "string", required: true, description: "Name of the function or method." },
      { name: "newBody", type: "string", required: true, description: "Replacement body, including its braces or indentation block." },
      ...PROVENANCE_PARAMS,
      PREVIEW_PARAM,
    ],
    mutates: true,
    handler: editHandler("replace-body", "ast", (a) => ({
      symbolName: str(a, "symbol"),
      newBody: str(a, "newBody"),
    })),
  },
  {
    name: "add_import",
    cliCommand: ["ast", "add-import"],
    summary: "Add an import statement in the language's own style.",
    description:
      "Insert an import, placing it with the file's existing imports and merging " +
      "into a grouped import from the same module where the language allows it. " +
      "Do NOT hand-write the import with an insert tool — this one knows the " +
      "per-language formatting and will not produce a duplicate.",
    params: [
      FILE_PARAM,
      { name: "importSpec", type: "string", required: true, description: "Import to add, e.g. '{ Foo } from ./bar'." },
      ...PROVENANCE_PARAMS,
      PREVIEW_PARAM,
    ],
    mutates: true,
    handler: editHandler("add-import", "ast", (a) => ({ importSpec: str(a, "importSpec") })),
  },
  {
    name: "remove_import",
    cliCommand: ["ast", "remove-import"],
    summary: "Remove an import statement.",
    description:
      "Delete an import, and drop just one name out of a grouped import when the " +
      "rest are still used. " +
      "Do NOT use it to clean up every unused import — it removes what you name, " +
      "and does not analyse usage.",
    params: [
      FILE_PARAM,
      { name: "importSpec", type: "string", required: true, description: "Import to remove, in the same form as it appears." },
      ...PROVENANCE_PARAMS,
      PREVIEW_PARAM,
    ],
    mutates: true,
    handler: editHandler("remove-import", "ast", (a) => ({ importSpec: str(a, "importSpec") })),
  },
  {
    name: "insert_before",
    cliCommand: ["ast", "insert-before"],
    summary: "Insert code immediately before a symbol's declaration.",
    description:
      "Place new code directly above a named declaration — a decorator, a helper, " +
      "a comment block. Anchored to the symbol, so it stays correct even if line " +
      "numbers moved since you read the file. " +
      "Do NOT use it to add an import; `add_import` handles placement and grouping.",
    params: [
      FILE_PARAM,
      { name: "symbol", type: "string", required: true, description: "Symbol to insert before." },
      { name: "content", type: "string", required: true, description: "Code to insert." },
      ...PROVENANCE_PARAMS,
      PREVIEW_PARAM,
    ],
    mutates: true,
    handler: editHandler("insert-before", "ast", (a) => ({
      symbolName: str(a, "symbol"),
      content: str(a, "content"),
    })),
  },
  {
    name: "insert_after",
    cliCommand: ["ast", "insert-after"],
    summary: "Insert code immediately after a symbol's declaration.",
    description:
      "Place new code directly below a named declaration — a sibling function, a " +
      "test, an export. Anchored to the symbol rather than to a line number. " +
      "Do NOT use it to append to the end of a file; anchor to the last symbol you " +
      "actually mean to follow.",
    params: [
      FILE_PARAM,
      { name: "symbol", type: "string", required: true, description: "Symbol to insert after." },
      { name: "content", type: "string", required: true, description: "Code to insert." },
      ...PROVENANCE_PARAMS,
      PREVIEW_PARAM,
    ],
    mutates: true,
    handler: editHandler("insert-after", "ast", (a) => ({
      symbolName: str(a, "symbol"),
      content: str(a, "content"),
    })),
  },

  /* — Routing and verification — */
  {
    name: "route_edit",
    cliCommand: ["route-edit"],
    summary: "Apply an edit and let HashPilot pick the safest tier automatically.",
    description:
      "Run any edit operation through the AST → hash → diff pipeline, choosing the " +
      "strongest tier the language and operation support and falling back when it " +
      "cannot. Use it when you do not want to reason about tiers. " +
      "Do NOT use it when you already know the tier — the specific tool gives a " +
      "clearer failure when its precondition is not met, instead of silently falling back.",
    params: [
      FILE_PARAM,
      { name: "operation", type: "string", required: true, description: "One of: rename-symbol, replace-body, add-import, remove-import, insert-before, insert-after, replace-hash, replace-content." },
      { name: "method", type: "string", required: false, description: "Force a tier: 'ast', 'hash', or 'diff'. Omit to auto-route." },
      { name: "oldHash", type: "string", required: false, description: "Anchor hash, for the hash tier." },
      { name: "newContent", type: "string", required: false, description: "Replacement content." },
      { name: "oldContent", type: "string", required: false, description: "Existing content to match, for the diff tier." },
      { name: "range", type: "string", required: false, description: "Line range as 'start:end', for the hash tier." },
      { name: "oldName", type: "string", required: false, description: "Current name, for rename-symbol." },
      { name: "newName", type: "string", required: false, description: "New name, for rename-symbol." },
      { name: "symbol", type: "string", required: false, description: "Symbol name, for body replacement and inserts." },
      { name: "newBody", type: "string", required: false, description: "New body, for replace-body." },
      { name: "importSpec", type: "string", required: false, description: "Import spec, for add-import and remove-import." },
      { name: "content", type: "string", required: false, description: "Content, for insert-before and insert-after." },
      ...PROVENANCE_PARAMS,
      PREVIEW_PARAM,
    ],
    mutates: true,
    handler: async (a) =>
      routeEdit({
        filePath: str(a, "file")!,
        operation: str(a, "operation")!,
        method: str(a, "method"),
        oldHash: str(a, "oldHash"),
        newContent: str(a, "newContent"),
        oldContent: str(a, "oldContent"),
        range: parseRangeArg(str(a, "range")),
        oldName: str(a, "oldName"),
        newName: str(a, "newName"),
        symbolName: str(a, "symbol"),
        newBody: str(a, "newBody"),
        importSpec: str(a, "importSpec"),
        content: str(a, "content"),
        dryRun: bool(a, "dryRun"),
        includeSource: bool(a, "includeSource"),
        actor: str(a, "actor"),
        taskId: str(a, "taskId"),
        reason: str(a, "reason"),
      } as Parameters<typeof routeEdit>[0]),
  },
  {
    name: "verify_changes",
    cliCommand: ["verify-changes"],
    summary: "Run the project's formatter, linter, and tests over changed files.",
    description:
      "Run the checks the project already defines, scoped to the files you edited. " +
      "Every check is opt-in, so ask for what you need. Call it after a batch of " +
      "edits, not after each one. " +
      "Do NOT treat a failure as proof your edit broke something unless a baseline " +
      "was recorded — pass `useBaseline` so pre-existing failures are subtracted.",
    params: [
      { name: "files", type: "string[]", required: true, description: "Files the checks should cover." },
      { name: "autoDetect", type: "boolean", required: false, description: "Detect the project's formatter, linter, and test runner from its manifest. Usually what you want." },
      { name: "formatter", type: "string", required: false, description: "Formatter command to run, e.g. 'prettier'. Overrides detection." },
      { name: "linter", type: "string", required: false, description: "Linter command to run, e.g. 'eslint'. Overrides detection." },
      { name: "typecheck", type: "string", required: false, description: "Type checker command, e.g. 'tsc --noEmit'." },
      { name: "testRunner", type: "string", required: false, description: "Test runner, e.g. 'bun test', 'vitest', 'pytest', 'go test'." },
      { name: "testFilter", type: "string", required: false, description: "Only run tests matching this pattern." },
      { name: "scopeTests", type: "boolean", required: false, description: "Run only tests related to the changed files. Default true." },
      { name: "useBaseline", type: "boolean", required: false, description: "Subtract tests that were already failing at this commit, so only new breakage fails the run." },
      { name: "revertOnFailure", type: "boolean", required: false, description: "Restore the files to their pre-edit contents if any check fails." },
      { name: "timeout", type: "number", required: false, description: "Per-check timeout in milliseconds. Default 30000." },
    ],
    mutates: true,
    handler: async (a) =>
      verifyChanges(strArray(a, "files"), {
        autoDetect: bool(a, "autoDetect"),
        formatter: str(a, "formatter"),
        linter: str(a, "linter"),
        typecheck: str(a, "typecheck"),
        testRunner: str(a, "testRunner"),
        testFilter: str(a, "testFilter"),
        // `scopeTests` defaults to true in the core; only an explicit false turns it off.
        scopeTests: a.scopeTests === undefined ? undefined : bool(a, "scopeTests"),
        useBaseline: bool(a, "useBaseline"),
        revertOnFailure: bool(a, "revertOnFailure"),
        timeout: num(a, "timeout"),
      }),
  },
];

/** Look an operation up by MCP tool name. */
export function getOperation(name: string): Operation | undefined {
  return OPERATIONS.find((o) => o.name === name);
}

/** JSON Schema for an operation's parameters, as MCP's `inputSchema`. */
export function inputSchemaFor(op: Operation): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const p of op.params) {
    properties[p.name] =
      p.type === "string[]"
        ? { type: "array", items: { type: "string" }, description: p.description }
        : { type: p.type, description: p.description };
  }
  return {
    type: "object",
    properties,
    required: op.params.filter((p) => p.required).map((p) => p.name),
    additionalProperties: false,
  };
}
