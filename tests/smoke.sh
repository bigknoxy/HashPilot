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

# ── 0. Install script version banner (#157 / B58) ──────────────────────
# Local-clone mode: `bash scripts/install.sh --help` resolves SOURCE_DIR to
# the repo root and prints the version before any actual install work runs,
# so this is a fast, non-destructive way to check that the printed version
# matches package.json's "version" field. Remote (curl-pipe) mode reads the
# same $HASHPILOT_VERSION variable from the same $SOURCE_DIR/package.json
# lookup once SOURCE_DIR is set to the downloaded tarball dir — see
# scripts/install.sh — so it isn't re-verified here with a live GitHub
# release; this local-clone assertion plus that code-level guarantee is the
# intended coverage per issue #157.
echo "--- Install script version banner ---"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$REPO_ROOT/package.json" | head -1)
INSTALL_HELP_OUTPUT=$(bash "$REPO_ROOT/scripts/install.sh" --help 2>&1)

if [ -n "$PKG_VERSION" ] && echo "$INSTALL_HELP_OUTPUT" | grep -qF "HashPilot Installer v${PKG_VERSION}"; then
  ok "install.sh prints package.json version ($PKG_VERSION) in local-clone mode"
else
  fail "install.sh version banner (expected v${PKG_VERSION}, got: $(echo "$INSTALL_HELP_OUTPUT" | grep 'HashPilot Installer' || echo 'no match'))"
fi

# ── 0a2. Standalone doctor.sh version banner (#156 sibling gap) ─────────
# scripts/doctor.sh had a hardcoded stale "0.1.0" literal until #156 was
# fixed alongside the MCP server's own version bug; nothing previously
# asserted this script prints the real version either.
echo "--- doctor.sh version banner ---"
DOCTOR_OUTPUT=$(bash "$REPO_ROOT/scripts/doctor.sh" 2>&1 || true)

if [ -n "$PKG_VERSION" ] && echo "$DOCTOR_OUTPUT" | grep -qF "HashPilot Doctor v${PKG_VERSION}"; then
  ok "doctor.sh prints package.json version ($PKG_VERSION)"
else
  fail "doctor.sh version banner (expected v${PKG_VERSION}, got: $(echo "$DOCTOR_OUTPUT" | grep 'HashPilot Doctor' || echo 'no match'))"
fi

# ── 0b. Lockfile is not stale (regression guard) ────────────────────────
# bun.lock drifted out of sync with package.json after a Dependabot bump
# landed without a lockfile regen, which silently broke every fresh
# install/upgrade: install.sh's `bun install --frozen-lockfile` failed, but
# the failure was swallowed by a bare pipe (no `set -o pipefail`), so the
# script printed "Dependencies installed" and only surfaced the problem
# later, vaguely, at the verification step. Found by manually dogfooding
# `hashpilot upgrade` on a live box — not caught by any existing CI check,
# since .github/workflows/ci.yml's bun install step also had `|| true`.
# Both were fixed alongside this test; this check exists so drift is caught
# here, fast and locally, instead of only in a real user's install.
echo "--- Lockfile is in sync with package.json ---"

if (cd "$REPO_ROOT" && bun install --frozen-lockfile >/tmp/hashpilot-smoke-lockfile-check.log 2>&1); then
  ok "bun.lock is in sync with package.json (--frozen-lockfile succeeds)"
else
  fail "bun.lock is stale — run 'bun install' and commit the regenerated bun.lock: $(tail -3 /tmp/hashpilot-smoke-lockfile-check.log | tr '\n' ' ')"
fi

# ── 0c. install.sh remote-mode source routing (npm-primary, git fallback) ──
# install.sh used to always clone the full git source tree (tests, docs, all
# devDependencies) even though a much smaller, tested npm package has been
# publishable since #147/#96 landed — two distribution paths that could
# silently drift from each other, and a heavier install than necessary.
# It now prefers the published npm tarball, falling back to the GitHub
# source tarball when npm is unreachable or an explicit non-default channel
# is requested. Each scenario below runs install.sh piped via stdin (`bash
# -s --`) rather than by file path, so `$0` isn't a real path and the
# local-clone detection at the top of the script can't short-circuit these
# into testing nothing — the same mistake made once already while verifying
# this manually.
echo "--- install.sh source routing ---"

INSTALL_SCRIPT_SRC="$(cat "$REPO_ROOT/scripts/install.sh")"

# 1. Default channel, real npm registry: must take the npm path and must not
#    pull devDependencies (the whole point of preferring npm).
SCRATCH1=$(mktemp -d)
NPM_LOG=$(echo "$INSTALL_SCRIPT_SRC" | HOME="$SCRATCH1" bash -s -- --target "$SCRATCH1/.agentic-tools" --force 2>&1)
if echo "$NPM_LOG" | grep -q "Downloading HashPilot v.* from npm"; then
  ok "install.sh prefers the npm tarball on the default channel"
else
  fail "install.sh did not use the npm path by default: $(echo "$NPM_LOG" | head -3 | tr '\n' ' ')"
fi
if echo "$NPM_LOG" | grep -q "semantic-release@"; then
  fail "npm-path install pulled devDependencies (semantic-release) — --production is not being applied"
else
  ok "npm-path install correctly skips devDependencies"
fi
rm -rf "$SCRATCH1"

# 2. npm registry unreachable: must warn and fall back to the real GitHub
#    release tarball, not just fail outright.
SCRATCH2=$(mktemp -d)
FALLBACK_LOG=$(echo "$INSTALL_SCRIPT_SRC" | HASHPILOT_NPM_REGISTRY="https://invalid-registry.example.invalid" HOME="$SCRATCH2" bash -s -- --target "$SCRATCH2/.agentic-tools" --force 2>&1)
if echo "$FALLBACK_LOG" | grep -q "falling back to GitHub source" && echo "$FALLBACK_LOG" | grep -q "Downloading HashPilot .* from GitHub"; then
  ok "install.sh falls back to GitHub source when the npm registry is unreachable"
else
  fail "install.sh did not fall back correctly when npm was unreachable: $(echo "$FALLBACK_LOG" | head -5 | tr '\n' ' ')"
fi
rm -rf "$SCRATCH2"

# 3. Explicit non-default channel: must skip npm entirely and go straight to
#    that branch's GitHub tarball (proven here by a deliberately-nonexistent
#    branch — the assertion is about ROUTING, not that the branch exists;
#    the script correctly fails loudly on the 404 either way, which is the
#    desired behavior, not a silent no-op).
SCRATCH3=$(mktemp -d)
CHANNEL_LOG=$(echo "$INSTALL_SCRIPT_SRC" | HASHPILOT_SOURCE_CHANNEL="hashpilot-smoke-test-nonexistent-branch" HOME="$SCRATCH3" bash -s -- --target "$SCRATCH3/.agentic-tools" --force 2>&1 || true)
if echo "$CHANNEL_LOG" | grep -q "Fetching latest release info from npm"; then
  fail "install.sh queried npm despite an explicit non-default HASHPILOT_SOURCE_CHANNEL"
elif echo "$CHANNEL_LOG" | grep -q "Downloading HashPilot from branch hashpilot-smoke-test-nonexistent-branch"; then
  ok "install.sh skips npm and targets the exact requested branch when a channel is explicitly set"
else
  fail "install.sh did not route to the explicit channel: $(echo "$CHANNEL_LOG" | head -3 | tr '\n' ' ')"
fi
rm -rf "$SCRATCH3"

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
