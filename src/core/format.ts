/**
 * Output format selection for the CLI.
 *
 * #19 (B16) — a global `--format <json|text>` flag, with TTY-aware defaults:
 *   - `--format json`  : always JSON (agent default, CI safe)
 *   - `--format text`  : compact human-readable output (human default, interactive shell)
 *   - no `--format`    : JSON if stdout is piped/redirected or `$CI` true; otherwise text
 *
 * The JSON envelope remains the canonical machine-readable contract (apiVersion 1);
 * `text` mode is a human convenience layer that must never replace it.
 */

/* ── Output format type ──────────────────────────────────────────────── */

export type OutputFormat = "json" | "text";

/**
 * Resolve the output format from an explicit option, CI detection, and TTY state.
 *
 * Precedence:
 * 1. Explicit `--format <json|text>` → wins always.
 * 2. `--json` (deprecated alias for `--format json`) → emits a one-time stderr
 *    deprecation warning.
 * 3. `$CI` environment variable is truthy → JSON.
 * 4. stdout is a TTY (interactive shell) → text.
 * 5. Fall back → JSON (safe default for anything not detected above).
 */
export function resolveFormat(
  opts: { format?: string; json?: boolean },
  ctx: { isTTY?: boolean; ci?: boolean } = {}
): { format: OutputFormat; warnDeprecate?: boolean } {
  // 1. explicit --format
  if (opts.format === "json" || opts.format === "text") return { format: opts.format };
  // 2. deprecated --json alias
  if (opts.json === true) return { format: "json", warnDeprecate: true };
  // 3. CI env
  const ci = ctx.ci ?? process.env.CI;
  if (ci === "true" || ci === "1") return { format: "json" };
  // 4. TTY
  const isTTY = ctx.isTTY ?? process.stdout.isTTY;
  if (isTTY) return { format: "text" };
  // 5. default to JSON
  return { format: "json" };
}

/* ── Text renderers ────────────────────────────────────────────────────
 *
 * Each renderer receives a `ResultPayload` (the `data` field that `wrap()`
 * would produce) and prints a compact, human-readable line to stdout.
 * Rendered lines never carry diagnostic noise — errors go through the same
 * `finish()` path so they emit JSON, not text.
 */

type ResultPayload = {
  success: boolean;
  [key: string]: unknown;
};

/**
 * Render a result payload as compact text for human readers.
 * Each command registers its own renderer via the `registerRenderer` map;
 * unmatched commands fall back to a generic key/value dump.
 */
export function renderText(command: string, payload: ResultPayload): void {
  const renderer = renderers[command];
  if (renderer) {
    renderer(payload);
  } else {
    // Generic fallback: compact key/value dump
    renderGenericDump(payload);
  }
}

/** Generic renderer: print a single-line summary of the result. */
function renderGenericDump(payload: ResultPayload): void {
  const lines: string[] = [];
  lines.push(payload.success ? "✓ ok" : "✗ " + (String(payload.errorCode || "error")));
  for (const [k, v] of Object.entries(payload)) {
    if (k === "success" || k === "apiVersion" || k === "error") continue;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      lines.push(`  ${k}: ${v.length} item${v.length === 1 ? "" : "s"}`);
    } else if (typeof v === "object") {
      lines.push(`  ${k}: ${summarize(v)}`);
    } else {
      lines.push(`  ${k}: ${String(v)}`);
    }
    if (lines.length >= 8) {
      lines.push("  …");
      break;
    }
  }
  process.stdout.write(lines.join("\n") + "\n");
}

/** Compact one-line summary of a value for inline display. */
function summarize(v: unknown): string {
  if (v === null || v === undefined) return "none";
  if (typeof v === "string") return `"${v.length > 60 ? v.slice(0, 57) + "…" : v}"`;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return `[${v.length}]`;
  return "...";
}

/* ── Per-command renderers ────────────────────────────────────────────── */

const renderers: Record<string, (p: ResultPayload) => void> = {};

/**
 * Register a text renderer for a specific command.
 * Called at module init for each command that has a dedicated renderer.
 */
export function registerRenderer(command: string, fn: (p: ResultPayload) => void): void {
  renderers[command] = fn;
}

/* ── Common renderer registrations ───────────────────────────────────── */

// doctor — a checklist: print P/N checks + overall ✓/✗
registerRenderer("doctor", (p) => {
  const checks = (p.checks || []) as { name: string; ok: boolean; detail?: string }[];
  const overall = p.success ? "✓ all passed" : "✗ " + checks.filter((c) => !c.ok).length + " failed";
  process.stdout.write(overall + "\n");
  for (const c of checks) {
    process.stdout.write(`  ${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? " — " + c.detail : ""}\n`);
  }
});

// read / read-many — print the first few lines + hash
registerRenderer("read", (p) => {
  printReadResult(p);
});
registerRenderer("read-many", (p) => {
  const results = (p.results || p) as unknown;
  if (Array.isArray(results)) {
    for (const r of results as ResultPayload[]) printReadResult(r);
  } else printReadResult(p);
});
registerRenderer("read-hash", (p) => printReadResult(p));

/** Shared renderer for any "read" variant: show line count + hash. */
function printReadResult(p: ResultPayload) {
  if (p.error) {
    process.stdout.write("✗ " + p.error + "\n");
    return;
  }
  const lines = (p.lines as string[]) || (p.content ? [p.content] : []);
  const n = lines.length;
  const hash = p.hash || p.lineHash || "";
  const filePath = p.file || p.path || "";
  process.stdout.write(
    `${filePath ? basePath(filePath) + ": " : ""}${n} line${n === 1 ? "" : "s"}${hash ? "  " + hash.slice(0, 8) : ""}\n`
  );
  if (lines.length > 0 && lines.length <= 5) {
    for (const l of lines) process.stdout.write("  " + l + "\n");
  }
}

// ast-replace / hash-replace / diff-apply — print success + file:line + hash
registerRenderer("ast-replace", (p) => printEditResult(p));
registerRenderer("hash-replace", (p) => printEditResult(p));
registerRenderer("diff-apply", (p) => printEditResult(p));
registerRenderer("structured-edit", (p) => printEditResult(p));
registerRenderer("edit-many", (p) => {
  const results = (p.results || []) as ResultPayload[];
  const ok = results.filter((r) => r.success).length;
  process.stdout.write(`${ok}/${results.length} edits succeeded\n`);
  for (const r of results.filter((r) => !r.success)) {
    process.stdout.write("✗ " + basePath(r.file || r.path || "?") + ": " + (r.error || "failed") + "\n");
  }
});

/** Shared renderer for any single edit result. */
function printEditResult(p: ResultPayload) {
  const f = p.file || p.path || "";
  const route = p.route || "?";
  process.stdout.write(
    `${p.success ? "✓" : "✗"} ${route} ${f ? basePath(f) : ""}${p.line ? ":" + p.line : ""}\n`
  );
  if (!p.success) process.stdout.write("  " + (p.error || p.message || "failed") + "\n");
}

// grep / grep-many — print N matches across M files
registerRenderer("grep", (p) => {
  const r = p.results || p;
  const matches = (r?.matches || []) as unknown[];
  process.stdout.write(`${matches.length} match${matches.length === 1 ? "" : "es"}\n`);
  for (const m of (matches as any[]).slice(0, 10)) {
    process.stdout.write(
      "  " + basePath(m.file || m.path || "?") + ":" + (m.line || "?") + "  " + truncate(m.content, 60) + "\n"
    );
  }
  if (matches.length > 10) process.stdout.write(`  … ${matches.length - 10} more\n`);
});
registerRenderer("grep-many", (p) => {
  const r = p.results || p;
  const matches = (r?.matches || []) as unknown[];
  process.stdout.write(`${matches.length} match${matches.length === 1 ? "" : "es"}\n`);
  for (const m of (matches as any[]).slice(0, 10)) {
    process.stdout.write(
      "  " + basePath(m.file || m.path || "?") + ":" + (m.line || "?") + "  " + truncate(m.content, 60) + "\n"
    );
  }
});

// symbol-lookup
registerRenderer("symbol-lookup", (p) => {
  const results = (p.results || p.symbols || []) as ResultPayload[];
  process.stdout.write(`${results.length} symbol${results.length === 1 ? "" : "s"}` + "\n");
  for (const r of results.slice(0, 10)) {
    process.stdout.write(
      `  ${r.name || r.symbol || "?"}  ${r.kind || "?"}  ${basePath(r.file || r.path || "")}:${r.line || "?"}\n`
    );
  }
});

// intent
registerRenderer("intent", (p) => {
  const plan = p.plan as ResultPayload | undefined;
  if (p.success) {
    process.stdout.write("✓ plan succeeded\n");
    if (plan?.impactSummary) process.stdout.write("  " + plan.impactSummary + "\n");
  } else {
    process.stdout.write("✗ " + (p.errorCode || p.error || "failed") + "\n");
  }
  const unresolved = plan?.unresolved;
  if (Array.isArray(unresolved) && unresolved.length > 0) {
    process.stdout.write(`  ${unresolved.length} unresolved item(s):\n`);
    for (const u of unresolved as ResultPayload[]) {
      process.stdout.write("    " + basePath(u.file || "") + ": " + (u.reason || "") + "\n");
    }
  }
});

// verify
registerRenderer("verify", (p) => {
  if (p.success) process.stdout.write("✓ all checks passed\n");
  else process.stdout.write("✗ " + (p.errorCode || "checks failed") + "\n");
  const checks = (p.checks || p.results || []) as ResultPayload[];
  for (const c of checks.slice(0, 5)) {
    process.stdout.write(`  ${c.overall === "pass" || c.success ? "✓" : "✗"} ${c.command || c.name || "?"}\n`);
  }
});

// telemetry subcommands
registerRenderer("telemetry-show", (p) => {
  const events = (p.events || p) as ResultPayload[];
  const arr = Array.isArray(events) ? events : [events];
  process.stdout.write(`${arr.length} event${arr.length === 1 ? "" : "s"}\n`);
  for (const e of arr.slice(0, 10)) {
    process.stdout.write(
      "  " +
        (e.operation || "?") +
        " " +
        (e.success ? "✓" : "✗") +
        " " +
        (e.route || "") +
        (e.elapsed_ms ? " " + e.elapsed_ms + "ms" : "") +
        "\n"
    );
  }
});
registerRenderer("telemetry-export", (p) => process.stdout.write("✓ exported " + (p.count || 0) + " event(s)\n"));
registerRenderer("telemetry-prune", (p) => process.stdout.write("✓ pruned " + (p.count || 0) + " event(s)\n"));

// route-query
registerRenderer("route", (p) => {
  process.stdout.write((p.success ? "✓ " + (p.route || "ok") : "✗ " + (p.errorCode || "routing failed")) + "\n");
});

// ast-capabilities
registerRenderer("ast-capabilities", (p) => {
  const langs = (p.languages || []) as string[];
  process.stdout.write(`${langs.length} language(s) supported\n`);
});

// health / telemetry-summary
registerRenderer("health", (p) => {
  process.stdout.write((p.success ? "✓ " : "✗ ") + (p.message || "") + "\n");
});
registerRenderer("telemetry-summary", (p) => {
  process.stdout.write((p.success ? "✓ " : "✗ ") + (p.message || JSON.stringify(Object.keys(p)).slice(0, 120)) + "\n");
});

// ── helpers ────────────────────────────────────────────────────────────

function basePath(p: string): string {
  return p.includes("/") ? p.split("/").pop() || p : p;
}
function truncate(s: unknown, n: number): string {
  const str = String(s);
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}
