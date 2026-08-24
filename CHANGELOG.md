## [4.5.3](https://github.com/bigknoxy/HashPilot/compare/v4.5.2...v4.5.3) (2026-08-24)


### Bug Fixes

* **ast:** emit require, not import, when add-import targets CommonJS ([#143](https://github.com/bigknoxy/HashPilot/issues/143)) ([cef0d42](https://github.com/bigknoxy/HashPilot/commit/cef0d42f4248e554db046317ed577b643ec548d1)), closes [#139](https://github.com/bigknoxy/HashPilot/issues/139) [#96](https://github.com/bigknoxy/HashPilot/issues/96) [#25](https://github.com/bigknoxy/HashPilot/issues/25) [#35](https://github.com/bigknoxy/HashPilot/issues/35) [#139](https://github.com/bigknoxy/HashPilot/issues/139)

## [4.5.2](https://github.com/bigknoxy/HashPilot/compare/v4.5.1...v4.5.2) (2026-08-20)


### Bug Fixes

* **install:** stop the doctor gate from silently aborting the installer ([#137](https://github.com/bigknoxy/HashPilot/issues/137)) ([#138](https://github.com/bigknoxy/HashPilot/issues/138)) ([f21e1ce](https://github.com/bigknoxy/HashPilot/commit/f21e1cee786ed06ba47ca72f09589bd463a7e95a)), closes [#46](https://github.com/bigknoxy/HashPilot/issues/46)

## [4.5.1](https://github.com/bigknoxy/HashPilot/compare/v4.5.0...v4.5.1) (2026-08-20)


### Bug Fixes

* **doctor:** report real health, probe parsers, and exit non-zero on failure ([#46](https://github.com/bigknoxy/HashPilot/issues/46)) ([#136](https://github.com/bigknoxy/HashPilot/issues/136)) ([b76d008](https://github.com/bigknoxy/HashPilot/commit/b76d00854f0c5d0a2697d1de1d726940083f1916))

# [4.5.0](https://github.com/bigknoxy/HashPilot/compare/v4.4.18...v4.5.0) (2026-08-20)


### Features

* **cli:** add --quiet, --verbose, and --no-color output control ([#47](https://github.com/bigknoxy/HashPilot/issues/47)) ([#134](https://github.com/bigknoxy/HashPilot/issues/134)) ([b4253e1](https://github.com/bigknoxy/HashPilot/commit/b4253e1eb93e2f6161b26432e353ac3fc89ce7ea)), closes [#132](https://github.com/bigknoxy/HashPilot/issues/132)

## [4.4.18](https://github.com/bigknoxy/HashPilot/compare/v4.4.17...v4.4.18) (2026-08-20)


### Bug Fixes

* **tests:** make smoke.sh envelope-aware and gate it in CI ([#130](https://github.com/bigknoxy/HashPilot/issues/130)) ([#131](https://github.com/bigknoxy/HashPilot/issues/131)) ([820de51](https://github.com/bigknoxy/HashPilot/commit/820de51aa11a5e480e14b92ed4a28f52925b2b50))

## [4.4.17](https://github.com/bigknoxy/HashPilot/compare/v4.4.16...v4.4.17) (2026-08-20)


### Bug Fixes

* **#49:** publish an allowlisted site to gh-pages instead of the repository root ([#128](https://github.com/bigknoxy/HashPilot/issues/128)) ([1358f8f](https://github.com/bigknoxy/HashPilot/commit/1358f8f7ddb0f62135b889180392808e48269b44)), closes [#49](https://github.com/bigknoxy/HashPilot/issues/49) [#pages](https://github.com/bigknoxy/HashPilot/issues/pages)

## [4.4.16](https://github.com/bigknoxy/HashPilot/compare/v4.4.15...v4.4.16) (2026-08-19)


### Bug Fixes

* **#50:** enforce telemetry retention automatically, report footprint, drop fixed /tmp backup path ([#127](https://github.com/bigknoxy/HashPilot/issues/127)) ([34ad3cf](https://github.com/bigknoxy/HashPilot/commit/34ad3cf9ceea6ecd62370dd96267b01ed4b81f39)), closes [#51](https://github.com/bigknoxy/HashPilot/issues/51)

## [4.4.15](https://github.com/bigknoxy/HashPilot/compare/v4.4.14...v4.4.15) (2026-08-19)


### Bug Fixes

* **#51:** clone config defaults, null-unset route overrides, resettable session, telemetry on every command ([#126](https://github.com/bigknoxy/HashPilot/issues/126)) ([a7b351c](https://github.com/bigknoxy/HashPilot/commit/a7b351c3f120bf5507dca5d5727807df09c4b01f)), closes [#51](https://github.com/bigknoxy/HashPilot/issues/51) [#51](https://github.com/bigknoxy/HashPilot/issues/51) [#40](https://github.com/bigknoxy/HashPilot/issues/40) [#105](https://github.com/bigknoxy/HashPilot/issues/105)

## [4.4.14](https://github.com/bigknoxy/HashPilot/compare/v4.4.13...v4.4.14) (2026-08-19)


### Bug Fixes

* **#57:** route Commander parse errors through the JSON usage envelope ([#123](https://github.com/bigknoxy/HashPilot/issues/123)) ([2ed0609](https://github.com/bigknoxy/HashPilot/commit/2ed06096917422407ecb0ba6f8b5334f5c858e53)), closes [#57](https://github.com/bigknoxy/HashPilot/issues/57) [#57](https://github.com/bigknoxy/HashPilot/issues/57)

## [4.4.13](https://github.com/bigknoxy/HashPilot/compare/v4.4.12...v4.4.13) (2026-08-19)


### Bug Fixes

* **#39:** bound symbol search at depth 200 and report truncation ([#122](https://github.com/bigknoxy/HashPilot/issues/122)) ([5c0d3a2](https://github.com/bigknoxy/HashPilot/commit/5c0d3a201c63b17f6359d324ddf28055948eb81b)), closes [#39](https://github.com/bigknoxy/HashPilot/issues/39) [#39](https://github.com/bigknoxy/HashPilot/issues/39)

## [4.4.12](https://github.com/bigknoxy/HashPilot/compare/v4.4.11...v4.4.12) (2026-08-19)


### Bug Fixes

* **ast:** anchor insert-before/after on declarations, not any named node ([#38](https://github.com/bigknoxy/HashPilot/issues/38)) ([#121](https://github.com/bigknoxy/HashPilot/issues/121)) ([e0a5da3](https://github.com/bigknoxy/HashPilot/commit/e0a5da3a2731a2fcfc024ef986869c65e0f7a5f1))

## [4.4.11](https://github.com/bigknoxy/HashPilot/compare/v4.4.10...v4.4.11) (2026-08-19)


### Bug Fixes

* **telemetry:** cap record size and store oversized diffs out-of-line ([#20](https://github.com/bigknoxy/HashPilot/issues/20)) ([#119](https://github.com/bigknoxy/HashPilot/issues/119)) ([c30e22d](https://github.com/bigknoxy/HashPilot/commit/c30e22dc881b4bde1b2badcb49395c3b73441e93))

## [4.4.10](https://github.com/bigknoxy/HashPilot/compare/v4.4.9...v4.4.10) (2026-08-19)


### Bug Fixes

* **diff:** refuse ambiguous fuzzy matches and report hunk placement ([#120](https://github.com/bigknoxy/HashPilot/issues/120)) ([793e649](https://github.com/bigknoxy/HashPilot/commit/793e649230892c2128731b40ad359ebd16a0e8c8)), closes [#33](https://github.com/bigknoxy/HashPilot/issues/33)

## [4.4.9](https://github.com/bigknoxy/HashPilot/compare/v4.4.8...v4.4.9) (2026-08-19)


### Bug Fixes

* **dry-run:** preview edits as a diff instead of dumping the whole file ([#98](https://github.com/bigknoxy/HashPilot/issues/98)) ([#118](https://github.com/bigknoxy/HashPilot/issues/118)) ([ef3d7ae](https://github.com/bigknoxy/HashPilot/commit/ef3d7ae1eb8d80079f415d6a0ee847e9b6649292))

## [4.4.8](https://github.com/bigknoxy/HashPilot/compare/v4.4.7...v4.4.8) (2026-08-19)


### Bug Fixes

* **hash:** newHash is the written range, so it chains without a re-read ([#117](https://github.com/bigknoxy/HashPilot/issues/117)) ([03bf296](https://github.com/bigknoxy/HashPilot/commit/03bf2960fb9e5a33d442293266b542c2d1111aca)), closes [#101](https://github.com/bigknoxy/HashPilot/issues/101)

## [4.4.7](https://github.com/bigknoxy/HashPilot/compare/v4.4.6...v4.4.7) (2026-08-19)


### Bug Fixes

* **verify:** a run with no checks is "skipped", not "pass" ([#116](https://github.com/bigknoxy/HashPilot/issues/116)) ([471b265](https://github.com/bigknoxy/HashPilot/commit/471b265de1c68804fd52789b53c9df5dc0b9cb7a)), closes [#106](https://github.com/bigknoxy/HashPilot/issues/106)

## [4.4.6](https://github.com/bigknoxy/HashPilot/compare/v4.4.5...v4.4.6) (2026-08-19)


### Bug Fixes

* **grep:** parse grep output from the search roots, report a real column ([#115](https://github.com/bigknoxy/HashPilot/issues/115)) ([946bf9f](https://github.com/bigknoxy/HashPilot/commit/946bf9fd88abc87f07ae5c27e7591e21655f15ee)), closes [#105](https://github.com/bigknoxy/HashPilot/issues/105)

## [4.4.5](https://github.com/bigknoxy/HashPilot/compare/v4.4.4...v4.4.5) (2026-08-19)


### Bug Fixes

* **mcp:** emit the full five-field envelope from every tool response ([#104](https://github.com/bigknoxy/HashPilot/issues/104)) ([#114](https://github.com/bigknoxy/HashPilot/issues/114)) ([7181ed1](https://github.com/bigknoxy/HashPilot/commit/7181ed164482a59dd99cc6383f99c8e14bcd4470))

## [4.4.4](https://github.com/bigknoxy/HashPilot/compare/v4.4.3...v4.4.4) (2026-08-19)


### Bug Fixes

* **ast:** merge add-import into an existing module import, preserve blank lines ([#103](https://github.com/bigknoxy/HashPilot/issues/103)) ([#113](https://github.com/bigknoxy/HashPilot/issues/113)) ([a6db57c](https://github.com/bigknoxy/HashPilot/commit/a6db57cbff8b649214aa0809747fc53f56daf5b6))

## [4.4.3](https://github.com/bigknoxy/HashPilot/compare/v4.4.2...v4.4.3) (2026-08-19)


### Bug Fixes

* **ast:** remove a single binding from grouped imports for TS/JS/Python/Go ([#102](https://github.com/bigknoxy/HashPilot/issues/102)) ([#112](https://github.com/bigknoxy/HashPilot/issues/112)) ([c2fc901](https://github.com/bigknoxy/HashPilot/commit/c2fc901fb71473ff20f42500b60729844d40c0ca)), closes [#103](https://github.com/bigknoxy/HashPilot/issues/103)

## [4.4.2](https://github.com/bigknoxy/HashPilot/compare/v4.4.1...v4.4.2) (2026-08-19)


### Bug Fixes

* **diff:** property-test the diff engine, add strict fuzzy-0 mode ([#31](https://github.com/bigknoxy/HashPilot/issues/31)) ([#111](https://github.com/bigknoxy/HashPilot/issues/111)) ([2ca1ba5](https://github.com/bigknoxy/HashPilot/commit/2ca1ba558954f3c87314974265d44cff96883fa5))

## [4.4.1](https://github.com/bigknoxy/HashPilot/compare/v4.4.0...v4.4.1) (2026-08-19)


### Bug Fixes

* **ast:** report 1-indexed symbol lines alongside tree-sitter rows ([#99](https://github.com/bigknoxy/HashPilot/issues/99)) ([#100](https://github.com/bigknoxy/HashPilot/issues/100)) ([1a44e47](https://github.com/bigknoxy/HashPilot/commit/1a44e4776fa47cf655c7f6861f89eaba03edd70c))

# [4.4.0](https://github.com/bigknoxy/HashPilot/compare/v4.3.2...v4.4.0) (2026-08-19)


### Features

* **bench:** add benchmark harness with silent-corruption metric ([#26](https://github.com/bigknoxy/HashPilot/issues/26)) ([#107](https://github.com/bigknoxy/HashPilot/issues/107)) ([806bd25](https://github.com/bigknoxy/HashPilot/commit/806bd250cf9c95007e96cd7ef0fc5e518cfec473)), closes [#102](https://github.com/bigknoxy/HashPilot/issues/102) [#103](https://github.com/bigknoxy/HashPilot/issues/103)

## [4.3.2](https://github.com/bigknoxy/HashPilot/compare/v4.3.1...v4.3.2) (2026-08-19)


### Bug Fixes

* **install:** stop the installer overwriting the checkout through a symlink ([#97](https://github.com/bigknoxy/HashPilot/issues/97)) ([420eac2](https://github.com/bigknoxy/HashPilot/commit/420eac2014acda62f3894e4dc5537b08f587248f)), closes [#96](https://github.com/bigknoxy/HashPilot/issues/96)

## [4.3.1](https://github.com/bigknoxy/HashPilot/compare/v4.3.0...v4.3.1) (2026-08-19)


### Bug Fixes

* **install:** put ~/.agentic-tools/bin on PATH from install-cli ([#95](https://github.com/bigknoxy/HashPilot/issues/95)) ([58ff8a1](https://github.com/bigknoxy/HashPilot/commit/58ff8a12f480453e51ed9f4424c964b15fc3e377))

# [4.3.0](https://github.com/bigknoxy/HashPilot/compare/v4.2.1...v4.3.0) (2026-08-19)


### Features

* **mcp:** expose HashPilot as an MCP server over stdio ([#25](https://github.com/bigknoxy/HashPilot/issues/25)) ([#94](https://github.com/bigknoxy/HashPilot/issues/94)) ([5073c11](https://github.com/bigknoxy/HashPilot/commit/5073c112224f2a22d48d2d4277c1fea976ffb7bd))

## [4.2.1](https://github.com/bigknoxy/HashPilot/compare/v4.2.0...v4.2.1) (2026-08-19)


### Bug Fixes

* **verify,format:** stop swallowing jest/vitest failures; fix text-mode newline ([#93](https://github.com/bigknoxy/HashPilot/issues/93)) ([f1f097b](https://github.com/bigknoxy/HashPilot/commit/f1f097ba796a2a0a543ef9c0e5edefe7a8abc69a))

# [4.2.0](https://github.com/bigknoxy/HashPilot/compare/v4.1.4...v4.2.0) (2026-08-19)


### Features

* **cli:** --format <json|text> global flag with TTY detection ([#19](https://github.com/bigknoxy/HashPilot/issues/19) B16) ([#92](https://github.com/bigknoxy/HashPilot/issues/92)) ([ebdcc3b](https://github.com/bigknoxy/HashPilot/commit/ebdcc3b5ef63f0d37ff7a1b5eac812d8e1ecf252))

## [4.1.4](https://github.com/bigknoxy/HashPilot/compare/v4.1.3...v4.1.4) (2026-08-19)


### Bug Fixes

* **intent:** resolve references with tree-sitter, not regex + isDefinitionLine ([#91](https://github.com/bigknoxy/HashPilot/issues/91)) ([c6e76b1](https://github.com/bigknoxy/HashPilot/commit/c6e76b1eb230630905110049bcf84da1b94fae3a)), closes [#15](https://github.com/bigknoxy/HashPilot/issues/15)

## [4.1.3](https://github.com/bigknoxy/HashPilot/compare/v4.1.2...v4.1.3) (2026-08-18)


### Bug Fixes

* **rename:** make rename-symbol file-scoped & binding-aware ([#14](https://github.com/bigknoxy/HashPilot/issues/14)) ([#88](https://github.com/bigknoxy/HashPilot/issues/88)) ([394fc4a](https://github.com/bigknoxy/HashPilot/commit/394fc4a0a6f19361f48b632d4548a6b7ca594ff9))

## [4.1.2](https://github.com/bigknoxy/HashPilot/compare/v4.1.1...v4.1.2) (2026-08-18)


### Bug Fixes

* **intent:** surface revertReason so the rollback decision explains WHY it fired ([#10](https://github.com/bigknoxy/HashPilot/issues/10)) ([#86](https://github.com/bigknoxy/HashPilot/issues/86)) ([edfae1d](https://github.com/bigknoxy/HashPilot/commit/edfae1dec1ae8065fd8f4ec31d61c815f4c86784))

## [4.1.1](https://github.com/bigknoxy/HashPilot/compare/v4.1.0...v4.1.1) (2026-08-18)


### Bug Fixes

* **encoding:** preserve CRLF, BOM, and trailing newlines across every edit tier ([#30](https://github.com/bigknoxy/HashPilot/issues/30)) ([bd7eb46](https://github.com/bigknoxy/HashPilot/commit/bd7eb46052ee23bf4ad26a2d7e53bd6156c34a5f))

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
