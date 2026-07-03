# Node.js Bindings

When embedding plow inside a Node.js process (editor extensions, long-running servers, custom tooling), prefer the NAPI bindings over spawning the CLI. Same analysis engine, same JSON envelopes, no subprocess or JSON parsing overhead.

```bash
npm install @plow-cli/plow-node
```

```ts
import { detectDeadCode, detectDuplication, computeHealth } from '@plow-cli/plow-node';

const deadCode = await detectDeadCode({ root: process.cwd(), explain: true });
const dupes = await detectDuplication({ root: process.cwd(), mode: 'mild', minTokens: 30 });
const health = await computeHealth({ root: process.cwd(), score: true, ownershipEmails: 'handle' });
```

Six async functions: `detectDeadCode`, `detectCircularDependencies`, `detectBoundaryViolations`, `detectDuplication`, `computeComplexity`, `computeHealth`. Each returns the same JSON envelope the CLI emits for `--format json`. Rejected promises throw a `PlowNodeError` with `message`, `exitCode`, and optional `code`, `help`, `context` fields that mirror the CLI's structured error surface.

Enum-like fields take lowercase CLI-style literals (`"mild"`, `"cyclomatic"`, `"handle"`, `"low"`). Write-path commands (`fix`, `init`, `hooks install`, `hooks uninstall`, `license activate`, `coverage setup`) are not exposed; use the CLI for those.

See <https://docs.genesis-plow.dev/integrations/node-bindings> for the full field reference.
