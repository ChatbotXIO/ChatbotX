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

const vendorService = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ vendorService }))

await import("@/features/product-vendors/api/public")

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

test("registers the product vendors public router under the ecommerce scope", () => {
  expect(scopeArgAtImport).toBe("ecommerce")
})

describe("product vendors public API", () => {
  test("GET /v1/product-vendors passes the name filter and paging", async () => {
    vendorService.list.mockResolvedValue({ data: [], pageCount: 3 })
    await expect(
      handlerOf(
        "GET",
        "/v1/product-vendors",
      )({
        context,
        input: { name: "acme", page: 2, perPage: 5 },
      }),
    ).resolves.toEqual({ data: [], pageCount: 3 })
    expect(vendorService.list).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "acme",
      page: 2,
      perPage: 5,
    })
  })

  test("GET /v1/product-vendors without paging lists every vendor", async () => {
    vendorService.list.mockResolvedValue({ data: [], pageCount: 1 })
    await handlerOf("GET", "/v1/product-vendors")({ context, input: {} })
    expect(vendorService.list).toHaveBeenCalledWith({ workspaceId: "ws-1" })
  })

  test("POST /v1/product-vendors creates with the vendor's rules", async () => {
    await handlerOf(
      "POST",
      "/v1/product-vendors",
    )({
      context,
      input: { name: "Acme", discountPercent: 20, minimumOrderValue: 50 },
    })
    expect(vendorService.create).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "Acme",
      discountPercent: 20,
      minimumOrderValue: 50,
    })
  })

  test("PATCH /v1/product-vendors/{id} can switch a vendor off alone", async () => {
    await handlerOf(
      "PATCH",
      "/v1/product-vendors/{id}",
    )({
      context,
      input: { id: "v1", isActive: false },
    })
    expect(vendorService.update).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      vendorId: "v1",
      data: { isActive: false },
    })
  })

  test("DELETE /v1/product-vendors/{id} deletes in the token's workspace", async () => {
    await handlerOf(
      "DELETE",
      "/v1/product-vendors/{id}",
    )({
      context,
      input: { id: "v1" },
    })
    expect(vendorService.delete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      vendorId: "v1",
    })
  })
})
