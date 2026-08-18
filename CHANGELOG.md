# [4.1.0](https://github.com/bigknoxy/HashPilot/compare/v4.0.9...v4.1.0) (2026-08-18)


### Features

* **verify:** scope test runs and subtract pre-edit baseline ([#24](https://github.com/bigknoxy/HashPilot/issues/24)) ([3827686](https://github.com/bigknoxy/HashPilot/commit/3827686436d71889ef54e4b56b597915a5dace37))

## [4.0.9](https://github.com/bigknoxy/HashPilot/compare/v4.0.8...v4.0.9) (2026-08-18)


### Bug Fixes

* close rollback-completeness gaps left by [#75](https://github.com/bigknoxy/HashPilot/issues/75) ([#10](https://github.com/bigknoxy/HashPilot/issues/10), [#17](https://github.com/bigknoxy/HashPilot/issues/17)) ([#76](https://github.com/bigknoxy/HashPilot/issues/76)) ([a3e7175](https://github.com/bigknoxy/HashPilot/commit/a3e7175ecd1a00f466c1bf4fdad5f5c40057512a))

## [4.0.8](https://github.com/bigknoxy/HashPilot/compare/v4.0.7...v4.0.8) (2026-08-17)


### Bug Fixes

* wire verification result into success flag and make rollback atomic ([#10](https://github.com/bigknoxy/HashPilot/issues/10), [#17](https://github.com/bigknoxy/HashPilot/issues/17)) ([#75](https://github.com/bigknoxy/HashPilot/issues/75)) ([78c629c](https://github.com/bigknoxy/HashPilot/commit/78c629c22ce7d8254a25f5fc16dc7bee092d7d4b))

## [4.0.7](https://github.com/bigknoxy/HashPilot/compare/v4.0.6...v4.0.7) (2026-08-17)


### Bug Fixes

* replace-hash measures elapsed_ms instead of hardcoding 0 ([#53](https://github.com/bigknoxy/HashPilot/issues/53)) ([84ce195](https://github.com/bigknoxy/HashPilot/commit/84ce195f952353519898cb6f3c72ddc6f25e72df)), closes [#3](https://github.com/bigknoxy/HashPilot/issues/3) [#51](https://github.com/bigknoxy/HashPilot/issues/51)

## [4.0.6](https://github.com/bigknoxy/HashPilot/compare/v4.0.5...v4.0.6) (2026-08-17)


### Bug Fixes

* normalize paths before deduping intent plan steps ([#41](https://github.com/bigknoxy/HashPilot/issues/41)) ([#74](https://github.com/bigknoxy/HashPilot/issues/74)) ([01a97f0](https://github.com/bigknoxy/HashPilot/commit/01a97f08c5c8975df76b7032b5401581109df085)), closes [#66](https://github.com/bigknoxy/HashPilot/issues/66)

## [4.0.5](https://github.com/bigknoxy/HashPilot/compare/v4.0.4...v4.0.5) (2026-08-17)


### Bug Fixes

* correct --force help text and dedupe non-interactive upgrade log ([5c8b381](https://github.com/bigknoxy/HashPilot/commit/5c8b381ea50f77b142a4c232d0abb2580a539fb5))
* doctor preserves exit-0 contract regardless of health state ([d4fda41](https://github.com/bigknoxy/HashPilot/commit/d4fda41397107f32602e5c1b2b16a2970f604283))

## [4.0.4](https://github.com/bigknoxy/HashPilot/compare/v4.0.3...v4.0.4) (2026-08-16)


### Bug Fixes

* doctor defaults to human summary, --json for machine output ([1e7e533](https://github.com/bigknoxy/HashPilot/commit/1e7e533e42738091dcb319c1b4fdd12396caca6d))

## [4.0.3](https://github.com/bigknoxy/HashPilot/compare/v4.0.2...v4.0.3) (2026-08-16)


### Bug Fixes

* improve UX - piped installs with existing install now proceed by default instead of exiting with error ([2dc7da9](https://github.com/bigknoxy/HashPilot/commit/2dc7da97f23e334413d696d7085259a7a946d9b2))

## [4.0.2](https://github.com/bigknoxy/HashPilot/compare/v4.0.1...v4.0.2) (2026-08-16)


### Bug Fixes

* use v4.0.0 as initial version to avoid flash of v0.0.0 ([926509b](https://github.com/bigknoxy/HashPilot/commit/926509bc3c9e20853b7be4471ed39e5598532dc5))

## [4.0.1](https://github.com/bigknoxy/HashPilot/compare/v4.0.0...v4.0.1) (2026-08-16)


### Bug Fixes

* make version on landing page dynamic via GitHub API ([d6a75bb](https://github.com/bigknoxy/HashPilot/commit/d6a75bbb256543bb57e7f9e2af567df3dd33c2c7))

# [4.0.0](https://github.com/bigknoxy/HashPilot/compare/v3.0.8...v4.0.0) (2026-08-16)


* feat!: rename CLI from structured-edit to hashpilot + add uninstall command ([5fc0ac0](https://github.com/bigknoxy/HashPilot/commit/5fc0ac0cacb13eb4cee5ba915bbd4c1e1d28a77d))


### Bug Fixes

* add migration cleanup for old symlink + document uninstall in adapter contract ([5d02970](https://github.com/bigknoxy/HashPilot/commit/5d029708b22b8d75e9687b99cafe56124401e707))
* improve uninstall dry-run output and add directory creation guard ([90ab1a6](https://github.com/bigknoxy/HashPilot/commit/90ab1a6ef87182cbfb3c97208d8095a3e7614efa))


### BREAKING CHANGES

* The CLI binary is now 'hashpilot' instead of 'structured-edit'.
Update any scripts, aliases, or agent prompts that invoke 'structured-edit' to
use 'hashpilot'. All subcommands, flags, output shapes, and exit codes are
unchanged. The on-disk install directory remains
'~/.agentic-tools/structured-editing/' for upgrade compatibility.

New: 'hashpilot uninstall' command with --keep-config, --force, and --dry-run
options. Delegates to scripts/uninstall.sh, mirroring the upgrade command
pattern.

Changes:
- src/cli.ts: program.name('hashpilot'), recovery hint strings, new uninstall
  command, existsSync import
- src/cli-node.cjs: error messages and comments updated
- src/core/doctor.ts: CLI_LAUNCHER path and spawnSync command name
- src/core/hash-edit.ts: recovery hint string
- package.json: bin name and install-cli symlink path
- scripts/install.sh, doctor.sh, uninstall.sh: all CLI references
- tests/smoke.sh, cli-contract.test.ts, envelope.test.ts: command invocations
  and uninstall coverage
- templates/: all 5 adapter templates (claude, opencode, pi)
- docs/: all 7 doc files (CLI-QUICKREF, ADAPTER-CONTRACT, INSTALL, ARCHITECTURE,
  INTEGRATION-CLAUDE/OPENCODE/PI)
- README.md, CLAUDE.md, index.html: all references
- .github/workflows/ci.yml: doctor invocations
- .claude/settings.local.json: permission entries
- scripts/gen-cli-quickref.ts: hardcoded example string
- schema/hashpilot-envelope.schema.json: description text

Verification:
- bun test: 598 pass / 0 fail
- bun run lint:docs: passes (CLI-QUICKREF regenerated, ROADMAP consistent)
- bash -n on all shell scripts: passes
- grep sweep: zero 'structured-edit' hits (excluding historical docs and
  generated dist/)

## [3.0.8](https://github.com/bigknoxy/HashPilot/compare/v3.0.7...v3.0.8) (2026-08-15)


### Bug Fixes

* handle non-interactive install (piped to bash) - require --force or TTY ([b3f69eb](https://github.com/bigknoxy/HashPilot/commit/b3f69ebff37e8c311e30af4fa69bf69d4bc963e7))

## [3.0.7](https://github.com/bigknoxy/HashPilot/compare/v3.0.6...v3.0.7) (2026-08-15)


### Bug Fixes

* ShellCheck SC2107 - use separate [ ] for && conditions ([8098838](https://github.com/bigknoxy/HashPilot/commit/8098838c0b4502256ad2e80cd700d939d017a06c))

## [3.0.6](https://github.com/bigknoxy/HashPilot/compare/v3.0.5...v3.0.6) (2026-08-15)


### Bug Fixes

* add missing fs imports for upgrade command ([c4b3064](https://github.com/bigknoxy/HashPilot/commit/c4b3064bb1a95e03bb9785d477ea0a35fc1b28c1))

## [3.0.5](https://github.com/bigknoxy/HashPilot/compare/v3.0.4...v3.0.5) (2026-08-15)


### Bug Fixes

* install.sh POSIX compatibility; add upgrade CLI command; fix locking tests ([4b5154e](https://github.com/bigknoxy/HashPilot/commit/4b5154e99b6cf88e598e3093271dda79d742dfd8))

## [3.0.4](https://github.com/bigknoxy/HashPilot/compare/v3.0.3...v3.0.4) (2026-08-14)


### Bug Fixes

* **B18:** compare-and-swap on every write, sorted advisory locks ([#21](https://github.com/bigknoxy/HashPilot/issues/21)) ([#70](https://github.com/bigknoxy/HashPilot/issues/70)) ([e995791](https://github.com/bigknoxy/HashPilot/commit/e9957915b1c58da34dd982cc48a18801f5a08dab)), closes [#22](https://github.com/bigknoxy/HashPilot/issues/22) [#22](https://github.com/bigknoxy/HashPilot/issues/22) [#22](https://github.com/bigknoxy/HashPilot/issues/22) [#40](https://github.com/bigknoxy/HashPilot/issues/40) [#40](https://github.com/bigknoxy/HashPilot/issues/40) [#40](https://github.com/bigknoxy/HashPilot/issues/40) [#35](https://github.com/bigknoxy/HashPilot/issues/35) [#35](https://github.com/bigknoxy/HashPilot/issues/35) [#35](https://github.com/bigknoxy/HashPilot/issues/35) [#40](https://github.com/bigknoxy/HashPilot/issues/40)

## [3.0.3](https://github.com/bigknoxy/HashPilot/compare/v3.0.2...v3.0.3) (2026-08-12)


### Bug Fixes

* **intent:** report unresolved plan steps instead of injecting placeholder comments ([#66](https://github.com/bigknoxy/HashPilot/issues/66)) ([9993a6d](https://github.com/bigknoxy/HashPilot/commit/9993a6d3e2bf97df2924907c30b34416cd7ed8da)), closes [#13](https://github.com/bigknoxy/HashPilot/issues/13) [#16](https://github.com/bigknoxy/HashPilot/issues/16)

## [3.0.2](https://github.com/bigknoxy/HashPilot/compare/v3.0.1...v3.0.2) (2026-08-12)


### Bug Fixes

* atomic writes, pre-edit snapshots, and undo ([#65](https://github.com/bigknoxy/HashPilot/issues/65)) ([b486fbd](https://github.com/bigknoxy/HashPilot/commit/b486fbd3fc2193374a04abc88d27ba9325d64bfb)), closes [#12](https://github.com/bigknoxy/HashPilot/issues/12)

## [3.0.1](https://github.com/bigknoxy/HashPilot/compare/v3.0.0...v3.0.1) (2026-08-12)


### Bug Fixes

* remove the 32KB AST ceiling and gate every edit on parse validity ([#64](https://github.com/bigknoxy/HashPilot/issues/64)) ([f0bf91f](https://github.com/bigknoxy/HashPilot/commit/f0bf91f5a24ab35a00b34f22d49f1d3f42d39813)), closes [#13](https://github.com/bigknoxy/HashPilot/issues/13) [#55](https://github.com/bigknoxy/HashPilot/issues/55) [#13](https://github.com/bigknoxy/HashPilot/issues/13)

# [3.0.0](https://github.com/bigknoxy/HashPilot/compare/v2.1.2...v3.0.0) (2026-08-11)


* feat!: emit one uniform JSON envelope from every command ([#63](https://github.com/bigknoxy/HashPilot/issues/63)) ([5a73c0c](https://github.com/bigknoxy/HashPilot/commit/5a73c0c32b5d2623e09e51c759f0bdb538727788)), closes [#18](https://github.com/bigknoxy/HashPilot/issues/18) [#56](https://github.com/bigknoxy/HashPilot/issues/56)


### BREAKING CHANGES

* JSON output is wrapped in an envelope. Read `.data` where you
previously read the root, and `.error.code` where you read `.errorCode`.
Migration notes in docs/ADAPTER-CONTRACT.md.

## [2.1.2](https://github.com/bigknoxy/HashPilot/compare/v2.1.1...v2.1.2) (2026-08-11)


### Bug Fixes

* **read:** unify lineHash width with computeHash so anchors round-trip ([#62](https://github.com/bigknoxy/HashPilot/issues/62)) ([3cb996e](https://github.com/bigknoxy/HashPilot/commit/3cb996e0b15b1252bd4765938a29912d7a11b7d1)), closes [#60](https://github.com/bigknoxy/HashPilot/issues/60)

## [2.1.1](https://github.com/bigknoxy/HashPilot/compare/v2.1.0...v2.1.1) (2026-08-11)


### Bug Fixes

* **telemetry:** surface unreadable and corrupt logs instead of returning [] ([#61](https://github.com/bigknoxy/HashPilot/issues/61)) ([1893e17](https://github.com/bigknoxy/HashPilot/commit/1893e171f8be7e487b9f6cc09267029f1a58b6d0)), closes [#18](https://github.com/bigknoxy/HashPilot/issues/18) [#59](https://github.com/bigknoxy/HashPilot/issues/59)

# [2.1.0](https://github.com/bigknoxy/HashPilot/compare/v2.0.0...v2.1.0) (2026-08-11)


### Features

* generated CLI quickref and roadmap consistency lint ([#58](https://github.com/bigknoxy/HashPilot/issues/58)) ([ffce3a1](https://github.com/bigknoxy/HashPilot/commit/ffce3a14fd4d95dc45aa9d9b2b0110a361a3ba53)), closes [#59](https://github.com/bigknoxy/HashPilot/issues/59)

# [2.0.0](https://github.com/bigknoxy/HashPilot/compare/v1.5.3...v2.0.0) (2026-08-11)


* fix!: Sprint 1 — stop data loss, silent failures, and unbounded writes ([#54](https://github.com/bigknoxy/HashPilot/issues/54)) ([92a70c6](https://github.com/bigknoxy/HashPilot/commit/92a70c649a9806373612e2e1b1dd56ddb578945b)), closes [#10](https://github.com/bigknoxy/HashPilot/issues/10) [#3](https://github.com/bigknoxy/HashPilot/issues/3) [#6](https://github.com/bigknoxy/HashPilot/issues/6) [#5](https://github.com/bigknoxy/HashPilot/issues/5) [#4](https://github.com/bigknoxy/HashPilot/issues/4) [#8](https://github.com/bigknoxy/HashPilot/issues/8) [#9](https://github.com/bigknoxy/HashPilot/issues/9) [#11](https://github.com/bigknoxy/HashPilot/issues/11) [#7](https://github.com/bigknoxy/HashPilot/issues/7) [#3](https://github.com/bigknoxy/HashPilot/issues/3) [#4](https://github.com/bigknoxy/HashPilot/issues/4) [#5](https://github.com/bigknoxy/HashPilot/issues/5) [#6](https://github.com/bigknoxy/HashPilot/issues/6) [#7](https://github.com/bigknoxy/HashPilot/issues/7) [#8](https://github.com/bigknoxy/HashPilot/issues/8) [#9](https://github.com/bigknoxy/HashPilot/issues/9) [#11](https://github.com/bigknoxy/HashPilot/issues/11) [#4](https://github.com/bigknoxy/HashPilot/issues/4) [#55](https://github.com/bigknoxy/HashPilot/issues/55) [#56](https://github.com/bigknoxy/HashPilot/issues/56) [#57](https://github.com/bigknoxy/HashPilot/issues/57)


### BREAKING CHANGES

* replace-hash no longer auto-recovers a stale whole-file
anchor by overwriting the file, and commands now exit non-zero on failure.
Agents should treat exit code 3 as "re-read the file and retry".
docs/ADAPTER-CONTRACT.md is updated accordingly.

Docs synced: ADAPTER-CONTRACT, ARCHITECTURE, README, CLAUDE.md, AGENTS.md,
ROADMAP.md.

## [1.5.3](https://github.com/bigknoxy/HashPilot/compare/v1.5.2...v1.5.3) (2026-06-11)


### Bug Fixes

* responsive integrations grid, add emoji favicon ([af79903](https://github.com/bigknoxy/HashPilot/commit/af79903e19446f062d64151d5176880b62712d92))

## [1.5.2](https://github.com/bigknoxy/HashPilot/compare/v1.5.1...v1.5.2) (2026-06-11)


### Bug Fixes

* mobile polish for landing page (side-scrolling, typography, layout) ([69a5558](https://github.com/bigknoxy/HashPilot/commit/69a5558d06d3355cf5afbe066ba6705eff690e7a))

## [1.5.1](https://github.com/bigknoxy/HashPilot/compare/v1.5.0...v1.5.1) (2026-06-11)


### Bug Fixes

* use agent-browser eval instead of text command for deploy verification ([ec91da2](https://github.com/bigknoxy/HashPilot/commit/ec91da2b55505583bcab50df4bf36575aa11e3cf))

# [1.5.0](https://github.com/bigknoxy/HashPilot/compare/v1.4.0...v1.5.0) (2026-06-11)


### Features

* add design doc link + docs policy to landing page index.html ([a379b9b](https://github.com/bigknoxy/HashPilot/commit/a379b9bf8716e3b7362d6870d922b83af90db57a))

# [1.4.0](https://github.com/bigknoxy/HashPilot/compare/v1.3.1...v1.4.0) (2026-06-11)


### Features

* add index.html landing page with dark-themed design ([6508323](https://github.com/bigknoxy/HashPilot/commit/650832320f5fd63b16ec791b1c8f9cda2c140d8d))

## [1.3.1](https://github.com/bigknoxy/HashPilot/compare/v1.3.0...v1.3.1) (2026-06-11)


### Bug Fixes

* restore escapeRegex function name (broken from rename-symbol test) ([3570f30](https://github.com/bigknoxy/HashPilot/commit/3570f30d26ec204421ab646aaa832078fb253d34))
* use GH_TOKEN (PAT) instead of GITHUB_TOKEN for protected branch pushes ([f576305](https://github.com/bigknoxy/HashPilot/commit/f576305d108b079b015e56e4f547f909ff464d75))

# [1.3.0](https://github.com/bigknoxy/HashPilot/compare/v1.2.1...v1.3.0) (2026-05-05)

### Features

* add intelligent editing intent engine (M5) ([2880771](https://github.com/bigknoxy/HashPilot/commit/28807711f3dd2fa814f1d36b1999466e3e2e103a))
  - Three-layer architecture: Intent Parser → Reference Discovery → Plan Executor
  - `structured-edit intent '<json>'` — one command for multi-file structured edits
  - Supports add-parameter, remove-parameter, rename-exported-symbol
  - Cross-language: TypeScript, JavaScript, Python, Go, Rust
  - Atomic execution with snapshot-based rollback on failure

### Bug Fixes

* fix single-file grep output format parsing ([2880771](https://github.com/bigknoxy/HashPilot/commit/28807711f3dd2fa814f1d36b1999466e3e2e103a))
  - ugrep single-file `line:text` format was not parsed, causing zero reference results


## [1.2.1](https://github.com/bigknoxy/HashPilot/compare/v1.2.0...v1.2.1) (2026-05-04)


### Bug Fixes

* remove dead anyFail variable in verifyChanges ([1f8704a](https://github.com/bigknoxy/HashPilot/commit/1f8704a9bbaff12136d35e26bed8cd6f6ad19b2f))

# [1.2.0](https://github.com/bigknoxy/HashPilot/compare/v1.1.0...v1.2.0) (2026-05-04)


### Features

* add batch editing for multi-file operations ([7d730a8](https://github.com/bigknoxy/HashPilot/commit/7d730a8b3958aeee44b70147f675005838e8c529))
* add unified diff engine and production telemetry ([f81f7a1](https://github.com/bigknoxy/HashPilot/commit/f81f7a1a2b1f46bdcf1a666cbfc107895163d23c))
* implement routeEdit with AST, hash, and diff dispatch ([82946c0](https://github.com/bigknoxy/HashPilot/commit/82946c00b4f485edb81841ff5646e917e5780588))
* upgrade verification pipeline with typecheck, auto-detect, and revert ([44ccf62](https://github.com/bigknoxy/HashPilot/commit/44ccf62c74cb6d9002243c9c63b4628d73a20050))

# [1.1.0](https://github.com/bigknoxy/HashPilot/compare/v1.0.0...v1.1.0) (2026-04-27)


### Features

* one-line install/uninstall and README cleanup ([3311ca8](https://github.com/bigknoxy/HashPilot/commit/3311ca8277e1ee521605c50163ae4fbf21264a80))

# 1.0.0 (2026-04-26)


### Features

* initial release of HashPilot structured editing core ([cd78ca6](https://github.com/bigknoxy/HashPilot/commit/cd78ca68276fdbfa32af910fa1a571cded3d0ea7))

# Changelog

All notable changes to this project are documented here. This file is auto-generated by [semantic-release](https://github.com/semantic-release/semantic-release).
