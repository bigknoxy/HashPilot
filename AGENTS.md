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
- `bash scripts/doctor.sh` — check the local installation environment.
- `bash tests/smoke.sh` — run end-to-end checks against the installed CLI.

Use Bun 1.2 or newer. There is no separate formatter or linter configured; keep changes consistent with nearby code and run tests before submitting.

## Coding Style & Naming Conventions

Use strict TypeScript with ES modules and two-space indentation. Prefer descriptive camelCase for variables/functions, PascalCase for types/classes, and kebab-case for CLI subcommands. Preserve the public exports in `src/core/index.ts`. CLI output is machine-readable JSON by default, so avoid changing output shapes without updating `docs/ADAPTER-CONTRACT.md` and affected tests.

## Testing Guidelines

Add or update Bun tests for behavior changes. Name files `<module>.test.ts` and keep them under `tests/`; use focused tests for routing, stale anchors, duplicate matches, and error paths. Run the relevant file first, then `bun test` and the smoke test when CLI behavior changes. The repository advertises approximately 96% coverage; maintain meaningful coverage even when no threshold is enforced in configuration.

## Commit & Pull Request Guidelines

Use Conventional Commits, for example `feat: add ...`, `fix: handle ...`, `docs: update ...`, or `chore: release ...`; semantic-release uses these prefixes. Pull requests should explain the user-visible change, list validation commands and results, link related issues when applicable, and call out changes to CLI JSON contracts, integrations, or documentation. Include screenshots only for landing-page or other visual changes.
