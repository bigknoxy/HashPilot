#!/bin/bash
set -euo pipefail

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

# Single source of truth for the "use npm, not an explicit git ref" sentinel
# — referenced in this file and (as a literal, since it's a separate process)
# in src/commands/maintenance.ts's `--channel` default; keep both in sync.
DEFAULT_CHANNEL="main"

# None of this script's network calls bounded how long they'd wait — a host
# that accepts the TCP connection but never responds (common for corporate
# proxies blocking a specific destination, which is the exact scenario the
# npm-registry fallback below exists for) hung the installer indefinitely
# instead of ever reaching that fallback.
CURL_META_OPTS=(--connect-timeout 10 --max-time 20)
CURL_DOWNLOAD_OPTS=(--connect-timeout 10 --max-time 300)

# Extract one string field's value from a small JSON blob (grep+sed, no jq
# dependency, matching this script's existing style) — centralized so every
# call site gets the same handling instead of each reinventing it slightly
# differently. Pass "url" as $3 to additionally require the value look like
# a real http(s) URL: the naive sed substitution only fires on a genuine
# match, so a non-URL value (empty, relative, a mirror that rewrites the
# field to something else) would otherwise silently pass the whole
# grep-matched line through unchanged — still non-empty, so it would pass a
# bare `-n` check as if it were real.
json_field() {
  local json="$1" field="$2" require="${3:-}" value
  value=$(echo "$json" | grep -o "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 \
    | sed "s/.*\"${field}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\"/\\1/" || true)
  if [ "$require" = "url" ]; then
    case "$value" in
      https://*|http://*) ;;
      *) value="" ;;
    esac
  fi
  echo "$value"
}

# Download a tarball to a temp file (verifying its sha1 against $3 first, if
# given — npm's registry metadata includes one for free), then extract it.
# Shared by the npm and GitHub source fetches below so hardening (timeouts,
# checksum verification) only has to be added once. Leaves nothing behind
# and returns non-zero on any failure: download, checksum mismatch, or
# extraction — every failure mode here is handled identically by the caller
# (fall back to the next source), so there is no reason for them to differ.
fetch_and_extract_tarball() {
  local url="$1" dest_dir="$2" expected_sha1="${3:-}" tmp_tarball
  tmp_tarball="$(mktemp)"
  if ! curl -fsSL "${CURL_DOWNLOAD_OPTS[@]}" "$url" -o "$tmp_tarball" 2>/dev/null; then
    rm -f "$tmp_tarball"
    return 1
  fi
  if [ -n "$expected_sha1" ]; then
    local actual_sha1
    actual_sha1="$(sha1sum "$tmp_tarball" 2>/dev/null | awk '{print $1}')"
    if [ "$actual_sha1" != "$expected_sha1" ]; then
      warn "tarball checksum mismatch (expected ${expected_sha1}, got ${actual_sha1:-<none>})"
      rm -f "$tmp_tarball"
      return 1
    fi
  fi
  if ! tar -xz -C "$dest_dir" --strip-components=1 -f "$tmp_tarball" 2>&1 | while IFS= read -r line; do detail "$line"; done; then
    rm -f "$tmp_tarball"
    return 1
  fi
  rm -f "$tmp_tarball"
}

# ── Detect source directory ──────────────────────────────────────────────
REMOTE_MODE=false
SOURCE_DIR=""
# Declared here (not just inside the remote-mode block below) so the
# dependency-install step can use it as the authoritative "did this come
# from npm" signal — local-clone mode and the GitHub-fallback path both
# leave it false, which is correct for both.
NPM_INSTALLED=false

# An explicit --source wins over everything else, checked here (before the
# real argument-parsing loop below, which runs too late for this) so that
# passing --source skips local-clone detection AND the auto-download below
# entirely — downloading anything when the caller already told us exactly
# where the source is would be pure waste, and previously caused a real bug:
# HASHPILOT_VERSION got read from the auto-fetched npm/GitHub tarball, not
# from the --source directory that was actually installed, silently
# mislabeling the manifest/version banner whenever the two versions differed.
# No `break`: --source given twice must resolve to the SAME occurrence the
# real argument-parsing loop below honors (it keeps the last one), or the
# version/manifest would be read from one directory while the actual
# install copies from another — reintroducing the exact class of mismatch
# this pre-scan exists to prevent.
EXPLICIT_SOURCE=""
_ARGV=("$@")
for ((_i = 0; _i < ${#_ARGV[@]}; _i++)); do
  if [ "${_ARGV[$_i]}" = "--source" ] && [ $((_i + 1)) -lt ${#_ARGV[@]} ]; then
    EXPLICIT_SOURCE="${_ARGV[$((_i + 1))]}"
  fi
done

if [ -n "$EXPLICIT_SOURCE" ]; then
  SOURCE_DIR="$EXPLICIT_SOURCE"
# Try to resolve from script location (local clone mode)
elif SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd 2>/dev/null)"; then
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd 2>/dev/null || echo "")"
  if [ -n "$REPO_ROOT" ] && [ -f "$REPO_ROOT/package.json" ]; then
    SOURCE_DIR="$REPO_ROOT"
  fi
fi

# No local source — fetch a tarball (curl-pipe / remote mode).
#
# Primary source is the published npm package: it's the tested, minimal
# artifact (no devDependencies, no tests/docs bloat — see
# tests/packaging.test.ts for what it guarantees ships) instead of the full
# git source tree, and it stops this installer silently drifting from the
# npm distribution channel now that publishing actually works (#193). Only
# curl is used — no `npm`/`node` binary required, since bun is this script's
# only external prerequisite.
#
# Falls back to the GitHub source tarball (release tag, or a branch) when:
#   - the npm registry is unreachable or the package/version can't be found
#     (offline-but-git-reachable environments, corporate proxies that allow
#     github.com but not registry.npmjs.org), or
#   - HASHPILOT_SOURCE_CHANNEL is set to something other than "main" — an
#     explicit non-default channel (e.g. `hashpilot upgrade --channel
#     some-branch`) means the user wants that exact git ref, which npm's
#     published releases can't provide.
#
# HASHPILOT_NPM_REGISTRY overrides the registry base URL — used by tests to
# deterministically force the npm path to fail without relying on a real
# outage, and by anyone behind an npm registry mirror/proxy.
if [ -z "$SOURCE_DIR" ]; then
  REMOTE_MODE=true
  CLONE_DIR=$(mktemp -d)
  # A stale HASHPILOT_SOURCE_CHANNEL already exported in the caller's shell
  # (or a CI job's environment) must not silently override the channel the
  # user actually asked for on THIS invocation — src/commands/maintenance.ts
  # always sets this explicitly (to "" on the default channel) precisely so
  # `${HASHPILOT_SOURCE_CHANNEL:-$DEFAULT_CHANNEL}` can't see a leftover
  # value from a previous run, but default it defensively here too for
  # anyone invoking install.sh directly rather than through `hashpilot
  # upgrade`.
  SOURCE_CHANNEL="${HASHPILOT_SOURCE_CHANNEL:-$DEFAULT_CHANNEL}"
  [ -z "$SOURCE_CHANNEL" ] && SOURCE_CHANNEL="$DEFAULT_CHANNEL"
  NPM_REGISTRY="${HASHPILOT_NPM_REGISTRY:-https://registry.npmjs.org}"
  NPM_INSTALLED=false

  if [ "$SOURCE_CHANNEL" = "$DEFAULT_CHANNEL" ]; then
    log "Fetching latest release info from npm..."
    NPM_INFO=$(curl -fsSL "${CURL_META_OPTS[@]}" "${NPM_REGISTRY}/@bigknoxy/hashpilot/latest" 2>/dev/null || echo "")
    NPM_TARBALL_URL="$(json_field "$NPM_INFO" "tarball" url)"
    NPM_VERSION="$(json_field "$NPM_INFO" "version")"
    NPM_SHASUM="$(json_field "$NPM_INFO" "shasum")"
    if [ -n "$NPM_TARBALL_URL" ]; then
      log "Downloading HashPilot v${NPM_VERSION} from npm..."
      # A tarball can download, checksum-verify, and extract cleanly while
      # still being useless — e.g. a registry response that resolved to
      # some unrelated but validly-formed archive. Require a package.json
      # to actually be there before trusting this source; otherwise every
      # later step (the version read right after this block especially)
      # fails with a bare, undiagnosed exit instead of falling back like
      # every other failure mode here does.
      if fetch_and_extract_tarball "$NPM_TARBALL_URL" "$CLONE_DIR" "$NPM_SHASUM"; then
        if [ -f "$CLONE_DIR/package.json" ]; then
          NPM_INSTALLED=true
        else
          warn "npm tarball extracted but had no package.json; falling back to GitHub source"
        fi
      else
        warn "npm tarball download/extract failed; falling back to GitHub source"
      fi
      if [ "$NPM_INSTALLED" = "false" ]; then
        rm -rf "$CLONE_DIR"
        CLONE_DIR=$(mktemp -d)
      fi
    else
      warn "npm registry unreachable or package not found; falling back to GitHub source"
    fi
  fi

  if [ "$NPM_INSTALLED" = "false" ]; then
    if [ "$SOURCE_CHANNEL" = "$DEFAULT_CHANNEL" ]; then
      log "Fetching latest release info from GitHub..."
      RELEASE_INFO=$(curl -fsSL "${CURL_META_OPTS[@]}" "https://api.github.com/repos/bigknoxy/HashPilot/releases/latest" 2>/dev/null || echo "")
      TAG_NAME="$(json_field "$RELEASE_INFO" "tag_name")"
      if [ -n "$TAG_NAME" ]; then
        TARBALL_URL="https://github.com/bigknoxy/HashPilot/archive/refs/tags/${TAG_NAME}.tar.gz"
        log "Downloading HashPilot ${TAG_NAME} from GitHub..."
      else
        # Fallback to main branch if no release
        TARBALL_URL="https://github.com/bigknoxy/HashPilot/archive/refs/heads/main.tar.gz"
        log "Downloading HashPilot from main branch..."
      fi
    else
      TARBALL_URL="https://github.com/bigknoxy/HashPilot/archive/refs/heads/${SOURCE_CHANNEL}.tar.gz"
      log "Downloading HashPilot from branch ${SOURCE_CHANNEL}..."
    fi

    fetch_and_extract_tarball "$TARBALL_URL" "$CLONE_DIR"
  fi

  SOURCE_DIR="$CLONE_DIR"
  detail "Extracted to $CLONE_DIR"
fi

# Read the version from package.json so the installer can never drift from the
# released version. Falls back to "unknown" rather than a stale literal. Read
# only now that SOURCE_DIR is resolved, so this works in both local-clone mode
# and remote (curl-pipe) mode, where $0 doesn't point at the source tree.
HASHPILOT_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SOURCE_DIR/package.json" 2>/dev/null | head -1)"
HASHPILOT_VERSION="${HASHPILOT_VERSION:-unknown}"

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
      echo "                     If omitted and no local source found, auto-downloads"
      echo "                     from npm (falls back to the GitHub release/main tarball"
      echo "                     if npm is unreachable)."
      echo "  --target <dir>     Install target (default: ~/.agentic-tools)"
      echo "  --keep-telemetry   Preserve existing telemetry on reinstall"
      echo '  --force, -f        Overwrite existing install without any prompt (including the non-interactive existing-install notice)'
      echo "  --help, -h         Show this help"
      echo ""
      echo "Env vars: HASHPILOT_SOURCE_CHANNEL=<branch> skips npm and installs that exact"
      echo "          git branch instead (e.g. for bleeding-edge testing)."
      echo "          HASHPILOT_NPM_REGISTRY=<url> overrides the npm registry base URL."
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
    # Check if we're in an interactive terminal
    if [ -t 0 ]; then
      warn "Existing HashPilot installation detected at $TARGET_DIR"
      echo -n "  Overwrite? [y/N] "
      read -r CONFIRM
      if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        log "Install cancelled."
        exit 0
      fi
    else
      # Non-interactive (piped) - proceed with upgrade by default
      # (user piped the script, so they clearly want to install/upgrade)
      warn "Existing HashPilot installation detected at $TARGET_DIR; upgrading in non-interactive mode"
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
    # The log can contain source diffs. A fixed path under a world-writable
    # /tmp is readable by any local user and is a symlink-attack target, so
    # back up beside the data itself, in a 0700 directory with an
    # unpredictable name (#50).
    TELEMETRY_BACKUP_DIR="$(mktemp -d "$TARGET_DIR/.telemetry-backup.XXXXXX")"
    chmod 700 "$TELEMETRY_BACKUP_DIR"
    cp "$TARGET_DIR/logs/telemetry.jsonl" "$TELEMETRY_BACKUP_DIR/"
    chmod 600 "$TELEMETRY_BACKUP_DIR/telemetry.jsonl"
    detail "Backed up telemetry to $TELEMETRY_BACKUP_DIR/"
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
# Decide frozen-vs-production from $SOURCE_DIR (what we just copied FROM),
# not from whatever bun.lock might already be sitting in the target
# directory. The rsync fallback for hosts without rsync (`cp -r`, a few
# lines up) does not delete files absent from the source — an upgrade from
# a prior git-sourced install (which does ship bun.lock) to a new npm-
# sourced one (which doesn't) would otherwise leave the old lockfile
# behind, be found by a target-relative `[ -f bun.lock ]` check, and run
# --frozen-lockfile against the npm package's own package.json — which
# never matches, and hard-aborts the upgrade after node_modules has
# already been removed, leaving no working install at all.
#
# $NPM_INSTALLED (set above, always defined regardless of which branch was
# taken) is the authoritative signal for "this came from npm and has no
# lockfile" — cross-checked against bun.lock's presence rather than relied
# on alone, so a future source shape that disagrees with what we expect
# (e.g. an npm extraction that somehow shipped a lockfile, or a git/local
# source that's missing one) fails loudly here instead of silently
# guessing.
if [ "$NPM_INSTALLED" = "true" ] && [ -f "$SOURCE_DIR/bun.lock" ]; then
  err "npm-sourced install unexpectedly has a bun.lock — refusing to guess which dependency mode is correct"
  exit 1
fi
if [ "$NPM_INSTALLED" = "false" ] && [ "$REMOTE_MODE" = "true" ] && [ ! -f "$SOURCE_DIR/bun.lock" ]; then
  err "git-sourced install is missing bun.lock — refusing to guess which dependency mode is correct"
  exit 1
fi

if [ -f "$SOURCE_DIR/bun.lock" ]; then
  cd "$TARGET_DIR/structured-editing"
  bun install --frozen-lockfile 2>&1 | while IFS= read -r line; do detail "$line"; done
  cd "$OLDPWD"
else
  # The npm-published package.json still lists devDependencies (npm's
  # `files` field controls which FILES ship, not which package.json fields
  # do) — a plain `bun install` would resolve and install semantic-release,
  # fast-check, and the rest of the dev toolchain for no reason on an end
  # user's machine. --production skips them; the CLI never needs them.
  detail "No bun.lock shipped (npm package install) — resolving production dependencies fresh"
  rm -f "$TARGET_DIR/structured-editing/bun.lock"
  cd "$TARGET_DIR/structured-editing"
  bun install --production 2>&1 | while IFS= read -r line; do detail "$line"; done
  cd "$OLDPWD"
fi
detail "Dependencies installed"

# ── Create CLI launcher ──────────────────────────────────────────────────
log "Creating CLI launcher..."
mkdir -p "$TARGET_DIR/bin"
# Remove any existing entry before writing. A development install
# (`bun run install-cli`) leaves this path as a symlink into the checkout, and
# `>` follows a symlink — so writing straight to it overwrites the repo's own
# src/cli-node.cjs instead of replacing the launcher.
rm -f "$TARGET_DIR/bin/hashpilot"
cat > "$TARGET_DIR/bin/hashpilot" << 'LAUNCHER'
#!/bin/bash
exec bun run "$HOME/.agentic-tools/structured-editing/src/cli.ts" "$@"
LAUNCHER
chmod +x "$TARGET_DIR/bin/hashpilot"
detail "Launcher created at $TARGET_DIR/bin/hashpilot"

# Remove stale symlink from the old binary name (pre-3.1 installs).
if [ -L "$TARGET_DIR/bin/structured-edit" ]; then
  rm -f "$TARGET_DIR/bin/structured-edit"
  detail "Removed stale symlink: $TARGET_DIR/bin/structured-edit"
fi

# ── Configure PATH ───────────────────────────────────────────────────────
log "Adding PATH entry..."

detect_rc() {
  if [ -n "${HASHPILOT_SHELL_RC:-}" ]; then
    echo "$HASHPILOT_SHELL_RC"
    return
  fi
  # Prefer the rc file for the shell the user actually runs. Picking the first
  # existing file instead puts the PATH line in ~/.bashrc on a macOS zsh box,
  # where no interactive shell ever reads it.
  case "${SHELL:-}" in
    */zsh) echo "${HOME}/.zshrc"; return ;;
    */bash) [ -f "${HOME}/.bashrc" ] && { echo "${HOME}/.bashrc"; return; } ;;
  esac
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
if [ "$KEEP_TELEMETRY" == "true" ] && [ -n "${TELEMETRY_BACKUP_DIR:-}" ] && [ -f "$TELEMETRY_BACKUP_DIR/telemetry.jsonl" ]; then
  mkdir -p "$TARGET_DIR/logs"
  cp "$TELEMETRY_BACKUP_DIR/telemetry.jsonl" "$TARGET_DIR/logs/"
  detail "Restored telemetry from backup"
  rm -rf "$TELEMETRY_BACKUP_DIR"
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
      "${TARGET_DIR}/bin/hashpilot"
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
if [ -f "$TARGET_DIR/bin/hashpilot" ]; then
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
if command -v hashpilot &>/dev/null || [ -x "$TARGET_DIR/bin/hashpilot" ]; then
  VER=$("$TARGET_DIR/bin/hashpilot" --version 2>/dev/null || echo "unknown")
  detail "CLI version: ${VER}"
fi

# Final gate: doctor exits 2 on a broken install, 1 on warnings, 0 when healthy.
# Telling the user "installed successfully" and letting them discover the
# breakage on their first edit is the worse outcome (#46).
if [ -x "$TARGET_DIR/bin/hashpilot" ]; then
  # Two traps, both hit on the first real install:
  #   1. `set -e` aborts the whole script when a command substitution exits
  #      non-zero, so a plain assignment turned "doctor found something" into
  #      a silent exit 2 with no message. Capture the code with `|| ...`.
  #   2. The PATH entry was just written to the shell rc, which this process
  #      never sourced, so `bin-on-path` fails at exactly the moment it cannot
  #      yet succeed. Export the real PATH for the check.
  DOCTOR_CODE=0
  DOCTOR_OUT=$(PATH="$TARGET_DIR/bin:$PATH" "$TARGET_DIR/bin/hashpilot" --format text doctor 2>&1) || DOCTOR_CODE=$?
  if [ "$DOCTOR_CODE" -ge 2 ]; then
    err "Installation is not healthy:"
    echo "$DOCTOR_OUT"
    exit 1
  elif [ "$DOCTOR_CODE" -eq 1 ]; then
    detail "Doctor: healthy with warnings (run 'hashpilot doctor' for detail)"
  else
    detail "Doctor: healthy"
  fi
fi

echo ""
printf "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "${GREEN} HashPilot v${HASHPILOT_VERSION} installed successfully${NC}\n"
printf "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
echo ""
echo "  Core:     $TARGET_DIR/structured-editing"
echo "  CLI:      hashpilot"
echo "  Config:   ${CONFIG_FILE}"
echo "  Manifest: $MANIFEST_FILE"
echo ""
echo "  Run 'hashpilot doctor' to verify the installation."
echo "  Restart your shell or run: source $RC_FILE"
echo ""
