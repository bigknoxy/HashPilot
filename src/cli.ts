#!/usr/bin/env bun
import { Command } from "commander";
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
  buildProvenanceFields,
  provenanceQuery,
  changeSetQuery,
  formatProvenanceHuman,
} from "./core/index";

const program = new Command();

program
  .name("structured-edit")
  .description("HashPilot — Structured Editing Core for Coding Agents")
  .version("0.1.0");

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
    console.log(JSON.stringify(results, null, 2));
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
    const result = await readHash(file, line, parseInt(opts.context));
    recordEvent({
      operation: "read-hash",
      route: "hash",
      file,
      success: !result.error,
      lines_read: 1 + (result.contextBefore?.length || 0) + (result.contextAfter?.length || 0),
      elapsed_ms: Date.now() - start,
    });
    console.log(JSON.stringify(result, null, 2));
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
    console.log(JSON.stringify(result, null, 2));
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
    console.log(JSON.stringify(results, null, 2));
  });

program
  .command("replace-hash")
  .description("Replace content identified by hash anchor")
  .argument("<file>", "File path")
  .argument("<old-hash>", "Hash of content to replace")
  .argument("<new-content>", "New content (or @file to read from file)")
  .option("--range <start:end>", "Line range (1-indexed)")
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
      const [s, e] = opts.range.split(":").map(Number);
      range = { start: s, end: e };
    }
    const result = await replaceHash(file, oldHash, content, {
      range,
      dryRun: opts.dryRun,
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
    console.log(JSON.stringify(result, null, 2));
  });

const astCmd = program
  .command("ast")
  .description("Syntax-aware editing via tree-sitter");

astCmd
  .command("capabilities")
  .description("Show supported AST languages, operations, and limitations")
  .action(() => {
    console.log(JSON.stringify(astCapabilities(), null, 2));
  });

astCmd
  .command("find-symbols")
  .description("List symbols in a file")
  .argument("<file>", "File path")
  .action(async (file: string) => {
    const content = await Bun.file(file).text();
    const symbols = findSymbols(content, file);
    console.log(JSON.stringify(symbols, null, 2));
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
      await Bun.write(file, result.newSource);
    }
    recordProvenanceEvent({
      operation: "rename-symbol", route: "ast", file,
      language: detectLanguage(file) || undefined,
      success: result.success, elapsed_ms: Date.now() - start,
      errorCode: result.success ? undefined : ErrorCode.PARSE_ERROR,
      source: content, newSource: result.newSource, filePath: file,
      actor: opts.actor, taskId: opts.taskId, reason: opts.reason,
    });
    console.log(JSON.stringify(result, null, 2));
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
      await Bun.write(file, result.newSource);
    }
    recordProvenanceEvent({
      operation: "replace-body", route: "ast", file,
      language: detectLanguage(file) || undefined,
      success: result.success, elapsed_ms: Date.now() - start,
      errorCode: result.success ? undefined : ErrorCode.PARSE_ERROR,
      source: content, newSource: result.newSource, filePath: file,
      actor: opts.actor, taskId: opts.taskId, reason: opts.reason,
    });
    console.log(JSON.stringify(result, null, 2));
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
      await Bun.write(file, result.newSource);
    }
    recordProvenanceEvent({
      operation: "add-import", route: "ast", file,
      language: detectLanguage(file) || undefined,
      success: result.success, elapsed_ms: Date.now() - start,
      errorCode: result.success ? undefined : ErrorCode.PARSE_ERROR,
      source: content, newSource: result.newSource, filePath: file,
      actor: opts.actor, taskId: opts.taskId, reason: opts.reason,
    });
    console.log(JSON.stringify(result, null, 2));
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
      await Bun.write(file, result.newSource);
    }
    recordProvenanceEvent({
      operation: "remove-import", route: "ast", file,
      language: detectLanguage(file) || undefined,
      success: result.success, elapsed_ms: Date.now() - start,
      errorCode: result.success ? undefined : ErrorCode.PARSE_ERROR,
      source: content, newSource: result.newSource, filePath: file,
      actor: opts.actor, taskId: opts.taskId, reason: opts.reason,
    });
    console.log(JSON.stringify(result, null, 2));
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
      await Bun.write(file, result.newSource);
    }
    recordProvenanceEvent({
      operation: "insert-before", route: "ast", file,
      language: detectLanguage(file) || undefined,
      success: result.success, elapsed_ms: Date.now() - start,
      errorCode: result.success ? undefined : ErrorCode.PARSE_ERROR,
      source: src, newSource: result.newSource, filePath: file,
      actor: opts.actor, taskId: opts.taskId, reason: opts.reason,
    });
    console.log(JSON.stringify(result, null, 2));
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
      await Bun.write(file, result.newSource);
    }
    recordProvenanceEvent({
      operation: "insert-after", route: "ast", file,
      language: detectLanguage(file) || undefined,
      success: result.success, elapsed_ms: Date.now() - start,
      errorCode: result.success ? undefined : ErrorCode.PARSE_ERROR,
      source: src, newSource: result.newSource, filePath: file,
      actor: opts.actor, taskId: opts.taskId, reason: opts.reason,
    });
    console.log(JSON.stringify(result, null, 2));
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
      if (!val) return undefined;
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

    console.log(JSON.stringify(result, null, 2));
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
      if (!val) return undefined;
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

    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("intent")
  .description("Execute an editing intent — one command, full blast radius")
  .argument("<intent>", "Intent as JSON: {\"operation\":\"add-parameter\",\"symbol\":\"fn\",\"param\":{\"name\":\"x\"}}")
  .option("--project-root <dir>", "Project root directory")
  .option("--dry-run", "Preview plan without modifying files")
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
        verify: opts.verify,
        revertOnFailure: opts.revert,
        timeout: parseInt(opts.timeout),
        actor: opts.actor,
        taskId: opts.taskId,
        reason: opts.reason,
        context,
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Intent: ${result.plan.intent.operation} on '${result.plan.definition.name}'`);
        console.log(`Impact: ${result.plan.impactSummary}`);
        console.log(`Success: ${result.success}`);
        if (result.execution.verification) {
          console.log(`Verification: ${result.execution.verification.overall}`);
        }
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
    if (diff) {
      console.log(diff);
    } else {
      console.log("(no changes)");
    }
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
      console.log(JSON.stringify({ success: false, message: "--patch is required" }));
      process.exit(1);
    }
    const result = await applyPatch(file, patchText, {
      dryRun: opts.dryRun,
      fuzzyMatch: parseInt(opts.fuzzy),
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
    console.log(JSON.stringify(result, null, 2));
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
      revertOnFailure: opts.revertOnFailure,
      timeout: opts.timeout,
    });
    console.log(JSON.stringify(result, null, 2));
  });

const telCmd = program
  .command("telemetry")
  .description("View or manage telemetry");

telCmd
  .command("show")
  .description("Show recent telemetry events")
  .option("-n, --limit <n>", "Number of events", "20")
  .action(async (opts) => {
    const events = readEvents(parseInt(opts.limit));
    console.log(JSON.stringify(events, null, 2));
  });

telCmd
  .command("summary")
  .description("Show telemetry summary")
  .action(() => {
    console.log(JSON.stringify(summary(), null, 2));
  });

telCmd
  .command("health")
  .description("Show telemetry health report with per-language stats and threshold warnings")
  .option("-w, --window <days>", "Time window in days", "7")
  .option("-t, --trend", "Compare current window to previous window")
  .action((opts) => {
    if (opts.trend) {
      const report = healthTrend(parseInt(opts.window));
      console.log(JSON.stringify(report, null, 2));
    } else {
      const report = health(parseInt(opts.window));
      console.log(JSON.stringify(report, null, 2));
    }
  });

telCmd
  .command("clear")
  .description("Clear telemetry log")
  .action(() => {
    clearEvents();
    console.log("Telemetry cleared.");
  });

telCmd
  .command("sessions")
  .description("List session summaries")
  .action(() => {
    const sessions = listSessions();
    console.log(JSON.stringify(sessions, null, 2));
  });

telCmd
  .command("export")
  .description("Export telemetry events as NDJSON")
  .option("--from <date>", "Start date (ISO format)")
  .option("--to <date>", "End date (ISO format)")
  .option("--session <id>", "Session ID filter")
  .action((opts) => {
    const events = exportEvents({
      from: opts.from ? new Date(opts.from) : undefined,
      to: opts.to ? new Date(opts.to) : undefined,
      sessionId: opts.session,
    });
    for (const e of events) {
      console.log(JSON.stringify(e));
    }
  });

telCmd
  .command("prune")
  .description("Delete old rotated telemetry files")
  .option("-d, --older-than <days>", "Days threshold", "30")
  .action((opts) => {
    const deleted = pruneEvents(parseInt(opts.olderThan));
    console.log(`Pruned ${deleted} telemetry file(s).`);
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
    } else {
      console.log(JSON.stringify(results, null, 2));
    }
  });

provCmd
  .command("changeset")
  .description("Show all edits in a changeSet")
  .argument("<changeSetId>", "ChangeSet UUID")
  .option("--human", "Human-readable output")
  .action((changeSetId, opts) => {
    const result = changeSetQuery(changeSetId);
    if (!result) {
      console.log(`No edits found for changeSet: ${changeSetId}`);
      process.exitCode = 1;
      return;
    }
    if (opts.human) {
      console.log(`ChangeSet: ${result.changeSetId}`);
      console.log(`Actor: ${result.actor}`);
      console.log(`Task: ${result.taskId ?? "N/A"}`);
      console.log(`Reason: ${result.reason}`);
      console.log(`Edits: ${result.editCount}`);
      console.log(`Time: ${result.timeRange.first} -- ${result.timeRange.last}\n`);
      console.log(formatProvenanceHuman(result.entries));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
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
    console.log(JSON.stringify(report, null, 2));
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
    console.log(JSON.stringify({
      file,
      operation,
      language: lang,
      route,
      explanation,
    }, null, 2));
  });

program
  .command("config")
  .description("Show current HashPilot configuration")
  .option("--config <path>", "Config file path override")
  .action((opts) => {
    const config = loadConfig(opts.config);
    console.log(JSON.stringify(config, null, 2));
  });

program.parse();