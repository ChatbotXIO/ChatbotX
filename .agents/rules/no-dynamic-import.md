# No Dynamic Imports Rule

## Principle

Never use dynamic `import()` expressions (e.g. `await import('...')`, `const x = import('...')`) in production source code. Always use static `import` statements at the top of the file.

## Exception

Test files (`*.test.ts`, `*.spec.ts`) are exempt from this rule — dynamic imports are acceptable in tests.

## Why

Dynamic imports break the **tsdown** build pipeline. The bundler cannot resolve them correctly, causing build failures.

## What to do instead

```ts
// WRONG — breaks tsdown build
const { parse } = await import('some-lib')

// CORRECT — use static import
import { parse } from 'some-lib'
```

If a module is large and you're tempted to lazy-load it, use a static import anyway — the bundler handles tree-shaking and code splitting.
