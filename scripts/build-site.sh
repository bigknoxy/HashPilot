#!/usr/bin/env bash
# Build the GitHub Pages site into site/.
#
# The Pages workflow used to publish the repository root, which served internal
# planning documents (M5_PLAN.md, M6_AUTOPLAN_REVIEW.md, AUDIT-2026-08.md),
# workflow files, and the whole source tree under the docs domain (#49). The
# site is now an explicit allowlist: anything not named here is not published.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/site"

rm -rf "$OUT"
mkdir -p "$OUT/docs"

cp "$ROOT/index.html" "$OUT/index.html"
cp "$ROOT/README.md" "$OUT/README.md"
cp "$ROOT/LICENSE" "$OUT/LICENSE"

# Docs the landing page links to, or that are written for public consumption.
PUBLIC_DOCS=(
  ADAPTER-CONTRACT.md
  ARCHITECTURE.md
  CLI-QUICKREF.md
  COMPETITIVE-ANALYSIS.md
  INSTALL.md
  INTEGRATION-CLAUDE.md
  INTEGRATION-MCP.md
  INTEGRATION-OPENCODE.md
  INTEGRATION-PI.md
)
for doc in "${PUBLIC_DOCS[@]}"; do
  cp "$ROOT/docs/$doc" "$OUT/docs/$doc"
done

# Jekyll would otherwise skip files and directories beginning with an underscore.
touch "$OUT/.nojekyll"

echo "Built site/ with $(find "$OUT" -type f | wc -l | tr -d ' ') files"
