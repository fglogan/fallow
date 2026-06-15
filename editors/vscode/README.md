# Plow for VS Code

Codebase intelligence for TypeScript and JavaScript. Real-time diagnostics for unused code, duplication, circular dependencies, complexity hotspots, and architecture drift, with optional runtime evidence via Plow Runtime. Powered by [plow](https://docs.genesis-plow.dev), Rust-native and sub-second.

## Features

- **Real-time diagnostics** via the plow LSP server: unused files, exports, types, dependencies, enum/class members, unresolved imports, unlisted deps, duplicate exports, circular dependencies, and code duplication
- **Quick-fix code actions**: remove unused exports, delete unused files
- **Refactor code actions**: extract duplicate code into a shared function
- **Code Lens**: reference counts above each export declaration with click-to-navigate (opens Peek References panel)
- **Hover information**: export usage status, unused status, and duplicate block locations
- **Tree views**: browse unused code by issue type and duplicates by clone family in the sidebar
- **Health view**: project health score and grade, complexity findings (click to open `file:line`), plus churn-and-complexity hotspot candidates and refactoring candidates (framed as heuristics to verify, not facts). Runs a separate, lazy `plow health` analysis only when the view is first opened, so it never slows the editor or the other views.
- **Security Candidates view** (opt-in): surfaces local `client-server-leak` and tainted-sink CWE findings from `plow security` as UNVERIFIED candidates for you or an AI agent to verify, never confirmed vulnerabilities. Off by default; enabling it runs a separate `plow security` scan only when the view is opened, so it never slows the editor or the other views.
- **Runtime Coverage view**: point Plow at a local runtime-coverage capture to see hot paths and cleanup candidates (safe-to-delete and review-required), framed as candidates to verify, not facts. Local-only and offline (cloud/continuous monitoring is never invoked). Requires the plow-cov sidecar (and a runtime-coverage license or trial when a license is present): run `plow coverage setup` first. Loads only when you point it at a capture, so it never slows the editor or the other views.
- **Status bar**: see total issue count and duplication percentage at a glance, with an optional health score/grade segment (e.g. `health: B (82)`)
- **Audit verdict status bar** (on by default): run `Plow: Audit Changed Files` to get a pass/warn/fail verdict for your current change set, shown in a dedicated status-bar item with a gating-candidate count and a per-category tooltip breakdown. Opt into re-running it on every JS/TS save with `plow.audit.runOnSave`. The verdict is the CLI's own gate result; findings are static candidates to verify.
- **License management**: activate, refresh, or deactivate a Plow license without leaving the editor, with an optional status-bar indicator showing your tier and expiry. The activation token travels only via the CLI's stdin (never the command line), and the indicator probes status passively, so it never blocks startup.
- **Auto-fix**: remove unused exports, dependencies, and enum members with one command
- **Auto-download**: the extension downloads managed `plow-lsp` and `plow` CLI binaries automatically

## Installation

### From the Marketplace

Search for "Plow" in the VS Code extensions panel, or install from the command line:

```sh
code --install-extension plow-rs.plow-vscode
```

### Manual

1. Install the `plow` npm package or the standalone `plow` / `plow-lsp` binaries (see [plow installation](https://docs.genesis-plow.dev/installation))
2. Install the extension VSIX file: `code --install-extension plow-vscode-*.vsix`

## Commands

| Command | Description |
|---------|-------------|
| `Plow: Run Analysis` | Run full codebase analysis and update tree views. Clean runs show a scoped JS/TS summary and link to the Plow output channel. |
| `Plow: Audit Changed Files` | Audit the current change set for a pass/warn/fail verdict, shown in the audit verdict status-bar item (or an information message when that item is disabled). Findings are static candidates to verify. |
| `Plow: Reload Health` | Re-run the Health view analysis (score, complexity, hotspot and refactoring candidates) |
| `Plow: Scan for Security Candidates` | Scan for local security candidates (`client-server-leak`, tainted-sink CWE findings) and populate the Security Candidates view. Requires `plow.security.enabled`. Results are UNVERIFIED candidates to verify, never confirmed vulnerabilities. |
| `Plow: Load Runtime Coverage` | Analyze a local runtime-coverage capture and populate the Runtime Coverage view with hot paths and cleanup candidates. Prompts for a capture when `plow.coverage.capturePath` is empty. Requires the plow-cov sidecar (`plow coverage setup`). |
| `Plow: Reload Runtime Coverage` | Re-run the runtime-coverage analysis against the current capture |
| `Plow: Clear Runtime Coverage` | Clear the Runtime Coverage view back to its empty state |
| `Plow: Auto-Fix Unused Exports & Dependencies` | Remove unused exports and dependencies |
| `Plow: Preview Fixes (Dry Run)` | Show what fixes would be applied without changing files |
| `Plow: Restart Language Server` | Restart the plow-lsp process |
| `Plow: Show Output Channel` | Open the Plow output panel for debugging |
| `Plow: Toggle Mute Code-Duplication Findings` | Hide or restore Plow's duplicate-code squiggles in the editor |
| `Plow: Toggle Mute All Findings` | Hide or restore every Plow finding in the editor |
| `Plow: Manage Diagnostic Mutes...` | Multi-select picker for individual categories |
| `Plow: Show All Findings (Clear Mutes)` | Reset all editor mutes |
| `Plow: Activate License` | Activate a Plow license by pasting a token, picking a file, or starting a 30-day trial. The token is passed to the CLI via stdin, never on the command line. |
| `Plow: Show License Status` | Show the active license tier, seats, features, and days remaining |
| `Plow: Refresh License` | Fetch a fresh license token from `api.plow.cloud` and persist it locally |
| `Plow: Deactivate License` | Remove the local license file |

### Muting Plow's editor squiggles

Duplicate-code findings can span many lines and drown out TypeScript / ESLint diagnostics in the editor. Plow ships four ways to mute them locally without disabling the underlying rule:

- A right-click **Quick Fix** on any Plow squiggle: "Mute Plow `<category>` findings in this workspace."
- The filter icon in the Plow sidebar title bar opens the diagnostic mute manager.
- The four commands above; bind a keyboard shortcut to `plow.toggleMuteDuplicates` for one-keystroke noise control.
- The Plow language status item (right gutter of the status bar) appears with a yellow indicator whenever anything is muted; click it to open the manage picker.

Mute state is stored in the workspace, so it survives reload but does not bleed across projects. Precedence: rules in your `plow.config.json` and the `plow.issueTypes` setting take effect server-side; muting is a **local view filter only**, applied client-side. CI and `plow dead-code` still report every finding.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `plow.lspPath` | `""` | Path to the `plow-lsp` binary. Leave empty for auto-detection. |
| `plow.configPath` | `""` | Path to a Plow config file. Relative paths are resolved from the workspace root (the first folder, in multi-root workspaces). Mirrors the CLI's `--config`; empty uses config auto-discovery. |
| `plow.autoDownload` | `true` | Automatically download managed `plow-lsp` and `plow` CLI binaries if not found. |
| `plow.issueTypes` | all enabled | Toggle individual issue types on/off. |
| `plow.duplication.threshold` | `0` | Maximum allowed duplication percentage before the analysis is marked as failing. `0` (the default) means no limit. |
| `plow.duplication.minTokens` | `50` | Minimum token count for a clone before it can be reported as duplicated code. |
| `plow.duplication.minLines` | `5` | Minimum line count for a clone before it can be reported as duplicated code. |
| `plow.duplication.minOccurrences` | `2` | Minimum number of occurrences before a clone group is reported. Defaults to `2` (every duplicated pair). Raise to `3`+ to focus on widespread copy-paste and skip context-sensitive pairs. |
| `plow.duplication.mode` | `"mild"` | Detection mode: `strict`, `mild`, `weak`, or `semantic`. |
| `plow.duplication.skipLocal` | `false` | Only report duplicate code that appears across different directories. |
| `plow.duplication.crossLanguage` | `false` | Compare TypeScript and JavaScript files after stripping TypeScript type annotations. |
| `plow.duplication.ignoreImports` | `false` | Exclude import declarations from duplicate-code detection. |
| `plow.health.enabled` | `true` | Show the Plow Health view (score and grade, complexity findings, hotspot candidates, refactoring candidates). When off, the Health view stays empty and no extra analysis runs. |
| `plow.health.hotspots` | `true` | Include git churn hotspots in the Health view. Hotspot analysis walks git history; disable on very large repositories to keep the Health refresh fast. Has no effect outside a git repository. |
| `plow.health.topFindings` | `20` | Maximum number of complexity findings shown in the Health view (passed to `plow health --top`). |
| `plow.health.statusBar` | `true` | Show the project health score and grade in the Plow status bar item. |
| `plow.health.inlineComplexity` | `false` | Show LSP code lenses above functions that exceed Plow Health cyclomatic or cognitive thresholds. Off by default to keep editor chrome unchanged. |
| `plow.security.enabled` | `false` | Show the Security Candidates view and surface local `client-server-leak` and tainted-sink CWE findings from `plow security`. Off by default. Findings are UNVERIFIED candidates to verify, never confirmed vulnerabilities. When enabled, the scan runs only when the view is opened, so it never slows the main sidebar. |
| `plow.coverage.capturePath` | `""` | Path to a local runtime-coverage capture (a file or directory) for the Runtime Coverage view. Relative paths resolve from the workspace root. Local-only and offline. Requires the plow-cov sidecar (run `plow coverage setup` first). Empty prompts you to pick a capture on first load. |
| `plow.coverage.top` | `0` | Show only the top N hot paths and findings in the Runtime Coverage view (mirrors the CLI's `--top`). `0` (the default) means no limit. |
| `plow.license.showStatusBar` | `true` | Show a Plow license indicator in the status bar. Disable to remove the indicator and skip the license status probe on activation. |
| `plow.license.refreshOnStartup` | `false` | Probe license status once when the extension activates. Off by default so the editor never shells out to plow on startup unless you opt in; the indicator otherwise updates only when you run a Plow license command. |
| `plow.production` | `false` | Production mode: exclude test/dev files, only production scripts. |
| `plow.changedSince` | `""` | Git ref (tag, branch, or SHA) to scope the Problems panel and sidebar to files changed since that ref, mirroring the CLI's `--changed-since`. Tag your current commit (e.g. `plow-baseline`) and set this to the tag to enforce "no new issues going forward" while ignoring pre-existing findings. |
| `plow.audit.gate` | `"new-only"` | Which findings affect the audit verdict. `new-only` fails only on findings introduced by the current change set (runs an extra base-snapshot pass); `all` fails on every finding in changed files. Mirrors `plow audit --gate`. |
| `plow.audit.statusBar.enabled` | `true` | Show the audit verdict (pass/warn/fail) for the current change set in the status bar. Toggling takes effect immediately, no window reload needed. |
| `plow.audit.runOnSave` | `false` | Re-run the audit verdict automatically when a JS/TS file is saved. Off by default to avoid added latency; the **Plow: Audit Changed Files** command and the status-bar item run it on demand. |
| `plow.trace.server` | `"off"` | LSP trace level: `off`, `messages`, or `verbose`. |

## Binary resolution

The extension looks for the `plow-lsp` binary in this order:

1. `plow.lspPath` setting (if configured)
2. Local `node_modules/.bin/plow-lsp`
3. `plow-lsp` in `PATH`
4. Previously downloaded binary in extension storage
5. Auto-download from GitHub releases (if `plow.autoDownload` is enabled)

Tree views and fix commands also need the `plow` CLI. The extension resolves it in this order:

1. `plow` next to the configured `plow.lspPath` binary
2. Local `node_modules/.bin/plow`
3. `plow` in `PATH`
4. Previously downloaded CLI binary in extension storage
5. Auto-download from GitHub releases (if `plow.autoDownload` is enabled)

## Development

```sh
cd editors/vscode
pnpm install
pnpm build           # Production build
pnpm watch           # Watch mode for development
pnpm lint            # Type check
pnpm test            # Unit + extension-host tests
pnpm package         # Package as .vsix
```
