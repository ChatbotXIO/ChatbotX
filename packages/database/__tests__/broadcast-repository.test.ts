// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  audienceFindMany: vi.fn(),
  count: vi.fn(),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findMany: mocks.findMany,
        findFirst: mocks.findFirst,
      },
      contactsOnBroadcastsModel: {
        findMany: mocks.audienceFindMany,
      },
    },
    $count: mocks.count,
  },
  eq: mocks.eq,
  relationsFilterToSQL: vi.fn(() => "sql-filter"),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: { name: "broadcastModel.name" },
  contactsOnBroadcastsModel: { broadcastId: "broadcastId-column" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(() => ({ limit: 10, offset: 0 })),
  likeContains: vi.fn((value: string) => `%${value}%`),
  parseOrderByAsObject: vi.fn(() => ({})),
}))

const { broadcastRepository } = await import(
  "../src/repositories/broadcast/repository"
)

describe("broadcastRepository.listWithRelations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("scopes to the workspace and excludes soft-deleted rows", async () => {
    mocks.findMany.mockResolvedValue([{ id: "broadcast-1" }])

    const result = await broadcastRepository.listWithRelations({
      workspaceId: "ws-1",
    })

    expect(result).toEqual([{ id: "broadcast-1" }])
    const call = mocks.findMany.mock.calls[0]?.[0] as {
      where: { workspaceId: string; deletedAt: { isNull: boolean } }
      with: { flow: unknown; integrationWhatsapp: unknown }
    }
    expect(call.where.workspaceId).toBe("ws-1")
    expect(call.where.deletedAt).toEqual({ isNull: true })
    expect(call.with.flow).toBeDefined()
    expect(call.with.integrationWhatsapp).toBeDefined()
  })

  test("passes the status filter through to the where clause", async () => {
    mocks.findMany.mockResolvedValue([])

    await broadcastRepository.listWithRelations({
      workspaceId: "ws-1",
      status: "failed",
    })

    const call = mocks.findMany.mock.calls[0]?.[0] as {
      where: { status?: string }
    }
    expect(call.where.status).toBe("failed")
  })

  test("omits status from the where clause when it is null", async () => {
    mocks.findMany.mockResolvedValue([])

    await broadcastRepository.listWithRelations({
      workspaceId: "ws-1",
      status: null,
    })

    const call = mocks.findMany.mock.calls[0]?.[0] as {
      where: { status?: string }
    }
    expect(call.where.status).toBeUndefined()
  })
})

describe("broadcastRepository.listAudience / countAudience", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("lists audience rows scoped to the broadcast id", async () => {
    mocks.audienceFindMany.mockResolvedValue([{ contactId: "contact-1" }])

    const result = await broadcastRepository.listAudience({
      broadcastId: "broadcast-1",
      limit: 20,
      offset: 0,
    })

    expect(result).toEqual([{ contactId: "contact-1" }])
    expect(mocks.audienceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { broadcastId: "broadcast-1" },
        with: { contact: true },
      }),
    )
  })

  test("counts audience rows scoped to the broadcast id", async () => {
    mocks.count.mockResolvedValue(3)

    const result = await broadcastRepository.countAudience("broadcast-1")

    expect(result).toBe(3)
    expect(mocks.count).toHaveBeenCalled()
  })
})

describe("broadcastRepository.findByIdOrName", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("looks up by id when idOrName is numeric", async () => {
    mocks.findFirst.mockResolvedValue({ id: "123" })

    await broadcastRepository.findByIdOrName({
      workspaceId: "ws-1",
      idOrName: "123",
    })

    const call = mocks.findFirst.mock.calls[0]?.[0] as {
      where: { id?: string; name?: string; workspaceId: string }
    }
    expect(call.where.id).toBe("123")
    expect(call.where.name).toBeUndefined()
  })

  test("looks up by name when idOrName is not numeric", async () => {
    mocks.findFirst.mockResolvedValue({ name: "My Broadcast" })

    await broadcastRepository.findByIdOrName({
      workspaceId: "ws-1",
      idOrName: "My Broadcast",
    })

    const call = mocks.findFirst.mock.calls[0]?.[0] as {
      where: { id?: string; name?: string; workspaceId: string }
    }
    expect(call.where.name).toBe("My Broadcast")
    expect(call.where.id).toBeUndefined()
  })
})
