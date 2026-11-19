import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  finish: vi.fn(),
  renewLease: vi.fn(),
  findNextItem: vi.fn(),
  startItem: vi.fn(),
  recordItemProgress: vi.fn(),
  finishItem: vi.fn(),
  yieldForContinuation: vi.fn(),
  enqueueChunk: vi.fn(),
  reopenReleased: vi.fn(),
  loadWorkerContext: vi.fn(),
  scopeOfRun: vi.fn(),
  handOffFollowUp: vi.fn(),
  findItemInbox: vi.fn(),
  importContactSyncPage: vi.fn(),
  loadMappingState: vi.fn(),
  readSnapshotBound: vi.fn(),
  listSchema: vi.fn(),
  listRecords: vi.fn(),
  classifyError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  CONTACT_SYNC_CHUNK_BUDGET_MS: 60_000,
  CONTACT_SYNC_DEFAULT_PAUSE_MS: 60_000,
  CONTACT_SYNC_MAX_ATTEMPTS: 2,
  CONTACT_SYNC_MAX_CONTACTS_PER_ITEM: 12_500_000,
  CONTACT_SYNC_MAX_PAUSE_MS: 30 * 60 * 1000,
  CONTACT_SYNC_MIN_PAGE_SIZE: 25,
  CONTACT_SYNC_PAGE_SIZE: 500,
  CONTACT_SYNC_PAGES_PER_CHUNK: 5,
  CONTACT_SYNC_RETRY_DELAY_MS: 60_000,
  CONTACT_SYNC_RUN_ERRORS: {
    pageNotFound: "pageNotFound",
    inboxUnavailable: "inboxUnavailable",
    channelUnsupported: "channelUnsupported",
    sourceUnavailable: "sourceUnavailable",
    sourceDisconnected: "sourceDisconnected",
    pageLimitReached: "pageLimitReached",
    maxAttempts: "maxAttempts",
  },
  contactSyncService: {
    claim: mocks.claim,
    finish: mocks.finish,
    renewLease: mocks.renewLease,
    findNextItem: mocks.findNextItem,
    startItem: mocks.startItem,
    recordItemProgress: mocks.recordItemProgress,
    finishItem: mocks.finishItem,
    yieldForContinuation: mocks.yieldForContinuation,
    enqueueChunk: mocks.enqueueChunk,
    reopenReleased: mocks.reopenReleased,
    loadWorkerContext: mocks.loadWorkerContext,
    scopeOfRun: mocks.scopeOfRun,
    handOffFollowUp: mocks.handOffFollowUp,
    findItemInbox: mocks.findItemInbox,
    adapterFor: () => ({
      provider: "ahachat",
      readSnapshotBound: mocks.readSnapshotBound,
      listSchema: mocks.listSchema,
      listRecords: mocks.listRecords,
      classifyError: mocks.classifyError,
    }),
  },
}))
vi.mock("@chatbotx.io/business/contact-sync/import", () => ({
  // The real rule: the channels records can be imported into.
  contactSyncSupportsChannel: (channel: string) =>
    ["messenger", "instagram", "zalo", "telegram"].includes(channel),
  importContactSyncPage: mocks.importContactSyncPage,
  loadContactSyncMappingState: mocks.loadMappingState,
}))

const { runContactSync } = await import(
  "../src/integration/handlers/contact-sync/engine"
)

const DATA = { runId: "run-1", workspaceId: "ws-1" }
const SCOPE = { workspaceId: "ws-1", actor: { type: "user", id: "u-1" } }
const PAGE = { channel: "messenger", pageId: "page-1" }
const CONTEXT = {
  workspaceId: "ws-1",
  ownerId: "owner-1",
  targetCountry: "VN",
  workspaceTimezone: "Asia/Ho_Chi_Minh",
}
const EMPTY_STATE = { tags: new Map(), fields: new Map() }

const run = (overrides: Record<string, unknown> = {}) => ({
  id: "run-1",
  workspaceId: "ws-1",
  provider: "ahachat",
  status: "running",
  claimToken: "token-1",
  chunkSeq: 3,
  attempts: 0,
  syncTags: true,
  syncCustomFields: true,
  overwriteExisting: false,
  ...overrides,
})

const item = (overrides: Record<string, unknown> = {}) => ({
  id: "item-1",
  runId: "run-1",
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  sourceChannel: "messenger",
  sourceAccountId: "page-1",
  status: "running",
  startedAt: new Date(),
  boundReadAt: new Date(),
  followUpCoexist: false,
  cursor: null,
  upperBoundId: "500",
  createdCount: 0,
  updatedCount: 0,
  skippedCount: 0,
  failedCount: 0,
  skippedValueCount: 0,
  ...overrides,
})

const page = (overrides: Record<string, unknown> = {}) => ({
  records: [{ externalId: "1" }],
  invalidCount: 0,
  nextCursor: "200",
  hasMore: false,
  ...overrides,
})

const counters = {
  created: 1,
  updated: 0,
  skipped: 0,
  failed: 0,
  skippedValues: 2,
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.claim.mockResolvedValue(run())
  mocks.loadWorkerContext.mockResolvedValue(CONTEXT)
  mocks.findNextItem.mockResolvedValueOnce(item()).mockResolvedValue(null)
  mocks.findItemInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
  mocks.scopeOfRun.mockReturnValue(SCOPE)
  mocks.handOffFollowUp.mockResolvedValue({
    outcome: "linked",
    coexistRunId: "c-1",
  })
  mocks.listSchema.mockResolvedValue({ tags: [], fields: [] })
  mocks.loadMappingState.mockResolvedValue(EMPTY_STATE)
  mocks.renewLease.mockResolvedValue("running")
  mocks.listRecords.mockResolvedValue(page())
  mocks.importContactSyncPage.mockResolvedValue({
    counters,
    state: EMPTY_STATE,
  })
  mocks.recordItemProgress.mockResolvedValue({ outcome: "recorded" })
  mocks.finishItem.mockResolvedValue({ outcome: "finished" })
  mocks.finish.mockResolvedValue("finished")
  mocks.yieldForContinuation.mockResolvedValue(4)
  mocks.enqueueChunk.mockResolvedValue(undefined)
})

describe("runContactSync", () => {
  test("does nothing when the run cannot be claimed", async () => {
    mocks.claim.mockResolvedValue(null)

    await runContactSync(DATA)

    expect(mocks.findNextItem).not.toHaveBeenCalled()
    expect(mocks.finish).not.toHaveBeenCalled()
  })

  test("imports a source to its end, then finishes the run", async () => {
    await runContactSync(DATA)

    expect(mocks.listRecords).toHaveBeenCalledWith(
      SCOPE,
      PAGE,
      expect.objectContaining({
        cursor: null,
        upperBoundId: "500",
        limit: 500,
      }),
    )
    expect(mocks.importContactSyncPage).toHaveBeenCalledWith(
      expect.objectContaining({
        context: CONTEXT,
        page: { provider: "ahachat", ...PAGE },
        inbox: { id: "inbox-1", channel: "messenger" },
        options: expect.objectContaining({ overwriteExisting: false }),
      }),
    )
    expect(mocks.recordItemProgress).toHaveBeenCalledWith({
      runId: "run-1",
      itemId: "item-1",
      expect: { claimToken: "token-1" },
      cursor: "200",
      counters,
    })
    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "item-1", status: "succeeded" }),
    )
    expect(mocks.finish).toHaveBeenCalledWith({
      run: expect.objectContaining({ status: "running" }),
      expect: { claimToken: "token-1" },
    })
  })

  test("a page that joined the run after its outcome was computed is read before the run ends", async () => {
    mocks.findNextItem.mockReset()
    mocks.findNextItem
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(item())
      .mockResolvedValue(null)
    mocks.finish.mockResolvedValueOnce("open").mockResolvedValue("finished")

    await runContactSync(DATA)

    expect(mocks.finish).toHaveBeenCalledTimes(2)
    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "item-1" }),
    )
  })

  test("a lost claim at the terminal write ends the chunk without looping", async () => {
    mocks.findNextItem.mockReset()
    mocks.findNextItem.mockResolvedValue(null)
    mocks.finish.mockResolvedValue("lost")

    await runContactSync(DATA)

    expect(mocks.finish).toHaveBeenCalledTimes(1)
  })

  test("fixes the snapshot bound when an item starts", async () => {
    mocks.findNextItem.mockReset()
    mocks.findNextItem
      .mockResolvedValueOnce(
        item({
          status: "pending",
          startedAt: null,
          boundReadAt: null,
          upperBoundId: null,
        }),
      )
      .mockResolvedValue(null)
    mocks.readSnapshotBound.mockResolvedValue("900")
    mocks.startItem.mockResolvedValue({
      outcome: "started",
      item: item({ upperBoundId: "900" }),
    })

    await runContactSync(DATA)

    expect(mocks.startItem).toHaveBeenCalledWith({
      runId: "run-1",
      itemId: "item-1",
      expect: { claimToken: "token-1" },
      upperBoundId: "900",
    })
    expect(mocks.readSnapshotBound).toHaveBeenCalledWith(SCOPE, PAGE)
    expect(mocks.listRecords).toHaveBeenCalledWith(
      SCOPE,
      PAGE,
      expect.objectContaining({ upperBoundId: "900" }),
    )
  })

  test("a source without contacts succeeds without reading pages", async () => {
    mocks.findNextItem.mockReset()
    mocks.findNextItem
      .mockResolvedValueOnce(
        item({
          status: "pending",
          startedAt: null,
          boundReadAt: null,
          upperBoundId: null,
        }),
      )
      .mockResolvedValue(null)
    mocks.readSnapshotBound.mockResolvedValue(null)
    mocks.startItem.mockResolvedValue({
      outcome: "started",
      item: item({ upperBoundId: null }),
    })

    await runContactSync(DATA)

    expect(mocks.listRecords).not.toHaveBeenCalled()
    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded" }),
    )
  })

  test("yields after the page budget and queues the next chunk", async () => {
    mocks.listRecords.mockResolvedValue(page({ hasMore: true }))

    await runContactSync(DATA)

    expect(mocks.listRecords).toHaveBeenCalledTimes(5)
    expect(mocks.yieldForContinuation).toHaveBeenCalledWith({
      runId: "run-1",
      expect: { claimToken: "token-1" },
      countAttempt: false,
    })
    expect(mocks.enqueueChunk).toHaveBeenCalledWith(
      expect.objectContaining({ id: "run-1", chunkSeq: 4 }),
      {},
    )
    expect(mocks.finish).not.toHaveBeenCalled()
  })

  test("counts rows that broke the contract as failed", async () => {
    mocks.listRecords.mockResolvedValue(page({ invalidCount: 2 }))

    await runContactSync(DATA)

    expect(mocks.recordItemProgress).toHaveBeenCalledWith(
      expect.objectContaining({ counters: { ...counters, failed: 2 } }),
    )
    // The source finished, but not completely.
    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({ status: "partial", currentError: null }),
    )
  })

  test("rows that failed on an earlier page still end the source partial", async () => {
    mocks.findNextItem.mockReset()
    mocks.findNextItem
      .mockResolvedValueOnce(item({ cursor: "100", failedCount: 1 }))
      .mockResolvedValue(null)

    await runContactSync(DATA)

    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({ status: "partial" }),
    )
  })

  test("a source whose rows all imported ends succeeded", async () => {
    await runContactSync(DATA)

    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded" }),
    )
  })

  test("with tag and field sync both off the source schema is never fetched", async () => {
    mocks.claim.mockResolvedValue(
      run({ syncTags: false, syncCustomFields: false }),
    )

    await runContactSync(DATA)

    expect(mocks.listSchema).not.toHaveBeenCalled()
    expect(mocks.loadMappingState).toHaveBeenCalledWith(
      { workspaceId: "ws-1", page: { provider: "ahachat", ...PAGE } },
      { tags: [], fields: [] },
    )
    expect(mocks.importContactSyncPage).toHaveBeenCalled()
  })

  test.each([
    { syncTags: true, syncCustomFields: false },
    { syncTags: false, syncCustomFields: true },
  ])("the schema is fetched when tags=$syncTags or fields=$syncCustomFields", async (flags) => {
    mocks.claim.mockResolvedValue(run(flags))

    await runContactSync(DATA)

    expect(mocks.listSchema).toHaveBeenCalledTimes(1)
  })

  test("a rate limit parks the run and queues a delayed chunk, capped", async () => {
    mocks.listRecords.mockRejectedValue(new Error("429"))
    mocks.classifyError.mockReturnValue({
      kind: "rateLimited",
      retryAfterMs: 2 * 60 * 60 * 1000,
    })

    await runContactSync(DATA)

    const yielded = mocks.yieldForContinuation.mock.calls[0]?.[0]
    expect(yielded.pausedUntil).toBeInstanceOf(Date)
    expect(mocks.enqueueChunk).toHaveBeenCalledWith(
      expect.objectContaining({ chunkSeq: 4 }),
      { delayMs: 30 * 60 * 1000 + 1000 },
    )
    expect(mocks.finishItem).not.toHaveBeenCalled()
  })

  test.each([
    { retryAfterMs: null, label: "no hint" },
    { retryAfterMs: 0, label: "a zero hint" },
  ])("a rate limit with $label waits the default minute", async ({
    retryAfterMs,
  }) => {
    mocks.listRecords.mockRejectedValue(new Error("429"))
    mocks.classifyError.mockReturnValue({ kind: "rateLimited", retryAfterMs })

    await runContactSync(DATA)

    expect(mocks.enqueueChunk).toHaveBeenCalledWith(expect.anything(), {
      delayMs: 60_000 + 1000,
    })
  })

  test("a page gone from AhaChat fails that source and moves on", async () => {
    mocks.findNextItem.mockReset()
    mocks.findNextItem
      .mockResolvedValueOnce(item())
      .mockResolvedValueOnce(item({ id: "item-2" }))
      .mockResolvedValue(null)
    mocks.listRecords
      .mockRejectedValueOnce(new Error("404"))
      .mockResolvedValue(page())
    mocks.classifyError.mockReturnValue({ kind: "pageMissing" })

    await runContactSync(DATA)

    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "item-1",
        status: "failed",
        currentError: "pageNotFound",
      }),
    )
    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "item-2", status: "succeeded" }),
    )
    expect(mocks.finish).toHaveBeenCalled()
  })

  test("an outage is retried after a short wait, costing one attempt", async () => {
    mocks.listRecords.mockRejectedValue(new Error("503"))
    mocks.classifyError.mockReturnValue({ kind: "retryable" })

    await runContactSync(DATA)

    expect(mocks.finishItem).not.toHaveBeenCalled()
    expect(mocks.finish).not.toHaveBeenCalled()
    expect(mocks.yieldForContinuation).toHaveBeenCalledWith(
      expect.objectContaining({
        countAttempt: true,
        pausedUntil: expect.any(Date),
      }),
    )
    expect(mocks.enqueueChunk).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ delayMs: expect.any(Number) }),
    )
  })

  test("an outage on the run's last attempt fails that source and goes on", async () => {
    mocks.claim.mockResolvedValue(run({ attempts: 1 }))
    mocks.listRecords.mockRejectedValue(new Error("503"))
    mocks.classifyError.mockReturnValue({ kind: "retryable" })

    await runContactSync(DATA)

    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        currentError: "sourceUnavailable",
      }),
    )
    expect(mocks.yieldForContinuation).not.toHaveBeenCalledWith(
      expect.objectContaining({ countAttempt: true }),
    )
  })

  test("a source that ran out of attempts leaves the next one a fresh retry", async () => {
    mocks.claim.mockResolvedValue(run({ attempts: 1 }))
    mocks.findNextItem.mockReset()
    mocks.findNextItem
      .mockResolvedValueOnce(item({ id: "item-1" }))
      .mockResolvedValueOnce(item({ id: "item-2" }))
      .mockResolvedValue(null)
    mocks.listRecords.mockRejectedValue(new Error("503"))
    mocks.classifyError.mockReturnValue({ kind: "retryable" })

    await runContactSync(DATA)

    expect(mocks.finishItem).toHaveBeenCalledTimes(1)
    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "item-1", status: "failed" }),
    )
    expect(mocks.yieldForContinuation).toHaveBeenCalledWith(
      expect.objectContaining({ countAttempt: true }),
    )
  })

  test("a local import error is retried too, without recording the page", async () => {
    mocks.importContactSyncPage.mockRejectedValue(new Error("insert failed"))
    mocks.classifyError.mockReturnValue({ kind: "retryable" })

    await runContactSync(DATA)

    expect(mocks.recordItemProgress).not.toHaveBeenCalled()
    expect(mocks.finishItem).not.toHaveBeenCalled()
    expect(mocks.yieldForContinuation).toHaveBeenCalledWith(
      expect.objectContaining({ countAttempt: true }),
    )
  })

  test("a fatal failure fails only that source", async () => {
    mocks.listRecords.mockRejectedValue(new Error("bad contract"))
    mocks.classifyError.mockReturnValue({ kind: "fatal" })

    await runContactSync(DATA)

    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        currentError: "sourceUnavailable",
      }),
    )
    expect(mocks.finish).toHaveBeenCalled()
  })

  test("a source whose inbox is on a channel the sync dropped fails, never reading its contacts", async () => {
    mocks.findNextItem.mockReset()
    mocks.findNextItem.mockResolvedValueOnce(item({})).mockResolvedValue(null)
    mocks.findItemInbox.mockResolvedValue({
      id: "inbox-1",
      channel: "whatsapp",
    })

    await runContactSync(DATA)

    expect(mocks.listRecords).not.toHaveBeenCalled()
    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        currentError: "channelUnsupported",
      }),
    )
  })

  test("a source whose inbox is gone fails with inboxUnavailable, never reading its contacts", async () => {
    mocks.findNextItem.mockReset()
    mocks.findNextItem
      .mockResolvedValueOnce(item({ inboxId: null }))
      .mockResolvedValue(null)
    mocks.findItemInbox.mockResolvedValue(null)

    await runContactSync(DATA)

    expect(mocks.listRecords).not.toHaveBeenCalled()
    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        currentError: "inboxUnavailable",
      }),
    )
  })

  test("a lost lease stops before calling the source", async () => {
    mocks.renewLease.mockResolvedValue(null)

    await runContactSync(DATA)

    expect(mocks.listRecords).not.toHaveBeenCalled()
    expect(mocks.finish).not.toHaveBeenCalled()
    expect(mocks.yieldForContinuation).not.toHaveBeenCalled()
  })

  test("a cancel seen at the lease renewal winds the run down", async () => {
    mocks.renewLease.mockResolvedValue("cancelling")

    await runContactSync(DATA)

    expect(mocks.listRecords).not.toHaveBeenCalled()
    expect(mocks.finish).toHaveBeenCalledWith({
      run: expect.objectContaining({ status: "cancelling" }),
      expect: { claimToken: "token-1" },
    })
  })

  test("a run claimed while cancelling is finished at once", async () => {
    mocks.claim.mockResolvedValue(run({ status: "cancelling" }))

    await runContactSync(DATA)

    expect(mocks.findNextItem).not.toHaveBeenCalled()
    expect(mocks.finish).toHaveBeenCalled()
  })

  test("a cancel seen at the progress write reads no further page and winds the run down", async () => {
    mocks.listRecords.mockResolvedValue(page({ hasMore: true }))
    mocks.recordItemProgress.mockResolvedValue({ outcome: "runCancelling" })

    await runContactSync(DATA)

    // One page was read ahead while the first was written; no further one.
    expect(mocks.listRecords).toHaveBeenCalledTimes(2)
    expect(mocks.importContactSyncPage).toHaveBeenCalledTimes(1)
    expect(mocks.finishItem).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded" }),
    )
    expect(mocks.yieldForContinuation).not.toHaveBeenCalled()
    expect(mocks.finish).toHaveBeenCalledWith(
      expect.objectContaining({ expect: { claimToken: "token-1" } }),
    )
  })

  test("a progress write that lost the claim adds nothing and stops", async () => {
    mocks.recordItemProgress.mockResolvedValue({ outcome: "claimLost" })

    await runContactSync(DATA)

    expect(mocks.finishItem).not.toHaveBeenCalled()
    expect(mocks.finish).not.toHaveBeenCalled()
  })

  test("a source that says more without a cursor ends partial instead of looping", async () => {
    mocks.listRecords.mockResolvedValue(
      page({ hasMore: true, nextCursor: null }),
    )

    await runContactSync(DATA)

    expect(mocks.listRecords).toHaveBeenCalledTimes(1)
    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({ status: "partial" }),
    )
  })

  test("a lost continuation enqueue reopens the run for the sweeper", async () => {
    mocks.listRecords.mockResolvedValue(page({ hasMore: true }))
    mocks.enqueueChunk.mockRejectedValue(new Error("redis down"))

    await runContactSync(DATA)

    expect(mocks.reopenReleased).toHaveBeenCalledWith("run-1")
  })

  test("a page is read ahead while the previous one is written, one request in flight at a time", async () => {
    let inFlight = 0
    let maxInFlight = 0
    mocks.listRecords.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return page({ hasMore: true })
    })

    await runContactSync(DATA)

    expect(maxInFlight).toBe(1)
    // The cursor advanced only after each write, from the page just written.
    expect(
      mocks.recordItemProgress.mock.calls.map((call) => call[0].cursor),
    ).toEqual(["200", "200", "200", "200", "200"])
    expect(mocks.listRecords.mock.calls[1]?.[2].cursor).toBe("200")
  })

  test("a read in flight is settled before the chunk leaves, even when its own run is cancelled", async () => {
    let settled = false
    mocks.listRecords
      .mockResolvedValueOnce(page({ hasMore: true }))
      .mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        settled = true
        return page()
      })
    mocks.recordItemProgress.mockResolvedValue({ outcome: "runCancelling" })

    await runContactSync(DATA)

    expect(settled).toBe(true)
  })

  test("an answer that is too large is asked again with half the page, down to a floor", async () => {
    mocks.listRecords
      .mockRejectedValueOnce(new Error("too large"))
      .mockResolvedValue(page())
    mocks.classifyError.mockReturnValue({ kind: "responseTooLarge" })

    await runContactSync(DATA)

    expect(mocks.listRecords.mock.calls.map((call) => call[2].limit)).toEqual([
      500, 250,
    ])
    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded" }),
    )
  })

  test("the page halves down to the smallest size, which is tried before giving up", async () => {
    mocks.listRecords
      .mockRejectedValueOnce(new Error("too large"))
      .mockRejectedValueOnce(new Error("too large"))
      .mockRejectedValueOnce(new Error("too large"))
      .mockRejectedValueOnce(new Error("too large"))
      .mockRejectedValueOnce(new Error("too large"))
      .mockResolvedValue(page())
    mocks.classifyError.mockReturnValue({ kind: "responseTooLarge" })

    await runContactSync(DATA)

    expect(mocks.listRecords.mock.calls.map((call) => call[2].limit)).toEqual([
      500, 250, 125, 62, 31, 25,
    ])
    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded" }),
    )
  })

  test("an answer still too large at the smallest page fails the source", async () => {
    mocks.listRecords.mockRejectedValue(new Error("too large"))
    mocks.classifyError.mockReturnValue({ kind: "responseTooLarge" })

    await runContactSync(DATA)

    expect(mocks.finishItem).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        currentError: "sourceUnavailable",
      }),
    )
  })

  test("a resumed item keeps its snapshot bound and never asks the source again", async () => {
    await runContactSync(DATA)

    expect(mocks.readSnapshotBound).not.toHaveBeenCalled()
    expect(mocks.startItem).not.toHaveBeenCalled()
  })

  test("an item cancelled before it started is skipped, not a lost claim", async () => {
    mocks.findNextItem.mockReset()
    mocks.findNextItem
      .mockResolvedValueOnce(
        item({ status: "pending", startedAt: null, boundReadAt: null }),
      )
      .mockResolvedValue(null)
    mocks.readSnapshotBound.mockResolvedValue("900")
    mocks.startItem.mockResolvedValue({ outcome: "itemInactive" })

    await runContactSync(DATA)

    expect(mocks.listRecords).not.toHaveBeenCalled()
    expect(mocks.finish).toHaveBeenCalled()
  })

  test("an item cancelled while a page was written does not overwrite it and the run goes on", async () => {
    mocks.recordItemProgress.mockResolvedValue({ outcome: "itemInactive" })

    await runContactSync(DATA)

    expect(mocks.finishItem).not.toHaveBeenCalled()
    expect(mocks.finish).toHaveBeenCalled()
    expect(mocks.handOffFollowUp).not.toHaveBeenCalled()
  })

  test("a lost claim at the terminal write stops the run and hands nothing off", async () => {
    mocks.findNextItem.mockReset()
    mocks.findNextItem
      .mockResolvedValueOnce(item({ followUpCoexist: true }))
      .mockResolvedValue(null)
    mocks.finishItem.mockResolvedValue({ outcome: "claimLost" })

    await runContactSync(DATA)

    expect(mocks.handOffFollowUp).not.toHaveBeenCalled()
    expect(mocks.finish).not.toHaveBeenCalled()
  })

  test("one heavy contact does not shrink the rest of the source: the page grows back", async () => {
    mocks.listRecords
      .mockRejectedValueOnce(new Error("too large"))
      .mockResolvedValueOnce(page({ hasMore: true }))
      .mockResolvedValue(page())
    mocks.classifyError.mockReturnValue({ kind: "responseTooLarge" })

    await runContactSync(DATA)

    expect(mocks.listRecords.mock.calls.map((call) => call[2].limit)).toEqual([
      500, 250, 500,
    ])
  })

  test("a read in flight is aborted when the chunk stops", async () => {
    mocks.listRecords.mockResolvedValue(page({ hasMore: true }))
    mocks.recordItemProgress.mockResolvedValue({ outcome: "runCancelling" })

    await runContactSync(DATA)

    const signals = mocks.listRecords.mock.calls.map((call) => call[2].signal)
    expect(signals).toHaveLength(2)
    expect(signals.every((signal: AbortSignal) => signal.aborted)).toBe(true)
  })

  describe("a page read ahead that fails", () => {
    const failAhead = (kind: Record<string, unknown>) => {
      mocks.listRecords
        .mockResolvedValueOnce(page({ hasMore: true }))
        .mockRejectedValueOnce(new Error("ahead failed"))
      mocks.classifyError.mockReturnValue(kind)
    }

    test("rate limited: the first page is recorded at its own cursor, then the run pauses", async () => {
      failAhead({ kind: "rateLimited", retryAfterMs: 5000 })

      await runContactSync(DATA)

      expect(mocks.recordItemProgress).toHaveBeenCalledTimes(1)
      expect(mocks.recordItemProgress.mock.calls[0]?.[0].cursor).toBe("200")
      expect(
        mocks.yieldForContinuation.mock.calls[0]?.[0].pausedUntil,
      ).toBeInstanceOf(Date)
      expect(mocks.finishItem).not.toHaveBeenCalled()
    })

    test("fatal: the source fails after the first page was recorded", async () => {
      failAhead({ kind: "fatal" })

      await runContactSync(DATA)

      expect(mocks.recordItemProgress).toHaveBeenCalledTimes(1)
      expect(mocks.finishItem).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          currentError: "sourceUnavailable",
        }),
      )
    })

    test("page gone: the source fails as pageNotFound", async () => {
      failAhead({ kind: "pageMissing" })

      await runContactSync(DATA)

      expect(mocks.finishItem).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          currentError: "pageNotFound",
        }),
      )
    })

    test("retryable: retried from the durable cursor, even on the last attempt once a page was recorded", async () => {
      mocks.claim.mockResolvedValue(run({ attempts: 1 }))
      mocks.listRecords
        .mockResolvedValueOnce(page({ hasMore: true }))
        .mockRejectedValueOnce(new Error("ahead failed"))
      mocks.classifyError.mockReturnValue({ kind: "retryable" })

      await runContactSync(DATA)

      expect(mocks.recordItemProgress.mock.calls[0]?.[0].cursor).toBe("200")
      expect(mocks.finishItem).not.toHaveBeenCalled()
      expect(mocks.yieldForContinuation).toHaveBeenCalledWith(
        expect.objectContaining({ countAttempt: true }),
      )
    })
  })

  describe("the history sync an item owes (connect import)", () => {
    const owing = () => {
      mocks.findNextItem.mockReset()
      mocks.findNextItem
        .mockResolvedValueOnce(item({ followUpCoexist: true }))
        .mockResolvedValue(null)
    }

    test("is handed off after the item ended, whatever its outcome", async () => {
      owing()
      mocks.listRecords.mockRejectedValue(new Error("bad contract"))
      mocks.classifyError.mockReturnValue({ kind: "fatal" })

      await runContactSync(DATA)

      expect(mocks.finishItem).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed" }),
      )
      expect(mocks.handOffFollowUp).toHaveBeenCalledWith("item-1")
      expect(mocks.finishItem.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.handOffFollowUp.mock.invocationCallOrder[0] ?? 0,
      )
    })

    test("is asked for every finished item: the service reads whether one is owed off the current row", async () => {
      await runContactSync(DATA)

      expect(mocks.handOffFollowUp).toHaveBeenCalledWith("item-1")
    })

    test("a failed handoff never fails the run: the sweep retries it", async () => {
      owing()
      mocks.handOffFollowUp.mockRejectedValue(new Error("db blip"))

      await expect(runContactSync(DATA)).resolves.toBeUndefined()
      expect(mocks.finish).toHaveBeenCalled()
    })
  })
})
