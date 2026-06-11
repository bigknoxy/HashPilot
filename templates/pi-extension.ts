import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { Type } from "@sinclair/typebox"

const STRUCTURED_EDIT = "structured-edit"

const MAX_BYTES = 50 * 1024

function truncate(value: string): string {
  if (Buffer.byteLength(value, "utf8") <= MAX_BYTES) return value
  return value.slice(0, MAX_BYTES) + "\n\n[Output truncated to 50KB]"
}

async function runSE(args: string[], pi: ExtensionAPI, signal: AbortSignal, cwd?: string): Promise<{ exitCode: number; output: string }> {
  const result = await pi.exec(STRUCTURED_EDIT, args, { cwd, signal })
  const output = result.stdout || result.stderr || ""
  return { exitCode: result.code, output: truncate(output) }
}

export default function (pi: ExtensionAPI) {
  // ── hashpilot_read ──────────────────────────────────
  pi.registerTool({
    name: "hashpilot_read",
    label: "HashPilot Read",
    description: "Read one or more files with content hashes for subsequent hash-anchored edits. Returns JSON array with path, content, hash, and line count.",
    promptSnippet: "Use hashpilot_read to batch-read files with hashes, then use hashpilot_replace_hash for edits.",
    promptGuidelines: [
      "Prefer hashpilot_read over raw file reads when you plan to edit the files afterward.",
      "Use the returned hash to anchor subsequent hashpilot_replace_hash calls.",
      "Batch multiple files in a single hashpilot_read call to minimize round trips.",
    ],
    parameters: Type.Object({
      files: Type.Array(Type.String({ description: "Absolute file paths to read" }), { description: "Files to read" }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const args = ["read-many", ...params.files]
      const { exitCode, output } = await runSE(args, pi, signal, ctx.cwd)
      return {
        isError: exitCode !== 0,
        content: [{ type: "text", text: output || "(no output)" }],
        details: { exitCode, command: `${STRUCTURED_EDIT} ${args.join(" ")}` },
      }
    },
  })

  // ── hashpilot_search ─────────────────────────────────
  pi.registerTool({
    name: "hashpilot_search",
    label: "HashPilot Search",
    description: "Search a regex pattern across multiple paths. Returns JSON with file, line, column, and content for each match.",
    promptSnippet: "Use hashpilot_search to find symbol definitions, references, or patterns across the codebase.",
    promptGuidelines: [
      "Use hashpilot_search for code search instead of manual grep.",
      "Combine with hashpilot_ast when you need symbol-level operations on TypeScript files.",
    ],
    parameters: Type.Object({
      pattern: Type.String({ description: "Regex pattern to search for" }),
      paths: Type.Array(Type.String(), { description: "Paths to search" }),
      ignoreCase: Type.Optional(Type.Boolean({ description: "Case insensitive search" })),
      filePattern: Type.Optional(Type.String({ description: "Glob pattern to filter files" })),
      maxResults: Type.Optional(Type.Number({ description: "Maximum number of results" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const args = ["grep-many", params.pattern, ...params.paths]
      if (params.ignoreCase) args.push("-i")
      if (params.filePattern) args.push("--file-pattern", params.filePattern)
      if (params.maxResults) args.push("--max-results", String(params.maxResults))
      const { exitCode, output } = await runSE(args, pi, signal, ctx.cwd)
      return {
        isError: exitCode !== 0,
        content: [{ type: "text", text: output || "(no output)" }],
        details: { exitCode, command: `${STRUCTURED_EDIT} ${args.join(" ")}` },
      }
    },
  })

  // ── hashpilot_read_hash ──────────────────────────────
  pi.registerTool({
    name: "hashpilot_read_hash",
    label: "HashPilot Read Hash",
    description: "Read a specific line with its hash and surrounding context. Use before hash-anchored edits to get the content hash anchor.",
    promptSnippet: "Use hashpilot_read_hash to get a line-level hash anchor before making hash-anchored edits.",
    promptGuidelines: [
      "Always call hashpilot_read_hash or hashpilot_read before hashpilot_replace_hash to get a current hash.",
      "Never guess hashes — stale hashes are rejected to prevent file corruption.",
    ],
    parameters: Type.Object({
      file: Type.String({ description: "Absolute file path" }),
      line: Type.Number({ description: "Line number (1-indexed)" }),
      context: Type.Optional(Type.Number({ description: "Number of context lines (default 3)", default: 3 })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const args = ["read-hash", params.file, String(params.line)]
      if (params.context) args.push("-c", String(params.context))
      const { exitCode, output } = await runSE(args, pi, signal, ctx.cwd)
      return {
        isError: exitCode !== 0,
        content: [{ type: "text", text: output || "(no output)" }],
        details: { exitCode },
      }
    },
  })

  // ── hashpilot_replace_hash ──────────────────────────
  pi.registerTool({
    name: "hashpilot_replace_hash",
    label: "HashPilot Replace Hash",
    description: "Replace file content identified by a hash anchor. The hash must match the current file state — stale hashes are rejected. Use hashpilot_read or hashpilot_read_hash to obtain a current hash first.",
    promptSnippet: "Use hashpilot_replace_hash for reliable file edits. Always obtain the hash from a prior read first.",
    promptGuidelines: [
      "ALWAYS read the file first (hashpilot_read or hashpilot_read_hash) to get a current hash before editing.",
      "Stale hashes are intentionally rejected to prevent overwriting changes — re-read and retry on stale-anchor errors.",
      "Use --range for partial replacements instead of replacing entire files.",
      "Prefer hashpilot_ast for TypeScript symbol-level operations (rename, replace-body, add-import, etc.).",
    ],
    parameters: Type.Object({
      file: Type.String({ description: "Absolute file path" }),
      oldHash: Type.String({ description: "Hash of the content to replace (from hashpilot_read or hashpilot_read_hash)" }),
      newContent: Type.String({ description: "New content to write (or @filepath to read from a file)" }),
      range: Type.Optional(Type.String({ description: "Line range as start:end (1-indexed, inclusive start, exclusive end)" })),
      dryRun: Type.Optional(Type.Boolean({ description: "Preview without writing" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const args = ["replace-hash", params.file, params.oldHash, params.newContent]
      if (params.range) args.push("--range", params.range)
      if (params.dryRun) args.push("--dry-run")
      const { exitCode, output } = await runSE(args, pi, signal, ctx.cwd)
      const result = JSON.parse(output || "{}")
      const isStale = result.stale === true
      return {
        isError: exitCode !== 0 || !result.success,
        content: [{ type: "text", text: output || "(no output)" }],
        details: { exitCode, stale: isStale, fallbackReason: isStale ? "stale-anchor" : undefined },
      }
    },
  })

  // ── hashpilot_ast ────────────────────────────────────
  pi.registerTool({
    name: "hashpilot_ast",
    label: "HashPilot AST",
    description: "Syntax-aware editing for TypeScript/TSX files via tree-sitter. Supports find-symbols, rename-symbol, replace-body, add-import, remove-import, insert-before, insert-after. Prefer this over hash-based editing for TypeScript files.",
    promptSnippet: "Use hashpilot_ast for TypeScript/TSX symbol-level operations. Prefer over hash edits for these file types.",
    promptGuidelines: [
      "Use hashpilot_ast for all TypeScript/TSX edits involving symbol renaming, function body replacement, or import management.",
      "For find-symbols, use operation='find-symbols' to list symbols in a file.",
      "Always verify changes with hashpilot_verify after AST edits.",
    ],
    parameters: Type.Object({
      operation: Type.Union([
        Type.Literal("find-symbols"),
        Type.Literal("rename-symbol"),
        Type.Literal("replace-body"),
        Type.Literal("add-import"),
        Type.Literal("remove-import"),
        Type.Literal("insert-before"),
        Type.Literal("insert-after"),
      ], { description: "AST operation to perform" }),
      file: Type.String({ description: "Absolute file path (must be .ts or .tsx)" }),
      name: Type.Optional(Type.String({ description: "Symbol name (for rename-symbol, replace-body, insert-before, insert-after)" })),
      newName: Type.Optional(Type.String({ description: "New name (for rename-symbol)" })),
      body: Type.Optional(Type.String({ description: "New body content (for replace-body, insert-before, insert-after)" })),
      importSpec: Type.Optional(Type.String({ description: "Import spec (for add-import, remove-import), e.g. '{ Foo } from ./bar'" })),
      dryRun: Type.Optional(Type.Boolean({ description: "Preview without writing" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const subCmd = `ast ${params.operation}`
      const args: string[] = [subCmd, params.file]

      switch (params.operation) {
        case "find-symbols":
          break
        case "rename-symbol":
          args.push(params.name || "", params.newName || "")
          break
        case "replace-body":
          args.push(params.name || "", params.body || "")
          break
        case "add-import":
        case "remove-import":
          args.push(params.importSpec || "")
          break
        case "insert-before":
        case "insert-after":
          args.push(params.name || "", params.body || "")
          break
      }

      if (params.dryRun) args.push("--dry-run")
      const { exitCode, output } = await runSE(args, pi, signal, ctx.cwd)
      return {
        isError: exitCode !== 0,
        content: [{ type: "text", text: output || "(no output)" }],
        details: { exitCode, operation: params.operation },
      }
    },
  })

  // ── hashpilot_verify ─────────────────────────────────
  pi.registerTool({
    name: "hashpilot_verify",
    label: "HashPilot Verify",
    description: "Run formatter, linter, and/or tests on changed files. Bundles verification into a single call.",
    promptSnippet: "Use hashpilot_verify after edits to confirm changes pass formatting, linting, and tests.",
    promptGuidelines: [
      "Always verify after making edits — especially after AST operations.",
      "Pass formatter, linter, or testFilter to enable relevant checks.",
    ],
    parameters: Type.Object({
      files: Type.Array(Type.String(), { description: "Files to verify" }),
      formatter: Type.Optional(Type.String({ description: "Formatter command (e.g., 'prettier')" })),
      linter: Type.Optional(Type.String({ description: "Linter command (e.g., 'eslint')" })),
      testFilter: Type.Optional(Type.String({ description: "Test filter pattern" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const args = ["verify-changes", ...params.files]
      if (params.formatter) args.push("--formatter", params.formatter)
      if (params.linter) args.push("--linter", params.linter)
      if (params.testFilter) args.push("--test-filter", params.testFilter)
      const { exitCode, output } = await runSE(args, pi, signal, ctx.cwd)
      return {
        isError: exitCode !== 0,
        content: [{ type: "text", text: output || "(no output)" }],
        details: { exitCode },
      }
    },
  })

  // ── hashpilot_status ─────────────────────────────────
  pi.registerTool({
    name: "hashpilot_status",
    label: "HashPilot Status",
    description: "Show HashPilot routing info and telemetry summary. Use to check which edit route would be chosen for a file+operation, or to review recent operation telemetry.",
    promptSnippet: "Use hashpilot_status to check edit routing decisions or review telemetry.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("route"),
        Type.Literal("telemetry"),
      ], { description: "Action: 'route' to check edit routing, 'telemetry' to show summary" }),
      file: Type.Optional(Type.String({ description: "File path (for route action)" })),
      operation: Type.Optional(Type.String({ description: "Operation name (for route action)" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (params.action === "route") {
        const args = ["route", params.file || ".", params.operation || "replace-hash"]
        const { exitCode, output } = await runSE(args, pi, signal, ctx.cwd)
        return {
          isError: exitCode !== 0,
          content: [{ type: "text", text: output || "(no output)" }],
          details: { exitCode },
        }
      }
      const args = ["telemetry", "summary"]
      const { exitCode, output } = await runSE(args, pi, signal, ctx.cwd)
      return {
        isError: exitCode !== 0,
        content: [{ type: "text", text: output || "(no output)" }],
        details: { exitCode },
      }
    },
  })

  // ── /hp slash command ────────────────────────────────
  pi.registerCommand("hp", {
    description: "HashPilot: structured editing status. Usage: /hp [route <file> <op>|telemetry]",
    async handler(args, _ctx) {
      const parts = (args || "").trim().split(/\s+/)
      if (parts[0] === "route" && parts[1] && parts[2]) {
        const proc = await pi.exec(STRUCTURED_EDIT, ["route", parts[1], parts[2]], {})
        return proc.stdout || proc.stderr || "(no output)"
      }
      if (parts[0] === "telemetry") {
        const proc = await pi.exec(STRUCTURED_EDIT, ["telemetry", "summary"], {})
        return proc.stdout || proc.stderr || "(no output)"
      }
      const proc = await pi.exec(STRUCTURED_EDIT, ["--version"], {})
      return `HashPilot v${proc.stdout?.trim() || "unknown"}\n\nCommands: route <file> <op> | telemetry`
    },
  })

  // ── Enable/disable flag ──────────────────────────────
  pi.registerFlag("hashpilot_enabled", {
    description: "Enable or disable HashPilot structured editing tools",
    type: "boolean",
    default: true,
  })
}