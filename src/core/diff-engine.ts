import { safeWrite } from "./paths";
import { readDecoded } from "./encoding";
export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: string[];
}

export interface PatchResult {
  success: boolean;
  hunksApplied: number;
  hunksFailed: number;
  message: string;
  newSource?: string;
  diff?: string;
}

// --- LCS-based diff ---

function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

function backtrack(a: string[], b: string[], dp: number[][]): DiffOp[] {
  const result: DiffOp[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: "same", line: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", line: b[j - 1] });
      j--;
    } else {
      result.push({ type: "removed", line: a[i - 1] });
      i--;
    }
  }
  result.reverse();
  return result;
}

interface DiffOp {
  type: "same" | "removed" | "added";
  line: string;
}

// --- Hunk grouping ---

function groupHunks(ops: DiffOp[], contextLines: number): Hunk[] {
  const hunks: Hunk[] = [];
  const len = ops.length;

  let i = 0;
  const regions: Array<{ start: number; end: number }> = [];

  while (i < len) {
    while (i < len && ops[i].type === "same") i++;
    if (i >= len) break;

    const changeStart = i;
    while (i < len && ops[i].type !== "same") i++;
    const changeEnd = i;

    const start = Math.max(0, changeStart - contextLines);
    const end = Math.min(len, changeEnd + contextLines);

    if (regions.length > 0 && start <= regions[regions.length - 1].end) {
      regions[regions.length - 1].end = end;
    } else {
      regions.push({ start, end });
    }
  }

  for (const region of regions) {
    let oldStart = 1;
    let oldLines = 0;
    let newStart = 1;
    let newLines = 0;

    for (let k = 0; k < region.start; k++) {
      if (ops[k].type !== "added") oldStart++;
      if (ops[k].type !== "removed") newStart++;
    }

    const lines: string[] = [];
    let k = region.start;

    for (; k < region.end; k++) {
      if (ops[k].type === "same") {
        oldLines++;
        newLines++;
        lines.push(` ${ops[k].line}`);
      } else if (ops[k].type === "removed") {
        oldLines++;
        lines.push(`-${ops[k].line}`);
      } else {
        newLines++;
        lines.push(`+${ops[k].line}`);
      }
    }

    const header = `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`;
    hunks.push({ oldStart, oldLines, newStart, newLines, header, lines });
  }

  return hunks;
}

// --- Public API ---

export function generateUnifiedDiff(
  oldSource: string,
  newSource: string,
  filePath: string,
  contextLines: number = 3
): string {
  const oldLines = oldSource.split("\n");
  const newLines = newSource.split("\n");

  const dp = lcsTable(oldLines, newLines);
  const ops = backtrack(oldLines, newLines, dp);
  const hunks = groupHunks(ops, contextLines);

  if (hunks.length === 0) return "";

  const parts: string[] = [];
  parts.push(`--- a/${filePath}`);
  parts.push(`+++ b/${filePath}`);

  for (const hunk of hunks) {
    parts.push(hunk.header);
    for (const line of hunk.lines) {
      parts.push(line);
    }
  }

  return parts.join("\n") + "\n";
}

export function parsePatch(patchText: string): { filePath: string; hunks: Hunk[] } {
  const lines = patchText.split("\n");
  const hunks: Hunk[] = [];
  let filePath = "";

  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("--- a/")) {
      filePath = line.slice(6);
      i++;
      continue;
    }
    if (line.startsWith("--- ") && !line.startsWith("--- a/")) {
      filePath = line.slice(4);
      i++;
      continue;
    }
    if (line.startsWith("+++ ")) {
      i++;
      continue;
    }

    const hdrMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hdrMatch) {
      const oldStart = parseInt(hdrMatch[1]);
      const oldLines = hdrMatch[2] !== undefined ? parseInt(hdrMatch[2]) : 1;
      const newStart = parseInt(hdrMatch[3]);
      const newLines = hdrMatch[4] !== undefined ? parseInt(hdrMatch[4]) : 1;

      // Consume exactly the number of lines the header declares rather than
      // scanning for the next "@@"/"--- " marker. Hunk bodies are prefixed, so a
      // removed line whose content starts with "-- " renders as "--- ..." and a
      // marker scan would mistake file content for the next file header,
      // truncating the hunk (#31).
      const hunkLines: string[] = [];
      let oldSeen = 0;
      let newSeen = 0;
      i++;
      while (i < lines.length && (oldSeen < oldLines || newSeen < newLines)) {
        const hl = lines[i];
        if (hl.startsWith(" ")) {
          oldSeen++;
          newSeen++;
        } else if (hl.startsWith("-")) {
          oldSeen++;
        } else if (hl.startsWith("+")) {
          newSeen++;
        } else if (!hl.startsWith("\\")) {
          break; // malformed body line; stop rather than mis-consume
        }
        hunkLines.push(hl);
        i++;
      }
      // Trailing "\ No newline at end of file" markers belong to this hunk.
      while (i < lines.length && lines[i].startsWith("\\")) {
        hunkLines.push(lines[i]);
        i++;
      }

      hunks.push({ oldStart, oldLines, newStart, newLines, header: line, lines: hunkLines });
      continue;
    }

    i++;
  }

  return { filePath, hunks };
}

export function applyPatchToSource(
  source: string,
  patchText: string,
  options?: { fuzzyMatch?: number }
): PatchResult {
  const fuzzy = options?.fuzzyMatch ?? 3;
  const parsed = parsePatch(patchText);

  if (parsed.hunks.length === 0) {
    return { success: false, hunksApplied: 0, hunksFailed: 0, message: "No hunks found in patch" };
  }

  const srcLines = source.split("\n");
  let hunksApplied = 0;
  let hunksFailed = 0;
  let lineOffset = 0;

  for (const hunk of parsed.hunks) {
    const result = applyHunk(srcLines, hunk, lineOffset, fuzzy);
    if (result.success) {
      lineOffset += result.offsetDelta;
      hunksApplied++;
    } else {
      hunksFailed++;
      if (result.error) {
        return { success: false, hunksApplied, hunksFailed, message: result.error };
      }
    }
  }

  const newSource = srcLines.join("\n");

  return {
    success: hunksFailed === 0,
    hunksApplied,
    hunksFailed,
    message: hunksFailed === 0 ? `Applied ${hunksApplied} hunk(s)` : `Applied ${hunksApplied}, failed ${hunksFailed}`,
    newSource,
  };
}

export async function applyPatch(
  filePath: string,
  patchText: string,
  options?: { dryRun?: boolean; fuzzyMatch?: number }
): Promise<PatchResult> {
  const dryRun = options?.dryRun ?? false;

  let source: string;
  try {
    source = (await readDecoded(filePath)).text;
  } catch {
    return { success: false, hunksApplied: 0, hunksFailed: parsePatch(patchText).hunks.length, message: `Cannot read file: ${filePath}` };
  }

  const result = applyPatchToSource(source, patchText, options);

  if (result.success && result.newSource && !dryRun) {
    try {
      await safeWrite(filePath, result.newSource);
    } catch {
      return { success: false, hunksApplied: result.hunksApplied, hunksFailed: result.hunksFailed, message: `Cannot write file: ${filePath}` };
    }
  }

  return result;
}

// --- Internal hunk application ---

interface HunkApplyResult {
  success: boolean;
  offsetDelta: number;
  error?: string;
}

function applyHunk(
  srcLines: string[],
  hunk: Hunk,
  lineOffset: number,
  fuzzy: number
): HunkApplyResult {
  const targetOldStart = hunk.oldStart + lineOffset - 1; // 0-indexed

  // Search for a hunk match within the fuzzy window. The window is +/- `fuzzy`
  // lines around the recorded position -- it deliberately does NOT extend by
  // `hunk.oldLines`, which used to let a hunk land a whole body-length away from
  // where it was recorded and silently patch the wrong region (#31).
  //
  // `fuzzy: 0` is strict mode: the hunk applies at exactly the recorded offset
  // with exactly the recorded content, or it refuses.
  const searchStart = Math.max(0, targetOldStart - fuzzy);
  const searchEnd = Math.min(srcLines.length, targetOldStart + fuzzy) + 1;
  let matchIdx = -1;

  for (let srcPos = searchStart; srcPos < searchEnd; srcPos++) {
    if (hunkMatches(srcLines, hunk, srcPos)) {
      matchIdx = srcPos;
      break;
    }
  }

  if (matchIdx < 0) {
    return {
      success: false,
      offsetDelta: 0,
      error:
        fuzzy === 0
          ? `Hunk failed at ${hunk.header}: strict mode (fuzzy 0) requires an exact match at line ${targetOldStart + 1}`
          : `Hunk failed at ${hunk.header}: context not found near line ${targetOldStart + 1}`,
    };
  }

  // Build replacement: context and added lines, skip removed lines
  const replacementLines: string[] = [];
  for (const hl of hunk.lines) {
    if (hl.startsWith(" ")) {
      replacementLines.push(hl.slice(1));
    } else if (hl.startsWith("+")) {
      replacementLines.push(hl.slice(1));
    }
  }

  // Strict mode: refuse a patch that has already been applied. Both sides of a
  // hunk can match the same position -- a pure insertion still matches its own
  // old side after it has landed -- so when both match, the longer side wins. If
  // that is the new side, the region is already in its post-patch state and
  // re-applying would duplicate it (#31).
  if (fuzzy === 0 && replacementLines.length > hunk.oldLines && linesMatchAt(srcLines, replacementLines, matchIdx)) {
    return {
      success: false,
      offsetDelta: 0,
      error: `Hunk failed at ${hunk.header}: already applied at line ${matchIdx + 1}`,
    };
  }

  srcLines.splice(matchIdx, hunk.oldLines, ...replacementLines);

  const offsetDelta = replacementLines.length - hunk.oldLines;
  return { success: true, offsetDelta };
}

/** True when `want` appears verbatim in `srcLines` starting at `pos`. */
function linesMatchAt(srcLines: string[], want: string[], pos: number): boolean {
  if (pos + want.length > srcLines.length) return false;
  for (let k = 0; k < want.length; k++) {
    if (srcLines[pos + k] !== want[k]) return false;
  }
  return true;
}

function hunkMatches(srcLines: string[], hunk: Hunk, srcPos: number): boolean {
  let s = srcPos;
  for (const hl of hunk.lines) {
    if (hl.startsWith(" ")) {
      if (s >= srcLines.length || srcLines[s] !== hl.slice(1)) return false;
      s++;
    } else if (hl.startsWith("-")) {
      if (s >= srcLines.length || srcLines[s] !== hl.slice(1)) return false;
      s++;
    } else if (hl.startsWith("+")) {
      // Added line: no source line consumed
    }
    // Non-prefix lines (e.g., "\ No newline") are ignored
  }
  return (s - srcPos) === hunk.oldLines;
}

/**
 * Turn a dry-run edit result into a preview.
 *
 * A dry run exists so a caller can decide whether to commit the edit, and for an
 * agent the cost of that decision is context tokens. Returning the whole
 * post-edit file made previewing an edit more expensive than making it, so the
 * cheapest correct move became "skip the dry run" — exactly backwards (#98).
 * The default payload is now a unified diff of the changed hunks; the full text
 * stays available behind an explicit `includeSource` opt-in.
 *
 * Only dry runs are rewritten, and only successful ones: a failure carries no
 * `newSource`, and a real write already told the caller what landed on disk.
 */
export function toPreview<T extends { success?: boolean; newSource?: string }>(
  result: T,
  source: string | undefined,
  filePath: string,
  includeSource?: boolean
): T & { diff?: string; sourceOmitted?: boolean } {
  if (includeSource || !result.success || !result.newSource || source === undefined) return result;
  const diff = generateUnifiedDiff(source, result.newSource, filePath);
  const { newSource: _omitted, ...rest } = result as Record<string, unknown>;
  return { ...rest, diff, sourceOmitted: true } as T & { diff?: string; sourceOmitted?: boolean };
}
