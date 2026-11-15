import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockStoreGet,
  mockStorePut,
  mockFindStoredCaption,
  mockTiktokGetPostDetails,
  mockTiktokCanListVideos,
  mockThreadsRunAction,
  mockRunChannelHandler,
  mockResolveIntegrationContext,
} = vi.hoisted(() => ({
  mockStoreGet: vi.fn(),
  mockStorePut: vi.fn(),
  mockFindStoredCaption: vi.fn(),
  mockTiktokGetPostDetails: vi.fn(),
  mockTiktokCanListVideos: vi.fn(),
  mockThreadsRunAction: vi.fn(),
  mockRunChannelHandler: vi.fn(),
  mockResolveIntegrationContext: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn().mockResolvedValue({ ctx: true }),
  channelPostService: { findStoredCaption: mockFindStoredCaption },
  tiktokIntegrationService: { getPostDetails: mockTiktokGetPostDetails },
}))

vi.mock("@chatbotx.io/integration-tiktok", () => ({
  tiktokCanListVideos: mockTiktokCanListVideos,
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: { get: mockStoreGet, put: mockStorePut },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: { threads: { runAction: mockThreadsRunAction } },
  resolveIntegrationContextFromContactInbox: mockResolveIntegrationContext,
}))

import {
  createPostCaptionResolver,
  POST_CAPTION_CACHE_TTL_SECONDS,
  POST_CAPTION_UNAVAILABLE_TTL_SECONDS,
  postCaptionCacheKey,
} from "../src/integration/handlers/comment-automation/post-caption"

const integrationRow = {
  id: "integration-1",
  inboxId: "inbox-1",
  auth: { tokens: { accessToken: "token" } },
} as never

const resolverFor = (
  channelType: "messenger" | "instagramFacebook" | "threads" | "tiktok",
) =>
  createPostCaptionResolver({
    channelType,
    workspaceId: "workspace-1",
    postId: "post-1",
    integrationRow,
  })

beforeEach(() => {
  vi.clearAllMocks()
  mockStoreGet.mockResolvedValue(null)
  mockStorePut.mockResolvedValue(undefined)
  mockFindStoredCaption.mockResolvedValue(null)
  mockResolveIntegrationContext.mockResolvedValue({
    integration: { runChannelHandler: mockRunChannelHandler },
    ctx: { ctx: true },
  })
})

describe("createPostCaptionResolver", () => {
  test("returns a cached caption without calling the channel", async () => {
    mockStoreGet.mockResolvedValue({ caption: "#vip" })

    expect(await resolverFor("messenger")()).toBe("#vip")
    expect(mockRunChannelHandler).not.toHaveBeenCalled()
  })

  test("remembers a cached 'unavailable' as null", async () => {
    mockStoreGet.mockResolvedValue({ caption: null })

    expect(await resolverFor("messenger")()).toBeNull()
    expect(mockRunChannelHandler).not.toHaveBeenCalled()
  })

  test("fetches a Meta caption through the inbox channel and caches it for 10 minutes", async () => {
    mockRunChannelHandler.mockResolvedValue({ caption: "Sale #vip" })

    expect(await resolverFor("instagramFacebook")()).toBe("Sale #vip")
    expect(mockResolveIntegrationContext).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactInbox: { channel: "instagram", inboxId: "inbox-1" },
    })
    expect(mockRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getPostDetails",
      { ctx: { ctx: true }, data: { postId: "post-1" } },
    )
    expect(mockStorePut).toHaveBeenCalledWith(
      postCaptionCacheKey("integration-1", "post-1"),
      { caption: "Sale #vip" },
      POST_CAPTION_CACHE_TTL_SECONDS,
    )
  })

  test("a post without a caption answers an empty string, not null", async () => {
    mockRunChannelHandler.mockResolvedValue({})

    expect(await resolverFor("messenger")()).toBe("")
  })

  test("reads Threads post text", async () => {
    mockThreadsRunAction.mockResolvedValue({ id: "post-1", text: "#vip" })

    expect(await resolverFor("threads")()).toBe("#vip")
    expect(mockThreadsRunAction).toHaveBeenCalledWith(
      "getPostDetails",
      expect.objectContaining({ input: { postId: "post-1" } }),
    )
  })

  test("a TikTok connection without video.list cannot read captions", async () => {
    mockTiktokCanListVideos.mockReturnValue(false)

    expect(await resolverFor("tiktok")()).toBeNull()
    expect(mockTiktokGetPostDetails).not.toHaveBeenCalled()
    expect(mockStorePut).toHaveBeenCalledWith(
      expect.any(String),
      { caption: null },
      POST_CAPTION_UNAVAILABLE_TTL_SECONDS,
    )
  })

  test("a degraded TikTok answer is unavailable, not an empty caption", async () => {
    mockTiktokCanListVideos.mockReturnValue(true)
    mockTiktokGetPostDetails.mockResolvedValue({ degraded: true })

    expect(await resolverFor("tiktok")()).toBeNull()
  })

  test("reads a TikTok caption when the scope is granted", async () => {
    mockTiktokCanListVideos.mockReturnValue(true)
    mockTiktokGetPostDetails.mockResolvedValue({ text: "#vip deal" })

    expect(await resolverFor("tiktok")()).toBe("#vip deal")
    expect(mockTiktokGetPostDetails).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      postId: "post-1",
    })
  })

  test("falls back to the stored caption when the channel call fails", async () => {
    mockRunChannelHandler.mockRejectedValue(new Error("Graph down"))
    mockFindStoredCaption.mockResolvedValue("stored #vip")

    expect(await resolverFor("messenger")()).toBe("stored #vip")
    expect(mockFindStoredCaption).toHaveBeenCalledWith({
      channel: "messenger",
      externalPostId: "post-1",
      workspaceId: "workspace-1",
    })
  })

  test("is unavailable when both the channel and the stored caption fail", async () => {
    mockRunChannelHandler.mockRejectedValue(new Error("Graph down"))

    expect(await resolverFor("messenger")()).toBeNull()
  })

  test("a broken cache never blocks the lookup", async () => {
    mockStoreGet.mockRejectedValue(new Error("redis down"))
    mockStorePut.mockRejectedValue(new Error("redis down"))
    mockRunChannelHandler.mockResolvedValue({ caption: "#vip" })

    expect(await resolverFor("messenger")()).toBe("#vip")
  })

  test("looks the caption up once per resolver", async () => {
    mockRunChannelHandler.mockResolvedValue({ caption: "#vip" })
    const load = resolverFor("messenger")

    await Promise.all([load(), load(), load()])

    expect(mockRunChannelHandler).toHaveBeenCalledTimes(1)
  })
})
