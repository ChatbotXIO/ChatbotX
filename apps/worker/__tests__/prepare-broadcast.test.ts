import { beforeEach, describe, expect, test, vi } from "vitest"

const findScheduledForPrepare = vi.fn()
const resolveTemplateIntegrationMessengerId = vi.fn()
const findDMByContactIds = vi.fn()
const forEachAudienceChunk = vi.fn()
const insertRecipients = vi.fn()
const promoteAfterPrepare = vi.fn()
const scheduleAddSpy = vi.fn()
const loggerInfoSpy = vi.fn()
const loggerWarnSpy = vi.fn()
const purgeBroadcastRecipientsSpy = vi.fn()
const blockedWorkspaceIds = new Set<string>()

// Whether the promotion CAS should report success. Defaults to true
// (promotion succeeded) so existing enqueue-path tests keep passing;
// individual tests override this to simulate a lost promotion race.
let promotionSucceeds = true

vi.mock("@chatbotx.io/business", () => ({
  withBlockedOwnerGuard: async (
    workspaceId: unknown,
    fn: () => Promise<unknown>,
  ) => (blockedWorkspaceIds.has(String(workspaceId)) ? undefined : fn()),
  broadcastService: {
    forEachAudienceChunk: (...args: unknown[]) => forEachAudienceChunk(...args),
    findScheduledForPrepare: (...args: unknown[]) =>
      findScheduledForPrepare(...args),
    resolveTemplateIntegrationMessengerId: (...args: unknown[]) =>
      resolveTemplateIntegrationMessengerId(...args),
    insertRecipients: (...args: unknown[]) => insertRecipients(...args),
    promoteAfterPrepare: (...args: unknown[]) => promoteAfterPrepare(...args),
  },
  conversationService: {
    findDMByContactIds: (...args: unknown[]) => findDMByContactIds(...args),
  },
}))

vi.mock("@chatbotx.io/database/partials", async () =>
  vi.importActual("@chatbotx.io/database/partials"),
)

vi.mock("@chatbotx.io/database/repositories", () => ({
  purgeBroadcastRecipients: (...args: unknown[]) =>
    purgeBroadcastRecipientsSpy(...args),
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
  findScheduledForPrepare.mockResolvedValue(undefined)
  resolveTemplateIntegrationMessengerId.mockResolvedValue(null)
  findDMByContactIds.mockResolvedValue([])
  forEachAudienceChunk.mockResolvedValue(undefined)
  insertRecipients.mockResolvedValue(undefined)
  promoteAfterPrepare.mockImplementation(() =>
    Promise.resolve(promotionSucceeds),
  )
  scheduleAddSpy.mockReset()
  loggerInfoSpy.mockReset()
  loggerWarnSpy.mockReset()
  purgeBroadcastRecipientsSpy.mockReset()
  purgeBroadcastRecipientsSpy.mockResolvedValue({
    deleted: 0,
    stopReason: "drained",
  })
  promotionSucceeds = true
  blockedWorkspaceIds.clear()
})

describe("prepareBroadcast", () => {
  test("returns without db writes or queue enqueues when the broadcast is missing", async () => {
    findScheduledForPrepare.mockResolvedValue(undefined)

    await prepareBroadcast(BROADCAST_ID)

    expect(insertRecipients).not.toHaveBeenCalled()
    expect(promoteAfterPrepare).not.toHaveBeenCalled()
    expect(forEachAudienceChunk).not.toHaveBeenCalled()
    expect(scheduleAddSpy).not.toHaveBeenCalled()
  })

  test("returns without db writes or queue enqueues when the workspace is frozen", async () => {
    findScheduledForPrepare.mockResolvedValue(baseBroadcast())
    blockedWorkspaceIds.add(WORKSPACE_ID)

    await prepareBroadcast(BROADCAST_ID)

    expect(insertRecipients).not.toHaveBeenCalled()
    expect(promoteAfterPrepare).not.toHaveBeenCalled()
    expect(forEachAudienceChunk).not.toHaveBeenCalled()
    expect(scheduleAddSpy).not.toHaveBeenCalled()
  })

  test("forwards parsed targeting inputs to broadcastService.forEachAudienceChunk", async () => {
    const contactFilter = {
      operator: "and",
      conditions: [{ field: "fullName", operator: "contains", value: "Ada" }],
    }
    findScheduledForPrepare.mockResolvedValue({
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
    findScheduledForPrepare.mockResolvedValue({
      ...baseBroadcast(),
      channel: "messenger",
      subaction: "messengerTemplateMessage",
      templateId: "template-1",
    })
    resolveTemplateIntegrationMessengerId.mockResolvedValue("messenger-int-1")

    await prepareBroadcast(BROADCAST_ID)

    expect(resolveTemplateIntegrationMessengerId).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      templateId: "template-1",
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
    findScheduledForPrepare.mockResolvedValue({
      ...baseBroadcast(),
      channel: "messenger",
      subaction: "messengerTemplateMessage",
      integrationMessengerId: "messenger-int-1",
      templateId: null,
    })

    await prepareBroadcast(BROADCAST_ID)

    expect(resolveTemplateIntegrationMessengerId).not.toHaveBeenCalled()
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
    findScheduledForPrepare.mockResolvedValue({
      ...baseBroadcast(),
      channel: "messenger",
      subaction: "messengerTemplateMessage",
      integrationMessengerId: "messenger-int-1",
      templateId: "template-1",
    })

    await prepareBroadcast(BROADCAST_ID)

    expect(resolveTemplateIntegrationMessengerId).not.toHaveBeenCalled()
    expect(forEachAudienceChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationMessengerId: "messenger-int-1",
      }),
      expect.any(Function),
    )
  })

  test("fails closed for invalid persisted channel and subaction values", async () => {
    findScheduledForPrepare.mockResolvedValue({
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
    expect(promoteAfterPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent", contactCount: 0 }),
    )
  })

  test("inserts recipients with DM conversations, skips missing conversations, and enqueues sendBroadcast", async () => {
    findScheduledForPrepare.mockResolvedValue(baseBroadcast())
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
    expect(insertRecipients).toHaveBeenCalledTimes(1)
    expect(insertRecipients).toHaveBeenCalledWith({
      recipients: [
        {
          broadcastId: BROADCAST_ID,
          contactId: "contact-1",
          contactInboxId: "ci-1",
          conversationId: "conv-1",
        },
      ],
    })
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      { broadcastId: BROADCAST_ID, skippedCount: 1 },
      "Skipped broadcast contacts without a DM conversation",
    )
    expect(promoteAfterPrepare).toHaveBeenCalledTimes(1)
    expect(promoteAfterPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sending", contactCount: 1 }),
    )
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
    findScheduledForPrepare.mockResolvedValue({
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
    findScheduledForPrepare.mockResolvedValue(baseBroadcast())
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

    expect(insertRecipients).not.toHaveBeenCalled()
    expect(promoteAfterPrepare).toHaveBeenCalledTimes(1)
    expect(promoteAfterPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent", contactCount: 0 }),
    )
    expect(scheduleAddSpy).not.toHaveBeenCalled()
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      { broadcastId: BROADCAST_ID, skippedCount: 1 },
      "Skipped broadcast contacts without a DM conversation",
    )
  })

  test("marks sent with contactCount zero and does not enqueue when the audience is empty", async () => {
    findScheduledForPrepare.mockResolvedValue(baseBroadcast())
    forEachAudienceChunk.mockResolvedValue(undefined)

    await prepareBroadcast(BROADCAST_ID)

    expect(insertRecipients).not.toHaveBeenCalled()
    expect(promoteAfterPrepare).toHaveBeenCalledTimes(1)
    expect(promoteAfterPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent", contactCount: 0 }),
    )
    expect(scheduleAddSpy).not.toHaveBeenCalled()
  })

  describe("stale recipient cleanup", () => {
    test("purges any existing ContactOnBroadcast rows before rebuilding the audience", async () => {
      findScheduledForPrepare.mockResolvedValue(baseBroadcast())
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
      findScheduledForPrepare.mockResolvedValue(undefined)
      await prepareBroadcast(BROADCAST_ID)
      expect(purgeBroadcastRecipientsSpy).not.toHaveBeenCalled()

      findScheduledForPrepare.mockResolvedValue(baseBroadcast())
      blockedWorkspaceIds.add(WORKSPACE_ID)
      await prepareBroadcast(BROADCAST_ID)
      expect(purgeBroadcastRecipientsSpy).not.toHaveBeenCalled()
    })
  })

  describe("promotion-epoch pin", () => {
    test("passes the broadcastId, computed status/contactCount, and the resumeCount read at the start of the run", async () => {
      findScheduledForPrepare.mockResolvedValue({
        ...baseBroadcast(),
        resumeCount: 3,
      })
      forEachAudienceChunk.mockResolvedValue(undefined)

      await prepareBroadcast(BROADCAST_ID)

      expect(promoteAfterPrepare).toHaveBeenCalledWith({
        broadcastId: BROADCAST_ID,
        status: "sent",
        contactCount: 0,
        promotionEpoch: 3,
      })
    })

    test("skips the sendBroadcast enqueue when promoteAfterPrepare reports the CAS lost (the race)", async () => {
      findScheduledForPrepare.mockResolvedValue(baseBroadcast())
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
      promotionSucceeds = false

      await prepareBroadcast(BROADCAST_ID)

      expect(scheduleAddSpy).not.toHaveBeenCalled()
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ broadcastId: BROADCAST_ID }),
        expect.stringContaining("lost the promotion race"),
      )
    })

    test("still enqueues sendBroadcast when promoteAfterPrepare reports the CAS won", async () => {
      findScheduledForPrepare.mockResolvedValue(baseBroadcast())
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
      promotionSucceeds = true

      await prepareBroadcast(BROADCAST_ID)

      expect(scheduleAddSpy).toHaveBeenCalledTimes(1)
    })
  })
})
