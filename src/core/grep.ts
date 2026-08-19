import { spawn } from "child_process";
import { glob as globSync } from "glob";
import { escapeRegex } from "./utils";

export interface GrepResult {
  path: string;
  line: number;
  column: number;
  content: string;
  match: string;
}

export interface GrepManyResult {
  pattern: string;
  results: GrepResult[];
  error?: string;
  elapsed_ms: number;
}

export async function grepMany(
  pattern: string,
  paths: string[],
  options: {
    ignoreCase?: boolean;
    filePattern?: string;
    maxResults?: number;
    wordMatch?: boolean;
  } = {}
): Promise<GrepManyResult> {
  const start = Date.now();
  try {
    // `-H` forces the filename prefix even for a single file argument, so every
    // output line has the same shape and the parser never has to guess (#105).
    const args: string[] = ["-rnH"];
    if (options.ignoreCase) args.push("-i");
    if (options.wordMatch) args.push("-w");
    if (options.filePattern) args.push("--include", options.filePattern);
    if (options.maxResults) args.push("-m", String(options.maxResults));
    args.push("-E", pattern, ...paths);

    const result = await runCommand("grep", args);
    const lines = result.stdout.split("\n").filter(Boolean);
    const results: GrepResult[] = lines.flatMap((line) => {
      const parsed = parseGrepLine(line, paths);
      if (!parsed) return [];
      return [{ ...parsed, column: columnOf(parsed.content, pattern, options), match: pattern }];
    });

    return { pattern, results, elapsed_ms: Date.now() - start };
  } catch (e: any) {
    if (e?.code === 1 && !e.stderr) {
      return { pattern, results: [], elapsed_ms: Date.now() - start };
    }
    return {
      pattern,
      results: [],
      error: e.message,
      elapsed_ms: Date.now() - start,
    };
  }
}

/**
 * Split one `path:line:content` output line.
 *
 * The previous parser tried `file:line:column:text` first, which GNU grep never
 * emits — it has no column-output mode — so the only lines that reached that
 * branch were ones whose *content* began with digits and a colon, and those got
 * their prefix eaten and a fabricated `column` (#105). Parsing is now anchored
 * on the search roots: the longest root the line starts with is stripped first,
 * so a root containing a colon parses correctly, and everything after the line
 * number is content, verbatim.
 */
function parseGrepLine(
  line: string,
  roots: string[]
): { path: string; line: number; content: string } | null {
  const byLength = [...roots].sort((a, b) => b.length - a.length);
  for (const root of byLength) {
    if (!line.startsWith(root)) continue;
    const rest = line.slice(root.length);
    // Either `:12:text` (the root was the file) or `/sub/f.ts:12:text` (the root
    // was a directory grep recursed into).
    const m = rest.match(/^(.*?):(\d+):([\s\S]*)$/);
    if (m) return { path: root + m[1], line: parseInt(m[2], 10), content: m[3] };
  }
  // A root we cannot attribute the line to (a symlinked root, say). Fall back to
  // the shortest plausible path prefix rather than dropping the match.
  const m = line.match(/^(.*?):(\d+):([\s\S]*)$/);
  return m ? { path: m[1], line: parseInt(m[2], 10), content: m[3] } : null;
}

/**
 * 1-indexed column of the match within the line.
 *
 * This used to be hardcoded to 1, so an agent building a `file:line:col` jump
 * from it always landed at the start of the line while the field claimed
 * otherwise. It is recomputed in process because grep does not report it.
 */
function columnOf(content: string, pattern: string, options: { ignoreCase?: boolean; wordMatch?: boolean }): number {
  try {
    const source = options.wordMatch ? `\\b(?:${pattern})\\b` : pattern;
    const re = new RegExp(source, options.ignoreCase ? "i" : "");
    const m = re.exec(content);
    if (m) return m.index + 1;
  } catch {
    // A POSIX ERE grep accepts but JS does not. Column 1 is the honest floor.
  }
  return 1;
}

export interface SymbolLookupResult {
  name: string;
  path: string;
  line: number;
  kind: string;
}

export async function symbolLookupMany(
  names: string[],
  paths: string[]
): Promise<SymbolLookupResult[]> {
  const results: SymbolLookupResult[] = [];
  for (const name of names) {
    const grepRes = await grepMany(
      `\\b(function|class|interface|type|const|let|var|export)\\s+${escapeRegex(name)}\\b`,
      paths,
      { maxResults: 20 }
    );
    for (const r of grepRes.results) {
      results.push({
        name,
        path: r.path,
        line: r.line,
        kind: detectSymbolKind(r.content, name),
      });
    }
  }
  return results;
}

function detectSymbolKind(content: string, _name: string): string {
  const trimmed = content.trim();
  // Strip leading "export " to unify exported and non-exported declarations
  const stripped = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
  if (stripped.startsWith("function ")) return "function";
  if (stripped.startsWith("class ")) return "class";
  if (stripped.startsWith("interface ")) return "interface";
  if (stripped.startsWith("type ")) return "type";
  if (stripped.startsWith("const ")) return "const";
  if (stripped.startsWith("let ")) return "let";
  if (stripped.startsWith("var ")) return "var";
  return "unknown";
}

function runCommand(
  cmd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => {
      if (code === 1 && !stderr) {
        resolve({ stdout, stderr, code });
      } else if (code !== 0) {
        const err: any = new Error(`Command failed: ${cmd} ${args.join(" ")}`);
        err.code = code;
        err.stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout, stderr, code });
      }
    });
    proc.on("error", reject);
  });
}