import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  findById: vi.fn(),
  markManualCheck: vi.fn(),
}))

const tx = { kind: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    // A thrown error rolls the transaction back, as the real one does.
    transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      await run(tx),
  },
  isUniqueViolationError: vi.fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  socialPostFeedRepository: {
    findById: mocks.findById,
    markManualCheck: mocks.markManualCheck,
  },
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
  socialPostFeedRunner: { enqueue: mocks.enqueue },
}))

const { socialPostFeedService } = await import(
  "../src/social-post-feed/service"
)

const input = { id: "feed-1", workspaceId: "ws-1" }

describe("socialPostFeedService.checkNow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findById.mockResolvedValue({ ...input, status: "active" })
    mocks.markManualCheck.mockResolvedValue(true)
    mocks.enqueue.mockResolvedValue(true)
    vi.spyOn(socialPostFeedService, "get").mockResolvedValue({
      id: input.id,
    } as never)
  })

  test("takes the cool-down and queues the check in one transaction", async () => {
    await socialPostFeedService.checkNow(input)

    expect(mocks.markManualCheck).toHaveBeenCalledWith(
      expect.objectContaining(input),
      tx,
    )
    expect(mocks.enqueue).toHaveBeenCalledWith("feed-1", "ws-1")
  })

  test("surfaces a refused enqueue instead of reporting success", async () => {
    mocks.enqueue.mockRejectedValue(new Error("redis down"))

    await expect(socialPostFeedService.checkNow(input)).rejects.toThrow(
      "redis down",
    )
    expect(socialPostFeedService.get).not.toHaveBeenCalled()
  })

  test("a check that is already waiting or running is a conflict that rolls the cool-down back", async () => {
    mocks.enqueue.mockResolvedValue(false)

    await expect(socialPostFeedService.checkNow(input)).rejects.toMatchObject({
      code: "feedCheckInProgress",
      httpStatusCode: 409,
    })
    expect(socialPostFeedService.get).not.toHaveBeenCalled()
  })

  test("queues nothing inside the cool-down", async () => {
    mocks.markManualCheck.mockResolvedValue(false)

    await expect(socialPostFeedService.checkNow(input)).rejects.toMatchObject({
      code: "feedCheckCooldown",
    })
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })
})
