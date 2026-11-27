# Registering the router

## Registering the Router

Add to `apps/builder/src/routers/index.ts` as a **lazy branch** — every feature
router there is wrapped in oRPC's `lazy()` so the feature's api module (and its
import graph) only loads on the first call that targets it, instead of all ~58
feature api modules loading with the route handler:

```typescript
import { lazy } from "@orpc/server"

export const router = {
  // ...existing routes
  myFeatureAPI: lazy(() =>
    import("@/features/my-feature/api").then((m) => ({
      default: m.myFeatureAPI,
    })),
  ),
}
```

Two failure modes to watch: the `import("...")` specifier must stay a literal
string (the bundler needs to statically analyze it), and the picked export
name must match the module's actual export — a mismatch produces
`default: undefined`, which fails at the first call to that branch rather than
at build time. Dynamic `import()` is allowed here because `apps/builder` is
Next.js-built (see `.agents/rules/no-dynamic-import.md`).

For public API (`api/public.ts`), don't add the feature to `routers/index.ts`
at all if it has no private procedures — register it only in
`apps/builder/src/routers/public.ts` (see above), nested under the resource
name. That router stays **eager** (plain imports); it feeds `/api/public-spec.json`,
and its `operationId`s (`resource.key`) are what the MCP server turns into
tool names.
