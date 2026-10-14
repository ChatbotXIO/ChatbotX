import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

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

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const productService = {
  list: vi.fn(),
  findById: vi.fn(),
  createFull: vi.fn(),
  updateFull: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
const integrationMetaCatalogService = {
  disconnect: vi.fn(),
  searchProductsForSend: vi.fn(),
}
const productMessageService = { listSendable: vi.fn() }
vi.mock("@chatbotx.io/business", () => ({
  productService,
  integrationMetaCatalogService,
  productMessageService,
}))
vi.mock("@chatbotx.io/business/import", () => ({
  createImportUpload: vi.fn(),
  importService: { list: vi.fn(), find: vi.fn() },
}))

await import("@/features/products/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the products public router under the ecommerce scope", () => {
  expect(scopeArgAtImport).toBe("ecommerce")
})

describe("DELETE /v1/products/meta-catalog", () => {
  const procedure = findProcedure("DELETE", "/v1/products/meta-catalog")

  test("disconnects the token workspace's catalog", async () => {
    await procedure.handler?.({ context: { workspace: { id: "ws-1" } } })

    expect(integrationMetaCatalogService.disconnect).toHaveBeenCalledWith(
      "ws-1",
    )
  })

  test("a running sync refusal is passed through for the declared 409", async () => {
    integrationMetaCatalogService.disconnect.mockRejectedValueOnce(
      Object.assign(new Error("busy"), {
        code: "metaCatalogSyncAlreadyRunning",
        httpStatusCode: 409,
      }),
    )

    await expect(
      procedure.handler?.({ context: { workspace: { id: "ws-1" } } }),
    ).rejects.toMatchObject({ code: "metaCatalogSyncAlreadyRunning" })
  })
})

describe("GET /v1/products/meta-catalog/items", () => {
  const procedure = findProcedure("GET", "/v1/products/meta-catalog/items")

  test("searches the token workspace's catalog by keyword and returns ids an agent can use", async () => {
    const result = {
      connected: true,
      items: [{ retailerId: "sku-1", name: "Shoe", imageUrl: null }],
    }
    integrationMetaCatalogService.searchProductsForSend.mockResolvedValueOnce(
      result,
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { keyword: "shoe" },
      }),
    ).resolves.toEqual(result)

    expect(
      integrationMetaCatalogService.searchProductsForSend,
    ).toHaveBeenCalledWith({ keyword: "shoe", workspaceId: "workspace-1" })
  })

  test("looks one item up by its exact retailer id", async () => {
    integrationMetaCatalogService.searchProductsForSend.mockResolvedValueOnce({
      connected: true,
      items: [{ retailerId: "sku-1", name: "Shoe", imageUrl: null }],
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { retailerId: "sku-1" },
    })

    expect(
      integrationMetaCatalogService.searchProductsForSend,
    ).toHaveBeenCalledWith({
      keyword: undefined,
      retailerId: "sku-1",
      workspaceId: "workspace-1",
    })
  })

  test("reports a workspace without a catalog as not connected instead of failing", async () => {
    integrationMetaCatalogService.searchProductsForSend.mockResolvedValueOnce({
      connected: false,
      items: [],
    })

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: {},
      }),
    ).resolves.toEqual({ connected: false, items: [] })
  })

  test("never lets the caller pick another workspace", async () => {
    integrationMetaCatalogService.searchProductsForSend.mockResolvedValueOnce({
      connected: false,
      items: [],
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { keyword: "x", workspaceId: "foreign-ws" },
    })

    expect(
      integrationMetaCatalogService.searchProductsForSend,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })
})

describe("GET /v1/products", () => {
  const procedure = findProcedure("GET", "/v1/products")

  test("lists products scoped to the token's workspace", async () => {
    productService.list.mockResolvedValueOnce({ data: [], pageCount: 1 })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50 },
    })

    expect(productService.list).toHaveBeenCalledWith({
      page: 1,
      perPage: 50,
      workspaceId: "workspace-1",
    })
  })
})

describe("GET /v1/products/sendable", () => {
  const procedure = findProcedure("GET", "/v1/products/sendable")

  test("lists sendable products for the token's workspace and the requested channel", async () => {
    productMessageService.listSendable.mockResolvedValueOnce({
      ready: true,
      data: [],
      pageCount: 0,
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { channel: "whatsapp", keyword: "shoe", page: 2, perPage: 10 },
    })

    expect(productMessageService.listSendable).toHaveBeenCalledWith({
      channel: "whatsapp",
      keyword: "shoe",
      page: 2,
      perPage: 10,
      workspaceId: "workspace-1",
    })
    expect(result).toEqual({ ready: true, data: [], pageCount: 0 })
  })

  test("a workspace id in the input can never override the token's workspace", async () => {
    productMessageService.listSendable.mockResolvedValueOnce({
      ready: false,
      reason: "channelUnsupported",
      data: [],
      pageCount: 0,
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { channel: "telegram", workspaceId: "other-workspace" },
    })

    expect(productMessageService.listSendable).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })
})

describe("GET /v1/products/{id}", () => {
  const procedure = findProcedure("GET", "/v1/products/{id}")

  test("fetches a product scoped to the token's workspace", async () => {
    productService.findById.mockResolvedValueOnce({ id: "p-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "p-1" },
    })

    expect(productService.findById).toHaveBeenCalledWith("p-1", "workspace-1")
  })
})

describe("POST /v1/products", () => {
  const procedure = findProcedure("POST", "/v1/products")

  test("creates a product scoped to the token's workspace", async () => {
    productService.createFull.mockResolvedValueOnce({ id: "p-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { name: "New product" },
    })

    expect(productService.createFull).toHaveBeenCalledWith({
      name: "New product",
      workspaceId: "workspace-1",
    })
  })
})

describe("PUT /v1/products/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/products/{id}")

  test("replaces a product scoped to the token's workspace", async () => {
    productService.updateFull.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "p-1", name: "Updated" },
    })

    expect(productService.updateFull).toHaveBeenCalledWith({
      productId: "p-1",
      workspaceId: "workspace-1",
      name: "Updated",
    })
  })
})

describe("DELETE /v1/products/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/products/{id}")

  test("deletes a product scoped to the token's workspace after confirming it exists", async () => {
    productService.findById.mockResolvedValueOnce({ id: "p-1" })
    productService.delete.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "p-1" },
    })

    expect(productService.findById).toHaveBeenCalledWith("p-1", "workspace-1")
    expect(productService.delete).toHaveBeenCalledWith({
      ids: ["p-1"],
      workspaceId: "workspace-1",
    })
  })

  test("404s (does not call delete) when the product does not exist", async () => {
    productService.findById.mockRejectedValueOnce(
      new Error("Product does not exist."),
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing" },
      }),
    ).rejects.toThrow("Product does not exist.")

    expect(productService.delete).not.toHaveBeenCalled()
  })
})

describe("PATCH /v1/products/{id}/active", () => {
  const procedure = findProcedure("PATCH", "/v1/products/{id}/active")

  test("toggles only isActive, scoped to the token's workspace", async () => {
    productService.findById.mockResolvedValueOnce({ id: "p-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "p-1", isActive: false },
    })

    expect(productService.update).toHaveBeenCalledWith({
      productId: "p-1",
      workspaceId: "workspace-1",
      data: { isActive: false },
    })
  })

  test("404s (does not update) when the product does not exist", async () => {
    productService.findById.mockRejectedValueOnce(
      new Error("Product does not exist."),
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing", isActive: true },
      }),
    ).rejects.toThrow("Product does not exist.")

    expect(productService.update).not.toHaveBeenCalled()
  })
})

describe("POST /v1/products/bulk-delete", () => {
  test("deletes the given ids in the token's workspace", async () => {
    await findProcedure("POST", "/v1/products/bulk-delete").handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { ids: ["p-1", "p-2"] },
    })

    expect(productService.delete).toHaveBeenCalledWith({
      ids: ["p-1", "p-2"],
      workspaceId: "workspace-1",
    })
  })
})
