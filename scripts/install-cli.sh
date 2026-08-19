#!/usr/bin/env bash
# Dev install: symlink the CLI launcher into ~/.agentic-tools/bin and make sure
# that directory is actually on PATH.
#
# The symlink alone is not an install. Before this script, `bun run install-cli`
# created the link and stopped, so `hashpilot` was not a runnable command in a
# fresh shell and `doctor` reported a broken installation. PATH wiring lives in
# scripts/install.sh for the full install; this is the same block, so the two
# paths converge on one marker and `scripts/uninstall.sh` removes either.
set -euo pipefail

BIN_DIR="${HOME}/.agentic-tools/bin"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHER="${REPO_ROOT}/src/cli-node.cjs"

mkdir -p "$BIN_DIR"
ln -sf "$LAUNCHER" "$BIN_DIR/hashpilot"
echo "Linked $BIN_DIR/hashpilot -> $LAUNCHER"

# Stale symlink from the pre-3.1 binary name; leaving it makes `doctor` and the
# manifest disagree about what is installed.
if [ -L "$BIN_DIR/structured-edit" ]; then
  rm -f "$BIN_DIR/structured-edit"
  echo "Removed stale symlink: $BIN_DIR/structured-edit"
fi

detect_rc() {
  if [ -n "${HASHPILOT_SHELL_RC:-}" ]; then echo "$HASHPILOT_SHELL_RC"; return; fi
  case "${SHELL:-}" in
    */zsh) echo "${HOME}/.zshrc"; return ;;
    */bash) [ -f "${HOME}/.bashrc" ] && { echo "${HOME}/.bashrc"; return; } ;;
  esac
  for f in "${HOME}/.bashrc" "${HOME}/.zshrc" "${HOME}/.bash_profile" "${HOME}/.profile"; do
    if [ -f "$f" ]; then echo "$f"; return; fi
  done
  echo "${HOME}/.bashrc"
}

RC_FILE=$(detect_rc)
PATH_MARKER_START="# >>> hashpilot path >>>"
PATH_MARKER_END="# <<< hashpilot path <<<"
PATH_LINE="export PATH=\"\$HOME/.agentic-tools/bin:\$PATH\""

if grep -q "$PATH_MARKER_START" "$RC_FILE" 2>/dev/null; then
  echo "PATH entry already present in $RC_FILE"
else
  {
    echo ""
    echo "$PATH_MARKER_START"
    echo "$PATH_LINE"
    echo "$PATH_MARKER_END"
  } >> "$RC_FILE"
  echo "Added PATH entry to $RC_FILE"
fi

case ":${PATH}:" in
  *":${BIN_DIR}:"*) echo "hashpilot is on PATH in this shell." ;;
  *) echo "Run this to use hashpilot in the current shell:"
     echo "  export PATH=\"\$HOME/.agentic-tools/bin:\$PATH\"" ;;
esac
