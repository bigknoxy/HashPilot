# HashPilot — OpenCode Integration Guide

## Integration Pattern

HashPilot integrates with OpenCode as a **skill** (for inline guidance) and a **subagent** (for delegated editing tasks).

## Installed Components

### Skill: `~/.config/opencode/skills/hashpilot/SKILL.md`

Provides instructions that OpenCode's AI can reference when deciding how to edit files. The skill triggers when:
- The user asks to edit files precisely
- Hash-anchored edits are appropriate
- TypeScript/TSX symbol-level edits are needed

### Agent: `~/.config/opencode/agent/hashpilot.md`

A subagent definition with full tool access (bash, write, edit, read, grep, glob) that:
- Prefers AST commands for TypeScript, TSX, JavaScript, Python, Go, Rust
- Uses hash-anchored edits for other files
- Verifies changes after editing
- Handles stale anchors by re-reading and retrying

## Setup

The skill and agent are already installed. If you need to set them up manually:

```bash
# Skill
mkdir -p ~/.config/opencode/skills/hashpilot
cp ~/.agentic-tools/structured-editing/templates/opencode-skill.md ~/.config/opencode/skills/hashpilot/SKILL.md

# Agent (already auto-discovered from ~/.config/opencode/agent/)
# No additional setup needed
```

### PATH requirement

Ensure `~/.agentic-tools/bin` is in PATH before launching OpenCode:

```bash
# Add to ~/.bashrc or ~/.zshrc
export PATH="$HOME/.agentic-tools/bin:$PATH"
```

## Usage in OpenCode Sessions

### Inline skill usage

When OpenCode detects file editing tasks, it will reference the hashpilot skill and use `structured-edit` commands directly via bash tool:

```bash
# OpenCode agent using hash-anchored edit
HASH=$(structured-edit read-many src/config.ts | jq -r '.[0].hash')
structured-edit replace-hash src/config.ts "$HASH" "new content"

# OpenCode agent using AST edit for TypeScript
structured-edit ast rename-symbol src/api.ts oldFunc newFunc
```

### Subagent delegation

Use the HashPilot subagent for complex multi-file editing tasks:

```
/agent hashpilot

Rename the function 'processData' to 'transformData' across all files 
in src/ and update the imports accordingly.
```

The subagent will:
1. Find all files containing `processData`
2. Use `ast rename-symbol` for .ts files
3. Use `replace-hash` for other files
4. Run `verify-changes` on all modified files

## Key Advantages Over Raw Editing

| Aspect | Raw Edit | HashPilot |
|--------|----------|-----------|
| Line counting | Required, error-prone | Hash-anchored, robust |
| TypeScript edits | Text-based, imprecise | AST-aware, symbol-level |
| Conflict detection | None | Stale anchor rejection |
| Verification | Manual | Bundled formatter+linter+tests |
| Audit trail | None | Telemetry logging |

## Reference: Complete Command List

```
structured-edit read-many <files...>
structured-edit read-hash <file> <line> [-c <context>]
structured-edit grep-many <pattern> <paths...>
structured-edit symbol-lookup-many <paths...> --names n1,n2
structured-edit replace-hash <file> <hash> <content> [--range s:e] [--dry-run]
structured-edit ast find-symbols <file>
structured-edit ast capabilities
structured-edit ast rename-symbol <file> <old> <new>
structured-edit ast replace-body <file> <symbol> <body>
structured-edit ast add-import <file> '<spec>'
structured-edit ast remove-import <file> '<spec>'
structured-edit ast insert-before <file> <symbol> <content>
structured-edit ast insert-after <file> <symbol> <content>
structured-edit route <file> <op> [--policy <json>]
structured-edit config
structured-edit verify-changes <files...> [--formatter] [--linter] [--test-filter]
structured-edit telemetry [show|summary|health|clear]
structured-edit telemetry health [-w <days>] [--trend]
```