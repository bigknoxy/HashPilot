import { createHash } from "crypto";
import { readDecoded } from "./encoding";

export interface ReadResult {
  path: string;
  content: string;
  hash: string;
  lines: number;
  error?: string;
}

/** Hash width, shared by every anchor. See `computeLineHash`. */
const HASH_WIDTH = 12;

export function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, HASH_WIDTH);
}

/**
 * A single line's anchor hash. Identical to `computeHash` — it exists to name
 * the intent, not to compute something different.
 *
 * It used to truncate to 8 characters while `computeHash` used 12, so the
 * `lineHash` from `read-hash` never matched what `replace-hash` computed: the
 * read → write round-trip always failed with `STALE_ANCHOR`, which is
 * documented as retryable, so an agent retried it forever.
 */
export function computeLineHash(line: string): string {
  return computeHash(line);
}

export async function readMany(files: string[]): Promise<ReadResult[]> {
  const results = await Promise.all(
    files.map(async (p) => {
      try {
        const { text: content } = await readDecoded(p);
        return {
          path: p,
          content,
          hash: computeHash(content),
          lines: content.split("\n").length - (content.endsWith("\n") ? 1 : 0),
        };
      } catch (e: any) {
        return { path: p, content: "", hash: "", lines: 0, error: e.message };
      }
    })
  );
  return results;
}

export interface ReadHashResult {
  path: string;
  line: number;
  content: string;
  lineHash: string;
  contextHash: string;
  contextBefore: string[];
  contextAfter: string[];
  error?: string;
}

export async function readHash(
  filePath: string,
  line: number,
  contextLines: number = 3
): Promise<ReadHashResult> {
  try {
    const { text: content } = await readDecoded(filePath);
    const lines = content.split("\n");
    const targetLine = lines[line - 1];
    // A blank line is an empty string, which is falsy — checking truthiness here
    // reported a legitimate blank line as out of range (#40 falsy-parameter audit).
    if (targetLine === undefined) {
      return {
        path: filePath,
        line,
        content: "",
        lineHash: "",
        contextHash: "",
        contextBefore: [],
        contextAfter: [],
        error: `Line ${line} out of range (file has ${lines.length} lines)`,
      };
    }
    const start = Math.max(0, line - 1 - contextLines);
    const end = Math.min(lines.length, line - 1 + contextLines + 1);
    const before = lines.slice(start, line - 1);
    const after = lines.slice(line, end);
    const contextText = [...before, targetLine, ...after].join("\n");
    return {
      path: filePath,
      line,
      content: targetLine,
      lineHash: computeLineHash(targetLine),
      contextHash: computeHash(contextText),
      contextBefore: before,
      contextAfter: after,
    };
  } catch (e: any) {
    return {
      path: filePath,
      line,
      content: "",
      lineHash: "",
      contextHash: "",
      contextBefore: [],
      contextAfter: [],
      error: e.message,
    };
  }
}