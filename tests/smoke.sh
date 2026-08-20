#!/usr/bin/env bash
# HashPilot Core — AST Regression Smoke Test
# Verifies that AST operations work correctly across all supported languages,
# through the *installed* binary rather than the test runner's imports.
# Usage: ./tests/smoke.sh   (requires `hashpilot` on PATH)

TMP=$(mktemp -d)
PASS=0
FAIL=0

ok()   { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

# Every command emits the apiVersion 1 envelope
# (`{apiVersion, ok, command, data, error, warnings}`), so the payload these
# assertions care about lives under `data`. `hp` runs a command and prints just
# that payload; `hp_check` runs a Python expression against it. Keeping the
# unwrapping in one place is what let this suite silently rot when the envelope
# landed (#130) — every call site had its own inline `json.load(sys.stdin)`.
hp() {
  hashpilot "$@" | python3 -c 'import json,sys; json.dump(json.load(sys.stdin)["data"], sys.stdout)'
}

# Assert that `hashpilot <args...>` succeeded and its payload satisfies EXPR,
# where EXPR is a Python expression over `d` (the payload).
# Usage: hp_check "<expr>" <hashpilot args...>
hp_check() {
  local expr="$1"; shift
  local out status
  out=$(hashpilot "$@")
  status=$?
  [ "$status" -eq 0 ] || return 1
  echo "$out" | python3 -c "
import json, sys
e = json.load(sys.stdin)
assert e.get('apiVersion') == '1', 'missing envelope'
assert e.get('ok') is True, e.get('error')
d = e['data']
assert ($expr), 'payload assertion failed: ' + json.dumps(d)[:400]
"
}

# Assert that `hashpilot <args...>` *failed* cleanly: non-zero exit, ok:false,
# and a populated error. A refusal that reports success is the failure mode this
# guards against.
hp_check_refusal() {
  local out status
  out=$(hashpilot "$@")
  status=$?
  [ "$status" -ne 0 ] || return 1
  echo "$out" | python3 -c "
import json, sys
e = json.load(sys.stdin)
assert e.get('ok') is False, 'refusal reported ok:true'
assert e.get('error'), 'refusal carried no error'
assert e['data'].get('success') is False, 'refusal payload reported success'
"
}

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
  result=$(hp route "$file" "rename-symbol" | python3 -c "import json,sys; print(json.load(sys.stdin).get('language') or 'null')")
  if [ "$result" = "$expected" ]; then ok "$file -> $expected"; else fail "$file -> $result (expected $expected)"; fi
done

# ── 2. capabilities command ────────────────────────────────────────────
echo ""
echo "--- Capabilities ---"

if hp_check "len(d) == 6" ast capabilities; then
  ok "ast capabilities reports 6 languages"
else fail "ast capabilities does not report 6 languages"; fi

# ── 3. find-symbols per language ───────────────────────────────────────
echo ""
echo "--- find-symbols ---"

FOUND_GREET="any(s['name'] == 'greet' for s in d['symbols'])"

echo 'function greet() {}' > "$TMP/test.ts"
if hp_check "$FOUND_GREET" ast find-symbols "$TMP/test.ts"; then ok "TypeScript find-symbols"; else fail "TypeScript find-symbols"; fi

echo 'function greet() {}' > "$TMP/test.js"
if hp_check "$FOUND_GREET" ast find-symbols "$TMP/test.js"; then ok "JavaScript find-symbols"; else fail "JavaScript find-symbols"; fi

printf 'def greet():\n    pass\n' > "$TMP/test.py"
if hp_check "$FOUND_GREET" ast find-symbols "$TMP/test.py"; then ok "Python find-symbols"; else fail "Python find-symbols"; fi

printf 'package main\n\nfunc greet() {}\n' > "$TMP/test.go"
if hp_check "$FOUND_GREET" ast find-symbols "$TMP/test.go"; then ok "Go find-symbols"; else fail "Go find-symbols"; fi

printf 'fn greet() {}\n' > "$TMP/test.rs"
if hp_check "$FOUND_GREET" ast find-symbols "$TMP/test.rs"; then ok "Rust find-symbols"; else fail "Rust find-symbols"; fi

# ── 4. rename-symbol per language ──────────────────────────────────────
echo ""
echo "--- rename-symbol ---"

echo 'function greet() { return greet(); }' > "$TMP/test.js"
if hp_check "d['success'] and d['changes'] >= 2" ast rename-symbol "$TMP/test.js" greet sayHello --dry-run; then
  ok "JavaScript rename-symbol"
else fail "JavaScript rename-symbol"; fi

printf 'def greet():\n    return greet()\n' > "$TMP/test.py"
if hp_check "d['success'] and d['changes'] >= 1" ast rename-symbol "$TMP/test.py" greet sayHello --dry-run; then
  ok "Python rename-symbol"
else fail "Python rename-symbol"; fi

printf 'package main\n\nfunc greet() string { return "hi" }\n' > "$TMP/test.go"
if hp_check "d['success'] and d['changes'] >= 1" ast rename-symbol "$TMP/test.go" greet sayHello --dry-run; then
  ok "Go rename-symbol"
else fail "Go rename-symbol"; fi

printf 'fn greet() -> &str { "hi" }\n' > "$TMP/test.rs"
if hp_check "d['success'] and d['changes'] >= 1" ast rename-symbol "$TMP/test.rs" greet sayHello --dry-run; then
  ok "Rust rename-symbol"
else fail "Rust rename-symbol"; fi

# ── 5. Go add-import placement ─────────────────────────────────────────
# A dry run returns a diff unless `--include-source` is passed, so the checks
# that inspect the whole post-edit file must ask for it.
echo ""
echo "--- Go add-import ---"

printf 'package main\n\nfunc main() {}\n' > "$TMP/go_noimport.go"
if hp_check "d['newSource'].find('import') > 0" ast add-import "$TMP/go_noimport.go" "fmt" --dry-run --include-source; then
  ok "Go add-import places after package clause"
else fail "Go add-import placement"; fi

# ── 6. Python from-import ──────────────────────────────────────────────
echo ""
echo "--- Python add-import ---"

printf 'import os\n\ndef f(): pass\n' > "$TMP/test_py.py"
if hp_check "d['success'] and 'from sys' in d['newSource']" ast add-import "$TMP/test_py.py" "from sys import argv" --dry-run --include-source; then
  ok "Python from-import"
else fail "Python from-import"; fi
if hp_check "d['success'] and 'import json' in d['newSource']" ast add-import "$TMP/test_py.py" "json" --dry-run --include-source; then
  ok "Python simple import"
else fail "Python simple import"; fi

# ── 7. Rust remove-import ──────────────────────────────────────────────
echo ""
echo "--- Rust remove-import ---"

printf 'use std::collections::HashMap;\n\nfn main() {}\n' > "$TMP/test_rs.rs"
if hp_check "d['success']" ast remove-import "$TMP/test_rs.rs" "HashMap" --dry-run; then
  ok "Rust remove-import (AST-aware)"
else fail "Rust remove-import"; fi
if hp_check_refusal ast remove-import "$TMP/test_rs.rs" "NonExistent" --dry-run; then
  ok "Rust remove-import refuses cleanly when not found"
else fail "Rust remove-import no-op"; fi

# ── 8. Unsupported language routing ────────────────────────────────────
echo ""
echo "--- Routing ---"

if hp_check "d['route'] == 'diff'" route "file.rb" "rename-symbol"; then
  ok "Unsupported .rb routes to diff"
else fail "Unsupported .rb routing"; fi

if hp_check "d['route'] == 'ast'" route "test.ts" "rename-symbol"; then
  ok "Supported .ts routes to ast"
else fail "Supported .ts routing"; fi

# ── Summary ────────────────────────────────────────────────────────────
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
rm -rf "$TMP"
# Cap the exit code: a shell exit status is one byte, so a large failure count
# could otherwise wrap to 0 and report a red run as green.
[ "$FAIL" -eq 0 ] || exit 1
