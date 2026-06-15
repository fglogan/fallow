# plow

**Deterministic codebase intelligence for TypeScript and JavaScript.**

Quality, risk, architecture, dependencies, duplication, and safe cleanup evidence for humans, CI, and agents.

[![CI](https://github.com/fglogan/genesis-plow/actions/workflows/ci.yml/badge.svg)](https://github.com/fglogan/genesis-plow/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/plow.svg)](https://www.npmjs.com/package/plow)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/fglogan/genesis-plow/blob/main/LICENSE)

Plow turns a JS/TS repository into a trusted quality report: health score, changed-code risk, hotspots, duplication, architecture issues, dependency hygiene, and cleanup opportunities.

It helps you answer: what changed, what got riskier, what should be reviewed, what should be refactored, and what can be safely removed. No AI inside the analyzer. Plow produces deterministic findings, typed output contracts, and traceable explanations that downstream tools can trust.

Static analysis is free and open source. An optional paid runtime layer (Plow Runtime) adds production execution evidence. Rust-native, sub-second, 122 framework plugins, 5-18x faster than [knip](https://knip.dev) v5 (2.7-9x faster than knip v6), 8-29x faster than [jscpd](https://github.com/kucherenko/jscpd) for duplication detection, with no Node.js runtime dependency for analysis.

## Installation

```bash
npm install --save-dev plow   # or: pnpm add -D plow / yarn add -D plow / bun add -d plow
```

Installs the `plow` CLI plus the companion `plow-lsp` and `plow-mcp` binaries in your project.

The package also ships a version-matched Agent Skill under `skills/plow`.
TanStack Intent discovers it from `node_modules` automatically:

```bash
npx @tanstack/intent list
npx @tanstack/intent load plow#plow
```

For one-off CLI use without project-local skill discovery, run `npx plow`.

Parsing plow's JSON output in TypeScript? Import the typed shapes:

```ts
import type { CheckOutput, PlowJsonOutput } from "plow/types";
```

The types are generated from the same schema as the VS Code extension and pin to the CLI version you install. See [docs.genesis-plow.dev](https://docs.genesis-plow.dev) for the full output contract.

## Quick start

```bash
npx plow audit                 # PR-style audit: verdict pass / warn / fail
npx plow audit --format json   # Machine-readable audit (for CI and agents)
npx plow health --score        # Quality score and grade
npx plow                       # Full codebase analysis: health + duplication + cleanup
npx plow dead-code             # Cleanup-specific findings
npx plow fix --dry-run         # Preview automatic cleanup
```

## What Plow reports

- **Quality score** -- compact health score with grade and trend delta when snapshot history is enabled
- **PR risk** -- changed-code analysis with pass / warn / fail verdict and per-finding attribution
- **Hotspots** -- functions, files, and packages combining complexity, churn, size, and coupling
- **Duplication** -- clone families across four detection modes (strict, mild, weak, semantic)
- **Architecture** -- circular dependencies, boundary violations, re-export chains
- **Dependency hygiene** -- unused, unlisted, unresolved, duplicate, and type-only deps; pnpm catalog and overrides
- **Cleanup opportunities** -- unused files, exports, types, enum members, class members, stale suppressions
- **Runtime intelligence (optional, paid)** -- hot paths, cold code, runtime-weighted health, stale flags

Cleanup opportunities are findings that look safe to review for removal because no graph evidence supports keeping them. Dead code is one category of cleanup, not the product identity.

## Code duplication

```bash
plow dupes                       # Default: mild mode
plow dupes --mode semantic       # Catch clones with renamed variables
plow dupes --threshold 5         # Fail CI if duplication exceeds 5%
plow dupes --save-baseline       # Save current duplication as baseline
```

Four detection modes (strict, mild, weak, semantic), clone family grouping with refactoring suggestions, baseline tracking, and cross-language TS/JS matching.

## Built for agents

Plow gives AI agents structured repo truth instead of forcing them to infer everything from grep. Agents call the CLI or the MCP server to answer:

- Who imports this symbol?
- Why is this export considered used or unused?
- What changed in this PR?
- Which files are risky to touch?
- What duplicate siblings exist?
- What cleanup action is safest?

Every issue in `--format json` carries a machine-actionable `actions` array with an `auto_fixable` flag so agents can self-correct.

## Framework support

122 built-in plugins covering Next.js, Nuxt, Remix, Qwik, SvelteKit, Gatsby, Astro, Angular, NestJS, AdonisJS, Ember, Expo Router, Vite, Webpack, Vitest, Jest, Playwright, Cypress, Storybook, ESLint, TypeScript, Tailwind, UnoCSS, Prisma, Drizzle, Convex, Turborepo, Hardhat, and many more. Auto-detected from your `package.json`.

## Configuration

Create a config file in your project root, or run `plow init`:

```jsonc
// .plowrc.json
{
  "$schema": "https://raw.githubusercontent.com/fglogan/genesis-plow/main/schema.json",
  "entry": ["src/workers/*.ts", "scripts/*.ts"],
  "ignorePatterns": ["**/*.generated.ts"],
  "rules": {
    "unused-files": "error",
    "unused-exports": "warn",
    "unused-types": "off"
  }
}
```

Also supports TOML (`plow init --toml` creates `plow.toml`).

## Documentation

- [Full documentation](https://docs.genesis-plow.dev)
- [GitHub repository](https://github.com/fglogan/genesis-plow)
- [Plugin Authoring Guide](https://github.com/fglogan/genesis-plow/blob/main/docs/plugin-authoring.md)

## License

MIT
