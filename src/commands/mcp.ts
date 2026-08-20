import type { Command } from "commander";
import {
  recordEvent,
} from "../core/index";
import { runStdioServer } from "../mcp/server";

/** Register the `mcp` command group. */
export function register(program: Command): void {
  program
    .command("mcp")
    .description("Run HashPilot as an MCP server over stdio")
    .option("--stdio", "Speak MCP over stdin/stdout (the only transport, and the default)")
    .action(async () => {
      // stdout is the protocol stream from here on, so nothing may print to it —
      // including the JSON envelope every other command emits. The server runs
      // until the host closes stdin; the telemetry event is recorded on the way
      // out, when the session length is actually known.
      const start = Date.now();
      await runStdioServer();
      recordEvent({
        operation: "mcp",
        route: "none",
        success: true,
        elapsed_ms: Date.now() - start,
      });
      process.exit(0);
    });
}
