import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  enableCoexist: vi.fn(),
  isConfigured: vi.fn(),
  discover: vi.fn(),
  findInboxes: vi.fn(),
  lockWorkspace: vi.fn(),
  enqueue: vi.fn(),
  findIntegrationIdByInbox: vi.fn(),
  lockIntegration: vi.fn(),
  findLiveRun: vi.fn(),
  findOpenItemForInbox: vi.fn(),
  requestFollowUp: vi.fn(),
  lockLiveRun: vi.fn(),
  createWithItems: vi.fn(),
  appendItems: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: (fn: (tx: unknown) => unknown) => fn({ tx: true }) },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  coexistSyncRunRepository: {
    findIntegrationIdByInbox: mocks.findIntegrationIdByInbox,
    lockIntegration: mocks.lockIntegration,
    findLiveRun: mocks.findLiveRun,
  },
  contactSyncRunRepository: {
    findOpenItemForInbox: mocks.findOpenItemForInbox,
    requestFollowUp: mocks.requestFollowUp,
    lockLiveRun: mocks.lockLiveRun,
    createWithItems: mocks.createWithItems,
    appendItems: mocks.appendItems,
  },
}))
vi.mock("../providers", () => ({
  contactSyncAdapters: {
    ahachat: {
      isConfigured: mocks.isConfigured,
      discoverPages: mocks.discover,
    },
  },
}))
vi.mock("../source-inboxes", () => ({
  findContactSyncInboxes: mocks.findInboxes,
}))
vi.mock("../../coexist/service", () => ({
  coexistService: { enable: mocks.enableCoexist },
}))
vi.mock("../run-lock", () => ({ lockWorkspaceRuns: mocks.lockWorkspace }))
vi.mock("../queue", () => ({ enqueueContactSyncChunk: mocks.enqueue }))

const { scheduleContactSyncConnectImport } = await import("../connect-import")
const { clearDiscoveryCache } = await import("../discovery-cache")

const ACTOR = { type: "user" as const, id: "user-1" }

const inbox = (id: string, channel = "messenger") => ({
  id,
  name: `Inbox ${id}`,
  channel,
  sourceId: `page-${id}`,
})

const found = (id: string, channel = "messenger") => ({
  channel,
  pageId: `page-${id}`,
  status: "found",
  name: `Page ${id}`,
  avatarUrl: null,
})

const input = (...ids: string[]) => ({
  workspaceId: "ws-1",
  actor: ACTOR,
  triggerSource: "app" as const,
  pages: ids.map((id) => ({ inboxId: id, aiReadsSyncedHistory: id === "i1" })),
})

const setInboxes = (inboxes: ReturnType<typeof inbox>[]) =>
  mocks.findInboxes.mockImplementation((_ws: string, ids: string[]) =>
    Promise.resolve(inboxes.filter((candidate) => ids.includes(candidate.id))),
  )

beforeEach(() => {
  vi.resetAllMocks()
  clearDiscoveryCache()
  mocks.isConfigured.mockReturnValue(true)
  mocks.enqueue.mockResolvedValue(undefined)
  mocks.enableCoexist.mockResolvedValue({ success: true, runId: "coexist-1" })
  setInboxes([inbox("i1"), inbox("i2", "instagram"), inbox("i3", "zalo")])
  mocks.discover.mockImplementation(
    (_scope, pages: { pageId: string; channel: string }[]) =>
      Promise.resolve(
        pages.map((page) =>
          found(page.pageId.replace("page-", ""), page.channel),
        ),
      ),
  )
  mocks.findIntegrationIdByInbox.mockImplementation(
    ({ inboxId }: { inboxId: string }) => Promise.resolve(`int-${inboxId}`),
  )
  mocks.findLiveRun.mockResolvedValue(null)
  mocks.findOpenItemForInbox.mockResolvedValue(null)
  mocks.lockLiveRun.mockResolvedValue(null)
  mocks.createWithItems.mockImplementation((value) =>
    Promise.resolve({
      id: "run-1",
      workspaceId: value.workspaceId,
      chunkSeq: 0,
    }),
  )
})

describe("scheduleContactSyncConnectImport", () => {
  test("one connect run owes each page's history sync, skips the cooldown and enqueues its first chunk", async () => {
    const result = await scheduleContactSyncConnectImport(input("i1", "i2"))

    expect(mocks.createWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "connect",
        triggerSource: "app",
        requestedByType: "user",
        requestedById: "user-1",
        syncTags: true,
        syncCustomFields: true,
        overwriteExisting: false,
        items: [
          expect.objectContaining({
            inboxId: "i1",
            sourceChannel: "messenger",
            sourceAccountId: "page-i1",
            sourceAccountName: "Page i1",
            followUpCoexist: true,
            followUpAiReadsSyncedHistory: true,
          }),
          expect.objectContaining({
            inboxId: "i2",
            sourceChannel: "instagram",
            followUpCoexist: true,
            followUpAiReadsSyncedHistory: false,
          }),
        ],
      }),
      expect.anything(),
    )
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ id: "run-1" }),
    )
    expect(result).toEqual({
      runId: "run-1",
      pages: [
        {
          inboxId: "i1",
          outcome: "started",
          fallbackReason: null,
          historyStarted: false,
        },
        {
          inboxId: "i2",
          outcome: "started",
          fallbackReason: null,
          historyStarted: false,
        },
      ],
    })
  })

  test("an unconfigured sync is refused", async () => {
    mocks.isConfigured.mockReturnValue(false)

    await expect(
      scheduleContactSyncConnectImport(input("i1")),
    ).rejects.toMatchObject({
      code: "contactSyncNotConfigured",
    })
  })

  test.each([
    ["a channel with no history sync to follow", "i3", "channelUnsupported"],
    ["an inbox that is not connected", "gone", "inboxNotConnected"],
  ])("%s falls back at once", async (_label, id, reason) => {
    const result = await scheduleContactSyncConnectImport(input(id))

    expect(result.pages).toEqual([
      {
        inboxId: id,
        outcome: "fallback",
        fallbackReason: reason,
        historyStarted: false,
      },
    ])
    expect(mocks.discover).not.toHaveBeenCalled()
    expect(mocks.createWithItems).not.toHaveBeenCalled()
  })

  test.each([
    ["absent", "notInAhachat"],
    ["ambiguous", "pageAmbiguous"],
    ["unavailable", "ahachatUnavailable"],
  ])("a page the source says is %s falls back as %s, the others still import", async (status, reason) => {
    mocks.discover.mockResolvedValue([
      { ...found("i1"), status },
      found("i2", "instagram"),
    ])

    const result = await scheduleContactSyncConnectImport(input("i1", "i2"))

    expect(result.pages).toEqual([
      {
        inboxId: "i1",
        outcome: "fallback",
        fallbackReason: reason,
        historyStarted: true,
      },
      {
        inboxId: "i2",
        outcome: "started",
        fallbackReason: null,
        historyStarted: false,
      },
    ])
    expect(mocks.createWithItems.mock.calls[0]?.[0].items).toHaveLength(1)
  })

  test("a page whose history already runs is left to that run", async () => {
    mocks.findLiveRun.mockImplementation(
      ({ integrationId }: { integrationId: string }) =>
        Promise.resolve(
          integrationId === "int-i1" ? { id: "coexist-1" } : null,
        ),
    )

    const result = await scheduleContactSyncConnectImport(input("i1", "i2"))

    expect(result.pages[0]).toEqual({
      inboxId: "i1",
      outcome: "fallback",
      fallbackReason: "historyRunning",
      historyStarted: true,
    })
    expect(result.pages[1]?.outcome).toBe("started")
  })

  test("a second connect of an importing page attaches to its open item and starts nothing", async () => {
    mocks.findOpenItemForInbox.mockResolvedValue({ id: "item-9" })

    const result = await scheduleContactSyncConnectImport(input("i1"))

    expect(mocks.requestFollowUp).toHaveBeenCalledWith(
      { itemId: "item-9", aiReadsSyncedHistory: true },
      expect.anything(),
    )
    expect(mocks.createWithItems).not.toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(result.pages).toEqual([
      {
        inboxId: "i1",
        outcome: "attached",
        fallbackReason: null,
        historyStarted: false,
      },
    ])
    expect(result.runId).toBeNull()
  })

  test("an unrelated live run makes the page fall back to a plain history sync", async () => {
    mocks.lockLiveRun.mockResolvedValue({ id: "menu-run" })

    const result = await scheduleContactSyncConnectImport(input("i1"))

    expect(result.pages).toEqual([
      {
        inboxId: "i1",
        outcome: "fallback",
        fallbackReason: "workspaceBusy",
        historyStarted: true,
      },
    ])
    expect(mocks.createWithItems).not.toHaveBeenCalled()
  })

  describe("a live connect run (the rest of a batch connect)", () => {
    const liveConnect = { id: "run-live", trigger: "connect", chunkSeq: 3 }

    test("takes the page as another item and queues nothing new", async () => {
      mocks.lockLiveRun.mockResolvedValue(liveConnect)
      mocks.appendItems.mockImplementation(({ items }) =>
        Promise.resolve(items.map((item: { inboxId: string }) => item)),
      )

      const result = await scheduleContactSyncConnectImport(input("i1"))

      expect(mocks.appendItems).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: "run-live",
          workspaceId: "ws-1",
          maxItems: 50,
          items: [
            expect.objectContaining({
              inboxId: "i1",
              followUpCoexist: true,
              followUpAiReadsSyncedHistory: true,
            }),
          ],
        }),
        expect.anything(),
      )
      expect(result).toEqual({
        runId: "run-live",
        pages: [
          {
            inboxId: "i1",
            outcome: "started",
            fallbackReason: null,
            historyStarted: false,
          },
        ],
      })
      expect(mocks.createWithItems).not.toHaveBeenCalled()
      expect(mocks.enqueue).not.toHaveBeenCalled()
    })

    test("a full run sends the extra pages to a plain history sync", async () => {
      mocks.lockLiveRun.mockResolvedValue(liveConnect)
      mocks.appendItems.mockResolvedValue([{ inboxId: "i1" }])

      const result = await scheduleContactSyncConnectImport(input("i1", "i2"))

      expect(result.pages.map((page) => page.outcome)).toEqual([
        "started",
        "fallback",
      ])
      expect(result.pages[1]?.fallbackReason).toBe("tooManyPages")
    })

    test("a run that ended or was cancelled meanwhile turns the page away", async () => {
      mocks.lockLiveRun.mockResolvedValue(liveConnect)
      mocks.appendItems.mockResolvedValue(null)

      const result = await scheduleContactSyncConnectImport(input("i1"))

      expect(result.runId).toBeNull()
      expect(result.pages[0]).toMatchObject({
        outcome: "fallback",
        fallbackReason: "workspaceBusy",
        historyStarted: true,
      })
    })

    test("a menu run is never extended", async () => {
      mocks.lockLiveRun.mockResolvedValue({ id: "menu-run", trigger: "menu" })

      await scheduleContactSyncConnectImport(input("i1"))

      expect(mocks.appendItems).not.toHaveBeenCalled()
    })
  })

  test("pages past the 50-item cap fall back", async () => {
    const many = Array.from({ length: 52 }, (_, index) => inbox(`m${index}`))
    setInboxes(many)

    const result = await scheduleContactSyncConnectImport(
      input(...many.map((candidate) => candidate.id)),
    )

    expect(mocks.createWithItems.mock.calls[0]?.[0].items).toHaveLength(50)
    expect(
      result.pages.filter((page) => page.fallbackReason === "tooManyPages"),
    ).toHaveLength(2)
  })

  test("integration rows are locked in id order, after the workspace lock", async () => {
    setInboxes([inbox("b"), inbox("a")])

    await scheduleContactSyncConnectImport(input("b", "a"))

    const locked = mocks.lockIntegration.mock.calls.map(
      (call) => call[0].integrationId,
    )
    expect(locked).toEqual(["int-a", "int-b"])
    expect(mocks.lockWorkspace.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.lockIntegration.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("a repeated inbox is imported once, the first choice wins", async () => {
    const result = await scheduleContactSyncConnectImport({
      ...input("i1"),
      pages: [
        { inboxId: "i1", aiReadsSyncedHistory: false },
        { inboxId: "i1", aiReadsSyncedHistory: true },
      ],
    })

    expect(result.pages).toHaveLength(1)
    expect(
      mocks.createWithItems.mock.calls[0]?.[0].items[0]
        .followUpAiReadsSyncedHistory,
    ).toBe(false)
  })

  test("losing the insert to a run committed meanwhile falls every page back, enqueueing nothing", async () => {
    mocks.createWithItems.mockResolvedValueOnce(null)

    const result = await scheduleContactSyncConnectImport(input("i1", "i2"))

    expect(result.runId).toBeNull()
    expect(result.pages).toEqual([
      {
        inboxId: "i1",
        outcome: "fallback",
        fallbackReason: "workspaceBusy",
        historyStarted: true,
      },
      {
        inboxId: "i2",
        outcome: "fallback",
        fallbackReason: "workspaceBusy",
        historyStarted: true,
      },
    ])
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  test("a failed enqueue keeps the run for the sweeper", async () => {
    mocks.enqueue.mockRejectedValue(new Error("redis down"))

    await expect(
      scheduleContactSyncConnectImport(input("i1")),
    ).resolves.toMatchObject({
      runId: "run-1",
    })
  })

  describe("the plain history sync of a fallback page", () => {
    test("is started at once with the page's own AI choice", async () => {
      mocks.lockLiveRun.mockResolvedValue({ id: "menu-run" })

      const result = await scheduleContactSyncConnectImport(input("i1"))

      expect(mocks.enableCoexist).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        integrationId: "int-i1",
        channel: "messenger",
        aiReadsSyncedHistory: true,
      })
      expect(result.pages[0]).toMatchObject({
        outcome: "fallback",
        historyStarted: true,
      })
    })

    test("is not started for a channel with no history sync or an inbox that is not connected", async () => {
      const result = await scheduleContactSyncConnectImport(input("i3", "gone"))

      expect(mocks.enableCoexist).not.toHaveBeenCalled()
      expect(
        result.pages.every((entry) => entry.historyStarted === false),
      ).toBe(true)
    })

    test("is not started for an imported page: its history follows the import", async () => {
      await scheduleContactSyncConnectImport(input("i1"))

      expect(mocks.enableCoexist).not.toHaveBeenCalled()
    })

    test("a refusal or a failure leaves historyStarted false and never fails the call", async () => {
      mocks.lockLiveRun.mockResolvedValue({ id: "menu-run" })
      mocks.enableCoexist.mockRejectedValue(new Error("meta down"))

      const result = await scheduleContactSyncConnectImport(input("i1"))

      expect(result.pages[0]).toMatchObject({
        outcome: "fallback",
        historyStarted: false,
      })
    })
  })
})
