import type { BenchCase } from "../types";

/**
 * Diff-tier cases. This is the fallback for languages with no parser, so it is
 * the tier most likely to be reached in a mixed repo and the one where a wrong
 * match is hardest to notice.
 */
export const diffCases: BenchCase[] = [
  {
    id: "diff-replace-unique",
    description: "replace content that appears exactly once",
    file: "notes.md",
    source: ["# Title", "", "status: draft", "", "end", ""].join("\n"),
    edit: { method: "diff", operation: "replace-content", oldContent: "status: draft", newContent: "status: final" },
    expected: ["# Title", "", "status: final", "", "end", ""].join("\n"),
    tags: ["diff"],
  },
  {
    id: "diff-ambiguous-refused",
    description: "content appearing more than once must be refused with a disambiguation hint",
    file: "notes.md",
    source: ["alpha", "alpha", ""].join("\n"),
    edit: { method: "diff", operation: "replace-content", oldContent: "alpha", newContent: "beta" },
    expectRefusal: "two candidate sites; picking one is a coin flip the caller did not authorise",
    tags: ["diff", "ambiguity"],
  },
  {
    id: "diff-absent-refused",
    description: "content that is not in the file must be refused",
    file: "notes.md",
    source: ["alpha", ""].join("\n"),
    edit: { method: "diff", operation: "replace-content", oldContent: "gamma", newContent: "beta" },
    expectRefusal: "nothing to anchor to; a fuzzy nearest-match would edit a line the caller never named",
    tags: ["diff"],
  },
  {
    id: "diff-reserved-tokens",
    description: "content whose lines begin with unified-diff reserved tokens round-trips intact",
    file: "notes.md",
    source: ["intro", "--- not a header", "+++ also not", "@@ nor this", "outro", ""].join("\n"),
    edit: {
      method: "diff",
      operation: "replace-content",
      oldContent: "--- not a header\n+++ also not\n@@ nor this",
      newContent: "--- replaced\n+++ replaced\n@@ replaced",
    },
    expected: ["intro", "--- replaced", "+++ replaced", "@@ replaced", "outro", ""].join("\n"),
    knownIssue: 32,
    tags: ["diff", "reserved-tokens"],
  },
  {
    id: "diff-multiline-block",
    description: "replace a multi-line block bounded by identical neighbours",
    file: "notes.md",
    source: ["x", "start", "middle", "finish", "x", ""].join("\n"),
    edit: {
      method: "diff",
      operation: "replace-content",
      oldContent: "start\nmiddle\nfinish",
      newContent: "start\nreplaced\nfinish",
    },
    expected: ["x", "start", "replaced", "finish", "x", ""].join("\n"),
    tags: ["diff", "multiline"],
  },
  {
    id: "diff-trailing-newline-preserved",
    description: "a file with no trailing newline keeps its shape after an edit",
    file: "notes.md",
    source: ["alpha", "omega"].join("\n"),
    edit: { method: "diff", operation: "replace-content", oldContent: "alpha", newContent: "first" },
    expected: ["first", "omega"].join("\n"),
    tags: ["diff", "encoding"],
  },
];
