import { spawn } from "child_process";
import { glob as globSync } from "glob";

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
  } = {}
): Promise<GrepManyResult> {
  const start = Date.now();
  try {
    const args: string[] = ["-rn", "--column"];
    if (options.ignoreCase) args.push("-i");
    if (options.filePattern) args.push("--include", options.filePattern);
    if (options.maxResults) args.push("-m", String(options.maxResults));
    args.push("-E", pattern, ...paths);

    const result = await runCommand("grep", args);
    const lines = result.stdout.split("\n").filter(Boolean);
    const results: GrepResult[] = lines.map((line) => {
      const match = line.match(/^([^:]+):(\d+):(\d+):(.*)$/);
      if (!match) return null as any;
      return {
        path: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        content: match[4],
        match: pattern,
      };
    }).filter(Boolean);

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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectSymbolKind(content: string, name: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("class ")) return "class";
  if (trimmed.startsWith("interface ")) return "interface";
  if (trimmed.startsWith("type ")) return "type";
  if (trimmed.startsWith("function ")) return "function";
  if (trimmed.startsWith("export function ")) return "function";
  if (trimmed.startsWith("const ")) return "const";
  if (trimmed.startsWith("let ")) return "let";
  if (trimmed.startsWith("var ")) return "var";
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