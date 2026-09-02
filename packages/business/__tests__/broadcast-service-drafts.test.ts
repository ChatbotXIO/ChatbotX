import { beforeEach, describe, expect, test, vi } from "vitest"

const findManyBroadcast = vi.fn()
const findFirstBroadcast = vi.fn()
const findFirstFlow = vi.fn()
const findFirstIntegrationWhatsapp = vi.fn()
const findFirstIntegrationMessenger = vi.fn()
const updateReturning = vi.fn()
const deleteReturning = vi.fn()
const pruneFilter = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findMany: (...args: unknown[]) => findManyBroadcast(...args),
        findFirst: (...args: unknown[]) => findFirstBroadcast(...args),
      },
      flowModel: {
        findFirst: (...args: unknown[]) => findFirstFlow(...args),
      },
      integrationWhatsappModel: {
        findFirst: (...args: unknown[]) =>
          findFirstIntegrationWhatsapp(...args),
      },
      integrationMessengerModel: {
        findFirst: (...args: unknown[]) =>
          findFirstIntegrationMessenger(...args),
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
  flowModel: {},
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
  pruneEmailPhoneFilterConditions: (...args: unknown[]) => pruneFilter(...args),
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
  findFirstBroadcast.mockReset()
  findFirstFlow.mockReset()
  findFirstIntegrationWhatsapp.mockReset()
  findFirstIntegrationMessenger.mockReset()
  updateReturning.mockReset()
  deleteReturning.mockReset()
  pruneFilter.mockReset().mockImplementation((filter: unknown) => filter)
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

describe("broadcastService.findDraft", () => {
  test("looks the broadcast up scoped to the workspace and draft status", async () => {
    findFirstBroadcast.mockResolvedValue({ id: "b-1" })

    const result = await broadcastService.findDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
    })

    expect(result).toEqual({ id: "b-1" })
    expect(findFirstBroadcast.mock.calls[0][0].where).toEqual({
      id: "b-1",
      workspaceId: "ws-1",
      status: "draft",
    })
  })

  test("returns null when no draft matches", async () => {
    findFirstBroadcast.mockResolvedValue(undefined)

    await expect(
      broadcastService.findDraft({ workspaceId: "ws-1", broadcastId: "b-1" }),
    ).resolves.toBeNull()
  })
})

describe("broadcastService.updateDraft", () => {
  const contactFilter = { operator: "and" as const, conditions: [] }

  const flowDraftData = {
    channel: "whatsapp" as const,
    flowId: "flow-9",
    subaction: "whatsappTemplateMessage" as const,
    schedulesType: "future" as const,
    schedulesAt: "2030-01-01T09:30:20.000Z",
    contactFilter,
    saveAsDraft: true,
  }

  test("re-derives the name from the flow and keeps the row a draft", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    const result = await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      canViewEmailAndPhone: true,
      data: flowDraftData,
    })

    expect(result).toEqual({ id: "b-1", status: "draft" })

    const { values, condition } = updateReturning.mock.calls[0][0]
    expect(values).toMatchObject({
      channel: "whatsapp",
      subaction: "whatsappTemplateMessage",
      flowId: "flow-9",
      templateId: null,
      integrationWhatsappId: null,
      integrationMessengerId: null,
      name: "Autumn sale",
      contactFilter,
      schedulesType: "future",
      status: "draft",
      templateData: null,
    })
    // Persisted time is minute-truncated, exactly like createBroadcastAction.
    expect(values.schedulesAt.toISOString()).toBe("2030-01-01T09:30:00.000Z")

    expect(flatten(condition)).toEqual([
      { __eq: ["broadcast.id", "b-1"] },
      { __eq: ["broadcast.workspaceId", "ws-1"] },
      { __eq: ["broadcast.status", "draft"] },
    ])
  })

  test("moves the draft to scheduled when saveAsDraft is false", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    const result = await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      canViewEmailAndPhone: true,
      data: { ...flowDraftData, saveAsDraft: false },
    })

    expect(result.status).toBe("scheduled")
    expect(updateReturning.mock.calls[0][0].values.status).toBe("scheduled")
  })

  test("prunes email/phone conditions the member may not view", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      canViewEmailAndPhone: false,
      data: flowDraftData,
    })

    expect(pruneFilter).toHaveBeenCalledWith(contactFilter, false)
  })

  test("rejects a subaction the channel does not support", async () => {
    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        canViewEmailAndPhone: true,
        data: { ...flowDraftData, subaction: "telegramAllContacts" },
      }),
    ).rejects.toThrow("Unsupported broadcast subaction")
    expect(updateReturning).not.toHaveBeenCalled()
  })

  test("rejects a payload with neither flow nor template", async () => {
    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        canViewEmailAndPhone: true,
        data: { ...flowDraftData, flowId: undefined },
      }),
    ).rejects.toThrow("Either flow or template must be selected")
  })

  test("rejects a flow that does not belong to the workspace", async () => {
    findFirstFlow.mockResolvedValue(undefined)

    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        canViewEmailAndPhone: true,
        data: flowDraftData,
      }),
    ).rejects.toThrow("Flow not found")
    expect(findFirstFlow.mock.calls[0][0].where).toEqual({
      workspaceId: "ws-1",
      id: "flow-9",
    })
    expect(updateReturning).not.toHaveBeenCalled()
  })

  test("rejects a WhatsApp integration owned by another workspace", async () => {
    findFirstIntegrationWhatsapp.mockResolvedValue(undefined)

    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        canViewEmailAndPhone: true,
        data: { ...flowDraftData, integrationWhatsappId: "foreign-1" },
      }),
    ).rejects.toThrow("Integration not found")
    expect(findFirstIntegrationWhatsapp.mock.calls[0][0].where).toEqual({
      id: "foreign-1",
      workspaceId: "ws-1",
    })
    expect(updateReturning).not.toHaveBeenCalled()
  })

  test("throws when the conditional update matched no draft row", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    updateReturning.mockResolvedValue([])

    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        canViewEmailAndPhone: true,
        data: flowDraftData,
      }),
    ).rejects.toThrow("Broadcast is not a draft")
  })
})
