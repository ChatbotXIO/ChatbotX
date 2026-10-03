import type { AiHandoverSettingsModel } from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByInbox: vi.fn(),
  upsert: vi.fn(),
  findActiveById: vi.fn(),
  findWorkspace: vi.fn(),
  findInbox: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  aiHandoverSettingsRepository: {
    findByInbox: mocks.findByInbox,
    upsert: mocks.upsert,
  },
}))
vi.mock("../src/flow/service", () => ({
  flowService: { findActiveById: mocks.findActiveById },
}))
vi.mock("../src/inbox/service", () => ({
  inboxService: { find: mocks.findInbox },
}))
vi.mock("../src/workspace/service", () => ({
  workspaceService: { find: mocks.findWorkspace },
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
  withCache: mocks.withCache,
}))

const { aiHandoverSettingsService } = await import(
  "../src/ai-handover-settings/service"
)

const WORKSPACE_ID = "ws-1"
const INBOX_ID = "inbox-1"
const PAGE = { workspaceId: WORKSPACE_ID, inboxId: INBOX_ID }
const NOW = new Date("2026-10-01T12:00:00Z")

const settingsRow = (
  overrides: Partial<AiHandoverSettingsModel> = {},
): AiHandoverSettingsModel => ({
  id: "bas-1",
  createdAt: NOW,
  updatedAt: NOW,
  ...PAGE,
  channel: "messenger",
  enabled: true,
  scheduleEnabled: false,
  timeRanges: [],
  gotoFlowId: null,
  returnMessage: null,
  pauseBotWaitingForStaff: false,
  applyToAllCustomers: false,
  applyToAllRevision: 0,
  applyToAllMessage: null,
  applyToAllRequestedByUserId: null,
  ...overrides,
})

const saveInput = (
  overrides: Partial<Parameters<typeof aiHandoverSettingsService.save>[0]> = {},
) => ({
  ...PAGE,
  enabled: true,
  scheduleEnabled: false,
  timeRanges: [],
  gotoFlowId: null,
  returnMessage: null,
  pauseBotWaitingForStaff: false,
  ...overrides,
})

const mockSettings = (
  settings: AiHandoverSettingsModel | null,
  inboxStatus = "connected",
) => {
  mocks.findByInbox.mockResolvedValue(settings)
  mocks.findInbox.mockResolvedValue({
    id: INBOX_ID,
    status: inboxStatus,
    channel: "messenger",
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  // The real cache is a Redis passthrough around the loader.
  mocks.withCache.mockImplementation(async (_key, loader) => await loader())
  mocks.upsert.mockImplementation(async (input) => settingsRow(input))
  mocks.findInbox.mockResolvedValue({
    id: INBOX_ID,
    status: "connected",
    channel: "messenger",
  })
})

describe("aiHandoverSettingsService.requireInbox", () => {
  test("returns the Page's inbox when it belongs to the workspace and its channel has an AI hand-off", async () => {
    await expect(aiHandoverSettingsService.requireInbox(PAGE)).resolves.toEqual(
      {
        id: INBOX_ID,
        status: "connected",
        channel: "messenger",
      },
    )
    // Scoped by the workspace: a foreign id never resolves.
    expect(mocks.findInbox).toHaveBeenCalledWith({
      where: { id: INBOX_ID, workspaceId: WORKSPACE_ID },
    })
  })

  test.each([
    ["not in this workspace", undefined],
    [
      "a channel without an AI hand-off",
      { id: INBOX_ID, status: "connected", channel: "whatsapp" },
    ],
  ])("is not found for an inbox that is %s", async (_label, inbox) => {
    mocks.findInbox.mockResolvedValue(inbox)

    await expect(
      aiHandoverSettingsService.requireInbox(PAGE),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})

describe("aiHandoverSettingsService.invalidate", () => {
  test("drops the Page's cached settings", async () => {
    await aiHandoverSettingsService.invalidate({ inboxId: INBOX_ID })

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledExactlyOnceWith([
      "ai-handover-settings:inbox-1",
    ])
  })
})

describe("aiHandoverSettingsService.find", () => {
  test("wraps the row so a workspace without settings is still cacheable", async () => {
    mockSettings(null)

    await expect(aiHandoverSettingsService.find(PAGE)).resolves.toBeNull()

    const [key, , options] = mocks.withCache.mock.calls[0]
    // The key carries the workspace (the read is scoped by it); the tag is the
    // Page alone, so one invalidation clears every entry of it.
    expect(key).toBe("ai-handover-settings:ws-1:inbox-1")
    expect(options.tags).toEqual(["ai-handover-settings:inbox-1"])
    // The loader must return a non-null envelope: withCache skips null results.
    const envelope = await mocks.withCache.mock.calls[0][1]()
    expect(envelope).toEqual({ settings: null })
  })

  test("returns the stored row", async () => {
    const row = settingsRow()
    mockSettings(row)

    await expect(aiHandoverSettingsService.find(PAGE)).resolves.toEqual(row)
  })
})

describe("aiHandoverSettingsService.findActive and the disconnected Page", () => {
  test("a disconnected Page is never active, even with the automation switched on", async () => {
    mockSettings(settingsRow(), "disconnected")

    await expect(
      aiHandoverSettingsService.findActive({ ...PAGE, now: NOW }),
    ).resolves.toBeNull()
    // The row itself is still readable (the card shows it).
    await expect(aiHandoverSettingsService.find(PAGE)).resolves.toEqual(
      settingsRow(),
    )
  })

  test("a workspace that does not own the Page cannot read or poison its cache entry", async () => {
    mockSettings(null)

    await aiHandoverSettingsService.find({
      workspaceId: "ws-foreign",
      inboxId: INBOX_ID,
    })
    await aiHandoverSettingsService.find(PAGE)

    const keys = mocks.withCache.mock.calls.map((call) => call[0])
    expect(keys).toEqual([
      "ai-handover-settings:ws-foreign:inbox-1",
      "ai-handover-settings:ws-1:inbox-1",
    ])
  })
})

describe("aiHandoverSettingsService.findActive", () => {
  test("returns the settings while the automation applies, null otherwise", async () => {
    const row = settingsRow()
    mockSettings(row)
    await expect(
      aiHandoverSettingsService.findActive({ ...PAGE, now: NOW }),
    ).resolves.toEqual(row)

    mockSettings(settingsRow({ enabled: false }))
    await expect(
      aiHandoverSettingsService.findActive({ ...PAGE, now: NOW }),
    ).resolves.toBeNull()

    mockSettings(null)
    await expect(
      aiHandoverSettingsService.findActive({ ...PAGE, now: NOW }),
    ).resolves.toBeNull()
  })
})

describe("aiHandoverSettingsService.findStopReason", () => {
  const reason = (requiresAutomation: boolean) =>
    aiHandoverSettingsService.findStopReason({
      ...PAGE,
      requiresAutomation,
      now: NOW,
    })

  test("a disconnected Page stops any run, whether or not it needs the automation", async () => {
    mockSettings(settingsRow(), "disconnected")

    await expect(reason(true)).resolves.toBe("pageDisconnected")
    await expect(reason(false)).resolves.toBe("pageDisconnected")
  })

  test("a hand-over stops when the automation is off or outside its schedule; a take-back does not need it", async () => {
    mockSettings(settingsRow({ enabled: false }))

    await expect(reason(true)).resolves.toBe("automationStopped")
    await expect(reason(false)).resolves.toBeNull()

    mockSettings(
      settingsRow({
        scheduleEnabled: true,
        timeRanges: [{ from: 18, to: 20 }],
      }),
    )
    mocks.findWorkspace.mockResolvedValue({ timezone: "UTC" })
    await expect(reason(true)).resolves.toBe("automationStopped")
  })

  test("a running automation on a connected Page does not stop anything", async () => {
    mockSettings(settingsRow())

    await expect(reason(true)).resolves.toBeNull()
  })

  test("a connected Page with no saved settings has no automation: a hand-over stops, a take-back carries on", async () => {
    mockSettings(null)

    await expect(reason(true)).resolves.toBe("automationStopped")
    await expect(reason(false)).resolves.toBeNull()
  })

  test("a Page whose inbox is gone counts as disconnected", async () => {
    mockSettings(settingsRow())
    mocks.findInbox.mockResolvedValue(null)

    await expect(reason(true)).resolves.toBe("pageDisconnected")
  })

  test("the connection state is read fresh, never from the settings cache", async () => {
    mockSettings(settingsRow())
    await expect(reason(true)).resolves.toBeNull()

    mocks.findInbox.mockResolvedValue({ id: INBOX_ID, status: "disconnected" })
    await expect(reason(true)).resolves.toBe("pageDisconnected")
  })

  test("reads through the cache once per call (cheap enough to ask before every batch)", async () => {
    mockSettings(settingsRow())

    await reason(true)

    expect(mocks.withCache).toHaveBeenCalledTimes(1)
  })
})

describe("aiHandoverSettingsService.isConfiguredAndInactive", () => {
  const due = (now = NOW) =>
    aiHandoverSettingsService.isConfiguredAndInactive({ ...PAGE, now })

  test("nothing saved is not 'inactive': no automation exists to take back for", async () => {
    mockSettings(null)
    await expect(due()).resolves.toBe(false)
  })

  test("saved and switched off is inactive", async () => {
    mockSettings(settingsRow({ enabled: false }))
    await expect(due()).resolves.toBe(true)
  })

  test("saved and active is not inactive", async () => {
    mockSettings(settingsRow())
    await expect(due()).resolves.toBe(false)
  })

  test("saved with a schedule is inactive outside its windows only", async () => {
    mockSettings(
      settingsRow({
        scheduleEnabled: true,
        timeRanges: [{ from: 18, to: 20 }],
      }),
    )
    mocks.findWorkspace.mockResolvedValue({ timezone: "UTC" })

    // 12:00 UTC is outside 18..20.
    await expect(due()).resolves.toBe(true)
    // 19:00 UTC is inside.
    await expect(due(new Date("2026-10-01T19:00:00Z"))).resolves.toBe(false)
  })
})

describe("aiHandoverSettingsService.save", () => {
  test("stores the settings and invalidates the Page cache tag", async () => {
    const row = await aiHandoverSettingsService.save(
      saveInput({ enabled: true, pauseBotWaitingForStaff: true }),
    )

    expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        ...PAGE,
        channel: "messenger",
        enabled: true,
        pauseBotWaitingForStaff: true,
        timeRanges: [],
        gotoFlowId: null,
        returnMessage: null,
      }),
    )
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledExactlyOnceWith([
      "ai-handover-settings:inbox-1",
    ])
    expect(row.pauseBotWaitingForStaff).toBe(true)
  })

  test("a cache outage after the write never fails the save (callers act on it)", async () => {
    mocks.invalidateCacheByTags.mockRejectedValue(new Error("redis down"))

    await expect(
      aiHandoverSettingsService.save(saveInput({ enabled: false })),
    ).resolves.toMatchObject({ enabled: false })
    expect(mocks.upsert).toHaveBeenCalledTimes(1)
  })

  test("trims the return message and stores blank as null", async () => {
    await aiHandoverSettingsService.save(
      saveInput({ returnMessage: "  Back with you  " }),
    )
    expect(mocks.upsert.mock.calls[0][0].returnMessage).toBe("Back with you")

    mocks.upsert.mockClear()
    await aiHandoverSettingsService.save(saveInput({ returnMessage: "   " }))
    expect(mocks.upsert.mock.calls[0][0].returnMessage).toBeNull()
  })

  test("saves nothing for an inbox that is not a Page of this workspace", async () => {
    mocks.findInbox.mockResolvedValue(undefined)

    await expect(
      aiHandoverSettingsService.save(saveInput()),
    ).rejects.toMatchObject({
      code: "notFound",
    })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  test("rejects a return message over the limit without writing", async () => {
    await expect(
      aiHandoverSettingsService.save(
        saveInput({ returnMessage: "x".repeat(2001) }),
      ),
    ).rejects.toMatchObject({ field: "returnMessage" })
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("requires at least one range when the schedule is on", async () => {
    await expect(
      aiHandoverSettingsService.save(
        saveInput({ scheduleEnabled: true, timeRanges: [] }),
      ),
    ).rejects.toMatchObject({ field: "timeRanges" })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  test.each([
    ["equal bounds", [{ from: 9, to: 9 }]],
    ["out of range", [{ from: 0, to: 25 }]],
    ["fractional", [{ from: 8.5, to: 17 }]],
  ])("rejects an invalid range (%s)", async (_label, timeRanges) => {
    await expect(
      aiHandoverSettingsService.save(saveInput({ timeRanges })),
    ).rejects.toMatchObject({ field: "timeRanges" })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  test("keeps valid ranges, including a midnight wrap", async () => {
    const timeRanges = [
      { from: 8, to: 12 },
      { from: 22, to: 6 },
    ]
    await aiHandoverSettingsService.save(
      saveInput({ scheduleEnabled: true, timeRanges }),
    )
    expect(mocks.upsert.mock.calls[0][0].timeRanges).toEqual(timeRanges)
  })

  test("rejects a goto flow that is not an active flow of the workspace", async () => {
    mocks.findActiveById.mockResolvedValue(undefined)
    await expect(
      aiHandoverSettingsService.save(saveInput({ gotoFlowId: "flow-gone" })),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.findActiveById).toHaveBeenCalledWith({
      id: "flow-gone",
      workspaceId: WORKSPACE_ID,
    })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  test("accepts an active goto flow", async () => {
    mocks.findActiveById.mockResolvedValue({ id: "flow-1" })
    await aiHandoverSettingsService.save(saveInput({ gotoFlowId: "flow-1" }))
    expect(mocks.upsert.mock.calls[0][0].gotoFlowId).toBe("flow-1")
  })

  test("does not look up a flow when none is selected", async () => {
    await aiHandoverSettingsService.save(saveInput())
    expect(mocks.findActiveById).not.toHaveBeenCalled()
  })

  test("does not invalidate the cache when the write fails", async () => {
    mocks.upsert.mockRejectedValue(new Error("db down"))
    await expect(aiHandoverSettingsService.save(saveInput())).rejects.toThrow(
      "db down",
    )
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })
})
