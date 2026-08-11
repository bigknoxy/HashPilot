#!/usr/bin/env bun
/**
 * Generates the command table in docs/CLI-QUICKREF.md by walking the CLI's own
 * `--help` output. Reading the real help (rather than importing the Commander
 * program) means the reference can never describe a command shape the shipped
 * binary does not actually accept — src/cli.ts calls `program.parse()` at module
 * load, so it cannot be imported without executing it.
 *
 *   bun run scripts/gen-cli-quickref.ts           # rewrite the generated block
 *   bun run scripts/gen-cli-quickref.ts --check   # exit 1 if the file is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export const BEGIN_MARKER = "<!-- BEGIN GENERATED: command reference -->";
export const END_MARKER = "<!-- END GENERATED: command reference -->";

const ROOT = join(import.meta.dir, "..");
const DOC_PATH = join(ROOT, "docs", "CLI-QUICKREF.md");
const CLI = join(ROOT, "src", "cli.ts");

export interface CommandDoc {
  /** Full subcommand path, e.g. `["ast", "rename-symbol"]`. */
  path: string[];
  description: string;
  usage: string;
  args: Array<{ name: string; description: string }>;
  options: Array<{ flags: string; description: string }>;
  /** Present only on group commands like `ast` or `telemetry`. */
  children: string[];
}

function help(path: string[]): string {
  const label = path.join(" ") || "(root)";
  const res = spawnSync("bun", ["run", CLI, ...path, "--help"], {
    encoding: "utf8",
    cwd: ROOT,
    env: { ...process.env, HASHPILOT_TELEMETRY: "0" },
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  // Anything short of a clean exit means the captured stdout may be a partial
  // help page, and a partial page generates plausible-looking but wrong docs
  // that still satisfy `--check`. Refuse rather than publish it.
  if (res.error) throw new Error(`help failed for '${label}': ${res.error.message}`);
  if (res.signal) throw new Error(`help for '${label}' was killed by ${res.signal}`);
  if (res.status !== 0) {
    throw new Error(`help for '${label}' exited ${res.status}: ${res.stderr?.trim()}`);
  }
  if (!res.stdout.includes("Usage:")) {
    throw new Error(`help for '${label}' produced no Usage: line (truncated output?)`);
  }
  return res.stdout;
}

/** Splits `--help` output into its `Usage:` line and named sections. */
function sections(text: string): { usage: string; sections: Map<string, string[]> } {
  const lines = text.split("\n");
  let usage = "";
  const out = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of lines) {
    if (line.startsWith("Usage:")) {
      usage = line.slice("Usage:".length).trim();
      current = null;
      continue;
    }
    const header = /^([A-Z][A-Za-z ]*):\s*$/.exec(line);
    if (header) {
      current = header[1]!;
      out.set(current, []);
      continue;
    }
    if (current && line.trim()) out.get(current)!.push(line);
  }
  return { usage, sections: out };
}

/**
 * Splits an entry line into its term and description. Commander pads the two
 * columns apart with at least two spaces, and a description may wrap onto
 * continuation lines that carry no term at all.
 */
function entries(lines: string[]): Array<{ term: string; description: string }> {
  const out: Array<{ term: string; description: string }> = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    const indent = line.length - line.trimStart().length;
    const body = line.trim();
    if (!body) continue;
    // A continuation line is indented past the term column and has no gap.
    const split = /^(\S.*?)\s{2,}(.*)$/.exec(body);
    if (!split) {
      if (out.length && indent > 4) out[out.length - 1]!.description += ` ${body}`;
      else out.push({ term: body, description: "" });
      continue;
    }
    out.push({ term: split[1]!, description: split[2]!.trim() });
  }
  return out;
}

/** Recursively walks every subcommand reachable from `path`. */
export function walk(path: string[] = []): CommandDoc[] {
  const parsed = sections(help(path));
  const cmdEntries = entries(parsed.sections.get("Commands") ?? []);
  const children = cmdEntries
    .map((e) => e.term.split(/\s+/)[0]!)
    .filter((name) => name !== "help");

  const doc: CommandDoc = {
    path,
    description: "",
    usage: parsed.usage,
    args: entries(parsed.sections.get("Arguments") ?? []).map((e) => ({
      name: e.term,
      description: e.description,
    })),
    options: entries(parsed.sections.get("Options") ?? [])
      .map((e) => ({ flags: e.term, description: e.description }))
      .filter((o) => !/^-h, --help/.test(o.flags)),
    children,
  };

  // The root document carries the global flags (`--allowed-root`,
  // `--allow-outside-root`, `--no-telemetry`, `--version`), so it is kept, not
  // dropped — those are exactly the flags an agent must not have to guess at.
  const results: CommandDoc[] = [doc];
  // The root's own description lives above `Usage:`; subcommand descriptions
  // come from the parent's Commands table, so backfill them during recursion.
  for (const child of children) {
    const sub = walk([...path, child]);
    const own = sub.find((s) => s.path.join(" ") === [...path, child].join(" "));
    if (own) {
      own.description =
        cmdEntries.find((e) => e.term.split(/\s+/)[0] === child)?.description ?? "";
    }
    results.push(...sub);
  }
  return results;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function render(docs: CommandDoc[]): string {
  const root = docs.find((d) => d.path.length === 0);
  const leaves = docs.filter((d) => d.path.length > 0 && d.children.length === 0);
  const groups = docs.filter((d) => d.path.length > 0 && d.children.length > 0);

  const out: string[] = [];
  out.push(`_${leaves.length} commands, generated from \`--help\`. Do not edit by hand — run \`bun run gen:cli-quickref\`._`);
  out.push("");
  if (root) {
    out.push("### Global options");
    out.push("");
    out.push("Accepted before the subcommand, e.g. `structured-edit --allowed-root /srv/app read-many f.ts`.");
    out.push("");
    out.push("```");
    out.push(root.usage);
    out.push("```");
    out.push("");
    out.push("| Flag | Meaning |");
    out.push("|------|---------|");
    for (const o of root.options) out.push(`| \`${cell(o.flags)}\` | ${cell(o.description)} |`);
    out.push("");
  }
  out.push("### Command groups");
  out.push("");
  out.push("| Group | Subcommands |");
  out.push("|-------|-------------|");
  for (const g of groups) {
    out.push(`| \`${g.path.join(" ")}\` | ${g.children.map((c) => `\`${c}\``).join(", ")} |`);
  }
  out.push("");
  out.push("### Commands");
  out.push("");

  for (const d of leaves) {
    out.push(`#### \`${d.path.join(" ")}\``);
    out.push("");
    if (d.description) out.push(d.description);
    out.push("");
    out.push("```");
    out.push(d.usage);
    out.push("```");
    out.push("");
    if (d.args.length) {
      out.push("| Positional | Meaning |");
      out.push("|------------|---------|");
      for (const a of d.args) out.push(`| \`${cell(a.name)}\` | ${cell(a.description)} |`);
      out.push("");
    }
    if (d.options.length) {
      out.push("| Flag | Meaning |");
      out.push("|------|---------|");
      for (const o of d.options) out.push(`| \`${cell(o.flags)}\` | ${cell(o.description)} |`);
      out.push("");
    }
  }
  return out.join("\n").trimEnd();
}

/** Replaces the generated block in `doc`, leaving hand-written prose intact. */
export function spliceGenerated(doc: string, generated: string): string {
  const begin = doc.indexOf(BEGIN_MARKER);
  const end = doc.indexOf(END_MARKER);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(`docs/CLI-QUICKREF.md is missing the generated-block markers`);
  }
  return (
    doc.slice(0, begin + BEGIN_MARKER.length) + "\n\n" + generated + "\n\n" + doc.slice(end)
  );
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  const current = readFileSync(DOC_PATH, "utf8");
  const next = spliceGenerated(current, render(walk()));
  if (current === next) {
    console.log("✓ docs/CLI-QUICKREF.md is up to date");
    process.exit(0);
  }
  if (check) {
    console.error("✗ docs/CLI-QUICKREF.md is stale. Run: bun run gen:cli-quickref");
    process.exit(1);
  }
  writeFileSync(DOC_PATH, next);
  console.log("✓ regenerated docs/CLI-QUICKREF.md");
}
