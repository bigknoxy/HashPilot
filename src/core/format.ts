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

import { colorizeGlyphs } from "./output";

/* ── Output format type ──────────────────────────────────────────────── */

export type OutputFormat = "json" | "text";

/**
 * Single stdout choke point for every renderer (#47). Status glyphs are
 * colorized here — and only here — so no renderer has to know whether color is
 * enabled, and so an escape sequence can never reach a JSON path.
 */
function write(text: string): void {
  process.stdout.write(colorizeGlyphs(text));
}

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

/**
 * Generic renderer: print a single-line summary of the result.
 *
 * `finish()` only reaches a renderer when `success !== false`, so a payload with
 * no `success` field at all (every read-only command: find-symbols, route,
 * capabilities) is a success. Testing `payload.success` for truthiness instead
 * marked all of them "✗ error" (#132).
 */
function renderGenericDump(payload: ResultPayload): void {
  const lines: string[] = [];
  lines.push(payload.success !== false ? "✓ ok" : "✗ " + (String(payload.errorCode || "error")));
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
  write(lines.join("\n") + "\n");
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
  write(overall + "\n");
  for (const c of checks) {
    write(`  ${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? " — " + c.detail : ""}\n`);
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
    write("✗ " + p.error + "\n");
    return;
  }
  const lines = (p.lines as string[]) || (p.content ? [p.content] : []);
  const n = lines.length;
  const hash = p.hash || p.lineHash || "";
  const filePath = p.file || p.path || "";
  write(
    `${filePath ? basePath(filePath) + ": " : ""}${n} line${n === 1 ? "" : "s"}${hash ? "  " + hash.slice(0, 8) : ""}\n`
  );
  if (lines.length > 0 && lines.length <= 5) {
    for (const l of lines) write("  " + l + "\n");
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
  write(`${ok}/${results.length} edits succeeded\n`);
  for (const r of results.filter((r) => !r.success)) {
    write("✗ " + basePath(r.file || r.path || "?") + ": " + (r.error || "failed") + "\n");
  }
});

/** Shared renderer for any single edit result. */
function printEditResult(p: ResultPayload) {
  const f = p.file || p.path || "";
  const route = p.route || "?";
  write(
    `${p.success ? "✓" : "✗"} ${route} ${f ? basePath(f) : ""}${p.line ? ":" + p.line : ""}\n`
  );
  if (!p.success) write("  " + (p.error || p.message || "failed") + "\n");
}

// grep / grep-many — print N matches across M files
registerRenderer("grep", (p) => {
  const r = p.results || p;
  const matches = (r?.matches || []) as unknown[];
  write(`${matches.length} match${matches.length === 1 ? "" : "es"}\n`);
  for (const m of (matches as any[]).slice(0, 10)) {
    write(
      "  " + basePath(m.file || m.path || "?") + ":" + (m.line || "?") + "  " + truncate(m.content, 60) + "\n"
    );
  }
  if (matches.length > 10) write(`  … ${matches.length - 10} more\n`);
});
registerRenderer("grep-many", (p) => {
  const r = p.results || p;
  const matches = (r?.matches || []) as unknown[];
  write(`${matches.length} match${matches.length === 1 ? "" : "es"}\n`);
  for (const m of (matches as any[]).slice(0, 10)) {
    write(
      "  " + basePath(m.file || m.path || "?") + ":" + (m.line || "?") + "  " + truncate(m.content, 60) + "\n"
    );
  }
});

// symbol-lookup
registerRenderer("symbol-lookup", (p) => {
  const results = (p.results || p.symbols || []) as ResultPayload[];
  write(`${results.length} symbol${results.length === 1 ? "" : "s"}` + "\n");
  for (const r of results.slice(0, 10)) {
    write(
      `  ${r.name || r.symbol || "?"}  ${r.kind || "?"}  ${basePath(r.file || r.path || "")}:${r.line || "?"}\n`
    );
  }
});

// intent
registerRenderer("intent", (p) => {
  const plan = p.plan as ResultPayload | undefined;
  if (p.success !== false) {
    write("✓ plan succeeded\n");
    if (plan?.impactSummary) write("  " + plan.impactSummary + "\n");
  } else {
    write("✗ " + (p.errorCode || p.error || "failed") + "\n");
  }
  const unresolved = plan?.unresolved;
  if (Array.isArray(unresolved) && unresolved.length > 0) {
    write(`  ${unresolved.length} unresolved item(s):\n`);
    for (const u of unresolved as ResultPayload[]) {
      write("    " + basePath(u.file || "") + ": " + (u.reason || "") + "\n");
    }
  }
});

// verify
registerRenderer("verify", (p) => {
  // "no checks ran" is its own line: printing "all checks passed" over an empty
  // check set is exactly the false green of #106.
  if (p.overall === "skipped") write("⚠ no checks ran — nothing was verified\n");
  else if (p.success !== false) write("✓ all checks passed\n");
  else write("✗ " + (p.errorCode || "checks failed") + "\n");
  const checks = (p.checks || p.results || []) as ResultPayload[];
  for (const c of checks.slice(0, 5)) {
    write(`  ${c.overall === "pass" || c.success ? "✓" : "✗"} ${c.command || c.name || "?"}\n`);
  }
});

// verify-changes — the CLI command name; the "verify" renderer above serves the
// plan/step payloads that embed a list of checks.
registerRenderer("verify-changes", (p) => {
  const ran = (p.checksRun || []) as string[];
  if (p.overall === "skipped") {
    // Never "all checks passed" over an empty check set — that false green is
    // the whole of #106.
    write("⚠ no checks ran — nothing was verified\n");
    write("  " + String(p.message || "") + "\n");
    return;
  }
  const mark = p.overall === "pass" ? "✓" : "✗";
  write(`${mark} ${p.overall} (${ran.length} check${ran.length === 1 ? "" : "s"}: ${ran.join(", ")})\n`);
  for (const name of ran) {
    const run = p[name] as ResultPayload | undefined;
    if (run) write(`  ${run.passed ? "✓" : "✗"} ${name}\n`);
  }
});

// telemetry subcommands
registerRenderer("telemetry-show", (p) => {
  const events = (p.events || p) as ResultPayload[];
  const arr = Array.isArray(events) ? events : [events];
  write(`${arr.length} event${arr.length === 1 ? "" : "s"}\n`);
  for (const e of arr.slice(0, 10)) {
    write(
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
registerRenderer("telemetry-export", (p) => write("✓ exported " + (p.count || 0) + " event(s)\n"));
registerRenderer("telemetry-prune", (p) => write("✓ pruned " + (p.count || 0) + " event(s)\n"));

// route-query
registerRenderer("route", (p) => {
  write((p.success !== false ? "✓ " + (p.route || "ok") : "✗ " + (p.errorCode || "routing failed")) + "\n");
});

// ast-capabilities
registerRenderer("ast-capabilities", (p) => {
  const langs = (p.languages || []) as string[];
  write(`${langs.length} language(s) supported\n`);
});

// health / telemetry-summary
registerRenderer("health", (p) => {
  write((p.success !== false ? "✓ " : "✗ ") + (p.message || "") + "\n");
});
registerRenderer("telemetry-summary", (p) => {
  write((p.success !== false ? "✓ " : "✗ ") + (p.message || JSON.stringify(Object.keys(p)).slice(0, 120)) + "\n");
});

// ── helpers ────────────────────────────────────────────────────────────

function basePath(p: string): string {
  return p.includes("/") ? p.split("/").pop() || p : p;
}
function truncate(s: unknown, n: number): string {
  const str = String(s);
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}
