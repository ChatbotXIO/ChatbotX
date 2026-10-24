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

const discountCodeService = {
  list: vi.fn(),
  get: vi.fn(),
  generateCode: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
  delete: vi.fn(),
}
const orderService = { quote: vi.fn() }
const contactService = { resolveIdByIdentifier: vi.fn() }
vi.mock("@chatbotx.io/business", () => ({
  discountCodeService,
  orderService,
  contactService,
}))

await import("@/features/discount-codes/api/public")

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

test("registers the discount code router under the ecommerce scope", () => {
  expect(scopeArgAtImport).toBe("ecommerce")
})

describe("discount codes public API", () => {
  test("lists in the token's workspace", async () => {
    discountCodeService.list.mockResolvedValue({ data: [], pageCount: 1 })
    await handlerOf(
      "GET",
      "/v1/discount-codes",
    )({
      context,
      input: { code: "sum" },
    })
    expect(discountCodeService.list).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      code: "sum",
    })
  })

  test("creates with every optional field filled in", async () => {
    discountCodeService.create.mockResolvedValue({ id: "dc1" })
    await handlerOf(
      "POST",
      "/v1/discount-codes",
    )({
      context,
      input: {
        code: "SUMMER",
        autoApply: false,
        discountType: "percentage",
        discountValue: 20,
        appliesTo: "entireOrder",
        productIds: [],
        minimumType: "none",
        minimumValue: 0,
        oncePerCustomer: false,
        eligibility: "everyone",
        isActive: true,
      },
    })
    expect(discountCodeService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        code: "SUMMER",
        categoryId: null,
        usageLimit: null,
        customerFilter: null,
        endsAt: null,
        startsAt: expect.any(Date),
      }),
    )
  })

  test("updates only the fields sent, keeping an explicit null", async () => {
    discountCodeService.update.mockResolvedValue({ id: "dc1" })
    await handlerOf(
      "PATCH",
      "/v1/discount-codes/{id}",
    )({
      context,
      input: { id: "dc1", discountValue: 15, endsAt: null },
    })
    expect(discountCodeService.update).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      discountCodeId: "dc1",
      data: { discountValue: 15, endsAt: null },
    })
  })

  test("turns a code on or off", async () => {
    await handlerOf(
      "PATCH",
      "/v1/discount-codes/{id}/active",
    )({
      context,
      input: { id: "dc1", isActive: false },
    })
    expect(discountCodeService.setActive).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      discountCodeId: "dc1",
      isActive: false,
    })
  })

  test("suggests a free code", async () => {
    discountCodeService.generateCode.mockResolvedValue("AbCd2345")
    await expect(
      handlerOf("GET", "/v1/discount-codes/generate-code")({ context }),
    ).resolves.toEqual({ code: "AbCd2345" })
    expect(discountCodeService.generateCode).toHaveBeenCalledWith("ws-1")
  })

  test("validate prices the code like an order would, for the contact", async () => {
    contactService.resolveIdByIdentifier.mockResolvedValue("c1")
    orderService.quote.mockResolvedValue({
      currency: "USD",
      discount: { code: "CODE20", amount: 6 },
      discountError: null,
      totals: { total: 24 },
    })
    await expect(
      handlerOf(
        "POST",
        "/v1/discount-codes/validate",
      )({
        context,
        input: {
          code: "code20",
          items: [{ productId: "p1", quantity: 3 }],
          contact: "id:1",
        },
      }),
    ).resolves.toEqual({
      valid: true,
      amount: 6,
      currency: "USD",
      error: null,
      total: 24,
    })
    expect(orderService.quote).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      items: [{ productId: "p1", quantity: 3 }],
      shippingType: undefined,
      contactId: "c1",
      discountCode: "code20",
    })
  })

  test("validate says why a code cannot be used", async () => {
    orderService.quote.mockResolvedValue({
      currency: "USD",
      discount: null,
      discountError: { code: "discountCodeExpired" },
      totals: { total: 30 },
    })
    await expect(
      handlerOf(
        "POST",
        "/v1/discount-codes/validate",
      )({
        context,
        input: { code: "OLD", items: [{ productId: "p1", quantity: 1 }] },
      }),
    ).resolves.toMatchObject({
      valid: false,
      amount: 0,
      error: { code: "discountCodeExpired" },
    })
    expect(contactService.resolveIdByIdentifier).not.toHaveBeenCalled()
  })
})

describe("discount code PATCH schema", () => {
  test("leaves every omitted field out, defaulted ones included", async () => {
    const { updateDiscountCodePublicRequest } = await import(
      "@/features/discount-codes/schema/public"
    )
    const parsed = updateDiscountCodePublicRequest.parse({
      id: "12",
      code: "NEWNAME",
    })
    expect(parsed).toEqual({ id: "12", code: "NEWNAME" })
  })
})
