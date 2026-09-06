# Decision Records

Each record captures a non-obvious behavior decision: what we chose, why, and what
the alternative was. Decisions are immutable once written — if we reverse one,
write a new record that supersedes it.

Format:

```
## D001: <title>

- **Date:** YYYY-MM-DD
- **PR:** #NNN (or "initial" / "internal")
- **Context:** <what triggered this decision>
- **Decision:** <what we chose>
- **Alternatives considered:** <what we rejected and why>
- **Consequences:** <what this enables / prevents>
```

## D001: engine="off" returns empty results, not grep fallback

- **Date:** 2026-09-04
- **PR:** #197
- **Context:** The `search` command's `--engine off` option originally fell through to the grep engine as a "robust" default. This violates user intent: "off" semantically means disabled.
- **Decision:** `engine="off"` returns `{ engine: "off", hits: [], degraded: false }` without spawning any search process.
- **Alternatives considered:** (1) grep fallback — rejected because it's misleading; users set `off` to skip search entirely (e.g. when piping into another tool). (2) error — rejected because "off" is a valid configuration, not an error condition.
- **Consequences:** Tests must assert empty results for `engine=off`, not "some results." Any code that depends on `search` always returning hits must handle the empty case.

## D002: matchesSource uses basename last-dot for extension matching

- **Date:** 2026-09-04
- **PR:** #197
- **Context:** `matchesSource("foo.ats", ["*.ts"])` was returning `true` because the naive `endsWith(".ts")` matched the `.ts` inside `.ats`. This is wrong: `*.ts` means files whose extension is `.ts`, not files whose name contains `.ts`.
- **Decision:** Extract the basename, find the last `.`, and compare only the suffix after that dot. `path.extname`-equivalent: `basename.slice(lastDotIndex)`.
- **Alternatives considered:** (1) `endsWith()` — rejected: matches `foo.ats` for `*.ts`. (2) regex with word boundary — rejected: overkill, and `foo_bar.ts` has no word boundary before `.ts`. (3) segment-split on `/` then check — equivalent to basename approach but more code.
- **Consequences:** `matchesSource` is exported from `src/core/index.ts`. Any glob pattern that isn't `*.ext` form falls back to `micromatch` (existing behavior).

## D003: search adapter spawns `zg query <q>`, not `zg <q>`

- **Date:** 2026-09-04
- **PR:** #197
- **Context:** The zg CLI treats its first positional argument as a subcommand (`query`, `index`, `info`, etc.). Passing `zg "<query text>"` caused zg to interpret the query as a subcommand and exit with code 1.
- **Decision:** Always pass `["query", query, ...]` as the spawn args to zg.
- **Alternatives considered:** None — this is the documented zg CLI interface.
- **Consequences:** The fake-zg fixture must accept both `zg <q>` and `zg query <q>` for backward compatibility with any test that doesn't go through the adapter.

## D004: runZg returns structured diagnostics, not just exit code

- **Date:** 2026-09-04
- **PR:** #197
- **Context:** When zg failed to spawn (EACCES, not found), the catch block returned `code: null`, which hit the `code !== 0` branch and produced a misleading "zg exited unsuccessfully" error with no actionable detail.
- **Decision:** `runZg` returns a `ZgProcessResult` with separate `timedOut` and `spawnError` fields. The caller checks spawn errors first, then timeouts, then non-zero exits, then parses output.
- **Alternatives considered:** (1) throw on spawn error — rejected: the search command should return a structured error, not crash. (2) single `error` field — rejected: timeout and spawn-failure require different recovery paths.
- **Consequences:** `SEARCH_FAILED` errors now include actionable diagnostics (`spawnError`, `timedOut`, or `stderr`). Exit-1 with no stderr (ripgrep-style "no matches") returns empty hits, not an error.

## D005: release.yml keeps GH_TOKEN (PAT) — GITHUB_TOKEN can't trigger downstream workflows

- **Date:** 2026-09-05
- **PR:** #199
- **Context:** Audit finding B70 recommended switching all `secrets.GH_TOKEN` references to `secrets.GITHUB_TOKEN`. The default `GITHUB_TOKEN` is minted per-run, scoped, and auto-expires — strictly better for security. However, GitHub's design prevents `GITHUB_TOKEN` from triggering downstream workflows (to avoid recursive runs). semantic-release's `prepare` phase pushes a version-bump commit to `main`, which must trigger the `gh-pages` workflow. With `GITHUB_TOKEN`, that push is invisible to GitHub's event system.
- **Decision:** Keep `GH_TOKEN` in `release.yml` (lines 110, 137). Switch `gh-pages.yml` to `GITHUB_TOKEN` since it doesn't need to trigger further workflows.
- **Alternatives considered:** (1) Switch everything to `GITHUB_TOKEN` — rejected: gh-pages deploy would never trigger after a release. (2) Use `workflow_dispatch` trigger instead — rejected: adds latency and requires a separate orchestration step. (3) Use `workflow_run` trigger — rejected: only fires after the triggering workflow completes, which is too late for the current architecture.
- **Consequences:** The release workflow retains a PAT with broader scope than ideal. Mitigation: the PAT should be scoped to the minimum permissions (just `contents: write` for the repo). Regular rotation recommended.

## D006: Pin third-party actions by commit SHA, not tag

- **Date:** 2026-09-05
- **PR:** #199
- **Context:** Audit finding B71 flagged `peaceiris/actions-gh-pages@v4` as a floating tag. The action is handed a write-capable token. A compromised `v4` tag could push malicious content to `gh-pages`.
- **Decision:** Pin `peaceiris/actions-gh-pages` to commit SHA `329bcc8f12caed2cefe5a5b80781499a6f3b361b` (the `v4` tag at time of pinning). First-party `actions/*` actions (checkout, setup-node, setup-bun) remain on major-version tags — these are GitHub-maintained with strong supply-chain controls and the SHA would need updating on every minor/patch bump.
- **Alternatives considered:** (1) Pin all actions by SHA — rejected: first-party actions update frequently and pinning creates maintenance burden with no meaningful security gain (GitHub controls both the actions and the runner). (2) Use `actions/checkout` pinned — not done, same reason.
- **Consequences:** Third-party action pinned; any tag mutation is blocked. First-party actions on tags will auto-update within major versions. Record the SHA in the comment for traceability.

## D007: Pin agent-browser to exact version in CI

- **Date:** 2026-09-05
- **PR:** #199
- **Context:** Audit finding B69 flagged `npm install -g agent-browser` with no version pin. The job holds `contents: write`. A compromised `agent-browser` package would execute with write access to `gh-pages`.
- **Decision:** Pin to `agent-browser@0.36.0` (current latest). Add comment documenting the pin rationale.
- **Alternatives considered:** (1) Remove agent-browser entirely — rejected: it provides real deploy verification. (2) Add npm integrity check — rejected: npm's `--ignore-scripts` would break agent-browser's `install` step; checksum verification requires custom tooling. Version pin + review on updates is the practical baseline.
- **Consequences:** Supply-chain attack window reduced from "any future version" to "only 0.36.0". Version bumps must be deliberate and reviewed.

## D008: Ship bun.lock in npm package for frozen-lockfile installs

- **Date:** 2026-09-05
- **PR:** #199
- **Context:** Audit finding B79 noted that npm-sourced installs resolve dependencies fresh (`bun install --production`) instead of using `--frozen-lockfile`, since the npm tarball didn't include `bun.lock`. This means transitive deps could differ from what CI tested.
- **Decision:** Add `bun.lock` to `package.json`'s `files` array so it ships in the npm tarball. The existing `install.sh` logic already uses `--frozen-lockfile` when `bun.lock` is present.
- **Alternatives considered:** (1) Generate a lockfile during install — rejected: defeats the purpose of pinning. (2) Keep `bun.lock` out and accept fresh resolution — rejected: supply-chain pinning gap.
- **Consequences:** npm-installed packages now include `bun.lock` and install with `--frozen-lockfile`. The npm package size increases slightly. The `else` branch in `install.sh` (lines 423-432) becomes unreachable for current npm installs but is kept as a safe fallback.

## D010: npm-sourced installs with a shipped bun.lock use --frozen-lockfile --production

- **Date:** 2026-09-06
- **PR:** hotfix (after v4.8.2)
- **Context:** v4.8.2 shipped broken for the **default npm install path**. D007 (#199) added `bun.lock` to the npm package's `files`; the dependency-mode guard from #194 treated `NPM_INSTALLED=true && bun.lock present` as a fatal ("refusing to guess which dependency mode is correct"). D007 made that guard's fire-branch the *normal* case, so every fresh npm install of v4.8.2 aborted before installing dependencies. The bug passed CI because smoke installs from `@latest` npm — main's run predated the semantic-release publish and tested 4.8.1 (no lockfile); the breakage only surfaced once v4.8.2 reached the registry.
- **Decision:** The dependency-mode decision now keys off `$NPM_INSTALLED`, not a bare lockfile-presence check. npm source + shipped lock → `bun install --frozen-lockfile --production` (pinned, devDeps skipped). npm source, no lock → `--production` (legacy). git/local + lock → `--frozen-lockfile` (dev wants devDeps). git/local, no lock → hard error (unchanged).
- **Alternatives considered:** (1) Revert D007 (don't ship bun.lock) — rejected: pinning transitive deps is the correct supply-chain posture; the packaging was not the flaw, the mode-selector was. (2) Remove the #194 guard entirely and let the old `[ -f bun.lock ]` branch run plain `--frozen-lockfile` — rejected: that would pull devDependencies (semantic-release) into npm installs, breaking the smoke's devDep-exclusion assertion and bloating user installs.
- **Consequences:** npm-installed packages are pinned to the shipped lockfile while still skipping devDeps. **Coverage hole identified:** smoke's npm-path test installs `@latest` (published version), so an unpublished PR branch is never validated against its own packed tarball — add a version-consistency guard so "testing the wrong release" is loud, not silent.
