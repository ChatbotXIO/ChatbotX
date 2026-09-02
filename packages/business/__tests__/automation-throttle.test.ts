import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// automationThrottleService — generic Redis fast-path + Postgres
// source-of-truth throttle claim (docs/plans/default-reply-throttle-hybrid.md).
// Verifies: acquired/denied/bypassed, DB-computed remaining incl. the denied
// branch, window-in-key setting changes, Redis-down → DB, DB-down → fail
// open, release delete-by-claimId + Redis best-effort delete, and
// type/subject isolation via the fast-path key.
// ---------------------------------------------------------------------------

const warnMock = vi.fn()
const errorMock = vi.fn()
vi.mock("../src/logger", () => ({
  logger: { warn: warnMock, error: errorMock, info: vi.fn(), debug: vi.fn() },
}))

const existsMock = vi.fn(async () => false)
const setNumberMock = vi.fn(async () => undefined)
const deleteMock = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: {
    exists: existsMock,
    setNumber: setNumberMock,
    delete: deleteMock,
  },
}))

const claimAutomationThrottleMock = vi.fn()
const releaseAutomationThrottleMock = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/database/repositories", () => ({
  claimAutomationThrottle: claimAutomationThrottleMock,
  releaseAutomationThrottle: releaseAutomationThrottleMock,
}))

const { automationThrottleService, AUTOMATION_THROTTLE_FASTPATH_TTL_SECONDS } =
  await import("../src/automation-throttle/service")

const SUBJECT = {
  workspaceId: "ws-1",
  contactInboxId: "inbox-1",
  throttleType: "defaultReply" as const,
  subjectId: "0",
}

const NON_NEGATIVE_INTEGER_ERROR = /non-negative integer/

beforeEach(() => {
  vi.clearAllMocks()
  existsMock.mockResolvedValue(false)
  claimAutomationThrottleMock.mockResolvedValue({
    won: true,
    claimId: "claim-1",
    remainingSeconds: 3600,
  })
  // Default: the CAS deleted our own row, so `release` proceeds to evict the
  // Redis marker. Individual tests override with `false` (newer claim owns it).
  releaseAutomationThrottleMock.mockResolvedValue(true)
})

describe("automationThrottleService.tryAcquire", () => {
  test("throws on a negative or non-integer windowSeconds (caller bug, fails fast)", async () => {
    await expect(
      automationThrottleService.tryAcquire({ ...SUBJECT, windowSeconds: -1 }),
    ).rejects.toThrow(NON_NEGATIVE_INTEGER_ERROR)
    await expect(
      automationThrottleService.tryAcquire({
        ...SUBJECT,
        windowSeconds: 1.5,
      }),
    ).rejects.toThrow(NON_NEGATIVE_INTEGER_ERROR)
    expect(claimAutomationThrottleMock).not.toHaveBeenCalled()
  })

  test("windowSeconds 0 (unbounded) skips the Redis read and record-and-allows", async () => {
    claimAutomationThrottleMock.mockResolvedValueOnce({
      won: true,
      claimId: "c0",
      remainingSeconds: 0,
    })

    const result = await automationThrottleService.tryAcquire({
      ...SUBJECT,
      windowSeconds: 0,
    })

    expect(result).toEqual({
      result: "acquired",
      claimId: "c0",
      remainingSeconds: 0,
    })
    // Unbounded: never denies (no Redis read) and writes no marker.
    expect(existsMock).not.toHaveBeenCalled()
    expect(setNumberMock).not.toHaveBeenCalled()
    expect(claimAutomationThrottleMock).toHaveBeenCalledWith(
      expect.objectContaining({ windowSeconds: 0 }),
    )
  })

  test("reports 'denied' from the Redis fast-path without ever calling Postgres", async () => {
    existsMock.mockResolvedValueOnce(true)

    const result = await automationThrottleService.tryAcquire({
      ...SUBJECT,
      windowSeconds: 3600,
    })

    expect(result).toEqual({ result: "denied" })
    expect(claimAutomationThrottleMock).not.toHaveBeenCalled()
  })

  test("checks the fast-path key scoped by throttleType+subjectId+workspaceId+contactInboxId+window", async () => {
    await automationThrottleService.tryAcquire({
      ...SUBJECT,
      windowSeconds: 3600,
    })

    expect(existsMock).toHaveBeenCalledWith(
      "throttle:defaultReply:0:ws-1:inbox-1:w3600",
    )
  })

  test("a Redis miss falls through to Postgres and returns 'acquired' with the DB-computed remainingSeconds", async () => {
    const result = await automationThrottleService.tryAcquire({
      ...SUBJECT,
      windowSeconds: 3600,
    })

    expect(result).toEqual({
      result: "acquired",
      claimId: "claim-1",
      remainingSeconds: 3600,
    })
    expect(claimAutomationThrottleMock).toHaveBeenCalledWith(
      expect.objectContaining({ ...SUBJECT, windowSeconds: 3600 }),
    )
  })

  test("returns 'denied' (no claimId) when Postgres reports the window is still open", async () => {
    claimAutomationThrottleMock.mockResolvedValueOnce({
      won: false,
      remainingSeconds: 1800,
    })

    const result = await automationThrottleService.tryAcquire({
      ...SUBJECT,
      windowSeconds: 3600,
    })

    expect(result).toEqual({ result: "denied" })
  })

  test("writes the fast-path marker clamped to [1, FASTPATH_TTL] on acquire", async () => {
    claimAutomationThrottleMock.mockResolvedValueOnce({
      won: true,
      claimId: "claim-1",
      remainingSeconds: 86_400,
    })

    await automationThrottleService.tryAcquire({
      ...SUBJECT,
      windowSeconds: 86_400,
    })

    expect(setNumberMock).toHaveBeenCalledWith(
      "throttle:defaultReply:0:ws-1:inbox-1:w86400",
      1,
      AUTOMATION_THROTTLE_FASTPATH_TTL_SECONDS,
    )
  })

  test("writes the fast-path marker on deny too, clamped to the remaining seconds", async () => {
    claimAutomationThrottleMock.mockResolvedValueOnce({
      won: false,
      remainingSeconds: 120,
    })

    await automationThrottleService.tryAcquire({
      ...SUBJECT,
      windowSeconds: 3600,
    })

    expect(setNumberMock).toHaveBeenCalledWith(
      "throttle:defaultReply:0:ws-1:inbox-1:w3600",
      1,
      120,
    )
  })

  test("skips caching when the DB-computed remainingSeconds is already 0 (window boundary)", async () => {
    claimAutomationThrottleMock.mockResolvedValueOnce({
      won: true,
      claimId: "claim-1",
      remainingSeconds: 0,
    })

    await automationThrottleService.tryAcquire({
      ...SUBJECT,
      windowSeconds: 3600,
    })

    expect(setNumberMock).not.toHaveBeenCalled()
  })

  test("a setting change (different windowSeconds) routes to a fresh fast-path key, ignoring a marker under the old window", async () => {
    // Simulates oncePerHour -> oncePerDay: the key embeds windowSeconds, so a
    // marker cached under w3600 is never consulted under w86400.
    existsMock.mockImplementation(async (key: string) => key.endsWith(":w3600"))

    const result = await automationThrottleService.tryAcquire({
      ...SUBJECT,
      windowSeconds: 86_400,
    })

    expect(existsMock).toHaveBeenCalledWith(
      "throttle:defaultReply:0:ws-1:inbox-1:w86400",
    )
    expect(result.result).not.toBe("denied")
  })

  test("Redis fast-path errors fall through to Postgres (not bypassed)", async () => {
    existsMock.mockRejectedValueOnce(new Error("redis down"))

    const result = await automationThrottleService.tryAcquire({
      ...SUBJECT,
      windowSeconds: 3600,
    })

    expect(result.result).toBe("acquired")
    expect(claimAutomationThrottleMock).toHaveBeenCalled()
    expect(warnMock).toHaveBeenCalled()
  })

  test("Postgres errors fail open as 'bypassed' (never 'acquired')", async () => {
    claimAutomationThrottleMock.mockRejectedValueOnce(new Error("db down"))

    const result = await automationThrottleService.tryAcquire({
      ...SUBJECT,
      windowSeconds: 3600,
    })

    expect(result).toEqual({ result: "bypassed" })
    expect(errorMock).toHaveBeenCalled()
    expect(setNumberMock).not.toHaveBeenCalled()
  })

  test("a different throttleType/subjectId claims an independent fast-path key (isolation)", async () => {
    await automationThrottleService.tryAcquire({
      workspaceId: "ws-1",
      contactInboxId: "inbox-1",
      throttleType: "defaultReply",
      subjectId: "flow-9",
      windowSeconds: 3600,
    })

    expect(existsMock).toHaveBeenCalledWith(
      "throttle:defaultReply:flow-9:ws-1:inbox-1:w3600",
    )
  })
})

describe("automationThrottleService.release", () => {
  test("deletes the Postgres row by claimId and the Redis fast-path key", async () => {
    await automationThrottleService.release({
      ...SUBJECT,
      windowSeconds: 3600,
      claimId: "claim-1",
    })

    expect(releaseAutomationThrottleMock).toHaveBeenCalledWith({
      ...SUBJECT,
      windowSeconds: 3600,
      claimId: "claim-1",
    })
    expect(deleteMock).toHaveBeenCalledWith(
      "throttle:defaultReply:0:ws-1:inbox-1:w3600",
    )
  })

  test("never throws: on a Postgres release failure it skips the Redis delete (ownership unknown)", async () => {
    releaseAutomationThrottleMock.mockRejectedValueOnce(new Error("db down"))

    await expect(
      automationThrottleService.release({
        ...SUBJECT,
        windowSeconds: 3600,
        claimId: "claim-1",
      }),
    ).resolves.toBeUndefined()

    expect(deleteMock).not.toHaveBeenCalled()
    expect(warnMock).toHaveBeenCalled()
  })

  test("skips the Redis delete when the CAS removed no owned row (a newer claim owns it)", async () => {
    releaseAutomationThrottleMock.mockResolvedValueOnce(false)

    await automationThrottleService.release({
      ...SUBJECT,
      windowSeconds: 3600,
      claimId: "stale-claim",
    })

    expect(deleteMock).not.toHaveBeenCalled()
  })

  test("never throws: swallows a Redis delete failure (best-effort)", async () => {
    deleteMock.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      automationThrottleService.release({
        ...SUBJECT,
        windowSeconds: 3600,
        claimId: "claim-1",
      }),
    ).resolves.toBeUndefined()

    expect(deleteMock).toHaveBeenCalled()
    expect(warnMock).toHaveBeenCalled()
  })
})
