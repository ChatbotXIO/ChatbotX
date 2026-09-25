import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindCapability,
  findFirstFlow,
  findFirstIntegrationWhatsapp,
  findFirstIntegrationMessenger,
  insertValues,
  insertReturning,
  mockPruneFilter,
  mockDispatchAuditRecord,
} = vi.hoisted(() => ({
  mockFindCapability: vi.fn(),
  findFirstFlow: vi.fn(),
  findFirstIntegrationWhatsapp: vi.fn(),
  findFirstIntegrationMessenger: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  mockPruneFilter: vi.fn((filter: unknown) => filter),
  mockDispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
}))

const dbMock: {
  query: Record<string, unknown>
  insert: (...args: unknown[]) => unknown
  delete: (...args: unknown[]) => unknown
  transaction: (fn: (tx: typeof dbMock) => Promise<unknown>) => Promise<unknown>
} = {
  query: {
    flowModel: { findFirst: findFirstFlow },
    integrationWhatsappModel: { findFirst: findFirstIntegrationWhatsapp },
    integrationMessengerModel: { findFirst: findFirstIntegrationMessenger },
    inboxModel: { findMany: vi.fn().mockResolvedValue([]) },
    broadcastTargetModel: { findMany: vi.fn().mockResolvedValue([]) },
  },
  insert: () => ({
    values: (values: Record<string, unknown>) => {
      insertValues(values)
      return { returning: () => insertReturning() }
    },
  }),
  delete: () => ({ where: () => Promise.resolve() }),
  transaction: (fn) => fn(dbMock),
}

vi.mock("@chatbotx.io/analytics", () => ({
  broadcastAnalyticsService: { getContacts: vi.fn() },
  sequenceAnalyticsService: { getContacts: vi.fn() },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: dbMock,
  and: (...args: unknown[]) => ({ __and: args }),
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  findOrFail: vi.fn(),
  gt: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}))

type MinimalBroadcastPayload = {
  flowId?: string | null
  templateId?: string | null
  integrationWhatsappId?: string | null
  integrationMessengerId?: string | null
  targetMode?: string | null
  targets?:
    | readonly {
        inboxId: string
        flowId?: string | null
        templateId?: string | null
      }[]
    | null
}

const usesBroadcastTargetsStub = (
  broadcast: Pick<MinimalBroadcastPayload, "targetMode" | "targets">,
): boolean =>
  broadcast.targetMode == null
    ? (broadcast.targets ?? []).length > 0
    : broadcast.targetMode === "targets"

const sendsFlowStub = (broadcast: MinimalBroadcastPayload): boolean =>
  Boolean(broadcast.flowId) ||
  (broadcast.targets ?? []).some((target) => Boolean(target.flowId))

const sendsTemplateStub = (broadcast: MinimalBroadcastPayload): boolean =>
  Boolean(broadcast.templateId) ||
  (broadcast.targets ?? []).some((target) => Boolean(target.templateId))

// `isAudienceRangeOrdered`/`normalizeBroadcastSendLimit` (and every other
// export this file doesn't stub) come from the real module via
// `vi.importActual` — pure Phase-1 helpers, so this test can't drift from
// their actual implementation.
vi.mock("@chatbotx.io/database/partials", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/database/partials")
  >("@chatbotx.io/database/partials")
  return {
    ...actual,
    broadcastStatuses: { enum: { draft: "draft", scheduled: "scheduled" } },
    findBroadcastChannelCapability: mockFindCapability,
    broadcastSendsFlow: sendsFlowStub,
    broadcastSendsTemplate: sendsTemplateStub,
    hasFlowAndTemplate: (broadcast: MinimalBroadcastPayload) =>
      sendsFlowStub(broadcast) && sendsTemplateStub(broadcast),
    hasDuplicateBroadcastTarget: (broadcast: MinimalBroadcastPayload) => {
      const targets = broadcast.targets ?? []
      return (
        new Set(targets.map((target) => target.inboxId)).size < targets.length
      )
    },
    isTargetsTemplateSendWithoutTemplate: (
      broadcast: MinimalBroadcastPayload,
    ) =>
      usesBroadcastTargetsStub(broadcast) &&
      !sendsFlowStub(broadcast) &&
      !(broadcast.targets ?? []).some((target) => Boolean(target.templateId)),
    isTargetsFlowSendWithoutFlow: (broadcast: MinimalBroadcastPayload) =>
      usesBroadcastTargetsStub(broadcast) &&
      !sendsTemplateStub(broadcast) &&
      !(broadcast.targets ?? []).some((target) => Boolean(target.flowId)),
    isTemplateSendWithoutPage: (broadcast: MinimalBroadcastPayload) =>
      sendsTemplateStub(broadcast) &&
      !usesBroadcastTargetsStub(broadcast) &&
      !(broadcast.integrationWhatsappId || broadcast.integrationMessengerId),
    usesBroadcastTargets: usesBroadcastTargetsStub,
    resolveBroadcastTargetMode: (
      targets: readonly { inboxId: string }[] | null | undefined,
    ) => ((targets ?? []).length > 0 ? "targets" : "channel"),
    resolveBroadcastTemplateSend: vi.fn(),
    withBroadcastTargets: {},
    dmConversationUsesSourceId: vi.fn(() => false),
    requiresRecentInteractionWindow: vi.fn(() => false),
  }
})

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {},
  broadcastTargetModel: {},
  contactInboxModel: {},
  contactModel: {},
  contactsOnBroadcastsModel: {},
  conversationModel: {},
  integrationMessengerModel: {},
  integrationWhatsappModel: {},
  messengerMessageTemplateModel: {},
  whatsappMessageTemplateModel: {},
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: vi.fn(),
  contactInboxInteractedWithin24hSQL: vi.fn(),
  pruneEmailPhoneFilterConditions: mockPruneFilter,
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: vi.fn(),
  likeContains: vi.fn(),
  getPaginationWithDefaults: vi.fn(() => ({ limit: 10, offset: 0 })),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  broadcastRepository: {
    listWithRelations: vi.fn(),
    count: vi.fn(),
    listAudience: vi.fn(),
    countAudience: vi.fn(),
    findByIdOrName: vi.fn(),
  },
}))

// The real `@chatbotx.io/database/partials` barrel (imported actual above)
// pulls in other partials (e.g. automated-response.ts) that need real utils
// exports such as `zodBigintAsString`, so this mock spreads the actual
// module rather than replacing it outright.
vi.mock("@chatbotx.io/utils", async () => {
  const actual =
    await vi.importActual<typeof import("@chatbotx.io/utils")>(
      "@chatbotx.io/utils",
    )
  return {
    ...actual,
    createId: vi.fn(() => "generated-id"),
  }
})

vi.mock("@chatbotx.io/flow-config", () => ({
  findTemplateStartStep: vi.fn(),
  stepTypes: {
    enum: {
      sendWaTemplateMessage: "sendWaTemplateMessage",
      sendMessengerTemplateMessage: "sendMessengerTemplateMessage",
    },
  },
}))

vi.mock("../src/inbox/service", () => ({ inboxService: {} }))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

vi.mock("../src/broadcast/plan-policy.service", () => ({
  broadcastPlanPolicyService: {
    appliesToChannel: vi.fn((channel: string) => channel === "messenger"),
    hasRestrictions: vi.fn(() => false),
    resolveForWorkspace: vi.fn().mockResolvedValue({
      policy: { kind: "unrestricted" },
      planName: null,
    }),
    restrictionFor: vi.fn(() => null),
    assertSendRateAllowed: vi.fn(),
    lockActivation: vi.fn().mockResolvedValue(undefined),
    assertActiveSlotAvailable: vi.fn().mockResolvedValue(undefined),
    resolveSendRateOverride: vi.fn(() => ({ sendRatePerMinute: 60 })),
  },
}))

const { broadcastPlanPolicyService } = await import(
  "../src/broadcast/plan-policy.service"
)
const { broadcastService } = await import("../src/broadcast/service")

const WS = "ws-1"

const baseInput = {
  workspaceId: WS,
  canViewEmailAndPhone: true,
  channel: "whatsapp" as const,
  subaction: "sendMessage" as const,
  schedulesType: "now" as const,
  schedulesAt: null,
  flowId: "flow-1",
  saveAsDraft: false,
}

const restrictedContext = {
  policy: {
    kind: "restricted" as const,
    maxSendRatePerMinute: 60,
    maxActiveBroadcasts: 1,
    channels: ["messenger" as const],
    display: { sendRatePerMinute: 100, upgradeSpeedMultiplier: 20 },
  },
  planName: "Trial",
}

describe("broadcastService.create — validation branches", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(broadcastPlanPolicyService.appliesToChannel).mockImplementation(
      (channel) => channel === "messenger",
    )
    vi.mocked(broadcastPlanPolicyService.resolveForWorkspace).mockResolvedValue(
      { policy: { kind: "unrestricted" }, planName: null },
    )
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(null)
    vi.mocked(broadcastPlanPolicyService.assertSendRateAllowed).mockReset()
    vi.mocked(broadcastPlanPolicyService.lockActivation)
      .mockReset()
      .mockResolvedValue(undefined)
    vi.mocked(broadcastPlanPolicyService.assertActiveSlotAvailable)
      .mockReset()
      .mockResolvedValue(undefined)
    vi.mocked(
      broadcastPlanPolicyService.resolveSendRateOverride,
    ).mockReturnValue({ sendRatePerMinute: 60 })
    mockPruneFilter.mockImplementation((filter: unknown) => filter)
    insertReturning.mockResolvedValue([{ id: "broadcast-1" }])
  })

  test("throws validationException(channel) for an unsupported channel", async () => {
    mockFindCapability.mockReturnValue(undefined)

    await expect(broadcastService.create(baseInput)).rejects.toMatchObject({
      code: "validation",
      field: "channel",
      message: "Unsupported broadcast channel",
    })
    expect(
      broadcastPlanPolicyService.resolveForWorkspace,
    ).not.toHaveBeenCalled()
  })

  test("throws validationException(subaction) for an unsupported subaction", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["other"],
      supportsTemplateBroadcast: false,
    })

    await expect(broadcastService.create(baseInput)).rejects.toMatchObject({
      code: "validation",
      field: "subaction",
      message: "Unsupported broadcast subaction",
    })
  })

  test("throws validationException(flowId) when neither flow nor template is given", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })

    await expect(
      broadcastService.create({ ...baseInput, flowId: undefined }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "flowId",
      message: "Either flow or template must be selected",
    })
  })

  test("throws validationException(templateId) when the channel does not support template broadcasts", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })

    await expect(
      broadcastService.create({
        ...baseInput,
        flowId: undefined,
        templateId: "template-1",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "templateId",
      message: "Template broadcasts are not supported for this channel",
    })
  })

  test("throws validationException(integrationMessengerId) when the integration is not owned", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstIntegrationMessenger.mockResolvedValue(undefined)

    await expect(
      broadcastService.create({
        ...baseInput,
        integrationMessengerId: "integration-1",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "integrationMessengerId",
      message: "Integration not found",
    })
  })

  test("attributes the ownership error to integrationWhatsappId when both ids are supplied and only WhatsApp is not owned", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstIntegrationMessenger.mockResolvedValue({ id: "integration-1" })
    findFirstIntegrationWhatsapp.mockResolvedValue(undefined)

    await expect(
      broadcastService.create({
        ...baseInput,
        integrationMessengerId: "integration-1",
        integrationWhatsappId: "integration-2",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "integrationWhatsappId",
      message: "Integration not found",
    })
  })

  test("throws validationException(flowId) when the flow does not belong to the workspace", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue(undefined)

    await expect(broadcastService.create(baseInput)).rejects.toMatchObject({
      code: "validation",
      field: "flowId",
      message: "Flow not found",
    })
  })

  test("creates the broadcast and audits create + launch when scheduled now", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })

    const result = await broadcastService.create(baseInput)

    expect(result).toEqual({ id: "broadcast-1" })
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "create",
      detail: "created a new broadcast (#broadcast-1)",
    })
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "launch",
      detail: "launched a broadcast (#broadcast-1)",
    })
  })

  test("does not launch-audit when saveAsDraft is true", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })

    await broadcastService.create({ ...baseInput, saveAsDraft: true })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "create",
      detail: "created a new broadcast (#broadcast-1)",
    })
    expect(mockDispatchAuditRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "launch" }),
    )
    expect(
      broadcastPlanPolicyService.resolveForWorkspace,
    ).not.toHaveBeenCalled()
  })

  test("does not launch-audit when schedulesType is not 'now'", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })

    await broadcastService.create({
      ...baseInput,
      schedulesType: "scheduled" as never,
    })

    expect(mockDispatchAuditRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "launch" }),
    )
  })

  test("persists the expected insert shape", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })
    findFirstIntegrationMessenger.mockResolvedValue({ id: "integration-1" })
    mockPruneFilter.mockReturnValue({ pruned: true })

    const schedulesAt = new Date("2026-01-01T10:30:45.123Z")

    await broadcastService.create({
      ...baseInput,
      integrationMessengerId: "integration-1",
      schedulesAt,
      contactFilter: { raw: true } as never,
      templateData: { header: "hi" } as never,
      buttons: [{ label: "Click" }] as never,
      saveAsDraft: false,
    } as never)

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "My Flow",
        status: "scheduled",
        integrationMessengerId: "integration-1",
        workspaceId: WS,
        // startOfMinute(...) — seconds/ms zeroed
        schedulesAt: new Date("2026-01-01T10:30:00.000Z"),
        contactFilter: { pruned: true },
        // A flow send (no `templateId`) never stores stray `templateData` —
        // `buildStoredTemplateData` only attaches params to a template send,
        // so leftover template params from switching template -> flow do not
        // survive the insert.
        templateData: null,
      }),
    )
  })

  test("stores a Messenger save-as-draft without resolving plan policy", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })

    await broadcastService.create({
      ...baseInput,
      channel: "messenger",
      saveAsDraft: true,
    })

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft" }),
    )
    expect(
      broadcastPlanPolicyService.resolveForWorkspace,
    ).not.toHaveBeenCalled()
  })

  test("templateData is null when not supplied", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })

    await broadcastService.create(baseInput)

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ templateData: null }),
    )
  })

  test("pruneEmailPhoneFilterConditions is applied to contactFilter", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })
    mockPruneFilter.mockReturnValue({ pruned: "yes" })

    await broadcastService.create({
      ...baseInput,
      contactFilter: { raw: "criteria" } as never,
    } as never)

    expect(mockPruneFilter).toHaveBeenCalledWith(
      { raw: "criteria" },
      true, // canViewEmailAndPhone from baseInput
    )
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ contactFilter: { pruned: "yes" } }),
    )
  })

  test("keeps a known non-Messenger activation on today's zero-read path", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })

    await broadcastService.create(baseInput)

    expect(
      broadcastPlanPolicyService.resolveForWorkspace,
    ).not.toHaveBeenCalled()
    expect(insertValues.mock.calls[0][0]).toMatchObject({
      status: "scheduled",
      sendRatePerMinute: null,
    })
  })

  test("keeps a non-trial Messenger activation unchanged after identity reads", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })

    await broadcastService.create({ ...baseInput, channel: "messenger" })

    expect(broadcastPlanPolicyService.resolveForWorkspace).toHaveBeenCalledWith(
      WS,
    )
    expect(broadcastPlanPolicyService.lockActivation).not.toHaveBeenCalled()
    expect(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).not.toHaveBeenCalled()
    expect(insertValues.mock.calls[0][0]).toMatchObject({
      sendRatePerMinute: null,
    })
  })

  test("rejects an over-cap restricted activation before inserting", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    vi.mocked(
      broadcastPlanPolicyService.assertSendRateAllowed,
    ).mockImplementation(() => {
      throw new Error("send rate limited")
    })

    await expect(
      broadcastService.create({
        ...baseInput,
        channel: "messenger",
        sendRatePerMinute: 61,
      }),
    ).rejects.toThrow("send rate limited")

    expect(insertValues).not.toHaveBeenCalled()
    expect(broadcastPlanPolicyService.lockActivation).not.toHaveBeenCalled()
  })

  test("rolls back a restricted activation when its active slot is occupied", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    vi.mocked(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).mockRejectedValue(new Error("active slot limited"))

    await expect(
      broadcastService.create({ ...baseInput, channel: "messenger" }),
    ).rejects.toThrow("active slot limited")

    expect(broadcastPlanPolicyService.lockActivation).toHaveBeenCalled()
    expect(insertValues).not.toHaveBeenCalled()
  })

  test("checks rate, locks, counts, then stores the restricted rate override", async () => {
    mockFindCapability.mockReturnValue({
      subactions: ["sendMessage"],
      supportsTemplateBroadcast: false,
    })
    findFirstFlow.mockResolvedValue({ id: "flow-1", name: "My Flow" })
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )

    await broadcastService.create({ ...baseInput, channel: "messenger" })

    expect(
      broadcastPlanPolicyService.assertSendRateAllowed,
    ).toHaveBeenCalledWith(restrictedContext, undefined)
    expect(broadcastPlanPolicyService.lockActivation).toHaveBeenCalledWith(
      dbMock,
      WS,
    )
    expect(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).toHaveBeenCalledWith(dbMock, {
      workspaceId: WS,
      channel: "messenger",
      ctx: restrictedContext,
      excludeBroadcastId: undefined,
    })
    expect(insertValues.mock.calls[0][0]).toMatchObject({
      sendRatePerMinute: 60,
    })
    expect(
      vi.mocked(broadcastPlanPolicyService.assertSendRateAllowed).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(broadcastPlanPolicyService.lockActivation).mock
        .invocationCallOrder[0],
    )
    expect(
      vi.mocked(broadcastPlanPolicyService.lockActivation).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(broadcastPlanPolicyService.assertActiveSlotAvailable).mock
        .invocationCallOrder[0],
    )
  })
})
