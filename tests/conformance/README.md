# Conformance Test Suite

Compares plow's dead code detection results against [knip](https://github.com/webpro-nl/knip) on 8 real-world open-source projects, producing a structured report of agreements and disagreements.

This suite is **informational** -- it does not fail on disagreements. Differences between the tools are expected due to different analysis strategies and heuristics.

## Test Projects

The same projects used by the performance benchmark suite:

| Project | Repo | Size |
|---------|------|------|
| preact | preactjs/preact | Small |
| fastify | fastify/fastify | Small |
| zod | colinhacks/zod | Small |
| vue-core | vuejs/core | Large monorepo |
| svelte | sveltejs/svelte | Large monorepo |
| query | TanStack/query | Large monorepo |
| vite | vitejs/vite | Large monorepo |
| next.js | vercel/next.js | XL monorepo |

## Prerequisites

- **plow** binary (built from this repo or in PATH)
- **Node.js** (v22+) with `npx` available
- **pnpm** (for monorepo projects)
- **Python 3** (for the comparison and aggregation logic)
- knip is installed automatically via `npx` on first run

## Running

### All projects (CI mode)

```bash
cargo build --release
./tests/conformance/run-all.sh --plow-bin ./target/release/plow

# With custom clone directory and timeout
./tests/conformance/run-all.sh \
  --plow-bin ./target/release/plow \
  --clone-dir /tmp/plow-conformance \
  --timeout 300
```

### Single project

```bash
# Against a specific project
./tests/conformance/run.sh /path/to/your/project

# With a specific plow binary
./tests/conformance/run.sh --plow-bin ./target/debug/plow
```

Both scripts output:
- **stderr**: human-readable summary with issue counts and disagreement details
- **stdout**: structured JSON report (pipe to `jq` or save to file)

```bash
# Save JSON report
./tests/conformance/run-all.sh > report.json

# Pretty-print with jq
./tests/conformance/run-all.sh 2>/dev/null | jq .
```

## Interpreting Results

The report breaks down findings into three categories:

- **Agreed**: Issues found by both plow and knip. High confidence these are real issues.
- **Plow-only**: Issues found by plow but not knip. Could be:
  - True positives that knip misses (plow wins)
  - False positives in plow (needs investigation)
- **Knip-only**: Issues found by knip but not plow. Could be:
  - True positives that plow misses (needs implementation)
  - False positives in knip (plow correctly ignores them)

The agreement percentage is calculated as `agreed / total_unique_issues * 100`.

## Issue Type Mapping

| Plow                    | Knip            |
|---------------------------|-----------------|
| `unused_files`            | `files`         |
| `unused_exports`          | `exports`       |
| `unused_types`            | `types`         |
| `unused_dependencies`     | `dependencies`  |
| `unused_dev_dependencies` | `devDependencies`|
| `unresolved_imports`      | `unresolved`    |
| `unlisted_dependencies`   | `unlisted`      |
| `duplicate_exports`       | `duplicates`    |
| `unused_enum_members`     | `enumMembers`   |
| `unused_class_members`    | `classMembers`  |

## Scripts

| Script | Purpose |
|--------|---------|
| `run.sh` | Single-project comparison (plow vs knip) |
| `run-all.sh` | Multi-project orchestrator (clone, run, aggregate) |
| `compare.py` | Normalizes and compares tool outputs for one project |
| `aggregate.py` | Combines per-project reports into overall summary |

## Aggregated JSON Report Schema

```json
{
  "summary": {
    "plow_total": 150,
    "knip_total": 120,
    "agreed": 100,
    "plow_only": 50,
    "knip_only": 20,
    "agreement_pct": 58.8
  },
  "projects": {
    "preact": { "plow_total": 10, "knip_total": 8, "agreed": 6, ... },
    "vite": { "plow_total": 20, "knip_total": 15, "agreed": 12, ... }
  },
  "by_type": {
    "unused_exports": {
      "plow_count": 50,
      "knip_count": 40,
      "agreed": 35,
      "plow_only": 15,
      "knip_only": 5,
      "agreement_pct": 63.6
    }
  }
}
```

## CI

The conformance suite runs daily via `.github/workflows/conformance.yml` and can be triggered manually. Results are posted to the GitHub Actions step summary with per-project and per-issue-type breakdowns. It never fails the CI pipeline -- it is purely informational.

Per-project agreement rates are tracked over time via benchmark-action and visible on the [metrics dashboard](https://plow-rs.github.io/plow/dev/conformance/).
