# @plow-cli/plow-node

Native Node.js bindings for plow’s main analyses.

## Install

```bash
npm install @plow-cli/plow-node   # or: pnpm/yarn/bun add @plow-cli/plow-node
```

## API

- `detectDeadCode(options?)`
- `detectCircularDependencies(options?)`
- `detectBoundaryViolations(options?)`
- `detectDuplication(options?)`
- `detectFeatureFlags(options?)`
- `computeComplexity(options?)`
- `computeHealth(options?)`

All functions are async and return the same JSON-shaped report contracts that the CLI emits for `--format json`.

Enum-like option values use lowercase CLI-style strings such as `"mild"`, `"cyclomatic"`, `"handle"`, and `"low"`.

Shared options mirror analysis-affecting CLI globals, including `root`, `configPath`, `noCache`, `threads`, `diffFile`, `production`, `changedSince`, `workspace`, `changedWorkspaces`, and `explain`. Object-shaped JSON roots always carry the top-level `kind` discriminator; consumers should branch on `kind`. `diffFile` accepts a path to a unified diff file; stdin diff sources are CLI-only.

Rejected promises throw a `PlowNodeError` with:

- `message`
- `exitCode`
- optional `code`
- optional `help`
- optional `context`
