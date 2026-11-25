import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkSsrfSafety: vi.fn(),
  incrWithWindow: vi.fn(),
  fetcher: vi.fn(),
  findDestinations: vi.fn(),
  findById: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
  isUniqueViolationError: vi.fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  socialPostFeedRepository: {
    countByWorkspace: vi.fn().mockResolvedValue(0),
    findById: mocks.findById,
    insert: mocks.insert,
    lockWorkspaceFeeds: vi.fn(),
    replaceDestinations: vi.fn(),
    update: mocks.update,
  },
  socialPostRepository: { findDestinations: mocks.findDestinations },
  socialPostSnippetRepository: {},
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: { incrWithWindow: mocks.incrWithWindow },
}))
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
vi.mock("../src/net/ssrf-guard", () => ({
  checkSsrfSafety: mocks.checkSsrfSafety,
}))
vi.mock("../src/social-post/service", () => ({ socialPostService: {} }))
vi.mock("../src/social-post/notify", () => ({
  emitSocialPostChanged: vi.fn(),
}))
vi.mock("../src/social-post-feed/runner", () => ({ socialPostFeedRunner: {} }))

const { socialPostFeedService } = await import(
  "../src/social-post-feed/service"
)
const { FeedFetchError, registerFeedFetcher } = await import(
  "../src/social-post-feed/fetcher"
)
const { registerFeedAiModelChecker } = await import(
  "../src/social-post-feed/writer"
)

const URL_IN = "https://example.com/blog"
const base = {
  createdById: null,
  destinationIds: ["d1"],
  feedUrl: URL_IN,
  name: "Blog",
  workspaceId: "ws-1",
}
const RSS = `<rss version="2.0"><channel><item><title>a</title></item></channel></rss>`

beforeEach(() => {
  vi.clearAllMocks()
  mocks.checkSsrfSafety.mockResolvedValue({ unsafe: false })
  registerFeedFetcher(mocks.fetcher)
  mocks.findDestinations.mockResolvedValue([{ id: "d1" }])
  mocks.incrWithWindow.mockResolvedValue(1)
})

describe("saving a feed fetches the address first", () => {
  test("create rejects an HTML page and writes nothing", async () => {
    mocks.fetcher.mockRejectedValue(
      new FeedFetchError("badContentType", "not xml", "<html></html>"),
    )

    await expect(socialPostFeedService.create(base)).rejects.toMatchObject({
      code: "feedNotParseable",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("create rejects an XML document that is not a feed", async () => {
    mocks.fetcher.mockResolvedValue({
      body: "<html><body/></html>",
      etag: null,
      kind: "ok",
      lastModified: null,
    })

    await expect(socialPostFeedService.create(base)).rejects.toMatchObject({
      code: "feedNotParseable",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("create rejects an unreachable address", async () => {
    mocks.fetcher.mockRejectedValue(new FeedFetchError("unreachable", "down"))

    await expect(socialPostFeedService.create(base)).rejects.toMatchObject({
      code: "feedUnreachable",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("an HTML page that advertises a feed gets it suggested, once vetted", async () => {
    mocks.fetcher.mockRejectedValue(
      new FeedFetchError(
        "badContentType",
        "not xml",
        `<link rel="alternate" type="application/rss+xml" href="/rss">`,
      ),
    )
    await expect(socialPostFeedService.create(base)).rejects.toMatchObject({
      code: "feedNotParseable",
      data: { suggestedUrl: "https://example.com/rss" },
    })

    mocks.checkSsrfSafety.mockImplementation(async (url: string) => ({
      unsafe: url.endsWith("/rss"),
    }))
    const error = await socialPostFeedService.create(base).catch((e) => e)
    expect(error.code).toBe("feedNotParseable")
    expect(error.data).toBeUndefined()
  })

  test("update fetches a changed address and rejects before writing", async () => {
    mocks.findById.mockResolvedValue({ feedUrl: "https://example.com/old.xml" })
    mocks.fetcher.mockRejectedValue(new FeedFetchError("unreachable", "down"))

    await expect(
      socialPostFeedService.update({
        feedUrl: URL_IN,
        id: "f1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "feedUnreachable" })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("update with an unchanged address does not fetch", async () => {
    mocks.findById.mockResolvedValue({ feedUrl: URL_IN })
    mocks.transaction.mockResolvedValue(undefined)
    vi.spyOn(socialPostFeedService, "get").mockResolvedValue({} as never)

    await socialPostFeedService.update({
      feedUrl: URL_IN,
      id: "f1",
      name: "New",
      workspaceId: "ws-1",
    })

    expect(mocks.fetcher).not.toHaveBeenCalled()
  })

  test("a parseable feed passes the check, and the fetch is the last step before the write", async () => {
    mocks.fetcher.mockResolvedValue({
      body: RSS,
      etag: null,
      kind: "ok",
      lastModified: null,
    })
    mocks.transaction.mockRejectedValue(new Error("stop at the write"))

    await expect(socialPostFeedService.create(base)).rejects.toThrow(
      "stop at the write",
    )
    expect(mocks.fetcher).toHaveBeenCalledTimes(1)
  })

  test("a failed cheap validation spends no fetch budget", async () => {
    mocks.findDestinations.mockResolvedValue([])

    await expect(socialPostFeedService.create(base)).rejects.toMatchObject({
      field: "destinationIds",
    })
    expect(mocks.incrWithWindow).not.toHaveBeenCalled()
    expect(mocks.fetcher).not.toHaveBeenCalled()
  })
})

describe("a picked AI integration must belong to the workspace", () => {
  const checker = vi.fn()
  beforeEach(() => {
    mocks.findDestinations.mockResolvedValue([{ id: "d1" }])
    checker.mockResolvedValue(false)
    registerFeedAiModelChecker(checker)
    mocks.fetcher.mockResolvedValue({
      body: RSS,
      etag: null,
      kind: "ok",
      lastModified: null,
    })
  })

  test("create refuses a foreign integration and writes nothing", async () => {
    await expect(
      socialPostFeedService.create({
        ...base,
        aiIntegrationId: "999",
        aiModel: "gpt",
        aiWrite: true,
      }),
    ).rejects.toMatchObject({
      field: "aiIntegrationId",
      message: "AI integration not found.",
    })
    expect(checker).toHaveBeenCalledWith({
      integrationId: "999",
      model: "gpt",
      workspaceId: "ws-1",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("update refuses a foreign integration and writes nothing", async () => {
    mocks.findById.mockResolvedValue({ feedUrl: URL_IN })

    await expect(
      socialPostFeedService.update({
        aiIntegrationId: "999",
        aiModel: "gpt",
        id: "f1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ field: "aiIntegrationId" })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("an integration without a model, or the reverse, is refused", async () => {
    await expect(
      socialPostFeedService.create({ ...base, aiIntegrationId: "openai" }),
    ).rejects.toMatchObject({ field: "aiModel" })
  })

  describe("a PATCH is checked as the pair it leaves behind", () => {
    const stored = {
      aiIntegrationId: "openai",
      aiModel: "gpt",
      feedUrl: URL_IN,
      templateSyntax: "v2",
    }

    beforeEach(() => {
      mocks.update.mockResolvedValue({ id: "f1" })
      mocks.transaction.mockImplementation(
        async (run: (tx: object) => unknown) => await run({}),
      )
      vi.spyOn(socialPostFeedService, "get").mockResolvedValue({} as never)
    })

    test("clearing only the integration of a stored pair is refused", async () => {
      mocks.findById.mockResolvedValue(stored)

      await expect(
        socialPostFeedService.update({
          aiIntegrationId: null,
          id: "f1",
          workspaceId: "ws-1",
        }),
      ).rejects.toMatchObject({ field: "aiModel" })
      expect(mocks.update).not.toHaveBeenCalled()
    })

    test("changing only the model keeps the stored integration, checks the pair and writes both", async () => {
      mocks.findById.mockResolvedValue(stored)
      checker.mockResolvedValue(true)

      await socialPostFeedService.update({
        aiModel: "gpt-2",
        id: "f1",
        workspaceId: "ws-1",
      })

      expect(checker).toHaveBeenCalledWith({
        integrationId: "openai",
        model: "gpt-2",
        workspaceId: "ws-1",
      })
      expect(mocks.update.mock.calls[0]?.[0].patch).toMatchObject({
        aiIntegrationId: "openai",
        aiModel: "gpt-2",
      })
    })

    test("clearing both halves is allowed and a patch without either leaves the pair alone", async () => {
      mocks.findById.mockResolvedValue(stored)

      await socialPostFeedService.update({
        aiIntegrationId: null,
        aiModel: null,
        id: "f1",
        workspaceId: "ws-1",
      })
      expect(mocks.update.mock.calls[0]?.[0].patch).toMatchObject({
        aiIntegrationId: null,
        aiModel: null,
      })

      mocks.update.mockClear()
      await socialPostFeedService.update({
        id: "f1",
        name: "Renamed",
        workspaceId: "ws-1",
      })
      const patch = mocks.update.mock.calls[0]?.[0].patch
      expect(patch).not.toHaveProperty("aiIntegrationId")
      expect(patch).not.toHaveProperty("aiModel")
      expect(checker).not.toHaveBeenCalled()
    })
  })
})

describe("outside fetches are metered", () => {
  test("create stops before fetching when the workspace's hourly budget is spent", async () => {
    mocks.incrWithWindow.mockResolvedValue(61)

    await expect(socialPostFeedService.create(base)).rejects.toMatchObject({
      code: "feedFetchRateLimited",
      httpStatusCode: 429,
    })
    expect(mocks.fetcher).not.toHaveBeenCalled()
    expect(mocks.incrWithWindow).toHaveBeenCalledWith(
      "postfeed:ws-1:fetch",
      3600,
    )
  })

  test("update meters a changed address but not an unchanged one", async () => {
    mocks.findById.mockResolvedValue({ feedUrl: URL_IN, templateSyntax: "v2" })
    mocks.transaction.mockResolvedValue(undefined)
    mocks.update.mockResolvedValue({ id: "f1" })
    vi.spyOn(socialPostFeedService, "get").mockResolvedValue({} as never)

    await socialPostFeedService.update({
      feedUrl: URL_IN,
      id: "f1",
      name: "Same address",
      workspaceId: "ws-1",
    })
    expect(mocks.incrWithWindow).not.toHaveBeenCalled()

    mocks.fetcher.mockResolvedValue({
      body: RSS,
      etag: null,
      kind: "ok",
      lastModified: null,
    })
    await socialPostFeedService.update({
      feedUrl: "https://example.com/other.xml",
      id: "f1",
      workspaceId: "ws-1",
    })
    expect(mocks.incrWithWindow).toHaveBeenCalledTimes(1)
  })
})

describe("saving a feed checks its content settings", () => {
  const okFeed = () =>
    mocks.fetcher.mockResolvedValue({
      body: RSS,
      etag: null,
      kind: "ok",
      lastModified: null,
    })

  beforeEach(() => {
    okFeed()
    mocks.findDestinations.mockResolvedValue([{ id: "d1" }])
  })

  test("a v2 template that does not parse answers templateInvalid with its line and column", async () => {
    const error = await socialPostFeedService
      .create({ ...base, textTemplate: "ok\n{{ title | shout }}" })
      .catch((e) => e)

    expect(error.code).toBe("templateInvalid")
    expect(error.httpStatusCode).toBe(422)
    expect(error.data).toMatchObject({
      code: "unknownFilter",
      field: "textTemplate",
      line: 2,
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("old {title} tokens in a v2 template are refused instead of posted literally", async () => {
    await expect(
      socialPostFeedService.create({ ...base, textTemplate: "{title} {link}" }),
    ).rejects.toMatchObject({ code: "validation" })
  })

  test("network texts: an unknown network, old tokens and a bad template are refused with the field", async () => {
    await expect(
      socialPostFeedService.create({
        ...base,
        templatesByProvider: { myspace: "{{ title }}" } as never,
      }),
    ).rejects.toMatchObject({ code: "validation" })
    await expect(
      socialPostFeedService.create({
        ...base,
        templatesByProvider: { threads: "{title}" },
      }),
    ).rejects.toMatchObject({ code: "validation" })
    const error = await socialPostFeedService
      .create({
        ...base,
        templatesByProvider: { tiktok: "x\n{{ title | shout }}" },
      })
      .catch((e) => e)
    expect(error.code).toBe("templateInvalid")
    expect(error.data).toMatchObject({
      field: "templatesByProvider.tiktok",
      line: 2,
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("network texts are refused on a legacy feed and stored on a v2 one, with the article-picture setting", async () => {
    await expect(
      socialPostFeedService.create({
        ...base,
        templateSyntax: "legacy",
        templatesByProvider: { threads: "{{ title }}" },
        textTemplate: "{title}",
      }),
    ).rejects.toMatchObject({ code: "validation" })

    mocks.transaction.mockImplementation(async (run: (tx: object) => unknown) =>
      run({}),
    )
    mocks.insert.mockResolvedValue({ id: "f1" })
    const spy = vi
      .spyOn(socialPostFeedService, "get")
      .mockResolvedValue({ id: "f1" } as never)

    await socialPostFeedService.create({
      ...base,
      fetchArticleImage: true,
      templatesByProvider: { threads: "{{ title }} #news" },
    })
    expect(mocks.insert.mock.calls[0]?.[0]).toMatchObject({
      fetchArticleImage: true,
      templatesByProvider: { threads: "{{ title }} #news" },
    })

    await socialPostFeedService.create({ ...base })
    expect(mocks.insert.mock.calls[1]?.[0]).toMatchObject({
      fetchArticleImage: false,
      templatesByProvider: {},
    })
    spy.mockRestore()
  })

  test("a v2 feed that has network texts cannot move to legacy, and a legacy feed cannot gain them", async () => {
    mocks.findById.mockResolvedValue({
      feedUrl: URL_IN,
      mediaField: null,
      mediaMode: "auto",
      templateSyntax: "v2",
      templatesByProvider: { threads: "{{ title }}" },
    })
    await expect(
      socialPostFeedService.update({
        id: "f1",
        templateSyntax: "legacy",
        textTemplate: "{title}",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })

    mocks.findById.mockResolvedValue({
      feedUrl: URL_IN,
      mediaField: null,
      mediaMode: "auto",
      templateSyntax: "legacy",
      templatesByProvider: {},
    })
    await expect(
      socialPostFeedService.update({
        id: "f1",
        templatesByProvider: { threads: "{{ title }}" },
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("a field picture mode needs its field, and the field is parsed too", async () => {
    await expect(
      socialPostFeedService.create({ ...base, mediaMode: "field" }),
    ).rejects.toMatchObject({ code: "validation" })
    await expect(
      socialPostFeedService.create({
        ...base,
        mediaField: "{{ nope | }}",
        mediaMode: "field",
      }),
    ).rejects.toMatchObject({ code: "templateInvalid" })
  })

  test("a new feed starts on the new syntax with pictures and a link fallback", async () => {
    mocks.transaction.mockImplementation(async (run: (tx: object) => unknown) =>
      run({}),
    )
    mocks.insert.mockResolvedValue({ id: "f1" })
    const spy = vi
      .spyOn(socialPostFeedService, "get")
      .mockResolvedValue({ id: "f1" } as never)

    await socialPostFeedService.create(base)

    expect(mocks.insert.mock.calls[0]?.[0]).toMatchObject({
      mediaMode: "auto",
      noImageFallback: "link",
      postAs: "photo",
      templateSyntax: "v2",
      textTemplate: "{{ title }}\n{{ link }}",
    })
    spy.mockRestore()
  })

  test("a legacy feed keeps its syntax when other settings or a template without a syntax are saved", async () => {
    mocks.findById.mockResolvedValue({
      feedUrl: URL_IN,
      templateSyntax: "legacy",
    })
    mocks.transaction.mockImplementation(async (run: (tx: object) => unknown) =>
      run({}),
    )
    mocks.update.mockResolvedValue({ id: "f1" })
    const spy = vi
      .spyOn(socialPostFeedService, "get")
      .mockResolvedValue({ id: "f1" } as never)

    await socialPostFeedService.update({
      id: "f1",
      name: "New name",
      workspaceId: "ws-1",
    })
    expect(mocks.update.mock.calls[0]?.[0].patch).not.toHaveProperty(
      "templateSyntax",
    )

    await socialPostFeedService.update({
      id: "f1",
      textTemplate: "{title}",
      workspaceId: "ws-1",
    })
    expect(mocks.update.mock.calls[1]?.[0].patch).toMatchObject({
      templateSyntax: "legacy",
    })

    await socialPostFeedService.update({
      id: "f1",
      templateSyntax: "v2",
      textTemplate: "{{ title }}",
      workspaceId: "ws-1",
    })
    expect(mocks.update.mock.calls[2]?.[0].patch).toMatchObject({
      templateSyntax: "v2",
    })
    spy.mockRestore()
  })

  test("moving a legacy feed to v2 without sending the converted template is refused", async () => {
    mocks.findById.mockResolvedValue({
      feedUrl: URL_IN,
      templateSyntax: "legacy",
    })

    await expect(
      socialPostFeedService.update({
        id: "f1",
        templateSyntax: "v2",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
  })

  test("moving a v2 feed to legacy needs a legacy template, never {{ }} tags", async () => {
    mocks.findById.mockResolvedValue({
      feedUrl: URL_IN,
      mediaField: null,
      mediaMode: "auto",
      templateSyntax: "v2",
    })

    await expect(
      socialPostFeedService.update({
        id: "f1",
        templateSyntax: "legacy",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    await expect(
      socialPostFeedService.update({
        id: "f1",
        templateSyntax: "legacy",
        textTemplate: "{{ title }}",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("the picture fields are checked as merged with the saved feed", async () => {
    mocks.findById.mockResolvedValue({
      feedUrl: URL_IN,
      mediaField: "enclosure",
      mediaMode: "auto",
      templateSyntax: "v2",
    })
    mocks.update.mockResolvedValue({ id: "f1" })
    const spy = vi
      .spyOn(socialPostFeedService, "get")
      .mockResolvedValue({ id: "f1" } as never)

    // Switching to field mode keeps the saved field.
    await expect(
      socialPostFeedService.update({
        id: "f1",
        mediaMode: "field",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeDefined()

    // Clearing the field while the feed is in field mode is refused.
    mocks.findById.mockResolvedValue({
      feedUrl: URL_IN,
      mediaField: "enclosure",
      mediaMode: "field",
      templateSyntax: "v2",
    })
    await expect(
      socialPostFeedService.update({
        id: "f1",
        mediaField: null,
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    spy.mockRestore()
  })
})
