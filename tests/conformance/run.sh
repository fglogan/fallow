#!/usr/bin/env bash
set -euo pipefail

# Conformance test runner: compares plow vs knip results
#
# Usage:
#   ./run.sh [project_dir] [--plow-bin PATH]
#
# Arguments:
#   project_dir     Directory to analyze (default: fixtures/basic)
#   --plow-bin    Path to plow binary (default: searches PATH, then cargo target)
#
# Output:
#   Structured JSON report to stdout
#   Human-readable summary to stderr

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_FIXTURE="${SCRIPT_DIR}/fixtures/basic"
PLOW_BIN=""
PROJECT_DIR=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --plow-bin)
            PLOW_BIN="$2"
            shift 2
            ;;
        --plow-bin=*)
            PLOW_BIN="${1#*=}"
            shift
            ;;
        *)
            PROJECT_DIR="$1"
            shift
            ;;
    esac
done

PROJECT_DIR="${PROJECT_DIR:-${DEFAULT_FIXTURE}}"
PROJECT_DIR="$(cd "${PROJECT_DIR}" && pwd)"

# Find plow binary
if [[ -z "${PLOW_BIN}" ]]; then
    if command -v plow &>/dev/null; then
        PLOW_BIN="plow"
    else
        # Try cargo target directory
        REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
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

# Resolve to absolute path so it works after cd
if [[ "${PLOW_BIN}" != /* ]] && [[ "${PLOW_BIN}" == */* ]]; then
    PLOW_BIN="$(cd "$(dirname "${PLOW_BIN}")" && pwd)/$(basename "${PLOW_BIN}")"
fi

# Verify plow works
if ! "${PLOW_BIN}" --version &>/dev/null; then
    echo "Error: plow binary at '${PLOW_BIN}' does not work" >&2
    exit 1
fi

# Verify knip is available
if ! command -v npx &>/dev/null; then
    echo "Error: npx not found. Install Node.js to run knip" >&2
    exit 1
fi

echo "=== Conformance Test ===" >&2
echo "Project:    ${PROJECT_DIR}" >&2
echo "Plow:     ${PLOW_BIN}" >&2
echo "" >&2

# Create temp directory for outputs
TMPDIR_CONFORM="$(mktemp -d)"
trap 'rm -rf "${TMPDIR_CONFORM}"' EXIT

PLOW_OUT="${TMPDIR_CONFORM}/plow.json"
KNIP_OUT="${TMPDIR_CONFORM}/knip.json"

# Install knip locally in the project if needed (for npx to find it)
# We use npx which will auto-download if needed
echo "Running plow..." >&2
PLOW_EXIT=0
cd "${PROJECT_DIR}"
"${PLOW_BIN}" dead-code --format json > "${PLOW_OUT}" 2>/dev/null || PLOW_EXIT=$?

# plow exits 1 when issues are found (expected), 2 on error
if [[ ${PLOW_EXIT} -eq 2 ]]; then
    echo "Error: plow failed with exit code 2" >&2
    echo "Output:" >&2
    cat "${PLOW_OUT}" >&2
    exit 1
fi
echo "  plow completed (exit ${PLOW_EXIT})" >&2

echo "Running knip..." >&2
KNIP_EXIT=0
cd "${PROJECT_DIR}"

# Ensure node_modules exists for knip to analyze
if [[ ! -d "node_modules" ]]; then
    echo "  Installing node_modules for knip..." >&2
    npm install --ignore-scripts --no-audit --no-fund >/dev/null 2>/dev/null || true
fi

npx --yes knip --reporter json > "${KNIP_OUT}" 2>/dev/null || KNIP_EXIT=$?

# knip exits 1 when issues are found (expected), 2 on error
if [[ ${KNIP_EXIT} -eq 2 ]]; then
    echo "Warning: knip exited with code 2, output may be incomplete" >&2
fi
echo "  knip completed (exit ${KNIP_EXIT})" >&2

# Validate outputs are valid JSON
if ! python3 -c "import json; json.load(open('${PLOW_OUT}'))" 2>/dev/null; then
    echo "Error: plow output is not valid JSON" >&2
    echo "Content:" >&2
    head -5 "${PLOW_OUT}" >&2
    exit 1
fi

if ! python3 -c "import json; json.load(open('${KNIP_OUT}'))" 2>/dev/null; then
    echo "Error: knip output is not valid JSON" >&2
    echo "Content:" >&2
    head -5 "${KNIP_OUT}" >&2
    exit 1
fi

# Run comparison
echo "" >&2
echo "Comparing results..." >&2
REPORT="$(python3 "${SCRIPT_DIR}/compare.py" "${PLOW_OUT}" "${KNIP_OUT}" "${PROJECT_DIR}")"

# Print human summary to stderr
echo "" >&2
echo "=== Results ===" >&2
echo "${REPORT}" | python3 -c "
import json, sys
r = json.load(sys.stdin)
s = r['summary']
print(f\"  Plow found: {s['plow_total']} issues\", file=sys.stderr)
print(f\"  Knip found:   {s['knip_total']} issues\", file=sys.stderr)
print(f\"  Agreed:       {s['agreed']}\", file=sys.stderr)
print(f\"  Plow-only:  {s['plow_only']}\", file=sys.stderr)
print(f\"  Knip-only:    {s['knip_only']}\", file=sys.stderr)
print(f\"  Agreement:    {s['agreement_pct']}%\", file=sys.stderr)
print(file=sys.stderr)

if r['by_type']:
    print('  By issue type:', file=sys.stderr)
    for itype, data in sorted(r['by_type'].items()):
        print(f\"    {itype}: plow={data['plow_count']} knip={data['knip_count']} agreed={data['agreed']} ({data['agreement_pct']}%)\", file=sys.stderr)

if r['details']['plow_only']:
    print(file=sys.stderr)
    print('  Plow-only findings:', file=sys.stderr)
    for d in r['details']['plow_only']:
        name_part = f\" ({d['name']})\" if d['name'] else ''
        print(f\"    [{d['type']}] {d['file']}{name_part}\", file=sys.stderr)

if r['details']['knip_only']:
    print(file=sys.stderr)
    print('  Knip-only findings:', file=sys.stderr)
    for d in r['details']['knip_only']:
        name_part = f\" ({d['name']})\" if d['name'] else ''
        print(f\"    [{d['type']}] {d['file']}{name_part}\", file=sys.stderr)
"

# Print JSON report to stdout
echo "${REPORT}"
