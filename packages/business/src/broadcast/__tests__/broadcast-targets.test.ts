import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  resolveBroadcastInboxIds: vi.fn(),
  inboxFindMany: vi.fn(),
  integrationWhatsappFindFirst: vi.fn(),
  integrationMessengerFindFirst: vi.fn(),
  flowFindFirst: vi.fn(),
  flowFindMany: vi.fn(),
  targetFindMany: vi.fn(),
  selectRows: [] as Record<string, unknown>[],
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  deleteWhere: vi.fn(),
  transaction: vi.fn(),
  dispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/analytics", () => ({
  broadcastAnalyticsService: { getContacts: vi.fn() },
}))

vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))

vi.mock("../../inbox/service", () => ({
  inboxService: { resolveBroadcastInboxIds: mocks.resolveBroadcastInboxIds },
}))

vi.mock("../../audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {
    id: "Broadcast.id",
    workspaceId: "Broadcast.workspaceId",
    status: "Broadcast.status",
    deletedAt: "Broadcast.deletedAt",
  },
  broadcastTargetModel: {
    broadcastId: "BroadcastTarget.broadcastId",
    inboxId: "BroadcastTarget.inboxId",
  },
  contactInboxModel: {},
  contactModel: {},
  contactsOnBroadcastsModel: {},
  conversationModel: {},
  inboxModel: {},
  integrationMessengerModel: {
    id: "IntegrationMessenger.id",
    name: "IntegrationMessenger.name",
    inboxId: "IntegrationMessenger.inboxId",
    workspaceId: "IntegrationMessenger.workspaceId",
  },
  integrationWhatsappModel: {
    id: "IntegrationWhatsapp.id",
    name: "IntegrationWhatsapp.name",
    inboxId: "IntegrationWhatsapp.inboxId",
    workspaceId: "IntegrationWhatsapp.workspaceId",
  },
  messengerMessageTemplateModel: {
    id: "MessengerMessageTemplate.id",
    integrationMessengerId: "MessengerMessageTemplate.integrationMessengerId",
  },
  whatsappMessageTemplateModel: {
    id: "WhatsappMessageTemplate.id",
    integrationWhatsappId: "WhatsappMessageTemplate.integrationWhatsappId",
  },
}))

vi.mock("@chatbotx.io/database/client", () => {
  const tx = {
    insert: () => ({
      // Awaitable on its own (a plain insert) and chainable to `.returning()`.
      values: (values: unknown) => {
        mocks.insertValues(values)
        return Object.assign(Promise.resolve(undefined), {
          returning: () => mocks.insertReturning(values),
        })
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        mocks.updateSet(values)
        return {
          where: (where: unknown) => {
            mocks.updateWhere(where)
            return { returning: () => mocks.updateReturning() }
          },
        }
      },
    }),
    delete: () => ({
      where: (where: unknown) => {
        mocks.deleteWhere(where)
        return Promise.resolve()
      },
    }),
    query: {
      broadcastTargetModel: { findMany: mocks.targetFindMany },
    },
  }
  const selectBuilder = {
    from: () => selectBuilder,
    innerJoin: () => selectBuilder,
    where: () => selectBuilder,
    limit: () => Promise.resolve(mocks.selectRows),
  }
  return {
    db: {
      transaction: (run: (client: typeof tx) => Promise<unknown>) => {
        mocks.transaction()
        return run(tx)
      },
      select: () => selectBuilder,
      query: {
        inboxModel: { findMany: mocks.inboxFindMany },
        integrationWhatsappModel: {
          findFirst: mocks.integrationWhatsappFindFirst,
        },
        integrationMessengerModel: {
          findFirst: mocks.integrationMessengerFindFirst,
        },
        flowModel: {
          findFirst: mocks.flowFindFirst,
          findMany: mocks.flowFindMany,
        },
      },
    },
    and: (...args: unknown[]) => ({ __and: args }),
    asc: vi.fn(),
    count: vi.fn(),
    desc: vi.fn(),
    eq: (left: unknown, right: unknown) => ({ __eq: [left, right] }),
    gt: vi.fn(),
    inArray: (left: unknown, right: unknown) => ({ __inArray: [left, right] }),
    isNull: (value: unknown) => ({ __isNull: value }),
    isNotNull: vi.fn(),
    ne: vi.fn(),
    sql: vi.fn(),
  }
})

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: vi.fn(),
  contactInboxInteractedWithin24hSQL: vi.fn(),
  pruneEmailPhoneFilterConditions: (contactFilter: unknown) => contactFilter,
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: vi.fn(),
  likeContains: vi.fn(),
}))

const { broadcastService, resolveBroadcastTargetsToPersist } = await import(
  "../service"
)

const whatsappTemplateRow = (id: string, inboxId: string, name = "promo") => ({
  id,
  name,
  language: "en",
  category: "MARKETING",
  status: "APPROVED",
  components: [],
  inboxId,
  integrationName: `Page ${inboxId}`,
})

const baseData = {
  channel: "whatsapp" as const,
  subaction: "whatsappTemplateMessage" as const,
  schedulesType: "now" as const,
  schedulesAt: null,
  contactFilter: null,
}

const targets0 = () => ({
  inboxId: "inbox-a",
  templateId: "template-a",
  templateData: { body: ["Ada"] },
})

const twoTargets = [
  {
    inboxId: "inbox-a",
    templateId: "template-a",
    templateData: { body: ["Ada"] },
    buttons: [],
  },
  {
    inboxId: "inbox-b",
    templateId: "template-b",
    templateData: { body: ["Bob"] },
  },
]

beforeEach(() => {
  mocks.selectRows = []
  mocks.inboxFindMany.mockReset().mockResolvedValue([])
  mocks.integrationWhatsappFindFirst.mockReset()
  mocks.integrationMessengerFindFirst.mockReset()
  mocks.flowFindFirst.mockReset()
  mocks.flowFindMany.mockReset().mockResolvedValue([])
  mocks.targetFindMany.mockReset()
  mocks.insertValues.mockReset()
  mocks.insertReturning
    .mockReset()
    .mockImplementation((values: Record<string, unknown>) =>
      Promise.resolve([{ id: "broadcast-1", ...values }]),
    )
  mocks.updateSet.mockReset()
  mocks.updateWhere.mockReset()
  mocks.updateReturning.mockReset().mockResolvedValue([{ id: "broadcast-1" }])
  mocks.deleteWhere.mockReset()
  mocks.transaction.mockReset()
})

describe("resolveBroadcastTargetsToPersist", () => {
  test("a draft keeps every target, empty ones included", () => {
    const data = {
      ...baseData,
      saveAsDraft: true,
      targets: [
        { inboxId: "inbox-a", templateId: "template-a" },
        { inboxId: "inbox-b" },
      ],
    }
    expect(resolveBroadcastTargetsToPersist(data)).toEqual(data)
  })

  test("a non-draft drops targets with neither a template nor a flow", () => {
    const result = resolveBroadcastTargetsToPersist({
      ...baseData,
      targets: [
        { inboxId: "inbox-a", templateId: "template-a" },
        { inboxId: "inbox-b" },
      ],
    })
    expect(result.targets).toEqual([
      { inboxId: "inbox-a", templateId: "template-a" },
    ])
  })

  test("a non-draft drops flow targets with neither a template nor a flow too, symmetrically with template sends", () => {
    const result = resolveBroadcastTargetsToPersist({
      ...baseData,
      targets: [
        { inboxId: "inbox-a", flowId: "flow-a" },
        { inboxId: "inbox-b" },
      ],
    })
    expect(result.targets).toEqual([{ inboxId: "inbox-a", flowId: "flow-a" }])
  })

  test("a legacy channel-mode payload without any targets passes through unchanged", () => {
    const data = { ...baseData, templateId: "legacy-template" }
    expect(resolveBroadcastTargetsToPersist(data)).toEqual(data)
  })

  test("a non-draft with zero ready targets throws a neutral message instead of falling back to channel mode", () => {
    // Direct unit test of the defense-in-depth guard: even bypassing
    // `assertDraftPayload` (e.g. a future caller that skips it), this helper
    // itself refuses to persist an empty targets-form send. The message is
    // neutral because this guard now fires for template AND flow sends.
    expect(() =>
      resolveBroadcastTargetsToPersist({
        ...baseData,
        templateId: "legacy-template",
        targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
      }),
    ).toThrowError(
      expect.objectContaining({
        message: "Select a template or flow for at least one page",
        field: "targets",
      }),
    )
  })

  test("a non-draft with zero ready FLOW targets throws too", () => {
    expect(() =>
      resolveBroadcastTargetsToPersist({
        ...baseData,
        flowId: "legacy-flow",
        targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
      }),
    ).toThrowError(
      expect.objectContaining({
        message: "Select a template or flow for at least one page",
        field: "targets",
      }),
    )
  })
})

describe("broadcastService.assertBroadcastTargetsOwned", () => {
  test("passes when every target inbox belongs to the workspace and channel", async () => {
    mocks.inboxFindMany.mockResolvedValue([
      { id: "inbox-a" },
      { id: "inbox-b" },
    ])

    await expect(
      broadcastService.assertBroadcastTargetsOwned({
        workspaceId: "ws-1",
        data: { channel: "whatsapp", targets: twoTargets },
      }),
    ).resolves.toEqual({
      inboxes: [{ id: "inbox-a" }, { id: "inbox-b" }],
      flows: [],
    })

    expect(mocks.inboxFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["inbox-a", "inbox-b"] },
        workspaceId: "ws-1",
        channel: "whatsapp",
      },
      columns: { id: true, name: true },
    })
  })

  test("rejects a target inbox from another workspace or channel", async () => {
    mocks.inboxFindMany.mockResolvedValue([{ id: "inbox-a" }])

    await expect(
      broadcastService.assertBroadcastTargetsOwned({
        workspaceId: "ws-1",
        data: { channel: "whatsapp", targets: twoTargets },
      }),
    ).rejects.toThrow("Inbox not found")
  })

  test("skips the inbox lookup for a legacy payload without targets", async () => {
    mocks.integrationWhatsappFindFirst.mockResolvedValue({ id: "wa-1" })

    await broadcastService.assertBroadcastTargetsOwned({
      workspaceId: "ws-1",
      data: { channel: "whatsapp", integrationWhatsappId: "wa-1" },
    })

    expect(mocks.inboxFindMany).not.toHaveBeenCalled()
  })

  test("still rejects a foreign legacy integration id", async () => {
    mocks.integrationMessengerFindFirst.mockResolvedValue(undefined)

    await expect(
      broadcastService.assertBroadcastTargetsOwned({
        workspaceId: "ws-1",
        data: { channel: "messenger", integrationMessengerId: "foreign" },
      }),
    ).rejects.toThrow("Integration not found")
  })
})

describe("broadcastService.create", () => {
  beforeEach(() => {
    mocks.inboxFindMany.mockResolvedValue([
      { id: "inbox-a" },
      { id: "inbox-b" },
    ])
    mocks.selectRows = [
      whatsappTemplateRow("template-a", "inbox-a"),
      whatsappTemplateRow("template-b", "inbox-b"),
    ]
  })

  test("validates, names and inserts the broadcast with one target row per page in a single transaction", async () => {
    const broadcast = await broadcastService.create({
      workspaceId: "ws-1",
      canViewEmailAndPhone: true,
      ...baseData,
      targets: twoTargets,
    })

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(broadcast.id).toBe("broadcast-1")
    expect(mocks.insertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspaceId: "ws-1",
        name: "Page inbox-a - promo / Page inbox-b - promo",
        status: "scheduled",
        targetMode: "targets",
        templateId: null,
        templateData: null,
        integrationWhatsappId: null,
        integrationMessengerId: null,
      }),
    )
    expect(mocks.deleteWhere).toHaveBeenCalledWith({
      __eq: ["BroadcastTarget.broadcastId", "broadcast-1"],
    })
    expect(mocks.insertValues).toHaveBeenNthCalledWith(2, [
      {
        broadcastId: "broadcast-1",
        inboxId: "inbox-a",
        flowId: null,
        templateId: "template-a",
        templateData: { body: ["Ada"], buttons: [] },
      },
      {
        broadcastId: "broadcast-1",
        inboxId: "inbox-b",
        flowId: null,
        templateId: "template-b",
        templateData: { body: ["Bob"], buttons: [] },
      },
    ])
  })

  test("stores a draft without targets exactly like the legacy single-page insert", async () => {
    mocks.integrationWhatsappFindFirst.mockResolvedValue({ id: "wa-1" })
    mocks.selectRows = [whatsappTemplateRow("template-1", "inbox-1")]

    await broadcastService.create({
      workspaceId: "ws-1",
      canViewEmailAndPhone: true,
      ...baseData,
      saveAsDraft: true,
      templateId: "template-1",
      integrationWhatsappId: "wa-1",
      templateData: { body: ["Ada"] },
      buttons: [{ id: "b1", label: "Go", flowId: "flow-1" }],
    })

    expect(mocks.insertValues).toHaveBeenCalledTimes(1)
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
        targetMode: "channel",
        templateId: "template-1",
        integrationWhatsappId: "wa-1",
        templateData: {
          body: ["Ada"],
          buttons: [{ id: "b1", label: "Go", flowId: "flow-1" }],
        },
      }),
    )
  })

  test("nulls every legacy single-page column when the payload carries targets", async () => {
    mocks.integrationWhatsappFindFirst.mockResolvedValue({ id: "wa-stale" })

    await broadcastService.create({
      workspaceId: "ws-1",
      canViewEmailAndPhone: true,
      ...baseData,
      templateId: "legacy-template",
      templateData: { body: ["legacy"] },
      integrationWhatsappId: "wa-stale",
      targets: [targets0()],
    })

    expect(mocks.insertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        targetMode: "targets",
        templateId: null,
        templateData: null,
        integrationWhatsappId: null,
        integrationMessengerId: null,
      }),
    )
  })

  test("rejects a template send that names no page at all, pointing at the page picker", async () => {
    await expect(
      broadcastService.create({
        workspaceId: "ws-1",
        canViewEmailAndPhone: true,
        ...baseData,
        templateId: "template-1",
      }),
    ).rejects.toMatchObject({
      message: "Select the page the template belongs to",
      field: "targets",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("rejects a payload that names both a flow and per-page templates", async () => {
    await expect(
      broadcastService.create({
        workspaceId: "ws-1",
        canViewEmailAndPhone: true,
        ...baseData,
        flowId: "flow-1",
        targets: twoTargets,
      }),
    ).rejects.toMatchObject({
      message: "A broadcast sends either a flow or a template, not both",
      field: "flowId",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("reports a foreign target inbox on the targets field", async () => {
    mocks.inboxFindMany.mockResolvedValue([{ id: "inbox-a" }])

    await expect(
      broadcastService.create({
        workspaceId: "ws-1",
        canViewEmailAndPhone: true,
        ...baseData,
        targets: twoTargets,
      }),
    ).rejects.toMatchObject({ message: "Inbox not found", field: "targets" })
  })

  test("reports a foreign legacy integration on its own field", async () => {
    mocks.integrationMessengerFindFirst.mockResolvedValue(undefined)

    await expect(
      broadcastService.create({
        workspaceId: "ws-1",
        canViewEmailAndPhone: true,
        ...baseData,
        channel: "messenger",
        subaction: "messengerTemplateMessage",
        templateId: "template-1",
        integrationMessengerId: "foreign",
      }),
    ).rejects.toMatchObject({
      message: "Integration not found",
      field: "integrationMessengerId",
    })
  })

  const flowWithStart = (id: string, name: string, templateId: string) => ({
    id,
    name,
    flowVersions: [
      {
        nodes: [
          {
            data: {
              isStartNode: true,
              details: {
                steps: [
                  {
                    stepType: "sendWaTemplateMessage",
                    template: { id: templateId },
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  })

  test("stores a flow per page, names the broadcast by page and flow, and drops stale template data", async () => {
    mocks.inboxFindMany.mockResolvedValue([
      { id: "inbox-a", name: "Page A" },
      { id: "inbox-b", name: "Page B" },
    ])
    mocks.flowFindMany.mockResolvedValue([
      flowWithStart("flow-a", "Promo A", "tpl-a"),
      flowWithStart("flow-b", "Promo B", "tpl-b"),
    ])
    mocks.selectRows = [
      whatsappTemplateRow("tpl-a", "inbox-a"),
      whatsappTemplateRow("tpl-b", "inbox-b"),
    ]

    await broadcastService.create({
      workspaceId: "ws-1",
      canViewEmailAndPhone: true,
      ...baseData,
      targets: [
        {
          inboxId: "inbox-a",
          flowId: "flow-a",
          templateData: { body: ["stale"] },
        },
        { inboxId: "inbox-b", flowId: "flow-b" },
      ],
    })

    expect(mocks.insertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: "Page A - Promo A / Page B - Promo B",
        flowId: null,
        targetMode: "targets",
      }),
    )
    expect(mocks.insertValues).toHaveBeenNthCalledWith(2, [
      {
        broadcastId: "broadcast-1",
        inboxId: "inbox-a",
        flowId: "flow-a",
        templateId: null,
        templateData: null,
      },
      {
        broadcastId: "broadcast-1",
        inboxId: "inbox-b",
        flowId: "flow-b",
        templateId: null,
        templateData: null,
      },
    ])
    expect(mocks.flowFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["flow-a", "flow-b"] }, workspaceId: "ws-1" },
      }),
    )
  })

  test("rejects a flow whose start template lives on another page", async () => {
    mocks.inboxFindMany.mockResolvedValue([{ id: "inbox-a", name: "Page A" }])
    mocks.flowFindMany.mockResolvedValue([
      flowWithStart("flow-b", "Promo B", "tpl-b"),
    ])
    mocks.selectRows = [whatsappTemplateRow("tpl-b", "inbox-b")]

    await expect(
      broadcastService.create({
        workspaceId: "ws-1",
        canViewEmailAndPhone: true,
        ...baseData,
        targets: [{ inboxId: "inbox-a", flowId: "flow-b" }],
      }),
    ).rejects.toMatchObject({
      message: "The flow's template does not belong to the selected page",
      field: "targets",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("rejects a flow from another workspace", async () => {
    mocks.inboxFindMany.mockResolvedValue([
      { id: "inbox-a", name: "Page A" },
      { id: "inbox-b", name: "Page B" },
    ])

    await expect(
      broadcastService.create({
        workspaceId: "ws-1",
        canViewEmailAndPhone: true,
        ...baseData,
        targets: [{ inboxId: "inbox-a", flowId: "foreign" }],
      }),
    ).rejects.toMatchObject({ message: "Flow not found", field: "flowId" })
  })

  test("rejects a pending template even though it exists on the page", async () => {
    mocks.selectRows = [
      { ...whatsappTemplateRow("template-a", "inbox-a"), status: "PENDING" },
      whatsappTemplateRow("template-b", "inbox-b"),
    ]

    await expect(
      broadcastService.create({
        workspaceId: "ws-1",
        canViewEmailAndPhone: true,
        ...baseData,
        targets: twoTargets,
      }),
    ).rejects.toMatchObject({
      message: "Template is not approved",
      field: "targets",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})

describe("broadcastService.updateDraft", () => {
  test("replaces the target rows inside the draft update transaction", async () => {
    mocks.inboxFindMany.mockResolvedValue([
      { id: "inbox-a" },
      { id: "inbox-b" },
    ])
    mocks.selectRows = [
      whatsappTemplateRow("template-a", "inbox-a"),
      whatsappTemplateRow("template-b", "inbox-b", "welcome"),
    ]

    const result = await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
      canViewEmailAndPhone: true,
      data: { ...baseData, targets: twoTargets },
    })

    expect(result).toEqual({ id: "broadcast-1", status: "scheduled" })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Page inbox-a - promo / Page inbox-b - welcome",
        templateId: null,
        templateData: null,
      }),
    )
    expect(mocks.deleteWhere).toHaveBeenCalledWith({
      __eq: ["BroadcastTarget.broadcastId", "broadcast-1"],
    })
    expect(mocks.insertValues).toHaveBeenCalledWith([
      expect.objectContaining({ inboxId: "inbox-a", templateId: "template-a" }),
      expect.objectContaining({ inboxId: "inbox-b", templateId: "template-b" }),
    ])
  })

  test("rejects when a target's template belongs to another page", async () => {
    mocks.inboxFindMany.mockResolvedValue([
      { id: "inbox-a" },
      { id: "inbox-b" },
    ])
    mocks.selectRows = [
      whatsappTemplateRow("template-a", "inbox-a"),
      whatsappTemplateRow("template-b", "inbox-a"),
    ]

    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "broadcast-1",
        canViewEmailAndPhone: true,
        data: { ...baseData, targets: twoTargets },
      }),
    ).rejects.toThrow("Template not found")
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("rejects the same page selected twice", async () => {
    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "broadcast-1",
        canViewEmailAndPhone: true,
        data: { ...baseData, targets: [targets0(), targets0()] },
      }),
    ).rejects.toThrow("A page can only be selected once")
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("does not touch targets when the row is no longer a draft", async () => {
    mocks.inboxFindMany.mockResolvedValue([
      { id: "inbox-a" },
      { id: "inbox-b" },
    ])
    mocks.selectRows = [
      whatsappTemplateRow("template-a", "inbox-a"),
      whatsappTemplateRow("template-b", "inbox-b"),
    ]
    mocks.updateReturning.mockResolvedValue([])

    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "broadcast-1",
        canViewEmailAndPhone: true,
        data: { ...baseData, targets: twoTargets },
      }),
    ).rejects.toThrow("Broadcast is not a draft")
    expect(mocks.deleteWhere).not.toHaveBeenCalled()
    expect(mocks.insertValues).not.toHaveBeenCalled()
  })
})

describe("broadcastService.create target normalization (draft-keep / non-draft-filter / zero-ready guard)", () => {
  beforeEach(() => {
    mocks.inboxFindMany.mockResolvedValue([
      { id: "inbox-a" },
      { id: "inbox-b" },
    ])
    mocks.selectRows = [whatsappTemplateRow("template-a", "inbox-a")]
  })

  const mixedTargets = [
    { inboxId: "inbox-a", templateId: "template-a", templateData: {} },
    { inboxId: "inbox-b" },
  ]

  test("a draft keeps an empty target so reopening it preserves the page selection", async () => {
    await broadcastService.create({
      workspaceId: "ws-1",
      canViewEmailAndPhone: true,
      ...baseData,
      saveAsDraft: true,
      targets: mixedTargets,
    })

    expect(mocks.insertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "draft", targetMode: "targets" }),
    )
    expect(mocks.insertValues).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ inboxId: "inbox-a", templateId: "template-a" }),
      expect.objectContaining({ inboxId: "inbox-b", templateId: null }),
    ])
  })

  test("a non-draft drops targets with neither a template nor a flow, persisting only the ready ones", async () => {
    await broadcastService.create({
      workspaceId: "ws-1",
      canViewEmailAndPhone: true,
      ...baseData,
      targets: mixedTargets,
    })

    expect(mocks.insertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "scheduled", targetMode: "targets" }),
    )
    expect(mocks.insertValues).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ inboxId: "inbox-a", templateId: "template-a" }),
    ])
    // The dropped page's inbox is never even checked for ownership.
    expect(mocks.inboxFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["inbox-a"] } }),
      }),
    )
  })

  test("a legacy top-level templateId with only empty targets is rejected, never falls back to channel mode", async () => {
    // No target carries a template, but a stale top-level `templateId` (e.g.
    // a resend payload) would otherwise make `broadcastSendsTemplate` true.
    await expect(
      broadcastService.create({
        workspaceId: "ws-1",
        canViewEmailAndPhone: true,
        ...baseData,
        templateId: "legacy-template",
        targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
      }),
    ).rejects.toMatchObject({
      message: "Select a template for at least one page",
      field: "targets",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("a direct-scheduled flow send (saveAsDraft: false) drops the empty page and persists only the flow one", async () => {
    mocks.flowFindMany.mockResolvedValue([
      {
        id: "flow-a",
        name: "Promo A",
        flowVersions: [
          {
            nodes: [
              {
                data: {
                  isStartNode: true,
                  details: {
                    steps: [
                      {
                        stepType: "sendWaTemplateMessage",
                        template: { id: "tpl-a" },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    ])
    mocks.selectRows = [whatsappTemplateRow("tpl-a", "inbox-a")]

    await broadcastService.create({
      workspaceId: "ws-1",
      canViewEmailAndPhone: true,
      ...baseData,
      saveAsDraft: false,
      targets: [
        { inboxId: "inbox-a", flowId: "flow-a" },
        { inboxId: "inbox-b" },
      ],
    })

    expect(mocks.insertValues).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ inboxId: "inbox-a", flowId: "flow-a" }),
    ])
  })

  test("a legacy top-level flowId with only empty targets is rejected by isTargetsFlowSendWithoutFlow", async () => {
    // No target carries a flow, but a stale top-level `flowId` would
    // otherwise make `broadcastSendsFlow` true.
    await expect(
      broadcastService.create({
        workspaceId: "ws-1",
        canViewEmailAndPhone: true,
        ...baseData,
        flowId: "legacy-flow",
        targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
      }),
    ).rejects.toMatchObject({
      message: "Select a flow for at least one page",
      field: "targets",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})

describe("broadcastService.updateDraft target normalization", () => {
  const mixedTargets = [
    { inboxId: "inbox-a", templateId: "template-a", templateData: {} },
    { inboxId: "inbox-b" },
  ]

  test("a draft edit keeps the empty target", async () => {
    mocks.inboxFindMany.mockResolvedValue([
      { id: "inbox-a" },
      { id: "inbox-b" },
    ])
    mocks.selectRows = [whatsappTemplateRow("template-a", "inbox-a")]

    await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
      canViewEmailAndPhone: true,
      data: { ...baseData, saveAsDraft: true, targets: mixedTargets },
    })

    expect(mocks.insertValues).toHaveBeenCalledWith([
      expect.objectContaining({ inboxId: "inbox-a", templateId: "template-a" }),
      expect.objectContaining({ inboxId: "inbox-b", templateId: null }),
    ])
  })

  test("scheduling a draft (non-draft edit) drops empty targets, persisting only the ready ones", async () => {
    mocks.inboxFindMany.mockResolvedValue([
      { id: "inbox-a" },
      { id: "inbox-b" },
    ])
    mocks.selectRows = [whatsappTemplateRow("template-a", "inbox-a")]

    await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
      canViewEmailAndPhone: true,
      data: { ...baseData, targets: mixedTargets },
    })

    expect(mocks.insertValues).toHaveBeenCalledWith([
      expect.objectContaining({ inboxId: "inbox-a", templateId: "template-a" }),
    ])
  })

  test("a flow send drops the empty page and persists only the ready one (removed flow-completeness rule)", async () => {
    mocks.inboxFindMany.mockResolvedValue([
      { id: "inbox-a" },
      { id: "inbox-b" },
    ])
    mocks.flowFindMany.mockResolvedValue([
      {
        id: "flow-a",
        name: "Promo A",
        flowVersions: [
          {
            nodes: [
              {
                data: {
                  isStartNode: true,
                  details: {
                    steps: [
                      {
                        stepType: "sendWaTemplateMessage",
                        template: { id: "tpl-a" },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    ])
    mocks.selectRows = [whatsappTemplateRow("tpl-a", "inbox-a")]

    await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
      canViewEmailAndPhone: true,
      data: {
        ...baseData,
        targets: [
          { inboxId: "inbox-a", flowId: "flow-a" },
          { inboxId: "inbox-b" },
        ],
      },
    })

    expect(mocks.insertValues).toHaveBeenCalledWith([
      expect.objectContaining({ inboxId: "inbox-a", flowId: "flow-a" }),
    ])
  })

  test("a legacy top-level templateId with only empty targets is rejected, never persists", async () => {
    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "broadcast-1",
        canViewEmailAndPhone: true,
        data: {
          ...baseData,
          templateId: "legacy-template",
          targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
        },
      }),
    ).rejects.toMatchObject({
      message: "Select a template for at least one page",
      field: "targets",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})

describe("broadcastService.copyTargets", () => {
  test("copies every target row of the source broadcast onto the new one", async () => {
    mocks.targetFindMany.mockResolvedValue([
      {
        broadcastId: "old",
        inboxId: "inbox-a",
        templateId: "template-a",
        templateData: { body: [] },
      },
    ])
    const tx = {
      query: { broadcastTargetModel: { findMany: mocks.targetFindMany } },
      insert: () => ({
        values: (values: unknown) => {
          mocks.insertValues(values)
          return Promise.resolve()
        },
      }),
    }

    await broadcastService.copyTargets(tx as never, {
      sourceBroadcastId: "old",
      broadcastId: "new",
    })

    expect(mocks.targetFindMany).toHaveBeenCalledWith({
      where: { broadcastId: "old" },
    })
    expect(mocks.insertValues).toHaveBeenCalledWith([
      {
        broadcastId: "new",
        inboxId: "inbox-a",
        templateId: "template-a",
        templateData: { body: [] },
      },
    ])
  })

  test("inserts nothing for a legacy broadcast without targets", async () => {
    mocks.targetFindMany.mockResolvedValue([])
    const tx = {
      query: { broadcastTargetModel: { findMany: mocks.targetFindMany } },
      insert: () => {
        throw new Error("must not insert")
      },
    }

    await broadcastService.copyTargets(tx as never, {
      sourceBroadcastId: "old",
      broadcastId: "new",
    })
  })
})
