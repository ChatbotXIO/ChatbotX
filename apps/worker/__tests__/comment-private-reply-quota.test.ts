import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isBotMessageQuotaReached: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("../src/lib/is-bot-message-quota-reached", () => ({
  isBotMessageQuotaReached: mocks.isBotMessageQuotaReached,
}))
vi.mock("../src/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

const { isPrivateReplyQuotaReached, PRIVATE_REPLY_QUOTA_REACHED_ERROR } =
  await import(
    "../src/integration/handlers/comment-automation/private-reply-quota"
  )
const { resolvePrivateReplyBlockedReason } = await import(
  "../src/integration/handlers/comment-automation"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("isPrivateReplyQuotaReached", () => {
  test.each([
    true,
    false,
  ])("returns the owner's quota verdict (%s)", async (reached) => {
    mocks.isBotMessageQuotaReached.mockResolvedValue(reached)

    await expect(isPrivateReplyQuotaReached("workspace-1")).resolves.toBe(
      reached,
    )
    expect(mocks.isBotMessageQuotaReached).toHaveBeenCalledWith("workspace-1")
  })

  test("fails open when the quota lookup throws", async () => {
    mocks.isBotMessageQuotaReached.mockRejectedValue(new Error("redis down"))

    await expect(isPrivateReplyQuotaReached("workspace-1")).resolves.toBe(false)
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.any(String),
    )
  })
})

describe("resolvePrivateReplyBlockedReason bot message quota", () => {
  const base = {
    privateReply: { type: "text" as const, value: "hi" },
    privateReplyClaimed: false,
    channelType: "instagram" as const,
    createdTime: Math.floor(Date.now() / 1000),
    delay: 0,
  }

  test("blocks a private reply once the quota is reached", () => {
    expect(
      resolvePrivateReplyBlockedReason({
        ...base,
        botMessageQuotaReached: true,
      }),
    ).toEqual({
      logReason: "bot message quota reached",
      errorDetail: PRIVATE_REPLY_QUOTA_REACHED_ERROR,
    })
  })

  test("lets a private reply through below the quota", () => {
    expect(
      resolvePrivateReplyBlockedReason({
        ...base,
        botMessageQuotaReached: false,
      }),
    ).toBeNull()
  })

  test("reports the channel's own rule first when both apply", () => {
    expect(
      resolvePrivateReplyBlockedReason({
        ...base,
        privateReplyClaimed: true,
        botMessageQuotaReached: true,
      })?.logReason,
    ).toBe("private reply already claimed for this comment")
  })
})
