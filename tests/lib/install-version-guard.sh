#!/usr/bin/env bash
# Assert that a packaged install actually contains the branch under test.
#
# #202: the smoke test's npm-path scenario installed `@latest` from the real
# registry. On an unpublished branch that resolves to the *previously
# published* release, so the check passed while validating code the branch
# had never shipped — which is how v4.8.2's install-path break (D007/D010)
# reached npm with main's CI green.
#
# A passing install is not evidence that the thing being installed is the
# thing under test. This guard is the post-check that makes that visible.
#
# Usage: assert_installed_version_matches <install_root> <expected_version>
# Exits 0 on a match; non-zero with a diagnostic on stderr otherwise.
# Fails closed: a missing or unreadable manifest is a failure, never a pass.

assert_installed_version_matches() {
  local install_root="$1" expected="$2" manifest actual

  if [ -z "$install_root" ] || [ -z "$expected" ]; then
    echo "assert_installed_version_matches: usage: <install_root> <expected_version>" >&2
    return 2
  fi

  manifest="$install_root/package.json"
  if [ ! -f "$manifest" ]; then
    echo "install has no package.json at $manifest — cannot confirm which release was installed (testing the wrong release is not a pass)" >&2
    return 1
  fi

  # Deliberately the same extraction install.sh's `json_field` performs: a
  # non-greedy first match on `"version"` followed by its string value. The
  # tempting `s/.*"version"...` form has a greedy `.*` and takes the LAST match
  # on the line instead — on a single-line manifest that is a dependency's
  # version, so the guard would compare the wrong field and report a
  # mismatch for a correctly installed release (or, inverted, pass on a
  # wrong one). Matching install.sh byte for byte is what keeps the two from
  # ever disagreeing about what "the installed version" means.
  actual=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$manifest" 2>/dev/null | head -1 \
    | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
  if [ -z "$actual" ]; then
    echo "installed package.json at $manifest is unreadable or has no version field — cannot confirm which release was installed" >&2
    return 1
  fi

  if [ "$actual" != "$expected" ]; then
    echo "installed version $actual != branch version $expected — testing the wrong release" >&2
    return 1
  fi

  return 0
}
