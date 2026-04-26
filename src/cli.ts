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
    recordEvent({
      operation: "replace-hash",
      route: "hash",
      file,
      language: detectLanguage(file) || undefined,
      success: result.success,
      fallback_reason: result.stale ? "stale-anchor" : undefined,
      retries: result.retries ?? 0,
      elapsed_ms: 0,
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

astCmd
  .command("rename-symbol")
  .description("Rename a symbol across a file")
  .argument("<file>", "File path")
  .argument("<old-name>", "Current symbol name")
  .argument("<new-name>", "New symbol name")
  .option("--dry-run", "Preview only")
  .option("--json", "Output as JSON", true)
  .action(async (file: string, oldName: string, newName: string, opts) => {
    const start = Date.now();
    const content = await Bun.file(file).text();
    const result = renameSymbol(content, file, oldName, newName);
    if (result.success && result.newSource && !opts.dryRun) {
      await Bun.write(file, result.newSource);
    }
    recordEvent({
      operation: "rename-symbol",
      route: "ast",
      file,
      language: detectLanguage(file) || undefined,
      success: result.success,
      elapsed_ms: Date.now() - start,
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
    recordEvent({ operation: "replace-body", route: "ast", file, language: detectLanguage(file) || undefined, success: result.success, elapsed_ms: Date.now() - start });
    console.log(JSON.stringify(result, null, 2));
  });

astCmd
  .command("add-import")
  .description("Add an import statement")
  .argument("<file>", "File path")
  .argument("<import-spec>", "Import spec (e.g. '{ Foo } from ./bar')")
  .option("--dry-run", "Preview only")
  .option("--json", "Output as JSON", true)
  .action(async (file: string, importSpec: string, opts) => {
    const start = Date.now();
    const content = await Bun.file(file).text();
    const result = addImport(content, file, importSpec);
    if (result.success && result.newSource && !opts.dryRun) {
      await Bun.write(file, result.newSource);
    }
    recordEvent({ operation: "add-import", route: "ast", file, language: detectLanguage(file) || undefined, success: result.success, elapsed_ms: Date.now() - start });
    console.log(JSON.stringify(result, null, 2));
  });

astCmd
  .command("remove-import")
  .description("Remove an import statement")
  .argument("<file>", "File path")
  .argument("<import-spec>", "Import spec to remove")
  .option("--dry-run", "Preview only")
  .option("--json", "Output as JSON", true)
  .action(async (file: string, importSpec: string, opts) => {
    const start = Date.now();
    const content = await Bun.file(file).text();
    const result = removeImport(content, file, importSpec);
    if (result.success && result.newSource && !opts.dryRun) {
      await Bun.write(file, result.newSource);
    }
    recordEvent({ operation: "remove-import", route: "ast", file, language: detectLanguage(file) || undefined, success: result.success, elapsed_ms: Date.now() - start });
    console.log(JSON.stringify(result, null, 2));
  });

astCmd
  .command("insert-before")
  .description("Insert content before a symbol")
  .argument("<file>", "File path")
  .argument("<symbol>", "Symbol name")
  .argument("<content>", "Content to insert (or @file)")
  .option("--dry-run", "Preview only")
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
    recordEvent({ operation: "insert-before", route: "ast", file, language: detectLanguage(file) || undefined, success: result.success, elapsed_ms: Date.now() - start });
    console.log(JSON.stringify(result, null, 2));
  });

astCmd
  .command("insert-after")
  .description("Insert content after a symbol")
  .argument("<file>", "File path")
  .argument("<symbol>", "Symbol name")
  .argument("<content>", "Content to insert (or @file)")
  .option("--dry-run", "Preview only")
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
    recordEvent({ operation: "insert-after", route: "ast", file, language: detectLanguage(file) || undefined, success: result.success, elapsed_ms: Date.now() - start });
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("verify-changes")
  .description("Run formatter, linter, and tests on changed files")
  .argument("<files...>", "Files to verify")
  .option("--formatter <cmd>", "Formatter command")
  .option("--linter <cmd>", "Linter command")
  .option("--test-filter <pattern>", "Test filter pattern")
  .option("--formatter-args <args...>", "Formatter args")
  .option("--linter-args <args...>", "Linter args")
  .option("--json", "Output as JSON", true)
  .action(async (files: string[], opts) => {
    const result = await verifyChanges(files, {
      formatter: opts.formatter,
      linter: opts.linter,
      testFilter: opts.testFilter,
      formatterArgs: opts.formatterArgs,
      linterArgs: opts.linterArgs,
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