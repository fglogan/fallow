# Plow for Zed

Zed extension for [`plow-lsp`](https://github.com/fglogan/genesis-plow), the language server behind Plow's editor diagnostics.

## What works

- diagnostics for unused files, exports, types, dependencies, enum/class members, unresolved imports, unlisted deps, duplicate exports, circular dependencies, and duplication
- hover information
- quick-fix code actions
- code lens where Zed surfaces them

This extension is intentionally thin. It launches the existing `plow-lsp` binary instead of re-implementing analysis logic inside the editor.

## Binary resolution

The extension looks for `plow-lsp` in this order:

1. `lsp.plow.binary.path`
2. local `node_modules/.bin/plow-lsp` in the current worktree
3. `plow-lsp` on `PATH`
4. a managed binary downloaded from the latest GitHub release and verified against Plow's Ed25519 signing key

If you already install Plow through npm or a package manager, you usually do not need to configure anything.

## Settings

If you customize `language_servers` for a language, keep `plow` or `...` in the list so the extension still runs:

```json
{
  "languages": {
    "TypeScript": {
      "language_servers": ["plow", "..."]
    },
    "JavaScript": {
      "language_servers": ["plow", "..."]
    }
  }
}
```

To point Zed at a specific binary:

```json
{
  "lsp": {
    "plow": {
      "binary": {
        "path": "/absolute/path/to/plow-lsp",
        "arguments": []
      }
    }
  }
}
```

Plow currently reads issue toggles from LSP initialization options:

```json
{
  "lsp": {
    "plow": {
      "initialization_options": {
        "issueTypes": {
          "unused-files": true,
          "unused-exports": true,
          "unused-types": true,
          "unused-dependencies": true,
          "unused-dev-dependencies": true,
          "unused-optional-dependencies": true,
          "unused-enum-members": true,
          "unused-class-members": true,
          "unresolved-imports": true,
          "unlisted-dependencies": true,
          "duplicate-exports": true,
          "type-only-dependencies": true,
          "circular-dependencies": true,
          "stale-suppressions": true
        }
      }
    }
  }
}
```

## Development

1. Open Zed.
2. Run `zed: install dev extension`.
3. Select `editors/zed`.
4. Open a TypeScript or JavaScript project and confirm `plow` is running in the language server UI.

If Zed opens the project in Restricted Mode, trust the worktree first. Restricted Mode blocks language servers entirely.

To preflight the actual packaged extension artifact locally, install the target once with `rustup target add wasm32-wasip2` and run `cargo build --target wasm32-wasip2 --manifest-path editors/zed/Cargo.toml`.

## Linux note

Zed's extension API exposes OS and CPU architecture, but not glibc vs musl. The managed download therefore uses the GNU Linux release asset. On musl/Nix-style setups, prefer `PATH` or `lsp.plow.binary.path`.
