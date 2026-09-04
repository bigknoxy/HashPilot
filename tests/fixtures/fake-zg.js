#!/usr/bin/env node
/**
 * Deterministic fake `zg` for HashPilot search tests.
 *
 * Emits realistic agent-markdown output without network/model/index. Mirrors the
 * real format captured in tests/fixtures/zg-real-hybrid.txt. Scenario is chosen
 * by the query text so a test can steer behavior by the words it searches for.
 *
 * Env knobs:
 *   FAKE_ZG_LOG    if set, append `argv0:<query>` per invocation (invocation counting)
 *   FAKE_ZG_EXIT   if set, exit with this code and print `FAKE ERROR` on stderr
 */
const argv = process.argv.slice(2);
const q = process.argv.slice(2).join(" ");
const target = q.split(/\s+/)[0] ?? q; // first token often holds globs; use full q for words

if (process.env.FAKE_ZG_LOG) {
  require("fs").appendFileSync(process.env.FAKE_ZG_LOG, `${argv.join(" ")}\n`);
}
if (process.env.FAKE_ZG_EXIT) {
  process.stderr.write("FAKE ERROR: simulated zg failure\n");
  process.exit(Number(process.env.FAKE_ZG_EXIT));
}

const sourceHits = [
  {
    header: "#1 matchedBy=fts+vector src/core/router.ts:108-423",
    body: [
      "status: possibly_stale",
      "symbol: function routeEdit",
      "145\tconst start = Date.now();",
    ],
  },
  {
    header: "#2 matchedBy=fts+vector src/core/hash-edit.ts:90-257",
    body: ["symbol: function replaceHash", "222\t// anchor line"],
  },
];

// A doc (README.md) ranked ABOVE source — the exact failure mode sourceGlobs
// must fix (F1). Steer with the word "docx" / "README".
const docsFirstHits = [
  {
    header: "#1 matchedBy=fts+vector README.md:5-9",
    body: ["heading: Quick Start", "6\t## Quick Start"],
  },
  {
    header: "#2 matchedBy=fts+vector src/core/config.ts:5-19",
    body: ["symbol: interface RoutePolicy", "5\tinterface RoutePolicy {"],
  },
];

const BANNER = "query groups (1):\nQ1 [primary]: " + q + "\nhits: " + (/\bREADME\b/.test(q) ? 2 : sourceHits.length) + "\n\n";
const pick = /\bREADME\b/.test(q) || /\bdocs?\b/.test(q) ? docsFirstHits : sourceHits;

const lines = [BANNER.trimStart()];
pick.forEach((h, i) => {
  lines.push(`#${i + 1} ${h.header.replace(/^#\d+\s/, "")}`);
  lines.push(...h.body);
});

process.stdout.write(lines.join("\n") + "\n");