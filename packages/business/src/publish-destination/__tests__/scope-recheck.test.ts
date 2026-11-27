import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claims: new Set<string>(),
  del: vi.fn(),
  findCredentialSource: vi.fn(),
  findRecheckFence: vi.fn(),
  list: vi.fn(),
  lowQueueAdd: vi.fn(),
  recordRecheckedScopes: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  publishCredentialRepository: {
    findCredentialSource: mocks.findCredentialSource,
  },
  publishDestinationRepository: {
    findRecheckFence: mocks.findRecheckFence,
    recordRecheckedScopes: mocks.recordRecheckedScopes,
  },
  publishDestinationStateRepository: { list: mocks.list },
}))
vi.mock("@chatbotx.io/redis", () => ({
  casStore: {
    del: mocks.del,
    setIfAbsent: vi.fn((key: string) => {
      if (mocks.claims.has(key)) {
        return Promise.resolve(false)
      }
      mocks.claims.add(key)
      return Promise.resolve(true)
    }),
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  LowJobAction: {
    recheckPublishDestinationScopes: "recheckPublishDestinationScopes",
  },
  lowQueue: { add: mocks.lowQueueAdd },
}))
vi.mock("../../logger", () => ({ logger: { warn: mocks.warn } }))

const { publishScopeRecheckService } = await import("../scope-recheck")

const NOW = new Date("2026-11-25T10:00:00.000Z")
const JOB_ID_PATTERN = /^recheck-publish-scopes-/
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/

const row = (overrides: Record<string, unknown> = {}) => ({
  checkedAt: null,
  id: "d1",
  inboxId: "inbox-1",
  publisherKey: "facebook",
  state: "ready",
  ...overrides,
})

const source = (overrides: Record<string, unknown> = {}) => ({
  auth: {
    clientId: "app",
    clientSecret: "secret",
    tokens: { accessToken: "tok" },
  },
  inboxStatus: "connected",
  kind: "inbox",
  provider: "facebook",
  publisherKey: "facebook",
  tokenRefreshError: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mocks.claims.clear()
  mocks.del.mockResolvedValue(undefined)
  mocks.lowQueueAdd.mockResolvedValue(undefined)
})

describe("requestScopeRecheck", () => {
  test("queues one job for the claimed destinations of the workspace", async () => {
    mocks.list.mockResolvedValue([row({ id: "d1" }), row({ id: "d2" })])

    const result = await publishScopeRecheckService.requestScopeRecheck({
      destinationIds: ["d1", "d2"],
      workspaceId: "ws-1",
    })

    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["d1", "d2"], workspaceId: "ws-1" }),
    )
    expect(result).toEqual({ failed: 0, fresh: 0, queued: 2, skipped: 0 })
    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(1)
    const [action, payload, options] = mocks.lowQueueAdd.mock.calls[0] ?? []
    expect(action).toBe("recheckPublishDestinationScopes")
    expect(payload.data).toEqual({
      destinationIds: ["d1", "d2"],
      workspaceId: "ws-1",
    })
    expect(options.attempts).toBe(1)
    expect(options.jobId).toMatch(JOB_ID_PATTERN)
  })

  test("counts networks without a documented source and unusable states as skipped", async () => {
    mocks.list.mockResolvedValue([
      row({ id: "d1" }),
      row({ id: "d2", publisherKey: "instagram" }),
      row({ id: "d3", state: "needsReconnect" }),
    ])

    const result = await publishScopeRecheckService.requestScopeRecheck({
      destinationIds: ["d1", "d2", "d3", "unknown"],
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ failed: 0, fresh: 0, queued: 1, skipped: 3 })
  })

  test("a destination checked in the last 10 minutes is fresh and never claimed", async () => {
    mocks.list.mockResolvedValue([
      row({ checkedAt: new Date(NOW.getTime() - 5 * 60_000) }),
    ])

    const result = await publishScopeRecheckService.requestScopeRecheck({
      destinationIds: ["d1"],
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ failed: 0, fresh: 1, queued: 0, skipped: 0 })
    expect(mocks.lowQueueAdd).not.toHaveBeenCalled()
    expect(mocks.claims.size).toBe(0)
  })

  test("overlapping requests read a destination once: the second sees it fresh", async () => {
    mocks.list.mockImplementation(({ ids }: { ids: string[] }) =>
      Promise.resolve(ids.map((id) => row({ id }))),
    )

    const first = await publishScopeRecheckService.requestScopeRecheck({
      destinationIds: ["d1"],
      workspaceId: "ws-1",
    })
    const second = await publishScopeRecheckService.requestScopeRecheck({
      destinationIds: ["d1", "d2"],
      workspaceId: "ws-1",
    })

    expect(first.queued).toBe(1)
    expect(second).toEqual({ failed: 0, fresh: 1, queued: 1, skipped: 0 })
    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(2)
    expect(mocks.lowQueueAdd.mock.calls[1]?.[1].data.destinationIds).toEqual([
      "d2",
    ])
  })

  test("without ids it covers the workspace's destinations, at most 100", async () => {
    mocks.list.mockResolvedValue(
      Array.from({ length: 130 }, (_, index) => row({ id: `d${index}` })),
    )

    const result = await publishScopeRecheckService.requestScopeRecheck({
      workspaceId: "ws-1",
    })

    expect(result.queued).toBe(100)
    // The 30 beyond the cap are not "fresh": they were never checked.
    expect(result).toEqual({ failed: 0, fresh: 0, queued: 100, skipped: 30 })
    expect(
      mocks.lowQueueAdd.mock.calls[0]?.[1].data.destinationIds,
    ).toHaveLength(100)
  })

  test("a failed enqueue releases the claims and queues nothing", async () => {
    mocks.list.mockResolvedValue([row({ id: "d1" })])
    mocks.lowQueueAdd.mockRejectedValue(new Error("redis"))

    const result = await publishScopeRecheckService.requestScopeRecheck({
      destinationIds: ["d1"],
      workspaceId: "ws-1",
    })

    expect(result.queued).toBe(0)
    expect(mocks.del).toHaveBeenCalledWith(
      "publish-scope-recheck-claim:ws-1:d1",
    )
  })
})

describe("runScopeRecheck", () => {
  const ops = { readScopes: vi.fn() }

  beforeEach(() => {
    mocks.findRecheckFence.mockResolvedValue({ checkedAt: NOW })
    mocks.findCredentialSource.mockResolvedValue(source())
    mocks.recordRecheckedScopes.mockResolvedValue(true)
  })

  test("writes the platform's scopes fenced on the token and the earlier checkedAt", async () => {
    ops.readScopes.mockResolvedValue({
      kind: "scopes",
      scopes: [
        "pages_manage_posts",
        "pages_read_engagement",
        "pages_show_list",
      ],
    })

    const result = await publishScopeRecheckService.runScopeRecheck(
      { destinationIds: ["d1"], workspaceId: "ws-1" },
      ops,
    )

    expect(result).toEqual({
      outcomes: ["written"],
      rateLimited: false,
      written: true,
    })
    const written = mocks.recordRecheckedScopes.mock.calls[0]?.[0]
    expect(written).toMatchObject({
      expectedCheckedAt: NOW,
      id: "d1",
      missingScopes: [],
      provider: "facebook",
      workspaceId: "ws-1",
    })
    expect(written.tokenFingerprint).toMatch(SHA256_HEX_PATTERN)
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("tok")
  })

  test("reports the still-missing scopes", async () => {
    ops.readScopes.mockResolvedValue({
      kind: "scopes",
      scopes: ["pages_show_list"],
    })

    await publishScopeRecheckService.runScopeRecheck(
      { destinationIds: ["d1"], workspaceId: "ws-1" },
      ops,
    )

    expect(
      mocks.recordRecheckedScopes.mock.calls[0]?.[0].missingScopes,
    ).toEqual(["pages_manage_posts", "pages_read_engagement"])
  })

  test("a fenced write that lost to a reconnect is reported unchanged", async () => {
    ops.readScopes.mockResolvedValue({ kind: "scopes", scopes: [] })
    mocks.recordRecheckedScopes.mockResolvedValue(false)

    const result = await publishScopeRecheckService.runScopeRecheck(
      { destinationIds: ["d1"], workspaceId: "ws-1" },
      ops,
    )

    expect(result.outcomes).toEqual(["unchanged"])
    expect(result.written).toBe(false)
  })

  test("an invalid token is logged and left as is", async () => {
    ops.readScopes.mockResolvedValue({ kind: "invalidToken" })

    const result = await publishScopeRecheckService.runScopeRecheck(
      { destinationIds: ["d1"], workspaceId: "ws-1" },
      ops,
    )

    expect(result.outcomes).toEqual(["invalidToken"])
    expect(mocks.recordRecheckedScopes).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalled()
  })

  test("stops at the first rate-limit answer and gives back the unread claims", async () => {
    ops.readScopes
      .mockResolvedValueOnce({ kind: "scopes", scopes: [] })
      .mockResolvedValueOnce({ kind: "rateLimited" })

    const result = await publishScopeRecheckService.runScopeRecheck(
      { destinationIds: ["d1", "d2", "d3", "d4"], workspaceId: "ws-1" },
      ops,
    )

    expect(result.outcomes).toEqual(["written", "rateLimited"])
    expect(result.rateLimited).toBe(true)
    expect(ops.readScopes).toHaveBeenCalledTimes(2)
    expect(mocks.del.mock.calls.map(([key]) => key)).toEqual([
      "publish-scope-recheck-claim:ws-1:d3",
      "publish-scope-recheck-claim:ws-1:d4",
    ])
  })

  test("skips a disconnected inbox, an errored token and a network with no source", async () => {
    mocks.findCredentialSource
      .mockResolvedValueOnce(source({ inboxStatus: "disconnected" }))
      .mockResolvedValueOnce(source({ tokenRefreshError: "expired" }))
      .mockResolvedValueOnce(source({ publisherKey: "threads" }))

    const result = await publishScopeRecheckService.runScopeRecheck(
      { destinationIds: ["a", "b", "c"], workspaceId: "ws-1" },
      ops,
    )

    expect(result.outcomes).toEqual(["skipped", "skipped", "skipped"])
    expect(ops.readScopes).not.toHaveBeenCalled()
  })

  test("a thrown error is logged and never escapes", async () => {
    ops.readScopes.mockRejectedValue(new Error("boom"))

    const result = await publishScopeRecheckService.runScopeRecheck(
      { destinationIds: ["d1"], workspaceId: "ws-1" },
      ops,
    )

    expect(result.outcomes).toEqual(["failed"])
  })
})
