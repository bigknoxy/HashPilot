#!/bin/bash
# HashPilot Doctor — Standalone installation health check
# Can run even when CLI is not on PATH.

HASHPILOT_VERSION="0.1.0"
# shellcheck disable=SC2034
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0
SKIP=0
RESULTS=()

pass() { PASS=$((PASS+1)); RESULTS+=("{\"name\":\"$1\",\"status\":\"pass\",\"message\":\"$2\"}"); }
fail() { FAIL=$((FAIL+1)); RESULTS+=("{\"name\":\"$1\",\"status\":\"fail\",\"message\":\"$2\"}"); }
warn() { WARN=$((WARN+1)); RESULTS+=("{\"name\":\"$1\",\"status\":\"warn\",\"message\":\"$2\"}"); }
skip() { SKIP=$((SKIP+1)); RESULTS+=("{\"name\":\"$1\",\"status\":\"skip\",\"message\":\"$2\"}"); }

TARGET_DIR="${HASHPILOT_DIR:-${HOME}/.agentic-tools}"
MANIFEST="$TARGET_DIR/manifest.json"

echo "${BOLD}HashPilot Doctor v${HASHPILOT_VERSION}${NC}"
echo ""

# 1. Core directory
if [[ -d "$TARGET_DIR/structured-editing" ]]; then
  pass "core-directory" "Found: $TARGET_DIR/structured-editing"
else
  fail "core-directory" "Missing: $TARGET_DIR/structured-editing"
fi

# 2. Core source files
if [[ -f "$TARGET_DIR/structured-editing/src/cli.ts" ]]; then
  pass "core-cli.ts" "Found: $TARGET_DIR/structured-editing/src/cli.ts"
else
  fail "core-cli.ts" "Missing: $TARGET_DIR/structured-editing/src/cli.ts"
fi

if [[ -f "$TARGET_DIR/structured-editing/package.json" ]]; then
  pass "core-package.json" "Found: $TARGET_DIR/structured-editing/package.json"
else
  fail "core-package.json" "Missing: $TARGET_DIR/structured-editing/package.json"
fi

# 3. Dependencies
if [[ -d "$TARGET_DIR/structured-editing/node_modules" ]]; then
  pass "core-dependencies" "node_modules present"
else
  fail "core-dependencies" "node_modules missing — run 'bun install' in $TARGET_DIR/structured-editing"
fi

# 4. CLI launcher
if [[ -x "$TARGET_DIR/bin/structured-edit" ]]; then
  pass "cli-launcher" "Found: $TARGET_DIR/bin/structured-edit"
else
  fail "cli-launcher" "Missing: $TARGET_DIR/bin/structured-edit"
fi

# 5. CLI on PATH
if command -v structured-edit &>/dev/null; then
  CLI_PATH=$(command -v structured-edit)
  pass "cli-on-path" "Found at: $CLI_PATH"
else
  warn "cli-on-path" "structured-edit not on PATH — add $TARGET_DIR/bin to PATH"
fi

# 6. CLI executable
if command -v structured-edit &>/dev/null; then
  VER=$(structured-edit --version 2>/dev/null || echo "error")
  if [[ "$VER" != "error" ]]; then
    pass "cli-executable" "CLI works: $VER"
  else
    fail "cli-executable" "CLI failed to run"
  fi
elif [[ -x "$TARGET_DIR/bin/structured-edit" ]]; then
  VER=$("$TARGET_DIR/bin/structured-edit" --version 2>/dev/null || echo "error")
  if [[ "$VER" != "error" ]]; then
    pass "cli-executable" "CLI works: $VER"
  else
    fail "cli-executable" "CLI failed to run (try: bun install in $TARGET_DIR/structured-editing)"
  fi
fi

# 7. Config file
if [[ -f "${HOME}/.config/hashpilot/config.json" ]]; then
    if jq -e . "${HOME}/.config/hashpilot/config.json" >/dev/null 2>&1; then
    pass "config-file" "Found valid config at ${HOME}/.config/hashpilot/config.json"
  else
    fail "config-file" "Config exists but is not valid JSON: ${HOME}/.config/hashpilot/config.json"
  fi
else
  skip "config-file" "No config file — using defaults"
fi

# 8. Claude integration
CLAUDE_FILE="${HOME}/.claude/CLAUDE.md"
CLAUDE_MARKER="HashPilot Claude"
if [[ -f "$CLAUDE_FILE" ]]; then
  if grep -q "$CLAUDE_MARKER" "$CLAUDE_FILE" 2>/dev/null; then
    pass "claude-integration" "HashPilot section found in $CLAUDE_FILE"
  else
    warn "claude-integration" "CLAUDE.md exists but HashPilot section missing"
  fi
else
  skip "claude-integration" "Claude CLAUDE.md not found"
fi

# 9. OpenCode integration
if [[ -f "${HOME}/.config/opencode/skills/hashpilot/SKILL.md" ]]; then
  pass "opencode-skill" "Found OpenCode skill"
else
  fail "opencode-skill" "Missing: ~/.config/opencode/skills/hashpilot/SKILL.md"
fi

if [[ -f "${HOME}/.config/opencode/agent/hashpilot.md" ]]; then
  pass "opencode-agent" "Found OpenCode agent"
else
  fail "opencode-agent" "Missing: ~/.config/opencode/agent/hashpilot.md"
fi

# 10. Pi integration
if [[ -f "${HOME}/.pi/agent/extensions/hashpilot.ts" ]]; then
  pass "pi-extension" "Found Pi extension"
else
  fail "pi-extension" "Missing: ~/.pi/agent/extensions/hashpilot.ts"
fi

if [[ -f "${HOME}/.pi/agent/skills/hashpilot/SKILL.md" ]]; then
  pass "pi-skill" "Found Pi skill"
else
  fail "pi-skill" "Missing: ~/.pi/agent/skills/hashpilot/SKILL.md"
fi

# 11. Telemetry writable
if mkdir -p "$TARGET_DIR/logs" 2>/dev/null; then
  TESTFILE="$TARGET_DIR/logs/.doctor-write-test-$$"
  if echo "ok" > "$TESTFILE" 2>/dev/null; then
    rm -f "$TESTFILE"
    pass "telemetry-writable" "Log dir is writable: $TARGET_DIR/logs"
  else
    fail "telemetry-writable" "Log dir not writable: $TARGET_DIR/logs"
  fi
else
  fail "telemetry-writable" "Cannot create log dir: $TARGET_DIR/logs"
fi

# 12. Manifest
if [[ -f "$MANIFEST" ]]; then
  pass "manifest" "Found: $MANIFEST"
else
  fail "manifest" "Missing: $MANIFEST (rerun install.sh)"
fi

# 13. PATH entry in shell rc
RC_CHECKED=false
for rc in "${HOME}/.bashrc" "${HOME}/.zshrc" "${HOME}/.bash_profile" "${HOME}/.profile"; do
  if [[ -f "$rc" ]] && grep -q "hashpilot path" "$rc" 2>/dev/null; then
    pass "path-entry" "PATH entry found in $rc"
    RC_CHECKED=true
    break
  fi
done
if [[ "$RC_CHECKED" != "true" ]]; then
  warn "path-entry" "No hashpilot PATH entry found in shell rc files"
fi

# ── Summary ───────────────────────────────────────────────────────────────
OVERALL_HEALTHY=true
if [[ "$FAIL" -gt 0 ]]; then
  OVERALL_HEALTHY=false
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "$OVERALL_HEALTHY" == "true" ]]; then
  echo " ${GREEN}HashPilot is HEALTHY${NC}"
else
  echo " ${RED}HashPilot has ISSUES${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "  ${GREEN}✓${NC} Pass: %d   ${RED}✗${NC} Fail: %d   ${YELLOW}!${NC} Warn: %d   ${DIM}·${NC} Skip: %d\n" "$PASS" "$FAIL" "$WARN" "$SKIP"
echo ""

# Machine-readable JSON summary on stderr (capture with 2>/dev/null to suppress)
JSON_RESULT=$(cat <<EOF
{
  "version": "${HASHPILOT_VERSION}",
  "healthy": ${OVERALL_HEALTHY},
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "summary": { "pass": ${PASS}, "fail": ${FAIL}, "warn": ${WARN}, "skip": ${SKIP} },
  "checks": [
$(IFS=,; echo "${RESULTS[*]}")
  ]
}
EOF
)
echo "$JSON_RESULT" >&2

if [[ "$OVERALL_HEALTHY" != "true" ]]; then
  exit 1
fi
exit 0
