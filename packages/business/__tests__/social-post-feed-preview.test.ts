import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  fetcher: vi.fn(),
  findDestinations: vi.fn(),
  get: vi.fn(),
  incr: vi.fn(),
  put: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  isUniqueViolationError: vi.fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  socialPostFeedRepository: {
    findWorkspaceTimezone: vi.fn().mockResolvedValue("Asia/Ho_Chi_Minh"),
  },
  socialPostRepository: { findDestinations: mocks.findDestinations },
  socialPostSnippetRepository: {},
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: {
    get: mocks.get,
    incrWithWindow: mocks.incr,
    put: mocks.put,
  },
}))
vi.mock("../src/media-library-file/service", () => ({
  mediaLibraryFileService: { findById: vi.fn() },
}))
vi.mock("../src/social-post-feed/feed-media", async () => {
  const actual = await vi.importActual<
    typeof import("../src/social-post-feed/feed-media")
  >("../src/social-post-feed/feed-media")
  return { ...actual }
})
vi.mock("../src/media-library/service", () => ({
  mediaLibraryService: {},
}))
vi.mock("../src/logger", () => ({ logger: { warn: vi.fn() } }))
vi.mock("../src/net/ssrf-guard", () => ({
  checkSsrfSafety: vi.fn().mockResolvedValue({ unsafe: false }),
}))
vi.mock("../src/social-post/service", () => ({ socialPostService: {} }))
vi.mock("../src/social-post/notify", () => ({
  emitSocialPostChanged: vi.fn(),
}))
vi.mock("../src/social-post-feed/runner", () => ({ socialPostFeedRunner: {} }))

const { socialPostFeedService } = await import(
  "../src/social-post-feed/service"
)
const { registerFeedFetcher } = await import("../src/social-post-feed/fetcher")

const ENCLOSURE_TAG = /<enclosure[^>]*>/
const RSS = `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>Shop</title>
<item><guid>1</guid><title>Shoe</title><link>https://shop.test/1</link>
<pubDate>Tue, 03 Mar 2026 17:30:00 GMT</pubDate><category>Sale</category>
<g:price>19.99 USD</g:price><enclosure url="https://cdn.test/1.jpg" type="image/jpeg" length="1"/></item>
</channel></rss>`

beforeEach(() => {
  vi.clearAllMocks()
  registerFeedFetcher(mocks.fetcher)
  mocks.fetcher.mockResolvedValue({
    body: RSS,
    etag: null,
    kind: "ok",
    lastModified: null,
  })
  mocks.get.mockResolvedValue(null)
  mocks.incr.mockResolvedValue(1)
  mocks.findDestinations.mockResolvedValue([
    { id: "fb", provider: "facebook" },
    { id: "ig", provider: "instagram" },
    { id: "tt", provider: "tiktok" },
  ])
})

const ask = (extra: Record<string, unknown> = {}) =>
  socialPostFeedService.preview({
    feedUrl: "https://shop.test/feed.xml",
    workspaceId: "ws-1",
    ...extra,
  })

describe("socialPostFeedService.preview", () => {
  test("without a draft it returns the detected fields only", async () => {
    const result = await ask()

    expect(result.items[0]).toMatchObject({
      author: null,
      categories: ["Sale"],
      fields: { "g:price": "19.99 USD" },
      render: null,
    })
    expect(result.variables).toContain("categories")
    expect(result.fieldFormatVersion).toBe(1)
  })

  test("a draft is rendered per item with pictures, dropped destinations and per-network checks", async () => {
    const result = await ask({
      destinationIds: ["fb", "ig", "tt"],
      postAs: "photo",
      textTemplate:
        '{{ title }} - {{ raw["g:price"] }}\n{{ date | date: "%d/%m/%Y %H:%M" }}',
    })

    const render = result.items[0]?.render
    expect(render).toMatchObject({
      droppedDestinationIds: ["tt"],
      pictures: [{ source: "enclosure", url: "https://cdn.test/1.jpg" }],
      shape: "photo",
      templateProblem: null,
      text: "Shoe - 19.99 USD\n04/03/2026 00:30",
    })
    expect(render?.networks.map((n) => n.provider)).toEqual([
      "facebook",
      "instagram",
    ])
  })

  test("network templates are rendered per provider for the form's tabs and checked per network", async () => {
    const result = await ask({
      destinationIds: ["fb", "ig"],
      postAs: "photo",
      templatesByProvider: {
        instagram: "{{ title }} {{ categories | hashtags: 2 }}",
        threads: "{{ title | nope }}",
      },
      textTemplate: "{{ title }}\n{{ link }}",
    })

    const render = result.items[0]?.render
    expect(render?.providerTexts).toEqual([
      {
        provider: "instagram",
        templateProblem: null,
        text: "Shoe #Sale",
      },
      {
        provider: "threads",
        templateProblem: expect.objectContaining({ code: "unknownFilter" }),
        text: "",
      },
    ])
    const [facebook, instagram] = render?.networks ?? []
    expect(facebook).toMatchObject({
      text: "Shoe\nhttps://shop.test/1",
      usesOwnTemplate: false,
    })
    expect(instagram).toMatchObject({
      characters: 10,
      text: "Shoe #Sale",
      usesOwnTemplate: true,
    })
  })

  test("a legacy draft with network texts is refused like a save", async () => {
    await expect(
      ask({
        templateSyntax: "legacy",
        templatesByProvider: { threads: "{{ title }}" },
        textTemplate: "{title}",
      }),
    ).rejects.toMatchObject({ code: "validation" })
  })

  test("an item with no picture is flagged when the article page will be read", async () => {
    mocks.fetcher.mockResolvedValue({
      body: RSS.replace(ENCLOSURE_TAG, ""),
      etag: null,
      kind: "ok",
      lastModified: null,
    })

    const withArticle = await ask({
      destinationIds: ["fb", "ig"],
      fetchArticleImage: true,
      postAs: "photo",
      textTemplate: "{{ title }}",
    })
    expect(withArticle.items[0]?.render).toMatchObject({
      articleImageWillBeTried: true,
      droppedDestinationIds: ["tt"],
      shape: "photo",
    })

    mocks.get.mockResolvedValue(null)
    const without = await ask({
      destinationIds: ["fb", "ig"],
      noImageFallback: "link",
      postAs: "photo",
      textTemplate: "{{ title }}",
    })
    expect(without.items[0]?.render).toMatchObject({
      articleImageWillBeTried: false,
      droppedDestinationIds: ["ig", "tt"],
      shape: "link",
    })
  })

  test("a template problem is reported with its place, not thrown", async () => {
    const result = await ask({
      postAs: "text",
      textTemplate: "{{ title | nope }}",
    })

    expect(result.items[0]?.render?.templateProblem).toMatchObject({
      code: "unknownFilter",
      line: 1,
    })
    expect(result.items[0]?.render?.text).toBe("")
  })

  test("only a real fetch counts against the 10 an hour; a kept feed is re-rendered against its own limit", async () => {
    await ask({ postAs: "text", textTemplate: "{{ title }}" })
    expect(mocks.incr).toHaveBeenCalledWith("postfeed:ws-1:preview", 3600)
    expect(mocks.put).toHaveBeenCalledWith(
      expect.stringContaining("previewitems"),
      expect.any(Array),
      120,
    )

    mocks.incr.mockClear()
    mocks.fetcher.mockClear()
    mocks.get.mockResolvedValue(mocks.put.mock.calls[0]?.[1])
    await ask({ postAs: "text", textTemplate: "{{ title }} again" })

    expect(mocks.fetcher).not.toHaveBeenCalled()
    expect(mocks.incr).toHaveBeenCalledWith("postfeed:ws-1:previewdraft", 3600)
  })

  test("too many fetches answer 429", async () => {
    mocks.incr.mockResolvedValue(11)

    await expect(ask()).rejects.toMatchObject({
      code: "feedPreviewRateLimited",
    })
  })
})
