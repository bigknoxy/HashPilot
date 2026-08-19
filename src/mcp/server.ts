/**
 * MCP server over stdio (#25).
 *
 * The protocol surface is hand-written rather than taken from an SDK: MCP's
 * stdio transport is newline-delimited JSON-RPC 2.0 and the four methods we
 * need are small, while a dependency here would land in every install of a tool
 * whose whole pitch is that it drops into any agent without ceremony.
 *
 * Tools are not declared here. They come from `OPERATIONS` in
 * `src/core/operations.ts`, the same list the CLI is checked against, so the
 * MCP surface cannot quietly drift from the documented commands.
 */

import { OPERATIONS, getOperation, inputSchemaFor } from "../core/operations";
import { API_VERSION, setCommand, takeWarnings } from "../core/envelope";

/** The MCP revision we implement. Echoed back in `initialize`. */
export const PROTOCOL_VERSION = "2024-11-05";

/* ── JSON-RPC types ──────────────────────────────────────────────────── */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  /** Absent for notifications, which take no response. */
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** JSON-RPC reserved codes. Tool failures do NOT use these — see `callTool`. */
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

/* ── Method handlers ─────────────────────────────────────────────────── */

function listTools() {
  return {
    tools: OPERATIONS.map((op) => ({
      name: op.name,
      description: `${op.summary}\n\n${op.description}`,
      inputSchema: inputSchemaFor(op),
      annotations: {
        readOnlyHint: !op.mutates,
        destructiveHint: op.mutates,
        title: op.summary,
      },
    })),
  };
}

/**
 * Reject a call whose arguments cannot satisfy the operation before running it.
 * Only presence and coarse shape are checked; the handlers coerce the rest.
 * Returns a message, or null when the arguments are acceptable.
 */
function validateArgs(op: ReturnType<typeof getOperation>, args: Record<string, unknown>): string | null {
  if (!op) return null;
  const missing = op.params
    .filter((p) => p.required)
    .filter((p) => {
      const v = args[p.name];
      // An empty string is a legitimate value (a deletion, #40); only
      // absence is missing.
      return v === undefined || v === null;
    })
    .map((p) => p.name);
  if (missing.length) return `missing required parameter(s): ${missing.join(", ")}`;

  for (const p of op.params) {
    const v = args[p.name];
    if (v === undefined || v === null) continue;
    if (p.type === "string[]" && !Array.isArray(v) && typeof v !== "string") {
      return `parameter "${p.name}" must be an array of strings`;
    }
    // `Number("")` and `Number([])` are both 0, so a NaN test alone lets an
    // empty string or an array through as a number. The handler then coerces it
    // back to undefined and the call returns a green result for a nonsense
    // argument — the same silent-success failure `findFailure` exists to stop.
    if (p.type === "number" && !isNumeric(v)) {
      return `parameter "${p.name}" must be a number`;
    }
  }
  return null;
}

/** True only for a real number, or a string that is entirely one. */
function isNumeric(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v !== "string" || v.trim() === "") return false;
  return Number.isFinite(Number(v));
}

/**
 * Run one tool call.
 *
 * A failed *edit* is reported as `isError: true` on a successful JSON-RPC
 * result, not as a JSON-RPC error: the distinction MCP draws is that protocol
 * errors are the host's problem while tool errors are the model's to read and
 * act on. The payload carries the envelope's `code` and `recovery` verbatim,
 * which is the whole point — a stale anchor should reach the model as
 * "re-read the file and retry", not as a stack trace.
 */
export async function callTool(name: string, rawArgs: unknown): Promise<Record<string, unknown>> {
  // Scopes the envelope's `command` and clears any warnings left by a prior
  // call, so `warnings` reports only what this tool call produced.
  setCommand(name);
  const op = getOperation(name);
  if (!op) {
    return errorResult(name, "UNKNOWN_TOOL", `No such tool: ${name}`, "Call tools/list to see the available tools.");
  }

  const args = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
  const invalid = validateArgs(op, args);
  if (invalid) {
    return errorResult(name, "INVALID_ARGUMENTS", invalid, "Check the tool's inputSchema and call it again.");
  }

  try {
    const data = await op.handler(args);
    const failure = findFailure(data);
    if (failure) {
      return errorResult(
        name,
        String(failure.errorCode || failure.code || "EDIT_FAILED"),
        String(failure.error || failure.message || "the edit did not apply"),
        typeof failure.recovery === "string" ? failure.recovery : undefined,
        data as Record<string, unknown>
      );
    }
    return okResult(name, data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { errorCode?: string })?.errorCode || "INTERNAL_ERROR";
    return errorResult(name, code, message);
  }
}

/**
 * Find the payload that reports failure, or null when the call succeeded.
 *
 * `routeEdit` reports routing at the top level and the edit's own outcome one
 * level down under `result`, so a check of only the outer `success` reads a
 * failed edit as a success — which would hand the model a green result for an
 * edit that never applied. Both levels are inspected, innermost first, because
 * the inner object carries the specific `errorCode` worth surfacing.
 */
function findFailure(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const inner = findFailure(d.result);
  if (inner) return inner;
  return d.success === false ? d : null;
}

/**
 * MCP results carry text content. The text is the JSON envelope: models read it
 * directly, and a host that wants structure gets the same object back under
 * `structuredContent`.
 */
function okResult(command: string, data: unknown): Record<string, unknown> {
  // The full five-field envelope, identical to the CLI's: an adapter written
  // against docs/ADAPTER-CONTRACT.md must not have to special-case MCP (#104).
  const payload = {
    apiVersion: API_VERSION,
    ok: true,
    command,
    data: data ?? null,
    error: null,
    warnings: takeWarnings(),
  };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: false,
  };
}

function errorResult(
  command: string,
  code: string,
  message: string,
  recovery?: string,
  details?: unknown
): Record<string, unknown> {
  const payload = {
    apiVersion: API_VERSION,
    ok: false,
    command,
    data: details ?? null,
    error: { code, message, ...(recovery ? { recovery } : {}), ...(details ? { details } : {}) },
    warnings: takeWarnings(),
  };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true,
  };
}

/**
 * Dispatch one request. Returns null for notifications, which JSON-RPC forbids
 * answering — `notifications/initialized` is the one every host sends.
 */
export async function handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const isNotification = req.id === undefined || req.id === null;
  const id = req.id as string | number;

  try {
    switch (req.method) {
      case "initialize":
        return isNotification ? null : {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "hashpilot", version: process.env.HASHPILOT_VERSION || "dev" },
          },
        };

      case "notifications/initialized":
      case "notifications/cancelled":
        return null;

      case "ping":
        return isNotification ? null : { jsonrpc: "2.0", id, result: {} };

      case "tools/list":
        return isNotification ? null : { jsonrpc: "2.0", id, result: listTools() };

      case "tools/call": {
        const name = String(req.params?.name || "");
        const result = await callTool(name, req.params?.arguments);
        return isNotification ? null : { jsonrpc: "2.0", id, result };
      }

      default:
        if (isNotification) return null;
        return {
          jsonrpc: "2.0",
          id,
          error: { code: METHOD_NOT_FOUND, message: `Method not found: ${req.method}` },
        };
    }
  } catch (err) {
    if (isNotification) return null;
    return {
      jsonrpc: "2.0",
      id,
      error: { code: INTERNAL_ERROR, message: err instanceof Error ? err.message : String(err) },
    };
  }
}

/** Parse and dispatch one newline-delimited message. Returns the line to write back, or null. */
export async function handleLine(line: string): Promise<string | null> {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let req: JsonRpcRequest;
  try {
    req = JSON.parse(trimmed);
  } catch {
    // No id is recoverable from unparseable input, so per JSON-RPC the id is null.
    return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "Invalid JSON" } });
  }

  if (!req || typeof req.method !== "string") {
    return JSON.stringify({
      jsonrpc: "2.0",
      id: req?.id ?? null,
      error: { code: INVALID_REQUEST, message: "Missing method" },
    });
  }

  const res = await handleRequest(req);
  return res ? JSON.stringify(res) : null;
}

/**
 * Run the stdio loop until stdin closes.
 *
 * Requests are handled strictly in order. Concurrency would be free wall-clock
 * here, but two edits to one file interleaving inside one process would
 * deadlock on the advisory lock (it is not re-entrant), and an agent's edits
 * are usually sequentially dependent anyway.
 *
 * Nothing may be written to stdout but protocol frames — a stray log line
 * corrupts the stream — so diagnostics go to stderr.
 */
export async function runStdioServer(): Promise<void> {
  let buffer = "";
  const decoder = new TextDecoder();

  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      const out = await handleLine(line);
      if (out !== null) process.stdout.write(out + "\n");
    }
  }

  // A final frame with no trailing newline still deserves an answer.
  const out = await handleLine(buffer);
  if (out !== null) process.stdout.write(out + "\n");
}
