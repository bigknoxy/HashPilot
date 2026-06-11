#!/bin/bash
set -euo pipefail

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log()    { printf "${GREEN}[hashpilot]${NC} %s\n" "$1"; }
warn()   { printf "${YELLOW}[hashpilot]${NC} %s\n" "$1"; }
err()    { printf "${RED}[hashpilot]${NC} %s\n" "$1"; }
detail() { printf "${DIM}  →${NC} %s\n" "$1"; }

TARGET_DIR="${HASHPILOT_DIR:-${HOME}/.agentic-tools}"
KEEP_CONFIG=false
FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-config) KEEP_CONFIG=true; shift ;;
    --force|-f) FORCE=true; shift ;;
    --help|-h)
      echo "HashPilot Uninstaller"
      echo "Usage: $0 [options]"
      echo "  --keep-config   Preserve config and telemetry data"
      echo "  --force, -f     Skip confirmation prompt (auto-detected when piped)"
      echo "  --help, -h      Show this help"
      echo ""
      echo "One-liner: curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/uninstall.sh | sh -s -- -f"
      exit 0
      ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

echo "${BOLD}HashPilot Uninstaller${NC}"
echo ""

# ── Confirmation ─────────────────────────────────────────────────────────
if [[ "$FORCE" != "true" ]]; then
  # When piped (no TTY), skip prompt — auto-force
  if ! [[ -t 0 ]]; then
    FORCE=true
  else
    echo "This will remove HashPilot and all its components."
    echo "  Target: $TARGET_DIR"
    echo "  Keep config: $KEEP_CONFIG"
    echo ""
    echo -n "Continue? [y/N] "
    read -r CONFIRM
    if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
      log "Uninstall cancelled."
      exit 0
    fi
  fi
fi

REMOVED=0
SKIPPED=0

remove_file() {
  local path="$1"
  local label="$2"
  # Expand ~ if present
  path="${path/#\~/${HOME}}"
  if [[ -f "$path" ]]; then
    rm -f "$path"
    detail "Removed ${label}: ${path}"
    REMOVED=$((REMOVED+1))
  elif [[ -d "$path" ]]; then
    rm -rf "$path"
    detail "Removed ${label}: ${path}"
    REMOVED=$((REMOVED+1))
  else
    detail "Already removed: ${path}"
    SKIPPED=$((SKIPPED+1))
  fi
}

# ── Read manifest if available ───────────────────────────────────────────
MANIFEST="$TARGET_DIR/manifest.json"
if [[ -f "$MANIFEST" ]]; then
  log "Reading manifest..."
else
  warn "No manifest found at $MANIFEST — will attempt best-effort cleanup"
fi

# ── Claude integration ───────────────────────────────────────────────────
log "Removing Claude integration..."
CLAUDE_FILE="${HOME}/.claude/CLAUDE.md"
CLAUDE_MARKER_START="HashPilot Claude"
if [[ -f "$CLAUDE_FILE" ]]; then
  # Remove the HashPilot section: from marker to the next ## or end
  if grep -q "$CLAUDE_MARKER_START" "$CLAUDE_FILE" 2>/dev/null; then
    # Use sed to remove from HashPilot heading to end (or next heading)
    if grep -q "^## " "$CLAUDE_FILE" 2>/dev/null; then
      # Has multiple sections — remove just this one by matching its end
      sed -i '/^## .*HashPilot Claude/,/^## /{
        /^## .*HashPilot Claude/d
        /^## /!d
      }' "$CLAUDE_FILE"
    else
      # Single section — remove from HashPilot heading to end
      sed -i '/^## .*HashPilot Claude/,$d' "$CLAUDE_FILE"
    fi
    # Clean up trailing blank lines + deduplicate mid-file blank lines
    sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$CLAUDE_FILE" 2>/dev/null || true
    sed -i '/^$/{ N; /^\n$/d }' "$CLAUDE_FILE" 2>/dev/null || true
    detail "Removed HashPilot section from $CLAUDE_FILE"
    REMOVED=$((REMOVED+1))
  else
    detail "HashPilot section not found in $CLAUDE_FILE (skipping)"
    SKIPPED=$((SKIPPED+1))
  fi
else
  detail "CLAUDE.md not found (skipping)"
  SKIPPED=$((SKIPPED+1))
fi

# ── OpenCode integration ─────────────────────────────────────────────────
log "Removing OpenCode integration..."
remove_file "${HOME}/.config/opencode/skills/hashpilot/SKILL.md" "OpenCode skill"
remove_file "${HOME}/.config/opencode/agent/hashpilot.md" "OpenCode agent"
# Remove empty skill/agent dirs
rmdir "${HOME}/.config/opencode/skills/hashpilot" 2>/dev/null || true
rmdir "${HOME}/.config/opencode/skills" 2>/dev/null || true
rmdir "${HOME}/.config/opencode/agent" 2>/dev/null || true

# ── Pi integration ───────────────────────────────────────────────────────
log "Removing Pi integration..."
remove_file "${HOME}/.pi/agent/extensions/hashpilot.ts" "Pi extension"
remove_file "${HOME}/.pi/agent/skills/hashpilot/SKILL.md" "Pi skill"
rmdir "${HOME}/.pi/agent/extensions" 2>/dev/null || true
rmdir "${HOME}/.pi/agent/skills/hashpilot" 2>/dev/null || true
rmdir "${HOME}/.pi/agent/skills" 2>/dev/null || true

# ── Core, bin, telemetry ─────────────────────────────────────────────────
log "Removing Core files..."
remove_file "$TARGET_DIR/bin/structured-edit" "CLI launcher"
rmdir "$TARGET_DIR/bin" 2>/dev/null || true

if [[ "$KEEP_CONFIG" == "true" ]]; then
  detail "Preserving telemetry (--keep-config)"
  # Remove core but keep logs
  remove_file "$TARGET_DIR/structured-editing" "Core source"
  # Preserve logs
  detail "Preserving: $TARGET_DIR/logs"
else
  remove_file "$TARGET_DIR/structured-editing" "Core source"
  remove_file "$TARGET_DIR/logs" "Telemetry logs"
fi

# ── Config ───────────────────────────────────────────────────────────────
if [[ "$KEEP_CONFIG" == "true" ]]; then
  detail "Preserving config (--keep-config)"
else
  remove_file "${HOME}/.config/hashpilot/config.json" "Config file"
  rmdir "${HOME}/.config/hashpilot" 2>/dev/null || true
fi

# ── Remove PATH entry from shell rc ──────────────────────────────────────
log "Removing PATH entries..."
for rc in "${HOME}/.bashrc" "${HOME}/.zshrc" "${HOME}/.bash_profile" "${HOME}/.profile"; do
  if [[ -f "$rc" ]]; then
    if grep -q "# >>> hashpilot path >>>" "$rc" 2>/dev/null; then
      sed -i '/^# >>> hashpilot path >>>/,/^# <<< hashpilot path <<</d' "$rc"
      # Clean up trailing blank lines
      sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$rc" 2>/dev/null || true
      detail "Removed PATH entry from $rc"
      REMOVED=$((REMOVED+1))
    fi
  fi
done

# ── Remove manifest and target dir if empty ──────────────────────────────
remove_file "$MANIFEST" "Manifest"
rmdir "$TARGET_DIR" 2>/dev/null || true

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "${GREEN} HashPilot uninstalled${NC}\n"
printf "  Removed: %d   Skipped: %d\n" "$REMOVED" "$SKIPPED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Note: The following may remain if they existed before HashPilot:"
echo "  ~/.bashrc modifications (restored)"
echo "  ~/.claude/CLAUDE.md modifications (restored)"
echo "  ~/.pi/agent/extensions/ (if still empty)"
echo "  ~/.config/opencode/skills/hashpilot/ (if still empty)"
echo ""
echo "To complete removal, restart your shell or run:"
echo "  hash -r 2>/dev/null || exec \$SHELL"
echo ""

