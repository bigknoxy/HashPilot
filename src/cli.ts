#!/usr/bin/env bun
import { Command, CommanderError } from "commander";
// Single source of truth for the version. Bun inlines this JSON import at build
// time, so dist/ carries the real version instead of a hardcoded literal.
import pkg from "../package.json" with { type: "json" };
import {
  loadConfig,
  createChangeSet,
  configureSnapshots,
  setCurrentChangeSet,
  pruneSnapshots,
  PathDeniedError,
  configureWriteBoundary,
  finish,
  usageError,
  setCommand,
  setAllowParseErrors,
  ErrorCode,
  ExitCode,
  configureTelemetry,
  enableTelemetry,
  resolveTelemetryEnabled,
  setOutputFormat,
  configureOutput,
  resolveFormat,
  TelemetryReadError,
} from "./core/index";

// Every command group registers itself onto `program`. The registration order
// below is the order the groups appear in `--help`; do not reshuffle it (#48).
import { register as registerRead } from "./commands/read";
import { register as registerHash } from "./commands/hash";
import { register as registerAst } from "./commands/ast";
import { register as registerEdit } from "./commands/edit";
import { register as registerIntent } from "./commands/intent";
import { register as registerDiff } from "./commands/diff";
import { register as registerVerify } from "./commands/verify";
import { register as registerTelemetry } from "./commands/telemetry";
import { register as registerProvenance } from "./commands/provenance";
import { register as registerMcp } from "./commands/mcp";
import { register as registerMaintenance } from "./commands/maintenance";
import { register as registerRoute } from "./commands/route";
import { register as registerSearch } from "./commands/search";

const VERSION: string = pkg.version;

const program = new Command();

program
  .name("hashpilot")
  .description("HashPilot — Structured Editing Core for Coding Agents")
  .version(VERSION)
  .option("--allow-outside-root", "Permit writes outside the project root (credentials and system paths stay blocked)")
  .option("--allowed-root <dir...>", "Additional directory writes may target")
  .option("--no-telemetry", "Disable telemetry logging for this invocation")
  .option("--allow-parse-errors", "Edit a file that already has syntax errors (the post-edit parse check still applies)")
    .option("--format <fmt>", "Output format: json or text (default: json if piped/CI, text if TTY)")
    .option("--json", "[deprecated: use --format json] Force JSON output", false)
  .option("-q, --quiet", "Suppress the human-readable success line (the JSON envelope is never suppressed)")
  .option("-v, --verbose", "Write routing and timing diagnostics to stderr")
  .option("--no-color", "Disable ANSI color in text output (also honors NO_COLOR)")
  .hook("preAction", (thisCommand, actionCommand) => {
    // Name the running subcommand so the envelope can report it. Walk up so
    // nested commands read as "telemetry show", not "show".
    const path: string[] = [];
    for (let c: typeof actionCommand | null = actionCommand; c && c.parent; c = c.parent) path.unshift(c.name());
    setCommand(path.join(" "));

     // #19 (B16): resolve output format and set it globally
    const globals = thisCommand.opts();
    const { format, warnDeprecate } = resolveFormat(globals, { ci: process.env.CI === "true" || process.env.CI === "1" });
    setOutputFormat(format, path.join(" "));
    // Color and verbosity resolve from the same globals, after the format is
    // known: color is text-mode only, so JSON output can never carry escapes (#47).
    configureOutput({
      quiet: Boolean(globals.quiet),
      verbose: Boolean(globals.verbose),
      color: globals.color,
      format,
      isTTY: Boolean(process.stdout.isTTY),
    });
    if (warnDeprecate) process.stderr.write("[deprecation] --json is deprecated; use --format json\n");
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
registerRead(program);
registerHash(program);
registerAst(program);
registerEdit(program);
registerIntent(program);
registerDiff(program);
registerVerify(program);
registerTelemetry(program);
registerProvenance(program);
registerMcp(program);
registerMaintenance(program);
registerRoute(program);
registerSearch(program);

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
        recovery: "Check that the telemetry log is readable, or run `hashpilot telemetry clear`.",
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

/**
 * Route Commander's own parse failures (unknown flag, missing required
 * argument, bad choice) through the JSON usage envelope instead of letting a
 * bare `error: unknown option '--x'` line escape to stderr. An agent that
 * cannot parse the failure cannot self-correct from it (#57).
 *
 * `--help` and `--version` also arrive here as CommanderErrors; those already
 * wrote their output to stdout and must exit with their own code.
 */
function applyExitOverride(cmd: Command): void {
  cmd.exitOverride();
  cmd.configureOutput({ writeErr: () => {} });
  for (const sub of cmd.commands) applyExitOverride(sub as Command);
}

applyExitOverride(program);

try {
  program.parse();
} catch (err) {
  if (err instanceof CommanderError) {
    if (err.code === "commander.helpDisplayed" || err.code === "commander.version" || err.code === "commander.help") {
      process.exit(err.exitCode);
    }
    const attempted = process.argv[2];
    if (attempted && program.commands.some((c) => (c as Command).name() === attempted)) {
      setCommand(attempted);
    }
    usageError(err.message.replace(/^error: /, ""), {
      recovery: `Run \`hashpilot ${attempted && !attempted.startsWith("-") ? attempted + " " : ""}--help\` for the accepted arguments.`,
    });
  } else {
    reportInternalError(err);
  }
}
