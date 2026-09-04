import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { grepMany, type GrepResult } from "./grep";

export const DEFAULT_SOURCE_GLOBS = ["*.ts", "*.js", "*.py", "*.go", "*.rs", "*.rb"];

/** One semantic hit parsed from zg's agent-markdown output. */
export interface SearchHit {
  file: string;
  startLine: number;
  endLine: number;
  symbol?: string;
  status?: string;
  heading?: string;
}

export interface ZgSearchResult {
  engine: "zg";
  query: string;
  hits: SearchHit[];
  elapsed_ms: number;
  /** Set true when zg ran but the workspace index was missing. */
  noIndex?: boolean;
  error?: string;
  errorCode?: "SEARCH_NO_INDEX" | "SEARCH_FAILED";
}

export interface GrepSearchResult {
  engine: "grep";
  query: string;
  /** Passthrough of grep-many's own result object — result parity by construction. */
  pattern: string;
  results: GrepResult[];
  error?: string;
  /** True when zg was requested (auto/zg) but the binary was unavailable. */
  degraded?: boolean;
  elapsed_ms: number;
}

export type SearchResult = ZgSearchResult | GrepSearchResult;

export interface SearchOptions {
  engine?: "auto" | "zg" | "grep" | "off";
  sourceGlobs?: string[];
  /** Workspace root used to detect the `.zvec-grep` index (default: cwd). */
  root?: string;
  /** Explicit zg binary path (overrides ZG_BIN env and PATH lookup). */
  zgBin?: string;
}

const HIT_HEADER = /^#\d+\s+(?:matchedBy=\S+?\s+)?([^:\s][^:]*?):(\d+)-(\d+)$/;

/**
 * Parse zg's agent-markdown query output into ordered `SearchHit`s.
 *
 * Each hit block opens with `#N matchedBy=<tags> <path>:<start>-<end>` (the
 * matchedBy prefix is optional — some routes omit it), followed by zero or more
 * `key: value` attribute lines (status, symbol, heading, scope) until the next
 * `#N` header.
 */
export function parseZgMarkdown(text: string): SearchHit[] {
  const hits: SearchHit[] = [];
  let current: Partial<SearchHit> | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const header = HIT_HEADER.exec(line);
    if (header) {
      if (current?.file) hits.push(current as SearchHit);
      current = { file: header[1], startLine: Number(header[2]), endLine: Number(header[3]) };
      continue;
    }
    if (!current?.file) continue;
    const attr = /^([a-zA-Z]+):\s*(.+)$/.exec(line.trim());
    if (attr) {
      const key = attr[1] as "symbol" | "status" | "heading";
      if (key === "symbol" || key === "status" || key === "heading") current[key] = attr[2];
    }
  }
  if (current?.file) hits.push(current as SearchHit);
  return hits;
}

function matchesSource(file: string, globs: string[]): boolean {
  if (!globs || globs.length === 0) return true;
  return globs.some((g) => {
    if (g.startsWith("*.")) return file.endsWith(g.slice(1));
    return file.endsWith(g);
  });
}

function runZg(argv: string[], bin: string, timeoutMs = 60_000): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const done = (code: number | null) => {
      if (settled) return;
      settled = true;
      resolve({ stdout, stderr, code });
    };
    try {
      const proc = spawn(bin, argv, { stdio: ["ignore", "pipe", "pipe"] });
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        done(null);
      }, timeoutMs);
      proc.stdout.on("data", (d) => (stdout += d));
      proc.stderr.on("data", (d) => (stderr += d));
      proc.on("error", () => done(null));
      proc.on("close", (code) => {
        clearTimeout(timer);
        done(code);
      });
    } catch {
      done(null);
    }
  });
}

function resolveZgBinary(zgBin?: string): string | undefined {
  const explicit = zgBin || process.env.ZG_BIN;
  if (explicit) return explicit;
  const pathDirs = (process.env.PATH || "").split(":");
  for (const dir of pathDirs) {
    if (dir && existsSync(join(dir, "zg"))) return join(dir, "zg");
  }
  return undefined;
}

/** The search command surface for `hashpilot search`. */
export async function search(query: string, paths: string[], opts: SearchOptions = {}): Promise<SearchResult> {
  const start = Date.now();
  const queryGlobs = opts.sourceGlobs ?? DEFAULT_SOURCE_GLOBS;
  const engine: "auto" | "zg" | "grep" | "off" = opts.engine ?? "auto";
  const searchRoots = paths.length ? paths : ["."];

  const zgBin = resolveZgBinary(opts.zgBin);
  const zgUsable = !!zgBin && existsSync(zgBin);

  // Which engine do we run? "off"/"grep" never touch zg. "auto" prefers zg when
  // available. "zg" uses zg but degrades to grep rather than failing (F2): a
  // misconfigured / missing binary must not hard-crash the search command.
  const engineIsGrep = engine === "grep" || engine === "off";
  const degraded = engineIsGrep ? false : !zgUsable;
  const useZg = !engineIsGrep && zgUsable;

  if (!useZg) {
    const grepRes = await grepMany(query, searchRoots);
    return {
      engine: "grep",
      query,
      pattern: grepRes.pattern,
      results: grepRes.results,
      error: grepRes.error,
      degraded,
      elapsed_ms: Date.now() - start,
    };
  }

  const root = opts.root ?? process.cwd();
  if (!existsSync(join(root, ".zvec-grep"))) {
    return {
      engine: "zg",
      query,
      hits: [],
      noIndex: true,
      errorCode: "SEARCH_NO_INDEX",
      error: "No zg index found in this workspace. Run `zg index` first, then retry.",
      elapsed_ms: Date.now() - start,
    };
  }

  const args = ["query", query];
  for (const g of queryGlobs) args.push("-g", g);
  const { stdout, stderr, code } = await runZg(args, zgBin!);

  if (code !== 0) {
    if (code === 1 && !stderr) {
      // zg mirrors ripgrep: exit 1 with no stderr = no matches.
      return { engine: "zg", query, hits: [], elapsed_ms: Date.now() - start };
    }
    return {
      engine: "zg",
      query,
      hits: [],
      errorCode: "SEARCH_FAILED",
      error: (stderr || stdout || "zg exited unsuccessfully").slice(0, 300),
      elapsed_ms: Date.now() - start,
    };
  }

  const parsed = parseZgMarkdown(stdout).filter((h) => matchesSource(h.file, queryGlobs));
  return { engine: "zg", query, hits: parsed, elapsed_ms: Date.now() - start };
}