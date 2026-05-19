# M5: Intelligent Edit Planning — Steve Jobs Approved

## The One Thing

**Intent in. Code out.**

The agent says what it wants. HashPilot does everything else. No flags. No routing. No file lists. One command:

```
structured-edit intent "Add a timeout parameter to fetchUser"
```

Three seconds later: 43 files changed, signatures updated, call sites fixed, imports resolved, tests green. The agent never knows which files were touched.

## The Architecture

Three layers, all hidden from the user:

```
┌─────────────────────────────────────────┐
│  intent "Add timeout param to fetchUser" │  ← 1 public command
├─────────────────────────────────────────┤
│  LAYER 1: Intent Parser                  │
│  Structured intent → plan sketch         │
├─────────────────────────────────────────┤
│  LAYER 2: Reference Discovery            │
│  LSP textDocument/references             │
│  Fallback: tree-sitter + grep            │
├─────────────────────────────────────────┤
│  LAYER 3: Plan Executor                  │
│  Existing routeEdit + batch-edit         │
│  Verification pipeline                   │
├─────────────────────────────────────────┤
│  ENGINE (hidden, existing)               │
│  AST parsing / hash anchoring / diff     │
└─────────────────────────────────────────┘
```

### Layer 1 — Intent Parser (`src/core/intent.ts`)
- Accepts: `{ intent: string, files?: string[] }`
- Parses natural language into structured intent using pattern matching + keyword extraction:
  ```
  "Add a timeout parameter to fetchUser"
  → { operation: "add-parameter", symbol: "fetchUser", param: { name: "timeout", type: "number" } }
  ```
- Supported M5 intents: `add-parameter`, `remove-parameter`, `extract-function`, `change-return-type`, `rename-exported-symbol`
- Uses the existing `findProjectRoot` + `detectTools` to know the project context

### Layer 2 — Reference Discovery (`src/core/lsp-client.ts`)
- Per-language LSP process management (tsserver, gopls, rust-analyzer, pyright)
- `findReferences(symbol, file)` → `[{ file, line, column, context }]`
- Maintain a cached LSP server per project — startup once, reuse across edits
- **MVP strategy**: TypeScript/JavaScript only (tsserver via stdio — well documented, widely available). Go, Python, Rust added after MVP validation.
- **Fallback**: When LSP is unavailable → tree-sitter query + `grepMany` combo. Degraded quality (text matching, not semantic), but functional.

### Layer 3 — Plan Executor (`src/core/plan-executor.ts`)
- Takes structured intent + reference list → generates ordered edit sequence
- Example plan for "add parameter to fetchUser":
  1. Modify `fetchUser` function signature (add `timeout?: number`)
  2. Update call site A in `src/app.ts` (add argument)
  3. Update call site B in `src/workers.ts` (add argument)
  4. Update call site C in `tests/app.test.ts` (add argument)
  5. Run `verifyChanges` on all touched files
- Uses existing `routeEdit()` for each individual file edit
- Uses existing `batch-edit` pattern for parallelizable steps
- Self-healing: if a call site has a local `timeout` variable → auto-rename the local to avoid conflict

## What We Kill (User-Facing)

| Kill | Why |
|------|-----|
| `--method` flag on intent command | The engine decides |
| `--policy` on intent command | Internal only |
| `--dry-run` on intent command | Build it safe enough to trust |
| Route policies as a user concept | Implementation detail |
| Individual edit commands as primary interface | Power-user debug only |

## What Stays (Hidden)

- The entire three-tier editing engine (AST/hash/diff)
- `routeEdit`, `batch-edit`, `verifyChanges`
- Existing CLI commands for debugging and edge cases
- The router — it becomes an internal implementation choice, not a user decision

## The Launch Demo

```
$ structured-edit intent "Add a dryRun option to publishRelease and thread it
  through every caller that passes an opts object"

Analyzing intent... done.
Scanning project (TypeScript, 128 files)... done.
Found publishRelease in src/release.ts:142
Found 12 call sites across 8 files
Planning edits...

  [1/12] src/release.ts — updated signature
  [2/12] src/cli.ts:89 — added dryRun argument
  [3/12] src/cli.ts:203 — added dryRun argument
  [4/12] src/ci.ts:45 — added dryRun argument
  ...
  [12/12] tests/release.test.ts — updated test call

Verifying... formatter ✅  linter ✅  typecheck ✅  tests ✅  (3.8s)

12 call sites updated across 8 files. All checks pass.
```

That's the demo where the room goes silent.

## Phased Delivery

### Phase 1: MVP (this milestone)
- Layer 1: Intent parser with 5 structured intents (no free-form NLP)
- Layer 2: LSP client for TypeScript/JavaScript only (tsserver)
- Layer 3: Sequential plan executor with rollback
- One command: `structured-edit intent <json-string>` (structured intent, not free text yet)
- Fallback to grep-based reference discovery if tsserver unavailable

### Phase 2: Natural Language (M5.X follow-up)
- Free-form natural language intent parsing
- More intent types (inline-variable, reorder-parameters, wrap-in-try-catch)

### Phase 3: Full Language Coverage (M5.X follow-up)
- LSP backends for Go (gopls), Python (pyright), Rust (rust-analyzer)
- Unified reference discovery API across all languages

## Success Criteria

1. An agent applies a multi-file parameter change with **one command**
2. Zero call sites missed (LSP guarantees semantic completeness)
3. Failed edits roll back cleanly
4. Existing 192 tests still pass
5. Smoke: `structured-edit intent '{"operation":"add-parameter","symbol":"verifyChanges","file":"src/core/verify.ts","param":{"name":"debug","type":"boolean","default":"false"}}'` — updates signature + all call sites + tests
