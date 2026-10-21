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

const ecommerceOpenHoursService = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ ecommerceOpenHoursService }))

await import("@/features/ecommerce-open-hours/api/public")

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

test("registers the open-hours public router under the ecommerce scope", () => {
  expect(scopeArgAtImport).toBe("ecommerce")
})

const ranges = [{ day: 1, from: "09:00", to: "17:00" }]

describe("open hours public API", () => {
  test("GET /v1/open-hours lists the token's schedules", async () => {
    ecommerceOpenHoursService.list.mockResolvedValue([
      { id: "h1", name: "Weekdays", ranges },
    ])
    await expect(
      handlerOf("GET", "/v1/open-hours")({ context }),
    ).resolves.toEqual({ data: [{ id: "h1", name: "Weekdays", ranges }] })
    expect(ecommerceOpenHoursService.list).toHaveBeenCalledWith("ws-1")
  })

  test("POST /v1/open-hours creates in the token's workspace", async () => {
    await handlerOf(
      "POST",
      "/v1/open-hours",
    )({
      context,
      input: { name: "Weekdays", ranges },
    })
    expect(ecommerceOpenHoursService.create).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "Weekdays",
      ranges,
    })
  })

  test("PATCH /v1/open-hours/{id} changes only what it is sent", async () => {
    await handlerOf(
      "PATCH",
      "/v1/open-hours/{id}",
    )({
      context,
      input: { id: "h1", name: "Weekend" },
    })
    expect(ecommerceOpenHoursService.update).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      openHoursId: "h1",
      data: { name: "Weekend" },
    })
  })

  test("DELETE /v1/open-hours/{id} deletes in the token's workspace", async () => {
    await handlerOf(
      "DELETE",
      "/v1/open-hours/{id}",
    )({
      context,
      input: { id: "h1" },
    })
    expect(ecommerceOpenHoursService.delete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      openHoursId: "h1",
    })
  })
})
