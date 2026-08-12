/**
 * prompt-eval.test.ts — GEPA-style evaluation harness for HashPilot agent prompts.
 *
 * Tests prompt variants against a rubric of correctness, completeness, concision,
 * tool-choice guidance, multi-step follow-through, and robustness.
 *
 * To test a new prompt variant, add it to the PROMPT_VARIANTS array and run:
 *   bun test tests/prompt-eval.test.ts
 *
 * Scoring:
 *   - Each variant gets a score 0-100 per dimension
 *   - Composite score = weighted average across dimensions
 *   - Weights: correctness 30%, completeness 20%, concision 10%,
 *     tool-choice 20%, multi-step 10%, robustness 10%
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";

// ─── Task Scenarios ─────────────────────────────────────────────────────

interface TaskScenario {
  name: string;
  description: string;
  userRequest: string;
  expectedRoute: "ast" | "hash" | "diff" | null; // null = depends
  expectedFirstTool: string;
  expectedWorkflowSteps: string[];
  mustNotDo: string[];
  priority: "critical" | "high" | "medium" | "low";
}

const TASKS: TaskScenario[] = [
  {
    name: "rename-ts-function",
    description: "Rename a function in TypeScript",
    userRequest: "Rename the function 'calculateTotal' to 'computeTotal' in src/billing.ts",
    expectedRoute: "ast",
    expectedFirstTool: "structured-edit ast find-symbols",
    expectedWorkflowSteps: ["find-symbols", "rename-symbol", "verify-changes"],
    mustNotDo: ["replace-hash"],
    priority: "critical",
  },
  {
    name: "json-config-change",
    description: "Change a value in a JSON config",
    userRequest: "Change the port from 3000 to 4000 in config.json",
    expectedRoute: "hash",
    expectedFirstTool: "structured-edit read-many",
    expectedWorkflowSteps: ["read-many", "replace-hash", "verify-changes"],
    mustNotDo: ["ast", "guess line"],
    priority: "high",
  },
  {
    name: "batch-read-and-edit",
    description: "Read multiple files before editing",
    userRequest: "Read src/api.ts, src/utils.ts, src/config.ts then edit the timeout in config.ts",
    expectedRoute: null,
    expectedFirstTool: "structured-edit read-many",
    expectedWorkflowSteps: ["read-many", "batch"],
    mustNotDo: ["read one by one"],
    priority: "high",
  },
  {
    name: "stale-anchor-recovery",
    description: "Recover from a stale hash anchor",
    userRequest: "The replace-hash returned stale:true, what should I do?",
    expectedRoute: "hash",
    expectedFirstTool: "structured-edit read-many",
    expectedWorkflowSteps: ["re-read", "replace-hash", "verify-changes"],
    mustNotDo: ["ignore", "force", "skip"],
    priority: "critical",
  },
  {
    name: "add-import-ts",
    description: "Add an import to TypeScript",
    userRequest: "Add 'import { useState } from \"react\"' to src/components/Button.tsx",
    expectedRoute: "ast",
    expectedFirstTool: "structured-edit ast add-import",
    expectedWorkflowSteps: ["add-import", "verify-changes"],
    mustNotDo: ["replace-hash", "read-many"],
    priority: "high",
  },
  {
    name: "python-function-rename",
    description: "Rename a function in Python",
    userRequest: "Rename the function 'get_data' to 'fetch_data' in src/utils.py",
    expectedRoute: "ast",
    expectedFirstTool: "structured-edit ast find-symbols",
    expectedWorkflowSteps: ["find-symbols", "rename-symbol", "verify-changes"],
    mustNotDo: ["replace-hash"],
    priority: "high",
  },
  {
    name: "go-unknown-file",
    description: "Edit unknown file type without AST support",
    userRequest: "Change 'version: 1' to 'version: 2' in docker-compose.yml",
    expectedRoute: "diff",
    expectedFirstTool: "structured-edit read-many",
    expectedWorkflowSteps: [],
    mustNotDo: ["ast"],
    priority: "medium",
  },
];

// ─── Rubric Dimensions ─────────────────────────────────────────────────

interface DimensionScore {
  dimension: string;
  weight: number;
  score: number;
  evidence: string;
}

interface EvalResult {
  variantName: string;
  dimensions: DimensionScore[];
  composite: number;
  taskScores: Map<string, number>;
  issues: string[];
  strengths: string[];
}

const DIMENSIONS = [
  { name: "correctness", weight: 0.25, description: "Accurate tool descriptions and routing" },
  { name: "completeness", weight: 0.15, description: "Covers all relevant workflows and edge cases" },
  { name: "concision", weight: 0.10, description: "Focused, minimal, no fluff" },
  { name: "tool-choice", weight: 0.15, description: "Guides optimal tool selection (AST > hash > diff)" },
  { name: "multi-step", weight: 0.10, description: "Guides end-to-end workflows, not isolated commands" },
  { name: "robustness", weight: 0.10, description: "Handles errors, edge cases, and recovery" },
  { name: "behavioral-clarity", weight: 0.15, description: "Decision trees, anti-patterns, search-before-edit, batch ops, real examples" },
];

// ─── Scoring Helpers ────────────────────────────────────────────────────

function countOccurrences(text: string, patterns: string[]): number {
  return patterns.reduce((sum, p) => sum + (text.toLowerCase().split(p.toLowerCase()).length - 1), 0);
}

function findInText(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

function scoreCorrectness(prompt: string): DimensionScore {
  const evidence: string[] = [];
  let score = 100;

  // Check AST-first guidance for TS
  if (findInText(prompt, ["ast", "tree-sitter", "syntax-aware"])) {
    evidence.push("Mentions AST/syntax-aware editing");
  } else {
    score -= 20;
    evidence.push("Missing AST guidance for supported languages");
  }

  // Check hash-anchored guidance
  if (findInText(prompt, ["hash", "replace-hash", "read-many"])) {
    evidence.push("Mentions hash-anchored editing");
  } else {
    score -= 20;
    evidence.push("Missing hash-anchored editing guidance");
  }

  // Check route hierarchy
  if (findInText(prompt, ["ast", "hash", "diff"]) &&
      prompt.toLowerCase().includes("prefer") &&
      prompt.toLowerCase().includes("fallback")) {
    evidence.push("Clear route hierarchy (prefer AST, fallback to hash/diff)");
  } else if (findInText(prompt, ["ast", "hash", "diff"])) {
    evidence.push("Mentions AST/hash/diff but may lack hierarchy guidance");
  } else {
    score -= 15;
    evidence.push("Missing route hierarchy");
  }

  // Check read-before-edit
  if (findInText(prompt, ["read", "hash", "anchor", "re-read"])) {
    evidence.push("Read-before-edit pattern present");
  } else {
    score -= 10;
    evidence.push("Missing read-before-edit guidance");
  }

  if (score < 0) score = 0;
  return { dimension: "correctness", weight: 0.30, score, evidence: evidence.join("; ") };
}

function scoreCompleteness(prompt: string): DimensionScore {
  const evidence: string[] = [];
  let score = 100;
  const checks = [
    { pattern: ["ast", "find-symbols", "rename-symbol", "replace-body", "add-import"], label: "AST operations", penalty: 15 },
    { pattern: ["read-many", "read-hash", "replace-hash"], label: "Hash operations", penalty: 15 },
    { pattern: ["verify-changes", "verify", "test", "lint", "format"], label: "Verification step", penalty: 15 },
    { pattern: ["stale", "re-read", "retry"], label: "Stale anchor recovery", penalty: 15 },
    { pattern: ["symbol not found", "not found", "error"], label: "Symbol-not-found handling", penalty: 10 },
    { pattern: ["batch", "parallel", "multi"], label: "Batch/parallel operations", penalty: 10 },
    { pattern: ["route", "telemetry", "status"], label: "Utility commands", penalty: 10 },
  ];

  for (const check of checks) {
    if (findInText(prompt, check.pattern)) {
      evidence.push(check.label);
    } else {
      score -= check.penalty;
      evidence.push(`Missing: ${check.label}`);
    }
  }

  if (score < 0) score = 0;
  return { dimension: "completeness", weight: 0.20, score, evidence: evidence.join("; ") };
}

function scoreConcision(prompt: string): DimensionScore {
  const evidence: string[] = [];
  let score = 100;

  const lines = prompt.split("\n").filter((l) => l.trim()).length;
  const words = prompt.split(/\s+/).length;

  // Optimal: 30-80 lines, 200-600 words
  if (lines > 100) {
    score -= 15;
    evidence.push(`Long: ${lines} lines`);
  } else if (lines > 80) {
    score -= 10;
    evidence.push(`Somewhat long: ${lines} lines`);
  } else if (lines < 20) {
    score -= 15;
    evidence.push(`Too short: ${lines} lines, may lack detail`);
  } else {
    evidence.push(`Good length: ${lines} lines`);
  }

  if (words > 800) {
    score -= 10;
    evidence.push(`Verbose: ${words} words`);
  } else if (words < 150) {
    score -= 10;
    evidence.push(`Too brief: ${words} words`);
  } else {
    evidence.push(`Good word count: ${words} words`);
  }

  // Penalize redundant phrases
  const redundancy = countOccurrences(prompt, [
    "please", "note that", "important:", "remember to", "make sure to",
    "you should", "you need to", "it is important",
  ]);
  if (redundancy > 3) {
    score -= redundancy * 3;
    evidence.push(`Redundant phrases found: ${redundancy}`);
  }

  if (score < 0) score = 0;
  return { dimension: "concision", weight: 0.10, score, evidence: evidence.join("; ") };
}

function scoreToolChoice(prompt: string): DimensionScore {
  const evidence: string[] = [];
  let score = 100;

  const lower = prompt.toLowerCase();

  // Check if AST is prioritized for TypeScript/TSX (flexible phrasing)
  const hasASTPriority = findInText(prompt, [
    "prefer ast", "ast for typescript", "ast route", "ast — symbol",
    "ast edits for typescript", "ast first", "route hierarchy",
    "1. ast", "ast (symbol ops", "ast edits for .ts", "use ast",
    "for symbol ops: ast", "prefer ast edits", "ast commands",
    "use `ast` commands", "use ast for",
  ]);
  if (hasASTPriority) {
    evidence.push("Prioritizes AST for TypeScript");
  } else {
    score -= 20;
    evidence.push("No AST priority guidance");
  }

  // Check if hash is recommended for non-TS files (flexible phrasing)
  const hasHashPriority = findInText(prompt, [
    "hash-anchored otherwise", "for all other files", "hash otherwise",
    "hash — replace-hash", "2. hash", "hash (replace-hash",
    "hash-anchored editing", "hash for content",
    "use `replace-hash`", "other file → hash",
    "any other file → replace", "content replace.*replace-hash",
    "replace-hash.*any file", "hash route",
  ]);
  if (findInText(prompt, ["replace-hash", "hash-anchored", "hash route", "hash otherwise"])) {
    evidence.push("Hash editing guidance present");
  } else {
    score -= 15;
    evidence.push("No hash editing guidance");
  }

  // Check if diff is mentioned as fallback
  if (findInText(prompt, ["fallback", "diff route", "diff fallback", "3. diff", "diff — search", "search+replace"])) {
    evidence.push("Diff mentioned as fallback");
  } else {
    score -= 10;
    evidence.push("No diff fallback guidance");
  }

  // Check "never guess line numbers" (flexible)
  if (findInText(prompt, ["never guess", "don't guess", "do not guess", "guess.*line", "guess.*hash"])) {
    evidence.push("Warns against guessing");
  } else {
    score -= 15;
    evidence.push("No warning against guessing");
  }

  if (score < 0) score = 0;
  return { dimension: "tool-choice", weight: 0.15, score, evidence: evidence.join("; ") };
}

function scoreMultiStep(prompt: string): DimensionScore {
  const evidence: string[] = [];
  let score = 100;

  const lower = prompt.toLowerCase();

  // Check for workflow sections (for TS files and other files)
  if (findInText(prompt, ["for typescript", "for ts", "typescript/tsx"])) {
    evidence.push("TypeScript-specific workflow");
  } else {
    score -= 20;
    evidence.push("Missing TypeScript workflow");
  }

  if (findInText(prompt, ["for all other files", "for other files", "otherwise"])) {
    evidence.push("Non-TypeScript workflow");
  } else {
    score -= 15;
    evidence.push("Missing non-TypeScript workflow");
  }

  // Check for end-to-end examples
  if (findInText(prompt, ["1.", "2.", "3.", "step", "workflow", "pattern"])) {
    evidence.push("Numbered steps or workflow patterns");
  } else {
    score -= 20;
    evidence.push("No structured workflow");
  }

  // Check for batch operation guidance
  if (findInText(prompt, ["batch", "read-many", "multi", "parallel"])) {
    evidence.push("Batch/parallel guidance present");
  } else {
    score -= 15;
    evidence.push("Missing batch operation guidance");
  }

  if (score < 0) score = 0;
  return { dimension: "multi-step", weight: 0.10, score, evidence: evidence.join("; ") };
}

function scoreRobustness(prompt: string): DimensionScore {
  const evidence: string[] = [];
  let score = 100;

  // Check error handling section
  if (findInText(prompt, ["error", "error handling", "stale", "recovery", "retry"])) {
    evidence.push("Error handling coverage");
  } else {
    score -= 25;
    evidence.push("Missing error handling");
  }

  // Check stale anchor recovery
  if (findInText(prompt, ["stale", "re-read", "retry", "fresh hash"])) {
    evidence.push("Stale anchor recovery");
  } else {
    score -= 20;
    evidence.push("Missing stale anchor recovery");
  }

  // Check symbol-not-found recovery
  if (findInText(prompt, ["symbol not found", "not found", "verify file", "find-symbols"])) {
    evidence.push("Symbol-not-found recovery");
  } else {
    score -= 15;
    evidence.push("Missing symbol-not-found recovery");
  }

  // Check verify after edits
  if (findInText(prompt, ["verify", "verify-changes", "confirm"])) {
    evidence.push("Verification step");
  } else {
    score -= 15;
    evidence.push("Missing verification step");
  }

  if (score < 0) score = 0;
  return { dimension: "robustness", weight: 0.10, score, evidence: evidence.join("; ") };
}

function scoreBehavioralClarity(prompt: string): DimensionScore {
  const evidence: string[] = [];
  let score = 100;
  const lower = prompt.toLowerCase();

  // Decision tree / question-based guidance
  if (findInText(prompt, ["decision", "question", "what am i", "route hierarchy", "if .ts", "if .py", "flow"])) {
    evidence.push("Decision/flow guidance");
  } else {
    score -= 15;
    evidence.push("Missing decision guidance");
  }

  // Anti-patterns / what NOT to do
  if (findInText(prompt, ["don't", "avoid", "never", "anti-pattern", "do not", "❌", "✗"])) {
    evidence.push("Anti-patterns present");
  } else {
    score -= 15;
    evidence.push("Missing anti-patterns");
  }

  // Search-before-edit guidance
  if (findInText(prompt, ["grep", "search before", "find references", "find all", "affected files"])) {
    evidence.push("Search-before-edit guidance");
  } else {
    score -= 15;
    evidence.push("Missing search-before-edit guidance");
  }

  // Batch/parallel ops
  if (findInText(prompt, ["batch", "multi-file", "multiple files", "read-many multi", "all files", "parallel"])) {
    evidence.push("Batch/multi-file guidance");
  } else {
    score -= 15;
    evidence.push("Missing batch/multi-file guidance");
  }

  // Real examples / patterns
  if (findInText(prompt, ["example", "pattern", "like this", "for instance", "rename a", "change a", "add import"])) {
    evidence.push("Real examples");
  } else {
    score -= 10;
    evidence.push("Missing real examples");
  }

  // Error recovery integrated into workflow (not just a separate section)
  if (findInText(prompt, ["if.*fail", "if.*error", "what if", "stale.*retry", "chart", "table"])) {
    evidence.push("Error recovery integrated");
  } else {
    score -= 10;
    evidence.push("Error recovery isolated or missing");
  }

  // When-to-use vs when-not-to-use for each tool
  if (findInText(prompt, ["when to", "when not", "use when", "don't use", "prefer", "contract"])) {
    evidence.push("When-to-use guidance");
  } else {
    score -= 10;
    evidence.push("Missing when-to-use guidance");
  }

  if (score < 0) score = 0;
  return { dimension: "behavioral-clarity", weight: 0.15, score, evidence: evidence.join("; ") };
}

// ─── Full Evaluation ────────────────────────────────────────────────────

function evaluatePrompt(variantName: string, prompt: string): EvalResult {
  const dimensions = [
    scoreCorrectness(prompt),
    scoreCompleteness(prompt),
    scoreConcision(prompt),
    scoreToolChoice(prompt),
    scoreMultiStep(prompt),
    scoreRobustness(prompt),
    scoreBehavioralClarity(prompt),
  ];

  const composite = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);

  const strengths = dimensions
    .filter((d) => d.score >= 80)
    .map((d) => `${d.dimension} (${d.score})`);

  const issues = dimensions
    .filter((d) => d.score < 70)
    .map((d) => `${d.dimension} (${d.score}): ${d.evidence}`);

  return {
    variantName,
    dimensions,
    composite: Math.round(composite * 10) / 10,
    taskScores: new Map(),
    issues,
    strengths,
  };
}

function formatResult(r: EvalResult): string {
  const lines = [
    `\x1b[1m=== ${r.variantName} ===\x1b[0m`,
    `Composite: \x1b[${r.composite >= 80 ? "32m" : r.composite >= 60 ? "33m" : "31m"}${r.composite}/100\x1b[0m`,
    "",
    "Dimensions:",
    ...r.dimensions.map(
      (d) => `  ${d.dimension.padEnd(16)} ${"■".repeat(Math.floor(d.score / 10))}${"□".repeat(10 - Math.floor(d.score / 10))} ${d.score}/100`
    ),
  ];

  if (r.strengths.length > 0) {
    lines.push("", "Strengths:");
    r.strengths.forEach((s) => lines.push(`  ✓ ${s}`));
  }

  if (r.issues.length > 0) {
    lines.push("", "Issues:");
    r.issues.forEach((s) => lines.push(`  ✗ ${s}`));
  }

  return lines.join("\n");
}

// ─── Prompt Variants ────────────────────────────────────────────────────

interface PromptVariant {
  name: string;
  description: string;
  content: string;
}

const BASELINE = readFileSync(
  existsSync("/root/code/HashPilot/templates/opencode-agent.md")
    ? "/root/code/HashPilot/templates/opencode-agent.md"
    : "/dev/null",
  "utf-8"
) || `# Placeholder baseline — file not found`;

// ─── Tests ──────────────────────────────────────────────────────────────

describe("Prompt Evaluation Harness", () => {
  test("evaluates all prompt variants and prints scores", () => {
    const variants: PromptVariant[] = [
      { name: "BASELINE (current)", description: "Current production prompt", content: BASELINE },
    ];

    // If VARIANTS_DIR env is set, load variants from that directory
    const variantsDir = process.env.PROMPT_VARIANTS_DIR;
    if (variantsDir && existsSync(variantsDir)) {
      const files = require("fs").readdirSync(variantsDir).filter((f: string) => f.endsWith(".md"));
      for (const file of files) {
        const content = readFileSync(`${variantsDir}/${file}`, "utf-8");
        variants.push({ name: file.replace(".md", ""), description: `From ${file}`, content });
      }
    }

    // Also check for specific env vars with variant contents
    for (let i = 1; i <= 3; i++) {
      const envKey = `PROMPT_VARIANT_${i}`;
      const envName = `PROMPT_VARIANT_${i}_NAME`;
      if (process.env[envKey]) {
        variants.push({
          name: process.env[envName] || `Variant ${i}`,
          description: `From environment PROMPT_VARIANT_${i}`,
          content: process.env[envKey]!,
        });
      }
    }

    const results = variants.map((v) => evaluatePrompt(v.name, v.content));

    // Sort by composite score descending
    results.sort((a, b) => b.composite - a.composite);

    console.log("\n" + "=".repeat(60));
    console.log("PROMPT EVALUATION RESULTS");
    console.log("=".repeat(60) + "\n");

    for (const r of results) {
      console.log(formatResult(r));
      console.log();
    }

    // Print summary table
    console.log("=".repeat(60));
    console.log("SUMMARY");
    console.log("=".repeat(60));
    console.log("Rank | Variant".padEnd(40) + "Score");
    console.log("-".repeat(60));
    results.forEach((r, i) => {
      console.log(`  ${i + 1}   | ${r.variantName.padEnd(35)} ${r.composite}`);
    });

    // Winner assertion
    const winner = results[0];
    console.log(`\n🏆 WINNER: ${winner.variantName} (${winner.composite}/100)`);

    expect(winner.composite).toBeGreaterThan(0);
  });
});
