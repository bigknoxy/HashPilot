#!/usr/bin/env bun
import { Command } from "commander";
// Single source of truth for the version. Bun inlines this JSON import at build
// time, so dist/ carries the real version instead of a hardcoded literal.
import pkg from "../package.json" with { type: "json" };
import {
  readMany,
  readHash,
  computeHash,
  grepMany,
  symbolLookupMany,
  replaceHash,
  findSymbols,
  renameSymbol,
  replaceBody,
  addImport,
  removeImport,
  insertBeforeSymbol,
  insertAfterSymbol,
  detectLanguage,
  verifyChanges,
  recordEvent,
  readEvents,
  lastReadSkipped,
  TelemetryReadError,
  clearEvents,
  summary,
  health,
  healthTrend,
  chooseRoute,
  astCapabilities,
  loadConfig,
  doctor,
  routeEdit,
  editMany,
  editManySerial,
  executeIntent,
  generateUnifiedDiff,
  applyPatch,
  ErrorCode,
  listSessions,
  exportEvents,
  pruneEvents,
  createChangeSet,
  configureSnapshots,
  setCurrentChangeSet,
  listChangeSets,
  lastChangeSetId,
  undoChangeSet,
  pruneSnapshots,
  buildProvenanceFields,
  provenanceQuery,
  changeSetQuery,
  formatProvenanceHuman,
  safeWrite,
  assertWritable,
  PathDeniedError,
  configureWriteBoundary,
  finish,
  usageError,
  setCommand,
  setAllowParseErrors,
  addWarning,
  ExitCode,
  exitCodeFor,
  configureTelemetry,
  enableTelemetry,
  resolveTelemetryEnabled,
} from "./core/index";
import type { TelemetryEvent } from "./core/telemetry";

const VERSION: string = pkg.version;

const program = new Command();

/**
 * Parse `--range`. Accepts `N` (meaning `N:N`) or `N:M`, both 1-indexed and
 * inclusive. Returns an error string rather than throwing so the caller can
 * emit it through `usageError`.
 *
 * The old implementation was `opts.range.split(":").map(Number)`, which turned
 * `--range 5` into `{start: 5, end: NaN}` and silently duplicated the file.
 */
function parseRange(raw: string): { range: { start: number; end: number } } | { error: string } {
  const match = /^(\d+)(?::(\d+))?$/.exec(raw.trim());
  if (!match) {
    return { error: `Invalid --range "${raw}": expected N or N:M with positive integers.` };
  }
  const start = Number(match[1]);
  const end = match[2] === undefined ? start : Number(match[2]);
  if (start < 1) return { error: `Invalid --range "${raw}": line numbers are 1-indexed.` };
  if (start > end) return { error: `Invalid --range "${raw}": start is after end.` };
  return { range: { start, end } };
}

/** Parse a numeric flag, rejecting the NaN that bare `parseInt` yields on garbage. */
function parseIntFlag(raw: string | undefined, name: string, fallback: number): number | { error: string } {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(String(raw).trim())) {
    return { error: `Invalid ${name} "${raw}": expected a non-negative integer.` };
  }
  return Number(raw);
}

program
  .name("structured-edit")
  .description("HashPilot — Structured Editing Core for Coding Agents")
  .version(VERSION)
  .option("--allow-outside-root", "Permit writes outside the project root (credentials and system paths stay blocked)")
  .option("--allowed-root <dir...>", "Additional directory writes may target")
  .option("--no-telemetry", "Disable telemetry logging for this invocation")
  .option("--allow-parse-errors", "Edit a file that already has syntax errors (the post-edit parse check still applies)")
  .hook("preAction", (thisCommand, actionCommand) => {
    // Name the running subcommand so the envelope can report it. Walk up so
    // nested commands read as "telemetry show", not "show".
    const path: string[] = [];
    for (let c: typeof actionCommand | null = actionCommand; c && c.parent; c = c.parent) path.unshift(c.name());
    setCommand(path.join(" "));
    const globals = thisCommand.opts();
    const config = loadConfig();
    configureWriteBoundary({
      allowOutsideRoot: Boolean(globals.allowOutsideRoot),
      allowedRoots: [...(config.allowedRoots || []), ...(globals.allowedRoot || [])],
    });
    // Apply sizing/retention from config, then the kill switch, so the CLI flag
    // and env var win over `telemetry.enabled`.
    configureTelemetry(config.telemetry);
    enableTelemetry(resolveTelemetryEnabled(config.telemetry, globals.telemetry === false));
    setAllowParseErrors(Boolean(globals.allowParseErrors));

    // Every write this invocation makes belongs to one changeSet, so `undo`
    // has a unit to work in even for commands that never mint one themselves.
    configureSnapshots(config.snapshots);
    setCurrentChangeSet(config.snapshots?.enabled === false ? null : createChangeSet());
    pruneSnapshots();
  });

program
  .command("read-many")
  .description("Read multiple files, return content + hashes")
  .argument("<files...>", "File paths")
  .option("--json", "Output as JSON", true)
  .action(async (files: string[], opts) => {
    const start = Date.now();
    const results = await readMany(files);
    recordEvent({
      operation: "read-many",
      route: "read",
      files_count: files.length,
      success: !results.some((r) => r.error),
      elapsed_ms: Date.now() - start,
    });
    finish(results);
  });

program
  .command("read-hash")
  .description("Read a line with hash and context")
  .argument("<file>", "File path")
  .argument("<line>", "Line number", parseInt)
  .option("-c, --context <n>", "Context lines", "3")
  .option("--json", "Output as JSON", true)
  .action(async (file: string, line: number, opts) => {
    const start = Date.now();
    const context = parseIntFlag(opts.context, "--context", 3);
    if (typeof context === "object") return usageError(context.error, { path: file });
    const result = await readHash(file, line, context);
    recordEvent({
      operation: "read-hash",
      route: "hash",
      file,
      success: !result.error,
      lines_read: 1 + (result.contextBefore?.length || 0) + (result.contextAfter?.length || 0),
      elapsed_ms: Date.now() - start,
    });
    finish(result);
  });

program
  .command("grep-many")
  .description("Search pattern across multiple paths")
  .argument("<pattern>", "Regex pattern")
  .argument("<paths...>", "Paths to search")
  .option("-i, --ignore-case", "Case insensitive")
  .option("--file-pattern <glob>", "File pattern filter")
  .option("--max-results <n>", "Max results", parseInt)
  .option("--json", "Output as JSON", true)
  .action(async (pattern: string, paths: string[], opts) => {
    const result = await grepMany(pattern, paths, {
      ignoreCase: opts.ignoreCase,
      filePattern: opts.filePattern,
      maxResults: opts.maxResults,
    });
    recordEvent({
      operation: "grep-many",
      route: "grep",
      files_count: paths.length,
      success: !result.error,
      elapsed_ms: result.elapsed_ms,
    });
    finish(result);
  });

program
  .command("symbol-lookup-many")
  .description("Find symbol definitions. Usage: symbol-lookup-many <paths...> --names n1,n2")
  .argument("<paths...>", "Paths to search")
  .option("--names <names>", "Comma-separated symbol names")
  .option("--json", "Output as JSON", true)
  .action(async (paths: string[], opts) => {
    const names = (opts.names || "").split(",").filter(Boolean);
    const results = await symbolLookupMany(names, paths);
    finish(results);
  });

program
  .command("replace-hash")
  .description("Replace content identified by hash anchor")
  .argument("<file>", "File path")
  .argument("<old-hash>", "Hash of content to replace")
  .argument("<new-content>", "New content (or @file to read from file)")
  .option("--range <start:end>", "Line range (1-indexed). N or N:M")
  .option("--no-recover", "Fail immediately on a stale anchor instead of attempting relocation")
  .option("--dry-run", "Preview without writing")
  .option("--actor <name>", "Agent identity for provenance tracking")
  .option("--task-id <id>", "Task/issue reference for provenance")
  .option("--reason <text>", "Human-readable reason for the edit")
  .option("--json", "Output as JSON", true)
  .action(async (file: string, oldHash: string, newContent: string, opts) => {
    let content = newContent;
    if (newContent.startsWith("@")) {
      content = await Bun.file(newContent.slice(1)).text();
    }
    let range: { start: number; end: number } | undefined;
    if (opts.range) {
      const parsed = parseRange(opts.range);
      if ("error" in parsed) return usageError(parsed.error, { path: file });
      range = parsed.range;
    }
    const result = await replaceHash(file, oldHash, content, {
      range,
      dryRun: opts.dryRun,
      // Commander maps --no-recover to opts.recover === false.
      recovery: opts.recover === false ? "off" : "relocate",
      skipParseCheck: Boolean(program.opts().allowParseErrors),
    });
    const provFields = buildProvenanceFields({
      actor: opts.actor,
      taskId: opts.taskId,
      reason: opts.reason,
      filePath: file,
    });
    recordEvent({
      operation: "replace-hash",
      route: "hash",
      file,
      language: detectLanguage(file) || undefined,
      success: result.success,
      fallback_reason: result.stale ? "stale-anchor" : undefined,
      retries: result.retries ?? 0,
      elapsed_ms: 0,
      ...provFields,
    });
    finish(result);
  });

const astCmd = program
  .command("ast")
  .description("Syntax-aware editing via tree-sitter");

astCmd
  .command("capabilities")
  .description("Show supported AST languages, operations, and limitations")
  .action(() => {
    finish(astCapabilities());
  });

astCmd
  .command("find-symbols")
  .description("List symbols in a file")
  .argument("<file>", "File path")
  .action(async (file: string) => {
    const content = await Bun.file(file).text();
    const symbols = findSymbols(content, file);
    finish(symbols);
  });

function recordProvenanceEvent(opts: {
  operation: string; route: TelemetryEvent["route"]; file: string; success: boolean; elapsed_ms: number;
  source?: string; newSource?: string; errorCode?: ErrorCode; language?: string;
  actor?: string; taskId?: string; reason?: string; filePath?: string;
}) {
  const provFields = buildProvenanceFields({
    actor: opts.actor, taskId: opts.taskId, reason: opts.reason,
    source: opts.source, newSource: opts.newSource, filePath: opts.filePath,
  });
  recordEvent({
    operation: opts.operation, route: opts.route, file: opts.file,
    language: opts.language, success: opts.success, elapsed_ms: opts.elapsed_ms,
    errorCode: opts.errorCode, ...provFields,
  });
}

astCmd
  .command("rename-symbol")
  .description("Rename a symbol across a file")
  .argument("<file>", "File path")
  .argument("<old-name>", "Current symbol name")
  .argument("<new-name>", "New symbol name")
  .option("--dry-run", "Preview only")
  .option("--actor <name>", "Agent identity for provenance tracking")
  .option("--task-id <id>", "Task/issue reference for provenance")
  .option("--reason <text>", "Human-readable reason for the edit")
  .option("--json", "Output as JSON", true)
  .action(async (file: string, oldName: string, newName: string, opts) => {
    const start = Date.now();
    const content = await Bun.file(file).text();
    const result = renameSymbol(content, file, oldName, newName);
    if (result.success && result.newSource && !opts.dryRun) {
      await safeWrite(file, result.newSource);
    }
    recordProvenanceEvent({
      operation: "rename-symbol", route: "ast", file,
      language: detectLanguage(file) || undefined,
      success: result.success, elapsed_ms: Date.now() - start,
      errorCode: result.success ? undefined : ErrorCode.PARSE_ERROR,
      source: content, newSource: result.newSource, filePath: file,
      actor: opts.actor, taskId: opts.taskId, reason: opts.reason,
    });
    finish(result);
  });

astCmd
  .command("replace-body")
  .description("Replace function/method body")
  .argument("<file>", "File path")
  .argument("<symbol>", "Symbol name")
  .argument("<new-body>", "New body (or @file)")
  .option("--dry-run", "Preview only")
  .option("--actor <name>", "Agent identity for provenance tracking")
  .option("--task-id <id>", "Task/issue reference for provenance")
  .option("--reason <text>", "Human-readable reason for the edit")
  .option("--json", "Output as JSON", true)
  .action(async (file: string, symbol: string, newBody: string, opts) => {
    const start = Date.now();
    let body = newBody;
    if (newBody.startsWith("@")) body = await Bun.file(newBody.slice(1)).text();
    const content = await Bun.file(file).text();
    const result = replaceBody(content, file, symbol, body);
    if (result.success && result.newSource && !opts.dryRun) {
      await safeWrite(file, result.newSource);
    }
    recordProvenanceEvent({
      operation: "replace-body", route: "ast", file,
      language: detectLanguage(file) || undefined,
      success: result.success, elapsed_ms: Date.now() - start,
      errorCode: result.success ? undefined : ErrorCode.PARSE_ERROR,
      source: content, newSource: result.newSource, filePath: file,
      actor: opts.actor, taskId: opts.taskId, reason: opts.reason,
    });
    finish(result);
  });

astCmd
  .command("add-import")
  .description("Add an import statement")
  .argument("<file>", "File path")
  .argument("<import-spec>", "Import spec (e.g. '{ Foo } from ./bar')")
  .option("--dry-run", "Preview only")
  .option("--actor <name>", "Agent identity for provenance tracking")
  .option("--task-id <id>", "Task/issue reference for provenance")
  .option("--reason <text>", "Human-readable reason for the edit")
  .option("--json", "Output as JSON", true)
  .action(async (file: string, importSpec: string, opts) => {
    const start = Date.now();
    const content = await Bun.file(file).text();
    const result = addImport(content, file, importSpec);
    if (result.success && result.newSource && !opts.dryRun) {
      await safeWrite(file, result.newSource);
    }
    recordProvenanceEvent({
      operation: "add-import", route: "ast", file,
      language: detectLanguage(file) || undefined,
      success: result.success, elapsed_ms: Date.now() - start,
      errorCode: result.success ? undefined : ErrorCode.PARSE_ERROR,
      source: content, newSource: result.newSource, filePath: file,
      actor: opts.actor, taskId: opts.taskId, reason: opts.reason,
    });
    finish(result);
  });

astCmd
  .command("remove-import")
  .description("Remove an import statement")
  .argument("<file>", "File path")
  .argument("<import-spec>", "Import spec to remove")
  .option("--dry-run", "Preview only")
  .option("--actor <name>", "Agent identity for provenance tracking")
  .option("--task-id <id>", "Task/issue reference for provenance")
  .option("--reason <text>", "Human-readable reason for the edit")
  .option("--json", "Output as JSON", true)
  .action(async (file: string, importSpec: string, opts) => {
    const start = Date.now();
    const content = await Bun.file(file).text();
    const result = removeImport(content, file, importSpec);
    if (result.success && result.newSource && !opts.dryRun) {
      await safeWrite(file, result.newSource);
    }
    recordProvenanceEvent({
      operation: "remove-import", route: "ast", file,
      language: detectLanguage(file) || undefined,
      success: result.success, elapsed_ms: Date.now() - start,
      errorCode: result.success ? undefined : ErrorCode.PARSE_ERROR,
      source: content, newSource: result.newSource, filePath: file,
      actor: opts.actor, taskId: opts.taskId, reason: opts.reason,
    });
    finish(result);
  });

astCmd
  .command("insert-before")
  .description("Insert content before a symbol")
  .argument("<file>", "File path")
  .argument("<symbol>", "Symbol name")
  .argument("<content>", "Content to insert (or @file)")
  .option("--dry-run", "Preview only")
  .option("--actor <name>", "Agent identity for provenance tracking")
  .option("--task-id <id>", "Task/issue reference for provenance")
  .option("--reason <text>", "Human-readable reason for the edit")
  .option("--json", "Output as JSON", true)
  .action(async (file: string, symbol: string, content: string, opts) => {
    const start = Date.now();
    let c = content;
    if (c.startsWith("@")) c = await Bun.file(c.slice(1)).text();
    const src = await Bun.file(file).text();
    const result = insertBeforeSymbol(src, file, symbol, c);
    if (result.success && result.newSource && !opts.dryRun) {
      await safeWrite(file, result.newSource);
    }
    recordProvenanceEvent({
      operation: "insert-before", route: "ast", file,
      language: detectLanguage(file) || undefined,
      success: result.success, elapsed_ms: Date.now() - start,
      errorCode: result.success ? undefined : ErrorCode.PARSE_ERROR,
      source: src, newSource: result.newSource, filePath: file,
      actor: opts.actor, taskId: opts.taskId, reason: opts.reason,
    });
    finish(result);
  });

astCmd
  .command("insert-after")
  .description("Insert content after a symbol")
  .argument("<file>", "File path")
  .argument("<symbol>", "Symbol name")
  .argument("<content>", "Content to insert (or @file)")
  .option("--dry-run", "Preview only")
  .option("--actor <name>", "Agent identity for provenance tracking")
  .option("--task-id <id>", "Task/issue reference for provenance")
  .option("--reason <text>", "Human-readable reason for the edit")
  .option("--json", "Output as JSON", true)
  .action(async (file: string, symbol: string, content: string, opts) => {
    const start = Date.now();
    let c = content;
    if (c.startsWith("@")) c = await Bun.file(c.slice(1)).text();
    const src = await Bun.file(file).text();
    const result = insertAfterSymbol(src, file, symbol, c);
    if (result.success && result.newSource && !opts.dryRun) {
      await safeWrite(file, result.newSource);
    }
    recordProvenanceEvent({
      operation: "insert-after", route: "ast", file,
      language: detectLanguage(file) || undefined,
      success: result.success, elapsed_ms: Date.now() - start,
      errorCode: result.success ? undefined : ErrorCode.PARSE_ERROR,
      source: src, newSource: result.newSource, filePath: file,
      actor: opts.actor, taskId: opts.taskId, reason: opts.reason,
    });
    finish(result);
  });

program
  .command("route-edit")
  .description("Auto-routed structured edit through AST → Hash → Diff pipeline")
  .argument("<file>", "File path")
  .argument("<operation>", "Operation (rename-symbol, replace-body, add-import, remove-import, insert-before, insert-after, replace-hash, replace-content)")
  .option("--method <route>", "Force a specific route (ast, hash, diff)")
  .option("--old-hash <hash>", "Hash for hash-route verification")
  .option("--new-content <text>", "New content (or @file)")
  .option("--old-content <text>", "Old content for diff-route search-and-replace")
  .option("--range <start:end>", "Line range for hash route")
  .option("--old-name <name>", "Old symbol name (rename-symbol)")
  .option("--new-name <name>", "New symbol name (rename-symbol)")
  .option("--symbol <name>", "Symbol name (replace-body, insert-before, insert-after)")
  .option("--new-body <text>", "New body content (replace-body, or @file)")
  .option("--import-spec <spec>", "Import spec (add-import, remove-import)")
  .option("--content <text>", "Content (insert-before, insert-after, or @file)")
  .option("--policy <json>", "Inline RoutePolicy JSON")
  .option("--dry-run", "Preview without writing")
  .option("--actor <name>", "Agent identity for provenance tracking")
  .option("--task-id <id>", "Task/issue reference for provenance")
  .option("--reason <text>", "Human-readable reason for the edit")
  .option("--json", "Output as JSON", true)
  .action(async (file: string, operation: string, opts) => {
    const resolveContent = async (val?: string): Promise<string | undefined> => {
      // An explicit empty string is a deletion, not an omitted argument (#40).
      if (val === undefined) return undefined;
      if (val.startsWith("@")) return await Bun.file(val.slice(1)).text();
      return val;
    };

    const result = await routeEdit({
      filePath: file,
      operation,
      method: opts.method,
      oldHash: opts.oldHash,
      newContent: await resolveContent(opts.newContent),
      oldContent: opts.oldContent,
      range: opts.range ? (([s, e]: number[]) => ({ start: s, end: e }))(opts.range.split(":").map(Number)) : undefined,
      oldName: opts.oldName,
      newName: opts.newName,
      symbolName: opts.symbol,
      newBody: await resolveContent(opts.newBody),
      importSpec: opts.importSpec,
      content: await resolveContent(opts.content),
      policy: opts.policy ? JSON.parse(opts.policy) : undefined,
      dryRun: opts.dryRun,
      actor: opts.actor,
      taskId: opts.taskId,
      reason: opts.reason,
    });

    finish(result);
  });

program
  .command("batch")
  .description("Apply the same edit to multiple files in parallel")
  .argument("<operation>", "Operation (rename-symbol, replace-body, add-import, remove-import, insert-before, insert-after, replace-hash, replace-content)")
  .argument("<files...>", "Files to edit")
  .option("--method <route>", "Force a specific route (ast, hash, diff)")
  .option("--old-hash <hash>", "Hash for hash-route verification")
  .option("--new-content <text>", "New content (or @file)")
  .option("--old-content <text>", "Old content for diff-route search-and-replace")
  .option("--range <start:end>", "Line range for hash route")
  .option("--old-name <name>", "Old symbol name (rename-symbol)")
  .option("--new-name <name>", "New symbol name (rename-symbol)")
  .option("--symbol <name>", "Symbol name (replace-body, insert-before, insert-after)")
  .option("--new-body <text>", "New body content (replace-body, or @file)")
  .option("--import-spec <spec>", "Import spec (add-import, remove-import)")
  .option("--content <text>", "Content (insert-before, insert-after, or @file)")
  .option("--policy <json>", "Inline RoutePolicy JSON")
  .option("--serial", "Execute sequentially instead of parallel")
  .option("--dry-run", "Preview without writing")
  .option("--actor <name>", "Agent identity for provenance tracking")
  .option("--task-id <id>", "Task/issue reference for provenance")
  .option("--reason <text>", "Human-readable reason for the edit")
  .option("--json", "Output as JSON", true)
  .action(async (operation: string, files: string[], opts) => {
    const resolveContent = async (val?: string): Promise<string | undefined> => {
      // An explicit empty string is a deletion, not an omitted argument (#40).
      if (val === undefined) return undefined;
      if (val.startsWith("@")) return await Bun.file(val.slice(1)).text();
      return val;
    };

    const batchParams = {
      files,
      operation,
      method: opts.method,
      oldHash: opts.oldHash,
      newContent: await resolveContent(opts.newContent),
      oldContent: opts.oldContent,
      range: opts.range ? (([s, e]: number[]) => ({ start: s, end: e }))(opts.range.split(":").map(Number)) : undefined,
      oldName: opts.oldName,
      newName: opts.newName,
      symbolName: opts.symbol,
      newBody: await resolveContent(opts.newBody),
      importSpec: opts.importSpec,
      content: await resolveContent(opts.content),
      policy: opts.policy ? JSON.parse(opts.policy) : undefined,
      dryRun: opts.dryRun,
      actor: opts.actor,
      taskId: opts.taskId,
      reason: opts.reason,
    };

    const result = opts.serial
      ? await editManySerial(batchParams)
      : await editMany(batchParams);

    finish(result);
  });

program
  .command("intent")
  .description("Execute an editing intent — one command, full blast radius")
  .argument("<intent>", "Intent as JSON: {\"operation\":\"add-parameter\",\"symbol\":\"fn\",\"param\":{\"name\":\"x\"}}")
  .option("--project-root <dir>", "Project root directory")
  .option("--dry-run", "Preview plan without modifying files")
  .option("--yes", "Apply the plan even though part of the intent could not be resolved")
  .option("--no-verify", "Skip verification after execution")
  .option("--no-revert", "Don't roll back on failure")
  .option("--timeout <ms>", "Timeout per operation in ms", "30000")
  .option("--actor <name>", "Agent identity for provenance tracking")
  .option("--task-id <id>", "Task/issue reference for provenance")
  .option("--reason <text>", "Human-readable reason for the edit")
  .option("--context <text>", "Agent prompt/context (or @file)")
  .option("--json", "Output as JSON", true)
  .action(async (intent: string, opts) => {
    try {
      let context = opts.context;
      if (context && context.startsWith("@")) {
        context = await Bun.file(context.slice(1)).text();
      }

      const result = await executeIntent(intent, {
        projectRoot: opts.projectRoot || process.cwd(),
        dryRun: opts.dryRun,
        yes: Boolean(opts.yes),
        verify: opts.verify,
        revertOnFailure: opts.revert,
        timeout: parseInt(opts.timeout),
        actor: opts.actor,
        taskId: opts.taskId,
        reason: opts.reason,
        context,
      });

      if (opts.json) {
        finish(result);
      } else {
        console.log(`Intent: ${result.plan.intent.operation} on '${result.plan.definition.name}'`);
        console.log(`Impact: ${result.plan.impactSummary}`);
        for (const u of result.plan.unresolved) {
          console.log(`Unresolved (${u.file}): ${u.reason}`);
          console.log(`  → ${u.resolution}`);
        }
        console.log(`Success: ${result.success}`);
        if (result.execution.verification) {
          console.log(`Verification: ${result.execution.verification.overall}`);
        }
        // Human output still has to carry the exit contract — an agent may run
        // without --json and branch on the code.
        process.exitCode = exitCodeFor(result);
      }
    } catch (err: any) {
      console.error(`Intent failed: ${err.message}`);
      process.exitCode = 1;
    }
  });

const diffCmd = program
  .command("diff")
  .description("Unified diff generation and patch application");

diffCmd
  .command("generate")
  .description("Generate a unified diff between old and new content")
  .argument("<file>", "File path (for diff header)")
  .argument("<old-content>", "Old content (or @file)")
  .argument("<new-content>", "New content (or @file)")
  .option("-c, --context <n>", "Context lines", "3")
  .option("--raw", "Print the diff text alone, without the JSON envelope")
  .action(async (file: string, oldContent: string, newContent: string, opts) => {
    const start = Date.now();
    let oldSrc = oldContent;
    let newSrc = newContent;
    if (oldContent.startsWith("@")) oldSrc = await Bun.file(oldContent.slice(1)).text();
    if (newContent.startsWith("@")) newSrc = await Bun.file(newContent.slice(1)).text();
    const diff = generateUnifiedDiff(oldSrc, newSrc, file, parseInt(opts.context));
    recordEvent({
      operation: "diff-generate",
      route: "diff",
      file,
      success: true,
      elapsed_ms: Date.now() - start,
    });
    // The diff itself is the payload; it rides the envelope like every other
    // command so a consumer has one parse path (`--raw` prints it bare).
    if (opts.raw) {
      console.log(diff || "(no changes)");
      return;
    }
    finish({ path: file, changed: diff.length > 0, diff }, ExitCode.OK);
  });

diffCmd
  .command("apply")
  .description("Apply a unified diff patch to a file")
  .argument("<file>", "File to patch")
  .option("--patch <file>", "Patch file to apply (or '-' for stdin)")
  .option("--dry-run", "Preview without writing")
  .option("-f, --fuzzy <n>", "Fuzzy match tolerance", "3")
  .option("--actor <name>", "Agent identity for provenance tracking")
  .option("--task-id <id>", "Task/issue reference for provenance")
  .option("--reason <text>", "Human-readable reason for the edit")
  .option("--json", "Output as JSON", true)
  .action(async (file: string, opts) => {
    const start = Date.now();
    let patchText: string;
    if (opts.patch === "-") {
      // Read from stdin
      const chunks: string[] = [];
      for await (const chunk of Bun.stdin.stream()) {
        chunks.push(Buffer.from(chunk).toString());
      }
      patchText = chunks.join("");
    } else if (opts.patch) {
      patchText = await Bun.file(opts.patch).text();
    } else {
      // Must return: without it, patchText is unassigned and applyPatch throws.
      return usageError("--patch is required", { path: file });
    }
    const fuzzy = parseIntFlag(opts.fuzzy, "--fuzzy", 3);
    if (typeof fuzzy === "object") return usageError(fuzzy.error, { path: file });
    const result = await applyPatch(file, patchText, {
      dryRun: opts.dryRun,
      fuzzyMatch: fuzzy,
    });
    const provFields = buildProvenanceFields({
      actor: opts.actor, taskId: opts.taskId, reason: opts.reason, filePath: file,
    });
    recordEvent({
      operation: "diff-apply",
      route: "diff",
      file,
      language: detectLanguage(file) || undefined,
      success: result.success,
      elapsed_ms: Date.now() - start,
      ...provFields,
    });
    finish(result);
  });

program
  .command("verify-changes")
  .description("Run formatter, linter, typechecker, and tests on changed files")
  .argument("<files...>", "Files to verify")
  .option("--formatter <cmd>", "Formatter command")
  .option("--linter <cmd>", "Linter command")
  .option("--typecheck <cmd>", "Type checker command (e.g. 'tsc --noEmit')")
  .option("--test-filter <pattern>", "Test filter pattern")
  .option("--test-runner <runner>", "Test runner (bun test, vitest, jest, pytest, go test, cargo test)")
  .option("--formatter-args <args...>", "Formatter args")
  .option("--linter-args <args...>", "Linter args")
  .option("--test-args <args...>", "Test runner args")
  .option("--auto-detect", "Auto-detect tools from project config files")
  .option("--allow-arbitrary-tool", "Allow binaries outside the allowlist (warns on each use)")
  .option("--revert-on-failure", "Restore original file contents if any check fails")
  .option("--timeout <ms>", "Per-check timeout in ms (default 30000)", parseInt)
  .option("--json", "Output as JSON", true)
  .action(async (files: string[], opts) => {
    const result = await verifyChanges(files, {
      formatter: opts.formatter,
      linter: opts.linter,
      typecheck: opts.typecheck,
      testFilter: opts.testFilter,
      testRunner: opts.testRunner,
      formatterArgs: opts.formatterArgs,
      linterArgs: opts.linterArgs,
      testArgs: opts.testArgs,
      autoDetect: opts.autoDetect,
      allowArbitraryTool: opts.allowArbitraryTool ?? false,
      revertOnFailure: opts.revertOnFailure,
      timeout: opts.timeout,
    });
    finish(result);
  });

/**
 * Corruption must be visible. It rides the envelope's `warnings` array (so a
 * machine consumer sees it) and stderr (so a human running the command does).
 */
function warnSkipped(): void {
  const skipped = lastReadSkipped();
  if (skipped > 0) {
    const message = `skipped ${skipped} malformed telemetry line(s) — the log is corrupt`;
    addWarning({ code: "TELEMETRY_LOG_CORRUPT", message, skipped });
    console.error(`warning: ${message}`);
  }
}

const telCmd = program
  .command("telemetry")
  .description("View or manage telemetry");

telCmd
  .command("show")
  .description("Show recent telemetry events")
  .option("-n, --limit <n>", "Number of events", "20")
  .action(async (opts) => {
    const limit = parseIntFlag(opts.limit, "--limit", 20);
    if (typeof limit === "object") return usageError(limit.error);
    const events = readEvents(limit);
    warnSkipped();
    // A telemetry event's `success` field describes the operation it recorded,
    // not this query. Letting `finish` infer the code turns "your log contains a
    // failure" into "the query failed" (exit 2). Reads that complete are exit 0.
    finish(events, ExitCode.OK);
  });

telCmd
  .command("summary")
  .description("Show telemetry summary")
  .action(() => {
    const result = summary();
    warnSkipped();
    // Read-only query: see the note on `telemetry show`.
    finish(result, ExitCode.OK);
  });

telCmd
  .command("health")
  .description("Show telemetry health report with per-language stats and threshold warnings")
  .option("-w, --window <days>", "Time window in days", "7")
  .option("-t, --trend", "Compare current window to previous window")
  .action((opts) => {
    const window = parseIntFlag(opts.window, "--window", 7);
    if (typeof window === "object") return usageError(window.error);
    const report = opts.trend ? healthTrend(window) : health(window);
    warnSkipped();
    // Read-only query: see the note on `telemetry show`.
    finish(report, ExitCode.OK);
  });

telCmd
  .command("clear")
  .description("Clear telemetry log")
  .action(() => {
    clearEvents();
    finish({ success: true, message: "Telemetry cleared." }, ExitCode.OK);
  });

telCmd
  .command("sessions")
  .description("List session summaries")
  .action(() => {
    const sessions = listSessions();
    warnSkipped();
    // Read-only query: see the note on `telemetry show`.
    finish(sessions, ExitCode.OK);
  });

telCmd
  .command("export")
  .description("Export telemetry events as NDJSON")
  .option("--from <date>", "Start date (ISO format)")
  .option("--to <date>", "End date (ISO format)")
  .option("--session <id>", "Session ID filter")
  .option("--ndjson", "Stream one compact event per line instead of the JSON envelope")
  .action((opts) => {
    const events = exportEvents({
      from: opts.from ? new Date(opts.from) : undefined,
      to: opts.to ? new Date(opts.to) : undefined,
      sessionId: opts.session,
    });
    warnSkipped();
    // Default to the envelope like every other command; `--ndjson` keeps the
    // streamable one-object-per-line form for pipes into jq and friends.
    if (opts.ndjson) {
      for (const e of events) console.log(JSON.stringify(e));
      return;
    }
    finish(events, ExitCode.OK);
  });

telCmd
  .command("prune")
  .description("Delete old rotated telemetry files")
  .option("-d, --older-than <days>", "Days threshold", "30")
  .action((opts) => {
    const deleted = pruneEvents(parseInt(opts.olderThan));
    finish({ success: true, deleted, message: `Pruned ${deleted} telemetry file(s).` }, ExitCode.OK);
  });

const provCmd = program
  .command("provenance")
  .description("Query edit provenance — who changed what, when, and why");

provCmd
  .command("query")
  .description("Show edit history for a file (like git blame for agent edits)")
  .argument("<file>", "File path")
  .argument("[line]", "Optional line number to filter by")
  .option("--human", "Human-readable output")
  .option("--json", "JSON output (default)", true)
  .option("--fuzzy", "Include edits without diff data in line-filtered queries")
  .option("--limit <n>", "Max entries to show")
  .action((file, line, opts) => {
    const lineNum = line ? parseInt(line) : undefined;
    let results = provenanceQuery(file, lineNum, !!opts.fuzzy);
    if (opts.limit) results = results.slice(0, parseInt(opts.limit));
    if (opts.human) {
      console.log(formatProvenanceHuman(results));
      return;
    }
    // A file with no recorded edits is an empty history, not a failure.
    finish(results, ExitCode.OK);
  });

provCmd
  .command("changeset")
  .description("Show all edits in a changeSet")
  .argument("<changeSetId>", "ChangeSet UUID")
  .option("--human", "Human-readable output")
  .action((changeSetId, opts) => {
    const result = changeSetQuery(changeSetId);
    if (!result) {
      return finish(
        {
          success: false,
          errorCode: ErrorCode.FILE_NOT_FOUND,
          changeSetId,
          message: `No edits found for changeSet: ${changeSetId}`,
          recovery: "structured-edit telemetry sessions",
        },
        ExitCode.USAGE,
      );
    }
    if (opts.human) {
      console.log(`ChangeSet: ${result.changeSetId}`);
      console.log(`Actor: ${result.actor}`);
      console.log(`Task: ${result.taskId ?? "N/A"}`);
      console.log(`Reason: ${result.reason}`);
      console.log(`Edits: ${result.editCount}`);
      console.log(`Time: ${result.timeRange.first} -- ${result.timeRange.last}\n`);
      console.log(formatProvenanceHuman(result.entries));
      process.exitCode = exitCodeFor(result);
    } else {
      finish(result);
    }
  });

program
  .command("changesets")
  .description("List undoable changeSets, newest first")
  .option("--limit <n>", "Max changeSets to list (default 20)")
  .action((opts) => {
    const limit = parseIntFlag(opts.limit, "--limit", 20);
    if (typeof limit === "object") return usageError(limit.error);
    finish({ changeSets: listChangeSets(limit) }, ExitCode.OK);
  });

program
  .command("undo")
  .description("Restore every file in a changeSet to its pre-edit contents")
  .argument("[changeSetId]", "ChangeSet to undo; omit with --last")
  .option("--last", "Undo the most recent changeSet")
  .option("--force", "Restore even files modified since the edit was applied")
  .option("--dry-run", "Report what would be restored without touching the disk")
  .action((changeSetId, opts) => {
    const id = opts.last ? lastChangeSetId() : changeSetId;
    if (!id) {
      return usageError(
        opts.last
          ? "No changeSets have been recorded yet."
          : "Provide a changeSet ID, or pass --last.",
        { recovery: "structured-edit changesets" },
      );
    }
    // The undo's own write must not be snapshotted as a new changeSet — that
    // would make `undo --last` toggle between two states forever.
    setCurrentChangeSet(null);
    const result = undoChangeSet(id, { force: Boolean(opts.force), dryRun: Boolean(opts.dryRun) });
    finish(result, result.success ? ExitCode.OK : ExitCode.PRECONDITION);
  });

program
  .command("doctor")
  .description("Verify HashPilot installation health")
  .action(() => {
    const report = doctor();
    const summaryParts: string[] = [];
    const pass = report.checks.filter((c) => c.status === "pass").length;
    const fail = report.checks.filter((c) => c.status === "fail").length;
    const warn = report.checks.filter((c) => c.status === "warn").length;
    const skip = report.checks.filter((c) => c.status === "skip").length;
    summaryParts.push(`HashPilot Doctor — ${report.healthy ? "HEALTHY" : "ISSUES FOUND"}`);
    summaryParts.push(`  Pass: ${pass}  Fail: ${fail}  Warn: ${warn}  Skip: ${skip}`);
    for (const check of report.checks) {
      const icon = check.status === "pass" ? "✓" : check.status === "fail" ? "✗" : check.status === "warn" ? "!" : "·";
      summaryParts.push(`  ${icon} ${check.name}: ${check.message}`);
    }
    finish(report);
    console.error(summaryParts.join("\n"));
  });

program
  .command("route")
  .description("Show which edit route would be chosen (with detailed explanation)")
  .argument("<file>", "File path")
  .argument("<operation>", "Operation name")
  .option("--policy <json>", "Inline policy JSON to test")
  .option("--no-default-config", "Ignore config file policies")
  .action((file: string, operation: string, opts) => {
    const lang = detectLanguage(file);
    let policy = opts.policy ? JSON.parse(opts.policy) : undefined;
    if (!policy && !opts.defaultConfig) {
      policy = loadConfig().routePolicy;
    }
    const { route, explanation } = chooseRoute(file, operation, policy);
    finish({
      file,
      operation,
      language: lang,
      route,
      explanation,
    });
  });

program
  .command("config")
  .description("Show current HashPilot configuration")
  .option("--config <path>", "Config file path override")
  .action((opts) => {
    const config = loadConfig(opts.config);
    finish(config);
  });

/** Node syscall codes that mean "the filesystem said no", not "HashPilot has a bug". */
const IO_SYSCALL_CODES = new Set([
  "ENOENT", "EACCES", "EPERM", "EISDIR", "ENOTDIR", "ENOSPC", "EROFS", "EMFILE", "ENFILE", "EBUSY",
]);

/**
 * Nothing below a command action should ever surface a raw stack trace to an
 * agent parsing stdout. Uncaught failures exit 70 with the same JSON envelope
 * shape as every other error.
 */
function reportInternalError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof TelemetryReadError) {
    // A log that exists but cannot be read is an I/O failure, not an empty log.
    // Returning `[]` here would report a broken telemetry store as a healthy one.
    finish(
      {
        success: false,
        errorCode: ErrorCode.READ_FAILED,
        path: err.file,
        message,
        recovery: "Check that the telemetry log is readable, or run `structured-edit telemetry clear`.",
      },
      ExitCode.IO,
    );
    return;
  }
  if (err instanceof PathDeniedError) {
    finish({ success: false, errorCode: err.errorCode, path: err.path, message }, ExitCode.USAGE);
    return;
  }
  // Commander's async actions reject outside the try/catch around `parse()`,
  // so a plain missing file lands here. Those are ordinary I/O failures, not
  // HashPilot bugs — reporting them as exit 70 tells an agent to file a bug
  // report instead of fixing its path.
  const syscall = (err as { code?: string } | undefined)?.code;
  if (syscall !== undefined && IO_SYSCALL_CODES.has(syscall)) {
    finish(
      {
        success: false,
        errorCode: syscall === "ENOENT" ? ErrorCode.FILE_NOT_FOUND : ErrorCode.WRITE_FAILED,
        message,
        recovery: "Check that the path exists and is readable and writable.",
      },
      ExitCode.IO,
    );
    return;
  }
  finish(
    {
      success: false,
      errorCode: "INTERNAL_ERROR",
      message,
      detail: err instanceof Error ? err.stack : undefined,
      recovery: "This is a bug in HashPilot. Please report it with the command that triggered it.",
    },
    ExitCode.INTERNAL,
  );
}

process.on("uncaughtException", reportInternalError);
process.on("unhandledRejection", reportInternalError);

try {
  program.parse();
} catch (err) {
  reportInternalError(err);
}
