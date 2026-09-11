import { beforeEach, describe, expect, test, vi } from "vitest"

const findManyBroadcast = vi.fn()
const findFirstBroadcast = vi.fn()
const findFirstFlow = vi.fn()
const findFirstIntegrationWhatsapp = vi.fn()
const findFirstIntegrationMessenger = vi.fn()
const updateReturning = vi.fn()
const findManyBroadcastTarget = vi.fn()
const deleteTargetsWhere = vi.fn()
const pruneFilter = vi.fn()
const mockDispatchAuditRecord = vi.fn().mockResolvedValue(undefined)

vi.mock("@chatbotx.io/analytics", () => ({
  broadcastAnalyticsService: { getContacts: vi.fn() },
  sequenceAnalyticsService: { getContacts: vi.fn() },
}))

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
    // updateDraft rewrites the row and its target rows in one transaction;
    // the tx mirrors `db.update` and treats the target writes as no-ops here
    // (they are covered by broadcast-targets.test.ts).
    transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        query: {
          broadcastTargetModel: {
            findMany: (...args: unknown[]) => findManyBroadcastTarget(...args),
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
          where: (condition: unknown) => {
            deleteTargetsWhere(condition)
            return Promise.resolve()
          },
        }),
        insert: () => ({ values: () => Promise.resolve() }),
      }),
  },
  and: (...args: unknown[]) => ({ __and: args }),
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  gt: vi.fn(),
  inArray: (a: unknown, b: unknown) => ({ __inArray: [a, b] }),
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
    deletedAt: "broadcast.deletedAt",
  },
  broadcastTargetModel: {
    broadcastId: "broadcastTarget.broadcastId",
    inboxId: "broadcastTarget.inboxId",
  },
  inboxModel: {},
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

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

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
  findManyBroadcastTarget.mockReset().mockResolvedValue([])
  deleteTargetsWhere.mockReset()
  pruneFilter.mockReset().mockImplementation((filter: unknown) => filter)
  mockDispatchAuditRecord.mockClear()
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
      { __isNull: "broadcast.deletedAt" },
    ])
    // A future schedule is audited as a launch only when the send actually
    // happens, not here.
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("audits a launch when scheduling for 'now'", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "now",
      schedulesAt: new Date("2026-09-01T09:00:00Z"),
    })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "launch",
      detail: "launched a broadcast (#b-1)",
    })
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
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("drops a page left without a template when scheduling, keeping the ready pages", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "targets" }])
    findManyBroadcastTarget.mockResolvedValue([
      { inboxId: "inbox-a", flowId: null, templateId: "tpl-1" },
      { inboxId: "inbox-b", flowId: null, templateId: null },
    ])

    const result = await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "now",
      schedulesAt: new Date(),
    })

    expect(result).toEqual({ id: "b-1" })
    expect(deleteTargetsWhere).toHaveBeenCalledTimes(1)
    // Only the template-less page is deleted; the ready page is kept.
    expect(flatten(deleteTargetsWhere.mock.calls[0][0])).toEqual([
      { __eq: ["broadcastTarget.broadcastId", "b-1"] },
      { __inArray: ["broadcastTarget.inboxId", ["inbox-b"]] },
    ])
  })

  test("keeps every page when they all carry a template (nothing to prune)", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "targets" }])
    findManyBroadcastTarget.mockResolvedValue([
      { inboxId: "inbox-a", flowId: null, templateId: "tpl-1" },
      { inboxId: "inbox-b", flowId: null, templateId: "tpl-2" },
    ])

    await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "now",
      schedulesAt: new Date(),
    })

    expect(deleteTargetsWhere).not.toHaveBeenCalled()
  })

  test("drops a page left without a flow when scheduling, keeping the flow page", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "targets" }])
    findManyBroadcastTarget.mockResolvedValue([
      { inboxId: "inbox-a", flowId: "flow-1", templateId: null },
      { inboxId: "inbox-b", flowId: null, templateId: null },
    ])

    const result = await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "now",
      schedulesAt: new Date(),
    })

    expect(result).toEqual({ id: "b-1" })
    expect(deleteTargetsWhere).toHaveBeenCalledTimes(1)
    expect(flatten(deleteTargetsWhere.mock.calls[0][0])).toEqual([
      { __eq: ["broadcastTarget.broadcastId", "b-1"] },
      { __inArray: ["broadcastTarget.inboxId", ["inbox-b"]] },
    ])
  })

  test("rejects scheduling a flow send when not one page has a flow (would send to nobody)", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "targets" }])
    findManyBroadcastTarget.mockResolvedValue([
      { inboxId: "inbox-a", flowId: null, templateId: null },
      { inboxId: "inbox-b", flowId: null, templateId: null },
    ])

    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "now",
        schedulesAt: new Date(),
      }),
    ).rejects.toThrow("Select a template or flow for at least one page")
    expect(deleteTargetsWhere).not.toHaveBeenCalled()
  })

  test("rejects scheduling when not one page has a template (would send to nobody)", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "targets" }])
    findManyBroadcastTarget.mockResolvedValue([
      { inboxId: "inbox-a", flowId: null, templateId: null },
      { inboxId: "inbox-b", flowId: null, templateId: null },
    ])

    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "now",
        schedulesAt: new Date(),
      }),
    ).rejects.toThrow("Select a template or flow for at least one page")
    expect(deleteTargetsWhere).not.toHaveBeenCalled()
  })

  test("rejects scheduling a targets-mode draft whose pages all cascaded away (send to nobody)", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "targets" }])
    findManyBroadcastTarget.mockResolvedValue([])

    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "now",
        schedulesAt: new Date(),
      }),
    ).rejects.toThrow("Select a template or flow for at least one page")
    expect(deleteTargetsWhere).not.toHaveBeenCalled()
  })

  test("schedules a legacy channel-mode draft without touching targets", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "channel" }])

    const result = await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "now",
      schedulesAt: new Date(),
    })

    expect(result).toEqual({ id: "b-1" })
    // A channel-mode broadcast has no target rows — never read, never pruned.
    expect(findManyBroadcastTarget).not.toHaveBeenCalled()
    expect(deleteTargetsWhere).not.toHaveBeenCalled()
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
      deletedAt: { isNull: true },
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
      deletedAt: { isNull: true },
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
      { __isNull: "broadcast.deletedAt" },
    ])
    // An edit that stays a draft never launches.
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
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
    // A future schedule is audited as a launch when the send actually
    // happens, not on this edit.
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("audits a launch when the edit promotes the draft to scheduled 'now'", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      canViewEmailAndPhone: true,
      data: { ...flowDraftData, saveAsDraft: false, schedulesType: "now" },
    })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "launch",
      detail: "launched a broadcast (#b-1)",
    })
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

describe("broadcastService.updateDraft template data integrity", () => {
  test("clears templateData when the edit switched the draft back to a flow", async () => {
    // The form's flow/template toggle can leave a stale `templateData` behind;
    // without a templateId the broadcast is not a template send, so the column
    // must be nulled rather than persisted.
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      canViewEmailAndPhone: true,
      data: {
        channel: "whatsapp",
        flowId: "flow-9",
        subaction: "whatsappTemplateMessage",
        schedulesType: "now",
        schedulesAt: null,
        contactFilter: { operator: "and", conditions: [] },
        saveAsDraft: true,
        templateData: { body: [{ text: "stale" }] },
        buttons: [{ id: "btn-1", label: "Shop" }],
      },
    })

    expect(updateReturning.mock.calls[0][0].values.templateData).toBeNull()
  })
})
