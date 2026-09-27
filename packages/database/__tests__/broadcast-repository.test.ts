// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({
    and: conditions.filter((condition) => condition !== undefined),
  })),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  audienceFindMany: vi.fn(),
  count: vi.fn(),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
  isNull: vi.fn((field: unknown) => ({ isNull: field })),
  ne: vi.fn((field: unknown, value: unknown) => ({ ne: [field, value] })),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: mocks.and,
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
  inArray: mocks.inArray,
  isNull: mocks.isNull,
  ne: mocks.ne,
  relationsFilterToSQL: vi.fn(() => "sql-filter"),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {
    id: "broadcastModel.id",
    name: "broadcastModel.name",
    workspaceId: "broadcastModel.workspaceId",
    channel: "broadcastModel.channel",
    status: "broadcastModel.status",
    deletedAt: "broadcastModel.deletedAt",
  },
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

  // The broadcast "view" dialog reads each page's template/flow from
  // `targets`; without it a multi-page broadcast shows no page, flow or
  // template at all.
  test("loads every target page with its page and flow names", async () => {
    mocks.findMany.mockResolvedValue([])

    await broadcastRepository.listWithRelations({ workspaceId: "ws-1" })

    const call = mocks.findMany.mock.calls[0]?.[0] as {
      with: { targets: unknown }
    }
    expect(call.with.targets).toEqual({
      with: {
        inbox: { columns: { id: true, name: true } },
        flow: { columns: { id: true, name: true } },
      },
    })
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

describe("broadcastRepository.countActive", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("counts active rows by workspace, channel, statuses, and non-deleted state", async () => {
    mocks.count.mockResolvedValue(1)

    const result = await broadcastRepository.countActive({
      workspaceId: "ws-1",
      channel: "messenger",
      statuses: ["scheduled", "sending"],
    })

    expect(result).toBe(1)
    expect(mocks.count).toHaveBeenCalledWith(expect.anything(), {
      and: [
        { field: "broadcastModel.workspaceId", value: "ws-1" },
        { field: "broadcastModel.channel", value: "messenger" },
        {
          field: "broadcastModel.status",
          values: ["scheduled", "sending"],
        },
        { isNull: "broadcastModel.deletedAt" },
      ],
    })
    expect(mocks.ne).not.toHaveBeenCalled()
  })

  test("excludes the supplied broadcast id and uses the passed transaction", async () => {
    const transactionCount = vi.fn().mockResolvedValue(2)

    const result = await broadcastRepository.countActive(
      {
        workspaceId: "ws-1",
        channel: "messenger",
        statuses: ["scheduled", "sending"],
        excludeId: "broadcast-1",
      },
      { $count: transactionCount } as never,
    )

    expect(result).toBe(2)
    expect(transactionCount).toHaveBeenCalledWith(expect.anything(), {
      and: expect.arrayContaining([
        { ne: ["broadcastModel.id", "broadcast-1"] },
      ]),
    })
    expect(mocks.count).not.toHaveBeenCalled()
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
