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

const wooCommerceIntegrationService = {
  getStatus: vi.fn(),
  connect: vi.fn(),
  requestSync: vi.fn(),
  disconnect: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ wooCommerceIntegrationService }))

await import("@/features/woocommerce/api/public")
const { connectWooCommerceRequest, syncWooCommerceRequest } = await import(
  "@/features/woocommerce/schema/public"
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

test("registers the WooCommerce router under the ecommerce scope", () => {
  expect(scopeArgAtImport).toBe("ecommerce")
})

test("GET /v1/woocommerce reads the workspace's connection", async () => {
  wooCommerceIntegrationService.getStatus.mockResolvedValue({
    connected: false,
  })
  await expect(
    handlerOf("GET", "/v1/woocommerce")({ context }),
  ).resolves.toEqual({ connected: false })
  expect(wooCommerceIntegrationService.getStatus).toHaveBeenCalledWith("ws-1")
})

describe("POST /v1/woocommerce", () => {
  test("connects with the token's workspace, never one from the input", async () => {
    const input = connectWooCommerceRequest.parse({
      siteUrl: " https://shop.example.com ",
      consumerKey: " ck_abc ",
      consumerSecret: "cs_def",
    })
    await handlerOf(
      "POST",
      "/v1/woocommerce",
    )({
      context,
      input: { ...input, workspaceId: "ws-other" },
    })
    expect(wooCommerceIntegrationService.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        siteUrl: "https://shop.example.com",
        consumerKey: "ck_abc",
        consumerSecret: "cs_def",
      }),
    )
  })

  test("needs both REST API keys", () => {
    expect(
      connectWooCommerceRequest.safeParse({
        siteUrl: "https://shop.example.com",
        consumerKey: "ck_abc",
      }).success,
    ).toBe(false)
  })
})

test("POST /v1/woocommerce/sync defaults to a full sync", async () => {
  await handlerOf(
    "POST",
    "/v1/woocommerce/sync",
  )({
    context,
    input: syncWooCommerceRequest.parse({}),
  })
  expect(wooCommerceIntegrationService.requestSync).toHaveBeenCalledWith({
    workspaceId: "ws-1",
    scope: "all",
  })
})

test("DELETE /v1/woocommerce disconnects the workspace's store", async () => {
  await handlerOf("DELETE", "/v1/woocommerce")({ context })
  expect(wooCommerceIntegrationService.disconnect).toHaveBeenCalledWith("ws-1")
})
