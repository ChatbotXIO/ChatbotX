import { describe, expect, test, vi } from "vitest"

type RouteConfig = { method: string; path: string }
type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)
    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }
  const api = { route: vi.fn((config: RouteConfig) => makeProcedure(config)) }
  return {
    workspaceTokenAuthAPIForScope: vi.fn((_scope: string) => api),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const ecommerceAnalyticsService = { getDashboard: vi.fn() }
vi.mock("@chatbotx.io/business", () => ({ ecommerceAnalyticsService }))

await import("@/features/ecommerce-analytics/api/public")

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

describe("ecommerceAnalytics.get", () => {
  test("is the token's workspace dashboard for the days asked", async () => {
    expect(scopeArgAtImport).toBe("ecommerce")
    const procedure = capturedProcedures.find(
      (p) =>
        p.route.method === "GET" && p.route.path === "/v1/ecommerce/analytics",
    )
    ecommerceAnalyticsService.getDashboard.mockResolvedValue({
      currency: "USD",
    })
    await expect(
      procedure?.handler?.({
        context: { workspace: { id: "ws-1" } },
        input: { from: "2026-10-01", to: "2026-10-21" },
      }),
    ).resolves.toEqual({ currency: "USD" })
    expect(ecommerceAnalyticsService.getDashboard).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      from: "2026-10-01",
      to: "2026-10-21",
    })
  })
})
