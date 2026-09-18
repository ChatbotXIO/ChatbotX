import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  heartbeatMany: vi.fn(),
  liveMembers: vi.fn(),
  markOnlineBulk: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  presenceStore: {
    heartbeatMany: mocks.heartbeatMany,
    liveMembers: mocks.liveMembers,
  },
}))

vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: { markOnlineBulk: mocks.markOnlineBulk },
}))

vi.mock("../src/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}))

const { workspacePresenceService, PRESENCE_TTL_MS, PRESENCE_SCAN_LIMIT } =
  await import("../src/workspace-presence/service")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("workspacePresenceService.heartbeatMany", () => {
  test("renews every reported userId in ONE Redis round-trip", async () => {
    mocks.heartbeatMany.mockResolvedValue({ newlyLiveMembers: [] })

    await workspacePresenceService.heartbeatMany({
      workspaceId: "ws1",
      userIds: ["agent-1", "agent-2"],
    })

    expect(mocks.heartbeatMany).toHaveBeenCalledTimes(1)
    expect(mocks.heartbeatMany).toHaveBeenCalledWith(
      "workspace:presence:ws1",
      ["agent-1", "agent-2"],
      PRESENCE_TTL_MS,
    )
  })

  test("is a no-op (no Redis call) for an empty userIds list", async () => {
    await workspacePresenceService.heartbeatMany({
      workspaceId: "ws1",
      userIds: [],
    })

    expect(mocks.heartbeatMany).not.toHaveBeenCalled()
  })

  test("does not write to the database when nobody newly transitioned online", async () => {
    mocks.heartbeatMany.mockResolvedValue({ newlyLiveMembers: [] })

    await workspacePresenceService.heartbeatMany({
      workspaceId: "ws1",
      userIds: ["agent-1"],
    })

    expect(mocks.markOnlineBulk).not.toHaveBeenCalled()
  })

  test("persists the offline -> online transition for exactly the newly-live subset, in ONE bulk write", async () => {
    mocks.heartbeatMany.mockResolvedValue({
      newlyLiveMembers: ["agent-2", "agent-3"],
    })

    await workspacePresenceService.heartbeatMany({
      workspaceId: "ws1",
      userIds: ["agent-1", "agent-2", "agent-3"],
    })

    expect(mocks.markOnlineBulk).toHaveBeenCalledWith({
      workspaceId: "ws1",
      userIds: ["agent-2", "agent-3"],
    })
    expect(mocks.markOnlineBulk).toHaveBeenCalledTimes(1)
  })

  test("a failed database write is logged and swallowed, never thrown", async () => {
    mocks.heartbeatMany.mockResolvedValue({ newlyLiveMembers: ["agent-1"] })
    mocks.markOnlineBulk.mockRejectedValue(new Error("db down"))

    await expect(
      workspacePresenceService.heartbeatMany({
        workspaceId: "ws1",
        userIds: ["agent-1"],
      }),
    ).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    expect(mocks.loggerError.mock.calls[0]?.[0]).toMatchObject({
      err: expect.any(Error),
    })
  })

  test("a Redis write failure is logged with err and degrades quietly — no throw, no database write", async () => {
    mocks.heartbeatMany.mockRejectedValue(new Error("redis down"))

    await expect(
      workspacePresenceService.heartbeatMany({
        workspaceId: "ws1",
        userIds: ["agent-1"],
      }),
    ).resolves.toBeUndefined()

    expect(mocks.markOnlineBulk).not.toHaveBeenCalled()
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    expect(mocks.loggerError.mock.calls[0]?.[0]).toMatchObject({
      err: expect.any(Error),
    })
  })
})

describe("workspacePresenceService.listOnlineMembers", () => {
  test("scans the workspace key at the bounded limit", async () => {
    mocks.liveMembers.mockResolvedValue([])

    await workspacePresenceService.listOnlineMembers("ws1")

    expect(mocks.liveMembers).toHaveBeenCalledTimes(1)
    expect(mocks.liveMembers).toHaveBeenCalledWith(
      "workspace:presence:ws1",
      PRESENCE_SCAN_LIMIT,
    )
  })

  test("returns the workspace key's user ids, most-recent first", async () => {
    mocks.liveMembers.mockResolvedValue(["agent-1", "agent-2"])

    await expect(
      workspacePresenceService.listOnlineMembers("ws1"),
    ).resolves.toEqual(["agent-1", "agent-2"])
  })

  test("returns an empty array when nobody is online", async () => {
    mocks.liveMembers.mockResolvedValue([])

    await expect(
      workspacePresenceService.listOnlineMembers("ws1"),
    ).resolves.toEqual([])
  })

  test("a Redis read failure is logged with err and degrades to [] — never throws", async () => {
    mocks.liveMembers.mockRejectedValue(new Error("redis down"))

    await expect(
      workspacePresenceService.listOnlineMembers("ws1"),
    ).resolves.toEqual([])

    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    expect(mocks.loggerError.mock.calls[0]?.[0]).toMatchObject({
      err: expect.any(Error),
    })
  })
})
