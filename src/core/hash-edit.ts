import { computeHash } from "./read";
import { ErrorCode } from "./telemetry";
import { addWarning } from "./envelope";
import { assertWritable, atomicWrite, PathDeniedError, type AssertWritableOptions } from "./paths";
import { recordSnapshot } from "./snapshot";
import { firstParseError } from "./ast-edit";

/**
 * What to do when the anchor hash no longer matches the content at the given range.
 *
 * - `relocate` (default): search the file for a window whose hash equals `oldHash`.
 *   Exactly one match relocates the edit; zero or several is a hard failure.
 * - `off`: any mismatch fails immediately.
 *
 * Neither mode ever applies the edit to content the caller did not anchor to.
 */
export type RecoveryMode = "relocate" | "off";

export interface ReplaceHashOptions {
  range?: { start: number; end: number };
  dryRun?: boolean;
  contextLines?: number;
  /** Stale-anchor policy. Defaults to `"relocate"`. */
  recovery?: RecoveryMode;
  /** @deprecated Use `recovery: "off"`. Retained for source compatibility. */
  noRecovery?: boolean;
  /** Write-boundary overrides forwarded to `assertWritable`. */
  pathOptions?: AssertWritableOptions;
  /**
   * Skip the post-edit parse check. Off by default; the CLI sets it from
   * `--allow-parse-errors` only for files that already fail to parse.
   */
  skipParseCheck?: boolean;
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
  /** Machine-readable failure cause. Absent on success. */
  errorCode?: ErrorCode;
  /** What the caller should do next when `success` is false. */
  recovery?: string;
  /** Range the anchor was relocated to, when relocation succeeded. */
  relocatedTo?: { start: number; end: number };
}

/**
 * Slide a window of `windowSize` lines across the file, collecting every start
 * index whose content hashes to `oldHash`. Stops after two hits — one is enough
 * to relocate, two is enough to know it is ambiguous.
 */
function findAnchorCandidates(lines: string[], windowSize: number, oldHash: string): number[] {
  const hits: number[] = [];
  if (windowSize <= 0 || windowSize > lines.length) return hits;
  for (let start = 0; start + windowSize <= lines.length; start++) {
    if (computeHash(lines.slice(start, start + windowSize).join("\n")) === oldHash) {
      hits.push(start);
      if (hits.length > 1) break;
    }
  }
  return hits;
}

export async function replaceHash(
  filePath: string,
  oldHash: string,
  newContent: string,
  options: ReplaceHashOptions = {}
): Promise<ReplaceHashResult> {
  const { range, dryRun = false } = options;
  // `noRecovery: true` is the legacy spelling of `recovery: "off"`.
  const recoveryMode: RecoveryMode = options.recovery ?? (options.noRecovery ? "off" : "relocate");

  const fail = (
    message: string,
    errorCode: ErrorCode,
    recovery: string,
    extra: Partial<ReplaceHashResult> = {},
  ): ReplaceHashResult => ({
    path: filePath,
    success: false,
    oldHash,
    newHash: "",
    linesChanged: 0,
    stale: false,
    retries: 0,
    message,
    errorCode,
    recovery,
    ...extra,
  });

  let content: string;
  try {
    content = await Bun.file(filePath).text();
  } catch (e: any) {
    return fail(
      `Failed to read file: ${e.message}`,
      ErrorCode.FILE_NOT_FOUND,
      "Check that the path exists and is readable.",
    );
  }

  const lines = content.split("\n");

  // Defensive range validation. The CLI validates too, but replaceHash is a
  // public API: a NaN or inverted range must never reach the slice arithmetic,
  // where `slice(x, NaN)` yields an empty window and `slice(NaN)` re-appends
  // the whole file.
  if (range) {
    const { start, end } = range;
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return fail(
        `Invalid range: start and end must be integers (got ${start}:${end}).`,
        ErrorCode.INVALID_ARGUMENT,
        "Pass --range as N or N:M with positive integers.",
      );
    }
    if (start < 1 || end < 1) {
      return fail(
        `Invalid range ${start}:${end}: line numbers are 1-indexed.`,
        ErrorCode.INVALID_ARGUMENT,
        "Use a start and end of 1 or greater.",
      );
    }
    if (start > end) {
      return fail(
        `Invalid range ${start}:${end}: start is after end.`,
        ErrorCode.INVALID_ARGUMENT,
        "Swap the bounds so start <= end.",
      );
    }
    if (end > lines.length) {
      return fail(
        `Invalid range ${start}:${end}: file has only ${lines.length} lines.`,
        ErrorCode.INVALID_ARGUMENT,
        `Use an end of at most ${lines.length}.`,
      );
    }
  }

  let targetStart: number;
  let targetEnd: number;

  if (range) {
    targetStart = range.start - 1;
    targetEnd = range.end;
  } else {
    targetStart = 0;
    targetEnd = lines.length;
  }

  let targetLines = lines.slice(targetStart, targetEnd);
  let targetText = targetLines.join("\n");
  const currentHash = computeHash(targetText);
  let stale = false;
  let retries = 0;
  let messageSuffix = "";
  let relocatedTo: { start: number; end: number } | undefined;

  if (currentHash !== oldHash) {
    // A whole-file anchor has nothing to relocate to — the anchor *is* the
    // file, so a mismatch means the caller's view of the file is stale. There
    // is no safe interpretation; refuse.
    const relocatable = recoveryMode === "relocate" && range !== undefined;

    if (!relocatable) {
      return fail(
        buildStaleMessage(oldHash, currentHash, targetStart + 1, targetEnd),
        ErrorCode.STALE_ANCHOR,
        "Re-read the file to obtain a current hash, then retry.",
        { newHash: currentHash, stale: true },
      );
    }

    const candidates = findAnchorCandidates(lines, targetEnd - targetStart, oldHash);

    if (candidates.length === 0) {
      return fail(
        buildStaleMessage(oldHash, currentHash, targetStart + 1, targetEnd) +
          `\n  The anchored content was not found anywhere else in the file.`,
        ErrorCode.STALE_ANCHOR,
        "Re-read the file to obtain a current hash, then retry.",
        { newHash: currentHash, stale: true },
      );
    }
    if (candidates.length > 1) {
      return fail(
        `AMBIGUOUS ANCHOR: content matching hash ${oldHash} appears at more than one location in ${filePath}.`,
        ErrorCode.AMBIGUOUS_ANCHOR,
        "Widen the range so the anchored content is unique, then retry.",
        { newHash: currentHash, stale: true },
      );
    }

    // Exactly one match: the content moved. Re-anchor onto it.
    const windowSize = targetEnd - targetStart;
    targetStart = candidates[0]!;
    targetEnd = targetStart + windowSize;
    targetLines = lines.slice(targetStart, targetEnd);
    targetText = targetLines.join("\n");
    stale = true;
    retries = 1;
    relocatedTo = { start: targetStart + 1, end: targetEnd };
    messageSuffix = ` (anchor relocated to lines ${relocatedTo.start}-${relocatedTo.end})`;
    // The edit succeeds, but it did not land where the caller pointed. Say so.
    addWarning({
      code: "ANCHOR_RELOCATED",
      message: `Anchor content moved; edit applied at lines ${relocatedTo.start}-${relocatedTo.end}.`,
      relocatedTo,
    });
  }

  let writePath: string | undefined;
  if (!dryRun) {
    try {
      writePath = assertWritable(filePath, options.pathOptions);
    } catch (e) {
      if (e instanceof PathDeniedError) {
        return fail(e.message, ErrorCode.PATH_DENIED, "Pass --allow-outside-root or choose a path inside the project root.");
      }
      throw e;
    }
  }

  return applyReplacement(
    filePath, lines, targetStart, targetEnd, targetLines, targetText,
    newContent, oldHash, dryRun, stale, retries, messageSuffix, relocatedTo, writePath,
    options.skipParseCheck === true,
  );
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
  messageSuffix: string = "",
  relocatedTo?: { start: number; end: number },
  /** Symlink-resolved destination returned by assertWritable. Falls back to filePath on dry runs. */
  writePath?: string,
  skipParseCheck: boolean = false,
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

  // A hash edit is content-blind: it will happily splice half a function into
  // the middle of another one. When a parser exists for this language, refuse
  // the write if the result does not parse and the original did (#13).
  if (!skipParseCheck) {
    const after = firstParseError(newFullContent, filePath);
    if (after) {
      const lines0 = lines.join("\n");
      const before = firstParseError(lines0, filePath);
      if (!before) {
        return {
          path: filePath,
          success: false,
          oldHash,
          newHash: "",
          linesChanged: 0,
          stale: false,
          retries,
          errorCode: ErrorCode.PARSE_ERROR,
          message:
            `Edit was discarded: the result does not parse (syntax error at line ${after.line}:${after.column} — ${after.nodeType}). ` +
            `The file parsed cleanly before, so this replacement would have corrupted it.`,
          recovery: `hashpilot read-hash ${filePath} ${after.line} — re-read around the break, or pass --allow-parse-errors to write anyway.`,
        };
      }
    }
  }

  if (!dryRun) {
    // `writePath` is already boundary-resolved by the caller. Atomic, and
    // snapshotted, for the same reasons every other write is (#12).
    const target = writePath ?? filePath;
    recordSnapshot(target, newFullContent);
    atomicWrite(target, newFullContent);
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
    relocatedTo,
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