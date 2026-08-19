import type { BenchCase } from "../types";

/**
 * Hash-tier cases. The tier's whole claim is that an anchor either matches the
 * bytes it was read from, relocates to the same content elsewhere, or refuses.
 * "Refuses" is a passing outcome here and is asserted as such.
 */
export const hashCases: BenchCase[] = [
  {
    id: "hash-replace-exact",
    description: "replace a line range whose hash still matches",
    file: "conf.yaml",
    source: ["name: demo", "value: alpha", "trailing: keep", ""].join("\n"),
    hashRange: { start: 2, end: 2 },
    edit: { method: "hash", operation: "replace-hash", range: { start: 2, end: 2 }, newContent: "value: beta" },
    expected: ["name: demo", "value: beta", "trailing: keep", ""].join("\n"),
    tags: ["hash"],
  },
  {
    id: "hash-chain-newhash-no-reread",
    description: "the newHash of a successful edit anchors the next edit to the same region, with no re-read (#101)",
    file: "conf.yaml",
    source: ["name: demo", "value: alpha", "trailing: keep", ""].join("\n"),
    hashRange: { start: 2, end: 2 },
    edit: { method: "hash", operation: "replace-hash", range: { start: 2, end: 2 }, newContent: "value: beta" },
    chain: { newContent: "value: gamma" },
    expected: ["name: demo", "value: gamma", "trailing: keep", ""].join("\n"),
    tags: ["hash", "chaining"],
  },
  {
    id: "hash-chain-newrange-tracks-line-count",
    description: "a chained edit follows newRange when the replacement changed the line count (#101)",
    file: "conf.yaml",
    source: ["name: demo", "value: alpha", "trailing: keep", ""].join("\n"),
    hashRange: { start: 2, end: 2 },
    edit: {
      method: "hash",
      operation: "replace-hash",
      range: { start: 2, end: 2 },
      newContent: ["value: beta", "extra: one"].join("\n"),
    },
    chain: { newContent: "value: gamma" },
    expected: ["name: demo", "value: gamma", "trailing: keep", ""].join("\n"),
    tags: ["hash", "chaining"],
  },
  {
    id: "hash-stale-anchor-refused",
    description: "a hash that matches nothing in the file must be refused, never applied to the range anyway",
    file: "conf.yaml",
    source: ["name: demo", "value: alpha", ""].join("\n"),
    edit: {
      method: "hash",
      operation: "replace-hash",
      range: { start: 2, end: 2 },
      oldHash: "0".repeat(64),
      newContent: "value: beta",
    },
    expectRefusal: "the anchor does not match; applying by line number alone is how a stale edit lands on the wrong content",
    tags: ["hash", "stale-anchor"],
  },
  {
    id: "hash-relocate-moved-content",
    description: "an anchor whose content moved and appears exactly once must relocate rather than refuse",
    file: "conf.yaml",
    source: ["header: one", "header: two", "value: alpha", ""].join("\n"),
    // Hash the content at its original position, then hand the edit a range
    // pointing one line earlier — the content moved down by one.
    hashRange: { start: 3, end: 3 },
    edit: { method: "hash", operation: "replace-hash", range: { start: 2, end: 2 }, newContent: "value: beta" },
    expected: ["header: one", "header: two", "value: beta", ""].join("\n"),
    tags: ["hash", "relocation"],
  },
  {
    id: "hash-replace-multiline-range",
    description: "replace a multi-line range and preserve everything outside it",
    file: "conf.yaml",
    source: ["a: 1", "b: 2", "c: 3", "d: 4", ""].join("\n"),
    hashRange: { start: 2, end: 3 },
    edit: { method: "hash", operation: "replace-hash", range: { start: 2, end: 3 }, newContent: "b: 20\nc: 30" },
    expected: ["a: 1", "b: 20", "c: 30", "d: 4", ""].join("\n"),
    tags: ["hash", "multiline"],
  },
  {
    id: "hash-delete-range",
    description: "an empty replacement removes the range's lines without eating its neighbours",
    file: "conf.yaml",
    source: ["a: 1", "b: 2", "c: 3", ""].join("\n"),
    hashRange: { start: 2, end: 2 },
    edit: { method: "hash", operation: "replace-hash", range: { start: 2, end: 2 }, newContent: "" },
    expected: ["a: 1", "c: 3", ""].join("\n"),
    tags: ["hash", "deletion"],
  },
  {
    id: "hash-unicode-preserved",
    description: "a hash edit next to astral-plane characters leaves them byte-identical",
    file: "conf.yaml",
    source: ["emoji: 👩‍💻 done", "value: alpha", "kanji: 日本語", ""].join("\n"),
    hashRange: { start: 2, end: 2 },
    edit: { method: "hash", operation: "replace-hash", range: { start: 2, end: 2 }, newContent: "value: beta" },
    expected: ["emoji: 👩‍💻 done", "value: beta", "kanji: 日本語", ""].join("\n"),
    tags: ["hash", "unicode"],
  },
  {
    id: "hash-out-of-range-refused",
    description: "a range past the end of the file must be refused",
    file: "conf.yaml",
    source: ["a: 1", ""].join("\n"),
    edit: {
      method: "hash",
      operation: "replace-hash",
      range: { start: 50, end: 60 },
      oldHash: "0".repeat(64),
      newContent: "x",
    },
    expectRefusal: "the range does not exist; extending the file to reach it would fabricate content",
    tags: ["hash", "range-validation"],
  },
];
