import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  resolveBroadcastInboxIds: vi.fn(),
  count: vi.fn(),
  selectLimit: vi.fn(),
  selectOrderBy: vi.fn(),
  selectWhere: vi.fn(),
  chunkById: vi.fn(),
  buildContactInboxContactFilterSQL: vi.fn(() => ({ RAW: "contact-filter" })),
  contactInboxInteractedWithin24hSQL: vi.fn(() => ({
    RAW: "recent-interaction",
  })),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("../../inbox/service", () => ({
  inboxService: {
    resolveBroadcastInboxIds: mocks.resolveBroadcastInboxIds,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {
    id: "Broadcast.id",
    name: "Broadcast.name",
    workspaceId: "Broadcast.workspaceId",
    channel: "Broadcast.channel",
    createdAt: "Broadcast.createdAt",
  },
  contactInboxModel: {
    id: "ContactInbox.id",
    inboxId: "ContactInbox.inboxId",
    contactId: "ContactInbox.contactId",
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    $count: mocks.count,
    select: () => ({
      from: () => ({
        where: (where: unknown) => {
          mocks.selectWhere(where)
          return {
            orderBy: (orderBy: unknown) => {
              mocks.selectOrderBy(orderBy)
              return {
                limit: (limit: number) => {
                  mocks.selectLimit(limit)
                  return Promise.resolve([])
                },
              }
            },
            limit: (limit: number) => {
              mocks.selectLimit(limit)
              return Promise.resolve([])
            },
          }
        },
      }),
    }),
  },
  and: (...args: unknown[]) => ({ __and: args }),
  asc: (value: unknown) => ({ __asc: value }),
  desc: (value: unknown) => ({ __desc: value }),
  eq: (left: unknown, right: unknown) => ({ __eq: [left, right] }),
  gt: (left: unknown, right: unknown) => ({ __gt: [left, right] }),
  inArray: (left: unknown, right: unknown) => ({ __inArray: [left, right] }),
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: mocks.buildContactInboxContactFilterSQL,
  contactInboxInteractedWithin24hSQL: mocks.contactInboxInteractedWithin24hSQL,
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: mocks.chunkById,
}))

const { broadcastService } = await import("../service")

const contactFilter = {
  operator: "and" as const,
  conditions: [
    {
      field: "fullName",
      operator: "contains",
      value: "Ada",
    },
  ],
}

beforeEach(() => {
  mocks.resolveBroadcastInboxIds.mockReset()
  mocks.count.mockReset()
  mocks.selectLimit.mockReset()
  mocks.selectOrderBy.mockReset()
  mocks.selectWhere.mockReset()
  mocks.chunkById.mockReset()
  mocks.buildContactInboxContactFilterSQL.mockClear()
  mocks.contactInboxInteractedWithin24hSQL.mockClear()
})

describe("broadcastService.listOptions", () => {
  test("returns newest broadcast options with a bounded payload", async () => {
    const result = await broadcastService.listOptions({
      workspaceId: "ws-1",
      channel: "whatsapp",
    })

    expect(result).toEqual([])
    expect(mocks.selectWhere).toHaveBeenCalledWith({
      __and: [
        { __eq: ["Broadcast.workspaceId", "ws-1"] },
        { __eq: ["Broadcast.channel", "whatsapp"] },
      ],
    })
    expect(mocks.selectOrderBy).toHaveBeenCalledWith({
      __desc: "Broadcast.createdAt",
    })
    expect(mocks.selectLimit).toHaveBeenCalledWith(500)
  })
})

describe("broadcastService.countAudience", () => {
  test("returns zero without counting when no inboxes resolve", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue([])

    const total = await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["messenger"],
    })

    expect(total).toBe(0)
    expect(mocks.count).not.toHaveBeenCalled()
  })

  test("includes the 24h predicate for windowed broadcast subactions", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.count.mockResolvedValue(7)

    const total = await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["whatsapp"],
      contactFilter,
      subaction: "whatsappWithin24Hours",
    })

    expect(total).toBe(7)
    expect(mocks.count).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        __and: expect.arrayContaining([
          { __inArray: ["ContactInbox.inboxId", ["inbox-1"]] },
          { RAW: "contact-filter" },
          { RAW: "recent-interaction" },
        ]),
      }),
    )
    expect(mocks.buildContactInboxContactFilterSQL).toHaveBeenCalledWith({
      contactIdColumn: "ContactInbox.contactId",
      workspaceId: "ws-1",
      contactFilter,
    })
  })

  test("omits the 24h predicate for non-windowed broadcast subactions", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.count.mockResolvedValue(3)

    await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["messenger"],
      subaction: "messengerTemplateMessage",
    })

    const where = mocks.count.mock.calls[0]?.[1] as { __and?: unknown[] }
    expect(where.__and).toContainEqual({
      __inArray: ["ContactInbox.inboxId", ["inbox-1"]],
    })
    expect(where.__and).not.toContainEqual({ RAW: "recent-interaction" })
    expect(mocks.buildContactInboxContactFilterSQL).not.toHaveBeenCalled()
  })

  test("forwards integrationMessengerId when resolving the audience inboxes", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-messenger"])
    mocks.count.mockResolvedValue(4)

    await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["messenger"],
      integrationMessengerId: "messenger-1",
      subaction: "messengerTemplateMessage",
    })

    expect(mocks.resolveBroadcastInboxIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channels: ["messenger"],
      integrationWhatsappId: undefined,
      integrationMessengerId: "messenger-1",
    })
  })
})

describe("broadcastService.forEachAudienceChunk", () => {
  test("does not invoke the chunk callback when no inboxes resolve", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue([])
    const onChunk = vi.fn()

    await broadcastService.forEachAudienceChunk(
      { workspaceId: "ws-1", channels: ["messenger"] },
      onChunk,
    )

    expect(mocks.chunkById).not.toHaveBeenCalled()
    expect(onChunk).not.toHaveBeenCalled()
  })

  test("queries chunks and forwards rows to the chunk callback", async () => {
    const rows = [{ id: "ci-1", contactId: "contact-1" }]
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.chunkById.mockImplementation(
      async (
        queryFn: (lastId?: string) => Promise<unknown>,
        opts: { callback: (items: typeof rows) => Promise<unknown> },
      ) => {
        await queryFn("last-ci")
        await opts.callback(rows)
      },
    )
    const onChunk = vi.fn()

    await broadcastService.forEachAudienceChunk(
      {
        workspaceId: "ws-1",
        channels: ["messenger"],
        subaction: "messengerActiveContacts",
        chunkSize: 50,
      },
      onChunk,
    )

    expect(mocks.chunkById).toHaveBeenCalledWith(expect.any(Function), {
      chunkSize: 50,
      callback: onChunk,
    })
    expect(mocks.selectWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        __and: expect.arrayContaining([
          expect.objectContaining({
            __and: expect.arrayContaining([
              { __inArray: ["ContactInbox.inboxId", ["inbox-1"]] },
              { RAW: "recent-interaction" },
            ]),
          }),
          { __gt: ["ContactInbox.id", "last-ci"] },
        ]),
      }),
    )
    expect(onChunk).toHaveBeenCalledWith(rows)
  })
})
