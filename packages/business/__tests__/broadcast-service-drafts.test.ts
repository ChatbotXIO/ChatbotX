import { beforeEach, describe, expect, test, vi } from "vitest"

const findManyBroadcast = vi.fn()
const updateReturning = vi.fn()
const deleteReturning = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findMany: (...args: unknown[]) => findManyBroadcast(...args),
      },
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => ({
          returning: () => updateReturning({ values, condition }),
        }),
      }),
    }),
    delete: () => ({
      where: (condition: unknown) => ({
        returning: () => deleteReturning({ condition }),
      }),
    }),
  },
  and: (...args: unknown[]) => ({ __and: args }),
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  gt: vi.fn(),
  inArray: vi.fn(),
  isNotNull: (a: unknown) => ({ __isNotNull: a }),
  isNull: (a: unknown) => ({ __isNull: a }),
  or: (...args: unknown[]) => ({ __or: args }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {
    id: "broadcast.id",
    workspaceId: "broadcast.workspaceId",
    status: "broadcast.status",
    handoffCompletedAt: "broadcast.handoffCompletedAt",
  },
  contactsOnBroadcastsModel: {
    broadcastId: "cob.broadcastId",
    deliveredAt: "cob.deliveredAt",
    failedAt: "cob.failedAt",
  },
  contactInboxModel: {},
  contactModel: {},
  conversationModel: {},
  integrationMessengerModel: {},
  integrationWhatsappModel: {},
  messengerMessageTemplateModel: {},
  whatsappMessageTemplateModel: {},
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: vi.fn(),
  contactInboxInteractedWithin24hSQL: vi.fn(),
  pruneEmailPhoneFilterConditions: vi.fn(),
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: vi.fn(),
  likeContains: (value: string) => `%${value}%`,
}))

vi.mock("../src/inbox/service", () => ({ inboxService: {} }))

const { broadcastService } = await import("../src/broadcast/service")

const flatten = (condition: unknown): unknown[] => {
  const c = condition as { __and?: unknown[]; __or?: unknown[] }
  if (c.__and) {
    return c.__and.flatMap(flatten)
  }
  if (c.__or) {
    return c.__or.flatMap(flatten)
  }
  return [condition]
}

beforeEach(() => {
  findManyBroadcast.mockReset()
  updateReturning.mockReset()
  deleteReturning.mockReset()
})

describe("broadcastService.scheduleDraft", () => {
  test("moves a draft to scheduled, scoped to the workspace and draft status", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1" }])
    const schedulesAt = new Date("2026-09-01T09:00:00Z")

    const result = await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "future",
      schedulesAt,
    })

    expect(result).toEqual({ id: "b-1" })
    const { values, condition } = updateReturning.mock.calls[0][0]
    expect(values).toEqual({
      status: "scheduled",
      schedulesType: "future",
      schedulesAt,
    })
    expect(flatten(condition)).toEqual([
      { __eq: ["broadcast.id", "b-1"] },
      { __eq: ["broadcast.workspaceId", "ws-1"] },
      { __eq: ["broadcast.status", "draft"] },
    ])
  })

  test("throws when the broadcast is not a draft of this workspace", async () => {
    updateReturning.mockResolvedValue([])
    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "now",
        schedulesAt: new Date(),
      }),
    ).rejects.toThrow("Broadcast is not a draft")
  })
})

describe("broadcastService.deleteDraft", () => {
  test("deletes a draft scoped to the workspace", async () => {
    deleteReturning.mockResolvedValue([{ id: "b-1" }])

    await broadcastService.deleteDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
    })

    expect(flatten(deleteReturning.mock.calls[0][0].condition)).toEqual([
      { __eq: ["broadcast.id", "b-1"] },
      { __eq: ["broadcast.workspaceId", "ws-1"] },
      { __eq: ["broadcast.status", "draft"] },
    ])
  })

  test("throws when nothing was deleted", async () => {
    deleteReturning.mockResolvedValue([])
    await expect(
      broadcastService.deleteDraft({ workspaceId: "ws-1", broadcastId: "b-1" }),
    ).rejects.toThrow("Broadcast is not a draft")
  })
})

describe("broadcastService.listForCalendar", () => {
  test("queries the range scoped to the workspace with a 500-row cap", async () => {
    findManyBroadcast.mockResolvedValue([])
    const from = new Date("2026-07-25T00:00:00Z")
    const to = new Date("2026-09-08T23:59:59Z")

    await broadcastService.listForCalendar({
      workspaceId: "ws-1",
      from,
      to,
      status: "scheduled",
      name: "sale",
    })

    const args = findManyBroadcast.mock.calls[0][0]
    expect(args.where).toEqual({
      workspaceId: "ws-1",
      schedulesAt: { gte: from, lte: to },
      status: "scheduled",
      name: { ilike: "%sale%" },
    })
    expect(args.limit).toBe(500)
    expect(args.orderBy).toEqual({ schedulesAt: "asc" })
  })
})
