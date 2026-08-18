import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// defaultReplyThrottleService — atomic per-contact/per-channel claim gating
// the Default Reply flow. Verifies: the window map, the Redis key format,
// the NX/EX claim call, `allTime` never touching Redis, `release` deleting
// the claim key, and fail-open behavior on any Redis error.
// ---------------------------------------------------------------------------

const warnMock = vi.fn()
vi.mock("../src/logger", () => ({
  logger: { warn: warnMock, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const setNumberIfNotExistsMock = vi.fn(async () => true)
const deleteMock = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: {
    setNumberIfNotExists: setNumberIfNotExistsMock,
    delete: deleteMock,
  },
}))

const {
  defaultReplyThrottleService,
  defaultReplyThrottleKey,
  DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS,
} = await import("../src/default-reply/throttle")

const WORKSPACE_ID = "ws-1"
const CONTACT_INBOX_ID = "contact-inbox-1"

beforeEach(() => {
  vi.clearAllMocks()
  setNumberIfNotExistsMock.mockResolvedValue(true)
})

describe("DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS", () => {
  test.each([
    ["allTime", null],
    ["oncePerHour", 3600],
    ["oncePerDay", 86_400],
  ] as const)("%s maps to %s seconds", (frequency, expected) => {
    expect(DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS[frequency]).toBe(expected)
  })
})

describe("defaultReplyThrottleKey", () => {
  test("builds a workspace + contactInbox scoped key", () => {
    expect(defaultReplyThrottleKey(WORKSPACE_ID, CONTACT_INBOX_ID)).toBe(
      `default-reply:last-sent:${WORKSPACE_ID}:${CONTACT_INBOX_ID}`,
    )
  })
})

describe("defaultReplyThrottleService.tryAcquire", () => {
  test("allTime reports 'bypassed' (no claim to own) and never touches Redis", async () => {
    const claim = await defaultReplyThrottleService.tryAcquire({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
      frequency: "allTime",
    })

    expect(claim).toBe("bypassed")
    expect(setNumberIfNotExistsMock).not.toHaveBeenCalled()
  })

  test.each([
    ["oncePerHour", 3600],
    ["oncePerDay", 86_400],
  ] as const)("%s claims the key via SET NX EX with the correct TTL", async (frequency, ttlSeconds) => {
    const claim = await defaultReplyThrottleService.tryAcquire({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
      frequency,
    })

    expect(claim).toBe("acquired")
    expect(setNumberIfNotExistsMock).toHaveBeenCalledTimes(1)
    const [key, , ttl] = setNumberIfNotExistsMock.mock.calls[0] as [
      string,
      number,
      number,
    ]
    expect(key).toBe(defaultReplyThrottleKey(WORKSPACE_ID, CONTACT_INBOX_ID))
    expect(ttl).toBe(ttlSeconds)
  })

  test("reports 'denied' when the claim already exists (second call within the window)", async () => {
    setNumberIfNotExistsMock.mockResolvedValueOnce(false)

    const claim = await defaultReplyThrottleService.tryAcquire({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
      frequency: "oncePerHour",
    })

    expect(claim).toBe("denied")
  })

  test("fails open as 'bypassed' (not 'acquired') and logs a warning when Redis throws", async () => {
    setNumberIfNotExistsMock.mockRejectedValueOnce(new Error("redis down"))

    const claim = await defaultReplyThrottleService.tryAcquire({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
      frequency: "oncePerHour",
    })

    expect(claim).toBe("bypassed")
    expect(warnMock).toHaveBeenCalled()
  })
})

describe("defaultReplyThrottleService.release", () => {
  test("deletes the claim key for the workspace/contactInbox pair", async () => {
    await defaultReplyThrottleService.release({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
    })

    expect(deleteMock).toHaveBeenCalledWith(
      defaultReplyThrottleKey(WORKSPACE_ID, CONTACT_INBOX_ID),
    )
  })

  test("swallows Redis errors rather than throwing", async () => {
    deleteMock.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      defaultReplyThrottleService.release({
        workspaceId: WORKSPACE_ID,
        contactInboxId: CONTACT_INBOX_ID,
      }),
    ).resolves.toBeUndefined()
    expect(warnMock).toHaveBeenCalled()
  })
})
