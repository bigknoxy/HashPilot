#!/bin/bash
set -eu

# Read the version from package.json so the installer can never drift from the
# released version. Falls back to "unknown" rather than a stale literal.
HASHPILOT_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$(dirname "$0")/../package.json" 2>/dev/null | head -1)"
HASHPILOT_VERSION="${HASHPILOT_VERSION:-unknown}"
# shellcheck disable=SC2034
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { printf "${GREEN}[hashpilot]${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}[hashpilot]${NC} %s\n" "$1"; }
err()  { printf "${RED}[hashpilot]${NC} %s\n" "$1"; }
detail() { printf "${DIM}  →${NC} %s\n" "$1"; }

# ── Detect source directory ──────────────────────────────────────────────
REMOTE_MODE=false
SOURCE_DIR=""

# Try to resolve from script location (local clone mode)
if SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd 2>/dev/null)"; then
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd 2>/dev/null || echo "")"
  if [ -n "$REPO_ROOT" ] && [ -f "$REPO_ROOT/package.json" ]; then
    SOURCE_DIR="$REPO_ROOT"
  fi
fi

# No local source — download release tarball from GitHub (curl-pipe / remote mode)
if [ -z "$SOURCE_DIR" ]; then
  REMOTE_MODE=true
  CLONE_DIR=$(mktemp -d)
  
  # Determine version to download (latest release)
  log "Fetching latest release info from GitHub..."
  RELEASE_INFO=$(curl -fsSL "https://api.github.com/repos/bigknoxy/HashPilot/releases/latest" 2>/dev/null || echo "")
  if [ -n "$RELEASE_INFO" ]; then
    TAG_NAME=$(echo "$RELEASE_INFO" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    TARBALL_URL="https://github.com/bigknoxy/HashPilot/archive/refs/tags/${TAG_NAME}.tar.gz"
    log "Downloading HashPilot ${TAG_NAME} from GitHub..."
  else
    # Fallback to main branch if no release
    TARBALL_URL="https://github.com/bigknoxy/HashPilot/archive/refs/heads/main.tar.gz"
    log "Downloading HashPilot from main branch..."
  fi
  
  curl -fsSL "$TARBALL_URL" | tar -xz -C "$CLONE_DIR" --strip-components=1 2>&1 | while IFS= read -r line; do detail "$line"; done
  SOURCE_DIR="$CLONE_DIR"
  detail "Extracted to $CLONE_DIR"
fi

# ── Parse arguments ──────────────────────────────────────────────────────
TARGET_DIR="${HOME}/.agentic-tools"
KEEP_TELEMETRY=false
FORCE=false

while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE_DIR="$2"; shift 2 ;;
    --target) TARGET_DIR="$2"; shift 2 ;;
    --keep-telemetry) KEEP_TELEMETRY=true; shift ;;
    --force|-f) FORCE=true; shift ;;
    --help|-h)
      echo "HashPilot Installer v${HASHPILOT_VERSION}"
      echo "Usage: $0 [options]"
      echo "  --source <dir>     Source directory (default: repo root)."
      echo "                     If omitted and no local source found,"
      echo "                     auto-downloads release tarball from GitHub."
      echo "  --target <dir>     Install target (default: ~/.agentic-tools)"
      echo "  --keep-telemetry   Preserve existing telemetry on reinstall"
      echo "  --force, -f        Overwrite existing install without prompt"
      echo "  --help, -h         Show this help"
      echo ""
      echo "One-liner: curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/install.sh | bash"
      exit 0
      ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Prerequisites ────────────────────────────────────────────────────────
log "Checking prerequisites..."

# Auto-install bun if not present
if ! command -v bun &>/dev/null; then
  warn "bun not found. Installing bun..."
  curl -fsSL https://bun.sh/install | bash
  # Source the new PATH
  export BUN_INSTALL="${HOME}/.bun"
  export PATH="${BUN_INSTALL}/bin:${PATH}"
fi

BUN_VER=$(bun --version 2>/dev/null || echo "0")
detail "bun ${BUN_VER}"

if ! command -v bash &>/dev/null; then
  err "bash is required"
  exit 1
fi

if [ "$REMOTE_MODE" = "true" ] && ! command -v curl &>/dev/null; then
  err "curl is required to download HashPilot"
  exit 1
fi

if [ "$REMOTE_MODE" = "true" ] && ! command -v tar &>/dev/null; then
  err "tar is required to extract HashPilot"
  exit 1
fi

# Check source
if [ ! -f "$SOURCE_DIR/package.json" ]; then
  err "Source directory '$SOURCE_DIR' does not contain package.json"
  err "Run from the hashpilot repo root or use --source <path>"
  exit 1
fi

# ── Detect existing install ──────────────────────────────────────────────
MANIFEST="$TARGET_DIR/manifest.json"
if [ -f "$MANIFEST" ]; then
  if [ "$FORCE" != "true" ]; then
    warn "Existing HashPilot installation detected at $TARGET_DIR"
    echo -n "  Overwrite? [y/N] "
    read -r CONFIRM
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
      log "Install cancelled."
      exit 0
    fi
  fi
  log "Upgrading existing installation..."
else
  log "Fresh installation..."
fi

# ── Install Core ────────────────────────────────────────────────────────
log "Installing HashPilot Core..."
mkdir -p "$TARGET_DIR"

# If core already exists, remove node_modules first to avoid stale deps
if [ -d "$TARGET_DIR/structured-editing" ]; then
  rm -rf "$TARGET_DIR/structured-editing/node_modules"
  # Preserve telemetry if requested
  if [ "$KEEP_TELEMETRY" == "true" ] && [ -f "$TARGET_DIR/logs/telemetry.jsonl" ]; then
    mkdir -p /tmp/hashpilot-telemetry-backup
    cp "$TARGET_DIR/logs/telemetry.jsonl" /tmp/hashpilot-telemetry-backup/
    detail "Backed up telemetry to /tmp/hashpilot-telemetry-backup/"
  fi
fi

# Copy core (exclude node_modules, .git)
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='logs' \
  "$SOURCE_DIR/" "$TARGET_DIR/structured-editing/" 2>/dev/null || \
cp -r "$SOURCE_DIR"/* "$TARGET_DIR/structured-editing/" 2>/dev/null || {
  # Fallback: manual copy
  mkdir -p "$TARGET_DIR/structured-editing"
  for item in "$SOURCE_DIR"/*; do
    [ "$(basename "$item")" == "node_modules" ] && continue
    [ "$(basename "$item")" == ".git" ] && continue
    cp -r "$item" "$TARGET_DIR/structured-editing/"
  done
}
detail "Core source copied to $TARGET_DIR/structured-editing"

# ── Install dependencies ────────────────────────────────────────────────
log "Installing dependencies..."
cd "$TARGET_DIR/structured-editing"
bun install --frozen-lockfile 2>&1 | while IFS= read -r line; do detail "$line"; done
cd "$OLDPWD"
detail "Dependencies installed"

# ── Create CLI launcher ──────────────────────────────────────────────────
log "Creating CLI launcher..."
mkdir -p "$TARGET_DIR/bin"
cat > "$TARGET_DIR/bin/structured-edit" << 'LAUNCHER'
#!/bin/bash
exec bun run "$HOME/.agentic-tools/structured-editing/src/cli.ts" "$@"
LAUNCHER
chmod +x "$TARGET_DIR/bin/structured-edit"
detail "Launcher created at $TARGET_DIR/bin/structured-edit"

# ── Configure PATH ───────────────────────────────────────────────────────
log "Adding PATH entry..."

detect_rc() {
  if [ -n "${HASHPILOT_SHELL_RC:-}" ]; then
    echo "$HASHPILOT_SHELL_RC"
    return
  fi
  for f in "${HOME}/.bashrc" "${HOME}/.zshrc" "${HOME}/.bash_profile" "${HOME}/.profile"; do
    if [ -f "$f" ]; then
      echo "$f"
      return
    fi
  done
  # Default
  echo "${HOME}/.bashrc"
}

RC_FILE=$(detect_rc)
PATH_MARKER_START="# >>> hashpilot path >>>"
PATH_MARKER_END="# <<< hashpilot path <<<"
PATH_LINE="export PATH=\"\$HOME/.agentic-tools/bin:\$PATH\""

if [ -f "$RC_FILE" ]; then
  if grep -q "$PATH_MARKER_START" "$RC_FILE" 2>/dev/null; then
    detail "PATH entry already exists in $RC_FILE (skipping)"
  else
    {
      echo ""
      echo "$PATH_MARKER_START"
      echo "$PATH_LINE"
      echo "$PATH_MARKER_END"
    } >> "$RC_FILE"
    detail "Added PATH entry to $RC_FILE"
  fi
else
  detail "Creating $RC_FILE with PATH entry"
  {
    echo "# Generated by HashPilot installer"
    echo "$PATH_MARKER_START"
    echo "$PATH_LINE"
    echo "$PATH_MARKER_END"
  } > "$RC_FILE"
fi

# ── Install templates (OpenCode, Pi, Claude) ─────────────────────────────
TEMPLATES="$TARGET_DIR/structured-editing/templates"

install_template() {
  local src="$1"
  local dst="$2"
  local label="$3"
  mkdir -p "$(dirname "$dst")"
  if [ -f "$src" ]; then
    cp "$src" "$dst"
    detail "Installed ${label}: ${dst}"
  else
    warn "${label} template not found at ${src} (skipping)"
  fi
}

log "Installing adapter integrations..."

# OpenCode
install_template "$TEMPLATES/opencode-skill.md" \
  "${HOME}/.config/opencode/skills/hashpilot/SKILL.md" "OpenCode skill"
install_template "$TEMPLATES/opencode-agent.md" \
  "${HOME}/.config/opencode/agent/hashpilot.md" "OpenCode agent"

# Pi
install_template "$TEMPLATES/pi-extension.ts" \
  "${HOME}/.pi/agent/extensions/hashpilot.ts" "Pi extension"
install_template "$TEMPLATES/pi-skill.md" \
  "${HOME}/.pi/agent/skills/hashpilot/SKILL.md" "Pi skill"

# Claude
CLAUDE_MARKER="HashPilot Claude — Structured Editing Integration"
CLAUDE_FILE="${HOME}/.claude/CLAUDE.md"
if [ -f "$TEMPLATES/claude-section.md" ]; then
  mkdir -p "$(dirname "$CLAUDE_FILE")"
  if [ -f "$CLAUDE_FILE" ] && grep -q "$CLAUDE_MARKER" "$CLAUDE_FILE" 2>/dev/null; then
    detail "Claude integration already present in $CLAUDE_FILE (skipping)"
  else
    {
      echo ""
      cat "$TEMPLATES/claude-section.md"
    } >> "$CLAUDE_FILE"
    detail "Appended Claude integration to $CLAUDE_FILE"
  fi
else
  warn "Claude section template not found (skipping)"
fi

# ── Bootstrap config ────────────────────────────────────────────────────
log "Bootstrapping config..."
CONFIG_DIR="${HOME}/.config/hashpilot"
CONFIG_FILE="${CONFIG_DIR}/config.json"
if [ -f "$CONFIG_FILE" ]; then
  detail "Config already exists at $CONFIG_FILE (preserving)"
else
  mkdir -p "$CONFIG_DIR"
  cat > "$CONFIG_FILE" << 'CONFIG'
{
  "telemetry": {
    "enabled": true
  },
  "provenance": {
    "maxContextLength": 500
  }
}
CONFIG
  detail "Created default config at $CONFIG_FILE"
fi

# ── Restore telemetry ───────────────────────────────────────────────────
if [ "$KEEP_TELEMETRY" == "true" ] && [ -f /tmp/hashpilot-telemetry-backup/telemetry.jsonl ]; then
  mkdir -p "$TARGET_DIR/logs"
  cp /tmp/hashpilot-telemetry-backup/telemetry.jsonl "$TARGET_DIR/logs/"
  detail "Restored telemetry from backup"
  rm -rf /tmp/hashpilot-telemetry-backup
fi

# ── Write manifest ───────────────────────────────────────────────────────
log "Writing manifest..."
MANIFEST_FILE="$TARGET_DIR/manifest.json"

# Detect shell rc path entries
RC_ENTRIES="[]"
if [ -f "$RC_FILE" ]; then
  RC_ENTRIES=$(cat <<MANIFEST_RC
    [
      {
        "file": "$RC_FILE",
        "marker_start": "$PATH_MARKER_START",
        "marker_end": "$PATH_MARKER_END"
      }
    ]
MANIFEST_RC
)
fi

cat > "$MANIFEST_FILE" << MANIFEST
{
  "version": "1",
  "hashpilotVersion": "${HASHPILOT_VERSION}",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sourceType": "$([ "$REMOTE_MODE" == "true" ] && echo "remote" || echo "clone")",
  "hashpilotDir": "${TARGET_DIR}",
  "components": {
    "core": {
      "source": "${TARGET_DIR}/structured-editing"
    },
    "bin": [
      "${TARGET_DIR}/bin/structured-edit"
    ],
    "config": [
      "${CONFIG_FILE}"
    ],
    "claude": {
      "modified": [
        "${CLAUDE_FILE}"
      ]
    },
    "opencode": [
      "${HOME}/.config/opencode/skills/hashpilot/SKILL.md",
      "${HOME}/.config/opencode/agent/hashpilot.md"
    ],
    "pi": [
      "${HOME}/.pi/agent/extensions/hashpilot.ts",
      "${HOME}/.pi/agent/skills/hashpilot/SKILL.md"
    ],
    "telemetry": {
      "dir": "${TARGET_DIR}/logs"
    },
    "pathEntries": ${RC_ENTRIES}
  }
}
MANIFEST
detail "Manifest written to $MANIFEST_FILE"

# ── Cleanup ────────────────────────────────────────────────────────────────
if [ "$REMOTE_MODE" = "true" ] && [ -n "${CLONE_DIR:-}" ]; then
  rm -rf "$CLONE_DIR"
  detail "Cleaned up temporary source"
fi

# ── Verify ───────────────────────────────────────────────────────────────
log "Verifying installation..."
if [ -f "$TARGET_DIR/bin/structured-edit" ]; then
  detail "CLI launcher: OK"
else
  err "CLI launcher missing!"
  exit 1
fi

if [ -d "$TARGET_DIR/structured-editing/node_modules" ]; then
  detail "Dependencies: OK"
else
  err "Dependencies not installed!"
  exit 1
fi

# Quick smoke test
if command -v structured-edit &>/dev/null || [ -x "$TARGET_DIR/bin/structured-edit" ]; then
  VER=$("$TARGET_DIR/bin/structured-edit" --version 2>/dev/null || echo "unknown")
  detail "CLI version: ${VER}"
fi

echo ""
printf "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "${GREEN} HashPilot v${HASHPILOT_VERSION} installed successfully${NC}\n"
printf "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
echo ""
echo "  Core:     $TARGET_DIR/structured-editing"
echo "  CLI:      structured-edit"
echo "  Config:   ${CONFIG_FILE}"
echo "  Manifest: $MANIFEST_FILE"
echo ""
echo "  Run 'structured-edit doctor' to verify the installation."
echo "  Restart your shell or run: source $RC_FILE"
echo ""
