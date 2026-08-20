import type { Command } from "commander";
import {
  findSymbolsDetailed,
  renameSymbol,
  replaceBody,
  addImport,
  removeImport,
  insertBeforeSymbol,
  insertAfterSymbol,
  detectLanguage,
  recordEvent,
  astCapabilities,
  toPreview,
  ErrorCode,
  buildProvenanceFields,
  safeWrite,
  finish,
} from "../core/index";
import type { TelemetryEvent } from "../core/telemetry";
import { withPreview, withProvenance } from "./shared";

/** Register the `ast` command group. */
export function register(program: Command): void {
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
      // Report the truncation flag rather than an array that looks complete (#39).
      const { symbols, truncated } = findSymbolsDetailed(content, file);
      finish({ symbols, truncated });
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

  withProvenance(
    withPreview(
      astCmd
        .command("rename-symbol")
         .description(
            "File-scoped, binding-aware rename of a symbol and its references. " +
            "Refuses with AMBIGUOUS_SYMBOL when the name binds more than one symbol " +
            "in the file (a shadowed local, a foreign import, or a duplicate declaration).",
           )
        .argument("<file>", "File path")
        .argument("<old-name>", "Current symbol name")
        .argument("<new-name>", "New symbol name"),
      "Preview only",
    )
  )

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
      // A dry run previews the change; it does not hand back the whole file (#98).
      finish(opts.dryRun ? toPreview(result, content, file, opts.includeSource) : result);
    });

  withProvenance(
    withPreview(
      astCmd
        .command("replace-body")
        .description("Replace function/method body")
        .argument("<file>", "File path")
        .argument("<symbol>", "Symbol name")
        .argument("<new-body>", "New body statements only — no braces, no indentation (or @file)"),
      "Preview only",
    )
  )

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
      // A dry run previews the change; it does not hand back the whole file (#98).
      finish(opts.dryRun ? toPreview(result, content, file, opts.includeSource) : result);
    });

  withProvenance(
    withPreview(
      astCmd
        .command("add-import")
        .description("Add an import statement")
        .argument("<file>", "File path")
        .argument("<import-spec>", 'Import spec, module path quoted: \'{ Foo } from "./bar"\''),
      "Preview only",
    )
  )

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
      // A dry run previews the change; it does not hand back the whole file (#98).
      finish(opts.dryRun ? toPreview(result, content, file, opts.includeSource) : result);
    });

  withProvenance(
    withPreview(
      astCmd
        .command("remove-import")
        .description("Remove an import statement")
        .argument("<file>", "File path")
        .argument("<import-spec>", 'Import spec to remove, e.g. \'{ Foo } from "./bar"\' or a bare binding name'),
      "Preview only",
    )
  )

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
      // A dry run previews the change; it does not hand back the whole file (#98).
      finish(opts.dryRun ? toPreview(result, content, file, opts.includeSource) : result);
    });

  withProvenance(
    withPreview(
      astCmd
        .command("insert-before")
        .description("Insert content before a symbol")
        .argument("<file>", "File path")
        .argument("<symbol>", "Symbol name")
        .argument("<content>", "Content to insert (or @file)"),
      "Preview only",
    )
  )

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
      // A dry run previews the change; it does not hand back the whole file (#98).
      finish(opts.dryRun ? toPreview(result, src, file, opts.includeSource) : result);
    });

  withProvenance(
    withPreview(
      astCmd
        .command("insert-after")
        .description("Insert content after a symbol")
        .argument("<file>", "File path")
        .argument("<symbol>", "Symbol name")
        .argument("<content>", "Content to insert (or @file)"),
      "Preview only",
    )
  )

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
      // A dry run previews the change; it does not hand back the whole file (#98).
      finish(opts.dryRun ? toPreview(result, src, file, opts.includeSource) : result);
    });
}
