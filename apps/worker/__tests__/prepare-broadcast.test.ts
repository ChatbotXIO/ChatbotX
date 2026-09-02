import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirstBroadcast = vi.fn()
const findFirstMessengerTemplate = vi.fn()
const findDMByContactIds = vi.fn()
const forEachAudienceChunk = vi.fn()
const scheduleAddSpy = vi.fn()
const loggerInfoSpy = vi.fn()
const loggerWarnSpy = vi.fn()
const purgeBroadcastRecipientsSpy = vi.fn()
const blockedWorkspaceIds = new Set<string>()

type UpdateCall = {
  table: unknown
  values: Record<string, unknown>
  condition: unknown
}
const updateCalls: UpdateCall[] = []

type InsertCall = { table: unknown; values: unknown }
const insertCalls: InsertCall[] = []

const onConflictSpy = vi.fn()

// Rows returned by the promotion UPDATE's `.returning()`. Defaults to a
// match (promotion succeeded) so existing enqueue-path tests keep passing;
// individual tests override this to simulate a lost promotion race.
let promotionReturningRows: Array<{ id: string }> = [{ id: "broadcast-1" }]

vi.mock("@chatbotx.io/business", () => ({
  withBlockedOwnerGuard: async (
    workspaceId: unknown,
    fn: () => Promise<unknown>,
  ) => (blockedWorkspaceIds.has(String(workspaceId)) ? undefined : fn()),
  broadcastService: {
    forEachAudienceChunk: (...args: unknown[]) => forEachAudienceChunk(...args),
  },
  conversationService: {
    findDMByContactIds: (...args: unknown[]) => findDMByContactIds(...args),
  },
}))

vi.mock("@chatbotx.io/database/partials", async () =>
  vi.importActual("@chatbotx.io/database/partials"),
)

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {
    id: "Broadcast.id",
    status: "Broadcast.status",
    deletedAt: "Broadcast.deletedAt",
    resumeCount: "Broadcast.resumeCount",
    __name: "broadcastModel",
  },
  contactsOnBroadcastsModel: { __name: "contactsOnBroadcastsModel" },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  purgeBroadcastRecipients: (...args: unknown[]) =>
    purgeBroadcastRecipientsSpy(...args),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findFirst: (...args: unknown[]) => findFirstBroadcast(...args),
      },
      messengerMessageTemplateModel: {
        findFirst: (...args: unknown[]) => findFirstMessengerTemplate(...args),
      },
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          updateCalls.push({ table, values, condition })
          return {
            returning: () => Promise.resolve(promotionReturningRows),
          }
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (vals: unknown) => {
        insertCalls.push({ table, values: vals })
        return {
          onConflictDoNothing: () => {
            onConflictSpy()
            return Promise.resolve()
          },
        }
      },
    }),
  },
  eq: (left: unknown, right: unknown) => ({ __eq: [left, right] }),
  and: (...args: unknown[]) => ({ __and: args }),
  isNull: (value: unknown) => ({ __isNull: value }),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: (...args: unknown[]) => loggerInfoSpy(...args),
    warn: (...args: unknown[]) => loggerWarnSpy(...args),
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  broadcastSendJobId: (broadcastId: string) => `broadcast-send-${broadcastId}`,
  scheduleQueue: {
    add: (...args: unknown[]) => scheduleAddSpy(...args),
  },
  ScheduleJobData: {
    sendBroadcast: "sendBroadcast",
    prepareBroadcast: "prepareBroadcast",
    enqueueBroadcast: "enqueueBroadcast",
    finalizeBroadcasts: "finalizeBroadcasts",
  },
}))

const { prepareBroadcast } = await import(
  "../src/schedule/handlers/prepare-broadcast"
)

const BROADCAST_ID = "broadcast-1"
const WORKSPACE_ID = "workspace-1"

const baseBroadcast = () => ({
  id: BROADCAST_ID,
  workspaceId: WORKSPACE_ID,
  integrationWhatsappId: null as string | null,
  integrationMessengerId: null as string | null,
  channel: "messenger" as string | null,
  status: "scheduled",
  subaction: null as string | null,
  contactFilter: null as unknown,
  templateId: null as string | null,
  resumeCount: 0,
})

beforeEach(() => {
  updateCalls.length = 0
  insertCalls.length = 0
  findFirstBroadcast.mockResolvedValue(undefined)
  findFirstMessengerTemplate.mockResolvedValue(undefined)
  findDMByContactIds.mockResolvedValue([])
  forEachAudienceChunk.mockResolvedValue(undefined)
  scheduleAddSpy.mockReset()
  loggerInfoSpy.mockReset()
  loggerWarnSpy.mockReset()
  onConflictSpy.mockReset()
  purgeBroadcastRecipientsSpy.mockReset()
  purgeBroadcastRecipientsSpy.mockResolvedValue({
    deleted: 0,
    stopReason: "drained",
  })
  promotionReturningRows = [{ id: BROADCAST_ID }]
  blockedWorkspaceIds.clear()
})

describe("prepareBroadcast", () => {
  test("returns without db writes or queue enqueues when the broadcast is missing", async () => {
    findFirstBroadcast.mockResolvedValue(undefined)

    await prepareBroadcast(BROADCAST_ID)

    expect(updateCalls).toHaveLength(0)
    expect(insertCalls).toHaveLength(0)
    expect(forEachAudienceChunk).not.toHaveBeenCalled()
    expect(scheduleAddSpy).not.toHaveBeenCalled()
  })

  test("returns without db writes or queue enqueues when the workspace is frozen", async () => {
    findFirstBroadcast.mockResolvedValue(baseBroadcast())
    blockedWorkspaceIds.add(WORKSPACE_ID)

    await prepareBroadcast(BROADCAST_ID)

    expect(updateCalls).toHaveLength(0)
    expect(insertCalls).toHaveLength(0)
    expect(forEachAudienceChunk).not.toHaveBeenCalled()
    expect(scheduleAddSpy).not.toHaveBeenCalled()
  })

  test("forwards parsed targeting inputs to broadcastService.forEachAudienceChunk", async () => {
    const contactFilter = {
      operator: "and",
      conditions: [{ field: "fullName", operator: "contains", value: "Ada" }],
    }
    findFirstBroadcast.mockResolvedValue({
      ...baseBroadcast(),
      channel: "whatsapp",
      integrationWhatsappId: "wa-int-1",
      subaction: "whatsappWithin24Hours",
      contactFilter,
    })

    await prepareBroadcast(BROADCAST_ID)

    expect(forEachAudienceChunk).toHaveBeenCalledWith(
      {
        workspaceId: WORKSPACE_ID,
        channels: ["whatsapp"],
        integrationWhatsappId: "wa-int-1",
        integrationMessengerId: null,
        contactFilter,
        subaction: "whatsappWithin24Hours",
      },
      expect.any(Function),
    )
  })

  test("derives Messenger template integration id and forwards it to the audience input", async () => {
    findFirstBroadcast.mockResolvedValue({
      ...baseBroadcast(),
      channel: "messenger",
      subaction: "messengerTemplateMessage",
      templateId: "template-1",
    })
    findFirstMessengerTemplate.mockResolvedValue({
      integrationMessengerId: "messenger-int-1",
    })

    await prepareBroadcast(BROADCAST_ID)

    expect(findFirstMessengerTemplate).toHaveBeenCalledWith({
      where: {
        id: "template-1",
        integrationMessenger: { workspaceId: WORKSPACE_ID },
      },
      columns: { integrationMessengerId: true },
    })
    expect(forEachAudienceChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        channels: ["messenger"],
        integrationMessengerId: "messenger-int-1",
        subaction: "messengerTemplateMessage",
      }),
      expect.any(Function),
    )
  })

  test("forwards the persisted Messenger integration id for flow broadcasts without a template", async () => {
    findFirstBroadcast.mockResolvedValue({
      ...baseBroadcast(),
      channel: "messenger",
      subaction: "messengerTemplateMessage",
      integrationMessengerId: "messenger-int-1",
      templateId: null,
    })

    await prepareBroadcast(BROADCAST_ID)

    expect(findFirstMessengerTemplate).not.toHaveBeenCalled()
    expect(forEachAudienceChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        channels: ["messenger"],
        integrationMessengerId: "messenger-int-1",
      }),
      expect.any(Function),
    )
  })

  test("prefers the persisted Messenger integration id over template derivation", async () => {
    findFirstBroadcast.mockResolvedValue({
      ...baseBroadcast(),
      channel: "messenger",
      subaction: "messengerTemplateMessage",
      integrationMessengerId: "messenger-int-1",
      templateId: "template-1",
    })

    await prepareBroadcast(BROADCAST_ID)

    expect(findFirstMessengerTemplate).not.toHaveBeenCalled()
    expect(forEachAudienceChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationMessengerId: "messenger-int-1",
      }),
      expect.any(Function),
    )
  })

  test("fails closed for invalid persisted channel and subaction values", async () => {
    findFirstBroadcast.mockResolvedValue({
      ...baseBroadcast(),
      channel: "bad-channel",
      subaction: "bad-subaction",
    })

    await prepareBroadcast(BROADCAST_ID)

    expect(forEachAudienceChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: [],
        subaction: undefined,
      }),
      expect.any(Function),
    )
    expect(updateCalls[0].values).toMatchObject({
      status: "sent",
      contactCount: 0,
    })
  })

  test("inserts recipients with DM conversations, skips missing conversations, and enqueues sendBroadcast", async () => {
    findFirstBroadcast.mockResolvedValue(baseBroadcast())
    findDMByContactIds.mockResolvedValue([
      { id: "conv-1", contactId: "contact-1" },
    ])
    forEachAudienceChunk.mockImplementation(
      async (
        _input: unknown,
        onChunk: (
          rows: Array<{ id: string; contactId: string }>,
        ) => Promise<unknown>,
      ) => {
        await onChunk([
          { id: "ci-1", contactId: "contact-1" },
          { id: "ci-2", contactId: "contact-2" },
        ])
      },
    )

    await prepareBroadcast(BROADCAST_ID)

    expect(findDMByContactIds).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-1", "contact-2"],
      channel: "messenger",
    })
    expect(insertCalls).toHaveLength(1)
    expect(onConflictSpy).toHaveBeenCalledTimes(1)
    expect(insertCalls[0].values).toEqual([
      {
        broadcastId: BROADCAST_ID,
        contactId: "contact-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      { broadcastId: BROADCAST_ID, skippedCount: 1 },
      "Skipped broadcast contacts without a DM conversation",
    )
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].values).toMatchObject({
      status: "sending",
      contactCount: 1,
    })
    expect(scheduleAddSpy).toHaveBeenCalledWith(
      "sendBroadcast",
      expect.objectContaining({
        type: "sendBroadcast",
        data: { broadcastId: BROADCAST_ID },
      }),
      {
        jobId: `broadcast-send-${BROADCAST_ID}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    )
  })

  test("passes the broadcast channel to the DM conversation lookup so TikTok resolves by sourceId", async () => {
    findFirstBroadcast.mockResolvedValue({
      ...baseBroadcast(),
      channel: "tiktok",
    })
    findDMByContactIds.mockResolvedValue([
      { id: "conv-tt", contactId: "contact-1" },
    ])
    forEachAudienceChunk.mockImplementation(
      async (
        _input: unknown,
        onChunk: (
          rows: Array<{ id: string; contactId: string }>,
        ) => Promise<unknown>,
      ) => {
        await onChunk([{ id: "ci-1", contactId: "contact-1" }])
      },
    )

    await prepareBroadcast(BROADCAST_ID)

    expect(findDMByContactIds).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-1"],
      channel: "tiktok",
    })
  })

  test("does not insert or enqueue when all audience contacts lack a DM conversation", async () => {
    findFirstBroadcast.mockResolvedValue(baseBroadcast())
    findDMByContactIds.mockResolvedValue([])
    forEachAudienceChunk.mockImplementation(
      async (
        _input: unknown,
        onChunk: (
          rows: Array<{ id: string; contactId: string }>,
        ) => Promise<unknown>,
      ) => {
        await onChunk([{ id: "ci-1", contactId: "contact-1" }])
      },
    )

    await prepareBroadcast(BROADCAST_ID)

    expect(insertCalls).toHaveLength(0)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].values).toMatchObject({
      status: "sent",
      contactCount: 0,
    })
    expect(scheduleAddSpy).not.toHaveBeenCalled()
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      { broadcastId: BROADCAST_ID, skippedCount: 1 },
      "Skipped broadcast contacts without a DM conversation",
    )
  })

  test("marks sent with contactCount zero and does not enqueue when the audience is empty", async () => {
    findFirstBroadcast.mockResolvedValue(baseBroadcast())
    forEachAudienceChunk.mockResolvedValue(undefined)

    await prepareBroadcast(BROADCAST_ID)

    expect(insertCalls).toHaveLength(0)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].values).toMatchObject({
      status: "sent",
      contactCount: 0,
    })
    expect(scheduleAddSpy).not.toHaveBeenCalled()
  })

  describe("stale recipient cleanup", () => {
    test("purges any existing ContactOnBroadcast rows before rebuilding the audience", async () => {
      findFirstBroadcast.mockResolvedValue(baseBroadcast())
      forEachAudienceChunk.mockResolvedValue(undefined)

      await prepareBroadcast(BROADCAST_ID)

      expect(purgeBroadcastRecipientsSpy).toHaveBeenCalledTimes(1)
      expect(purgeBroadcastRecipientsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ broadcastId: BROADCAST_ID }),
      )
      // Cleanup happens before the audience is rebuilt.
      expect(
        purgeBroadcastRecipientsSpy.mock.invocationCallOrder[0],
      ).toBeLessThan(forEachAudienceChunk.mock.invocationCallOrder[0])
    })

    test("does not purge when the broadcast is missing or the workspace is blocked", async () => {
      findFirstBroadcast.mockResolvedValue(undefined)
      await prepareBroadcast(BROADCAST_ID)
      expect(purgeBroadcastRecipientsSpy).not.toHaveBeenCalled()

      findFirstBroadcast.mockResolvedValue(baseBroadcast())
      blockedWorkspaceIds.add(WORKSPACE_ID)
      await prepareBroadcast(BROADCAST_ID)
      expect(purgeBroadcastRecipientsSpy).not.toHaveBeenCalled()
    })
  })

  describe("promotion-epoch pin", () => {
    test("pins the promotion UPDATE to id, status, deletedAt, and the resumeCount read at the start of the run", async () => {
      findFirstBroadcast.mockResolvedValue({
        ...baseBroadcast(),
        resumeCount: 3,
      })
      forEachAudienceChunk.mockResolvedValue(undefined)

      await prepareBroadcast(BROADCAST_ID)

      expect(updateCalls[0].condition).toEqual({
        __and: [
          { __eq: ["Broadcast.id", BROADCAST_ID] },
          { __eq: ["Broadcast.status", "scheduled"] },
          { __isNull: "Broadcast.deletedAt" },
          { __eq: ["Broadcast.resumeCount", 3] },
        ],
      })
    })

    test("skips the sendBroadcast enqueue when the promotion UPDATE matches 0 rows (lost the race)", async () => {
      findFirstBroadcast.mockResolvedValue(baseBroadcast())
      findDMByContactIds.mockResolvedValue([
        { id: "conv-1", contactId: "contact-1" },
      ])
      forEachAudienceChunk.mockImplementation(
        async (
          _input: unknown,
          onChunk: (
            rows: Array<{ id: string; contactId: string }>,
          ) => Promise<unknown>,
        ) => {
          await onChunk([{ id: "ci-1", contactId: "contact-1" }])
        },
      )
      promotionReturningRows = []

      await prepareBroadcast(BROADCAST_ID)

      expect(scheduleAddSpy).not.toHaveBeenCalled()
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ broadcastId: BROADCAST_ID }),
        expect.stringContaining("lost the promotion race"),
      )
    })

    test("still enqueues sendBroadcast when the promotion UPDATE matches", async () => {
      findFirstBroadcast.mockResolvedValue(baseBroadcast())
      findDMByContactIds.mockResolvedValue([
        { id: "conv-1", contactId: "contact-1" },
      ])
      forEachAudienceChunk.mockImplementation(
        async (
          _input: unknown,
          onChunk: (
            rows: Array<{ id: string; contactId: string }>,
          ) => Promise<unknown>,
        ) => {
          await onChunk([{ id: "ci-1", contactId: "contact-1" }])
        },
      )
      promotionReturningRows = [{ id: BROADCAST_ID }]

      await prepareBroadcast(BROADCAST_ID)

      expect(scheduleAddSpy).toHaveBeenCalledTimes(1)
    })
  })
})
