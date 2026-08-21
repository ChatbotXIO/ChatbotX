# Dynamic Imports Rule

## Principle

Never use dynamic `import()` expressions (e.g. `await import('...')`, `const x = import('...')`) in code that is built by **tsdown**. Always use static `import` statements at the top of the file there.

**Applies to (tsdown-built — dynamic `import()` forbidden):**

- `packages/*`
- `integrations/*`
- `apps/worker`
- `apps/cli`
- `apps/mcp-server`
- `apps/javascript-executor`

**Does NOT apply to (Next.js-built — dynamic imports allowed and encouraged for code-splitting):**

- `apps/builder/src` — `next/dynamic` and `import()` are the supported way to split heavy client islands (flow editor, tiptap, codemirror, recharts, giphy, …) and to lazy-load oRPC router branches (`os.lazy(() => import(...))`). Next.js resolves these at build time; tsdown never processes this app.

## Exception

Test files (`*.test.ts`, `*.spec.ts`) are exempt everywhere — dynamic imports are acceptable in tests.

## Why

Dynamic imports break the **tsdown** build pipeline: the bundler cannot resolve them correctly, causing build failures. That constraint is specific to tsdown targets. `apps/builder` is built by Next.js (Turbopack), where dynamic imports are a first-class mechanism for route/bundle splitting — banning them there only inflates shared bundles.

## What to do instead (tsdown targets)

```ts
// WRONG in packages/, integrations/, apps/{worker,cli,mcp-server,javascript-executor} — breaks tsdown build
const { parse } = await import('some-lib')

// CORRECT — use static import
import { parse } from 'some-lib'
```

If a module in a tsdown target is large and you're tempted to lazy-load it, use a static import anyway — the bundler handles tree-shaking.

## In apps/builder

```tsx
// OK — split a heavy client-only island out of the shared bundle
import dynamic from "next/dynamic"

const GiphyPicker = dynamic(
  () => import("./giphy-picker").then((m) => m.GiphyPicker),
  { ssr: false },
)
```

Keep a static import when the module is small or always needed on first paint — splitting has per-chunk overhead.
