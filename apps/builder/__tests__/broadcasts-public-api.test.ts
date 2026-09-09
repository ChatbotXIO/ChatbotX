// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// Mirrors analytics-public-api.test.ts: stub the real db client so the
// feature's transitive imports (queries -> broadcastService -> db) don't
// open a real pg.Pool at module load.
vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: unknown[]) => unknown
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
      handler: vi.fn((fn: (...args: unknown[]) => unknown) => {
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

const broadcastService = {
  findByIdOrName: vi.fn(),
  listExistingIds: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateDraft: vi.fn(),
  scheduleDraft: vi.fn(),
  moveToDraft: vi.fn(),
  stopSending: vi.fn(),
  resumeSending: vi.fn(),
  resendWithPruning: vi.fn(),
  softDeleteBroadcasts: vi.fn(),
}
const contactInboxService = { findManyByIds: vi.fn() }

vi.mock("@chatbotx.io/business", () => ({
  broadcastService,
  contactInboxService,
}))

const broadcastAnalyticsService = { getContacts: vi.fn() }
vi.mock("@chatbotx.io/analytics", () => ({ broadcastAnalyticsService }))

vi.mock("../src/features/broadcasts/queries", () => ({
  listBroadcasts: vi.fn(),
  listBroadcastAudience: vi.fn(),
}))

await import("@/features/broadcasts/api/public")

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

test("registers the broadcasts public router under the broadcasts scope", () => {
  expect(scopeArgAtImport).toBe("broadcasts")
})

describe("POST /v1/broadcasts", () => {
  const procedure = findProcedure("POST", "/v1/broadcasts")

  test("sources workspaceId from context and treats the token caller as fully privileged", async () => {
    broadcastService.create.mockResolvedValueOnce({ id: "b-1" })

    const result = await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { channel: "whatsapp", flowId: "flow-1" },
    })

    expect(broadcastService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        channel: "whatsapp",
        flowId: "flow-1",
        canViewEmailAndPhone: true,
      }),
    )
    expect(result).toEqual({ id: "b-1" })
  })
})

describe("PATCH /v1/broadcasts/{id}", () => {
  const procedure = findProcedure("PATCH", "/v1/broadcasts/{id}")

  test("renames the broadcast then re-fetches it from context's workspace", async () => {
    broadcastService.update.mockResolvedValueOnce(undefined)
    broadcastService.findByIdOrName.mockResolvedValueOnce({
      id: "b-1",
      name: "New name",
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "b-1", name: "New name" },
    })

    expect(broadcastService.update).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "b-1" },
      { name: "New name" },
    )
    expect(broadcastService.findByIdOrName).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      idOrName: "b-1",
    })
    expect(result).toEqual({ id: "b-1", name: "New name" })
  })
})

describe("PUT /v1/broadcasts/{id}/draft", () => {
  const procedure = findProcedure("PUT", "/v1/broadcasts/{id}/draft")

  test("delegates to updateDraft with the token caller treated as fully privileged", async () => {
    broadcastService.updateDraft.mockResolvedValueOnce({
      id: "b-1",
      status: "draft",
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "b-1", channel: "whatsapp", flowId: "flow-1" },
    })

    expect(broadcastService.updateDraft).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      canViewEmailAndPhone: true,
      data: { channel: "whatsapp", flowId: "flow-1" },
    })
    expect(result).toEqual({ id: "b-1", status: "draft" })
  })
})

describe("POST /v1/broadcasts/{id}/schedule", () => {
  const procedure = findProcedure("POST", "/v1/broadcasts/{id}/schedule")

  test("resolves 'now' to the current minute-truncated time", async () => {
    broadcastService.scheduleDraft.mockResolvedValueOnce({ id: "b-1" })

    await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "b-1", schedulesType: "now", schedulesAt: null },
    })

    const call = broadcastService.scheduleDraft.mock.calls[0][0]
    expect(call.workspaceId).toBe("ws-1")
    expect(call.broadcastId).toBe("b-1")
    expect(call.schedulesType).toBe("now")
    expect(call.schedulesAt.getSeconds()).toBe(0)
    expect(call.schedulesAt.getTime()).toBeLessThanOrEqual(Date.now())
  })

  test("passes a future time through unchanged (minute-truncated)", async () => {
    broadcastService.scheduleDraft.mockResolvedValueOnce({ id: "b-1" })

    await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: {
        id: "b-1",
        schedulesType: "future",
        schedulesAt: "2030-01-01T09:30:20.000Z",
      },
    })

    const call = broadcastService.scheduleDraft.mock.calls[0][0]
    expect(call.schedulesAt.toISOString()).toBe("2030-01-01T09:30:00.000Z")
  })
})

describe("POST /v1/broadcasts/{id}/move-to-draft", () => {
  const procedure = findProcedure("POST", "/v1/broadcasts/{id}/move-to-draft")

  test("delegates to moveToDraft scoped to context's workspace", async () => {
    broadcastService.moveToDraft.mockResolvedValueOnce({ id: "b-1" })

    const result = await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "b-1" },
    })

    expect(broadcastService.moveToDraft).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastId: "b-1",
    })
    expect(result).toEqual({ id: "b-1" })
  })
})

describe("POST /v1/broadcasts/{id}/stop", () => {
  const procedure = findProcedure("POST", "/v1/broadcasts/{id}/stop")

  test("delegates to stopSending scoped to context's workspace", async () => {
    broadcastService.stopSending.mockResolvedValueOnce({ id: "b-1" })

    await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "b-1" },
    })

    expect(broadcastService.stopSending).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastId: "b-1",
    })
  })
})

describe("POST /v1/broadcasts/{id}/resume", () => {
  const procedure = findProcedure("POST", "/v1/broadcasts/{id}/resume")

  test("delegates to resumeSending scoped to context's workspace", async () => {
    broadcastService.resumeSending.mockResolvedValueOnce({ id: "b-1" })

    await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "b-1" },
    })

    expect(broadcastService.resumeSending).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastId: "b-1",
    })
  })
})

describe("POST /v1/broadcasts/{id}/resend", () => {
  const procedure = findProcedure("POST", "/v1/broadcasts/{id}/resend")

  test("delegates to resendWithPruning treating the token caller as fully privileged", async () => {
    broadcastService.resendWithPruning.mockResolvedValueOnce({
      id: "b-2",
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "b-1" },
    })

    expect(broadcastService.resendWithPruning).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "b-1",
      canViewEmailAndPhone: true,
    })
    expect(result).toEqual({ id: "b-2" })
  })
})

describe("DELETE /v1/broadcasts/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/broadcasts/{id}")

  test("delegates to softDeleteBroadcasts with a single-id array, scoped to context's workspace", async () => {
    broadcastService.softDeleteBroadcasts.mockResolvedValueOnce({
      deletedCount: 1,
      requestedCount: 1,
    })

    await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "b-1" },
    })

    expect(broadcastService.softDeleteBroadcasts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["b-1"],
    })
  })
})

describe("GET /v1/broadcasts/{id}/contacts", () => {
  const procedure = findProcedure("GET", "/v1/broadcasts/{id}/contacts")

  test("404s when the broadcast does not exist in this workspace", async () => {
    broadcastService.listExistingIds.mockResolvedValueOnce([])

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "ws-1" } },
        input: { id: "b-1", eventType: "message:sent", page: 1, perPage: 20 },
      }),
    ).rejects.toThrow()

    expect(broadcastAnalyticsService.getContacts).not.toHaveBeenCalled()
  })

  test("returns an empty page without a contact-inbox lookup when there are no matching recipients", async () => {
    broadcastService.listExistingIds.mockResolvedValueOnce(["b-1"])
    broadcastAnalyticsService.getContacts.mockResolvedValueOnce({
      contactInboxIds: [],
      contactEventMap: new Map(),
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "b-1", eventType: "message:sent", page: 1, perPage: 20 },
    })

    expect(result).toEqual({ data: [], page: 1, perPage: 20 })
    expect(contactInboxService.findManyByIds).not.toHaveBeenCalled()
  })

  test("joins recipient events with contact-inbox details", async () => {
    broadcastService.listExistingIds.mockResolvedValueOnce(["b-1"])
    broadcastAnalyticsService.getContacts.mockResolvedValueOnce({
      contactInboxIds: ["ci-1"],
      contactEventMap: new Map([
        [
          "ci-1",
          { occurredAt: "2026-01-01T00:00:00.000Z", errorContent: null },
        ],
      ]),
    })
    contactInboxService.findManyByIds.mockResolvedValueOnce([
      {
        id: "ci-1",
        sourceId: "src-1",
        channel: "whatsapp",
        contact: {
          id: "contact-1",
          firstName: "Ada",
          lastName: "Lovelace",
          fullName: "Ada Lovelace",
          avatar: null,
        },
      },
    ])

    const result = await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "b-1", eventType: "message:sent", page: 1, perPage: 20 },
    })

    expect(result).toEqual({
      data: [
        {
          contactId: "ci-1",
          contactInboxId: "ci-1",
          firstName: "Ada",
          lastName: "Lovelace",
          fullName: "Ada Lovelace",
          sourceId: "src-1",
          avatar: null,
          channel: "whatsapp",
          errorContent: null,
          occurredAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      page: 1,
      perPage: 20,
    })
  })
})
