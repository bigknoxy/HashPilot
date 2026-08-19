import { computeHash } from "../src/core/read";

/**
 * Hash a 1-indexed inclusive line range exactly the way the hash tier does, so a
 * case can declare "anchor on lines 2-3" instead of carrying a literal digest
 * that goes stale the moment the fixture is edited.
 *
 * Note the truncation: `computeHash` keeps 12 hex characters, and the tier
 * compares the anchor string literally. A full 64-character SHA-256 of the same
 * bytes is rejected as a stale anchor, so this must go through `computeHash`
 * rather than hashing here.
 */
export function computeLineRangeHashOf(source: string, start: number, end: number): string {
  const slice = source.split("\n").slice(start - 1, end).join("\n");
  return computeHash(slice);
}
