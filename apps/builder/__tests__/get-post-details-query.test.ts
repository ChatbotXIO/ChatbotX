import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getTiktokPostDetails: vi.fn(),
  findMessengerByInboxIdForWorkspace: vi.fn(),
  findInstagramByInboxIdForWorkspace: vi.fn(),
  findThreadsByInboxIdForWorkspace: vi.fn(),
  cacheKeys: [] as string[],
  cacheOptions: [] as Record<string, unknown>[],
}))

vi.mock("@chatbotx.io/redis", () => ({
  // The cache is transparent here: every test wants the resolver to run. The
  // key and options are recorded because workspace isolation and the degraded
  // TTL both live in them.
  withCache: async (
    key: string,
    resolver: () => Promise<unknown>,
    options?: Record<string, unknown>,
  ) => {
    mocks.cacheKeys.push(key)
    mocks.cacheOptions.push(options ?? {})
    return await resolver()
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(),
  instagramIntegrationService: {
    findByInboxIdForWorkspace: mocks.findInstagramByInboxIdForWorkspace,
  },
  integrationThreadsService: {
    findByInboxIdForWorkspace: mocks.findThreadsByInboxIdForWorkspace,
  },
  messengerIntegrationService: {
    findByInboxIdForWorkspace: mocks.findMessengerByInboxIdForWorkspace,
  },
  tiktokIntegrationService: { getPostDetails: mocks.getTiktokPostDetails },
  tiktokPostDetailsCacheTag: (inboxId: string) =>
    `tiktok-post-details:${inboxId}`,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@/integration", () => ({ integrations: {} }))

const { getPostDetailsQuery } = await import(
  "@/features/conversations/queries/get-post-details.query"
)

const UNSUPPORTED_CHANNEL_MESSAGE = /whatsapp/

describe("getPostDetailsQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cacheKeys = []
    mocks.cacheOptions = []
  })

  // Before the guard existed, an unlisted channel fell through to the Messenger
  // branch and asked the Graph API about an id it had never issued — a failure
  // the caller swallowed, so the card just stayed blank.
  test("rejects a channel that has no post concept instead of asking Messenger", async () => {
    await expect(
      getPostDetailsQuery({
        workspaceId: "1",
        inboxId: "inbox_1",
        postId: "7123",
        channel: "whatsapp",
      }),
    ).rejects.toThrow(UNSUPPORTED_CHANNEL_MESSAGE)
    expect(mocks.findMessengerByInboxIdForWorkspace).not.toHaveBeenCalled()
  })

  test("routes a TikTok comment conversation to the TikTok service", async () => {
    const resolved = {
      from: { id: "open_1", name: "Acme Studio" },
      link: "https://www.tiktok.com/@acme.studio/video/7123",
    }
    mocks.getTiktokPostDetails.mockResolvedValue(resolved)

    await expect(
      getPostDetailsQuery({
        workspaceId: "1",
        inboxId: "inbox_1",
        postId: "7123",
        channel: "tiktok",
      }),
    ).resolves.toEqual(resolved)
    expect(mocks.getTiktokPostDetails).toHaveBeenCalledWith({
      workspaceId: "1",
      inboxId: "inbox_1",
      postId: "7123",
    })
    expect(mocks.findMessengerByInboxIdForWorkspace).not.toHaveBeenCalled()
  })

  // The handler only checks that the caller belongs to `workspaceId`; the inbox
  // id comes straight from client input. Every branch therefore has to resolve
  // its integration by BOTH, or one workspace reads another's post by passing
  // its inbox id.
  test.each([
    ["tiktok", () => mocks.getTiktokPostDetails],
    ["instagram", () => mocks.findInstagramByInboxIdForWorkspace],
    ["threads", () => mocks.findThreadsByInboxIdForWorkspace],
    ["messenger", () => mocks.findMessengerByInboxIdForWorkspace],
  ] as const)("scopes the %s lookup by workspace", async (channel, getMock) => {
    // Every branch throws downstream of the lookup once the integration row is
    // absent; the assertion is about what the lookup was asked for.
    await getPostDetailsQuery({
      workspaceId: "1",
      inboxId: "inbox_2",
      postId: "7123",
      channel,
    }).catch(() => undefined)

    expect(getMock()).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "1", inboxId: "inbox_2" }),
    )
  })

  // A single cross-workspace read must not outlive the request that made it:
  // an unscoped key would keep serving workspace B's post to workspace A for a
  // full day after the lookup itself was fixed.
  test("keys the cache by workspace", async () => {
    mocks.getTiktokPostDetails.mockResolvedValue({
      from: { id: "open_1", name: "Acme Studio" },
    })

    await getPostDetailsQuery({
      workspaceId: "42",
      inboxId: "inbox_1",
      postId: "7123",
      channel: "tiktok",
    })

    expect(mocks.cacheKeys).toEqual(["post-details:42:inbox_1:7123"])
  })

  // A transient TikTok failure used to pin a caption-less, thumbnail-less post
  // card for the full 24 hours. A connection that simply lacks `video.list` is
  // NOT degraded — it answers identically until its owner re-authorizes, and
  // that re-authorization drops these entries by tag instead.
  describe("degraded results get a short TTL", () => {
    const ttlFor = () =>
      mocks.cacheOptions[0]?.ttlFor as (r: unknown) => number | undefined

    test("a transient failure caches for five minutes", async () => {
      mocks.getTiktokPostDetails.mockResolvedValue({
        from: { id: "open_1", name: "Acme Studio" },
        degraded: true,
      })

      const result = await getPostDetailsQuery({
        workspaceId: "1",
        inboxId: "inbox_1",
        postId: "7123",
        channel: "tiktok",
      })

      expect(ttlFor()({ degraded: true })).toBe(300)
      // The hint picks the TTL; it is not part of what the client receives.
      expect(result).not.toHaveProperty("degraded")
    })

    test("a stable result keeps the default TTL", async () => {
      mocks.getTiktokPostDetails.mockResolvedValue({
        from: { id: "open_1", name: "Acme Studio" },
      })

      await getPostDetailsQuery({
        workspaceId: "1",
        inboxId: "inbox_1",
        postId: "7123",
        channel: "tiktok",
      })

      expect(ttlFor()({})).toBeUndefined()
      expect(mocks.cacheOptions[0]?.ttl).toBe(60 * 60 * 24)
    })

    test("tags the entry so re-authorizing can drop it", async () => {
      mocks.getTiktokPostDetails.mockResolvedValue({
        from: { id: "open_1", name: "Acme Studio" },
      })

      await getPostDetailsQuery({
        workspaceId: "1",
        inboxId: "inbox_1",
        postId: "7123",
        channel: "tiktok",
      })

      expect(mocks.cacheOptions[0]?.tags).toEqual([
        "tiktok-post-details:inbox_1",
      ])
    })

    // A tag costs an extra SADD and EXPIRE on every cache write, and only
    // TikTok has anything that invalidates one.
    test("does not tag entries on the channels that never invalidate", async () => {
      await getPostDetailsQuery({
        workspaceId: "1",
        inboxId: "inbox_1",
        postId: "7123",
        channel: "messenger",
      }).catch(() => undefined)

      expect(mocks.cacheOptions[0]?.tags).toEqual([])
    })
  })
})
