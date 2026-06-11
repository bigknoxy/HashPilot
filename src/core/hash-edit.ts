import { computeHash } from "./read";

export interface ReplaceHashOptions {
  range?: { start: number; end: number };
  dryRun?: boolean;
  contextLines?: number;
  /** Skip auto-recovery when stale anchor is detected */
  noRecovery?: boolean;
}

export interface ReplaceHashResult {
  path: string;
  success: boolean;
  oldHash: string;
  newHash: string;
  linesChanged: number;
  stale: boolean;
  message: string;
  diff?: string;
  /** Number of auto-retries performed (1 if recovered from stale anchor, 0 otherwise) */
  retries?: number;
}

export async function replaceHash(
  filePath: string,
  oldHash: string,
  newContent: string,
  options: ReplaceHashOptions = {}
): Promise<ReplaceHashResult> {
  const { range, dryRun = false, noRecovery = false } = options;
  let content: string;
  try {
    content = await Bun.file(filePath).text();
  } catch (e: any) {
    return {
      path: filePath,
      success: false,
      oldHash,
      newHash: "",
      linesChanged: 0,
      stale: false,
      message: `Failed to read file: ${e.message}`,
      retries: 0,
    };
  }

  const lines = content.split("\n");

  let targetStart: number;
  let targetEnd: number;

  if (range) {
    targetStart = range.start - 1;
    targetEnd = range.end;
  } else {
    targetStart = 0;
    targetEnd = lines.length;
  }

  const targetLines = lines.slice(targetStart, targetEnd);
  const targetText = targetLines.join("\n");
  const currentHash = computeHash(targetText);

  if (currentHash !== oldHash) {
    if (!noRecovery) {
      // Auto-recovery: the file has changed since the hash was computed.
      // Apply the edit to the current file content instead of failing.
      return applyReplacement(filePath, lines, targetStart, targetEnd, targetLines, targetText, newContent, oldHash, dryRun, true, 1, " (auto-recovered from stale anchor)");
    }

    const staleMsg = buildStaleMessage(oldHash, currentHash, targetStart + 1, targetEnd);
    return {
      path: filePath,
      success: false,
      oldHash,
      newHash: currentHash,
      linesChanged: 0,
      stale: true,
      retries: 0,
      message: staleMsg,
    };
  }

  return applyReplacement(filePath, lines, targetStart, targetEnd, targetLines, targetText, newContent, oldHash, dryRun, false, 0);
}

async function applyReplacement(
  filePath: string,
  lines: string[],
  targetStart: number,
  targetEnd: number,
  targetLines: string[],
  targetText: string,
  newContent: string,
  oldHash: string,
  dryRun: boolean,
  stale: boolean,
  retries: number,
  messageSuffix: string = ""
): Promise<ReplaceHashResult> {
  const newContentLines = newContent.split("\n");
  if (newContentLines[newContentLines.length - 1] === "" && !targetText.endsWith("\n")) {
    newContentLines.pop();
  }

  const newLines = [
    ...lines.slice(0, targetStart),
    ...newContentLines,
    ...lines.slice(targetEnd),
  ];
  const newFullContent = newLines.join("\n");
  const newFullHash = computeHash(newFullContent);
  const diff = buildDiff(targetStart + 1, targetLines, newContentLines);
  const linesChanged = Math.abs(newContentLines.length - targetLines.length) + countChangedLines(targetLines, newContentLines);
  const rangeLabel = `range ${targetStart + 1}-${targetEnd}`;

  if (!dryRun) {
    await Bun.write(filePath, newFullContent);
  }

  const action = dryRun ? "Dry run: would replace" : "Replaced";
  return {
    path: filePath,
    success: true,
    oldHash,
    newHash: newFullHash,
    linesChanged,
    stale,
    retries,
    message: dryRun
      ? `${action} ${targetLines.length} lines with ${newContentLines.length} lines${messageSuffix}`
      : `${action} ${targetLines.length} lines with ${newContentLines.length} lines${messageSuffix} (${rangeLabel})`,
    diff,
  };
}

function buildStaleMessage(
  expected: string,
  actual: string,
  start: number,
  end: number
): string {
  return (
    `STALE ANCHOR: Content hash mismatch in lines ${start}-${end}.\n` +
    `  Expected hash: ${expected}\n` +
    `  Actual hash:   ${actual}\n` +
    `  The file has been modified since the hash was computed.\n` +
    `  Re-read the file and retry with the current hash.`
  );
}

function buildDiff(
  startLine: number,
  oldLines: string[],
  newLines: string[]
): string {
  const maxCtx = 3;
  const parts: string[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  let changeStart = -1;
  let changeEnd = -1;

  for (let i = 0; i < maxLen; i++) {
    const oldL = oldLines[i] ?? "";
    const newL = newLines[i] ?? "";
    if (oldL !== newL) {
      if (changeStart === -1) changeStart = i;
      changeEnd = i;
    }
  }

  if (changeStart === -1) return "(no changes)";

  const ctxStart = Math.max(0, changeStart - maxCtx);
  const ctxEnd = Math.min(maxLen - 1, changeEnd + maxCtx);

  for (let i = ctxStart; i <= ctxEnd; i++) {
    const ln = startLine + i;
    const oldL = oldLines[i];
    const newL = newLines[i];
    if (oldL === undefined && newL !== undefined) {
      parts.push(`+ ${ln} | ${newL}`);
    } else if (newL === undefined && oldL !== undefined) {
      parts.push(`- ${ln} | ${oldL}`);
    } else if (oldL !== newL) {
      parts.push(`- ${ln} | ${oldL}`);
      parts.push(`+ ${ln} | ${newL}`);
    } else {
      parts.push(`  ${ln} | ${oldL}`);
    }
  }
  return parts.join("\n");
}

function countChangedLines(oldLines: string[], newLines: string[]): number {
  let count = 0;
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if ((oldLines[i] ?? "") !== (newLines[i] ?? "")) count++;
  }
  return count;
}