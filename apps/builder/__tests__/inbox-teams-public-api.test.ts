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

const inboxTeamService = {
  findByIdOrFail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  addMembers: vi.fn(),
  removeMembers: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ inboxTeamService }))

const listInboxTeams = vi.fn()
vi.mock("../src/enterprise/features/inbox-teams/queries", () => ({
  listInboxTeams,
}))

await import("@/enterprise/features/inbox-teams/api/public")

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
const context = { workspace: { id: "ws-1", ownerId: "owner-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the inbox-teams public router under the inbox scope", () => {
  expect(scopeArgAtImport).toBe("inbox")
})

describe("GET /v1/teams/{id}", () => {
  const procedure = findProcedure("GET", "/v1/teams/{id}")

  test("delegates to inboxTeamService.findByIdOrFail", async () => {
    inboxTeamService.findByIdOrFail.mockResolvedValueOnce({ id: "1" })

    const result = await procedure.handler?.({ context, input: { id: "1" } })

    expect(inboxTeamService.findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxTeamId: "1",
    })
    expect(result).toEqual({ id: "1" })
  })
})

describe("POST /v1/teams", () => {
  const procedure = findProcedure("POST", "/v1/teams")

  test("delegates to inboxTeamService.create", async () => {
    inboxTeamService.create.mockResolvedValueOnce({ id: "1" })

    const input = { name: "Support", userIds: ["user-1"] }
    const result = await procedure.handler?.({ context, input })

    expect(inboxTeamService.create).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      data: input,
    })
    expect(result).toEqual({ id: "1" })
  })
})

describe("PUT /v1/teams/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/teams/{id}")

  test("updates then re-fetches the team by id", async () => {
    inboxTeamService.findByIdOrFail.mockResolvedValueOnce({
      id: "1",
      name: "Renamed",
    })

    const result = await procedure.handler?.({
      context,
      input: { id: "1", name: "Renamed" },
    })

    expect(inboxTeamService.update).toHaveBeenCalledWith(
      { workspaceId: "ws-1", inboxTeamId: "1" },
      { name: "Renamed" },
    )
    expect(inboxTeamService.findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxTeamId: "1",
    })
    expect(result).toEqual({ id: "1", name: "Renamed" })
  })
})

describe("DELETE /v1/teams/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/teams/{id}")

  test("delegates to inboxTeamService.delete for a single id", async () => {
    await procedure.handler?.({ context, input: { id: "1" } })

    expect(inboxTeamService.delete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["1"],
    })
  })
})

describe("POST /v1/teams/{id}/members", () => {
  const procedure = findProcedure("POST", "/v1/teams/{id}/members")

  test("adds members then re-fetches the team", async () => {
    inboxTeamService.findByIdOrFail.mockResolvedValueOnce({ id: "1" })

    const result = await procedure.handler?.({
      context,
      input: { id: "1", userIds: ["user-1", "user-2"] },
    })

    expect(inboxTeamService.addMembers).toHaveBeenCalledWith(
      { workspaceId: "ws-1", inboxTeamId: "1" },
      ["user-1", "user-2"],
    )
    expect(result).toEqual({ id: "1" })
  })
})

describe("DELETE /v1/teams/{id}/members", () => {
  const procedure = findProcedure("DELETE", "/v1/teams/{id}/members")

  test("removes members then re-fetches the team", async () => {
    inboxTeamService.findByIdOrFail.mockResolvedValueOnce({ id: "1" })

    const result = await procedure.handler?.({
      context,
      input: { id: "1", memberIds: ["member-1"] },
    })

    expect(inboxTeamService.removeMembers).toHaveBeenCalledWith(
      { workspaceId: "ws-1", inboxTeamId: "1" },
      ["member-1"],
    )
    expect(result).toEqual({ id: "1" })
  })
})
