import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockFindInstagramIntegrationsByWorkspaceId, mockListInstagramMedia } =
  vi.hoisted(() => ({
    mockFindInstagramIntegrationsByWorkspaceId: vi.fn(),
    mockListInstagramMedia: vi.fn(),
  }))

vi.mock("@chatbotx.io/business", () => ({
  findInstagramIntegrationsByWorkspaceId:
    mockFindInstagramIntegrationsByWorkspaceId,
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  listInstagramMedia: mockListInstagramMedia,
}))

const { listInstagramAutomationMedia } = await import(
  "@/features/fb-comments/queries/instagram-posts"
)
const { splitInstagramMediaPosts } = await import(
  "@/features/fb-comments/provider/fb-comment-posts-store"
)

describe("listInstagramAutomationMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindInstagramIntegrationsByWorkspaceId.mockResolvedValue([
      {
        id: "instagram-login",
        auth: { tokens: { accessToken: "instagram-token" } },
      },
    ])
    mockListInstagramMedia.mockResolvedValue([
      {
        id: "ig-post-id",
        caption: "Post",
        timestamp: "2026-07-16T00:00:00Z",
        media_product_type: "FEED",
      },
      {
        id: "ig-reel-id",
        caption: "Reel",
        timestamp: "2026-07-16T01:00:00Z",
        media_product_type: "REELS",
      },
    ])
  })

  test("keeps workspace scoping and lists media for each Instagram Login integration", async () => {
    const result = await listInstagramAutomationMedia("workspace-1")

    expect(mockFindInstagramIntegrationsByWorkspaceId).toHaveBeenCalledWith(
      "workspace-1",
    )
    expect(mockListInstagramMedia).toHaveBeenCalledWith({
      auth: expect.objectContaining({
        tokens: { accessToken: "instagram-token" },
      }),
    })
    expect(result.posts).toEqual([
      expect.objectContaining({
        id: "ig-post-id",
        media_product_type: "FEED",
      }),
      expect.objectContaining({
        id: "ig-reel-id",
        media_product_type: "REELS",
      }),
    ])
  })
})

describe("splitInstagramMediaPosts", () => {
  test("puts REELS in the Reels tab and missing product types in published posts", () => {
    const result = splitInstagramMediaPosts([
      { id: "feed", created_time: "2026-07-16", media_product_type: "FEED" },
      {
        id: "reel",
        created_time: "2026-07-16",
        media_product_type: "REELS",
      },
      { id: "legacy", created_time: "2026-07-16" },
    ])

    expect(result.published.map((post) => post.id)).toEqual(["feed", "legacy"])
    expect(result.reels.map((post) => post.id)).toEqual(["reel"])
  })
})
