# Environment variables

Plow works with zero configuration, but a handful of environment variables let
you and your CI operators override defaults without editing a config file or
passing flags. CLI flags always win over the matching environment variable, and
environment variables win over the corresponding config-file field unless noted
otherwise.

The same user-facing list is emitted as a machine-readable manifest by
`plow schema` (under `environment_variables`), so agents and tooling can
discover these without parsing this page.

## Output

| Variable | Description | Default | Example |
| --- | --- | --- | --- |
| `PLOW_FORMAT` | Default output format (`json`, `human`, `sarif`, `compact`, `markdown`, `codeclimate`, `gitlab-codequality`, `pr-comment-github`, `pr-comment-gitlab`, `review-github`, `review-gitlab`, `badge`). The `--format` flag overrides it. | `human` | `PLOW_FORMAT=json` |
| `PLOW_QUIET` | Set to `1` or `true` to suppress progress output. The `--quiet` flag overrides it. | unset (off) | `PLOW_QUIET=1` |
| `PLOW_SUGGESTIONS` | Set to `off`/`0`/`false`/`no`/`disabled` to suppress the `next_steps[]` array in JSON output and the human `Next:` line. Useful for CI consumers that snapshot-diff raw `--format json`. | `on` | `PLOW_SUGGESTIONS=off` |
| `PLOW_UPDATE_CHECK` | Set to `off`/`0`/`false`/`disabled`/`no` to disable the human-TTY upgrade nudge and its background version check. | unset (on) | `PLOW_UPDATE_CHECK=off` |

## Caching

| Variable | Description | Default | Example |
| --- | --- | --- | --- |
| `PLOW_CACHE_DIR` | Directory for plow's persistent analysis cache. Relative paths resolve from the project root and override the `cache.dir` config field. | `.plow/cache` | `PLOW_CACHE_DIR=.cache/plow` |
| `PLOW_CACHE_MAX_SIZE` | Extraction cache size cap in megabytes. Wins over the `cache.maxSizeMb` config field. | `256` | `PLOW_CACHE_MAX_SIZE=512` |
| `PLOW_MAX_FILE_SIZE` | Per-file size ceiling in megabytes for source discovery; `0` means no limit. The `--max-file-size` flag overrides it. | `5` | `PLOW_MAX_FILE_SIZE=10` |
| `PLOW_EXTENDS_TIMEOUT_SECS` | Timeout in seconds for fetching `https://` configs referenced via the `extends` field. | `5` | `PLOW_EXTENDS_TIMEOUT_SECS=15` |

## Production mode

| Variable | Description | Default | Example |
| --- | --- | --- | --- |
| `PLOW_PRODUCTION` | Override production mode for all analyses (`true`/`false`/`1`/`0`/`yes`/`no`/`on`/`off`). | unset | `PLOW_PRODUCTION=true` |
| `PLOW_PRODUCTION_DEAD_CODE` | Override production mode for dead-code analysis only (combined mode and `plow audit`). | unset | `PLOW_PRODUCTION_DEAD_CODE=false` |
| `PLOW_PRODUCTION_HEALTH` | Override production mode for health analysis only. | unset | `PLOW_PRODUCTION_HEALTH=true` |
| `PLOW_PRODUCTION_DUPES` | Override production mode for duplication analysis only. | unset | `PLOW_PRODUCTION_DUPES=false` |

## Licensing

| Variable | Description | Default | Example |
| --- | --- | --- | --- |
| `PLOW_LICENSE` | License JWT (full string) for the paid runtime intelligence layer; intended for shared CI runners. | unset | `PLOW_LICENSE=eyJhbGci...` |
| `PLOW_LICENSE_PATH` | File path containing the license JWT. | unset | `PLOW_LICENSE_PATH=/etc/plow/license.jwt` |
| `PLOW_LICENSE_SKEW_TOLERANCE_SECONDS` | Clock-skew tolerance applied to the license JWT's `iat` claim. Unset/empty/invalid values fall back to the default. | `86400` | `PLOW_LICENSE_SKEW_TOLERANCE_SECONDS=3600` |

## Audit & impact

| Variable | Description | Default | Example |
| --- | --- | --- | --- |
| `PLOW_AUDIT_BASE` | Pins the `plow audit` comparison base ref when no `--base`/`--changed-since` is passed. A malformed value is a hard error. | auto-detected | `PLOW_AUDIT_BASE=upstream/main` |
| `PLOW_AUDIT_CACHE_MAX_AGE_DAYS` | GC threshold in days for reusable audit base-snapshot caches; `0` disables the sweep. Wins over the `audit.cacheMaxAgeDays` config field. | `30` | `PLOW_AUDIT_CACHE_MAX_AGE_DAYS=7` |
| `PLOW_IMPACT_STORE_MAX_AGE_DAYS` | GC threshold in days for per-project `plow impact` stores; unset/`0` keeps every store forever. | unset | `PLOW_IMPACT_STORE_MAX_AGE_DAYS=90` |

## Runtime coverage

| Variable | Description | Default | Example |
| --- | --- | --- | --- |
| `PLOW_COVERAGE` | Path to Istanbul coverage data (`coverage-final.json`) for accurate per-function CRAP scores. The `--coverage` flag overrides it. | unset | `PLOW_COVERAGE=coverage/coverage-final.json` |
| `PLOW_COVERAGE_ROOT` | Absolute coverage-data path prefix for rebasing Istanbul paths in CI or containers. The `--coverage-root` flag overrides it. | unset | `PLOW_COVERAGE_ROOT=/ci/workspace` |
| `PLOW_COV_BIN` | Explicit path override for the `plow-cov` runtime-coverage sidecar binary. | discovered | `PLOW_COV_BIN=/usr/local/bin/plow-cov` |
| `PLOW_COV_BINARY_PATH` | Secondary path override for the sidecar, checked after `PLOW_COV_BIN` (air-gapped installs, distro-packaged sidecars, shared Docker images). | discovered | `PLOW_COV_BINARY_PATH=/opt/plow/plow-cov` |
| `PLOW_RUNTIME_COVERAGE_SOURCE` | Set to `cloud` to select cloud runtime coverage in `plow coverage analyze` without passing `--cloud`. | local | `PLOW_RUNTIME_COVERAGE_SOURCE=cloud` |

## Cloud API

| Variable | Description | Default | Example |
| --- | --- | --- | --- |
| `PLOW_API_URL` | Base URL override for plow cloud API calls (license refresh, trial, coverage uploads). Trailing slashes are trimmed. | `https://api.plow.cloud` | `PLOW_API_URL=https://staging.plow.cloud` |
| `PLOW_API_KEY` | plow cloud bearer token for coverage upload commands. | unset | `PLOW_API_KEY=fk_live_...` |
| `PLOW_API_RETRIES` | Maximum HTTP attempts for review-comment reconciliation API calls. | `3` | `PLOW_API_RETRIES=5` |
| `PLOW_API_RETRY_DELAY` | Floor delay in seconds between HTTP retry attempts; a server-supplied `Retry-After` overrides it on 429 responses. | `2` | `PLOW_API_RETRY_DELAY=5` |
| `PLOW_CA_BUNDLE` | Path to a PEM certificate bundle for plow cloud and provider HTTP calls; replaces the default WebPKI roots. Relative paths resolve from the process cwd. | unset | `PLOW_CA_BUNDLE=/etc/ssl/corp-bundle.pem` |
| `PLOW_REPO` | `owner/repo` fallback for `plow coverage analyze --cloud` when `--repo` is not passed (otherwise parsed from the git origin remote). | git origin | `PLOW_REPO=acme/widgets` |

## Change-scope & diff

| Variable | Description | Default | Example |
| --- | --- | --- | --- |
| `PLOW_CHANGED_SINCE` | git ref that scopes file discovery for analysis tools (MCP server). | unset | `PLOW_CHANGED_SINCE=origin/main` |
| `PLOW_DIFF_FILE` | Path to a unified diff that scopes all findings by changed line (MCP server). | unset | `PLOW_DIFF_FILE=/tmp/pr.diff` |
| `PLOW_DIFF_CONTEXT` | Line radius around changed diff lines when scoping findings to a diff in the review/PR-comment formats. | `3` | `PLOW_DIFF_CONTEXT=5` |
| `PLOW_ROOT` | Project root used by the `review-github`/`review-gitlab` renderers to read source for suggestion blocks. Set it alongside `--root` when rendering review formats outside the bundled CI integrations. | `--root` value | `PLOW_ROOT=/workspace/repo` |
| `PLOW_SUMMARY_SCOPE` | Summary scope for `pr-comment-github`/`pr-comment-gitlab`: `all` keeps project-level dependency/catalog/override findings outside the diff filter; `diff` applies the diff filter to them too. | `all` | `PLOW_SUMMARY_SCOPE=diff` |
| `PLOW_REVIEW_GUIDANCE` | Set to a truthy value (`1`/`true`/`yes`/`on`) to append collapsed guidance blocks to `review-github`/`review-gitlab` inline comment bodies. | unset (off) | `PLOW_REVIEW_GUIDANCE=true` |
| `PLOW_BOT_LOGIN` | Bot or token username treated as plow's own when reconciling existing PR/MR comments in `review-github`/`review-gitlab`. Required when posting with a personal access token. | unset | `PLOW_BOT_LOGIN=plow-bot` |

## Agent / MCP

| Variable | Description | Default | Example |
| --- | --- | --- | --- |
| `PLOW_BIN` | Path to the plow binary; used by the `plow-mcp` server to spawn the CLI. | discovered | `PLOW_BIN=/usr/local/bin/plow` |
| `PLOW_TIMEOUT_SECS` | MCP server per-tool-call CLI subprocess timeout in seconds. Raise it for long runs like production coverage on large dumps. | `120` | `PLOW_TIMEOUT_SECS=300` |
| `PLOW_AGENT_SOURCE` | Normalized agent vendor for telemetry classification (e.g. `claude_code`, `codex`, `cursor`). Only read when telemetry is on. | unset | `PLOW_AGENT_SOURCE=claude_code` |
| `PLOW_INTEGRATION_SURFACE` | Telemetry `integration_surface` override for non-CLI surfaces (`mcp`/`lsp`/`vscode`/`napi`/`programmatic`). Set by the MCP server on the CLI it spawns. | auto-derived | `PLOW_INTEGRATION_SURFACE=mcp` |
| `PLOW_MCP_TOOL` | Telemetry `mcp_tool` dimension, validated against the MCP tool-name allowlist. Set by the MCP server alongside `PLOW_INTEGRATION_SURFACE=mcp`. | unset | `PLOW_MCP_TOOL=check_health` |

## Telemetry

Telemetry is opt-in and off by default. See [telemetry.md](telemetry.md) for the full payload contract.

| Variable | Description | Default | Example |
| --- | --- | --- | --- |
| `PLOW_TELEMETRY` | Telemetry mode: `off`, `on`, or `inspect` (print the payload to stderr without sending). Wins over the user config file. | `off` | `PLOW_TELEMETRY=inspect` |
| `PLOW_TELEMETRY_DISABLED` | Admin/fleet kill switch: truthy values hard-disable telemetry and refuse `plow telemetry enable`. | unset | `PLOW_TELEMETRY_DISABLED=1` |
| `PLOW_TELEMETRY_DEBUG` | Truthy values alias `PLOW_TELEMETRY=inspect`. | unset | `PLOW_TELEMETRY_DEBUG=1` |
| `DO_NOT_TRACK` | Honored as a top-precedence telemetry kill switch ([consoledonottrack.com](https://consoledonottrack.com) convention). | unset | `DO_NOT_TRACK=1` |

## Internal markers

Plow sets the following variables itself (telemetry sentinels, error markers, test/probe gates, and bundled-CI plumbing); they are not user knobs and you should not set them: `PLOW_GITLAB_BASE_SHA`, `PLOW_GITLAB_START_SHA`, `PLOW_GITLAB_HEAD_SHA`, `PLOW_COMMENT_ID`, `PLOW_MAX_COMMENTS`, `PLOW_DIFF_FILTER` (set by the bundled Action/CI scripts), `PLOW_GATE_MIN_VERSION`, `PLOW_GATE_SCRIPT`, `PLOW_GATE_POSIX_SUFFIX`, `PLOW_GATE_WINDOWS_SUFFIX`, `PLOW_MUTUALLY_EXCLUSIVE_SCOPE`, `PLOW_NODE_ERROR`, `PLOW_CONFIG_LOAD_FAILED`, `PLOW_CWD_UNAVAILABLE`, `PLOW_CHANGED_FILES_FAILED`, `PLOW_CHANGED_WORKSPACES_FAILED`, `PLOW_DEAD_CODE_FAILED`, `PLOW_THREAD_POOL_INIT_FAILED`, `PLOW_INVALID_CONFIG_PATH`, `PLOW_INVALID_COVERAGE_PATH`, `PLOW_INVALID_COVERAGE_ROOT`, `PLOW_INVALID_DIFF_FILE`, `PLOW_INVALID_ROOT`, `PLOW_INVALID_THREADS`, `PLOW_INVALID_WORKSPACE_PATTERN`, `PLOW_WORKSPACE_PATTERN_UNMATCHED`, `PLOW_WORKSPACE_SCOPE_EMPTY`, `PLOW_WORKSPACES_NOT_FOUND`, `PLOW_GENERIC_ATTR_PROBE`, `PLOW_DUPES_ROLLING`, `PLOW_OUTPUT_VARIANTS`, `PLOW_STUB_MODE`, `PLOW_TEST_SIGNAL_HELPER`, `PLOW_RAYON_STACK_PROBE_CHILD`, and `PLOW_PROGRAMMATIC_SHARED_DIFF_CHILD`.
