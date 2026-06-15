#!/usr/bin/env bash
set -euo pipefail

# Conformance fixture verifier: runs plow dead-code on each fixture and
# compares the JSON output against the expected.json file.
#
# Usage:
#   ./verify-fixtures.sh [--plow-bin PATH]
#
# Each fixture directory must contain:
#   - package.json (and source files)
#   - expected.json with the subset of fields to verify
#
# The comparison checks:
#   - total_issues count
#   - Exact match on (path, export_name) tuples for each issue type
#   - Circular dependency chain files and lengths
#   - Duplicate export names and locations
#
# Only fixtures with expected.json are tested (the original "basic" fixture
# is a plow-vs-knip comparison, not a self-contained expectation test).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FIXTURES_DIR="${SCRIPT_DIR}/fixtures"
PLOW_BIN=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --plow-bin)   PLOW_BIN="$2";  shift 2 ;;
        --plow-bin=*) PLOW_BIN="${1#*=}"; shift ;;
        *) echo "Unknown argument: $1" >&2; exit 1 ;;
    esac
done

# Find plow binary
if [[ -z "${PLOW_BIN}" ]]; then
    if command -v plow &>/dev/null; then
        PLOW_BIN="plow"
    else
        for candidate in \
            "${REPO_ROOT}/target/release/plow" \
            "${REPO_ROOT}/target/debug/plow"; do
            if [[ -x "${candidate}" ]]; then
                PLOW_BIN="${candidate}"
                break
            fi
        done
    fi
fi

if [[ -z "${PLOW_BIN}" ]]; then
    echo "Error: plow binary not found. Build with 'cargo build' or pass --plow-bin PATH" >&2
    exit 1
fi

# Resolve to absolute path
if [[ "${PLOW_BIN}" != /* ]] && [[ "${PLOW_BIN}" == */* ]]; then
    PLOW_BIN="$(cd "$(dirname "${PLOW_BIN}")" && pwd)/$(basename "${PLOW_BIN}")"
fi

if ! "${PLOW_BIN}" --version &>/dev/null; then
    echo "Error: plow binary at '${PLOW_BIN}' does not work" >&2
    exit 1
fi

echo "=== Conformance Fixture Verification ===" >&2
echo "Plow: ${PLOW_BIN}" >&2
echo "" >&2

passed=0
failed=0
skipped=0
failures=()

for fixture_dir in "${FIXTURES_DIR}"/*/; do
    fixture_name="$(basename "${fixture_dir}")"
    expected_file="${fixture_dir}/expected.json"

    # Skip fixtures without expected.json
    if [[ ! -f "${expected_file}" ]]; then
        skipped=$((skipped + 1))
        continue
    fi

    echo -n "  ${fixture_name} ... " >&2

    # Run plow
    actual_file="$(mktemp)"
    plow_exit=0
    cd "${fixture_dir}"
    "${PLOW_BIN}" check --format json > "${actual_file}" 2>/dev/null || plow_exit=$?

    # Exit 1 = issues found (expected), exit 2 = error
    if [[ ${plow_exit} -ge 2 ]]; then
        echo "ERROR (plow exit ${plow_exit})" >&2
        failed=$((failed + 1))
        failures+=("${fixture_name}: plow error (exit ${plow_exit})")
        rm -f "${actual_file}"
        continue
    fi

    # Compare using Python
    result="$(python3 "${SCRIPT_DIR}/verify-expected.py" "${actual_file}" "${expected_file}" 2>&1)" || true

    if echo "${result}" | grep -q "^PASS$"; then
        echo "PASS" >&2
        passed=$((passed + 1))
    else
        echo "FAIL" >&2
        echo "${result}" | sed 's/^/    /' >&2
        failed=$((failed + 1))
        failures+=("${fixture_name}")
    fi

    rm -f "${actual_file}"
done

echo "" >&2
echo "=== Results ===" >&2
echo "  Passed:  ${passed}" >&2
echo "  Failed:  ${failed}" >&2
echo "  Skipped: ${skipped}" >&2

if [[ ${#failures[@]} -gt 0 ]]; then
    echo "" >&2
    echo "  Failed fixtures:" >&2
    for f in "${failures[@]}"; do
        echo "    - ${f}" >&2
    done
fi

if [[ ${failed} -gt 0 ]]; then
    exit 1
fi
