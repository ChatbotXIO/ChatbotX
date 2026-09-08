// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

// Same rationale as contacts-public-scope.test.ts: importing the real
// integrations public router transitively pulls in
// `@chatbotx.io/database/client` (opens a real `pg.Pool`) and `@/orpc`'s
// `authorizedAPI` chain (boots the full better-auth stack via
// `@/middlewares/auth`). Neither is reachable from this test — it only
// inspects which scope each submodule registered its procedures under — so
// both are stubbed to keep the import side-effect-free.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
  workspaceAuthorizedMidddleware: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

const workspaceTokenAuthAPIForScope = vi.hoisted(() =>
  vi.fn((_scope: string) => {
    const chain = {
      route: vi.fn(() => chain),
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn(() => ({})),
    }
    return chain
  }),
)

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

// Each submodule calls `workspaceTokenAuthAPIForScope` exactly once at import
// time — `packages/utils`' Snowflake ID generator is a process-wide singleton
// that throws on re-init, so every submodule is imported exactly once here
// (no `vi.resetModules()` between them) and the full accumulated call list is
// asserted at the end, per submodule slice.
await import("@/features/integrations/api/public/crud")
const crudCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/integrations/api/public/ai")
const aiCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

const allScopeCalls = workspaceTokenAuthAPIForScope.mock.calls.map(
  (call) => call[0],
)

describe("integrations public router scope wiring", () => {
  test("crud.ts registers under the 'integrations' scope", () => {
    expect(allScopeCalls.slice(0, crudCallCount)).toEqual(["integrations"])
  })

  test("ai.ts registers under the 'integrations' scope", () => {
    expect(allScopeCalls.slice(crudCallCount, aiCallCount)).toEqual([
      "integrations",
    ])
  })
})
