# HashPilot benchmark harness

> `bun run bench` · results in [`results/latest.json`](results/latest.json)

This directory answers a question the README used to assert without evidence:
**when HashPilot says an edit succeeded, how often is the file actually right?**

## What it measures

Every case is a complete edit attempt — a starting file, one call to the real
`routeEdit` entry point (the same code path the CLI and the MCP server use), and
an assertion about the bytes on disk afterwards. Nothing is mocked. Outcomes are
classified into five mutually exclusive buckets:

| Outcome | Meaning |
|---------|---------|
| `correct` | The edit landed and the file matches the expected bytes exactly. |
| `correct-refusal` | The case asserts a refusal (ambiguous content, stale anchor, unparseable source) and HashPilot refused without touching the file. **This is a pass.** |
| `false-refusal` | A correct edit was available and HashPilot refused. Recoverable — the caller learns something is wrong. |
| `silent-corruption` | HashPilot reported success and the file is *not* what was asked for. **The headline metric.** |
| `harness-error` | `routeEdit` threw. Always a harness or product bug, never expected. |

The distinction between the last two is the whole point. A refusal costs a retry;
a confident wrong answer gets committed. Competitors publish apply-success rates,
which conflate the two — an edit that "applied" and quietly deleted three imports
counts as a win on that scale and as `silent-corruption` here.

Two rates are reported:

- **correctness rate** = `correct / (cases - correct-refusal)`. Refusals we
  explicitly asked for are not failures, so they are excluded from the
  denominator rather than counted as wins.
- **silent-corruption rate** = `silent-corruption / cases`. Never excluded from
  anything.

## Running it

```bash
bun run bench                 # run and print the summary
bun run bench --write         # also update results/latest.json
bun run bench --filter hash   # only cases whose id contains "hash"
```

The runner exits non-zero on **regression only**: a case that is `correct` or
`correct-refusal` in the committed `results/latest.json` and is not now. Cases
that are already red stay red without failing the build — several exist
deliberately as guards for open issues, and the harness is meant to land before
the bugs it measures are fixed. `--filter` suppresses the regression check, since
a partial run cannot tell a missing case from a regressed one.

## Adding a case

Add a `BenchCase` to `cases/ast.ts`, `cases/hash.ts`, or `cases/diff.ts`. The
shape is documented in [`types.ts`](types.ts). Two conventions matter:

- **Do not hand-write `oldHash`.** Set `hashRange: { start, end }` (1-indexed,
  inclusive) and the runner computes the anchor through `computeHash`, the same
  12-character truncation the hash tier uses. A full 64-character SHA-256 of the
  same bytes is rejected as a stale anchor.
- **Set `knownIssue` when the case guards an open bug.** It does not change the
  outcome — the case still counts against the corruption rate — it only annotates
  the report so a red line is attributable.

Case `id`s appear in the committed results and drive regression detection, so
renaming one reads as "old case deleted, new case added". Rename deliberately.

## Scope, honestly stated

This harness measures HashPilot against its own contract on small, hand-built
fixtures. It is not yet an external benchmark: it does not run Diff-XYZ
(arXiv 2510.12487) or an Aider-style edit-format eval, and it says nothing about
how HashPilot compares to Aider, Morph, or Scalpel. Those are tracked separately
in #26. What is published here is the floor: reproducible, in-repo, and
diffable over time.
