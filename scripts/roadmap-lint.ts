#!/usr/bin/env bun
/**
 * Structural lint for ROADMAP.md.
 *
 * The roadmap is hand-edited every time an issue is filed or closed, and it has
 * already shipped two defects of exactly this shape: an issue row duplicated into
 * two sprints, and a row inserted out of score order. Both are mechanical and both
 * are cheap to detect, so they are detected here instead of in review.
 *
 *   bun run scripts/roadmap-lint.ts            # lint ROADMAP.md
 *   bun run scripts/roadmap-lint.ts <file>...  # lint specific files
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface LintIssue {
  line: number;
  rule: string;
  message: string;
}

export interface Row {
  line: number;
  issue: number;
  item: string;
  score: number;
  priority: string;
  table: string;
}

const PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
/** Accepted spellings of the priority column header, lowercased. */
const PRIORITY_HEADERS = new Set(["pri", "priority"]);
/** `| [#12](../../issues/12) | …` — display number and link target must agree. */
const ISSUE_CELL = /^\[#(\d+)\]\((?:\.\.\/)*(?:\.\.\/)?issues\/(\d+)\)$/;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const isDivider = (line: string) => /^\|[\s:|-]+\|$/.test(line.trim());
const isRow = (line: string) => line.trim().startsWith("|");

/**
 * Parses every scored issue table. A table qualifies when its header carries both
 * a `#` column and a `Score` column, which excludes prose tables like the
 * "Existing work already in the repo" listing.
 */
export function parseTables(text: string): { rows: Row[]; issues: LintIssue[] } {
  const lines = text.split("\n");
  const rows: Row[] = [];
  const issues: LintIssue[] = [];
  let table: string | null = null;
  let heading = "(top of file)";
  let columns: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("#")) {
      heading = line.replace(/^#+\s*/, "").trim();
      table = null;
      continue;
    }
    if (!isRow(line)) {
      table = null;
      continue;
    }
    if (isDivider(line)) continue;

    const c = cells(line);
    // Header row: opens a table if it is a scored issue table.
    if (c[0] === "#" && isDivider(lines[i + 1] ?? "")) {
      const scored = c.some((h) => h.toLowerCase() === "score");
      table = scored ? heading : null;
      columns = c;
      // Every per-row rule below is keyed off a header name, so a renamed or
      // dropped header turns its rule into a silent no-op — the table still
      // lints clean while nothing about it is actually checked. Require the
      // headers the rules depend on.
      if (scored && !columns.some((h) => PRIORITY_HEADERS.has(h.toLowerCase()))) {
        issues.push({
          line: i + 1,
          rule: "missing-column",
          message: `scored table '${heading}' has no priority column (expected one of: ${[...PRIORITY_HEADERS].join(", ")}) — priority validation would be skipped`,
        });
      }
      continue;
    }
    if (table === null) continue;

    const link = ISSUE_CELL.exec(c[0] ?? "");
    if (!link) {
      issues.push({
        line: i + 1,
        rule: "issue-link",
        message: `first cell is not an issue link: ${c[0]}`,
      });
      continue;
    }
    if (link[1] !== link[2]) {
      issues.push({
        line: i + 1,
        rule: "issue-link",
        message: `link text #${link[1]} points at issue ${link[2]}`,
      });
    }
    if (c.length !== columns.length) {
      issues.push({
        line: i + 1,
        rule: "column-count",
        message: `row has ${c.length} cells, header has ${columns.length}`,
      });
    }

    const scoreIdx = columns.findIndex((h) => h.toLowerCase() === "score");
    const priIdx = columns.findIndex((h) => PRIORITY_HEADERS.has(h.toLowerCase()));
    const raw = c[scoreIdx] ?? "";
    const score = Number(raw);
    if (!/^\d+$/.test(raw)) {
      issues.push({ line: i + 1, rule: "score", message: `score is not an integer: ${raw}` });
    }
    const priority = c[priIdx] ?? "";
    if (priIdx !== -1 && !PRIORITIES.has(priority)) {
      issues.push({ line: i + 1, rule: "priority", message: `unknown priority: ${priority}` });
    }

    rows.push({
      line: i + 1,
      issue: Number(link[1]),
      item: c[1] ?? "",
      score: Number.isNaN(score) ? -1 : score,
      priority,
      table,
    });
  }
  return { rows, issues };
}

export function lintRoadmap(text: string): LintIssue[] {
  const { rows, issues } = parseTables(text);

  // An issue belongs to exactly one table. A duplicate means a row was copied
  // during a re-prioritization and the original never removed.
  const seen = new Map<number, Row>();
  for (const row of rows) {
    const prior = seen.get(row.issue);
    if (prior) {
      issues.push({
        line: row.line,
        rule: "duplicate-issue",
        message: `#${row.issue} already listed at line ${prior.line} (${prior.table})`,
      });
      continue;
    }
    seen.set(row.issue, row);
  }

  // Score orders work within a table, so a table that is not descending is
  // telling a reader the wrong thing about what to pick up next.
  const byTable = new Map<string, Row[]>();
  for (const row of rows) {
    if (!byTable.has(row.table)) byTable.set(row.table, []);
    byTable.get(row.table)!.push(row);
  }
  for (const [table, group] of byTable) {
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1]!;
      const curr = group[i]!;
      if (curr.score > prev.score) {
        issues.push({
          line: curr.line,
          rule: "score-order",
          message: `${table}: #${curr.issue} (${curr.score}) is listed after #${prev.issue} (${prev.score}) — tables sort by descending score`,
        });
      }
    }
  }

  return issues.sort((a, b) => a.line - b.line);
}

if (import.meta.main) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const targets = files.length ? files : [join(import.meta.dir, "..", "ROADMAP.md")];
  let failed = false;
  for (const file of targets) {
    const found = lintRoadmap(readFileSync(file, "utf8"));
    for (const issue of found) {
      failed = true;
      console.error(`${file}:${issue.line}  [${issue.rule}] ${issue.message}`);
    }
    if (!found.length) console.log(`✓ ${file}`);
  }
  process.exit(failed ? 1 : 0);
}
