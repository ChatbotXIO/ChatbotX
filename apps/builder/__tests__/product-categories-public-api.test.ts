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

const productCategoryService = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ productCategoryService }))

await import("@/features/product-categories/api/public")

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

test("registers the product categories public router under the ecommerce scope", () => {
  expect(scopeArgAtImport).toBe("ecommerce")
})

describe("GET /v1/product-categories", () => {
  const procedure = findProcedure("GET", "/v1/product-categories")

  test("lists categories scoped to the token's workspace", async () => {
    productCategoryService.list.mockResolvedValueOnce([
      {
        id: "c-1",
        parentId: null,
        name: "Electronics",
        rank: 10,
        productCount: 2,
      },
    ])

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
      }),
    ).resolves.toEqual({
      data: [
        {
          id: "c-1",
          parentId: null,
          name: "Electronics",
          rank: 10,
          productCount: 2,
        },
      ],
    })

    expect(productCategoryService.list).toHaveBeenCalledWith("workspace-1")
  })
})

describe("POST /v1/product-categories", () => {
  const procedure = findProcedure("POST", "/v1/product-categories")

  test("creates a top-level category when parentId is omitted", async () => {
    productCategoryService.create.mockResolvedValueOnce({ id: "c-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { name: "Electronics" },
    })

    expect(productCategoryService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "Electronics",
      rank: undefined,
      parentId: null,
    })
  })
})

describe("PATCH /v1/product-categories/{id}", () => {
  const procedure = findProcedure("PATCH", "/v1/product-categories/{id}")

  test("updates a category scoped to the token's workspace", async () => {
    productCategoryService.update.mockResolvedValueOnce({ id: "c-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "c-1", name: "Renamed", parentId: null },
    })

    expect(productCategoryService.update).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      categoryId: "c-1",
      name: "Renamed",
      parentId: null,
    })
  })

  // `parentId` has three states, and the service branches on `undefined` to
  // decide whether to run the reparent guards. Collapsing an absent key into
  // `null` would silently un-parent a sub-category on a rename-only request.
  test("omits parentId entirely when the caller did not send it", async () => {
    productCategoryService.update.mockResolvedValueOnce({ id: "c-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "c-1", name: "Renamed" },
    })

    expect(productCategoryService.update).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      categoryId: "c-1",
      name: "Renamed",
    })
    const [call] = productCategoryService.update.mock.calls
    expect(call?.[0]).not.toHaveProperty("parentId")
  })

  test("files the category under a parent when parentId is an id", async () => {
    productCategoryService.update.mockResolvedValueOnce({ id: "c-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "c-1", name: "Phones", parentId: "c-parent" },
    })

    expect(productCategoryService.update).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      categoryId: "c-1",
      name: "Phones",
      parentId: "c-parent",
    })
  })
})

describe("DELETE /v1/product-categories/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/product-categories/{id}")

  test("deletes a category scoped to the token's workspace", async () => {
    productCategoryService.delete.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "c-1" },
    })

    expect(productCategoryService.delete).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      categoryId: "c-1",
    })
  })
})
