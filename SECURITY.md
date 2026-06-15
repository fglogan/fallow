# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in plow, please report it responsibly via [GitHub's private vulnerability reporting](https://github.com/fglogan/genesis-plow/security/advisories/new) instead of opening a public issue.

You should receive a response within 48 hours. Please include:

- A description of the vulnerability
- Steps to reproduce it
- Any relevant version or configuration information

## Scope

plow is a static analysis tool that reads source files and `package.json`. It does not execute user code, make network requests, or modify files (except `plow fix`, which only edits files in the analyzed project). The "does not execute user code" property is enforced, not just documented: the analysis crates (`plow-core`, `plow-extract`, `plow-graph`) pin `#![cfg_attr(not(test), deny(clippy::disallowed_methods))]` against `std::process::Command::new`, so the only external program the analysis path can spawn is `git` (for `--changed-since`, churn history, and repository-state queries), routed through the single `plow_core::spawn::git` wrapper. A `package.json` lifecycle script is read as data and never run; a regression test (`safe_analysis`) asserts a `postinstall` sentinel never fires during analysis.

## Threat model

The primary security boundary is the project root passed via `--root` (or the discovered config's directory). plow walks files under that root and reads `package.json`, source files, lockfiles, and CI configs found within it.

Config-sourced glob patterns (`entry`, `ignorePatterns`, `dynamicallyLoaded`, `duplicates.ignore`, `health.ignore`, `overrides[].files`, `ignoreExports[].file`, `ignoreCatalogReferences[].consumer`, `boundaries.zones[].{patterns, root, autoDiscover}`) are validated against absolute paths, `..` traversal segments, and invalid glob syntax at config load time. The same validation applies to every glob-bearing field on inline `framework[]` plugin definitions and on external plugin files discovered from `.plow/plugins/`, root-level `plow-plugin-*.{toml,json,jsonc}`, or paths listed in the `plugins:` config field, including patterns nested inside `detection` combinators (`all`, `any`). Invalid patterns cause `plow` to exit with code 2 before walking the filesystem, so a malicious `.plowrc.json` or plugin file shipped in a PR cannot smuggle absolute or traversal globs into a CI run. See issue [#463](https://github.com/fglogan/genesis-plow/issues/463) for the original report.

Rule packs (the `rulePacks` config key) are pure declarative data: loading a pack never executes project code, pack paths must resolve inside the project root, and rule globs go through the same validation as config-sourced globs (exit 2 on any invalid pack before analysis). If a future version ever adds executable checks to rule packs, they will sit behind an explicit trust opt-in, never default-on.

On `fglogan/genesis-plow`'s own GitHub Actions setup, the `approval_policy: first_time_contributors` setting requires maintainer approval before a first-time contributor's PR runs CI, which further narrows the realistic attack window. Self-hosted forks should configure a similar approval policy when running `plow` on untrusted PR content.

## Build-time trust boundary

The threat model above covers plow at runtime (analyzing a project). A separate boundary applies when *building* plow itself. Cargo build scripts (`build.rs`) and procedural macros execute arbitrary code at build time, on CI and on the release runner that holds the binary-signing key. This is a distinct, higher-stakes surface from the runtime one, and `npm --ignore-scripts` (which guards the npm-wrapper install) does nothing for it.

The Cargo dependency graph is gated by `cargo-deny` (`deny.toml`, run in CI):

- RUSTSEC advisories deny by default (cargo-deny v2), and `yanked = "deny"` rejects yanked crates, an early signal of a withdrawn or compromised release.
- `[bans] wildcards = "deny"` forbids `*` version requirements; `[sources]` denies unknown registries and git sources, so a dependency cannot be pulled from an unexpected origin.
- Every `advisories.ignore` entry must carry a written justification, so suppressions are auditable rather than silent.

Dependency updates flow through Dependabot with a 7-day cooldown and non-major-only auto-merge, so a freshly-published (possibly compromised) version is not pulled into a build the day it lands.

Every plow release publishes per-platform CLI, LSP, and MCP binaries via three channels (the GitHub Release, the `@plow-cli/*` npm platform packages, and the bundled `fglogan/genesis-plow@v2` GitHub Action). At release time the `build` job in `.github/workflows/release.yml` signs each binary with the workflow's Ed25519 private key (`ED25519_BINARY_SIGNING_PRIVATE_KEY` repo secret), uploads the resulting `.sig` files alongside the binaries, and publishes npm tarballs with `npm publish --provenance --ignore-scripts`. The same workflow computes a SHA-256 digest of every platform binary and writes it into the platform package's `package.json` under a `plowDigests` field, so verification on every consumer runs locally without a network round-trip.

The matching public key is `34 bytes of SPKI DER header + 32 raw bytes of Ed25519 public key`. The 32-byte raw key is hardcoded into every consumer (the VS Code extension at `editors/vscode/src/download.ts`, the npm wrapper at `npm/plow/scripts/verify-binary.js`) so the Ed25519 layer of verification works fully offline and cannot be silently downgraded by network-path tampering. The SHA-256 layer reads the embedded `plowDigests` field from the platform package's `package.json`; platform packages predating v2.78.1 (which introduced the field, see issue #597) cannot be lazily verified and surface an actionable `npm install plow@latest` error.

On the npm wrapper specifically, verification runs at first-invocation of `plow`, `plow-lsp`, or `plow-mcp` rather than during `npm install`'s postinstall hook. A small JSON sentinel file is written next to the platform binary (or under `$XDG_CACHE_HOME/plow/sentinels/` if the platform pkg dir is read-only, e.g. yarn PnP, Docker baked layers) so subsequent invocations skip verification on a cache hit. The sentinel is bound to both the resolved platform-package directory AND a SHA-256 of each binary's bytes. The directory binding prevents cross-install sentinel reuse in the shared fallback cache (two installs of the same package version on the same host cannot ride each other's verified state). The byte binding catches a tampered binary that happens to preserve the recorded mtime, since the cache hit re-reads the binary and compares its SHA-256 against the sentinel before trusting it. This change preserves the cryptographic property bit-for-bit while removing the dependency on npm install scripts ahead of [npm RFC 868](https://github.com/npm/rfcs/pull/868) (`npm/cli#9360`) Phase 2, which will block postinstall hooks unless consumers explicitly add plow to their `package.json#allowScripts`. The GitHub Action installer runs its own independent verification step that does not depend on the npm wrapper's first-run path.

**Public key fingerprint (raw 32-byte Ed25519, hex):**

```
834e6fd77333e6eedf779347c710acb403d2d8234d559f5ed7c87e552ade0bd1
```

You can copy this value out-of-band (a release blog post, this file at a tag you trust, a Git commit you trust) and compare it against the embedded copy in any version of plow you have installed.

### Verification surfaces

| Channel | When verification runs | What it verifies | Failure mode |
|:--------|:-----------------------|:-----------------|:-------------|
| VS Code extension | After downloading the binary from the GitHub Release | Ed25519 signature over the binary bytes; SHA-256 fallback when no `.sig` is present | Refuses to launch and deletes the partial download |
| `plow`, `plow-lsp`, `plow-mcp` first invocation | On first run after install or upgrade, cached via a sentinel file next to the platform binary (or in `$XDG_CACHE_HOME/plow/sentinels/` when the platform pkg dir is read-only) | Ed25519 signature over each of `plow`, `plow-lsp`, `plow-mcp` in the resolved `@plow-cli/<platform>` package, then SHA-256 of the binary bytes against the platform package's `plowDigests` field | Refuses to exec the binary, prints `plow: binary verification failed: ...` with a specific failure code (`sig-invalid`, `digest-mismatch`, `binary-missing`, `sig-missing`, `digest-unavailable`), exits 1 |
| `plow --version` | On every invocation (already runs the lazy verify path) | Adds a trailing `verified: yes (<sentinel-path>)` / `verified: skipped (<reason>)` line so procurement teams and CI scripts can confirm the integrity posture in one command | Prints `verified: no (<code>)` and exits 1 |
| `fglogan/genesis-plow@v2` GitHub Action installer | After `npm install -g --ignore-scripts plow@<spec>` | Same as above, but the verifier code is loaded from the checked-out Action tree rather than the installed package so a tampered installer cannot self-validate | Aborts the action step with a `::error::` annotation |
| `npm install plow` (`postinstall`) | **REMOVED 2026-Q2.** Previously aborted the install on verification failure. Removed for [npm RFC 868](https://github.com/npm/rfcs/pull/868) (`npm/cli#9360`) readiness: Phase 2 of the RFC will block postinstall hooks by default unless consumers add plow to their `package.json#allowScripts`, which would silently no-op the install-time check. The cryptographic property is preserved bit-for-bit by the lazy first-run path (row above). | n/a (no longer runs) |

The lazy first-run model is stronger than the npm-tarball-shasum-only baseline used by most Rust/Go npm wrappers (esbuild verifies SHA-256 only on its HTTP fallback path; biome, oxlint, rolldown, turbo, rspack, swc, and tailwindcss-oxide ship no in-package binary verification). plow's Ed25519 signature check uses a key the project controls; provenance attestations from `npm publish --provenance` and the npm registry shasum are complementary signals, not the trust root.

### Signed-binary epoch: versions before 2.77.0

Signed platform binaries ship from **plow 2.77.0 onward**. The Ed25519 signing step, the `.sig` files inside each `@plow-cli/<platform>` package, and the verifier itself all landed together and first released in 2.77.0; every release before that predates signed binaries and has no `.sig` to verify (and never will, since published npm versions are immutable).

This matters when the verifier (2.77.0+, including the GitHub Action) runs against an *older resolved CLI*. The resolved CLI version comes from your project's `plow` dependency pin, not from the Action ref in your workflow, so pinning `plow` to 2.76.0 or earlier while using a current Action produces a `sig-missing` failure. The error distinguishes the two causes:

- **Resolved version below 2.77.0** (predates signing): expected. Bump the `plow` dependency in your project's `package.json` to >=2.77.0 (`npm install plow@latest`). This is the fix; do not reach for the escape hatch below unless you must stay on a pre-signing version for an unrelated reason.
- **Resolved version 2.77.0 or newer but the signature is absent**: unexpected, and treated as a possible tampering or incomplete-install signal. Reinstall, and report it (see "Reporting binary tampering" below) if it persists on a clean install. Do not bypass verification to work around it.

### Out-of-band verification recipe

To verify a binary manually, download both the binary and its `.sig` from a GitHub Release (e.g. `plow-aarch64-apple-darwin` + `plow-aarch64-apple-darwin.sig`) and run the workflow's verification script with the public key set in env:

```sh
ED25519_BINARY_SIGNING_PUBLIC_KEY=g05v13Mz5u7fd5NHxxCstAPS2CNNVZ9e18h+VSreC9E= \
  node .github/scripts/verify-binary.mjs plow-aarch64-apple-darwin plow-aarch64-apple-darwin.sig
```

The base64 form of the public key above (`g05v13Mz5u7fd5NHxxCstAPS2CNNVZ9e18h+VSreC9E=`) decodes to the same 32 bytes shown in the fingerprint section.

For the SHA-256 half, compare the local binary hash with the digest embedded in the matching `@plow-cli/<platform>` package's `package.json`:

```sh
shasum -a 256 node_modules/@plow-cli/linux-x64-gnu/plow
node -p 'require("@plow-cli/linux-x64-gnu/package.json").plowDigests.plow'
```

Both lines should print the same hex digest (the second carries a `sha256:` prefix). For platform packages published before v2.78.1 that do not yet ship `plowDigests`, compare against the GitHub Release asset digest instead:

```sh
gh release view v2.76.0 --repo fglogan/genesis-plow --json assets \
  --jq '.assets[] | select(.name=="plow-aarch64-apple-darwin") | .digest'
```

### The `PLOW_SKIP_BINARY_VERIFY` escape hatch

Set `PLOW_SKIP_BINARY_VERIFY=1` (or `true` or `yes`) in the environment to skip Ed25519 and SHA-256 verification at first-run inside `plow`, `plow-lsp`, `plow-mcp` and during the GitHub Action installer step. This emits a warning so the skip is visible in CI logs and lands as a `verified: skipped (PLOW_SKIP_BINARY_VERIFY is set)` line in `plow --version` output.

**Enterprise audit-log note.** Setting `PLOW_SKIP_BINARY_VERIFY=1` at the organization or container level (Docker base image, Kubernetes ConfigMap, org-wide CI variable) silences binary verification for every consumer downstream. Record the rationale in your supply-chain audit trail before doing so. The `verified: skipped` line in `plow --version` output is the recommended evidence channel for vendor questionnaires.

Use this ONLY when you deliberately replace the published binary, for example:

- You build plow from source and patch the binary into the platform package after install.
- You mirror npm through a private registry that re-signs or repacks artifacts.
- You run plow inside an airgapped environment with a locally-built binary.

Do NOT set this flag in regular CI configurations or on machines that are expected to consume the upstream release. An attacker who can set environment variables on your install host can use the same flag to bypass verification; the flag exists for legitimate replacement workflows, not as a noise-reducer.

### Reporting binary tampering

If `npm install plow` or the `fglogan/genesis-plow` action ever aborts with `binary verification failed` on a fresh, unmodified install, do not ignore it. Report it via the [private vulnerability reporting link](https://github.com/fglogan/genesis-plow/security/advisories/new) above and include the full error message and the platform package version. False positives on this path are rare; a sustained failure on a clean install is treated as a P0 supply-chain incident.

### Signing-key rotation and compromise response

The binary-signing keypair is asymmetric and split across two surfaces:

- **Private key:** the `ED25519_BINARY_SIGNING_PRIVATE_KEY` repository secret. Only the `build` job in `.github/workflows/release.yml` reads it, to sign each platform binary at release time.
- **Public key:** the raw 32 bytes are hardcoded into every consumer that verifies a binary, `editors/vscode/src/download.ts` and `npm/plow/scripts/verify-binary.js`, and the hex fingerprint is documented in the "Build-time trust boundary" section above. There is no CI job that asserts the two consumer copies agree, so they must be kept in sync by hand; treat both files plus this document's fingerprint as one unit on any key change.

**Why rotation is a clean per-version cutover (no grace window needed).** Each released consumer pins exactly one public key (the one it was built with) and only ever fetches the binary for its own version (the npm wrapper resolves the matching `@plow-cli/*` platform package; the VS Code extension and the Action download the binary for the version they ship). So version N's consumer verifies version N's binary against version N's key, and an already-installed version N-1 keeps verifying its own N-1 binary against the old key. A key rotation therefore takes effect on upgrade, with nothing to dual-sign and no mixed-key window to manage.

**Scheduled / maintainer-change rotation.** Do it as one ordinary release:

1. Generate a new Ed25519 keypair offline.
2. Replace the `ED25519_BINARY_SIGNING_PRIVATE_KEY` repo secret (read from stdin, never `--body -`; see the release-workflow rules).
3. Update the hardcoded raw public key in BOTH `editors/vscode/src/download.ts` and `npm/plow/scripts/verify-binary.js`, and update the hex fingerprint block in this file, in the same commit.
4. Ship a normal release through `/plow-release`. The new release's binaries are signed with the new key and its consumers verify against it.
5. Confirm a fresh `npm install plow@<new>` and a clean VS Code extension download both verify without error.

**Compromise response (private key suspected leaked).** The danger is that whoever holds the leaked key can sign a malicious binary that any consumer still pinned to the matching public key would accept. Move fast:

1. Rotate immediately via a patch release using the steps above. This is the load-bearing action: once the new release ships, upgrading consumers no longer trust the compromised key.
2. File a GitHub Security Advisory ([new advisory](https://github.com/fglogan/genesis-plow/security/advisories/new)) describing the exposure window and the fixed version.
3. Consider deprecating (`npm deprecate`) the versions published during the exposure window so installs steer to the rotated release. Do NOT force-rewrite their git tags (tag tombstones are permanent); the rotation is forward-only.
4. Rotate any other secret that shared the exposure path (a leaked Actions secret rarely leaks alone): `NPM_TOKEN`, `CARGO_REGISTRY_TOKEN`, `VSCE_PAT`, `OVSX_PAT`.

## Agent-instruction surface

AI coding agents read instruction files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.claude/**`, `.codex/**`, MCP config) as trusted context. A dependency install hook, or a pasted "fix", can plant hidden instructions in one of these files for the next agent session to execute. `scripts/scan-hidden-unicode.py` guards two surfaces against this:

- **Committed surface (blocking):** the pre-commit hook and a CI step scan tracked text files for zero-width and bidirectional-override code points (emoji ZWJ sequences are allowlisted). These have no legitimate place in source, so a hit fails the commit / CI.
- **Local agent surface (advisory):** a Claude Code `SessionStart` hook scans the agent-instruction allowlist, including untracked and gitignored files that never reach a pull request. Hidden code points are reported; on the un-reviewed (untracked) files only, shell-exec injection shapes (`curl | sh`, `base64 -d | sh`, `eval`, `node -e`) are flagged as advisory warnings.

This is defense-in-depth, not a trust boundary: it raises the cost of agent-context poisoning and surfaces the most common shapes, but a determined attacker who can write these files can also edit the hook. Agent-instruction files are untrusted by default; never run a pasted remediation without reading the patch, the URLs, and the package names first.
