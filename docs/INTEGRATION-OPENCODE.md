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

When OpenCode detects file editing tasks, it will reference the hashpilot skill and use `hashpilot` commands directly via bash tool:

```bash
# OpenCode agent using hash-anchored edit
HASH=$(hashpilot read-many src/config.ts | jq -r '.[0].hash')
hashpilot replace-hash src/config.ts "$HASH" "new content"

# OpenCode agent using AST edit for TypeScript
hashpilot ast rename-symbol src/api.ts oldFunc newFunc
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

## When to Use HashPilot vs Raw Editing

| Task | Use HashPilot | Use Direct |
|------|--------------|------------|
| Edit existing TS/JS/Python/Go/Rust files | ✅ AST commands | ❌ |
| Edit any file with hash safety | ✅ replace-hash | ❌ |
| Rename symbols across files | ✅ ast rename-symbol | ❌ |
| Add/remove imports | ✅ ast add-import / remove-import | ❌ |
| Replace function body | ✅ ast replace-body | ❌ |
| Batch read multiple files | ✅ read-many | ❌ |
| Verify changes (lint+test) | ✅ verify-changes | ❌ |
| Create new files | ❌ | ✅ write |
| Delete files/directories | ❌ | ✅ bash rm |
| Move/rename files | ❌ | ✅ bash mv |
| Simple one-line edits | optional | ✅ direct edit |
| Single-file exploration | optional | ✅ direct read |

**General rule**: HashPilot for precision edits to existing files; direct tools for creation, deletion, and file system operations.

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
hashpilot read-many <files...>
hashpilot read-hash <file> <line> [-c <context>]
hashpilot grep-many <pattern> <paths...>
hashpilot symbol-lookup-many <paths...> --names n1,n2
hashpilot replace-hash <file> <hash> <content> [--range s:e] [--dry-run] [--actor] [--task-id] [--reason]
hashpilot ast find-symbols <file>
hashpilot ast capabilities
hashpilot ast rename-symbol <file> <old> <new> [--actor] [--task-id] [--reason]
hashpilot ast replace-body <file> <symbol> <body> [--actor] [--task-id] [--reason]
hashpilot ast add-import <file> '<spec>' [--actor] [--task-id] [--reason]
hashpilot ast remove-import <file> '<spec>' [--actor] [--task-id] [--reason]
hashpilot ast insert-before <file> <symbol> <content> [--actor] [--task-id] [--reason]
hashpilot ast insert-after <file> <symbol> <content> [--actor] [--task-id] [--reason]
hashpilot diff generate <file> <old> <new>
hashpilot diff apply <file> --patch <file> [--dry-run]
hashpilot route <file> <op> [--policy <json>]
hashpilot route-edit <file> <op> [--method <route>] [--dry-run]
hashpilot batch <op> <files...> [--serial] [--dry-run]
hashpilot intent '<json>' [--project-root <dir>] [--dry-run]
hashpilot config
hashpilot doctor
hashpilot verify-changes <files...> [--formatter] [--linter] [--typecheck] [--test-filter] [--auto-detect]
hashpilot provenance query <file> [<line>] [--human]
hashpilot provenance changeset <changeSetId> [--human]
hashpilot telemetry [show|summary|health|clear|sessions|export|prune]
hashpilot telemetry health [-w <days>] [--trend]
```