import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findOrFail: vi.fn(),
  findTiktokVideo: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { integrationTiktokModel: { findFirst: vi.fn() } },
    transaction: vi.fn(),
  },
  and: (...conditions: unknown[]) => ({ and: conditions }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  inArray: (column: unknown, values: unknown) => ({
    inArray: [column, values],
  }),
  findOrFail: mocks.findOrFail,
}))

vi.mock("@chatbotx.io/integration-tiktok", async (importOriginal) => ({
  // `buildTiktokVideoUrl` and `tiktokCanListVideos` are pure — the point of
  // these tests is that the service reads the real scope list, so only the
  // network call is replaced.
  ...(await importOriginal<typeof import("@chatbotx.io/integration-tiktok")>()),
  findTiktokVideo: mocks.findTiktokVideo,
}))

vi.mock("../src/logger", () => ({
  logger: { warn: mocks.loggerWarn, error: vi.fn(), info: vi.fn() },
}))

const { tiktokIntegrationService } = await import(
  "../src/integration-tiktok/service"
)

const integrationRow = (scopes: string[]) => ({
  id: "int_1",
  inboxId: "inbox_1",
  workspaceId: "1",
  openId: "open_1",
  name: "Acme Studio",
  auth: {
    tokens: { accessToken: "token_1" },
    metadata: {
      openId: "open_1",
      username: "acme.studio",
      displayName: "Acme Studio",
      scopes,
    },
  },
})

const DERIVED_LINK = "https://www.tiktok.com/@acme.studio/video/7123"

describe("tiktokIntegrationService.getPostDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("refuses an inbox with no TikTok connection", async () => {
    mocks.findOrFail.mockRejectedValue(
      new Error("Integration TikTok not found"),
    )

    await expect(
      tiktokIntegrationService.getPostDetails({
        workspaceId: "1",
        inboxId: "inbox_1",
        postId: "7123",
      }),
    ).rejects.toThrow("Integration TikTok not found")
  })

  // The inbox id is not a secret — it rides in the conversation payload — so
  // the workspace has to be part of the lookup, not just of the caller's
  // permission check. Without it, workspace A reads B's caption, thumbnail and
  // share url by passing B's inbox id to its own token.
  test("scopes the lookup by workspace, not by inbox id alone", async () => {
    mocks.findOrFail.mockResolvedValue(integrationRow(["video.list"]))

    await tiktokIntegrationService.getPostDetails({
      workspaceId: "1",
      inboxId: "inbox_1",
      postId: "7123",
    })

    expect(mocks.findOrFail).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inboxId: "inbox_1", workspaceId: "1" },
      }),
    )
  })

  // The population that matters in production for a while yet: every account
  // that authorized before `video.list` was approved. The card still has to
  // name the author and link the video, and it must not spend a request to
  // find out the scope is missing.
  test("derives the link without calling the API when video.list was not granted", async () => {
    mocks.findOrFail.mockResolvedValue(
      integrationRow(["comment.list", "comment.list.manage"]),
    )

    const details = await tiktokIntegrationService.getPostDetails({
      workspaceId: "1",
      inboxId: "inbox_1",
      postId: "7123",
    })

    expect(mocks.findTiktokVideo).not.toHaveBeenCalled()
    expect(details).toEqual({
      from: { id: "open_1", name: "Acme Studio" },
      link: DERIVED_LINK,
    })
  })

  test("uses the real caption, thumbnail and share url once video.list is granted", async () => {
    mocks.findOrFail.mockResolvedValue(
      integrationRow(["comment.list", "video.list"]),
    )
    mocks.findTiktokVideo.mockResolvedValue({
      item_id: "7123",
      caption: "New drop",
      thumbnail_url: "https://cdn.tiktok.com/thumb.jpg",
      share_url: `${DERIVED_LINK}?share=1`,
      create_time: 1_700_000_000,
    })

    const details = await tiktokIntegrationService.getPostDetails({
      workspaceId: "1",
      inboxId: "inbox_1",
      postId: "7123",
    })

    expect(mocks.findTiktokVideo).toHaveBeenCalledWith("token_1", {
      businessId: "open_1",
      videoId: "7123",
    })
    expect(details).toEqual({
      text: "New drop",
      picture: "https://cdn.tiktok.com/thumb.jpg",
      from: { id: "open_1", name: "Acme Studio" },
      createdAt: new Date(1_700_000_000 * 1000).toISOString(),
      link: `${DERIVED_LINK}?share=1`,
    })
  })

  test("keeps the account name and derived link when the video is gone", async () => {
    mocks.findOrFail.mockResolvedValue(integrationRow(["video.list"]))
    mocks.findTiktokVideo.mockResolvedValue(null)

    await expect(
      tiktokIntegrationService.getPostDetails({
        workspaceId: "1",
        inboxId: "inbox_1",
        postId: "7123",
      }),
    ).resolves.toEqual({
      from: { id: "open_1", name: "Acme Studio" },
      link: DERIVED_LINK,
      degraded: true,
    })
  })

  // The caller caches this, so it has to be able to tell a state that will
  // answer identically all day from one worth re-asking about shortly. A
  // missing scope is the former: only re-authorizing changes it.
  test("a missing scope is not degraded — only a failed call is", async () => {
    mocks.findOrFail.mockResolvedValue(integrationRow(["comment.list"]))

    const stable = await tiktokIntegrationService.getPostDetails({
      workspaceId: "1",
      inboxId: "inbox_1",
      postId: "7123",
    })

    expect(stable.degraded).toBeUndefined()

    mocks.findOrFail.mockResolvedValue(integrationRow(["video.list"]))
    mocks.findTiktokVideo.mockRejectedValue(new Error("timeout"))

    const transient = await tiktokIntegrationService.getPostDetails({
      workspaceId: "1",
      inboxId: "inbox_1",
      postId: "7123",
    })

    expect(transient.degraded).toBe(true)
  })

  // A revoked token or a TikTok outage must cost the caption, never the
  // conversation — and it is logged as a warning, not an error.
  test("falls back to the derived link when the lookup throws", async () => {
    mocks.findOrFail.mockResolvedValue(integrationRow(["video.list"]))
    mocks.findTiktokVideo.mockRejectedValue(new Error("scope revoked"))

    const details = await tiktokIntegrationService.getPostDetails({
      workspaceId: "1",
      inboxId: "inbox_1",
      postId: "7123",
    })

    expect(details).toEqual({
      from: { id: "open_1", name: "Acme Studio" },
      link: DERIVED_LINK,
      degraded: true,
    })
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })
})
