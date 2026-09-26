import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockMessengerRunAction, mockThreadsRunAction } = vi.hoisted(() => ({
  mockMessengerRunAction: vi.fn(),
  mockThreadsRunAction: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn().mockResolvedValue({}),
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: {
    messenger: { runAction: mockMessengerRunAction },
    threads: { runAction: mockThreadsRunAction },
  },
}))

const { createAttachmentInfoResolver, needsAttachmentInfo } = await import(
  "../src/integration/handlers/comment-automation/comment-attachment"
)

const baseHide = {
  all: false,
  hasPhoneNumber: false,
  hasImage: false,
  hasVideo: false,
  hasLink: false,
  hasKeywords: false,
  keywords: [],
  showCommentsAfter: "none" as const,
}

function resolverFor(channelType: "messenger" | "threads" | "instagram") {
  return createAttachmentInfoResolver({
    channelType,
    workspaceId: "workspace-1",
    commentId: "comment-1",
    integrationRow: { id: "integration-1", auth: {} as never, inboxId: "i" },
    auth: {} as never,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("needsAttachmentInfo", () => {
  test("asks for the lookup when only hasGif is on", () => {
    expect(needsAttachmentInfo({ ...baseHide, hasGif: true })).toBe(true)
  })

  test("skips it for a legacy row with no hasGif key", () => {
    expect(needsAttachmentInfo(baseHide)).toBe(false)
  })
})

describe("createAttachmentInfoResolver", () => {
  test.each([
    "animated_image_share",
    "animated_image_video",
    "animated_image_autoplay",
  ])("reads Facebook %s as a GIF", async (type) => {
    mockMessengerRunAction.mockResolvedValue(type)
    await expect(resolverFor("messenger")()).resolves.toEqual({
      hasImage: false,
      hasVideo: false,
      hasGif: true,
    })
  })

  test("keeps a Facebook photo an image, not a GIF", async () => {
    mockMessengerRunAction.mockResolvedValue("photo")
    await expect(resolverFor("messenger")()).resolves.toEqual({
      hasImage: true,
      hasVideo: false,
      hasGif: false,
    })
  })

  test("reads a Threads reply's gif_url", async () => {
    mockThreadsRunAction.mockResolvedValue("https://media.giphy.com/x.gif")
    await expect(resolverFor("threads")()).resolves.toEqual({
      hasImage: false,
      hasVideo: false,
      hasGif: true,
    })
    expect(mockThreadsRunAction).toHaveBeenCalledWith("getReplyGifUrl", {
      ctx: {},
      input: { replyId: "comment-1" },
    })
  })

  test("treats a failed Threads lookup as no GIF", async () => {
    mockThreadsRunAction.mockRejectedValue(new Error("boom"))
    await expect(resolverFor("threads")()).resolves.toMatchObject({
      hasGif: false,
    })
  })

  test("never calls out for Instagram", async () => {
    await expect(resolverFor("instagram")()).resolves.toEqual({
      hasImage: false,
      hasVideo: false,
      hasGif: false,
    })
    expect(mockMessengerRunAction).not.toHaveBeenCalled()
    expect(mockThreadsRunAction).not.toHaveBeenCalled()
  })
})
