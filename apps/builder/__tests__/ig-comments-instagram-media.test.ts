import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindInstagramIntegrationsByWorkspaceId,
  mockListInstagramLoginMedia,
  mockListInstagramFacebookMedia,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockFindInstagramIntegrationsByWorkspaceId: vi.fn(),
  mockListInstagramLoginMedia: vi.fn(),
  mockListInstagramFacebookMedia: vi.fn(),
  mockLoggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  instagramIntegrationService: {
    findByWorkspaceId: mockFindInstagramIntegrationsByWorkspaceId,
  },
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  listInstagramMedia: mockListInstagramLoginMedia,
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  listInstagramMedia: mockListInstagramFacebookMedia,
}))

vi.mock("@/lib/log", () => ({
  logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() },
}))

const { listInstagramLoginMedia, listInstagramFacebookMedia } = await import(
  "@/features/ig-comments/queries/instagram-media"
)

function buildMedia(id: string, productType: string) {
  return {
    id,
    caption: `caption-${id}`,
    timestamp: "2026-07-16T00:00:00Z",
    media_product_type: productType,
  }
}

describe("listInstagramLoginMedia / listInstagramFacebookMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("merges media from every connected account (2 accounts: 2 + 3 posts -> 5 posts)", async () => {
    mockFindInstagramIntegrationsByWorkspaceId.mockResolvedValue([
      {
        id: "integration-a",
        igId: "ig-account-a",
        name: "Account A",
        auth: { tokens: { accessToken: "token-a" } },
      },
      {
        id: "integration-b",
        igId: "ig-account-b",
        name: "Account B",
        auth: { tokens: { accessToken: "token-b" } },
      },
    ])
    mockListInstagramLoginMedia.mockImplementation(({ auth }) => {
      if (auth.tokens.accessToken === "token-a") {
        return [buildMedia("a-1", "FEED"), buildMedia("a-2", "FEED")]
      }
      return [
        buildMedia("b-1", "FEED"),
        buildMedia("b-2", "REELS"),
        buildMedia("b-3", "FEED"),
      ]
    })

    const result = await listInstagramLoginMedia("workspace-1")

    expect(mockFindInstagramIntegrationsByWorkspaceId).toHaveBeenCalledWith(
      "workspace-1",
      "instagram",
    )
    expect(result.posts).toHaveLength(5)
    expect(result.posts.map((post) => post.id).sort()).toEqual(
      ["a-1", "a-2", "b-1", "b-2", "b-3"].sort(),
    )
  })

  test("lists every connected account in `pages`, even one with zero posts", async () => {
    mockFindInstagramIntegrationsByWorkspaceId.mockResolvedValue([
      {
        id: "integration-a",
        igId: "ig-account-a",
        name: "Account A",
        auth: { tokens: { accessToken: "token-a" } },
      },
      {
        id: "integration-b",
        igId: "ig-account-b",
        name: "Account B",
        auth: { tokens: { accessToken: "token-b" } },
      },
    ])
    mockListInstagramFacebookMedia.mockImplementation(({ auth }) =>
      auth.tokens.accessToken === "token-a" ? [buildMedia("a-1", "FEED")] : [],
    )

    const result = await listInstagramFacebookMedia("workspace-1")

    expect(result.pages).toEqual([
      { id: "ig-account-a", name: "Account A" },
      { id: "ig-account-b", name: "Account B" },
    ])
    expect(result.posts).toEqual([
      expect.objectContaining({ id: "a-1", accountId: "ig-account-a" }),
    ])
  })

  test("logs (does not silently swallow) a failure fetching one account's media, while still returning the others", async () => {
    mockFindInstagramIntegrationsByWorkspaceId.mockResolvedValue([
      {
        id: "integration-a",
        igId: "ig-account-a",
        name: "Account A",
        auth: { tokens: { accessToken: "token-a" } },
      },
      {
        id: "integration-b",
        igId: "ig-account-b",
        name: "Account B",
        auth: { tokens: { accessToken: "token-b" } },
      },
    ])
    mockListInstagramLoginMedia.mockImplementation(({ auth }) => {
      if (auth.tokens.accessToken === "token-a") {
        throw new Error("token expired")
      }
      return [buildMedia("b-1", "FEED")]
    })

    const result = await listInstagramLoginMedia("workspace-1")

    expect(result.posts).toEqual([expect.objectContaining({ id: "b-1" })])
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: "integration-a" }),
      expect.stringContaining("Failed to list Instagram media"),
    )
  })
})
