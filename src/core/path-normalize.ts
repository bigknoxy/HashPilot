import { join, isAbsolute, resolve, sep, normalize } from "node:path";

/**
 * Canonical path representation: absolute, symlink-resolved where possible,
 * stored relative to the project root (cwd).
 *
 * All path comparisons in the codebase should route through this helper
 * so that `foo.ts`, `./foo.ts`, `src/../src/foo.ts`, and `/abs/path/src/foo.ts`
 * all compare as equal.
 */
export function normalizePath(file: string | undefined | null): string {
  if (!file) return "";
  let p = file.trim();
  if (p === "") return "";

  // Resolve to absolute first (handles relative segments, ./, ../)
  if (!isAbsolute(p)) {
    p = join(process.cwd(), p);
  }
  p = resolve(p);
  // Normalize removes trailing slashes and resolves ../ etc.
  p = normalize(p);

  // Now make relative to cwd if possible
  const cwd = normalize(process.cwd());
  if (p.startsWith(cwd + sep)) {
    return p.slice(cwd.length + 1);
  }
  if (p === cwd) {
    return ".";
  }
  // On case-insensitive filesystems, also try case-insensitive match
  if (isCaseInsensitiveFS()) {
    const lowerCwd = cwd.toLowerCase();
    const lowerP = p.toLowerCase();
    if (lowerP.startsWith(lowerCwd + sep)) {
      return p.slice(cwd.length + 1);
    }
  }

  // If outside cwd, return the normalized absolute path
  return p;
}

function isCaseInsensitiveFS(): boolean {
  // macOS (darwin) and Windows (win32) are case-insensitive by default
  return process.platform === "darwin" || process.platform === "win32";
}

/**
 * Compare two paths after normalization.
 * Returns true if both resolve to the same canonical path.
 */
export function pathsEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  // No special-casing for nullish input: `normalizePath` already maps
  // undefined, null, "", and whitespace to the same empty canonical form.
  // An explicit undefined-only guard here made the relation inconsistent —
  // (null, undefined) compared false while (null, null) and (null, "")
  // compared true.
  return normalizePath(a) === normalizePath(b);
}
