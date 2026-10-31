import { beforeEach, describe, expect, test, vi } from "vitest"

const findScheduledForPrepare = vi.fn()
const resolveTemplateIntegrationMessengerId = vi.fn()
const findOrCreateDMByContactIds = vi.fn()
const isStillPreparing = vi.fn()
const queueDraftRecipientsPurge = vi.fn()
const forEachAudienceChunk = vi.fn()
const insertRecipients = vi.fn()
const promoteAfterPrepare = vi.fn()
const scheduleAddSpy = vi.fn()
const loggerWarnSpy = vi.fn()
const countRecipients = vi.fn()
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
    countRecipients: (...args: unknown[]) => countRecipients(...args),
    promoteAfterPrepare: (...args: unknown[]) => promoteAfterPrepare(...args),
    isStillPreparing: (...args: unknown[]) => isStillPreparing(...args),
    queueDraftRecipientsPurge: (...args: unknown[]) =>
      queueDraftRecipientsPurge(...args),
  },
  conversationService: {
    findOrCreateDMByContactIds: (...args: unknown[]) =>
      findOrCreateDMByContactIds(...args),
  },
}))

vi.mock("@chatbotx.io/database/partials", async () =>
  vi.importActual("@chatbotx.io/database/partials"),
)

vi.mock("../src/lib/logger", () => ({
  logger: {
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
  targetMode: "channel" as string,
  targets: [] as { inboxId: string }[],
  audienceRangeStart: null as number | null,
  audienceRangeEnd: null as number | null,
})

beforeEach(() => {
  findScheduledForPrepare.mockResolvedValue(undefined)
  resolveTemplateIntegrationMessengerId.mockResolvedValue(null)
  findOrCreateDMByContactIds.mockResolvedValue([])
  isStillPreparing.mockReset().mockResolvedValue(true)
  queueDraftRecipientsPurge.mockReset().mockResolvedValue(undefined)
  forEachAudienceChunk.mockResolvedValue(undefined)
  insertRecipients
    .mockReset()
    .mockImplementation(
      async ({ recipients }: { recipients: unknown[] }) => recipients.length,
    )
  countRecipients.mockReset().mockResolvedValue(0)
  promoteAfterPrepare.mockImplementation(() =>
    Promise.resolve(promotionSucceeds),
  )
  scheduleAddSpy.mockReset()
  loggerWarnSpy.mockReset()
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
        inboxIds: undefined,
        integrationWhatsappId: "wa-int-1",
        integrationMessengerId: null,
        contactFilter,
        subaction: "whatsappWithin24Hours",
        audienceRange: null,
      },
      expect.any(Function),
    )
  })

  test("passes the resolved audience range to forEachAudienceChunk when the row has send-limit bounds set", async () => {
    findScheduledForPrepare.mockResolvedValue({
      ...baseBroadcast(),
      channel: "whatsapp",
      audienceRangeStart: 11,
      audienceRangeEnd: 30,
    })

    await prepareBroadcast(BROADCAST_ID)

    expect(forEachAudienceChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceRange: { offset: 10, size: 20 },
      }),
      expect.any(Function),
    )
  })

  test("passes a null audience range when the row has no send-limit bounds set", async () => {
    findScheduledForPrepare.mockResolvedValue(baseBroadcast())

    await prepareBroadcast(BROADCAST_ID)

    expect(forEachAudienceChunk).toHaveBeenCalledWith(
      expect.objectContaining({ audienceRange: null }),
      expect.any(Function),
    )
  })

  test("loads the target rows and forwards their inbox ids for a multi-page broadcast", async () => {
    findScheduledForPrepare.mockResolvedValue({
      ...baseBroadcast(),
      channel: "whatsapp",
      subaction: "whatsappTemplateMessage",
      targetMode: "targets",
      targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
    })

    await prepareBroadcast(BROADCAST_ID)

    expect(findScheduledForPrepare).toHaveBeenCalledWith({
      broadcastId: BROADCAST_ID,
    })
    expect(forEachAudienceChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: ["whatsapp"],
        inboxIds: ["inbox-a", "inbox-b"],
        integrationWhatsappId: null,
        integrationMessengerId: null,
      }),
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

  test("scopes a targets-mode broadcast whose pages were all deleted to nobody, never the whole channel", async () => {
    findScheduledForPrepare.mockResolvedValue({
      ...baseBroadcast(),
      channel: "whatsapp",
      subaction: "whatsappTemplateMessage",
      targetMode: "targets",
      targets: [],
    })

    await prepareBroadcast(BROADCAST_ID)

    expect(forEachAudienceChunk).toHaveBeenCalledWith(
      expect.objectContaining({ inboxIds: [] }),
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

  test("inserts a recipient per resolved DM conversation (created on demand for DM-less contacts), defensively skips an unresolved one, and enqueues sendBroadcast", async () => {
    findScheduledForPrepare.mockResolvedValue(baseBroadcast())
    findOrCreateDMByContactIds.mockResolvedValue([
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

    expect(findOrCreateDMByContactIds).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-1", "contact-2"],
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

  // A contact on several inboxes is stored once (conflicts are skipped), so
  // the count that gates finalization adds what is stored, not the number of
  // audience rows offered.
  test("counts the recipients stored, not the audience rows offered", async () => {
    findScheduledForPrepare.mockResolvedValue(baseBroadcast())
    findOrCreateDMByContactIds.mockResolvedValue([
      { id: "conv-1", contactId: "contact-1" },
    ])
    insertRecipients.mockResolvedValue(1)
    forEachAudienceChunk.mockImplementation(
      async (
        _input: unknown,
        onChunk: (
          rows: Array<{ id: string; contactId: string }>,
        ) => Promise<unknown>,
      ) => {
        await onChunk([
          { id: "ci-1", contactId: "contact-1" },
          { id: "ci-2", contactId: "contact-1" },
        ])
      },
    )

    await prepareBroadcast(BROADCAST_ID)

    expect(promoteAfterPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sending", contactCount: 1 }),
    )
  })

  test("an unresolved in-window contact is skipped while a windowed broadcast still inserts the later in-window contacts (D1)", async () => {
    findScheduledForPrepare.mockResolvedValue({
      ...baseBroadcast(),
      audienceRangeStart: 1,
      audienceRangeEnd: 3,
    })
    findOrCreateDMByContactIds.mockResolvedValue([
      { id: "conv-1", contactId: "contact-1" },
      { id: "conv-3", contactId: "contact-3" },
    ])
    forEachAudienceChunk.mockImplementation(
      async (
        input: { audienceRange: unknown },
        onChunk: (
          rows: Array<{ id: string; contactId: string }>,
        ) => Promise<unknown>,
      ) => {
        expect(input.audienceRange).toEqual({ offset: 0, size: 3 })
        await onChunk([
          { id: "ci-1", contactId: "contact-1" },
          { id: "ci-2", contactId: "contact-2" },
          { id: "ci-3", contactId: "contact-3" },
        ])
      },
    )

    await prepareBroadcast(BROADCAST_ID)

    expect(insertRecipients).toHaveBeenCalledWith({
      recipients: [
        {
          broadcastId: BROADCAST_ID,
          contactId: "contact-1",
          contactInboxId: "ci-1",
          conversationId: "conv-1",
        },
        {
          broadcastId: BROADCAST_ID,
          contactId: "contact-3",
          contactInboxId: "ci-3",
          conversationId: "conv-3",
        },
      ],
    })
    expect(promoteAfterPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ contactCount: 2 }),
    )
  })

  test("resolves the DM conversation by the null sourceId convention on TikTok too", async () => {
    findScheduledForPrepare.mockResolvedValue({
      ...baseBroadcast(),
      channel: "tiktok",
    })
    findOrCreateDMByContactIds.mockResolvedValue([
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

    expect(findOrCreateDMByContactIds).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-1"],
    })
  })

  test("does not insert or enqueue when no audience contact resolves to a DM conversation", async () => {
    findScheduledForPrepare.mockResolvedValue(baseBroadcast())
    findOrCreateDMByContactIds.mockResolvedValue([])
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
  })

  // moveToDraft bumps the epoch mid-run. The check runs after each write, so
  // a chunk written after moveToDraft looked for leftovers still gets its
  // cleanup queued, and the stale run stops writing.
  test("queues the draft's cleanup and stops once the broadcast left the schedule this run started for", async () => {
    findScheduledForPrepare.mockResolvedValue({
      ...baseBroadcast(),
      resumeCount: 4,
    })
    findOrCreateDMByContactIds.mockResolvedValue([
      { id: "conv-1", contactId: "contact-1" },
    ])
    isStillPreparing.mockResolvedValue(false)
    promotionSucceeds = false
    let chunkResult: unknown
    forEachAudienceChunk.mockImplementation(
      async (
        _input: unknown,
        onChunk: (
          rows: Array<{ id: string; contactId: string }>,
        ) => Promise<unknown>,
      ) => {
        chunkResult = await onChunk([{ id: "ci-1", contactId: "contact-1" }])
      },
    )

    await prepareBroadcast(BROADCAST_ID)

    expect(isStillPreparing).toHaveBeenCalledWith({
      broadcastId: BROADCAST_ID,
      resumeCount: 4,
    })
    expect(insertRecipients.mock.invocationCallOrder[0]).toBeLessThan(
      isStillPreparing.mock.invocationCallOrder[0],
    )
    expect(queueDraftRecipientsPurge).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      broadcastId: BROADCAST_ID,
      requester: "stalePrepare",
    })
    expect(chunkResult).toBe(false)
    expect(scheduleAddSpy).not.toHaveBeenCalled()
  })

  // The walk ended before it noticed moveToDraft: the promotion is refused,
  // so the rows it wrote are queued for cleanup here.
  test("queues the cleanup of its rows when it loses the promotion race", async () => {
    findScheduledForPrepare.mockResolvedValue(baseBroadcast())
    findOrCreateDMByContactIds.mockResolvedValue([
      { id: "conv-1", contactId: "contact-1" },
    ])
    promotionSucceeds = false
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

    expect(queueDraftRecipientsPurge).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      broadcastId: BROADCAST_ID,
      requester: "stalePrepare",
    })
    expect(scheduleAddSpy).not.toHaveBeenCalled()
  })

  test("queues nothing when it loses the race without having written a row", async () => {
    findScheduledForPrepare.mockResolvedValue(baseBroadcast())
    promotionSucceeds = false

    await prepareBroadcast(BROADCAST_ID)

    expect(queueDraftRecipientsPurge).not.toHaveBeenCalled()
  })

  test("keeps walking while the broadcast is still on this schedule", async () => {
    findScheduledForPrepare.mockResolvedValue(baseBroadcast())
    let chunkResult: unknown = "unset"
    forEachAudienceChunk.mockImplementation(
      async (
        _input: unknown,
        onChunk: (
          rows: Array<{ id: string; contactId: string }>,
        ) => Promise<unknown>,
      ) => {
        chunkResult = await onChunk([{ id: "ci-1", contactId: "contact-1" }])
      },
    )

    await prepareBroadcast(BROADCAST_ID)

    expect(chunkResult).toBeUndefined()
    expect(queueDraftRecipientsPurge).not.toHaveBeenCalled()
  })

  test("a failure opening DMs rejects the run without promoting the broadcast or enqueuing the send", async () => {
    findScheduledForPrepare.mockResolvedValue(baseBroadcast())
    findOrCreateDMByContactIds.mockRejectedValue(new Error("db down"))
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

    await expect(prepareBroadcast(BROADCAST_ID)).rejects.toThrow("db down")

    expect(insertRecipients).not.toHaveBeenCalled()
    expect(promoteAfterPrepare).not.toHaveBeenCalled()
    expect(scheduleAddSpy).not.toHaveBeenCalled()
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

  // A retry of a run that failed midway keeps the rows it already wrote —
  // the same audience — so its count must include them, not only the rows
  // this run could insert.
  test("counts the rows a failed earlier run of this prepare already wrote", async () => {
    findScheduledForPrepare.mockResolvedValue(baseBroadcast())
    findOrCreateDMByContactIds.mockResolvedValue([
      { id: "conv-1", contactId: "contact-1" },
    ])
    countRecipients.mockResolvedValue(4)
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

    // 4 kept from the failed run + 1 written now.
    expect(countRecipients).toHaveBeenCalledWith({ broadcastId: BROADCAST_ID })
    expect(countRecipients.mock.invocationCallOrder[0]).toBeLessThan(
      forEachAudienceChunk.mock.invocationCallOrder[0],
    )
    expect(promoteAfterPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sending", contactCount: 5 }),
    )
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
      findOrCreateDMByContactIds.mockResolvedValue([
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
      findOrCreateDMByContactIds.mockResolvedValue([
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
