import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ deleteMany: vi.fn() }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  isUniqueViolationError: vi.fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  socialPostFeedRepository: { deleteMany: mocks.deleteMany },
  socialPostRepository: {},
  socialPostSnippetRepository: {},
}))
vi.mock("@chatbotx.io/redis", () => ({ distributedStore: {} }))
vi.mock("../src/media-library-file/service", () => ({
  mediaLibraryFileService: { findById: vi.fn() },
}))
vi.mock("../src/social-post-feed/feed-media", () => ({
  discardImportedFile: vi.fn(),
  ImageBudget: class {},
  pictureCandidates: vi.fn(() => []),
}))
vi.mock("../src/social-post-feed/feed-post", () => ({
  prepareFeedPost: vi.fn(),
}))
vi.mock("../src/net/ssrf-guard", () => ({ checkSsrfSafety: vi.fn() }))
vi.mock("../src/social-post/service", () => ({ socialPostService: {} }))
vi.mock("../src/social-post/notify", () => ({
  emitSocialPostChanged: vi.fn(),
}))
vi.mock("../src/social-post-feed/runner", () => ({
  socialPostFeedRunner: {},
}))

const { socialPostFeedService } = await import(
  "../src/social-post-feed/service"
)

describe("socialPostFeedService.deleteMany", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("deletes inside the workspace and reports ids that were not found", async () => {
    mocks.deleteMany.mockResolvedValue(["1", "3"])

    const result = await socialPostFeedService.deleteMany({
      ids: ["1", "2", "3"],
      workspaceId: "ws-1",
    })

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      ids: ["1", "2", "3"],
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ deletedIds: ["1", "3"], notFoundIds: ["2"] })
  })

  test("a feed of another workspace comes back as not found", async () => {
    mocks.deleteMany.mockResolvedValue([])

    const result = await socialPostFeedService.deleteMany({
      ids: ["9"],
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ deletedIds: [], notFoundIds: ["9"] })
  })

  test("drops duplicate ids before deleting", async () => {
    mocks.deleteMany.mockResolvedValue(["1"])

    const result = await socialPostFeedService.deleteMany({
      ids: ["1", "1"],
      workspaceId: "ws-1",
    })

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      ids: ["1"],
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ deletedIds: ["1"], notFoundIds: [] })
  })

  test("refuses an empty list and more than 100 ids without touching the database", async () => {
    await expect(
      socialPostFeedService.deleteMany({ ids: [], workspaceId: "ws-1" }),
    ).rejects.toThrow()
    await expect(
      socialPostFeedService.deleteMany({
        ids: Array.from({ length: 101 }, (_, index) => String(index + 1)),
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow()
    expect(mocks.deleteMany).not.toHaveBeenCalled()
  })
})
