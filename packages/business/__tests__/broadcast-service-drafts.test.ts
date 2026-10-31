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
const selectForUpdate = vi.fn()
const mockHasBroadcastRecipients = vi.fn()
const mockScheduleAdd = vi.fn()
const mockScheduleGetJob = vi.fn()

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
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => ({ limit: () => selectForUpdate() }),
              limit: () => selectForUpdate(),
            }),
          }),
        }),
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
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: strings.join("?"),
    values,
  }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {
    id: "broadcast.id",
    name: "broadcast.name",
    workspaceId: "broadcast.workspaceId",
    status: "broadcast.status",
    handoffCompletedAt: "broadcast.handoffCompletedAt",
    deletedAt: "broadcast.deletedAt",
    occurrenceAt: "broadcast.occurrenceAt",
    resumeCount: "broadcast.resumeCount",
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

vi.mock("@chatbotx.io/worker-config", () => ({
  ScheduleJobData: {
    purgeDraftBroadcastRecipients: "purgeDraftBroadcastRecipients",
  },
  broadcastDraftPurgeJobId: (broadcastId: string, requester: string) =>
    `schedule-purge-draft-broadcast-${broadcastId}-${requester}`,
  broadcastPrepareJobId: (broadcastId: string) =>
    `schedule-prepare-broadcast-${broadcastId}`,
  scheduleQueue: {
    add: (...args: unknown[]) => mockScheduleAdd(...args),
    getJob: (...args: unknown[]) => mockScheduleGetJob(...args),
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  hasBroadcastRecipients: (...args: unknown[]) =>
    mockHasBroadcastRecipients(...args),
  purgeBroadcastRecipients: vi.fn(),
  broadcastRepository: {
    findByIdOrName: vi.fn(),
  },
  broadcastRecurrenceRepository: {
    findByBroadcastId: vi.fn().mockResolvedValue(null),
    lockForWrite: vi.fn().mockResolvedValue([]),
    selectDbNow: vi.fn().mockResolvedValue(new Date("2026-10-13T00:00:00Z")),
    insertIfMissing: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: vi.fn(),
  contactInboxInteractedWithin24hSQL: vi.fn(),
  pruneEmailPhoneFilterConditions: (...args: unknown[]) => pruneFilter(...args),
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: vi.fn(),
  likeContains: (value: string) => `%${value}%`,
  getPaginationWithDefaults: () => ({ limit: 10, offset: 0 }),
}))

vi.mock("../src/inbox/service", () => ({ inboxService: {} }))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

vi.mock("../src/broadcast/recurrence.service", () => ({
  broadcastRecurrenceService: {
    upsertRule: vi.fn(),
    arm: vi.fn(),
    disarm: vi.fn(),
    upcomingRunsOf: vi.fn(() => []),
    nextSendAtOf: vi.fn(() => null),
  },
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
    assertActivationAllowed: vi.fn(
      async (
        tx: unknown,
        input: {
          workspaceId: string
          channel: string
          restriction: unknown
          sendRatePerMinute: number | null | undefined
          excludeBroadcastId?: string
          checkSlot: boolean
        },
      ) => {
        // Composes the mocked primitives in the real gate's order, so the
        // existing call-order assertions keep describing the real behavior.
        const gate = (await import("../src/broadcast/plan-policy.service"))
          .broadcastPlanPolicyService
        gate.assertSendRateAllowed(
          input.restriction as never,
          input.sendRatePerMinute,
        )
        if (input.checkSlot) {
          await gate.lockActivation(tx as never, input.workspaceId)
          await gate.assertActiveSlotAvailable(tx as never, {
            workspaceId: input.workspaceId,
            channel: input.channel,
            ctx: input.restriction as never,
            excludeBroadcastId: input.excludeBroadcastId,
          })
        }
        return gate.resolveSendRateOverride(
          input.restriction as never,
          input.sendRatePerMinute,
        )
      },
    ),
  },
}))

const { broadcastPlanPolicyService } = await import(
  "../src/broadcast/plan-policy.service"
)
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
  selectForUpdate.mockReset()
  mockHasBroadcastRecipients.mockReset().mockResolvedValue(false)
  mockScheduleAdd.mockReset().mockResolvedValue(undefined)
  mockScheduleGetJob.mockReset().mockResolvedValue(undefined)
  vi.mocked(broadcastPlanPolicyService.appliesToChannel).mockImplementation(
    (channel) => channel === "messenger",
  )
  vi.mocked(broadcastPlanPolicyService.hasRestrictions).mockReturnValue(false)
  vi.mocked(broadcastPlanPolicyService.resolveForWorkspace).mockResolvedValue({
    policy: { kind: "unrestricted" },
    planName: null,
  })
  vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(null)
  vi.mocked(broadcastPlanPolicyService.assertSendRateAllowed).mockReset()
  vi.mocked(broadcastPlanPolicyService.lockActivation)
    .mockReset()
    .mockResolvedValue(undefined)
  vi.mocked(broadcastPlanPolicyService.assertActiveSlotAvailable)
    .mockReset()
    .mockResolvedValue(undefined)
  vi.mocked(broadcastPlanPolicyService.resolveSendRateOverride).mockReturnValue(
    { sendRatePerMinute: 60 },
  )
})

describe("broadcastService.scheduleDraft", () => {
  // A draft whose interrupted prepare left recipients behind must not be
  // re-scheduled on top of them. The check runs before the schedule
  // transaction, so nothing is written or locked while it queues the cleanup.
  test("refuses while the draft still holds leftover recipients and queues their cleanup", async () => {
    mockHasBroadcastRecipients.mockResolvedValue(true)
    findFirstBroadcast.mockResolvedValue({ resumeCount: 2 })

    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "future",
        schedulesAt: new Date("2026-09-01T09:00:00Z"),
      }),
    ).rejects.toThrow("still clearing")

    expect(findFirstBroadcast).toHaveBeenCalledWith({
      where: {
        id: "b-1",
        workspaceId: "ws-1",
        status: "draft",
        deletedAt: { isNull: true },
      },
      columns: { resumeCount: true },
    })
    expect(mockScheduleAdd).toHaveBeenCalledWith(
      "purgeDraftBroadcastRecipients",
      {
        type: "purgeDraftBroadcastRecipients",
        data: { workspaceId: "ws-1", broadcastId: "b-1" },
      },
      expect.objectContaining({
        jobId: "schedule-purge-draft-broadcast-b-1-draft",
      }),
    )
    expect(updateReturning).not.toHaveBeenCalled()
  })

  // The previous prepare may still be writing its last chunk (not committed
  // yet, so the row probe cannot see it): scheduling waits for that job.
  test.each([
    "active",
    "waiting",
    "delayed",
  ])("refuses while the previous prepare job is %s", async (state) => {
    mockScheduleGetJob.mockResolvedValue({ getState: async () => state })
    findFirstBroadcast.mockResolvedValue({ resumeCount: 2 })

    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "future",
        schedulesAt: new Date("2026-09-01T09:00:00Z"),
      }),
    ).rejects.toThrow("still clearing")

    expect(mockScheduleGetJob).toHaveBeenCalledWith(
      "schedule-prepare-broadcast-b-1",
    )
    expect(updateReturning).not.toHaveBeenCalled()
  })

  test.each([
    "completed",
    "failed",
  ])("schedules once the previous prepare job is %s and nothing is left", async (state) => {
    mockScheduleGetJob.mockResolvedValue({ getState: async () => state })
    findFirstBroadcast.mockResolvedValue({ resumeCount: 2 })
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "future",
        schedulesAt: new Date("2026-09-01T09:00:00Z"),
      }),
    ).resolves.toEqual({ id: "b-1" })
  })

  // Rows that are not this workspace's draft (another workspace, or a
  // broadcast that is not a draft) keep the write's own error.
  test("leaves a non-draft to the write's own error and queues nothing", async () => {
    mockHasBroadcastRecipients.mockResolvedValue(true)
    findFirstBroadcast.mockResolvedValue(undefined)
    updateReturning.mockResolvedValue([])

    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "future",
        schedulesAt: new Date("2026-09-01T09:00:00Z"),
      }),
    ).rejects.toThrow("Broadcast is not a draft")

    expect(mockHasBroadcastRecipients).not.toHaveBeenCalled()
    expect(mockScheduleAdd).not.toHaveBeenCalled()
  })

  // A moveToDraft round-trip between the checks and the write (schedule,
  // prepare writes, back to draft) bumps the epoch: the write must then match
  // nothing instead of scheduling on top of that run's recipients.
  test("pins the schedule write to the epoch the checks ran against", async () => {
    findFirstBroadcast.mockResolvedValue({ resumeCount: 4 })
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "future",
      schedulesAt: new Date("2026-09-01T09:00:00Z"),
    })

    expect(mockHasBroadcastRecipients).toHaveBeenCalledWith("b-1")
    expect(mockScheduleAdd).not.toHaveBeenCalled()
    expect(flatten(updateReturning.mock.calls[0][0].condition)).toContainEqual({
      __eq: ["broadcast.resumeCount", 4],
    })
  })

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
    expect(selectForUpdate).not.toHaveBeenCalled()
    expect(broadcastPlanPolicyService.lockActivation).not.toHaveBeenCalled()
  })

  test.each([
    [120, 120],
    [null, null],
  ] as const)("writes a submitted send rate of %s on the unrestricted path", async (sendRatePerMinute, expected) => {
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "now",
      schedulesAt: new Date(),
      sendRatePerMinute,
    })

    expect(updateReturning.mock.calls[0][0].values.sendRatePerMinute).toBe(
      expected,
    )
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

  test("pre-reads a trial non-Messenger draft and keeps today's write", async () => {
    vi.mocked(broadcastPlanPolicyService.hasRestrictions).mockReturnValue(true)
    selectForUpdate.mockResolvedValue([
      {
        id: "b-1",
        channel: "whatsapp",
        sendRatePerMinute: null,
      },
    ])
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "channel" }])

    await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "future",
      schedulesAt: new Date(),
    })

    expect(selectForUpdate).toHaveBeenCalledTimes(1)
    expect(updateReturning.mock.calls[0][0].values).not.toHaveProperty(
      "sendRatePerMinute",
    )
    expect(broadcastPlanPolicyService.lockActivation).not.toHaveBeenCalled()
  })

  test("keeps the update-first order for a trial non-Messenger targets draft", async () => {
    vi.mocked(broadcastPlanPolicyService.hasRestrictions).mockReturnValue(true)
    selectForUpdate.mockResolvedValue([
      {
        id: "b-1",
        channel: "whatsapp",
        sendRatePerMinute: null,
        targetMode: "targets",
      },
    ])
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "targets" }])
    findManyBroadcastTarget.mockResolvedValue([
      { inboxId: "inbox-a", flowId: null, templateId: "tpl-1" },
      { inboxId: "inbox-b", flowId: null, templateId: null },
    ])

    const result = await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "future",
      schedulesAt: new Date(),
    })

    expect(result).toEqual({ id: "b-1" })
    expect(updateReturning.mock.invocationCallOrder[0]).toBeLessThan(
      findManyBroadcastTarget.mock.invocationCallOrder[0],
    )
    expect(deleteTargetsWhere).toHaveBeenCalledTimes(1)
    expect(broadcastPlanPolicyService.lockActivation).not.toHaveBeenCalled()
  })

  test("locks a restricted draft row before the workspace lock and writes last", async () => {
    vi.mocked(broadcastPlanPolicyService.hasRestrictions).mockReturnValue(true)
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    selectForUpdate.mockResolvedValue([
      { id: "b-1", channel: "messenger", sendRatePerMinute: null },
    ])
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "channel" }])

    await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "now",
      schedulesAt: new Date(),
    })

    const lockOrder = vi.mocked(broadcastPlanPolicyService.lockActivation).mock
      .invocationCallOrder[0]
    expect(selectForUpdate.mock.invocationCallOrder[0]).toBeLessThan(lockOrder)
    expect(lockOrder).toBeLessThan(updateReturning.mock.invocationCallOrder[0])
  })

  test("rejects a restricted stored rate before scheduling", async () => {
    vi.mocked(broadcastPlanPolicyService.hasRestrictions).mockReturnValue(true)
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    vi.mocked(
      broadcastPlanPolicyService.assertSendRateAllowed,
    ).mockImplementation(() => {
      throw new Error("send rate limited")
    })
    selectForUpdate.mockResolvedValue([
      { id: "b-1", channel: "messenger", sendRatePerMinute: 61 },
    ])

    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "now",
        schedulesAt: new Date(),
      }),
    ).rejects.toThrow("send rate limited")

    expect(updateReturning).not.toHaveBeenCalled()
    expect(broadcastPlanPolicyService.lockActivation).not.toHaveBeenCalled()
  })

  test("checks a submitted restricted rate instead of the stored rate", async () => {
    vi.mocked(broadcastPlanPolicyService.hasRestrictions).mockReturnValue(true)
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    vi.mocked(
      broadcastPlanPolicyService.resolveSendRateOverride,
    ).mockReturnValue({ sendRatePerMinute: 30 })
    selectForUpdate.mockResolvedValue([
      { id: "b-1", channel: "messenger", sendRatePerMinute: 61 },
    ])
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "channel" }])

    await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "now",
      schedulesAt: new Date(),
      sendRatePerMinute: 30,
    })

    expect(
      broadcastPlanPolicyService.assertSendRateAllowed,
    ).toHaveBeenCalledWith(restrictedContext, 30)
    expect(
      broadcastPlanPolicyService.resolveSendRateOverride,
    ).toHaveBeenCalledWith(restrictedContext, 30)
    expect(updateReturning.mock.calls[0][0].values.sendRatePerMinute).toBe(30)
  })

  test("rejects an over-cap submitted restricted rate without writing", async () => {
    vi.mocked(broadcastPlanPolicyService.hasRestrictions).mockReturnValue(true)
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    vi.mocked(
      broadcastPlanPolicyService.assertSendRateAllowed,
    ).mockImplementation((_restriction, sendRatePerMinute) => {
      if (sendRatePerMinute === 61) {
        throw new Error("send rate limited")
      }
    })
    selectForUpdate.mockResolvedValue([
      { id: "b-1", channel: "messenger", sendRatePerMinute: 30 },
    ])

    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "now",
        schedulesAt: new Date(),
        sendRatePerMinute: 61,
      }),
    ).rejects.toThrow("send rate limited")

    expect(updateReturning).not.toHaveBeenCalled()
  })

  test("rolls back scheduling when the restricted active slot is occupied", async () => {
    vi.mocked(broadcastPlanPolicyService.hasRestrictions).mockReturnValue(true)
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    vi.mocked(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).mockRejectedValue(new Error("active slot limited"))
    selectForUpdate.mockResolvedValue([
      { id: "b-1", channel: "messenger", sendRatePerMinute: null },
    ])

    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "now",
        schedulesAt: new Date(),
      }),
    ).rejects.toThrow("active slot limited")

    expect(updateReturning).not.toHaveBeenCalled()
    expect(findManyBroadcastTarget).not.toHaveBeenCalled()
    expect(deleteTargetsWhere).not.toHaveBeenCalled()
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("reports empty targets before an occupied restricted slot", async () => {
    vi.mocked(broadcastPlanPolicyService.hasRestrictions).mockReturnValue(true)
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    vi.mocked(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).mockRejectedValue(new Error("active slot limited"))
    selectForUpdate.mockResolvedValue([
      {
        id: "b-1",
        channel: "messenger",
        sendRatePerMinute: null,
        targetMode: "targets",
      },
    ])
    findManyBroadcastTarget.mockResolvedValue([])

    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "now",
        schedulesAt: new Date(),
      }),
    ).rejects.toMatchObject({
      field: "targets",
      message: "Select a template or flow for at least one page",
    })

    expect(
      broadcastPlanPolicyService.assertSendRateAllowed,
    ).not.toHaveBeenCalled()
    expect(broadcastPlanPolicyService.lockActivation).not.toHaveBeenCalled()
    expect(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).not.toHaveBeenCalled()
    expect(updateReturning).not.toHaveBeenCalled()
  })

  test("reports empty targets before checking a restricted stored rate", async () => {
    vi.mocked(broadcastPlanPolicyService.hasRestrictions).mockReturnValue(true)
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    vi.mocked(
      broadcastPlanPolicyService.assertSendRateAllowed,
    ).mockImplementation(() => {
      throw new Error("send rate limited")
    })
    selectForUpdate.mockResolvedValue([
      {
        id: "b-1",
        channel: "messenger",
        sendRatePerMinute: 61,
        targetMode: "targets",
      },
    ])
    findManyBroadcastTarget.mockResolvedValue([])

    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "now",
        schedulesAt: new Date(),
      }),
    ).rejects.toMatchObject({
      field: "targets",
      message: "Select a template or flow for at least one page",
    })

    expect(
      broadcastPlanPolicyService.assertSendRateAllowed,
    ).not.toHaveBeenCalled()
    expect(broadcastPlanPolicyService.lockActivation).not.toHaveBeenCalled()
    expect(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).not.toHaveBeenCalled()
    expect(updateReturning).not.toHaveBeenCalled()
  })

  test("keeps the unrestricted update before target normalization", async () => {
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "targets" }])
    findManyBroadcastTarget.mockResolvedValue([
      { inboxId: "inbox-a", flowId: "flow-1", templateId: null },
    ])

    await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "now",
      schedulesAt: new Date(),
    })

    expect(updateReturning.mock.invocationCallOrder[0]).toBeLessThan(
      findManyBroadcastTarget.mock.invocationCallOrder[0],
    )
  })

  test("stores 60 after the restricted schedule checks pass", async () => {
    vi.mocked(broadcastPlanPolicyService.hasRestrictions).mockReturnValue(true)
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    selectForUpdate.mockResolvedValue([
      { id: "b-1", channel: "messenger", sendRatePerMinute: null },
    ])
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "channel" }])

    await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "now",
      schedulesAt: new Date(),
    })

    expect(updateReturning.mock.calls[0][0].values.sendRatePerMinute).toBe(60)
    expect(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: "ws-1",
      channel: "messenger",
      ctx: restrictedContext,
      excludeBroadcastId: "b-1",
    })
  })

  test("stores 60 when a restricted schedule explicitly clears the rate", async () => {
    vi.mocked(broadcastPlanPolicyService.hasRestrictions).mockReturnValue(true)
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    selectForUpdate.mockResolvedValue([
      { id: "b-1", channel: "messenger", sendRatePerMinute: 30 },
    ])
    updateReturning.mockResolvedValue([{ id: "b-1", targetMode: "channel" }])

    await broadcastService.scheduleDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      schedulesType: "now",
      schedulesAt: new Date(),
      sendRatePerMinute: null,
    })

    expect(
      broadcastPlanPolicyService.assertSendRateAllowed,
    ).toHaveBeenCalledWith(restrictedContext, null)
    expect(updateReturning.mock.calls[0][0].values.sendRatePerMinute).toBe(60)
  })

  test("throws the stale-draft error before locking or counting", async () => {
    vi.mocked(broadcastPlanPolicyService.hasRestrictions).mockReturnValue(true)
    selectForUpdate.mockResolvedValue([])
    vi.mocked(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).mockRejectedValue(new Error("active slot limited"))

    await expect(
      broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "stale",
        schedulesType: "now",
        schedulesAt: new Date(),
      }),
    ).rejects.toThrow("Broadcast is not a draft")

    expect(broadcastPlanPolicyService.lockActivation).not.toHaveBeenCalled()
    expect(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).not.toHaveBeenCalled()
    expect(updateReturning).not.toHaveBeenCalled()
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
      schedulesType: undefined,
      name: { ilike: "%sale%" },
      deletedAt: { isNull: true },
      // A paused or ended series has no run at its stale `schedulesAt`.
      OR: [
        { schedulesType: { ne: "recurring" } },
        { occurrenceAt: { isNotNull: true } },
        { status: { notIn: ["cancelled", "sent"] } },
      ],
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

  // Editing a draft and sending it schedules it just like `scheduleDraft`, so
  // it goes through the same leftover gate and epoch pin.
  test("refuses to send a draft that still holds leftover recipients", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    findFirstBroadcast.mockResolvedValue({ resumeCount: 1 })
    mockHasBroadcastRecipients.mockResolvedValue(true)

    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        canViewEmailAndPhone: true,
        data: { ...flowDraftData, saveAsDraft: false },
      }),
    ).rejects.toThrow("still clearing")

    expect(mockScheduleAdd).toHaveBeenCalledWith(
      "purgeDraftBroadcastRecipients",
      expect.anything(),
      expect.objectContaining({
        jobId: "schedule-purge-draft-broadcast-b-1-draft",
      }),
    )
    expect(updateReturning).not.toHaveBeenCalled()
  })

  test("pins a send to the draft's epoch", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    findFirstBroadcast.mockResolvedValue({ resumeCount: 7 })
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    const result = await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      canViewEmailAndPhone: true,
      data: { ...flowDraftData, saveAsDraft: false },
    })

    expect(result).toEqual({ id: "b-1", status: "scheduled" })
    expect(flatten(updateReturning.mock.calls[0][0].condition)).toContainEqual({
      __eq: ["broadcast.resumeCount", 7],
    })
  })

  test("saving it as a draft again skips the leftover gate", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      canViewEmailAndPhone: true,
      data: flowDraftData,
    })

    expect(findFirstBroadcast).not.toHaveBeenCalled()
    expect(mockScheduleGetJob).not.toHaveBeenCalled()
    expect(mockHasBroadcastRecipients).not.toHaveBeenCalled()
  })

  test("keeps an existing name and only fills a blank one from the flow", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      canViewEmailAndPhone: true,
      data: flowDraftData,
    })

    const { values } = updateReturning.mock.calls[0][0]
    expect(values.name).toEqual({
      __sql: "COALESCE(NULLIF(BTRIM(?), ''), ?)",
      values: ["broadcast.name", "Autumn sale"],
    })
  })

  test("still rejects a missing flow even though the name is kept", async () => {
    findFirstFlow.mockResolvedValue(undefined)

    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        canViewEmailAndPhone: true,
        data: flowDraftData,
      }),
    ).rejects.toThrow("Flow not found")
    expect(updateReturning).not.toHaveBeenCalled()
  })

  test("updates the flow and keeps the row a draft", async () => {
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
    expect(
      broadcastPlanPolicyService.resolveForWorkspace,
    ).not.toHaveBeenCalled()
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
    expect(
      broadcastPlanPolicyService.resolveForWorkspace,
    ).not.toHaveBeenCalled()
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
    expect(
      broadcastPlanPolicyService.resolveForWorkspace,
    ).not.toHaveBeenCalled()
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

  test("checks a restricted draft before writing and spreads the rate override last", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    selectForUpdate.mockResolvedValue([{ id: "b-1" }])
    updateReturning.mockResolvedValue([{ id: "b-1" }])
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )

    await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      canViewEmailAndPhone: true,
      data: {
        ...flowDraftData,
        channel: "messenger",
        subaction: "messengerTemplateMessage",
        saveAsDraft: false,
      },
    })

    expect(selectForUpdate).toHaveBeenCalledTimes(1)
    expect(updateReturning.mock.calls[0][0].values.sendRatePerMinute).toBe(60)
    expect(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: "ws-1",
      channel: "messenger",
      ctx: restrictedContext,
      excludeBroadcastId: "b-1",
    })
  })

  test("keeps a non-trial Messenger activation unchanged after identity reads", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    updateReturning.mockResolvedValue([{ id: "b-1" }])

    await broadcastService.updateDraft({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      canViewEmailAndPhone: true,
      data: {
        ...flowDraftData,
        channel: "messenger",
        subaction: "messengerTemplateMessage",
        saveAsDraft: false,
        sendRatePerMinute: 30,
      },
    })

    expect(broadcastPlanPolicyService.resolveForWorkspace).toHaveBeenCalledWith(
      "ws-1",
    )
    expect(selectForUpdate).not.toHaveBeenCalled()
    expect(broadcastPlanPolicyService.lockActivation).not.toHaveBeenCalled()
    expect(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).not.toHaveBeenCalled()
    expect(
      broadcastPlanPolicyService.resolveSendRateOverride,
    ).not.toHaveBeenCalled()
    expect(updateReturning.mock.calls[0][0].values).toMatchObject({
      status: "scheduled",
      sendRatePerMinute: 30,
    })
  })

  test("rejects an over-cap restricted draft without writing targets or audit", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    selectForUpdate.mockResolvedValue([{ id: "b-1" }])
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    vi.mocked(
      broadcastPlanPolicyService.assertSendRateAllowed,
    ).mockImplementation(() => {
      throw new Error("send rate limited")
    })

    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        canViewEmailAndPhone: true,
        data: {
          ...flowDraftData,
          channel: "messenger",
          subaction: "messengerTemplateMessage",
          saveAsDraft: false,
          sendRatePerMinute: 61,
        },
      }),
    ).rejects.toThrow("send rate limited")

    expect(updateReturning).not.toHaveBeenCalled()
    expect(deleteTargetsWhere).not.toHaveBeenCalled()
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("rolls back a restricted draft when its active slot is occupied", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    selectForUpdate.mockResolvedValue([{ id: "b-1" }])
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    vi.mocked(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).mockRejectedValue(new Error("active slot limited"))

    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        canViewEmailAndPhone: true,
        data: {
          ...flowDraftData,
          channel: "messenger",
          subaction: "messengerTemplateMessage",
          saveAsDraft: false,
        },
      }),
    ).rejects.toThrow("active slot limited")

    expect(broadcastPlanPolicyService.lockActivation).toHaveBeenCalled()
    expect(updateReturning).not.toHaveBeenCalled()
    expect(deleteTargetsWhere).not.toHaveBeenCalled()
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("throws the restricted stale-draft error before slot enforcement", async () => {
    findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
    selectForUpdate.mockResolvedValue([])
    vi.mocked(broadcastPlanPolicyService.restrictionFor).mockReturnValue(
      restrictedContext,
    )
    vi.mocked(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).mockRejectedValue(new Error("active slot limited"))

    await expect(
      broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "stale",
        canViewEmailAndPhone: true,
        data: {
          ...flowDraftData,
          channel: "messenger",
          subaction: "messengerTemplateMessage",
          saveAsDraft: false,
        },
      }),
    ).rejects.toThrow("Broadcast is not a draft")

    expect(broadcastPlanPolicyService.lockActivation).not.toHaveBeenCalled()
    expect(
      broadcastPlanPolicyService.assertActiveSlotAvailable,
    ).not.toHaveBeenCalled()
    expect(updateReturning).not.toHaveBeenCalled()
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

describe("repeating drafts", () => {
  const recurrence = {
    frequency: "daily" as const,
    interval: 1,
    timeOfDay: "09:00",
    timezone: "Asia/Ho_Chi_Minh",
    startsOn: "2026-10-01",
    end: { kind: "never" as const },
  }
  const nextRunAt = new Date("2026-10-14T02:00:00.000Z")
  const draftRow = {
    id: "b-1",
    channel: "whatsapp",
    sendRatePerMinute: null,
    targetMode: "channel",
  }

  const loadMocks = async () => {
    const { broadcastRecurrenceService } = await import(
      "../src/broadcast/recurrence.service"
    )
    const { broadcastRecurrenceRepository } = await import(
      "@chatbotx.io/database/repositories"
    )
    vi.mocked(broadcastRecurrenceService.upsertRule).mockResolvedValue({
      id: "series-1",
    } as never)
    vi.mocked(broadcastRecurrenceService.arm).mockResolvedValue({
      nextRunAt,
      sendRateOverride: undefined,
    })
    return {
      service: broadcastRecurrenceService,
      repository: broadcastRecurrenceRepository,
    }
  }

  describe("scheduleDraft", () => {
    test("stores the rule, arms the series and makes the next run the schedule - nothing is sent now", async () => {
      const { service } = await loadMocks()
      selectForUpdate.mockResolvedValue([draftRow])
      updateReturning.mockResolvedValue([{ id: "b-1", status: "recurring" }])

      const result = await broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "recurring",
        schedulesAt: new Date(),
        recurrence,
      })

      expect(result).toEqual({ id: "b-1" })
      expect(service.upsertRule).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ broadcastId: "b-1", rule: recurrence }),
      )
      expect(updateReturning.mock.calls[0][0].values).toMatchObject({
        status: "recurring",
        schedulesType: "recurring",
        schedulesAt: nextRunAt,
      })
      expect(mockDispatchAuditRecord).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: "launch" }),
      )
      expect(broadcastPlanPolicyService.lockActivation).not.toHaveBeenCalled()
    })

    test("only a series can be armed: a run of another series is out of scope", async () => {
      await loadMocks()
      selectForUpdate.mockResolvedValue([draftRow])
      updateReturning.mockResolvedValue([{ id: "b-1", status: "recurring" }])

      await broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "recurring",
        schedulesAt: new Date(),
        recurrence,
      })

      expect(
        updateReturning.mock.calls.some(([call]) =>
          flatten(call.condition).some(
            (part) =>
              JSON.stringify(part) ===
              JSON.stringify({ __isNull: "broadcast.occurrenceAt" }),
          ),
        ),
      ).toBe(true)
    })

    test("a submitted send rate is stored even when the plan sets no override", async () => {
      await loadMocks()
      selectForUpdate.mockResolvedValue([draftRow])
      updateReturning.mockResolvedValue([{ id: "b-1" }])

      await broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "recurring",
        schedulesAt: new Date(),
        sendRatePerMinute: 250,
        recurrence,
      })

      expect(updateReturning.mock.calls[0][0].values.sendRatePerMinute).toBe(
        250,
      )
    })

    test("without a new rule it re-arms the saved one", async () => {
      const { service, repository } = await loadMocks()
      selectForUpdate.mockResolvedValue([draftRow])
      vi.mocked(repository.lockForWrite).mockResolvedValue([
        { id: "series-1" },
      ] as never)
      updateReturning.mockResolvedValue([{ id: "b-1" }])

      await broadcastService.scheduleDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        schedulesType: "recurring",
        schedulesAt: new Date(),
      })

      expect(service.upsertRule).not.toHaveBeenCalled()
      expect(service.arm).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recurrence: { id: "series-1" } }),
      )
    })

    test("a draft with neither a new nor a saved rule is a recurrence validation error", async () => {
      const { repository } = await loadMocks()
      selectForUpdate.mockResolvedValue([draftRow])
      vi.mocked(repository.lockForWrite).mockResolvedValue([])

      await expect(
        broadcastService.scheduleDraft({
          workspaceId: "ws-1",
          broadcastId: "b-1",
          schedulesType: "recurring",
          schedulesAt: new Date(),
        }),
      ).rejects.toMatchObject({ code: "validation", field: "recurrence" })
      expect(updateReturning).not.toHaveBeenCalled()
    })

    test("a broadcast that is not a draft is rejected without touching the series", async () => {
      const { service } = await loadMocks()
      selectForUpdate.mockResolvedValue([])

      await expect(
        broadcastService.scheduleDraft({
          workspaceId: "ws-1",
          broadcastId: "b-1",
          schedulesType: "recurring",
          schedulesAt: new Date(),
          recurrence,
        }),
      ).rejects.toThrow("Broadcast is not a draft")
      expect(service.upsertRule).not.toHaveBeenCalled()
    })
  })

  describe("updateDraft", () => {
    const repeatingData = {
      channel: "whatsapp" as const,
      flowId: "flow-9",
      subaction: "whatsappTemplateMessage" as const,
      schedulesType: "recurring" as const,
      schedulesAt: null,
      recurrence,
      contactFilter: { operator: "and" as const, conditions: [] },
      saveAsDraft: false,
    }

    test("checks the draft, stores the rule first (locking the series), then rewrites the draft and arms it", async () => {
      const { service } = await loadMocks()
      findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
      selectForUpdate.mockResolvedValue([{ id: "b-1" }])
      updateReturning.mockResolvedValue([
        { id: "b-1", channel: "whatsapp", sendRatePerMinute: null },
      ])

      const result = await broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        canViewEmailAndPhone: true,
        data: repeatingData,
      })

      expect(result).toMatchObject({ id: "b-1", status: "recurring" })
      expect(service.upsertRule.mock.invocationCallOrder[0]).toBeLessThan(
        updateReturning.mock.invocationCallOrder[0],
      )
      // First write keeps it a draft; the activation flips it to recurring.
      expect(updateReturning.mock.calls[0][0].values.status).toBe("draft")
      expect(updateReturning.mock.calls[1][0].values).toMatchObject({
        status: "recurring",
        schedulesAt: nextRunAt,
      })
      expect(broadcastPlanPolicyService.lockActivation).not.toHaveBeenCalled()
      expect(mockDispatchAuditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: "broadcast_recurrence_started" }),
      )
    })

    test("only a series can be armed: a run of another series is out of scope", async () => {
      await loadMocks()
      findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
      selectForUpdate.mockResolvedValue([{ id: "b-1" }])
      updateReturning.mockResolvedValue([
        { id: "b-1", channel: "whatsapp", sendRatePerMinute: null },
      ])

      await broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        canViewEmailAndPhone: true,
        data: repeatingData,
      })

      expect(
        updateReturning.mock.calls.some(([call]) =>
          flatten(call.condition).some(
            (part) =>
              JSON.stringify(part) ===
              JSON.stringify({ __isNull: "broadcast.occurrenceAt" }),
          ),
        ),
      ).toBe(true)
    })

    test("saving it as a draft stores the rule but does not arm", async () => {
      const { service } = await loadMocks()
      findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
      selectForUpdate.mockResolvedValue([{ id: "b-1" }])
      updateReturning.mockResolvedValue([{ id: "b-1", channel: "whatsapp" }])

      const result = await broadcastService.updateDraft({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        canViewEmailAndPhone: true,
        data: { ...repeatingData, saveAsDraft: true },
      })

      expect(result).toEqual({ id: "b-1", status: "draft" })
      expect(service.arm).not.toHaveBeenCalled()
      expect(updateReturning).toHaveBeenCalledTimes(1)
    })

    test("a draft that is gone is rejected before the series is touched", async () => {
      const { service } = await loadMocks()
      findFirstFlow.mockResolvedValue({ id: "flow-9", name: "Autumn sale" })
      selectForUpdate.mockResolvedValue([])

      await expect(
        broadcastService.updateDraft({
          workspaceId: "ws-1",
          broadcastId: "b-1",
          canViewEmailAndPhone: true,
          data: repeatingData,
        }),
      ).rejects.toThrow("Broadcast is not a draft")
      expect(service.upsertRule).not.toHaveBeenCalled()
    })
  })
})

describe("broadcastService.list — repeating broadcasts", () => {
  test("a one-off that kept a disarmed series row does not present a schedule, same as the detail", async () => {
    const { broadcastRepository } = await import(
      "@chatbotx.io/database/repositories"
    )
    const series = { id: "series-1", rule: {} }
    Object.assign(broadcastRepository, {
      listWithRelations: vi.fn().mockResolvedValue([
        {
          id: "t",
          schedulesType: "recurring",
          occurrenceAt: null,
          recurrence: series,
        },
        {
          id: "o",
          schedulesType: "now",
          occurrenceAt: null,
          recurrence: series,
        },
        {
          id: "r",
          schedulesType: "future",
          occurrenceAt: new Date("2026-10-13T02:00:00.000Z"),
          recurrence: null,
        },
      ]),
      count: vi.fn().mockResolvedValue(3),
    })

    const result = await broadcastService.list({ workspaceId: "ws-1" })

    expect(result.data.map((row) => [row.id, row.recurrence])).toEqual([
      ["t", { ...series, nextSendAt: null }],
      ["o", null],
      ["r", null],
    ])
  })

  test("a series row carries the next run that really sends", async () => {
    const { broadcastRepository } = await import(
      "@chatbotx.io/database/repositories"
    )
    const { broadcastRecurrenceService } = await import(
      "../src/broadcast/recurrence.service"
    )
    const nextSendAt = new Date("2026-10-18T02:00:00Z")
    vi.mocked(broadcastRecurrenceService.nextSendAtOf).mockReturnValue(
      nextSendAt,
    )
    Object.assign(broadcastRepository, {
      listWithRelations: vi.fn().mockResolvedValue([
        {
          id: "t",
          schedulesType: "recurring",
          occurrenceAt: null,
          recurrence: { id: "series-1", rule: {} },
        },
      ]),
      count: vi.fn().mockResolvedValue(1),
    })

    const result = await broadcastService.list({ workspaceId: "ws-1" })

    expect(result.data[0].recurrence?.nextSendAt).toEqual(nextSendAt)
  })
})

describe("broadcastService.findByIdOrName — repeating broadcasts", () => {
  const upcoming = ["2026-10-14T02:00:00.000Z"]
  const series = {
    id: "series-1",
    rule: {},
    nextRunAt: new Date("2026-10-14T02:00:00.000Z"),
    occurrenceCount: 0,
  }

  const find = async (broadcast: Record<string, unknown>) => {
    const { broadcastRepository } = await import(
      "@chatbotx.io/database/repositories"
    )
    const { broadcastRecurrenceService } = await import(
      "../src/broadcast/recurrence.service"
    )
    vi.mocked(broadcastRepository.findByIdOrName).mockResolvedValue(
      broadcast as never,
    )
    vi.mocked(broadcastRecurrenceService.upcomingRunsOf).mockReturnValue(
      upcoming,
    )
    return await broadcastService.findByIdOrName({
      workspaceId: "ws-1",
      idOrName: "b-1",
    })
  }

  test("a repeating broadcast carries its schedule with the next runs", async () => {
    const result = await find({
      id: "b-1",
      schedulesType: "recurring",
      occurrenceAt: null,
      recurrence: series,
    })
    expect(result.recurrence).toMatchObject({
      id: "series-1",
      upcomingRuns: upcoming,
    })
  })

  test("the detail carries the next run that really sends", async () => {
    const { broadcastRecurrenceService } = await import(
      "../src/broadcast/recurrence.service"
    )
    const nextSendAt = new Date("2026-10-18T02:00:00Z")
    vi.mocked(broadcastRecurrenceService.nextSendAtOf).mockReturnValue(
      nextSendAt,
    )
    const result = await find({
      id: "b-1",
      schedulesType: "recurring",
      occurrenceAt: null,
      recurrence: series,
    })
    expect(result.recurrence?.nextSendAt).toEqual(nextSendAt)
    expect(broadcastRecurrenceService.nextSendAtOf).toHaveBeenCalledWith(series)
  })

  test("a paused series lists no upcoming runs", async () => {
    const result = await find({
      id: "b-1",
      schedulesType: "recurring",
      occurrenceAt: null,
      recurrence: { ...series, nextRunAt: null },
    })
    expect(result.recurrence?.upcomingRuns).toEqual([])
  })

  test("a one-off edited from a repeating draft does not present the schedule it no longer follows", async () => {
    const result = await find({
      id: "b-1",
      schedulesType: "now",
      occurrenceAt: null,
      recurrence: series,
    })
    expect(result.recurrence).toBeNull()
  })
})
