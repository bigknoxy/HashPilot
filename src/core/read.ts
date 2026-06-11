import { createHash } from "crypto";

export interface ReadResult {
  path: string;
  content: string;
  hash: string;
  lines: number;
  error?: string;
}

export function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

export function computeLineHash(line: string): string {
  return createHash("sha256").update(line).digest("hex").slice(0, 8);
}

export async function readMany(files: string[]): Promise<ReadResult[]> {
  const results = await Promise.all(
    files.map(async (p) => {
      try {
        const content = await Bun.file(p).text();
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
    const content = await Bun.file(filePath).text();
    const lines = content.split("\n");
    const targetLine = lines[line - 1];
    if (!targetLine) {
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