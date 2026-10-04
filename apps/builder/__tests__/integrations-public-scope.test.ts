// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

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
