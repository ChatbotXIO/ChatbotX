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

const contactService = { resolveIdByIdentifier: vi.fn() }
const webshopService = { getCart: vi.fn() }
const createWebshopLink = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  contactService,
  webshopService,
  createWebshopLink,
}))

await import("@/features/webshop/api/public")

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

const context = {
  workspace: { id: "ws-1" },
  apiToken: { permission: "write" },
}
const readOnlyContext = {
  workspace: { id: "ws-1" },
  apiToken: { permission: "read_only" },
}

beforeEach(() => {
  vi.clearAllMocks()
  contactService.resolveIdByIdentifier.mockResolvedValue("c-1")
  createWebshopLink.mockResolvedValue({
    url: "https://app/shop/ws-1?token=t",
    buttonUrl: "https://app/shop/ws-1?token={{shop_token}}",
    preview: false,
    expiresInSeconds: 604_800,
  })
})

test("registers the web shop routers under the ecommerce scope", () => {
  expect(scopeArgAtImport).toBe("ecommerce")
})

describe("webshop.getLink", () => {
  test("signs the link for the contact, resolved in the token's workspace", async () => {
    await expect(
      handlerOf(
        "GET",
        "/v1/webshop/link",
      )({
        context,
        input: { contact: "email:a@b.co", vendorId: "9", page: "cart" },
      }),
    ).resolves.toEqual({
      url: "https://app/shop/ws-1?token=t",
      buttonUrl: "https://app/shop/ws-1?token={{shop_token}}",
      preview: false,
      expiresInSeconds: 604_800,
    })
    expect(contactService.resolveIdByIdentifier).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      identifier: "email:a@b.co",
    })
    expect(createWebshopLink).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      page: "cart",
      productId: undefined,
      vendorId: "9",
      categoryId: undefined,
    })
  })

  test("opens on one product's page", async () => {
    await handlerOf(
      "GET",
      "/v1/webshop/link",
    )({ context, input: { productId: "42" } })
    expect(createWebshopLink).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", productId: "42" }),
    )
  })

  test("without a contact asks for a preview link", async () => {
    await handlerOf("GET", "/v1/webshop/link")({ context, input: {} })
    expect(contactService.resolveIdByIdentifier).not.toHaveBeenCalled()
    expect(createWebshopLink).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", contactId: null }),
    )
  })
})

describe("webshop.getLink with a read-only token", () => {
  test("refuses a link signed for a contact", async () => {
    await expect(
      handlerOf(
        "GET",
        "/v1/webshop/link",
      )({ context: readOnlyContext, input: { contact: "email:a@b.co" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(createWebshopLink).not.toHaveBeenCalled()
  })

  test("still allows a preview link", async () => {
    await handlerOf(
      "GET",
      "/v1/webshop/link",
    )({ context: readOnlyContext, input: {} })
    expect(createWebshopLink).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: null }),
    )
  })
})

describe("carts.get", () => {
  test("reads the contact's cart in the token's workspace", async () => {
    webshopService.getCart.mockResolvedValue({ items: [] })
    await expect(
      handlerOf(
        "GET",
        "/v1/carts/{identifier}",
      )({
        context,
        input: { identifier: "id:5" },
      }),
    ).resolves.toEqual({ items: [] })
    expect(webshopService.getCart).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
    })
  })
})
