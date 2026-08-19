/**
 * MCP conformance (#25).
 *
 * Two halves. The first drives the real binary over stdio, because the failure
 * this guards against — a stray write to stdout corrupting the protocol stream
 * — is invisible to an in-process test. The second calls the dispatcher
 * directly for the per-tool cases, where spawning a process each time buys
 * nothing.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { handleLine, callTool, PROTOCOL_VERSION } from "../src/mcp/server";
import { OPERATIONS } from "../src/core/operations";

/**
 * Fixtures live under the repo, not in `/tmp`.
 *
 * The write boundary confines every edit to the project root, so a fixture in
 * the system temp dir is refused with PATH_DENIED before any tier runs — the
 * boundary working as designed, not something for a test to route around with
 * `--allow-outside-root`.
 */
function makeFixtureDir(prefix: string): string {
  const base = join(import.meta.dir, "..", ".hashpilot-test-tmp");
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, prefix));
}

/** Drive the CLI's `mcp --stdio` and return one parsed response per output line. */
async function driveServer(requests: unknown[]): Promise<Record<string, unknown>[]> {
  const proc = Bun.spawn(["bun", "run", "src/cli.ts", "mcp", "--stdio"], {
    cwd: join(import.meta.dir, ".."),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HASHPILOT_NO_TELEMETRY: "1" },
  });
  proc.stdin.write(requests.map((r) => JSON.stringify(r)).join("\n") + "\n");
  proc.stdin.end();
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

describe("mcp server over stdio", () => {
  test("initialize, notification, and tools/list round-trip on the real binary", async () => {
    const responses = await driveServer([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]);

    // The notification must produce no line at all — an answer to a
    // notification is a protocol violation, and extra frames desync the host.
    expect(responses.length).toBe(2);

    const init = responses[0] as any;
    expect(init.id).toBe(1);
    expect(init.result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(init.result.serverInfo.name).toBe("hashpilot");
    expect(init.result.capabilities.tools).toBeDefined();

    const list = responses[1] as any;
    expect(list.id).toBe(2);
    expect(list.result.tools.length).toBe(OPERATIONS.length);
  }, 30000);

  test("nothing but protocol frames reaches stdout", async () => {
    // A tool call that touches telemetry, config, and the parser — the paths
    // most likely to console.log — must still yield exactly one frame.
    const responses = await driveServer([
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ast_capabilities", arguments: {} } },
    ]);
    expect(responses.length).toBe(1);
    expect((responses[0] as any).id).toBe(1);
  }, 30000);
});

describe("tools/list", () => {
  test("every operation is advertised with a usable schema", async () => {
    const res = JSON.parse((await handleLine(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })))!);
    const tools = res.result.tools as any[];
    expect(tools.length).toBe(OPERATIONS.length);

    for (const t of tools) {
      expect(t.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe("object");
      expect(Array.isArray(t.inputSchema.required)).toBe(true);
      for (const r of t.inputSchema.required) {
        expect(t.inputSchema.properties[r]).toBeDefined();
      }
    }
  });

  test("every tool description says when NOT to use it", () => {
    // The common agent failure is picking the wrong tier, not passing a wrong
    // argument, so a negative case in each description is a hard requirement.
    for (const op of OPERATIONS) {
      expect(op.description).toContain("Do NOT");
    }
  });

  test("read-only operations are not flagged destructive", async () => {
    const res = JSON.parse((await handleLine(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })))!);
    for (const t of res.result.tools as any[]) {
      const op = OPERATIONS.find((o) => o.name === t.name)!;
      expect(t.annotations.readOnlyHint).toBe(!op.mutates);
    }
  });
});

describe("protocol errors vs tool errors", () => {
  test("unparseable input gets a JSON-RPC parse error with a null id", async () => {
    const res = JSON.parse((await handleLine("{not json"))!);
    expect(res.error.code).toBe(-32700);
    expect(res.id).toBe(null);
  });

  test("an unknown method is a JSON-RPC error", async () => {
    const res = JSON.parse((await handleLine(JSON.stringify({ jsonrpc: "2.0", id: 9, method: "nope" })))!);
    expect(res.error.code).toBe(-32601);
  });

  test("a blank line produces no response", async () => {
    expect(await handleLine("   ")).toBe(null);
  });

  test("an unknown tool is a TOOL error, not a protocol error", async () => {
    // The distinction matters: a protocol error is the host's problem, a tool
    // error is something the model can read and recover from.
    const res = JSON.parse(
      (await handleLine(JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "bogus" } })))!
    );
    expect(res.error).toBeUndefined();
    expect(res.result.isError).toBe(true);
    expect(res.result.structuredContent.error.code).toBe("UNKNOWN_TOOL");
  });

  test("a missing required argument is rejected before the handler runs", async () => {
    const r = await callTool("rename_symbol", { file: "x.ts" });
    expect(r.isError).toBe(true);
    const err = (r.structuredContent as any).error;
    expect(err.code).toBe("INVALID_ARGUMENTS");
    expect(err.message).toContain("oldName");
    expect(err.message).toContain("newName");
  });

  test("an empty string counts as present, not missing", async () => {
    // Deleting a region is `newContent: ""` (#40); treating it as absent would
    // make deletion impossible over MCP.
    const r = await callTool("replace_content", {
      file: "/nonexistent-hashpilot-test.ts",
      oldContent: "x",
      newContent: "",
    });
    const err = (r.structuredContent as any).error;
    expect(err?.code).not.toBe("INVALID_ARGUMENTS");
  });
});

describe("tool calls against a real file", () => {
  let dir: string;
  let file: string;

  beforeAll(() => {
    dir = makeFixtureDir("hashpilot-mcp-");
    file = join(dir, "sample.ts");
    writeFileSync(file, `export function greet(name: string) {\n  return "hi " + name;\n}\n`);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("read_many returns content and a hash", async () => {
    const r = await callTool("read_many", { files: [file] });
    expect(r.isError).toBe(false);
    const data = (r.structuredContent as any).data;
    expect(data[0].hash).toMatch(/^[0-9a-f]+$/);
    expect(data[0].content).toContain("greet");
  });

  test("find_symbols finds the declaration", async () => {
    const r = await callTool("find_symbols", { file });
    const data = (r.structuredContent as any).data;
    expect(data.symbols.some((s: any) => s.name === "greet")).toBe(true);
    expect(data.truncated).toBe(false);
  });

  test("rename_symbol edits through the router", async () => {
    const r = await callTool("rename_symbol", { file, oldName: "greet", newName: "salute", actor: "test" });
    expect(r.isError).toBe(false);
    expect(readFileSync(file, "utf8")).toContain("salute");
  });

  test("a failed edit is isError with a recoverable code, not an exception", async () => {
    const r = await callTool("rename_symbol", { file, oldName: "nothingNamedThis", newName: "x" });
    expect(r.isError).toBe(true);
    const err = (r.structuredContent as any).error;
    expect(err.code).toBeTruthy();
    expect(err.code).not.toBe("INTERNAL_ERROR");
  });

  test("dryRun leaves the file alone", async () => {
    const before = readFileSync(file, "utf8");
    await callTool("rename_symbol", { file, oldName: "salute", newName: "hail", dryRun: true });
    expect(readFileSync(file, "utf8")).toBe(before);
  });
});

describe("content fidelity", () => {
  let dir: string;
  let file: string;

  beforeAll(() => {
    dir = makeFixtureDir("hashpilot-mcp-fidelity-");
    file = join(dir, "fixture.ts");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("multi-line content with quotes, backticks, and backslashes survives a tool call", async () => {
    // This is the case the CLI's `@file` indirection exists to dodge. Over MCP
    // the content rides inside JSON, so it must arrive byte-identical without
    // any escaping ceremony on the caller's part.
    const nasty = [
      "const s = `template ${x} with \\`escaped\\` ticks`;",
      'const q = "double \\"quoted\\" and \'single\'";',
      "const re = /a\\\\b\\n[^\"']+/g;",
      "// tab\there, and a trailing backslash \\\\",
      "const multi = `line1",
      "line2",
      "line3`;",
    ].join("\n");

    writeFileSync(file, "const placeholder = 1;\n");
    const original = readFileSync(file, "utf8");

    // Round-trip the payload through the wire exactly as a host would.
    const wire = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "replace_content",
        arguments: { file, oldContent: "const placeholder = 1;", newContent: nasty },
      },
    });
    const res = JSON.parse((await handleLine(wire))!);
    expect(res.result.isError).toBe(false);

    const after = readFileSync(file, "utf8");
    expect(after).toBe(original.replace("const placeholder = 1;", nasty));
    expect(after).toContain("\\`escaped\\`");
    expect(after).toContain("line1\nline2\nline3");
  });

  test("a payload containing a newline cannot split the JSON-RPC frame", async () => {
    // The stdio transport is newline-delimited; a literal newline inside a
    // string is escaped by JSON.stringify, and must stay one frame.
    const wire = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "read_many", arguments: { files: ["a\nb"] } },
    });
    expect(wire.includes("\n")).toBe(false);
    const out = await handleLine(wire);
    expect(out!.includes("\n")).toBe(false);
  });
  test("a required numeric argument rejects empty strings and arrays", async () => {
    // `Number("")` and `Number([])` are both 0, so a NaN-only check let these
    // through, the handler coerced them back to undefined, and the call came
    // back green — a silent success for a nonsense argument.
    for (const line of ["", [], null]) {
      const res = await callTool("read_hash", { file: "package.json", line });
      expect(res.isError).toBe(true);
      const payload = JSON.parse((res.content as any)[0].text);
      expect(payload.error.code).toBe("INVALID_ARGUMENTS");
    }
    const ok = await callTool("read_hash", { file: "package.json", line: "1" });
    expect(ok.isError).toBe(false);
  });

  test("a missing file reports FILE_NOT_FOUND, not INTERNAL_ERROR", async () => {
    // INTERNAL_ERROR reads to a model as "the tool is broken" rather than
    // "fix the path", and it will retry instead of correcting the argument.
    const res = await callTool("find_symbols", { file: "does/not/exist.ts" });
    expect(res.isError).toBe(true);
    expect(JSON.parse((res.content as any)[0].text).error.code).toBe("FILE_NOT_FOUND");
  });
});

/**
 * Envelope conformance (#104).
 *
 * The MCP server used to emit a three-field envelope ({apiVersion, ok, data}),
 * so `command` and `warnings` were unreachable over the integration path the
 * docs recommend, and a relocated hash anchor or a route fallback looked
 * identical to a clean hit.
 */
describe("MCP envelope matches the adapter contract (#104)", () => {
  const KEYS = ["apiVersion", "ok", "command", "data", "error", "warnings"];

  function payloadOf(res: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse((res.content as any)[0].text);
  }

  test("a successful call carries all five documented fields", async () => {
    const res = await callTool("read_many", { files: ["package.json"] });
    const payload = payloadOf(res);
    expect(Object.keys(payload).sort()).toEqual([...KEYS].sort());
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("read_many");
    expect(payload.error).toBeNull();
    expect(Array.isArray(payload.warnings)).toBe(true);
    expect(payload.data).not.toBeNull();
    // structuredContent must be the same object, not the old shorter one.
    expect(Object.keys(res.structuredContent as object).sort()).toEqual([...KEYS].sort());
  });

  test("a failing call carries the same fields, with error populated", async () => {
    const res = await callTool("find_symbols", { file: "does/not/exist.ts" });
    const payload = payloadOf(res);
    expect(Object.keys(payload).sort()).toEqual([...KEYS].sort());
    expect(payload.ok).toBe(false);
    expect(payload.command).toBe("find_symbols");
    expect((payload.error as any).code).toBe("FILE_NOT_FOUND");
    expect(Array.isArray(payload.warnings)).toBe(true);
  });

  test("an unknown tool and a bad argument still produce a full envelope", async () => {
    for (const [tool, args] of [
      ["no_such_tool", {}],
      ["read_hash", { file: "package.json", line: [] }],
    ] as const) {
      const payload = payloadOf(await callTool(tool, args));
      expect(Object.keys(payload).sort()).toEqual([...KEYS].sort());
      expect(payload.command).toBe(tool);
    }
  });

  test("every tool responds with a full envelope naming itself", async () => {
    // Arguments are deliberately absent: whether the call succeeds or is
    // refused for a missing argument, the envelope shape must not vary.
    for (const op of OPERATIONS) {
      const payload = payloadOf(await callTool(op.name, {}));
      expect(Object.keys(payload).sort()).toEqual([...KEYS].sort());
      expect(payload.command).toBe(op.name);
    }
  });
  test("a route fallback reaches the caller as a warning", async () => {
    // The point of the fix: an AST edit that silently became a diff edit used
    // to look identical over MCP to one that stayed on the AST tier.
    const dir = makeFixtureDir("mcp-warn-");
    const file = join(dir, "n.txt");
    writeFileSync(file, "alpha\nbeta\n");
    const payload = payloadOf(
      await callTool("route_edit", {
        file,
        operation: "rename-symbol",
        oldName: "alpha",
        newName: "gamma",
      })
    );
    expect((payload.warnings as any[]).map((w) => w.code)).toContain("ROUTE_FALLBACK");
    rmSync(dir, { recursive: true, force: true });
  });
});
