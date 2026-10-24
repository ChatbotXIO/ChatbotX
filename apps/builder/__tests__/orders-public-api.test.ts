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

const orderService = {
  list: vi.fn(),
  getDetail: vi.fn(),
  place: vi.fn(),
  accept: vi.fn(),
  ship: vi.fn(),
  conclude: vi.fn(),
  cancel: vi.fn(),
  delete: vi.fn(),
}
const contactService = { resolveIdByIdentifier: vi.fn() }
vi.mock("@chatbotx.io/business", () => ({ orderService, contactService }))

await import("@/features/orders/api/public")

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

test("registers the orders public router under the ecommerce scope", () => {
  expect(scopeArgAtImport).toBe("ecommerce")
})

describe("POST /v1/orders", () => {
  test("resolves the contact and places an API order", async () => {
    contactService.resolveIdByIdentifier.mockResolvedValue("contact-9")
    orderService.place.mockResolvedValue({ id: "o1" })

    await handlerOf(
      "POST",
      "/v1/orders",
    )({
      context,
      input: {
        contact: "phone:+84900000000",
        items: [{ productId: "1", quantity: 2 }],
        customerName: "Ada",
      },
    })

    expect(contactService.resolveIdByIdentifier).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      identifier: "phone:+84900000000",
    })
    expect(orderService.place).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      source: "api",
      actor: { type: "apiToken" },
      contact: { contactId: "contact-9" },
      items: [{ productId: "1", quantity: 2 }],
      customerName: "Ada",
    })
  })

  test("places an order without a contact", async () => {
    await handlerOf(
      "POST",
      "/v1/orders",
    )({ context, input: { items: [{ productId: "1", quantity: 1 }] } })
    expect(contactService.resolveIdByIdentifier).not.toHaveBeenCalled()
    expect(orderService.place).toHaveBeenCalledWith(
      expect.objectContaining({ contact: { contactId: null } }),
    )
  })
})

describe("status moves", () => {
  test.each([
    ["/v1/orders/{id}/accept", "accept"],
    ["/v1/orders/{id}/ship", "ship"],
    ["/v1/orders/{id}/conclude", "conclude"],
    ["/v1/orders/{id}/cancel", "cancel"],
  ] as const)("%s calls orderService.%s with the message", async (path, method) => {
    await handlerOf(
      "POST",
      path,
    )({
      context,
      input: { id: "o1", message: "Thanks" },
    })
    expect(orderService[method]).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      orderId: "o1",
      actor: { type: "apiToken" },
      message: "Thanks",
    })
  })

  test("DELETE /v1/orders/{id} deletes in the token's workspace", async () => {
    await handlerOf(
      "DELETE",
      "/v1/orders/{id}",
    )({ context, input: { id: "o1" } })
    expect(orderService.delete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      orderId: "o1",
    })
  })
})
