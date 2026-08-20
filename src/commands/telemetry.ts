import type { Command } from "commander";
import {
  readEvents,
  lastReadSkipped,
  clearEvents,
  summary,
  health,
  healthTrend,
  listSessions,
  exportEvents,
  pruneEvents,
  finish,
  usageError,
  addWarning,
  ExitCode,
} from "../core/index";
import { parseIntFlag } from "./shared";

/** Register the `telemetry` command group. */
export function register(program: Command): void {
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
}
