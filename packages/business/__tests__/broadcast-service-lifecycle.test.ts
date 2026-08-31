import { beforeEach, describe, expect, test, vi } from "vitest"

const findManyBroadcast = vi.fn()
const updateReturning = vi.fn()
const dbSelectWhere = vi.fn()

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
    select: (_fields: unknown) => ({
      from: (_table: unknown) => ({
        where: (condition: unknown) => dbSelectWhere(condition),
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
  sql: Object.assign(
    (_strings: TemplateStringsArray, ..._values: unknown[]) => ({
      mapWith: (_fn: unknown) => ({ __sql: true }),
    }),
    { raw: vi.fn() },
  ),
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
  dbSelectWhere.mockReset()
})

describe("broadcastService.listAwaitingFinalization", () => {
  test("selects sending broadcasts whose hand-off completed", async () => {
    findManyBroadcast.mockResolvedValue([
      {
        id: "b-1",
        workspaceId: "ws-1",
        contactCount: 3,
        handoffCompletedAt: new Date(),
      },
    ])

    const rows = await broadcastService.listAwaitingFinalization()

    expect(findManyBroadcast).toHaveBeenCalledWith({
      where: { status: "sending", handoffCompletedAt: { isNotNull: true } },
      columns: {
        id: true,
        workspaceId: true,
        contactCount: true,
        handoffCompletedAt: true,
      },
    })
    expect(rows).toHaveLength(1)
  })
})

describe("broadcastService.markHandoffCompleted", () => {
  test("stamps handoffCompletedAt only for a sending broadcast that has none", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    const applied = await broadcastService.markHandoffCompleted({
      broadcastId: "b-1",
    })

    expect(applied).toBe(true)
    const { values, condition } = updateReturning.mock.calls[0][0]
    expect(values.handoffCompletedAt).toBeInstanceOf(Date)
    expect(flatten(condition)).toEqual([
      { __eq: ["broadcast.id", "b-1"] },
      { __eq: ["broadcast.status", "sending"] },
      { __isNull: "broadcast.handoffCompletedAt" },
    ])
  })

  test("returns false when nothing matched", async () => {
    updateReturning.mockResolvedValue([])
    expect(
      await broadcastService.markHandoffCompleted({ broadcastId: "b-1" }),
    ).toBe(false)
  })
})

describe("broadcastService.countRecipientOutcomes", () => {
  test("counts completed (delivered or failed) and failed rows in a single query", async () => {
    dbSelectWhere.mockResolvedValue([{ completed: 8, failed: 3 }])

    const result = await broadcastService.countRecipientOutcomes({
      broadcastId: "b-1",
    })

    expect(result).toEqual({ completed: 8, failed: 3 })
    expect(dbSelectWhere).toHaveBeenCalledTimes(1)
    expect(flatten(dbSelectWhere.mock.calls[0][0])).toEqual([
      { __eq: ["cob.broadcastId", "b-1"] },
    ])
  })

  test("defaults to zero counts when no row is returned", async () => {
    dbSelectWhere.mockResolvedValue([])

    const result = await broadcastService.countRecipientOutcomes({
      broadcastId: "b-1",
    })

    expect(result).toEqual({ completed: 0, failed: 0 })
  })
})

describe("broadcastService.completeSending", () => {
  test("applies the terminal status only while still sending and after hand-off", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    const applied = await broadcastService.completeSending({
      broadcastId: "b-1",
      status: "failed",
    })

    expect(applied).toBe(true)
    const { values, condition } = updateReturning.mock.calls[0][0]
    expect(values).toEqual({ status: "failed" })
    expect(flatten(condition)).toEqual([
      { __eq: ["broadcast.id", "b-1"] },
      { __eq: ["broadcast.status", "sending"] },
      { __isNotNull: "broadcast.handoffCompletedAt" },
    ])
  })

  test("returns false when it lost the race", async () => {
    updateReturning.mockResolvedValue([])
    expect(
      await broadcastService.completeSending({
        broadcastId: "b-1",
        status: "sent",
      }),
    ).toBe(false)
  })
})
