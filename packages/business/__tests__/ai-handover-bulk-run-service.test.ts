import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireInbox: vi.fn(),
  findInboxRow: vi.fn(),
  isActiveNow: vi.fn(),
  invalidate: vi.fn(),
  lockForApplyToAll: vi.fn(),
  lockExisting: vi.fn(),
  setApplyToAllRow: vi.fn(),
  findSettings: vi.fn(),
  createForRevision: vi.fn(),
  findByRevision: vi.fn(),
  cancelLive: vi.fn(),
  refundDispatch: vi.fn(),
  getJob: vi.fn(),
  listHistory: vi.fn(),
  listAwaiting: vi.fn(),
  queueAdd: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  listBulkAiPage: vi.fn(),
  listStillBulkAiEligible: vi.fn(),
  countBulkAiEligible: vi.fn(),
  pickDue: vi.fn(),
  markMaxAttemptsFailed: vi.fn(),
  transaction: vi.fn(),
}))

const TX = { tx: true }

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  aiHandoverBulkRunRepository: {
    createForRevision: mocks.createForRevision,
    findByRevision: mocks.findByRevision,
    cancelLive: mocks.cancelLive,
    refundDispatch: mocks.refundDispatch,
    listHistory: mocks.listHistory,
    listInboxesAwaitingRun: mocks.listAwaiting,
    pickDue: mocks.pickDue,
    markMaxAttemptsFailed: mocks.markMaxAttemptsFailed,
  },
  aiHandoverSettingsRepository: {
    lockForApplyToAll: mocks.lockForApplyToAll,
    lockExisting: mocks.lockExisting,
    setApplyToAll: mocks.setApplyToAllRow,
    findByInbox: mocks.findSettings,
  },
  contactInboxRepository: {
    listBulkAiPage: mocks.listBulkAiPage,
    listStillBulkAiEligible: mocks.listStillBulkAiEligible,
    countBulkAiEligible: mocks.countBulkAiEligible,
  },
}))
vi.mock("../src/inbox/service", () => ({
  inboxService: { find: mocks.findInboxRow },
}))
vi.mock("../src/ai-handover-settings/service", () => ({
  aiHandoverSettingsService: {
    requireInbox: mocks.requireInbox,
    isActiveNow: mocks.isActiveNow,
    invalidate: mocks.invalidate,
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { aiHandoverBulkToggle: "aiHandoverBulkToggle" },
  integrationQueue: { add: mocks.queueAdd, getJob: mocks.getJob },
  buildAiHandoverBulkJobId: ({
    runId,
    chunkSeq,
  }: {
    runId: string
    chunkSeq: number
  }) => `ai-handover-bulk-${runId}-chunk-${chunkSeq}`,
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  }),
}))
vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))

const { aiHandoverBulkRunService } = await import(
  "../src/ai-handover-bulk-run/service"
)
const { AI_HANDOVER_BULK_ERROR_CODES } = await import(
  "../src/ai-handover-bulk-run/constants"
)

const PAGE = { workspaceId: "ws-1", inboxId: "inbox-1" }
const REQUEST = { ...PAGE, userId: "user-1" }
const RUN = { id: "run-1", workspaceId: "ws-1", attempts: 0, chunkSeq: 0 }

const settingsRow = (overrides: Record<string, unknown> = {}) => ({
  ...PAGE,
  channel: "messenger",
  applyToAllCustomers: false,
  applyToAllRevision: 0,
  applyToAllMessage: null,
  applyToAllRequestedByUserId: "user-1",
  ...overrides,
})

/** What the settings row lock returns: the row and its Page's status. */
const setLocked = (
  settings: ReturnType<typeof settingsRow> | null,
  inboxStatus = "connected",
) => {
  const locked = settings ? { settings, inboxStatus } : null
  mocks.lockExisting.mockResolvedValue(locked)
  mocks.lockForApplyToAll.mockResolvedValue(
    locked ?? { settings: settingsRow(), inboxStatus },
  )
}

const rejectsWithCode = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toMatchObject({ code })
  expect(mocks.setApplyToAllRow).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(TX))
  mocks.requireInbox.mockResolvedValue({
    id: "inbox-1",
    status: "connected",
    channel: "messenger",
  })
  mocks.isActiveNow.mockResolvedValue(true)
  setLocked(settingsRow())
  mocks.setApplyToAllRow.mockImplementation(
    (input: {
      applyToAllCustomers: boolean
      applyToAllMessage: string | null
    }) =>
      settingsRow({
        applyToAllCustomers: input.applyToAllCustomers,
        applyToAllMessage: input.applyToAllMessage,
        applyToAllRevision: 1,
      }),
  )
  mocks.findByRevision.mockResolvedValue(null)
  mocks.createForRevision.mockResolvedValue(RUN)
  mocks.cancelLive.mockResolvedValue(null)
  mocks.queueAdd.mockResolvedValue(undefined)
})

describe("setApplyToAll: turning ON", () => {
  test("bumps the revision, creates the enable run and dispatches it", async () => {
    const change = await aiHandoverBulkRunService.setApplyToAll({
      ...REQUEST,
      applyToAllCustomers: true,
      message: "ignored for an ON",
    })

    expect(change).toEqual({ isChanged: true, run: RUN })
    expect(mocks.requireInbox).toHaveBeenCalledWith(PAGE)
    expect(mocks.setApplyToAllRow).toHaveBeenCalledWith(
      {
        ...PAGE,
        applyToAllCustomers: true,
        // A message never rides along with an ON.
        applyToAllMessage: null,
        requestedByUserId: "user-1",
      },
      TX,
    )
    expect(mocks.createForRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        ...PAGE,
        channel: "messenger",
        revision: 1,
        action: "enable",
        message: null,
        requestedByUserId: "user-1",
      }),
      TX,
    )
    expect(mocks.invalidate).toHaveBeenCalledWith({ inboxId: "inbox-1" })
    expect(mocks.queueAdd).toHaveBeenCalledExactlyOnceWith(
      "aiHandoverBulkToggle",
      {
        type: "aiHandoverBulkToggle",
        data: { runId: "run-1", workspaceId: "ws-1" },
      },
      expect.objectContaining({ jobId: "ai-handover-bulk-run-1-chunk-0" }),
    )
  })

  test("a cache outage after the commit still dispatches the committed run", async () => {
    mocks.invalidate.mockRejectedValue(new Error("redis down"))

    await expect(
      aiHandoverBulkRunService.setApplyToAll({
        ...REQUEST,
        applyToAllCustomers: true,
        message: null,
      }),
    ).resolves.toEqual({ isChanged: true, run: RUN })
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
  })

  test("is refused while the Page's automation is not running, and writes nothing", async () => {
    mocks.isActiveNow.mockResolvedValue(false)

    await rejectsWithCode(
      aiHandoverBulkRunService.setApplyToAll({
        ...REQUEST,
        applyToAllCustomers: true,
      }),
      AI_HANDOVER_BULK_ERROR_CODES.automationNotActive,
    )
    expect(mocks.createForRevision).not.toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })
})

describe("setApplyToAll: turning OFF", () => {
  beforeEach(() => {
    setLocked(settingsRow({ applyToAllCustomers: true, applyToAllRevision: 1 }))
    mocks.setApplyToAllRow.mockImplementation(
      (input: {
        applyToAllCustomers: boolean
        applyToAllMessage: string | null
      }) =>
        settingsRow({
          applyToAllCustomers: input.applyToAllCustomers,
          applyToAllMessage: input.applyToAllMessage,
          applyToAllRevision: 2,
        }),
    )
  })

  test("trims the tagged message and does not need the automation to be running", async () => {
    mocks.isActiveNow.mockResolvedValue(false)

    await aiHandoverBulkRunService.setApplyToAll({
      ...REQUEST,
      applyToAllCustomers: false,
      message: "  We are here now  ",
    })

    expect(mocks.isActiveNow).not.toHaveBeenCalled()
    expect(mocks.setApplyToAllRow.mock.calls[0][0].applyToAllMessage).toBe(
      "We are here now",
    )
    expect(mocks.createForRevision.mock.calls[0][0]).toMatchObject({
      action: "disable",
      revision: 2,
      message: "We are here now",
    })
  })

  test.each([
    ["missing", undefined],
    ["null", null],
    ["blank", "   \n "],
  ])("rejects a %s message before anything is locked", async (_name, message) => {
    await rejectsWithCode(
      aiHandoverBulkRunService.setApplyToAll({
        ...REQUEST,
        applyToAllCustomers: false,
        message,
      }),
      AI_HANDOVER_BULK_ERROR_CODES.messageRequired,
    )
    expect(mocks.lockForApplyToAll).not.toHaveBeenCalled()
  })

  test("rejects a message over 2000 characters, accepts exactly 2000", async () => {
    await rejectsWithCode(
      aiHandoverBulkRunService.setApplyToAll({
        ...REQUEST,
        applyToAllCustomers: false,
        message: "a".repeat(2001),
      }),
      AI_HANDOVER_BULK_ERROR_CODES.messageTooLong,
    )

    await aiHandoverBulkRunService.setApplyToAll({
      ...REQUEST,
      applyToAllCustomers: false,
      message: "a".repeat(2000),
    })
    expect(mocks.setApplyToAllRow).toHaveBeenCalledTimes(1)
  })
})

describe("setApplyToAll: the same state again", () => {
  test.each([
    ["ON while already ON", true],
    ["OFF while already OFF", false],
  ])("%s changes nothing: no revision, no cancel, no run, no cache drop", async (_name, desired) => {
    setLocked(
      settingsRow({ applyToAllCustomers: desired, applyToAllRevision: 3 }),
    )

    const change = await aiHandoverBulkRunService.setApplyToAll({
      ...REQUEST,
      applyToAllCustomers: desired,
      message: "hi",
    })

    expect(change).toEqual({ isChanged: false, run: null })
    expect(mocks.setApplyToAllRow).not.toHaveBeenCalled()
    expect(mocks.cancelLive).not.toHaveBeenCalled()
    expect(mocks.createForRevision).not.toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })
})

describe("setApplyToAll: a Page nobody configured yet", () => {
  test("an OFF leaves no trace: no settings row is created (a stray row would switch on the take-back)", async () => {
    mocks.lockExisting.mockResolvedValue(null)

    const change = await aiHandoverBulkRunService.setApplyToAll({
      ...REQUEST,
      applyToAllCustomers: false,
      message: "hi",
    })

    expect(change).toEqual({ isChanged: false, run: null })
    expect(mocks.lockForApplyToAll).not.toHaveBeenCalled()
    expect(mocks.setApplyToAllRow).not.toHaveBeenCalled()
  })

  test("an ON creates the row only now, under the lock, then proceeds", async () => {
    mocks.lockExisting.mockResolvedValue(null)
    mocks.lockForApplyToAll.mockResolvedValue({
      settings: settingsRow(),
      inboxStatus: "connected",
    })

    const change = await aiHandoverBulkRunService.setApplyToAll({
      ...REQUEST,
      applyToAllCustomers: true,
    })

    expect(mocks.lockForApplyToAll).toHaveBeenCalledWith(
      { ...PAGE, channel: "messenger" },
      TX,
    )
    expect(change.isChanged).toBe(true)
  })

  test("a concurrent first change that got there between the two locks makes this one a no-op", async () => {
    mocks.lockExisting.mockResolvedValue(null)
    mocks.lockForApplyToAll.mockResolvedValue({
      settings: settingsRow({
        applyToAllCustomers: true,
        applyToAllRevision: 1,
      }),
      inboxStatus: "connected",
    })

    await expect(
      aiHandoverBulkRunService.setApplyToAll({
        ...REQUEST,
        applyToAllCustomers: true,
      }),
    ).resolves.toEqual({ isChanged: false, run: null })
    expect(mocks.setApplyToAllRow).not.toHaveBeenCalled()
  })
})

describe("setApplyToAll: a change while a run is live", () => {
  test("cancels the older revision's run in the same transaction before creating the new one", async () => {
    const order: string[] = []
    mocks.cancelLive.mockImplementation(() => {
      order.push("cancel")
      return Promise.resolve({ id: "old" })
    })
    mocks.createForRevision.mockImplementation(() => {
      order.push("create")
      return Promise.resolve(RUN)
    })

    await aiHandoverBulkRunService.setApplyToAll({
      ...REQUEST,
      applyToAllCustomers: true,
    })

    expect(order).toEqual(["cancel", "create"])
    expect(mocks.cancelLive).toHaveBeenCalledWith(PAGE, TX)
  })

  test("a run still winding down keeps the Page: nothing is created now, reconcile does it when it stops", async () => {
    mocks.createForRevision.mockResolvedValue(null)

    const change = await aiHandoverBulkRunService.setApplyToAll({
      ...REQUEST,
      applyToAllCustomers: true,
    })

    expect(change).toEqual({ isChanged: true, run: null })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
    // The desired state is stored and the cache dropped all the same.
    expect(mocks.invalidate).toHaveBeenCalled()
  })

  test("a failed first enqueue still returns the run: the sweeper dispatches it", async () => {
    mocks.queueAdd.mockRejectedValue(new Error("redis down"))

    await expect(
      aiHandoverBulkRunService.setApplyToAll({
        ...REQUEST,
        applyToAllCustomers: true,
      }),
    ).resolves.toEqual({ isChanged: true, run: RUN })
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), runId: "run-1" }),
      expect.any(String),
    )
  })

  test("a disconnected Page is refused: there is nothing to apply to, and nothing is written", async () => {
    setLocked(settingsRow(), "disconnected")

    await rejectsWithCode(
      aiHandoverBulkRunService.setApplyToAll({
        ...REQUEST,
        applyToAllCustomers: true,
      }),
      AI_HANDOVER_BULK_ERROR_CODES.pageNotConnected,
    )
    expect(mocks.createForRevision).not.toHaveBeenCalled()
  })

  test("a Page disconnected in the instant before the lock is refused too: the status is read under the lock", async () => {
    // The inbox lookup before the transaction still said "connected".
    mocks.requireInbox.mockResolvedValue({
      id: "inbox-1",
      status: "connected",
      channel: "messenger",
    })
    setLocked(settingsRow(), "disconnected")

    await rejectsWithCode(
      aiHandoverBulkRunService.setApplyToAll({
        ...REQUEST,
        applyToAllCustomers: true,
      }),
      AI_HANDOVER_BULK_ERROR_CODES.pageNotConnected,
    )
  })

  test("a foreign or unsupported inbox is refused before any lock", async () => {
    mocks.requireInbox.mockRejectedValue(
      Object.assign(new Error("Inbox not found"), { code: "notFound" }),
    )

    await rejectsWithCode(
      aiHandoverBulkRunService.setApplyToAll({
        ...REQUEST,
        applyToAllCustomers: true,
      }),
      "notFound",
    )
    expect(mocks.lockForApplyToAll).not.toHaveBeenCalled()
  })
})

describe("reconcile", () => {
  const reconcile = () => aiHandoverBulkRunService.reconcile(PAGE)

  test("creates the run the latest revision is waiting for", async () => {
    setLocked(
      settingsRow({
        applyToAllCustomers: false,
        applyToAllRevision: 4,
        applyToAllMessage: "bye",
      }),
    )

    await reconcile()

    expect(mocks.createForRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: 4,
        action: "disable",
        message: "bye",
      }),
      TX,
    )
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
  })

  test.each([
    ["no change was ever made (revision 0)", { applyToAllRevision: 0 }, null],
    [
      "the revision already has a run (a failed or stopped one is final)",
      { applyToAllRevision: 2 },
      { id: "done", status: "failed" },
    ],
  ])("does nothing when %s", async (_name, settings, existing) => {
    setLocked(settingsRow(settings))
    mocks.findByRevision.mockResolvedValue(existing)

    await reconcile()

    expect(mocks.createForRevision).not.toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("an ON waits while the Page's automation is not running", async () => {
    setLocked(settingsRow({ applyToAllCustomers: true, applyToAllRevision: 2 }))
    mocks.isActiveNow.mockResolvedValue(false)

    await reconcile()

    expect(mocks.createForRevision).not.toHaveBeenCalled()
  })

  test("a disconnected Page gets no run", async () => {
    setLocked(settingsRow({ applyToAllRevision: 2 }), "disconnected")

    await reconcile()

    expect(mocks.createForRevision).not.toHaveBeenCalled()
  })

  test("a Page with no settings row has nothing to reconcile (and none is created)", async () => {
    mocks.lockExisting.mockResolvedValue(null)

    await reconcile()

    expect(mocks.lockForApplyToAll).not.toHaveBeenCalled()
    expect(mocks.createForRevision).not.toHaveBeenCalled()
  })

  test("two reconcilers cannot both create: the second finds the unique index taken", async () => {
    setLocked(settingsRow({ applyToAllRevision: 2 }))
    mocks.createForRevision
      .mockResolvedValueOnce(RUN)
      .mockResolvedValueOnce(null)

    await reconcile()
    await reconcile()

    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
  })
})

describe("retry", () => {
  test.each([
    "failed",
    "cancelled",
  ])("starts the same desired state again under a new revision after a %s run", async (status) => {
    setLocked(
      settingsRow({
        applyToAllCustomers: true,
        applyToAllRevision: 2,
      }),
    )
    // The old revision's run, then none for the new revision.
    mocks.findByRevision
      .mockResolvedValueOnce({ id: "old", status })
      .mockResolvedValueOnce(null)

    await expect(aiHandoverBulkRunService.retry(REQUEST)).resolves.toEqual({
      isChanged: true,
      run: RUN,
    })

    expect(mocks.setApplyToAllRow).toHaveBeenCalledWith(
      expect.objectContaining({
        ...PAGE,
        applyToAllCustomers: true,
        requestedByUserId: "user-1",
      }),
      TX,
    )
  })

  test.each([
    [
      "a run of the latest revision is still live",
      { id: "x", status: "running" },
    ],
    ["the latest revision already succeeded", { id: "x", status: "completed" }],
    ["the latest revision has no run at all", null],
  ])("refuses when %s", async (_name, latest) => {
    setLocked(settingsRow({ applyToAllRevision: 2 }))
    mocks.findByRevision.mockResolvedValue(latest)

    await rejectsWithCode(
      aiHandoverBulkRunService.retry(REQUEST),
      AI_HANDOVER_BULK_ERROR_CODES.nothingToRetry,
    )
  })
})

describe("retry: the same rules as the change itself", () => {
  const failedLatest = () =>
    mocks.findByRevision
      .mockResolvedValueOnce({ id: "old", status: "failed" })
      .mockResolvedValueOnce(null)

  test("an ON is not retried while the Page's automation is not running: the revision is not bumped", async () => {
    setLocked(settingsRow({ applyToAllCustomers: true, applyToAllRevision: 2 }))
    failedLatest()
    mocks.isActiveNow.mockResolvedValue(false)

    await rejectsWithCode(
      aiHandoverBulkRunService.retry(REQUEST),
      AI_HANDOVER_BULK_ERROR_CODES.automationNotActive,
    )
  })

  test("a disconnected Page is not retried: the revision is not bumped", async () => {
    setLocked(
      settingsRow({ applyToAllCustomers: true, applyToAllRevision: 2 }),
      "disconnected",
    )
    failedLatest()

    await rejectsWithCode(
      aiHandoverBulkRunService.retry(REQUEST),
      AI_HANDOVER_BULK_ERROR_CODES.pageNotConnected,
    )
  })

  test("a Page with no settings row has nothing to retry", async () => {
    mocks.lockExisting.mockResolvedValue(null)

    await rejectsWithCode(
      aiHandoverBulkRunService.retry(REQUEST),
      AI_HANDOVER_BULK_ERROR_CODES.nothingToRetry,
    )
  })
})

describe("cancelLiveForInbox and status", () => {
  test("cancels the Page's live run under the same lock as a change, so it cannot interleave with a run being created", async () => {
    const order: string[] = []
    mocks.lockExisting.mockImplementation(() => {
      order.push("lock")
      return Promise.resolve({
        settings: settingsRow(),
        inboxStatus: "disconnected",
      })
    })
    mocks.cancelLive.mockImplementation(() => {
      order.push("cancel")
      return Promise.resolve(null)
    })

    await aiHandoverBulkRunService.cancelLiveForInbox(PAGE)

    expect(order).toEqual(["lock", "cancel"])
    expect(mocks.cancelLive).toHaveBeenCalledWith(PAGE, TX)
  })

  test("can limit the stop to one action, so switching the automation off keeps a disable running", async () => {
    mocks.lockExisting.mockResolvedValue({
      settings: settingsRow(),
      inboxStatus: "connected",
    })

    await aiHandoverBulkRunService.cancelLiveForInbox({
      ...PAGE,
      action: "enable",
    })

    expect(mocks.lockExisting).toHaveBeenCalledWith(PAGE, TX)
    expect(mocks.cancelLive).toHaveBeenCalledWith(
      { ...PAGE, action: "enable" },
      TX,
    )
  })

  test("drops the Page's cached settings only after the cancel committed", async () => {
    const order: string[] = []
    mocks.lockExisting.mockResolvedValue({
      settings: settingsRow(),
      inboxStatus: "disconnected",
    })
    mocks.cancelLive.mockImplementation(() => {
      order.push("cancel")
      return Promise.resolve(null)
    })
    mocks.invalidate.mockImplementation(() => {
      order.push("invalidate")
      return Promise.resolve()
    })

    await aiHandoverBulkRunService.cancelLiveForInbox(PAGE)

    expect(order).toEqual(["cancel", "invalidate"])
    expect(mocks.invalidate).toHaveBeenCalledWith(PAGE)
  })

  test("a cache outage never fails the stop (the run is already cancelled)", async () => {
    mocks.lockExisting.mockResolvedValue({
      settings: settingsRow(),
      inboxStatus: "disconnected",
    })
    mocks.invalidate.mockRejectedValue(new Error("redis down"))

    await expect(
      aiHandoverBulkRunService.cancelLiveForInbox(PAGE),
    ).resolves.toBeUndefined()
    expect(mocks.cancelLive).toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
  })

  test("a Page that never had settings has no run to cancel", async () => {
    mocks.lockExisting.mockResolvedValue(null)

    await aiHandoverBulkRunService.cancelLiveForInbox(PAGE)

    expect(mocks.cancelLive).not.toHaveBeenCalled()
  })

  test("reports the desired state and the run serving its latest revision", async () => {
    mocks.findSettings.mockResolvedValue(
      settingsRow({ applyToAllCustomers: true, applyToAllRevision: 3 }),
    )
    mocks.findByRevision.mockResolvedValue({ id: "run-3" })

    await expect(aiHandoverBulkRunService.findStatus(PAGE)).resolves.toEqual({
      applyToAllCustomers: true,
      revision: 3,
      run: { id: "run-3" },
    })
    expect(mocks.findByRevision).toHaveBeenCalledWith({ ...PAGE, revision: 3 })
  })

  test("a Page with no change yet is OFF at revision 0, with no run lookup", async () => {
    mocks.findSettings.mockResolvedValue(null)

    await expect(aiHandoverBulkRunService.findStatus(PAGE)).resolves.toEqual({
      applyToAllCustomers: false,
      revision: 0,
      run: null,
    })
    expect(mocks.findByRevision).not.toHaveBeenCalled()
  })
})

describe("enqueueChunk", () => {
  test("a continuation and a sweeper retry get distinct job ids", async () => {
    await aiHandoverBulkRunService.enqueueChunk({ ...RUN, chunkSeq: 3 })
    await aiHandoverBulkRunService.enqueueChunk({ ...RUN, chunkSeq: 4 })

    const ids = mocks.queueAdd.mock.calls.map((call) => call[2].jobId)
    expect(ids).toEqual([
      "ai-handover-bulk-run-1-chunk-3",
      "ai-handover-bulk-run-1-chunk-4",
    ])
    expect(ids.every((id: string) => !id.includes(":"))).toBe(true)
  })

  test("a paused run's continuation is delayed by the pause, an ordinary one is not", async () => {
    await aiHandoverBulkRunService.enqueueChunk(RUN, { delayMs: 120_000 })
    await aiHandoverBulkRunService.enqueueChunk(RUN)

    expect(mocks.queueAdd.mock.calls[0][2]).toMatchObject({ delay: 120_000 })
    expect("delay" in mocks.queueAdd.mock.calls[1][2]).toBe(false)
  })
})

describe("refundIfPreviousChunkQueued (a backed-up queue must not fail a run)", () => {
  // `pickDue` already burned an attempt and bumped chunkSeq for this dispatch.
  const PICKED = {
    ...RUN,
    attempts: 3,
    chunkSeq: 4,
    status: "pending" as const,
  }
  const job = (state: string) => ({ getState: () => Promise.resolve(state) })

  test.each([
    "waiting",
    "delayed",
    "prioritized",
  ])("a previous chunk job still %s is not lost: the dispatch is given back and nothing is re-sent", async (state) => {
    mocks.getJob.mockResolvedValue(job(state))

    await expect(
      aiHandoverBulkRunService.refundIfPreviousChunkQueued(PICKED),
    ).resolves.toBe(true)

    expect(mocks.getJob).toHaveBeenCalledWith("ai-handover-bulk-run-1-chunk-3")
    // Both counters go back, guarded by the values `pickDue` returned.
    expect(mocks.refundDispatch).toHaveBeenCalledWith({
      runId: "run-1",
      attempts: 3,
      chunkSeq: 4,
    })
  })

  test.each([
    ["no such job (completed and removed, or never queued)", undefined],
    [
      "a job that is running (a hung worker's stale lease must be taken over)",
      job("active"),
    ],
    ["a failed job", job("failed")],
    ["a completed job", job("completed")],
  ])("%s means the run must be dispatched again and keeps its burned attempt", async (_name, found) => {
    mocks.getJob.mockResolvedValue(found)

    await expect(
      aiHandoverBulkRunService.refundIfPreviousChunkQueued(PICKED),
    ).resolves.toBe(false)

    expect(mocks.refundDispatch).not.toHaveBeenCalled()
  })

  test("a cancelling run is never skipped: its previous chunk may be a quota continuation delayed for hours", async () => {
    mocks.getJob.mockResolvedValue(job("delayed"))

    await expect(
      aiHandoverBulkRunService.refundIfPreviousChunkQueued({
        ...PICKED,
        status: "cancelling",
      }),
    ).resolves.toBe(false)

    expect(mocks.getJob).not.toHaveBeenCalled()
    expect(mocks.refundDispatch).not.toHaveBeenCalled()
  })

  test("a queue that cannot be asked counts as lost, so a run is never left undispatched", async () => {
    mocks.getJob.mockRejectedValue(new Error("redis down"))

    await expect(
      aiHandoverBulkRunService.refundIfPreviousChunkQueued(PICKED),
    ).resolves.toBe(false)

    expect(mocks.refundDispatch).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
  })
})

describe("findRunInbox", () => {
  const RUN_REF = { workspaceId: "ws-1", inboxId: "inbox-1" }

  test("returns the run's Page with what the engine records events against", async () => {
    const seenAt = new Date("2026-10-01T00:00:00Z")
    mocks.findInboxRow.mockResolvedValue({
      id: "inbox-1",
      channel: "messenger",
      threadControlSeenAt: seenAt,
      name: "ignored",
    })

    await expect(
      aiHandoverBulkRunService.findRunInbox(RUN_REF),
    ).resolves.toEqual({
      id: "inbox-1",
      channel: "messenger",
      threadControlSeenAt: seenAt,
    })
    // Scoped by the run's workspace.
    expect(mocks.findInboxRow).toHaveBeenCalledWith({
      where: { id: "inbox-1", workspaceId: "ws-1" },
    })
  })

  test.each([
    ["gone", undefined],
    [
      "on a channel without an AI hand-off",
      { id: "inbox-1", channel: "whatsapp" },
    ],
  ])("is null for a Page that is %s", async (_label, inbox) => {
    mocks.findInboxRow.mockResolvedValue(inbox)

    await expect(
      aiHandoverBulkRunService.findRunInbox(RUN_REF),
    ).resolves.toBeNull()
  })
})

describe("engine surface", () => {
  const NOW = new Date("2026-10-02T12:00:00.000Z")
  const DAY_MS = 24 * 60 * 60 * 1000
  const run = (action: "enable" | "disable") =>
    ({
      id: "run-1",
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      channel: "messenger",
      action,
      requestedAt: new Date("2026-10-02T11:00:00.000Z"),
    }) as never

  test("a disable page only reaches contacts inside Meta's 7-day window, in the run's Page", async () => {
    mocks.listBulkAiPage.mockResolvedValue([])

    await aiHandoverBulkRunService.listEligiblePage({
      run: run("disable"),
      afterId: "ci-9",
      limit: 50,
      now: NOW,
    })

    expect(mocks.listBulkAiPage).toHaveBeenCalledWith({
      action: "disable",
      requestedAt: new Date("2026-10-02T11:00:00.000Z"),
      now: NOW,
      lastIncomingSince: new Date(NOW.getTime() - 7 * DAY_MS),
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      afterId: "ci-9",
      limit: 50,
    })
  })

  test("an enable count reaches contacts active in the last 30 days", async () => {
    mocks.countBulkAiEligible.mockResolvedValue(12)

    const total = await aiHandoverBulkRunService.countEligible({
      run: run("enable"),
      now: NOW,
    })

    expect(total).toBe(12)
    expect(mocks.countBulkAiEligible.mock.calls[0][0]).toMatchObject({
      action: "enable",
      lastIncomingSince: new Date(NOW.getTime() - 30 * DAY_MS),
      workspaceId: "ws-1",
      inboxId: "inbox-1",
    })
  })

  test("counting after a cursor passes it on, so what is already walked is not counted again", async () => {
    mocks.countBulkAiEligible.mockResolvedValue(30)

    await aiHandoverBulkRunService.countEligible({
      run: run("enable"),
      afterId: "ci-120",
      now: NOW,
    })

    expect(mocks.countBulkAiEligible.mock.calls[0][0]).toMatchObject({
      afterId: "ci-120",
    })
  })

  test("the pre-dispatch re-check uses the same rules", async () => {
    mocks.listStillBulkAiEligible.mockResolvedValue(["ci-1"])

    await expect(
      aiHandoverBulkRunService.listStillEligible({
        run: run("disable"),
        ids: ["ci-1", "ci-2"],
        now: NOW,
      }),
    ).resolves.toEqual(["ci-1"])
    expect(mocks.listStillBulkAiEligible.mock.calls[0][0]).toMatchObject({
      action: "disable",
      ids: ["ci-1", "ci-2"],
      lastIncomingSince: new Date(NOW.getTime() - 7 * DAY_MS),
    })
  })

  test("the sweeper uses the shared attempt ceiling and lists Pages awaiting a run", async () => {
    mocks.pickDue.mockResolvedValue([])
    mocks.listAwaiting.mockResolvedValue([PAGE])

    await aiHandoverBulkRunService.markMaxAttemptsFailed()
    await aiHandoverBulkRunService.pickDue({ batchSize: 100 })
    await expect(
      aiHandoverBulkRunService.listInboxesAwaitingRun({ limit: 20 }),
    ).resolves.toEqual([PAGE])

    expect(mocks.markMaxAttemptsFailed).toHaveBeenCalledWith({ maxAttempts: 5 })
    expect(mocks.pickDue).toHaveBeenCalledWith({
      batchSize: 100,
      maxAttempts: 5,
    })
    expect(mocks.listAwaiting).toHaveBeenCalledWith({ limit: 20 })
  })
})
