import { beforeEach, describe, expect, test, vi } from "vitest"

const mockResolveForSend = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  channelPostShareService: { resolveForSend: mockResolveForSend },
}))

const { ChannelPostShareRefusedError } = await import(
  "@chatbotx.io/business/errors"
)
const { ChannelError, ChannelErrorCategory } = await import("@chatbotx.io/sdk")
const { assertChannelPostStillSendable } = await import(
  "../src/chat/utils/channel-post-send-check"
)

const contactInbox = { channel: "instagram", inboxId: "inbox-1" } as never
const card = {
  type: "channel_post",
  shareMode: "nativeMedia",
  channelPostId: "post-1",
  externalPostId: "ext-1",
  permalink: null,
  thumbnail: null,
  caption: null,
}

const check = (contentAttributes: Record<string, unknown> | null) =>
  assertChannelPostStillSendable({
    contentAttributes,
    contactInbox,
    workspaceId: "ws-1",
  })

describe("assertChannelPostStillSendable", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveForSend.mockResolvedValue({})
  })

  test("a message that is not a post share is not looked up", async () => {
    await check(null)
    await check({ type: "template" })

    expect(mockResolveForSend).not.toHaveBeenCalled()
  })

  test("re-checks the post against the inbox the send runs on", async () => {
    await check(card)

    expect(mockResolveForSend).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      channel: "instagram",
      channelPostId: "post-1",
    })
  })

  test.each([
    "channelPostNotFound",
    "channelPostInboxMismatch",
    "channelPostTypeNotShareable",
    "channelPostShareUnsupported",
    "channelPostLinkUnavailable",
    "channelPostLinkTooLong",
  ] as const)("a post that is now %s fails as a permanent, non-retryable payload error", async (reason) => {
    mockResolveForSend.mockRejectedValue(
      new ChannelPostShareRefusedError(reason),
    )

    const error = await check(card).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ChannelError)
    expect(error).toMatchObject({
      category: ChannelErrorCategory.PAYLOAD_INVALID,
      isRetryable: false,
      code: reason,
    })
  })

  test("an unexpected failure is not disguised as a refusal", async () => {
    mockResolveForSend.mockRejectedValue(new Error("db down"))

    await expect(check(card)).rejects.toThrow("db down")
  })
})
