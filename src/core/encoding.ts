/**
 * Byte-fidelity for file content (issue #30).
 *
 * A structured-editing tool has exactly one non-negotiable property: it must
 * not change bytes it was not asked to change. Reading a file with
 * `.split("\n")` and writing it back with `.join("\n")` breaks that three ways
 * — it deletes `\r` from every line of a CRLF file, folds a BOM into line 1
 * where it corrupts that line's hash, and drops or invents a trailing newline.
 * The result is a one-line edit that produces a diff touching every line.
 *
 * The fix is to normalize at the boundary: `decodeText` strips the BOM and
 * converts every line ending to `\n`, all the editing tiers operate on that
 * plain-LF text, and `encodeText` puts the original bytes back. Everything in
 * between stays simple, and only this module knows about `\r`.
 */

/** How a file's bytes were laid out, so a write can reproduce them. */
export interface FileEncoding {
  /** File began with U+FEFF. */
  bom: boolean;
  /** Dominant line ending, used for any line the edit created. */
  eol: "\n" | "\r\n" | "\r";
  /**
   * The original ending of each line, when the file mixed styles. Lines the
   * edit did not add keep their own ending; anything past the end of this
   * array falls back to `eol`. Absent when the file was consistent.
   */
  endings?: string[];
  /** File ended with a line ending. */
  trailingNewline: boolean;
}

const BOM = "﻿";

/** Matches every line terminator we preserve: CRLF, lone LF, lone CR. */
const EOL_RE = /\r\n|\n|\r/g;

/**
 * Split raw file text into plain-LF content plus the information needed to
 * write the original bytes back. `encodeText(decodeText(raw))` is the
 * identity for any input.
 */
export function decodeText(raw: string): { text: string; encoding: FileEncoding } {
  const bom = raw.startsWith(BOM);
  const body = bom ? raw.slice(BOM.length) : raw;

  const endings: string[] = [];
  let counts = { "\n": 0, "\r\n": 0, "\r": 0 };
  let text = "";
  let last = 0;
  EOL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EOL_RE.exec(body)) !== null) {
    text += body.slice(last, m.index) + "\n";
    endings.push(m[0]);
    counts[m[0] as keyof typeof counts]++;
    last = m.index + m[0].length;
  }
  text += body.slice(last);

  const trailingNewline = endings.length > 0 && last === body.length;

  // Dominant style, with LF as the tiebreak: a file with no line endings at
  // all has no evidence either way, and LF is what a new line should use.
  let eol: FileEncoding["eol"] = "\n";
  let best = 0;
  for (const style of ["\n", "\r\n", "\r"] as const) {
    if (counts[style] > best) {
      best = counts[style];
      eol = style;
    }
  }

  const consistent = endings.every((e) => e === eol);
  return {
    text,
    encoding: { bom, eol, trailingNewline, ...(consistent ? {} : { endings }) },
  };
}

/**
 * Reassemble plain-LF text into the file's original byte layout.
 *
 * Line endings are restored by position, so an edit that rewrites line 3 of a
 * mixed-ending file leaves lines 1, 2, and 4 exactly as they were. Lines the
 * edit added take the dominant style — there is no original ending to copy.
 *
 * Trailing-newline presence follows the original file, not the edit: an agent
 * that hands back content with or without a final newline is describing the
 * lines it wants, not asking to change how the file terminates.
 */
export function encodeText(text: string, encoding: FileEncoding): string {
  // Emptying a file means an empty file. Restoring the trailing newline here
  // would turn a deletion into a file containing one blank line.
  if (text === "") return encoding.bom ? BOM : "";

  const hadTrailing = text.endsWith("\n");
  const body = hadTrailing ? text.slice(0, -1) : text;
  const lines = body.split("\n");

  let out = encoding.bom ? BOM : "";
  for (let i = 0; i < lines.length; i++) {
    out += lines[i];
    const isLast = i === lines.length - 1;
    if (isLast && !encoding.trailingNewline) break;
    out += encoding.endings?.[i] ?? encoding.eol;
  }
  return out;
}

/** Read a file and decode it in one step. */
export async function readDecoded(
  filePath: string
): Promise<{ text: string; encoding: FileEncoding }> {
  return decodeText(await Bun.file(filePath).text());
}
