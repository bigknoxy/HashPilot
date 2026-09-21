# HashPilot as an MCP server

HashPilot speaks the [Model Context Protocol](https://modelcontextprotocol.io) over
stdio. Point any MCP host at `hashpilot mcp --stdio` and every editing tier —
AST, hash-anchored, and diff — shows up as a typed tool, with the same advisory
locking, provenance, and snapshot/undo guarantees the CLI gets.

MCP is now the recommended integration path. The CLI remains fully supported and
is the fallback for hosts without MCP support, and for shell and CI use.

## Why MCP over the CLI

| | MCP | CLI |
|---|---|---|
| Multi-line content with quotes and backticks | Rides inside JSON; no escaping | Needs `@file` indirection to dodge the shell |
| Tool discovery | The host lists tools and schemas to the model | The model must be told the commands |
| Errors | Structured, with `code` and `recovery` the model can act on | Same envelope, but parsed out of stdout |
| Availability | Requires an MCP-capable host | Anywhere with a shell |

## Install

```bash
npm install -g hashpilot     # or: bun add -g hashpilot
hashpilot doctor             # confirm the install is healthy
```

## Configure your host

### Claude Code

```bash
claude mcp add hashpilot -- hashpilot mcp --stdio
```

Or add it to `~/.claude.json` by hand:

```json
{
  "mcpServers": {
    "hashpilot": {
      "command": "hashpilot",
      "args": ["mcp", "--stdio"]
    }
  }
}
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "hashpilot": {
      "command": "hashpilot",
      "args": ["mcp", "--stdio"]
    }
  }
}
```

Restart Claude Desktop afterwards; it reads the config only at launch.

### Cursor

`.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` globally:

```json
{
  "mcpServers": {
    "hashpilot": {
      "command": "hashpilot",
      "args": ["mcp", "--stdio"]
    }
  }
}
```

### Zed, Continue, and other hosts

Any host that launches a stdio MCP server takes the same three fields — command
`hashpilot`, args `["mcp", "--stdio"]`, and no environment beyond your shell's.
If your host wants an absolute path, use `which hashpilot`.

### Running from a checkout

Without a global install, point the host at the repo:

```json
{
  "mcpServers": {
    "hashpilot": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/HashPilot/src/cli.ts", "mcp", "--stdio"]
    }
  }
}
```

## Tools

Every tool is generated from the operation registry in
[`src/core/operations.ts`](../src/core/operations.ts), which is the same list the
CLI surface is verified against — the two cannot drift.

### Reading

| Tool | Use it for |
|---|---|
| `read_many` | Whole files plus a content hash per file. The hash is the anchor a later `replace_hash` verifies against. |
| `read_hash` | One line with context and its hash, when you already know the line. |
| `grep_many` | Regex search across paths. The cheapest way to locate code. |
| `symbol_lookup_many` | Where symbols are *defined* (not referenced). |
| `find_symbols` | Every symbol declared in one file. |
| `ast_capabilities` | Which languages and AST operations are supported. |

### Editing

| Tool | Tier | Use it for |
|---|---|---|
| `rename_symbol` | AST | Binding-aware, file-scoped rename. |
| `replace_body` | AST | Swap a function body, keep the signature. |
| `add_import` / `remove_import` | AST | Imports, in the language's own style. |
| `insert_before` / `insert_after` | AST | Code anchored to a symbol, not a line number. |
| `replace_hash` | Hash | Verified replacement — refuses if the file changed since you read it. |
| `replace_content` | Diff | Exact-match fallback; refuses on an ambiguous match. |
| `route_edit` | auto | Any operation, letting HashPilot pick the strongest tier available. |

### Verification

`verify_changes` runs the project's own formatter, linter, type checker, and
tests, scoped to the files you edited. Pass `useBaseline: true` so tests that
were already failing do not get blamed on your edit.

Every mutating tool accepts `dryRun`, plus `actor`, `taskId`, and `reason` for
provenance — the same fields the CLI records, queryable afterwards with
`hashpilot provenance query <file>`.

## Error handling

A failed edit comes back as a normal MCP result with `isError: true`, not as a
JSON-RPC error. Protocol errors are the host's problem; tool errors are yours to
read and recover from. The payload is the standard envelope:

```json
{
  "apiVersion": "1",
  "ok": false,
  "command": "replace_hash",
  "data": null,
  "error": {
    "code": "STALE_ANCHOR",
    "message": "the file changed since the hash was taken",
    "recovery": "Re-read the file and retry with the new hash."
  },
  "warnings": []
}
```

Act on `error.code`; `error.recovery` says what to do next. The codes are the
same ones the CLI reports — see [ADAPTER-CONTRACT.md](ADAPTER-CONTRACT.md).

Every tool response — success or failure — carries all five envelope fields,
byte-for-byte the shape the CLI writes: `command` names the tool that answered,
`data` and `error` are both present with one of them `null`, and `warnings`
reports route fallbacks and relocated hash anchors. That last one is the reason
this matters: an AST edit that quietly became a diff edit is otherwise
indistinguishable from one that stayed on the AST tier ([#104](../../issues/104)).

## Write boundary

The MCP server enforces exactly the same boundary as the CLI: writes are
confined to the project root, and credentials, shell config, and system paths
are refused unconditionally. A tool call cannot widen it. Widen the project's
own `allowedRoots` in `.hashpilot.json` if you legitimately need more.

## Troubleshooting

**The host shows no tools.** Check the binary runs: `hashpilot mcp --stdio`
should sit waiting on stdin rather than exiting. `hashpilot doctor` diagnoses a
broken install.

**Edits fail with `PATH_DENIED`.** The target is outside the project root. Start
the host from the project directory, or add the location to `allowedRoots`.

**AST tools fall back to hash or diff.** tree-sitter is a native module; if the
bindings did not build, parsers load as `null` and routing degrades silently.
Reinstall, then check `ast_capabilities`.

**Verify a host's view by hand:**

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | hashpilot mcp --stdio
```
