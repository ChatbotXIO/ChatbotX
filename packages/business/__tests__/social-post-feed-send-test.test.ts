import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  fetcher: vi.fn(),
  findById: vi.fn(),
  findDestinations: vi.fn(),
  findItem: vi.fn(),
  incr: vi.fn(),
  insertItem: vi.fn(),
  insertItems: vi.fn(),
  listDestinations: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  isUniqueViolationError: vi.fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  socialPostFeedRepository: {
    findById: mocks.findById,
    findItem: mocks.findItem,
    insertItem: mocks.insertItem,
    insertItems: mocks.insertItems,
    findWorkspaceTimezone: vi.fn().mockResolvedValue("UTC"),
    listDestinations: mocks.listDestinations,
  },
  socialPostRepository: { findDestinations: mocks.findDestinations },
  socialPostSnippetRepository: { findById: vi.fn() },
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: { incrWithWindow: mocks.incr },
}))
vi.mock("../src/logger", () => ({ logger: { warn: vi.fn() } }))
vi.mock("../src/media-library-file/service", () => ({
  mediaLibraryFileService: { findById: vi.fn() },
}))
vi.mock("../src/social-post-feed/feed-media", () => ({
  acquireFeedMedia: vi.fn().mockResolvedValue({
    created: false,
    fileId: null,
    imageError: null,
    imageSource: null,
    imageUrl: null,
  }),
  discardImportedFile: vi.fn(),
  ImageBudget: class {},
  pictureCandidates: vi.fn(() => []),
}))
vi.mock("../src/net/ssrf-guard", () => ({
  checkSsrfSafety: vi.fn().mockResolvedValue({ unsafe: false }),
}))
vi.mock("../src/social-post-feed/runner", () => ({ socialPostFeedRunner: {} }))
vi.mock("../src/social-post/service", () => ({
  socialPostService: { create: mocks.create },
}))
vi.mock("../src/social-post/notify", () => ({
  emitSocialPostChanged: vi.fn(),
}))

const { socialPostFeedService } = await import(
  "../src/social-post-feed/service"
)
const { registerFeedFetcher } = await import("../src/social-post-feed/fetcher")

const RSS = `<rss version="2.0"><channel>
<item><title>Older</title><link>https://example.com/old</link><guid>old</guid><pubDate>Mon, 02 Jan 2026 10:00:00 GMT</pubDate></item>
<item><title>Newest</title><link>https://example.com/new</link><guid>new</guid><pubDate>Tue, 03 Jan 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`
const key = { createdById: "u1", id: "f1", workspaceId: "ws-1" }

beforeEach(() => {
  vi.clearAllMocks()
  registerFeedFetcher(mocks.fetcher)
  mocks.incr.mockResolvedValue(1)
  mocks.findById.mockResolvedValue({
    aiWrite: false,
    feedUrl: "https://example.com/feed.xml",
    filters: null,
    id: "f1",
    mediaField: null,
    mediaLibraryFileIds: [],
    mediaMode: "none",
    noImageFallback: "text",
    postAs: "text",
    signatureId: null,
    templateSyntax: "legacy",
    textTemplate: "{title} {link}",
    workspaceId: "ws-1",
  })
  mocks.findDestinations.mockResolvedValue([{ id: "d1", provider: "facebook" }])
  mocks.listDestinations.mockResolvedValue([
    { destinationId: "d1", feedId: "f1" },
  ])
  mocks.fetcher.mockResolvedValue({
    body: RSS,
    etag: null,
    kind: "ok",
    lastModified: null,
  })
  mocks.create.mockResolvedValue({ id: "post-1" })
})

describe("socialPostFeedService.sendTest", () => {
  test("saves a draft of the newest item and leaves the ledger untouched", async () => {
    const result = await socialPostFeedService.sendTest(key)

    expect(result).toEqual({ note: null, socialPostId: "post-1" })
    expect(mocks.create).toHaveBeenCalledWith({
      createdById: "u1",
      createdVia: "feed",
      linkUrl: null,
      media: [],
      targets: [{ destinationId: "d1" }],
      text: "Newest https://example.com/new",
      workspaceId: "ws-1",
    })
    // A draft: no schedule hook, no queue plan; and no ledger write.
    expect(mocks.create.mock.calls[0]?.[0]).not.toHaveProperty("afterWrite")
    expect(mocks.insertItem).not.toHaveBeenCalled()
    expect(mocks.insertItems).not.toHaveBeenCalled()
  })

  test("is limited per workspace", async () => {
    mocks.incr.mockResolvedValue(11)

    await expect(socialPostFeedService.sendTest(key)).rejects.toMatchObject({
      code: "feedTestRateLimited",
    })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("an empty feed is refused", async () => {
    mocks.fetcher.mockResolvedValue({
      body: `<rss version="2.0"><channel><title>Empty</title></channel></rss>`,
      etag: null,
      kind: "ok",
      lastModified: null,
    })

    await expect(socialPostFeedService.sendTest(key)).rejects.toMatchObject({
      code: "feedHasNoItems",
    })
  })
})

describe("socialPostFeedService.itemDraftContent", () => {
  const input = { id: "f1", itemId: "i1", workspaceId: "ws-1" }

  test("a workspace over its fetch budget gets the stored title and link, and the feed is not fetched", async () => {
    mocks.findItem.mockResolvedValue({
      itemKey: "new",
      link: "https://example.com/stored",
      title: "Stored",
    })
    mocks.incr.mockResolvedValue(61)

    expect(await socialPostFeedService.itemDraftContent(input)).toMatchObject({
      linkUrl: "https://example.com/stored",
      title: "Stored",
    })
    expect(mocks.fetcher).not.toHaveBeenCalled()
  })

  test("applies the template to the item read again from the feed, with its link and picture", async () => {
    mocks.findItem.mockResolvedValue({ itemKey: "new", link: null, title: "x" })
    mocks.fetcher.mockResolvedValue({
      body: JSON.stringify({
        items: [
          {
            id: "new",
            image: "https://example.com/n.jpg",
            title: "Newest",
            url: "https://example.com/new",
          },
        ],
        version: "https://jsonfeed.org/version/1.1",
      }),
      etag: null,
      kind: "ok",
      lastModified: null,
    })

    expect(await socialPostFeedService.itemDraftContent(input)).toEqual({
      imageUrl: "https://example.com/n.jpg",
      linkUrl: "https://example.com/new",
      text: "Newest https://example.com/new",
      title: "Newest",
    })
  })

  test("an item that left the feed keeps its stored title and link", async () => {
    mocks.findItem.mockResolvedValue({
      itemKey: "gone",
      link: "https://example.com/gone",
      title: "Gone",
    })

    expect(await socialPostFeedService.itemDraftContent(input)).toMatchObject({
      imageUrl: null,
      linkUrl: "https://example.com/gone",
      title: "Gone",
    })
  })

  test("an item of another feed or workspace is not found", async () => {
    mocks.findItem.mockResolvedValue(null)

    await expect(
      socialPostFeedService.itemDraftContent(input),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.findItem).toHaveBeenCalledWith({
      feedId: "f1",
      itemId: "i1",
      workspaceId: "ws-1",
    })
  })
})
