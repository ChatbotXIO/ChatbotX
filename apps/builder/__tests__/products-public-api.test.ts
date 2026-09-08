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
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ productService }))

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

describe("PATCH /v1/products/{id}", () => {
  const procedure = findProcedure("PATCH", "/v1/products/{id}")

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
