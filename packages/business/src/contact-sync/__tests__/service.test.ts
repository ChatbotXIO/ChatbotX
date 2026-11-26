import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  findInboxes: vi.fn(),
  listInboxes: vi.fn(),
  discover: vi.fn(),
  isConfigured: vi.fn(),
  findLive: vi.fn(),
  findLatestFetchedRun: vi.fn(),
  createWithItems: vi.fn(),
  cancelLive: vi.fn(),
  cancelForInbox: vi.fn(),
  lockIntegration: vi.fn(),
  findIntegrationIdByInbox: vi.fn(),
  reopenFollowUp: vi.fn(),
  findForWorkspace: vi.fn(),
  listItemStatuses: vi.fn(),
  finish: vi.fn(),
  queueAdd: vi.fn(),
  listSchema: vi.fn(),
  upsertManual: vi.fn(),
  listExhausted: vi.fn(),
  markMaxAttemptsFailed: vi.fn(),
  refundDispatch: vi.fn(),
  getJob: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/client")>()
  const tx = { execute: mocks.execute }
  return {
    ...actual,
    db: { transaction: (fn: (client: typeof tx) => unknown) => fn(tx) },
  }
})
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactSyncRunRepository: {
    findLive: mocks.findLive,
    findLatestFetchedRun: mocks.findLatestFetchedRun,
    createWithItems: mocks.createWithItems,
    cancelLive: mocks.cancelLive,
    cancelForInbox: mocks.cancelForInbox,
    reopenFollowUp: mocks.reopenFollowUp,
    findForWorkspace: mocks.findForWorkspace,
    listItemStatuses: mocks.listItemStatuses,
    finish: mocks.finish,
    listExhausted: mocks.listExhausted,
    markMaxAttemptsFailed: mocks.markMaxAttemptsFailed,
    refundDispatch: mocks.refundDispatch,
  },
  contactSyncMappingRepository: {
    upsertManual: mocks.upsertManual,
    deleteByExternalIds: vi.fn(),
  },
  coexistSyncRunRepository: {
    lockIntegration: mocks.lockIntegration,
    findIntegrationIdByInbox: mocks.findIntegrationIdByInbox,
  },
}))
vi.mock("../providers", () => ({
  contactSyncAdapters: {
    ahachat: {
      provider: "ahachat",
      isConfigured: mocks.isConfigured,
      discoverPages: mocks.discover,
      listSchema: mocks.listSchema,
    },
  },
}))
vi.mock("../source-inboxes", () => ({
  findContactSyncInboxes: mocks.findInboxes,
  listContactSyncInboxes: mocks.listInboxes,
}))
vi.mock("../../coexist/service", () => ({ coexistService: {} }))
vi.mock("../../workspace-lifecycle/with-blocked-owner-guard", () => ({
  resolveWorkspaceFreezeReasonById: vi.fn(),
}))
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  integrationQueue: { add: mocks.queueAdd, getJob: mocks.getJob },
}))

const { contactSyncService } = await import("../service")
const { clearPickerDiscoveryBackoff } = await import("../picker-discovery")
const { clearDiscoveryCache } = await import("../discovery-cache")
const { clearDiscoveryInFlight } = await import("../discovery")
const { ContactSyncMappingError } = await import("../errors")

const WORKSPACE = "ws-1"
const ACTOR = { type: "user" as const, id: "user-1" }

const inbox = (id: string, channel = "messenger") => ({
  id,
  name: `Inbox ${id}`,
  channel,
  sourceId: `page-${id}`,
})

const entry = (inboxId: string, status: string, channel = "messenger") => ({
  channel,
  pageId: `page-${inboxId}`,
  status,
  name: status === "found" ? `Page ${inboxId}` : null,
  avatarUrl: null,
})

const scheduleInput = (sources: { inboxId: string }[]) => ({
  workspaceId: WORKSPACE,
  actor: ACTOR,
  triggerSource: "app" as const,
  sources,
  syncTags: true,
  syncCustomFields: false,
  overwriteExisting: false,
})

beforeEach(() => {
  vi.resetAllMocks()
  clearDiscoveryCache()
  clearPickerDiscoveryBackoff()
  clearDiscoveryInFlight()
  mocks.isConfigured.mockReturnValue(true)
  const inboxes = [
    inbox("i1"),
    inbox("i2", "zalo"),
    inbox("i3"),
    inbox("i4"),
    inbox("i5"),
  ]
  mocks.listInboxes.mockResolvedValue(inboxes)
  mocks.findInboxes.mockImplementation((_workspaceId: string, ids: string[]) =>
    Promise.resolve(inboxes.filter((candidate) => ids.includes(candidate.id))),
  )
  mocks.discover.mockResolvedValue([
    entry("i1", "found"),
    entry("i2", "found", "zalo"),
    entry("i3", "absent"),
    entry("i4", "ambiguous"),
    entry("i5", "found"),
  ])
  mocks.findLive.mockResolvedValue(null)
  mocks.findLatestFetchedRun.mockResolvedValue(null)
  mocks.createWithItems.mockImplementation((input) =>
    Promise.resolve({
      id: "run-1",
      workspaceId: input.workspaceId,
      chunkSeq: 0,
      items: [],
    }),
  )
  mocks.queueAdd.mockResolvedValue(undefined)
})

describe("contactSyncService.listSources", () => {
  test("reports each connected page with what the source said of it", async () => {
    const sources = await contactSyncService.listSources({
      workspaceId: WORKSPACE,
      actor: ACTOR,
    })

    expect(
      sources.map((source) => [
        source.inboxId,
        source.discovery,
        source.eligible,
        source.ineligibleReason,
      ]),
    ).toEqual([
      ["i1", "found", true, null],
      ["i2", "found", true, null],
      ["i3", "absent", false, "notInAhachat"],
      ["i4", "ambiguous", false, "pageAmbiguous"],
      ["i5", "found", true, null],
    ])
    expect(sources[0]).toMatchObject({
      sourceName: "Page i1",
      channel: "messenger",
      accountId: "page-i1",
    })
  })

  test("asks the source once, with deduped pairs and the actor", async () => {
    await contactSyncService.listSources({
      workspaceId: WORKSPACE,
      actor: ACTOR,
    })

    expect(mocks.discover).toHaveBeenCalledTimes(1)
    expect(mocks.discover).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE, actor: ACTOR },
      expect.arrayContaining([{ channel: "messenger", pageId: "page-i1" }]),
    )
    expect(mocks.discover.mock.calls[0]?.[1]).toHaveLength(5)
  })

  test("a failed discovery leaves the pages unavailable, never absent", async () => {
    mocks.discover.mockRejectedValue(new Error("down"))

    const sources = await contactSyncService.listSources({
      workspaceId: WORKSPACE,
      actor: ACTOR,
    })

    expect(sources.every((source) => source.discovery === "unavailable")).toBe(
      true,
    )
    expect(sources[0]?.ineligibleReason).toBe("ahachatUnavailable")
  })

  test("pages beyond one batch are asked in bounded batches", async () => {
    const many = Array.from({ length: 150 }, (_, index) => inbox(`m${index}`))
    mocks.listInboxes.mockResolvedValue(many)
    mocks.discover.mockImplementation((_scope, pages: { pageId: string }[]) =>
      Promise.resolve(
        pages.map((page) => ({
          channel: "messenger",
          pageId: page.pageId,
          status: "found",
          name: null,
          avatarUrl: null,
        })),
      ),
    )

    const sources = await contactSyncService.listSources({
      workspaceId: WORKSPACE,
      actor: ACTOR,
    })

    expect(mocks.discover).toHaveBeenCalledTimes(2)
    expect(mocks.discover.mock.calls[0]?.[1]).toHaveLength(100)
    expect(sources.every((source) => source.eligible)).toBe(true)
  })
})

describe("contactSyncService.findPagesAtSource", () => {
  const page = (pageId: string) => ({ channel: "messenger" as const, pageId })
  const entry = (pageId: string, status: "found" | "absent" | "ambiguous") => ({
    channel: "messenger" as const,
    pageId,
    status,
    name: null,
    avatarUrl: null,
  })

  test("returns only the pages the source found", async () => {
    mocks.discover.mockResolvedValue([
      entry("p1", "found"),
      entry("p2", "absent"),
      entry("p3", "ambiguous"),
    ])

    const found = await contactSyncService.findPagesAtSource({
      workspaceId: WORKSPACE,
      actor: ACTOR,
      pages: [page("p1"), page("p2"), page("p3"), page("p4")],
    })

    expect(found).toEqual(["p1"])
  })

  test("finds none without asking when the sync is not configured", async () => {
    mocks.isConfigured.mockReturnValue(false)

    const found = await contactSyncService.findPagesAtSource({
      workspaceId: WORKSPACE,
      actor: ACTOR,
      pages: [page("p1")],
    })

    expect(found).toEqual([])
    expect(mocks.discover).not.toHaveBeenCalled()
  })

  test("finds none when the source cannot be asked", async () => {
    mocks.discover.mockRejectedValue(new Error("timeout"))

    const found = await contactSyncService.findPagesAtSource({
      workspaceId: WORKSPACE,
      actor: ACTOR,
      pages: [page("p1")],
    })

    expect(found).toEqual([])
  })

  test("finds none when the source answers after the picker's budget", async () => {
    vi.useFakeTimers()
    try {
      mocks.discover.mockReturnValue(new Promise(() => undefined))

      const pending = contactSyncService.findPagesAtSource({
        workspaceId: WORKSPACE,
        actor: ACTOR,
        pages: [page("p1")],
      })
      await vi.advanceTimersByTimeAsync(4000)

      await expect(pending).resolves.toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  test("asks about one batch of pages at most", async () => {
    mocks.discover.mockResolvedValue([])
    const pages = Array.from({ length: 150 }, (_, index) => page(`p${index}`))

    await contactSyncService.findPagesAtSource({
      workspaceId: WORKSPACE,
      actor: ACTOR,
      pages,
    })

    expect(mocks.discover).toHaveBeenCalledTimes(1)
    expect(mocks.discover.mock.calls[0]?.[1]).toHaveLength(100)
  })

  test("a second render of the same picker is answered from the cache", async () => {
    const pages = Array.from({ length: 100 }, (_, index) => page(`p${index}`))
    mocks.discover.mockResolvedValue(
      pages.map((item) => entry(item.pageId, "absent")),
    )
    const input = { workspaceId: WORKSPACE, actor: ACTOR, pages }

    await contactSyncService.findPagesAtSource(input)
    await contactSyncService.findPagesAtSource(input)

    expect(mocks.discover).toHaveBeenCalledTimes(1)
  })

  test("concurrent renders share one request", async () => {
    let answer: (value: unknown[]) => void = () => undefined
    mocks.discover.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      }),
    )
    const input = { workspaceId: WORKSPACE, actor: ACTOR, pages: [page("p1")] }

    const first = contactSyncService.findPagesAtSource(input)
    const second = contactSyncService.findPagesAtSource(input)
    answer([entry("p1", "found")])

    await expect(first).resolves.toEqual(["p1"])
    await expect(second).resolves.toEqual(["p1"])
    expect(mocks.discover).toHaveBeenCalledTimes(1)
  })

  test("after the source could not answer, the picker skips asking for a while", async () => {
    mocks.discover.mockRejectedValue(new Error("429"))
    const input = { workspaceId: WORKSPACE, actor: ACTOR, pages: [page("p1")] }

    await contactSyncService.findPagesAtSource(input)
    await expect(contactSyncService.findPagesAtSource(input)).resolves.toEqual(
      [],
    )

    expect(mocks.discover).toHaveBeenCalledTimes(1)
  })
})

describe("contactSyncService.schedule", () => {
  test("creates a menu run with one item per page, the actor snapshot, and enqueues its first chunk", async () => {
    await contactSyncService.schedule(
      scheduleInput([{ inboxId: "i1" }, { inboxId: "i2" }]),
    )

    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(mocks.createWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE,
        provider: "ahachat",
        triggerSource: "app",
        trigger: "menu",
        requestedByType: "user",
        requestedById: "user-1",
        syncTags: true,
        syncCustomFields: false,
        overwriteExisting: false,
        items: [
          {
            inboxId: "i1",
            sourceChannel: "messenger",
            sourceAccountId: "page-i1",
            sourceAccountName: "Page i1",
            followUpCoexist: false,
            followUpAiReadsSyncedHistory: false,
          },
          {
            inboxId: "i2",
            sourceChannel: "zalo",
            sourceAccountId: "page-i2",
            sourceAccountName: "Page i2",
            followUpCoexist: false,
            followUpAiReadsSyncedHistory: false,
          },
        ],
      }),
      expect.anything(),
    )
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "contactSync",
      { type: "contactSync", data: { runId: "run-1", workspaceId: WORKSPACE } },
      expect.objectContaining({ jobId: "contact-sync-run-1-chunk-0" }),
    )
  })

  test.each([
    [[], "contactSyncNoSources"],
    [[{ inboxId: "i1" }, { inboxId: "i1" }], "contactSyncDuplicateSource"],
    [[{ inboxId: "i9" }], "contactSyncSourceNotFound"],
    [[{ inboxId: "i3" }], "contactSyncSourceNotEligible"],
    [[{ inboxId: "i4" }], "contactSyncSourceNotEligible"],
  ])("rejects %j with %s and creates nothing", async (sources, code) => {
    await expect(
      contactSyncService.schedule(scheduleInput(sources)),
    ).rejects.toMatchObject({ code })
    expect(mocks.createWithItems).not.toHaveBeenCalled()
  })

  test("a source that could not be asked is a retryable 503, not a refusal of the page", async () => {
    mocks.discover.mockRejectedValue(new Error("down"))

    await expect(
      contactSyncService.schedule(scheduleInput([{ inboxId: "i1" }])),
    ).rejects.toMatchObject({
      code: "contactSyncSourceUnavailable",
      httpStatusCode: 503,
    })
    expect(mocks.createWithItems).not.toHaveBeenCalled()
  })

  test("an unconfigured sync is refused before anything is asked", async () => {
    mocks.isConfigured.mockReturnValue(false)

    await expect(
      contactSyncService.schedule(scheduleInput([{ inboxId: "i1" }])),
    ).rejects.toMatchObject({ code: "contactSyncNotConfigured" })
    expect(mocks.discover).not.toHaveBeenCalled()
  })

  test("too many sources are refused", async () => {
    const sources = Array.from({ length: 51 }, (_, index) => ({
      inboxId: `i${index}`,
    }))

    await expect(
      contactSyncService.schedule(scheduleInput(sources)),
    ).rejects.toMatchObject({ code: "contactSyncTooManySources" })
  })

  test("a live run blocks with 409 and names the run", async () => {
    mocks.findLive.mockResolvedValue({ id: "run-live" })

    await expect(
      contactSyncService.schedule(scheduleInput([{ inboxId: "i1" }])),
    ).rejects.toMatchObject({
      code: "contactSyncAlreadyRunning",
      httpStatusCode: 409,
      data: { runId: "run-live" },
    })
    expect(mocks.createWithItems).not.toHaveBeenCalled()
  })

  test("a run within the last 4 hours blocks with the next allowed time", async () => {
    const createdAt = new Date(Date.now() - 60 * 60 * 1000)
    mocks.findLatestFetchedRun.mockResolvedValue({ id: "old", createdAt })

    await expect(
      contactSyncService.schedule(scheduleInput([{ inboxId: "i1" }])),
    ).rejects.toMatchObject({
      code: "contactSyncCooldown",
      data: {
        nextSyncAt: new Date(
          createdAt.getTime() + 4 * 60 * 60 * 1000,
        ).toISOString(),
      },
    })
  })

  test("losing the insert race to a concurrent request is reported as running", async () => {
    mocks.createWithItems.mockResolvedValue(null)
    mocks.findLive
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "run-2" })

    await expect(
      contactSyncService.schedule(scheduleInput([{ inboxId: "i1" }])),
    ).rejects.toMatchObject({ data: { runId: "run-2" } })
  })

  test("a failed enqueue keeps the run for the sweeper", async () => {
    mocks.queueAdd.mockRejectedValue(new Error("redis down"))

    await expect(
      contactSyncService.schedule(scheduleInput([{ inboxId: "i1" }])),
    ).resolves.toMatchObject({ id: "run-1" })
  })
})

describe("contactSyncService.cancel", () => {
  test("is idempotent: a finished run reports cancelled false", async () => {
    mocks.findForWorkspace.mockResolvedValue({ id: "run-1", items: [] })
    mocks.cancelLive
      .mockResolvedValueOnce({ id: "run-1" })
      .mockResolvedValueOnce(null)

    await expect(
      contactSyncService.cancel({ workspaceId: WORKSPACE, runId: "run-1" }),
    ).resolves.toEqual({ cancelled: true })
    await expect(
      contactSyncService.cancel({ workspaceId: WORKSPACE, runId: "run-1" }),
    ).resolves.toEqual({ cancelled: false })
  })

  test("a run of another workspace is not found", async () => {
    mocks.findForWorkspace.mockResolvedValue(null)

    await expect(
      contactSyncService.cancel({ workspaceId: WORKSPACE, runId: "run-x" }),
    ).rejects.toMatchObject({
      code: "contactSyncRunNotFound",
      httpStatusCode: 404,
    })
    expect(mocks.cancelLive).not.toHaveBeenCalled()
  })
})

describe("contactSyncService.finish", () => {
  test.each([
    ["running", ["succeeded", "succeeded"], "succeeded"],
    ["running", ["succeeded", "failed"], "partial"],
    ["running", ["partial", "failed"], "partial"],
    ["running", ["failed", "failed"], "failed"],
    ["cancelling", ["succeeded", "cancelled"], "cancelled"],
    // A page that went away is neutral: the run is judged on the rest.
    ["running", ["succeeded", "cancelled"], "succeeded"],
    ["running", ["failed", "cancelled"], "failed"],
    ["running", ["cancelled"], "cancelled"],
  ])("a %s run with items %j ends %s", async (status, items, outcome) => {
    mocks.listItemStatuses.mockResolvedValue(items)
    mocks.finish.mockResolvedValue(true)

    await contactSyncService.finish({
      run: { id: "run-1", status: status as "running" },
      expect: { claimToken: "t" },
    })

    expect(mocks.finish).toHaveBeenCalledWith({
      runId: "run-1",
      expect: { claimToken: "t" },
      outcome: { status: outcome },
      // Only a run being wound down closes what is still open; an outcome
      // inferred as cancelled still waits for an item appended meanwhile.
      closeOpen: status === "cancelling",
    })
  })
})

describe("contactSyncService page lifecycle", () => {
  test("a Messenger or Instagram page locks its integration row before cancelling its items", async () => {
    await contactSyncService.cancelForInbox(
      {
        workspaceId: WORKSPACE,
        inboxId: "i1",
        lock: { channel: "messenger", integrationId: "int-1" },
      },
      { tx: true } as never,
    )

    expect(mocks.lockIntegration).toHaveBeenCalledWith({
      channel: "messenger",
      workspaceId: WORKSPACE,
      integrationId: "int-1",
      tx: { tx: true },
    })
    expect(mocks.lockIntegration.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cancelForInbox.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("a page going away cancels its open items and owed follow-ups", async () => {
    await contactSyncService.cancelForInbox({
      workspaceId: WORKSPACE,
      inboxId: "i1",
    })

    expect(mocks.cancelForInbox).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE, inboxId: "i1" },
      expect.anything(),
    )
  })

  test("retry-history reopens the follow-up only while the page is connected", async () => {
    mocks.reopenFollowUp.mockResolvedValue(1)
    mocks.findIntegrationIdByInbox.mockResolvedValue("int-1")

    await expect(
      contactSyncService.retryHistory({
        workspaceId: WORKSPACE,
        inboxId: "i1",
      }),
    ).resolves.toEqual({ reopened: true })
    await expect(
      contactSyncService.retryHistory({
        workspaceId: WORKSPACE,
        inboxId: "gone",
      }),
    ).rejects.toMatchObject({ code: "contactSyncSourceNotFound" })
  })

  test("retry-history takes the integration lock before it reopens, and reopens nothing once the integration is gone", async () => {
    mocks.reopenFollowUp.mockResolvedValue(1)
    mocks.findIntegrationIdByInbox.mockResolvedValue("int-1")

    await contactSyncService.retryHistory({
      workspaceId: WORKSPACE,
      inboxId: "i1",
    })

    expect(mocks.lockIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: "int-1" }),
    )
    expect(mocks.lockIntegration.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.reopenFollowUp.mock.invocationCallOrder[0] ?? 0,
    )

    vi.clearAllMocks()
    mocks.findIntegrationIdByInbox.mockResolvedValue(null)
    await expect(
      contactSyncService.retryHistory({
        workspaceId: WORKSPACE,
        inboxId: "i1",
      }),
    ).resolves.toEqual({ reopened: false })
    expect(mocks.reopenFollowUp).not.toHaveBeenCalled()
  })

  test("the background scope is the run's own actor snapshot", () => {
    expect(
      contactSyncService.scopeOfRun({
        workspaceId: WORKSPACE,
        requestedByType: "api_token",
        requestedById: "tok-9",
      }),
    ).toEqual({
      workspaceId: WORKSPACE,
      actor: { type: "api_token", id: "tok-9" },
    })
  })
})

describe("contactSyncService sweeper", () => {
  /** The chunk job ids whose state the queue reports, by job id suffix. */
  const queueWith = (states: Record<string, string>) => {
    mocks.getJob.mockImplementation((jobId: string) => {
      const entry = Object.entries(states).find(([suffix]) =>
        jobId.endsWith(suffix),
      )
      const job = entry && { getState: () => Promise.resolve(entry[1]) }
      return Promise.resolve(job)
    })
  }
  const exhausted = (id: string, status = "running") => ({
    id,
    chunkSeq: 7,
    status,
  })

  beforeEach(() => {
    mocks.markMaxAttemptsFailed.mockResolvedValue(0)
  })

  test("a run whose last chunk still waits in the queue is not failed before it runs", async () => {
    mocks.listExhausted.mockResolvedValue([
      exhausted("waiting"),
      exhausted("lost"),
    ])
    queueWith({ "waiting-chunk-7": "waiting" })

    await contactSyncService.markMaxAttemptsFailed()

    expect(mocks.listExhausted).toHaveBeenCalledWith({
      maxAttempts: 2,
      batchSize: 100,
    })
    expect(mocks.markMaxAttemptsFailed).toHaveBeenCalledWith({
      maxAttempts: 2,
      errorCode: "maxAttempts",
      runIds: ["lost"],
    })
  })

  test.each([
    "delayed",
    "prioritized",
    "waiting-children",
    "active",
  ])("a chunk in state %s has not finished: the run waits for it", async (state) => {
    mocks.listExhausted.mockResolvedValue([exhausted("run-1")])
    queueWith({ "run-1-chunk-7": state })

    await contactSyncService.markMaxAttemptsFailed()

    expect(mocks.markMaxAttemptsFailed).toHaveBeenCalledWith(
      expect.objectContaining({ runIds: [] }),
    )
  })

  test.each([
    "completed",
    "failed",
  ])("a chunk that is %s is no reason to wait: the run ends", async (state) => {
    mocks.listExhausted.mockResolvedValue([exhausted("run-1")])
    queueWith({ "run-1-chunk-7": state })

    await contactSyncService.markMaxAttemptsFailed()

    expect(mocks.markMaxAttemptsFailed).toHaveBeenCalledWith(
      expect.objectContaining({ runIds: ["run-1"] }),
    )
  })

  test("a cancelled run is ended even with a chunk queued", async () => {
    mocks.listExhausted.mockResolvedValue([exhausted("run-1", "cancelling")])
    queueWith({ "run-1-chunk-7": "waiting" })

    await contactSyncService.markMaxAttemptsFailed()

    expect(mocks.getJob).not.toHaveBeenCalled()
    expect(mocks.markMaxAttemptsFailed).toHaveBeenCalledWith(
      expect.objectContaining({ runIds: ["run-1"] }),
    )
  })

  test("a run whose job is gone from the queue ends", async () => {
    mocks.listExhausted.mockResolvedValue([exhausted("run-1")])
    queueWith({})

    await contactSyncService.markMaxAttemptsFailed()

    expect(mocks.markMaxAttemptsFailed).toHaveBeenCalledWith(
      expect.objectContaining({ runIds: ["run-1"] }),
    )
  })

  test("a queue that cannot be read ends nothing: the next sweep checks again", async () => {
    mocks.listExhausted.mockResolvedValue([exhausted("run-1")])
    mocks.getJob.mockRejectedValue(new Error("redis down"))

    await contactSyncService.markMaxAttemptsFailed()

    expect(mocks.markMaxAttemptsFailed).toHaveBeenCalledWith(
      expect.objectContaining({ runIds: [] }),
    )
  })

  test("a re-dispatch is refunded while the previous chunk is still queued", async () => {
    queueWith({ "run-1-chunk-6": "waiting" })

    const refunded = await contactSyncService.refundIfPreviousChunkQueued({
      id: "run-1",
      attempts: 2,
      chunkSeq: 7,
      status: "pending",
    })

    expect(refunded).toBe(true)
    expect(mocks.refundDispatch).toHaveBeenCalledWith({
      runId: "run-1",
      attempts: 2,
      chunkSeq: 7,
    })
  })

  test("no refund when the queue cannot be read: the dispatch goes ahead", async () => {
    mocks.getJob.mockRejectedValue(new Error("redis down"))

    const refunded = await contactSyncService.refundIfPreviousChunkQueued({
      id: "run-1",
      attempts: 2,
      chunkSeq: 7,
      status: "pending",
    })

    expect(refunded).toBe(false)
    expect(mocks.refundDispatch).not.toHaveBeenCalled()
  })

  test("no refund when the previous chunk is gone", async () => {
    queueWith({})

    const refunded = await contactSyncService.refundIfPreviousChunkQueued({
      id: "run-1",
      attempts: 2,
      chunkSeq: 7,
      status: "pending",
    })

    expect(refunded).toBe(false)
    expect(mocks.refundDispatch).not.toHaveBeenCalled()
  })
})

describe("contactSyncService.saveMappings", () => {
  test("a source id listed twice is rejected before anything is written", async () => {
    mocks.listSchema.mockResolvedValue({
      tags: [{ id: "12", name: "VIP" }],
      fields: [],
    })

    const error = await contactSyncService
      .saveMappings({
        workspaceId: WORKSPACE,
        actor: ACTOR,
        inboxId: "i1",
        tags: [
          { externalId: "12", target: null },
          { externalId: "12", target: null },
          { externalId: "99", target: null },
        ],
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ContactSyncMappingError)
    const mappingError = error as InstanceType<typeof ContactSyncMappingError>
    expect(mappingError.issues).toEqual([
      { kind: "tag", externalId: "12", reason: "duplicateExternalId" },
      { kind: "tag", externalId: "12", reason: "duplicateExternalId" },
      { kind: "tag", externalId: "99", reason: "unknownExternalId" },
    ])
    expect(mappingError.message).toContain("tag 99 (unknownExternalId)")
    expect(mocks.upsertManual).not.toHaveBeenCalled()
  })

  test("the schema is read for the page with the request's own actor", async () => {
    mocks.listSchema.mockResolvedValue({ tags: [], fields: [] })

    await contactSyncService.saveMappings({
      workspaceId: WORKSPACE,
      actor: ACTOR,
      inboxId: "i1",
    })

    expect(mocks.listSchema).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE, actor: ACTOR },
      { channel: "messenger", pageId: "page-i1" },
    )
  })
})
