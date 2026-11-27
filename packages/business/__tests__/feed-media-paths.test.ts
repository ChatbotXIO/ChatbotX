import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createFile: vi.fn(),
  deleteFile: vi.fn(),
  deleteFileUnlessUsedByPosts: vi.fn(),
  deleteObjectIfUnreferenced: vi.fn(),
  findByPath: vi.fn(),
}))

vi.mock("../src/media-library/service", () => ({
  mediaLibraryService: {
    createFile: mocks.createFile,
    deleteFile: mocks.deleteFile,
    deleteFileUnlessUsedByPosts: mocks.deleteFileUnlessUsedByPosts,
    deleteObjectIfUnreferenced: mocks.deleteObjectIfUnreferenced,
  },
}))
vi.mock("../src/media-library-file/service", () => ({
  mediaLibraryFileService: {
    findById: vi.fn(),
    findByPath: mocks.findByPath,
  },
}))
vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const {
  acquireFeedMedia,
  discardImportedFile,
  ImageBudget,
  isFeedTestImagePath,
  stableImagePath,
} = await import("../src/social-post-feed/feed-media")
const { registerFeedImageImporter } = await import(
  "../src/social-post-feed/image-importer"
)

const importer = vi.fn()
registerFeedImageImporter(importer)

const feed = {
  id: "7",
  mediaLibraryFileIds: [],
  mediaMode: "auto",
  workspaceId: "3",
} as never

const run = (purpose?: "post" | "test") =>
  acquireFeedMedia({
    budget: new ImageBudget(5),
    candidates: [{ source: "enclosure", url: "https://img.test/a.jpg" }],
    feed,
    itemKey: "item-1",
    purpose,
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByPath.mockResolvedValue(null)
  importer.mockResolvedValue({ mimeType: "image/jpeg", name: "a", size: 10 })
  mocks.createFile.mockResolvedValue({ id: "file-1" })
})

describe("feed picture storage path", () => {
  test("a test picture never shares the stable path of the real run", async () => {
    const stable = await stableImagePath({
      feedId: "7",
      itemKey: "item-1",
      workspaceId: "3",
    })
    await run("test")
    const used = importer.mock.calls[0]?.[0] as { path: string }
    expect(used.path).not.toBe(stable)
    expect(used.path.startsWith(`${stable}-test-`)).toBe(true)
  })

  test("a test run does not reuse the real run's file", async () => {
    mocks.findByPath.mockResolvedValue({ id: "winner" })
    const result = await run("test")
    expect(importer).toHaveBeenCalledOnce()
    expect(result.fileId).toBe("file-1")
  })

  test("a real run reuses an existing row without importing", async () => {
    mocks.findByPath.mockResolvedValue({ id: "winner" })
    const result = await run("post")
    expect(importer).not.toHaveBeenCalled()
    expect(result).toMatchObject({ created: false, fileId: "winner" })
  })

  test("a row that appeared during the import is reused, not duplicated", async () => {
    mocks.findByPath
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "winner" })
    const result = await run("post")
    expect(mocks.createFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({ created: false, fileId: "winner" })
  })

  test("a failed createFile removes the raw object it just uploaded", async () => {
    mocks.createFile.mockRejectedValue(new Error("db down"))
    const result = await run("post")
    expect(mocks.deleteObjectIfUnreferenced).toHaveBeenCalledOnce()
    expect(result.imageError).toBe("storage")
    expect(result.fileId).toBeNull()
  })
})

describe("discardImportedFile", () => {
  test("delegates to the locked, reference-checked delete", async () => {
    await discardImportedFile({ fileId: "f", workspaceId: "3" })
    expect(mocks.deleteFileUnlessUsedByPosts).toHaveBeenCalledWith({
      fileId: "f",
      shouldDeleteObject: isFeedTestImagePath,
      workspaceId: "3",
    })
    expect(mocks.deleteFile).not.toHaveBeenCalled()
  })

  test("requests an object delete only for a Send-test path", async () => {
    await discardImportedFile({ fileId: "f", workspaceId: "3" })
    const call = mocks.deleteFileUnlessUsedByPosts.mock.calls[0]?.[0] as {
      shouldDeleteObject: (path: string) => boolean
    }
    const stable = await stableImagePath({
      feedId: "7",
      itemKey: "item-1",
      workspaceId: "3",
    })
    const test = await stableImagePath({
      feedId: "7",
      itemKey: "item-1",
      purpose: "test",
      workspaceId: "3",
    })
    expect(call.shouldDeleteObject(stable)).toBe(false)
    expect(call.shouldDeleteObject(test)).toBe(true)
    expect(isFeedTestImagePath(stable)).toBe(false)
  })

  test("never throws when the delete fails", async () => {
    mocks.deleteFileUnlessUsedByPosts.mockRejectedValue(new Error("db down"))
    await expect(
      discardImportedFile({ fileId: "f", workspaceId: "3" }),
    ).resolves.toBeUndefined()
  })
})

describe("article picture (fetchArticleImage)", () => {
  const finder = vi.fn()
  const withArticle = (
    overrides: {
      budget?: InstanceType<typeof ImageBudget>
      candidates?: { source: "enclosure"; url: string }[]
      fetchArticleImage?: boolean
      mediaMode?: "auto" | "none"
    } = {},
  ) =>
    acquireFeedMedia({
      articleUrl: "https://news.test/story",
      budget: overrides.budget ?? new ImageBudget(5, 3),
      candidates: overrides.candidates ?? [],
      feed: {
        ...(feed as object),
        fetchArticleImage: overrides.fetchArticleImage ?? true,
        mediaMode: overrides.mediaMode ?? "auto",
      } as never,
      itemKey: "item-1",
    })

  beforeEach(async () => {
    const { registerFeedArticleImageFinder } = await import(
      "../src/social-post-feed/article-image"
    )
    finder.mockReset()
    finder.mockResolvedValue("https://news.test/og.jpg")
    registerFeedArticleImageFinder(finder)
  })

  test("reads the article once for an item with no picture, imports it and records `article`", async () => {
    const result = await withArticle()

    expect(finder).toHaveBeenCalledTimes(1)
    expect(finder.mock.calls[0]?.[0]).toMatchObject({
      url: "https://news.test/story",
    })
    expect(importer.mock.calls[0]?.[0]).toMatchObject({
      url: "https://news.test/og.jpg",
    })
    expect(result).toMatchObject({
      created: true,
      fileId: "file-1",
      imageError: null,
      imageSource: "article",
      imageUrl: "https://news.test/og.jpg",
    })
  })

  test("is off by default and never reads the page when the feed names a picture", async () => {
    await withArticle({ fetchArticleImage: false })
    await withArticle({
      candidates: [{ source: "enclosure", url: "https://img.test/a.jpg" }],
    })
    await withArticle({ mediaMode: "none" })

    expect(finder).not.toHaveBeenCalled()
  })

  test("a page that names no picture is recorded and the item goes without", async () => {
    finder.mockResolvedValue(null)

    expect(await withArticle()).toMatchObject({
      fileId: null,
      imageError: "articleNoImage",
      imageSource: null,
    })
    expect(importer).not.toHaveBeenCalled()
  })

  test("an unreadable page records its code and never throws", async () => {
    const { FeedImageImportError } = await import(
      "../src/social-post-feed/image-importer"
    )
    finder.mockRejectedValue(new FeedImageImportError("blocked", "no"))
    expect((await withArticle()).imageError).toBe("blocked")

    finder.mockRejectedValue(new Error("boom"))
    expect((await withArticle()).imageError).toBe("articleUnreachable")
  })

  test("the per-run read budget and the per-host budget stop further reads", async () => {
    const budget = new ImageBudget(10, 1)
    await withArticle({ budget })
    const second = await withArticle({ budget })

    expect(finder).toHaveBeenCalledTimes(1)
    expect(second.imageError).toBe("budget")

    const noReads = await withArticle({ budget: new ImageBudget(10) })
    expect(noReads.imageError).toBe("budget")
  })

  test("a retry reuses the file a previous attempt stored without reading the page again", async () => {
    mocks.findByPath.mockResolvedValue({ id: "stored" })

    expect(await withArticle()).toMatchObject({
      created: false,
      fileId: "stored",
      imageSource: "article",
    })
    expect(finder).not.toHaveBeenCalled()
  })

  test("an article picture that cannot be imported records the import error", async () => {
    const { FeedImageImportError } = await import(
      "../src/social-post-feed/image-importer"
    )
    importer.mockRejectedValue(new FeedImageImportError("tooLarge", "big"))

    expect(await withArticle()).toMatchObject({
      fileId: null,
      imageError: "tooLarge",
      imageSource: "article",
    })
  })
})

describe("ImageBudget per-host limit", () => {
  test("defaults to 3 attempts per host and can be raised", () => {
    const small = new ImageBudget(20)
    const taken = Array.from({ length: 5 }, () =>
      small.take("https://cdn.test/a.jpg"),
    )
    expect(taken).toEqual([true, true, true, false, false])

    const raised = new ImageBudget(20, 0, 10)
    expect(
      Array.from({ length: 10 }, () =>
        raised.take("https://cdn.test/a.jpg"),
      ).every(Boolean),
    ).toBe(true)
    expect(raised.take("https://cdn.test/a.jpg")).toBe(false)
  })
})
