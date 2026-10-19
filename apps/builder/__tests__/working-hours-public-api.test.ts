import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  tags: string[]
  successStatus?: number
}
type Handler = (args: { context: unknown; input: unknown }) => Promise<unknown>
type Captured = { route: RouteConfig; handler?: Handler; hasOutput: boolean }

const { workspaceTokenAuthAPIForScope, captured } = vi.hoisted(() => {
  const captured: Captured[] = []
  const api = {
    route: (route: RouteConfig) => {
      const record: Captured = { route, hasOutput: false }
      captured.push(record)
      const chain = {
        input: () => chain,
        output: () => {
          record.hasOutput = true
          return chain
        },
        errors: () => chain,
        handler: (fn: Handler) => {
          record.handler = fn
          return { handler: fn }
        },
      }
      return chain
    },
  }
  return {
    workspaceTokenAuthAPIForScope: vi.fn((_scope: string) => api),
    captured,
  }
})
vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const workingHoursService = {
  listByWorkspace: vi.fn(),
  findByIdOrFail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  replaceMembers: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ workingHoursService }))

const assertWorkspaceNotBlocked = vi.fn()
vi.mock("@/lib/workspace-quota", () => ({ assertWorkspaceNotBlocked }))

await import("@/features/working-hours/api/public")
const scopeAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

const find = (method: string, path: string) => {
  const found = captured.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found?.handler) {
    throw new Error(`No procedure for ${method} ${path}`)
  }
  return found as Captured & { handler: Handler }
}

const context = { workspace: { id: "ws-1", ownerId: "owner-1" } }
const now = new Date("2026-01-01T00:00:00Z")
const row = {
  id: "9",
  workspaceId: "ws-1",
  name: "Office",
  createdAt: now,
  updatedAt: now,
  intervals: [
    { id: "i2", weekday: 2, startMinute: 600, endMinute: 1440 },
    { id: "i1", weekday: 1, startMinute: 540, endMinute: 1020 },
  ],
  members: [{ userId: "u2" }, { userId: "u1" }],
}
const resource = {
  id: "9",
  name: "Office",
  intervals: [
    { weekday: 1, startMinute: 540, endMinute: 1020 },
    { weekday: 2, startMinute: 600, endMinute: 1440 },
  ],
  memberUserIds: ["u1", "u2"],
  createdAt: now,
  updatedAt: now,
}

beforeEach(() => {
  vi.clearAllMocks()
})

test("uses the inbox scope and tags every route 'Working Hours'", () => {
  expect(scopeAtImport).toBe("inbox")
  expect(captured).toHaveLength(6)
  expect(captured.every((p) => p.route.tags[0] === "Working Hours")).toBe(true)
})

describe("reads", () => {
  test("list paginates the service rows as resources", async () => {
    workingHoursService.listByWorkspace.mockResolvedValueOnce([row, row, row])
    const result = (await find("GET", "/v1/working-hours").handler({
      context,
      input: { page: 2, perPage: 2 },
    })) as { data: unknown[]; pageCount: number }
    expect(workingHoursService.listByWorkspace).toHaveBeenCalledWith({
      workspaceId: "ws-1",
    })
    expect(result.data).toEqual([resource])
    expect(result.pageCount).toBe(2)
  })

  test("get scopes the lookup to the caller's workspace", async () => {
    workingHoursService.findByIdOrFail.mockResolvedValueOnce(row)
    const result = await find("GET", "/v1/working-hours/{id}").handler({
      context,
      input: { id: "9" },
    })
    expect(workingHoursService.findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workingHoursId: "9",
    })
    expect(result).toEqual(resource)
  })

  test("get propagates not-found for a foreign or unknown id", async () => {
    workingHoursService.findByIdOrFail.mockRejectedValueOnce(
      new Error("Working hours not found"),
    )
    await expect(
      find("GET", "/v1/working-hours/{id}").handler({
        context,
        input: { id: "404" },
      }),
    ).rejects.toThrow("Working hours not found")
  })
})

describe("mutations", () => {
  test("create returns 201 with the single resource shape", async () => {
    workingHoursService.create.mockResolvedValueOnce(row)
    const procedure = find("POST", "/v1/working-hours")
    const input = { name: "Office", userIds: ["u1"] }
    const result = await procedure.handler({ context, input })
    expect(procedure.route.successStatus).toBe(201)
    expect(assertWorkspaceNotBlocked).toHaveBeenCalledWith("owner-1")
    expect(workingHoursService.create).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      data: input,
    })
    expect(result).toEqual(resource)
  })

  test("update passes only the changed fields and returns the resource", async () => {
    workingHoursService.update.mockResolvedValueOnce(row)
    const result = await find("PATCH", "/v1/working-hours/{id}").handler({
      context,
      input: { id: "9", name: "Office" },
    })
    expect(assertWorkspaceNotBlocked).toHaveBeenCalledWith("owner-1")
    expect(workingHoursService.update).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workingHoursId: "9",
      data: { name: "Office" },
    })
    expect(result).toEqual(resource)
  })

  test("setMembers replaces members and returns the resource", async () => {
    workingHoursService.replaceMembers.mockResolvedValueOnce(row)
    const result = await find("PUT", "/v1/working-hours/{id}/members").handler({
      context,
      input: { id: "9", userIds: ["u1", "u2"] },
    })
    expect(assertWorkspaceNotBlocked).toHaveBeenCalledWith("owner-1")
    expect(workingHoursService.replaceMembers).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workingHoursId: "9",
      userIds: ["u1", "u2"],
    })
    expect(result).toEqual(resource)
  })

  test("delete returns 204 without an output and calls the service", async () => {
    const procedure = find("DELETE", "/v1/working-hours/{id}")
    const result = await procedure.handler({ context, input: { id: "9" } })
    expect(procedure.route.successStatus).toBe(204)
    expect(procedure.hasOutput).toBe(false)
    expect(workingHoursService.delete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workingHoursId: "9",
    })
    expect(result).toBeUndefined()
  })

  test.each([
    ["POST", "/v1/working-hours", { name: "x" }, "create"],
    ["PATCH", "/v1/working-hours/{id}", { id: "9" }, "update"],
    [
      "PUT",
      "/v1/working-hours/{id}/members",
      { id: "9", userIds: [] },
      "replaceMembers",
    ],
  ] as const)("%s %s surfaces a 422 validation error from the service and writes nothing else", async (method, path, input, serviceMethod) => {
    const error = new Error("Intervals overlap on weekday 1")
    workingHoursService[serviceMethod].mockRejectedValueOnce(error)
    await expect(find(method, path).handler({ context, input })).rejects.toBe(
      error,
    )
  })

  test("a blocked owner stops the mutation before the service runs", async () => {
    assertWorkspaceNotBlocked.mockRejectedValueOnce(new Error("blocked"))
    await expect(
      find("POST", "/v1/working-hours").handler({
        context,
        input: { name: "x" },
      }),
    ).rejects.toThrow("blocked")
    expect(workingHoursService.create).not.toHaveBeenCalled()
  })
})
