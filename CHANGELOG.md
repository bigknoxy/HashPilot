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
