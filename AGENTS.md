# Repository Guidelines

## Project Structure & Module Organization

HashPilot is a Bun/TypeScript CLI. The entry point is `src/cli.ts`; reusable editing logic lives in `src/core/`. The router selects AST, hash, or diff editing strategies. Tests are in `tests/` and use matching module names, such as `router.test.ts` and `hash-edit.test.ts`. Documentation and adapter contracts are in `docs/`, agent integration snippets are in `templates/`, and operational scripts are in `scripts/`. Build output is written to `dist/` and should not be edited manually.

## Build, Test, and Development Commands

- `bun install` — install dependencies from `bun.lock`.
- `bun test` — run the full Bun test suite.
- `bun test tests/router.test.ts` — run one test file.
- `bun test -t "pattern"` — run tests matching a name.
- `bun run src/cli.ts doctor` — exercise the CLI directly during development.
- `bun run build` — bundle `src/cli.ts` to `dist/` for distribution.
- `bun run install-cli` — symlink the CLI into `~/.agentic-tools/bin/`.
- `bash scripts/doctor.sh` — check the local installation environment.
- `bash tests/smoke.sh` — run end-to-end checks against the installed CLI.
- `bun run lint:docs` — verify the CLI quickref matches `--help` and `ROADMAP.md` is consistent.
- `bun run gen:cli-quickref` — regenerate the quickref command reference after a CLI change.

`docs/CLI-QUICKREF.md` is the agent-facing invocation reference: every command, flag, output shape, and exit code, plus the gotchas that cause guess-and-retry loops. Read it before invoking the CLI. Its command-reference block is generated from the CLI's own `--help`, so any CLI change requires `bun run gen:cli-quickref`; otherwise `bun run lint:docs` fails in CI (`Docs Verify`) and in `tests/cli-contract.test.ts`. Backlog changes (new issue, closed issue, re-prioritized row) must keep the GitHub issue and the `ROADMAP.md` row in step — `bun run lint:roadmap` is the gate.

Use Bun 1.2 or newer. There is no separate formatter or linter configured; keep changes consistent with nearby code and run tests before submitting.

## Gotchas

- **tree-sitter is a native module.** Run `bun install` before anything else. Without `node_modules/`, the AST test files abort with `error: Cannot find package 'tree-sitter'` while the rest of the suite passes, so the failure looks unrelated to your change. The green baseline is 515 pass / 0 fail.
- **AST load failures are silent.** `getParser()` (`src/core/ast-edit.ts:31-60`) catches parser-init errors and returns `null`; the router then falls back to hash/diff with no warning. If AST edits mysteriously route to diff, check that the tree-sitter bindings actually built.
- **Route precedence** (`chooseRoute`, `src/core/router.ts:36`) is policy override → AST (language supported *and* AST operation) → hash operation → diff fallback. First match wins.

## Coding Style & Naming Conventions

Use strict TypeScript with ES modules and two-space indentation. Prefer descriptive camelCase for variables/functions, PascalCase for types/classes, and kebab-case for CLI subcommands. Preserve the public exports in `src/core/index.ts`. CLI output is machine-readable JSON by default, so avoid changing output shapes without updating `docs/ADAPTER-CONTRACT.md` and affected tests.

## Testing Guidelines

Add or update Bun tests for behavior changes. Name files `<module>.test.ts` and keep them under `tests/`; use focused tests for routing, stale anchors, duplicate matches, and error paths. Run the relevant file first, then `bun test` and the smoke test when CLI behavior changes. The repository advertises approximately 96% coverage; maintain meaningful coverage even when no threshold is enforced in configuration.

## Commit & Pull Request Guidelines

Use Conventional Commits, for example `feat: add ...`, `fix: handle ...`, `docs: update ...`, or `chore: release ...`; semantic-release uses these prefixes. Pull requests should explain the user-visible change, list validation commands and results, link related issues when applicable, and call out changes to CLI JSON contracts, integrations, or documentation. Include screenshots only for landing-page or other visual changes.
