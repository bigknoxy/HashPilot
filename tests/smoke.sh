#!/usr/bin/env bash
# HashPilot Core — AST Regression Smoke Test
# Verifies that AST operations work correctly across all supported languages.
# Usage: ./tests/smoke.sh

TMP=$(mktemp -d)
PASS=0
FAIL=0

ok()   { echo "  PASS: $1"; ((PASS++)); }
fail() { echo "  FAIL: $1"; ((FAIL++)); }

echo "=== HashPilot Core AST Smoke Test ==="
echo ""

# ── 1. Language detection ──────────────────────────────────────────────
echo "--- Language detection ---"

for pair in \
  "file.ts:typescript" \
  "file.tsx:tsx" \
  "file.js:javascript" \
  "file.jsx:javascript" \
  "file.py:python" \
  "file.go:go" \
  "file.rs:rust" \
  "file.java:null" \
  "file.rb:null"; do
  file="${pair%%:*}"
  expected="${pair##*:}"
  result=$(structured-edit route "$file" "rename-symbol" | python3 -c "import json,sys; print(json.load(sys.stdin).get('language') or 'null')")
  if [ "$result" = "$expected" ]; then ok "$file -> $expected"; else fail "$file -> $result (expected $expected)"; fi
done

# ── 2. capabilities command ────────────────────────────────────────────
echo ""
echo "--- Capabilities ---"

LANGS=$(structured-edit ast capabilities | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
if [ "$LANGS" = "6" ]; then ok "ast capabilities reports 6 languages"; else fail "ast capabilities reports $LANGS languages (expected 6)"; fi

# ── 3. find-symbols per language ───────────────────────────────────────
echo ""
echo "--- find-symbols ---"

# TypeScript
echo 'function greet() {}' > "$TMP/test.ts"
if structured-edit ast find-symbols "$TMP/test.ts" | python3 -c "import json,sys; d=json.load(sys.stdin); assert any(s['name']=='greet' for s in d), 'greet not found'"; then
  ok "TypeScript find-symbols"
else fail "TypeScript find-symbols"; fi

# JavaScript
echo 'function greet() {}' > "$TMP/test.js"
if structured-edit ast find-symbols "$TMP/test.js" | python3 -c "import json,sys; d=json.load(sys.stdin); assert any(s['name']=='greet' for s in d)"; then
  ok "JavaScript find-symbols"
else fail "JavaScript find-symbols"; fi

# Python
echo -e 'def greet():\n    pass' > "$TMP/test.py"
if structured-edit ast find-symbols "$TMP/test.py" | python3 -c "import json,sys; d=json.load(sys.stdin); assert any(s['name']=='greet' for s in d)"; then
  ok "Python find-symbols"
else fail "Python find-symbols"; fi

# Go
echo -e 'package main\nfunc greet() {}' > "$TMP/test.go"
if structured-edit ast find-symbols "$TMP/test.go" | python3 -c "import json,sys; d=json.load(sys.stdin); assert any(s['name']=='greet' for s in d)"; then
  ok "Go find-symbols"
else fail "Go find-symbols"; fi

# Rust
echo -e 'fn greet() {}' > "$TMP/test.rs"
if structured-edit ast find-symbols "$TMP/test.rs" | python3 -c "import json,sys; d=json.load(sys.stdin); assert any(s['name']=='greet' for s in d)"; then
  ok "Rust find-symbols"
else fail "Rust find-symbols"; fi

# ── 4. rename-symbol per language ──────────────────────────────────────
echo ""
echo "--- rename-symbol ---"

echo 'function greet() { return greet(); }' > "$TMP/test.js"
if structured-edit ast rename-symbol "$TMP/test.js" greet sayHello --dry-run | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['success'] and d['changes'] >= 2"; then
  ok "JavaScript rename-symbol"
else fail "JavaScript rename-symbol"; fi

echo -e 'def greet():\n    return greet()' > "$TMP/test.py"
if structured-edit ast rename-symbol "$TMP/test.py" greet sayHello --dry-run | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['success'] and d['changes'] >= 1"; then
  ok "Python rename-symbol"
else fail "Python rename-symbol"; fi

echo -e 'package main\nfunc greet() string { return "hi" }' > "$TMP/test.go"
if structured-edit ast rename-symbol "$TMP/test.go" greet sayHello --dry-run | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['success'] and d['changes'] >= 1"; then
  ok "Go rename-symbol"
else fail "Go rename-symbol"; fi

echo -e 'fn greet() -> &str { "hi" }' > "$TMP/test.rs"
if structured-edit ast rename-symbol "$TMP/test.rs" greet sayHello --dry-run | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['success'] and d['changes'] >= 1"; then
  ok "Rust rename-symbol"
else fail "Rust rename-symbol"; fi

# ── 5. Go add-import placement ─────────────────────────────────────────
echo ""
echo "--- Go add-import ---"

echo -e 'package main\n\nfunc main() {}' > "$TMP/go_noimport.go"
RESULT=$(structured-edit ast add-import "$TMP/go_noimport.go" "fmt" --dry-run 2>&1)
POS=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('newSource','').find('import'))")
if [ "$POS" -gt 0 ]; then ok "Go add-import places after package clause (index=$POS)"; else fail "Go add-import at position $POS"; fi

# ── 6. Python from-import ──────────────────────────────────────────────
echo ""
echo "--- Python add-import ---"

echo -e 'import os\n\ndef f(): pass' > "$TMP/test_py.py"
if structured-edit ast add-import "$TMP/test_py.py" "from sys import argv" --dry-run | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['success'] and 'from sys' in d.get('newSource','')"; then
  ok "Python from-import"
else fail "Python from-import"; fi
if structured-edit ast add-import "$TMP/test_py.py" "json" --dry-run | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['success'] and 'import json' in d.get('newSource','')"; then
  ok "Python simple import"
else fail "Python simple import"; fi

# ── 7. Rust remove-import ──────────────────────────────────────────────
echo ""
echo "--- Rust remove-import ---"

echo -e 'use std::collections::HashMap;\n\nfn main() {}' > "$TMP/test_rs.rs"
if structured-edit ast remove-import "$TMP/test_rs.rs" "HashMap" --dry-run | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['success']"; then
  ok "Rust remove-import (AST-aware)"
else fail "Rust remove-import"; fi
if structured-edit ast remove-import "$TMP/test_rs.rs" "NonExistent" --dry-run | python3 -c "import json,sys; d=json.load(sys.stdin); assert not d['success']"; then
  ok "Rust remove-import no-op when not found"
else fail "Rust remove-import no-op"; fi

# ── 8. Unsupported language routing ────────────────────────────────────
echo ""
echo "--- Routing ---"

if structured-edit route "file.rb" "rename-symbol" | python3 -c "import json,sys; assert json.load(sys.stdin)['route'] == 'diff'"; then
  ok "Unsupported .rb routes to diff"
else fail "Unsupported .rb routing"; fi

if structured-edit route "test.ts" "rename-symbol" | python3 -c "import json,sys; assert json.load(sys.stdin)['route'] == 'ast'"; then
  ok "Supported .ts routes to ast"
else fail "Supported .ts routing"; fi

# ── Summary ────────────────────────────────────────────────────────────
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
rm -rf "$TMP"
exit $FAIL
