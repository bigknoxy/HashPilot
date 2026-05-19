/**
 * Escape special regex characters in a string.
 * Used across multiple modules that build regex patterns from user input.
 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}