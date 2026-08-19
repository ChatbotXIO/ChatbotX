import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// defaultReplyThrottleService — thin default-reply-facing facade over the
// generic automationThrottleService (docs/plans/default-reply-throttle-hybrid.md).
// Verifies: the frequency->window map (`allTime` -> 0, the unbounded
// record-and-allow window), delegation to the generic service with the fixed
// throttleType/subjectId pinned by the wrapper, and `release` threading both
// `frequency` and `claimId` through so the generic service can reconstruct its
// fast-path key.
// ---------------------------------------------------------------------------

const tryAcquireMock = vi.fn()
const releaseMock = vi.fn(async () => undefined)
vi.mock("../src/automation-throttle", () => ({
  automationThrottleService: {
    tryAcquire: tryAcquireMock,
    release: releaseMock,
  },
}))

const { defaultReplyThrottleService, DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS } =
  await import("../src/default-reply/throttle")

const WORKSPACE_ID = "ws-1"
const CONTACT_INBOX_ID = "contact-inbox-1"

beforeEach(() => {
  vi.clearAllMocks()
  tryAcquireMock.mockResolvedValue({
    result: "acquired",
    claimId: "claim-1",
    remainingSeconds: 3600,
  })
})

describe("DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS", () => {
  test.each([
    ["allTime", 0],
    ["oncePerHour", 3600],
    ["oncePerDay", 86_400],
  ] as const)("%s maps to %s seconds", (frequency, expected) => {
    expect(DEFAULT_REPLY_FREQUENCY_WINDOW_SECONDS[frequency]).toBe(expected)
  })
})

describe("defaultReplyThrottleService.tryAcquire", () => {
  test("allTime delegates with windowSeconds 0 (record-and-allow, matching v1's EVERY_TIME)", async () => {
    await defaultReplyThrottleService.tryAcquire({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
      frequency: "allTime",
    })

    expect(tryAcquireMock).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
      throttleType: "defaultReply",
      subjectId: "0",
      windowSeconds: 0,
    })
  })

  test.each([
    ["oncePerHour", 3600],
    ["oncePerDay", 86_400],
  ] as const)("%s delegates to the generic service pinned to throttleType 'defaultReply' and subjectId '0'", async (frequency, windowSeconds) => {
    await defaultReplyThrottleService.tryAcquire({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
      frequency,
    })

    expect(tryAcquireMock).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
      throttleType: "defaultReply",
      subjectId: "0",
      windowSeconds,
    })
  })

  test("returns whatever the generic service reports (denied)", async () => {
    tryAcquireMock.mockResolvedValueOnce({ result: "denied" })

    const claim = await defaultReplyThrottleService.tryAcquire({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
      frequency: "oncePerHour",
    })

    expect(claim).toEqual({ result: "denied" })
  })
})

describe("defaultReplyThrottleService.release", () => {
  test("threads frequency (as windowSeconds) and claimId into the generic release", async () => {
    await defaultReplyThrottleService.release({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
      frequency: "oncePerDay",
      claimId: "claim-1",
    })

    expect(releaseMock).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
      throttleType: "defaultReply",
      subjectId: "0",
      windowSeconds: 86_400,
      claimId: "claim-1",
    })
  })

  test("allTime release delegates with windowSeconds 0 (rolls back the recorded trigger)", async () => {
    await defaultReplyThrottleService.release({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
      frequency: "allTime",
      claimId: "claim-1",
    })

    expect(releaseMock).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      contactInboxId: CONTACT_INBOX_ID,
      throttleType: "defaultReply",
      subjectId: "0",
      windowSeconds: 0,
      claimId: "claim-1",
    })
  })
})
