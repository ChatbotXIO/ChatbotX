import { beforeEach, describe, expect, test, vi } from "vitest"

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

const shopifyIntegrationService = {
  getStatus: vi.fn(),
  connect: vi.fn(),
  requestSync: vi.fn(),
  disconnect: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ shopifyIntegrationService }))

await import("@/features/shopify/api/public")
const { connectShopifyRequest, syncShopifyRequest } = await import(
  "@/features/shopify/schema/public"
)

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

const handlerOf = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found?.handler) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found.handler
}

const context = { workspace: { id: "ws-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the Shopify router under the ecommerce scope", () => {
  expect(scopeArgAtImport).toBe("ecommerce")
})

test("GET /v1/shopify reads the workspace's connection", async () => {
  shopifyIntegrationService.getStatus.mockResolvedValue({ connected: false })
  await expect(handlerOf("GET", "/v1/shopify")({ context })).resolves.toEqual({
    connected: false,
  })
  expect(shopifyIntegrationService.getStatus).toHaveBeenCalledWith("ws-1")
})

describe("POST /v1/shopify", () => {
  test("connects with the token's workspace, never one from the input", async () => {
    const input = connectShopifyRequest.parse({
      authKind: "token",
      shopDomain: "botxshop.myshopify.com",
      accessToken: " shpat_abc ",
      apiSecret: "secret",
    })
    await handlerOf(
      "POST",
      "/v1/shopify",
    )({
      context,
      input: { ...input, workspaceId: "ws-other" },
    })
    expect(shopifyIntegrationService.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        authKind: "token",
        accessToken: "shpat_abc",
      }),
    )
  })

  test("takes Dev Dashboard client credentials", () => {
    expect(
      connectShopifyRequest.safeParse({
        authKind: "clientCredentials",
        shopDomain: "botxshop.myshopify.com",
        clientId: "id",
        clientSecret: "secret",
      }).success,
    ).toBe(true)
    expect(
      connectShopifyRequest.safeParse({
        authKind: "clientCredentials",
        shopDomain: "botxshop.myshopify.com",
        clientId: "id",
      }).success,
    ).toBe(false)
  })
})

test("POST /v1/shopify/sync defaults to a full sync", async () => {
  await handlerOf(
    "POST",
    "/v1/shopify/sync",
  )({
    context,
    input: syncShopifyRequest.parse({}),
  })
  expect(shopifyIntegrationService.requestSync).toHaveBeenCalledWith({
    workspaceId: "ws-1",
    scope: "all",
  })
})

test("DELETE /v1/shopify disconnects the workspace's store", async () => {
  await handlerOf("DELETE", "/v1/shopify")({ context })
  expect(shopifyIntegrationService.disconnect).toHaveBeenCalledWith("ws-1")
})
