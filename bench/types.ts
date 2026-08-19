/**
 * Benchmark case model (#26).
 *
 * A case is a *complete* edit attempt: a starting file, one routed edit, and an
 * assertion about the bytes that should be on disk afterwards. The point of the
 * harness is not to prove edits succeed — it is to separate the four outcomes
 * that matter and report the two nobody else reports:
 *
 *   applied + correct     the edit landed and the file is what we said it is
 *   silent corruption     the edit reported success and the file is wrong
 *   false refusal         a correct edit was available and HashPilot refused
 *   correct refusal       an ambiguous or unsafe edit was refused, as designed
 *
 * Silent corruption is the headline metric. Refusals are recoverable; a
 * confident wrong answer is not.
 */

/** Edit parameters handed straight to `routeEdit`, minus the file path. */
export interface CaseEdit {
  operation: string;
  method?: "ast" | "hash" | "diff";
  oldName?: string;
  newName?: string;
  symbolName?: string;
  newBody?: string;
  importSpec?: string;
  content?: string;
  oldContent?: string;
  newContent?: string;
  oldHash?: string;
  range?: { start: number; end: number };
}

export interface BenchCase {
  /** Stable identifier; appears in results JSON and must not be renamed casually. */
  id: string;
  /** What behaviour this case pins down, in one line. */
  description: string;
  /** File name the source is written under — drives language detection. */
  file: string;
  /** Starting file content. */
  source: string;
  /** The edit to route. */
  edit: CaseEdit;
  /**
   * Expected file content after a successful edit. Omit when the case is
   * expected to be refused.
   */
  expected?: string;
  /**
   * When set, the case asserts a *refusal*: `routeEdit` must report failure and
   * the file must be byte-identical to `source`. The string is a note about why
   * refusing is the right answer, recorded in the results.
   */
  expectRefusal?: string;
  /**
   * `oldHash` for hash-tier cases cannot be written by hand — it is the SHA-256
   * of a range of the source. When set, the runner computes the hash of this
   * line range (1-indexed, inclusive) and injects it as `edit.oldHash`.
   */
  hashRange?: { start: number; end: number };
  /**
   * Second edit applied to the *result* of the first, anchored only on what the
   * first edit returned (`newHash` + `newRange`) — no re-read of the file. This
   * is the hash tier's central claim: an agent editing the same region twice
   * should not have to pull the file back into context. Chaining used to be
   * impossible because `newHash` was the whole-file hash (#101). `expected` is
   * asserted after the chained edit.
   */
  chain?: { newContent: string };
  /** Free-form tags for slicing the report (e.g. "grouped-import", "unicode"). */
  tags?: string[];
  /**
   * Set when the case is a known-failing regression guard for an open issue.
   * The case still runs and still counts; this only annotates the report so a
   * red line is attributable rather than mysterious.
   */
  knownIssue?: number;
}

/** Per-case outcome, one of five mutually exclusive classifications. */
export type Outcome =
  | "correct"
  | "silent-corruption"
  | "false-refusal"
  | "correct-refusal"
  | "harness-error";

export interface CaseResult {
  id: string;
  description: string;
  language: string;
  route: string;
  outcome: Outcome;
  /** True when the post-edit file failed to parse. Only meaningful for AST languages. */
  unparseable: boolean;
  elapsed_ms: number;
  /** Populated for every non-`correct` outcome, so a red line explains itself. */
  detail?: string;
  knownIssue?: number;
  tags?: string[];
}

export interface BenchReport {
  harnessVersion: string;
  hashpilotVersion: string;
  commit: string;
  generatedAt: string;
  totals: {
    cases: number;
    correct: number;
    silentCorruption: number;
    falseRefusal: number;
    correctRefusal: number;
    harnessError: number;
    /** correct / (cases - correctRefusal). Refusals we asked for are not failures. */
    correctnessRate: number;
    /** silentCorruption / cases. The metric competitors do not publish. */
    silentCorruptionRate: number;
    totalElapsedMs: number;
  };
  byRoute: Record<string, { cases: number; correct: number; silentCorruption: number; falseRefusal: number; correctRefusal: number }>;
  byLanguage: Record<string, { cases: number; correct: number; silentCorruption: number; falseRefusal: number; correctRefusal: number }>;
  results: CaseResult[];
}
