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

const placeCategoryService = {
  list: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
const placeLocationService = {
  list: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({
  placeCategoryService,
  placeLocationService,
}))

await import("@/features/places-near-me/api/public")

const scopes = workspaceTokenAuthAPIForScope.mock.calls.map((c) => c[0])

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

test("registers under the places scope", () => {
  expect(scopes).toEqual(["places"])
})

describe("place categories public API", () => {
  test("GET list wraps the service result in data", async () => {
    placeCategoryService.list.mockResolvedValue([{ id: "1", locationCount: 2 }])
    await expect(
      handlerOf("GET", "/v1/place-categories")({ context, input: {} }),
    ).resolves.toEqual({ data: [{ id: "1", locationCount: 2 }] })
    expect(placeCategoryService.list).toHaveBeenCalledWith("ws-1")
  })

  test("GET one", async () => {
    await handlerOf(
      "GET",
      "/v1/place-categories/{id}",
    )({ context, input: { id: "7" } })
    expect(placeCategoryService.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      categoryId: "7",
    })
  })

  test("POST create", async () => {
    await handlerOf(
      "POST",
      "/v1/place-categories",
    )({ context, input: { name: "Cafe", rank: 3 } })
    expect(placeCategoryService.create).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "Cafe",
      rank: 3,
    })
  })

  test("PATCH update", async () => {
    await handlerOf(
      "PATCH",
      "/v1/place-categories/{id}",
    )({ context, input: { id: "7", rank: 2 } })
    expect(placeCategoryService.update).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      categoryId: "7",
      data: { rank: 2 },
    })
  })

  test("DELETE returns the uncategorized count", async () => {
    placeCategoryService.delete.mockResolvedValue({
      uncategorizedLocationCount: 2,
    })
    await expect(
      handlerOf(
        "DELETE",
        "/v1/place-categories/{id}",
      )({ context, input: { id: "7" } }),
    ).resolves.toEqual({ uncategorizedLocationCount: 2 })
    expect(placeCategoryService.delete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      categoryId: "7",
    })
  })
})

describe("place locations public API", () => {
  test("GET list passes filter and paging", async () => {
    placeLocationService.list.mockResolvedValue({ data: [], pageCount: 3 })
    await expect(
      handlerOf(
        "GET",
        "/v1/place-locations",
      )({ context, input: { name: "hq", page: 2, perPage: 5 } }),
    ).resolves.toEqual({ data: [], pageCount: 3 })
    expect(placeLocationService.list).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "hq",
      page: 2,
      perPage: 5,
    })
  })

  test("GET one", async () => {
    await handlerOf(
      "GET",
      "/v1/place-locations/{id}",
    )({ context, input: { id: "9" } })
    expect(placeLocationService.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      locationId: "9",
    })
  })

  test("POST create", async () => {
    const input = { name: "HQ", latitude: 1.5, longitude: 2.5, categoryId: "7" }
    await handlerOf("POST", "/v1/place-locations")({ context, input })
    expect(placeLocationService.create).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ...input,
    })
  })

  test("PATCH update", async () => {
    await handlerOf(
      "PATCH",
      "/v1/place-locations/{id}",
    )({ context, input: { id: "9", categoryId: null } })
    expect(placeLocationService.update).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      locationId: "9",
      data: { categoryId: null },
    })
  })

  test("DELETE", async () => {
    await handlerOf(
      "DELETE",
      "/v1/place-locations/{id}",
    )({ context, input: { id: "9" } })
    expect(placeLocationService.delete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      locationId: "9",
    })
  })
})
