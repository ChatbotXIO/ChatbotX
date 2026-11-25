import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claimDue: vi.fn(),
  lockLease: vi.fn(),
  markDue: vi.fn(),
  queueAdd: vi.fn(),
  queueGetJob: vi.fn(),
  claimRun: vi.fn(),
  countCreatedSince: vi.fn(),
  oldestCreatedSince: vi.fn(),
  fetcher: vi.fn(),
  acquire: vi.fn(),
  createInTx: vi.fn(),
  discard: vi.fn(),
  findDestinations: vi.fn(),
  findKnownKeys: vi.fn(),
  finishRun: vi.fn(),
  insertItem: vi.fn(),
  insertItems: vi.fn(),
  listDestinations: vi.fn(),
  maxPublishedAt: vi.fn(),
  parseFeed: vi.fn(),
  pictures: vi.fn(),
  budgets: [] as {
    articleReads: number
    attempts: number
    domainLimit: number
  }[],
  prepare: vi.fn(),
  pruneItems: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: (run: (tx: object) => unknown) => run({}) },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  socialPostFeedRepository: {
    claimDue: mocks.claimDue,
    lockLease: mocks.lockLease,
    markDue: mocks.markDue,
    claimRun: mocks.claimRun,
    countCreatedSince: mocks.countCreatedSince,
    oldestCreatedSince: mocks.oldestCreatedSince,
    attachPost: vi.fn(),
    findKnownKeys: mocks.findKnownKeys,
    findWorkspaceTimezone: vi.fn().mockResolvedValue("UTC"),
    finishRun: mocks.finishRun,
    // The transaction argument is not what these tests are about.
    insertItem: (row: unknown) => mocks.insertItem(row),
    insertItems: (rows: unknown) => mocks.insertItems(rows),
    listDestinations: mocks.listDestinations,
    maxPublishedAt: mocks.maxPublishedAt,
    pruneItems: mocks.pruneItems,
  },
  socialPostRepository: { findDestinations: mocks.findDestinations },
  socialPostSnippetRepository: { findById: vi.fn() },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  PostPublishJobAction: { runFeed: "runFeed" },
  postFeedJobId: (id: string) => id,
  postPublishQueue: { add: mocks.queueAdd, getJob: mocks.queueGetJob },
}))
vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))
vi.mock("../src/social-post/hash", () => ({ requestHash: vi.fn() }))
vi.mock("../src/social-post/notify", () => ({
  emitSocialPostChanged: vi.fn(),
}))
vi.mock("../src/social-post/schedule.service", () => ({
  socialPostScheduleService: { prepare: mocks.prepare },
}))
vi.mock("../src/social-post/service", () => ({
  socialPostService: { createInTx: mocks.createInTx },
}))
vi.mock("../src/social-post-feed/feed-media", () => ({
  acquireFeedMedia: mocks.acquire,
  discardImportedFile: mocks.discard,
  ImageBudget: class {
    articleReads: number
    attempts: number
    constructor(attempts: number, articleReads = 0, domainLimit = 3) {
      this.articleReads = articleReads
      this.attempts = attempts
      mocks.budgets.push({ articleReads, attempts, domainLimit })
    }
    take() {
      return true
    }
  },
  pictureCandidates: mocks.pictures,
}))
vi.mock("../src/social-post-snippet/service", () => ({
  composeSignedText: vi.fn((text: string) => text),
}))
vi.mock("../src/social-post-feed/fetcher", () => ({
  FeedFetchError: class FeedFetchError extends Error {},
  registeredFeedFetcher: () => mocks.fetcher,
}))
vi.mock("../src/social-post-feed/parse", () => ({
  FeedParseError: class FeedParseError extends Error {},
  parseFeed: mocks.parseFeed,
}))

const { ChatbotXException } = await import("../src/errors")
const { itemRefusalReason, socialPostFeedRunner } = await import(
  "../src/social-post-feed/runner"
)

const NOW = Date.now()
const HOUR_MS = 60 * 60 * 1000

const feed = {
  consecutiveFailures: 0,
  intervalMinutes: 60,
  dailyCap: 10,
  etag: null,
  id: "feed-1",
  lastModified: null,
  maxItemsPerRun: 5,
  filters: null,
  mediaField: null,
  mediaLibraryFileIds: [],
  mediaMode: "none",
  mode: "queue",
  noImageFallback: "text",
  postAs: "text",
  primedAt: new Date(NOW - 48 * HOUR_MS),
  signatureId: null,
  startedAt: new Date(NOW - 48 * HOUR_MS),
  templateSyntax: "v2",
  textTemplate: "{{ title }}",
  workspaceId: "ws-1",
}

const item = (
  itemKey: string,
  publishedAt: Date | null,
  extra: Record<string, unknown> = {},
) => ({
  author: null,
  categories: [] as string[],
  content: null,
  feedLink: null,
  feedTitle: null,
  fields: {},
  image: null,
  images: [] as { source: string; url: string }[],
  summary: null,
  itemKey,
  link: `https://example.test/${itemKey}`,
  publishedAt,
  title: itemKey,
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.budgets.length = 0
  mocks.maxPublishedAt.mockResolvedValue(null)
  mocks.lockLease.mockResolvedValue(true)
  mocks.finishRun.mockResolvedValue(true)
  mocks.claimRun.mockResolvedValue(feed)
  mocks.fetcher.mockResolvedValue({ body: "<rss/>", etag: null, kind: "ok" })
  mocks.findKnownKeys.mockResolvedValue(new Set())
  mocks.listDestinations.mockResolvedValue([])
  mocks.findDestinations.mockResolvedValue([])
  mocks.countCreatedSince.mockResolvedValue(0)
  mocks.oldestCreatedSince.mockResolvedValue(null)
  mocks.pictures.mockReturnValue([])
  mocks.acquire.mockResolvedValue({
    created: false,
    fileId: null,
    imageError: null,
    imageSource: null,
    imageUrl: null,
  })
})

const FACEBOOK = [{ id: "d1", provider: "facebook" }]

describe("socialPostFeedRunner.runFeed eligibility after priming", () => {
  test("an undated item is recorded as skipped and never becomes a post", async () => {
    mocks.parseFeed.mockResolvedValue([item("undated", null)])

    const result = await socialPostFeedRunner.runFeed({
      id: "feed-1",
      workspaceId: "ws-1",
    })

    expect(mocks.insertItems).toHaveBeenCalledWith([
      expect.objectContaining({
        itemKey: "undated",
        outcome: "skippedOld",
        reason: "undated",
      }),
    ])
    expect(mocks.insertItem).not.toHaveBeenCalled()
    expect(result).toMatchObject({ created: 0, kind: "checked" })
  })

  test("an item older than the feed is skipped while a newer one is processed", async () => {
    mocks.parseFeed.mockResolvedValue([
      item("older", new Date(NOW - 72 * HOUR_MS)),
      item("newer", new Date(NOW - HOUR_MS)),
    ])

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.insertItems).toHaveBeenCalledWith([
      expect.objectContaining({
        itemKey: "older",
        outcome: "skippedOld",
        reason: "tooOld",
      }),
    ])
    // A feed with no destination left is a configuration problem: the item is not burnt.
    expect(mocks.insertItem).not.toHaveBeenCalled()
  })
})

describe("socialPostFeedRunner.runFeed refused items", () => {
  test("a content refusal is recorded with its short code, never its message", async () => {
    mocks.parseFeed.mockResolvedValue([item("fresh", new Date(NOW))])
    mocks.listDestinations.mockResolvedValue([{ destinationId: "d1" }])
    mocks.findDestinations.mockResolvedValue(FACEBOOK)
    mocks.prepare.mockRejectedValue(
      new ChatbotXException(
        "Destination 1 (text): too long for you",
        "socialPostContentInvalid",
        422,
      ),
    )

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "skippedInvalid",
        reason: "socialPostContentInvalid",
      }),
    )
  })
})

describe("socialPostFeedRunner.runFeed pace", () => {
  test("queue mode asks for auto-spacing, so a destination with no posting schedule is not refused", async () => {
    mocks.parseFeed.mockResolvedValue([item("fresh", new Date(NOW))])
    mocks.listDestinations.mockResolvedValue([{ destinationId: "d1" }])
    mocks.findDestinations.mockResolvedValue(FACEBOOK)
    mocks.prepare.mockRejectedValue(
      new ChatbotXException("stop here", "stop", 422),
    )

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.prepare).toHaveBeenCalledWith({
      plan: { autoSpacing: true, queue: "next" },
      workspaceId: "ws-1",
    })
  })

  test("the feed's daily cap never exceeds the smallest cap of its destinations", async () => {
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW))])
    // A feed cap above the network's: TikTok's own default is 15 a day.
    mocks.claimRun.mockResolvedValue({ ...feed, dailyCap: 100 })
    mocks.listDestinations.mockResolvedValue([{ destinationId: "d1" }])
    mocks.findDestinations.mockResolvedValue([{ id: "d1", provider: "tiktok" }])
    mocks.countCreatedSince.mockResolvedValue(15)

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    // 15 created today against the destination's 15: nothing more is created.
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
})

describe("socialPostFeedRunner.runFeed auto-pause", () => {
  const failure = async () => {
    const { FeedFetchError } = await import("../src/social-post-feed/fetcher")
    return Object.assign(new FeedFetchError("down"), { code: "unreachable" })
  }

  test("the 5th consecutive failure parks the feed in error, the 4th does not", async () => {
    mocks.fetcher.mockRejectedValue(await failure())

    mocks.claimRun.mockResolvedValue({ ...feed, consecutiveFailures: 3 })
    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })
    expect(mocks.finishRun.mock.calls.at(-1)?.[0].result).toMatchObject({
      consecutiveFailures: 4,
      lastErrorCode: "unreachable",
      status: "active",
    })

    mocks.claimRun.mockResolvedValue({ ...feed, consecutiveFailures: 4 })
    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })
    expect(mocks.finishRun.mock.calls.at(-1)?.[0].result).toMatchObject({
      consecutiveFailures: 5,
      status: "error",
    })
  })

  test("a finished check is next due one interval after it ends, even after a long queue wait", async () => {
    mocks.fetcher.mockRejectedValue(await failure())
    mocks.claimRun.mockResolvedValue({ ...feed, intervalMinutes: 30 })
    const before = Date.now()
    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })
    const next: Date = mocks.finishRun.mock.calls.at(-1)?.[0].result.nextCheckAt
    expect(next.getTime()).toBeGreaterThanOrEqual(before + 30 * 60 * 1000)
    expect(next.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 60 * 1000)
  })

  test("a successful check resets the failure counter and the error code", async () => {
    mocks.claimRun.mockResolvedValue({ ...feed, consecutiveFailures: 4 })
    mocks.parseFeed.mockResolvedValue([])

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.finishRun.mock.calls.at(-1)?.[0].result).toMatchObject({
      consecutiveFailures: 0,
      lastErrorCode: null,
      status: "active",
    })
  })
})

describe("socialPostFeedRunner.runFeed first check", () => {
  const unprimed = { ...feed, primedAt: null }
  const items = [
    item("newest", new Date(NOW - HOUR_MS)),
    item("older", new Date(NOW - 2 * HOUR_MS)),
  ]

  test("only records the items by default", async () => {
    mocks.claimRun.mockResolvedValue(unprimed)
    mocks.parseFeed.mockResolvedValue(items)
    mocks.listDestinations.mockResolvedValue([{ destinationId: "d1" }])

    const result = await socialPostFeedRunner.runFeed({
      id: "feed-1",
      workspaceId: "ws-1",
    })

    expect(mocks.insertItems.mock.calls[0]?.[0]).toHaveLength(2)
    expect(mocks.insertItem).not.toHaveBeenCalled()
    expect(result).toMatchObject({ created: 0, primed: true })
  })

  test("postLatestOnFirstCheck makes a post from the newest item only", async () => {
    mocks.claimRun.mockResolvedValue({
      ...unprimed,
      postLatestOnFirstCheck: true,
    })
    mocks.parseFeed.mockResolvedValue(items)
    mocks.listDestinations.mockResolvedValue([{ destinationId: "d1" }])
    mocks.findDestinations.mockResolvedValue(FACEBOOK)
    mocks.prepare.mockRejectedValue(
      new ChatbotXException("Too long.", "socialPostContentInvalid", 422),
    )

    const result = await socialPostFeedRunner.runFeed({
      id: "feed-1",
      workspaceId: "ws-1",
    })

    expect(mocks.insertItems.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ itemKey: "older", reason: "existing" }),
    ])
    // The newest item went through the normal creation path (refused here by the mocked schedule).
    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemKey: "newest",
        reason: "socialPostContentInvalid",
      }),
    )
    expect(result).toMatchObject({ invalid: 1, primed: true })
  })
})

describe("socialPostFeedRunner.runFeed filters", () => {
  const filtered = {
    ...feed,
    filters: { excludeAny: ["Quảng cáo"], includeAny: ["tin"] },
  }

  test("items the filters drop are ledgered for good and never reach the capacity", async () => {
    mocks.claimRun.mockResolvedValue({ ...filtered, maxItemsPerRun: 1 })
    mocks.parseFeed.mockResolvedValue([
      item("a", new Date(NOW), { title: "Tin nóng" }),
      item("b", new Date(NOW - 1000), { title: "Khuyến mãi" }),
      item("c", new Date(NOW - 2000), { title: "Tin QUẢNG CÁO" }),
    ])

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.insertItems.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        itemKey: "b",
        outcome: "skippedFiltered",
        reason: "missingKeyword",
      }),
      expect.objectContaining({
        itemKey: "c",
        outcome: "skippedFiltered",
        reason: "excludedKeyword",
      }),
    ])
    // Only "a" went on to creation; this fixture has no destination, which blocks the check
    // (nothing recorded for "a", it is retried) instead of burning the item.
    expect(mocks.insertItem).not.toHaveBeenCalled()
  })
})

describe("socialPostFeedRunner.runFeed pictures and destinations", () => {
  const photo = {
    ...feed,
    mediaMode: "auto",
    noImageFallback: "skip",
    postAs: "photo",
  }
  const destinations = [
    { id: "fb", provider: "facebook" },
    { id: "ig", provider: "instagram" },
    { id: "tt", provider: "tiktok" },
  ]

  test("an item with a picture goes to the networks that carry a picture, the rest are listed", async () => {
    mocks.claimRun.mockResolvedValue(photo)
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW))])
    mocks.listDestinations.mockResolvedValue(
      destinations.map((d) => ({ destinationId: d.id })),
    )
    mocks.findDestinations.mockResolvedValue(destinations)
    mocks.pictures.mockReturnValue([
      { source: "enclosure", url: "https://img.test/a.jpg" },
    ])
    mocks.acquire.mockResolvedValue({
      created: true,
      fileId: "file-1",
      imageError: null,
      imageSource: "enclosure",
      imageUrl: "https://img.test/a.jpg",
    })
    mocks.prepare.mockResolvedValue(undefined)
    mocks.insertItem.mockResolvedValue({ id: "ledger-1" })
    mocks.createInTx.mockResolvedValue({ created: true, id: "post-1" })

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.createInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        media: [{ altText: "a", mediaLibraryFileId: "file-1" }],
        targets: [{ destinationId: "fb" }, { destinationId: "ig" }],
      }),
    )
    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        droppedDestinationIds: ["tt"],
        imageSource: "enclosure",
        outcome: "created",
        reason: "droppedTargets",
      }),
    )
  })

  test("without a picture and a skip fallback the item is recorded as skippedNoImage", async () => {
    mocks.claimRun.mockResolvedValue(photo)
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW))])
    mocks.listDestinations.mockResolvedValue([{ destinationId: "fb" }])
    mocks.findDestinations.mockResolvedValue([destinations[0]])
    mocks.acquire.mockResolvedValue({
      created: false,
      fileId: null,
      imageError: "unreachable",
      imageSource: "enclosure",
      imageUrl: "https://img.test/a.jpg",
    })

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        imageError: "unreachable",
        outcome: "skippedNoImage",
        reason: "noImage",
      }),
    )
    expect(mocks.createInTx).not.toHaveBeenCalled()
  })

  test("without a picture, Instagram and TikTok are dropped and the link fallback posts to Facebook; every destination dropped skips the item", async () => {
    mocks.claimRun.mockResolvedValue({ ...photo, noImageFallback: "link" })
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW))])
    mocks.listDestinations.mockResolvedValue(
      destinations.map((d) => ({ destinationId: d.id })),
    )
    mocks.findDestinations.mockResolvedValue(destinations)
    mocks.insertItem.mockResolvedValue({ id: "ledger-1" })
    mocks.createInTx.mockResolvedValue({ created: true, id: "post-1" })

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.createInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        linkUrl: "https://example.test/a",
        media: [],
        targets: [{ destinationId: "fb" }],
      }),
    )
    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        droppedDestinationIds: ["ig", "tt"],
        reason: "noImageFallback,droppedTargets",
      }),
    )

    vi.clearAllMocks()
    mocks.claimRun.mockResolvedValue({ ...photo, noImageFallback: "link" })
    mocks.fetcher.mockResolvedValue({ body: "<rss/>", etag: null, kind: "ok" })
    mocks.findKnownKeys.mockResolvedValue(new Set())
    mocks.countCreatedSince.mockResolvedValue(0)
    mocks.pictures.mockReturnValue([])
    mocks.acquire.mockResolvedValue({
      created: false,
      fileId: null,
      imageError: null,
      imageSource: null,
      imageUrl: null,
    })
    mocks.parseFeed.mockResolvedValue([item("b", new Date(NOW))])
    mocks.listDestinations.mockResolvedValue([{ destinationId: "ig" }])
    mocks.findDestinations.mockResolvedValue([destinations[1]])

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        droppedDestinationIds: ["ig"],
        outcome: "skippedNoImage",
        reason: "noDestinationAccepts",
      }),
    )
  })

  test("a feed still on the legacy syntax renders {title} the old way", async () => {
    mocks.claimRun.mockResolvedValue({
      ...feed,
      templateSyntax: "legacy",
      textTemplate: "{title} {link}",
    })
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW))])
    mocks.listDestinations.mockResolvedValue([{ destinationId: "fb" }])
    mocks.findDestinations.mockResolvedValue([destinations[0]])
    mocks.prepare.mockResolvedValue(undefined)
    mocks.insertItem.mockResolvedValue({ id: "ledger-1" })
    mocks.createInTx.mockResolvedValue({ created: true, id: "post-1" })

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.createInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ text: "a https://example.test/a" }),
    )
  })

  test("a failed transaction removes the picture this run imported", async () => {
    mocks.claimRun.mockResolvedValue(photo)
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW))])
    mocks.listDestinations.mockResolvedValue([{ destinationId: "fb" }])
    mocks.findDestinations.mockResolvedValue([destinations[0]])
    mocks.acquire.mockResolvedValue({
      created: true,
      fileId: "file-9",
      imageError: null,
      imageSource: "enclosure",
      imageUrl: "https://img.test/a.jpg",
    })
    mocks.prepare.mockResolvedValue(undefined)
    mocks.insertItem.mockResolvedValue({ id: "ledger-1" })
    mocks.createInTx.mockRejectedValue(new Error("database down"))

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.discard).toHaveBeenCalledWith({
      fileId: "file-9",
      workspaceId: "ws-1",
    })
  })
})

describe("socialPostFeedRunner.runFeed per-network text", () => {
  const networks = [
    { id: "fb", provider: "facebook" },
    { id: "ig", provider: "threads" },
  ]
  const setup = (overrides: Record<string, unknown>) => {
    mocks.claimRun.mockResolvedValue({ ...feed, ...overrides })
    mocks.parseFeed.mockResolvedValue([
      item("a", new Date(NOW), { categories: ["Sale"] }),
    ])
    mocks.listDestinations.mockResolvedValue(
      networks.map((n) => ({ destinationId: n.id })),
    )
    mocks.findDestinations.mockResolvedValue(networks)
    mocks.prepare.mockResolvedValue(undefined)
    mocks.insertItem.mockResolvedValue({ id: "ledger-1" })
    mocks.createInTx.mockResolvedValue({ created: true, id: "post-1" })
  }

  test("a network's own text becomes that target's text only; the rest keep the shared text", async () => {
    setup({
      postAs: "text",
      templatesByProvider: {
        threads: "{{ title }} {{ categories | hashtags: 2 }}",
      },
    })

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.createInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targets: [
          { destinationId: "fb" },
          { destinationId: "ig", text: "a #Sale" },
        ],
        text: "a",
      }),
    )
  })

  test("a network template identical to the shared text adds no override", async () => {
    setup({ templatesByProvider: { threads: "{{ title }}" } })

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.createInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targets: [{ destinationId: "fb" }, { destinationId: "ig" }],
      }),
    )
  })

  test("a network whose text renders empty is left out and listed, the others still post", async () => {
    setup({
      templatesByProvider: { threads: "{{#if author}}{{ author }}{{/if}}" },
    })

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.createInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targets: [{ destinationId: "fb" }] }),
    )
    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        droppedDestinationIds: ["ig"],
        outcome: "created",
        reason: "droppedTargets",
      }),
    )
  })

  test("a network template that cannot render records the item as a template error", async () => {
    setup({ templatesByProvider: { threads: "{{ title | nope }}" } })

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.createInTx).not.toHaveBeenCalled()
    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "skippedInvalid",
        reason: "templateError",
      }),
    )
  })

  test("a legacy feed ignores network templates", async () => {
    setup({
      templateSyntax: "legacy",
      templatesByProvider: { threads: "{{ title }} IG" },
      textTemplate: "{title}",
    })

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    expect(mocks.createInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targets: [{ destinationId: "fb" }, { destinationId: "ig" }],
      }),
    )
  })
})

describe("socialPostFeedRunner.runFeed article picture budget", () => {
  const fb = [{ id: "fb", provider: "facebook" }]
  const run = async (overrides: Record<string, unknown>) => {
    mocks.claimRun.mockResolvedValue({ ...feed, ...overrides })
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW))])
    mocks.listDestinations.mockResolvedValue([{ destinationId: "fb" }])
    mocks.findDestinations.mockResolvedValue(fb)
    mocks.prepare.mockResolvedValue(undefined)
    mocks.insertItem.mockResolvedValue({ id: "ledger-1" })
    mocks.createInTx.mockResolvedValue({ created: true, id: "post-1" })
    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })
  }

  test("the article read budget is the per-check item limit, and only when the setting is on", async () => {
    await run({
      fetchArticleImage: true,
      maxItemsPerRun: 3,
      mediaMode: "auto",
      postAs: "photo",
    })
    expect(mocks.budgets).toEqual([
      { articleReads: 3, attempts: 6, domainLimit: 9 },
    ])

    mocks.budgets.length = 0
    await run({ fetchArticleImage: false, maxItemsPerRun: 3 })
    expect(mocks.budgets).toEqual([
      { articleReads: 0, attempts: 6, domainLimit: 9 },
    ])
  })

  test("the item's link is what the article finder is given, only for items that reach the post step", async () => {
    await run({ fetchArticleImage: true, mediaMode: "auto", postAs: "photo" })

    expect(mocks.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ articleUrl: "https://example.test/a" }),
    )
  })

  test("an item the filters drop never reaches the picture step", async () => {
    await run({
      fetchArticleImage: true,
      filters: { includeAny: ["nomatch"] },
      mediaMode: "auto",
      postAs: "photo",
    })

    expect(mocks.acquire).not.toHaveBeenCalled()
    expect(mocks.insertItems).toHaveBeenCalledWith([
      expect.objectContaining({ outcome: "skippedFiltered" }),
    ])
  })

  test("items over the per-check limit never reach the picture step and are not recorded", async () => {
    mocks.claimRun.mockResolvedValue({
      ...feed,
      fetchArticleImage: true,
      maxItemsPerRun: 1,
      mediaMode: "auto",
      postAs: "photo",
    })
    mocks.parseFeed.mockResolvedValue([
      item("a", new Date(NOW)),
      item("b", new Date(NOW - 1000)),
    ])
    mocks.listDestinations.mockResolvedValue([{ destinationId: "fb" }])
    mocks.findDestinations.mockResolvedValue(fb)
    mocks.prepare.mockResolvedValue(undefined)
    mocks.insertItem.mockResolvedValue({ id: "ledger-1" })
    mocks.createInTx.mockResolvedValue({ created: true, id: "post-1" })

    await socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

    // Oldest first: "b" is the one posted, "a" waits for the next check.
    expect(mocks.acquire).toHaveBeenCalledTimes(1)
    expect(mocks.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ itemKey: "b" }),
    )
    expect(mocks.insertItems).toHaveBeenCalledWith([])
    expect(JSON.stringify(mocks.insertItem.mock.calls)).not.toContain(
      "perRunLimit",
    )
  })
})

describe("socialPostFeedRunner.runFeed per-check limit and refusals", () => {
  const fb = [{ id: "fb", provider: "facebook" }]
  const items = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      item(`i${index}`, new Date(NOW - (count - index) * 60_000)),
    )
  const setup = (overrides: Record<string, unknown>, count: number) => {
    mocks.claimRun.mockResolvedValue({ ...feed, ...overrides })
    mocks.parseFeed.mockResolvedValue(items(count))
    mocks.listDestinations.mockResolvedValue([{ destinationId: "fb" }])
    mocks.findDestinations.mockResolvedValue(fb)
    mocks.prepare.mockResolvedValue(undefined)
    mocks.insertItem.mockResolvedValue({ id: "ledger-1" })
    mocks.createInTx.mockResolvedValue({ created: true, id: "post-1" })
  }
  const run = () =>
    socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })
  const createdKeys = () =>
    mocks.insertItem.mock.calls
      .filter(([row]) => row.outcome === "created")
      .map(([row]) => row.itemKey)

  test("(a) the overflow is not recorded, at most maxItemsPerRun are created, oldest first, and the next run continues", async () => {
    setup({ maxItemsPerRun: 2 }, 5)

    const first = await run()

    expect(first).toMatchObject({ created: 2, kind: "checked" })
    expect(createdKeys()).toEqual(["i0", "i1"])
    expect(mocks.insertItems).toHaveBeenCalledWith([])

    // The next check: the first two are known, the rest is still there.
    mocks.insertItem.mockClear()
    mocks.findKnownKeys.mockResolvedValue(new Set(["i0", "i1"]))
    const second = await run()

    expect(second).toMatchObject({ created: 2 })
    expect(createdKeys()).toEqual(["i2", "i3"])
  })

  test("a capped run stores no validators, so the next check re-reads the body and takes the rest", async () => {
    setup({ maxItemsPerRun: 2 }, 5)
    mocks.fetcher.mockResolvedValue({
      body: "<rss/>",
      etag: '"v1"',
      kind: "ok",
      lastModified: "Mon, 01 Jan 2024 00:00:00 GMT",
    })

    const first = await run()

    expect(first).toMatchObject({ kind: "checked", waiting: 3 })
    const stored = mocks.finishRun.mock.calls.at(-1)?.[0].result
    expect(stored).toMatchObject({ etag: null, lastModified: null })
  })

  test("a run with nothing left waiting keeps the validators", async () => {
    setup({ maxItemsPerRun: 5 }, 2)
    mocks.fetcher.mockResolvedValue({
      body: "<rss/>",
      etag: '"v1"',
      kind: "ok",
      lastModified: null,
    })

    await run()

    const stored = mocks.finishRun.mock.calls.at(-1)?.[0].result
    expect(stored).toMatchObject({ etag: '"v1"' })
  })

  test("(b) a refused candidate does not use a place: the overflow still gets its turn", async () => {
    setup({ maxItemsPerRun: 2 }, 4)
    mocks.createInTx
      .mockRejectedValueOnce(
        Object.assign(
          new ChatbotXException("bad", "socialPostContentInvalid", 422),
          {},
        ),
      )
      .mockResolvedValue({ created: true, id: "post-1" })

    const result = await run()

    expect(result).toMatchObject({ created: 2, invalid: 1 })
    // i0 was refused (recorded), i1 and i2 took the two places; i3 waits.
    expect(mocks.createInTx).toHaveBeenCalledTimes(3)
    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({ itemKey: "i0", outcome: "skippedInvalid" }),
    )
    expect(mocks.insertItem).not.toHaveBeenCalledWith(
      expect.objectContaining({ itemKey: "i3" }),
      expect.anything(),
    )
  })

  test("(c) a refusal that is not about the item writes no ledger row, stops the run, sets lastErrorCode and is retried", async () => {
    for (const refusal of [
      new ChatbotXException("no schedule", "validation", 422),
      new ChatbotXException("blocked", "workspaceBlocked", 402),
      new ChatbotXException("busy", "notSchedulable", 409),
      new ChatbotXException("slow down", "rateLimited", 429),
    ]) {
      vi.clearAllMocks()
      mocks.findKnownKeys.mockResolvedValue(new Set())
      mocks.fetcher.mockResolvedValue({
        body: "<rss/>",
        etag: null,
        kind: "ok",
      })
      mocks.countCreatedSince.mockResolvedValue(0)
      mocks.pictures.mockReturnValue([])
      setup({ maxItemsPerRun: 3, mode: "queue" }, 3)
      mocks.prepare.mockRejectedValue(refusal)

      const result = await run()

      expect(result).toEqual({ code: "postRefused", kind: "failed" })
      expect(mocks.insertItem).not.toHaveBeenCalled()
      expect(mocks.prepare).toHaveBeenCalledTimes(1)
      expect(mocks.finishRun).toHaveBeenCalledWith(
        expect.objectContaining({
          result: expect.objectContaining({
            consecutiveFailures: 1,
            lastErrorCode: "postRefused",
          }),
        }),
      )
    }

    // Fixed: the next check creates the post.
    vi.clearAllMocks()
    mocks.findKnownKeys.mockResolvedValue(new Set())
    mocks.fetcher.mockResolvedValue({ body: "<rss/>", etag: null, kind: "ok" })
    mocks.countCreatedSince.mockResolvedValue(0)
    mocks.pictures.mockReturnValue([])
    setup({ maxItemsPerRun: 3, mode: "queue" }, 3)
    expect(await run()).toMatchObject({ created: 3 })
  })

  test("(c) the same holds for a refusal raised inside the transaction", async () => {
    setup({ maxItemsPerRun: 3 }, 3)
    mocks.createInTx.mockRejectedValue(
      new ChatbotXException("conflict", "idempotencyConflict", 409),
    )

    const result = await run()

    expect(result).toEqual({ code: "postRefused", kind: "failed" })
    expect(mocks.insertItem).toHaveBeenCalledTimes(1) // only the ledger insert inside the rolled-back transaction
    // Every ledger write is fenced in a transaction (see the lease tests).
    expect(createdKeys()).toEqual(["i0"]) // attempted in the transaction, which rolled back
  })

  test("(d) a content refusal is recorded as skippedInvalid with the specific issue codes", async () => {
    setup({ maxItemsPerRun: 1 }, 1)
    const refusal = new ChatbotXException(
      "Destination 1 (text): too long",
      "socialPostContentInvalid",
      422,
    )
    refusal.data = {
      issues: JSON.stringify([
        { code: "textTooLong", field: "text" },
        { code: "tooManyLinks", field: "text" },
        { code: "textTooLong", field: "text" },
      ]),
    }
    mocks.createInTx.mockRejectedValue(refusal)

    const result = await run()

    expect(result).toMatchObject({ created: 0, invalid: 1, kind: "checked" })
    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "skippedInvalid",
        reason: "socialPostContentInvalid,textTooLong,tooManyLinks",
      }),
    )
  })

  test("(d) a content refusal without issue details still records its code", async () => {
    setup({ maxItemsPerRun: 1 }, 1)
    mocks.createInTx.mockRejectedValue(
      new ChatbotXException("x", "socialPostContentInvalid", 422),
    )

    await run()

    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "socialPostContentInvalid" }),
    )
  })

  test("a server error is not a refusal: it propagates as an internal failure and records nothing", async () => {
    setup({ maxItemsPerRun: 1 }, 1)
    mocks.createInTx.mockRejectedValue(new Error("database down"))

    expect(await run()).toEqual({ code: "internal", kind: "failed" })
  })
})

const contentRefusal = (
  issues: { code: string; field: string }[],
): InstanceType<typeof ChatbotXException> => {
  const refusal = new ChatbotXException("x", "socialPostContentInvalid", 422)
  refusal.data = { issues: JSON.stringify(issues) }
  return refusal
}

describe("itemRefusalReason", () => {
  test("a content issue is the item's; a destination issue is not, even beside a content one", () => {
    expect(
      itemRefusalReason(
        contentRefusal([{ code: "textTooLong", field: "text" }]),
      ),
    ).toBe("socialPostContentInvalid,textTooLong")
    for (const code of [
      "accountDisconnected",
      "accountNeedsReauth",
      "destinationInactive",
      "inboxDisconnected",
      "publishPermissionMissing",
    ]) {
      expect(
        itemRefusalReason(contentRefusal([{ code, field: "destination" }])),
      ).toBeNull()
    }
    expect(
      itemRefusalReason(
        contentRefusal([
          { code: "textTooLong", field: "text" },
          { code: "accountDisconnected", field: "destination" },
        ]),
      ),
    ).toBeNull()
    expect(
      itemRefusalReason(
        contentRefusal([
          { code: "someFutureDestinationThing", field: "destination" },
        ]),
      ),
    ).toBeNull()
  })
})

describe("socialPostFeedRunner.runFeed destinations, budgets and attempts", () => {
  const fb = [{ id: "fb", provider: "facebook" }]
  const setup = (overrides: Record<string, unknown>, count: number) => {
    mocks.claimRun.mockResolvedValue({ ...feed, ...overrides })
    mocks.parseFeed.mockResolvedValue(
      Array.from({ length: count }, (_, index) =>
        item(`i${index}`, new Date(NOW - (count - index) * 60_000)),
      ),
    )
    mocks.listDestinations.mockResolvedValue([{ destinationId: "fb" }])
    mocks.findDestinations.mockResolvedValue(fb)
    mocks.prepare.mockResolvedValue(undefined)
    mocks.insertItem.mockResolvedValue({ id: "ledger-1" })
    mocks.createInTx.mockResolvedValue({ created: true, id: "post-1" })
  }
  const run = () =>
    socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })

  test("a disconnected destination is the feed's problem: nothing is ledgered and the feed fails with postRefused", async () => {
    setup({}, 2)
    mocks.createInTx.mockRejectedValue(
      contentRefusal([{ code: "accountDisconnected", field: "destination" }]),
    )

    expect(await run()).toEqual({ code: "postRefused", kind: "failed" })
    expect(mocks.insertItem).toHaveBeenCalledTimes(1) // only inside the rolled-back transaction
  })

  test("a healthy destination with a content issue is still ledgered as the item's", async () => {
    setup({}, 1)
    mocks.createInTx.mockRejectedValue(
      contentRefusal([{ code: "tooManyLinks", field: "text" }]),
    )

    expect(await run()).toMatchObject({ invalid: 1, kind: "checked" })
    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "socialPostContentInvalid,tooManyLinks",
      }),
    )
  })

  test("a spent picture budget defers the item: no ledger row, the loop stops", async () => {
    setup({ mediaMode: "auto", noImageFallback: "skip", postAs: "photo" }, 4)
    mocks.pictures.mockReturnValue([
      { source: "enclosure", url: "https://cdn.test/a.jpg" },
    ])
    mocks.acquire.mockResolvedValue({
      created: false,
      fileId: null,
      imageError: "budget",
      imageSource: "enclosure",
      imageUrl: "https://cdn.test/a.jpg",
    })

    const result = await run()

    expect(result).toMatchObject({ created: 0, invalid: 0, kind: "checked" })
    expect(mocks.acquire).toHaveBeenCalledTimes(1)
    expect(mocks.insertItem).not.toHaveBeenCalled()
  })

  test("the per-host picture limit is at least what a check may post", () => {
    setup({ maxItemsPerRun: 5 }, 1)
    return run().then(() => {
      expect(mocks.budgets[0]).toMatchObject({ domainLimit: 15 })
    })
  })

  test("a check tries at most three items per place, every outcome counted, and leaves the rest unrecorded", async () => {
    setup({ maxItemsPerRun: 2 }, 10)
    mocks.createInTx.mockRejectedValue(
      contentRefusal([{ code: "textTooLong", field: "text" }]),
    )

    const result = await run()

    expect(mocks.createInTx).toHaveBeenCalledTimes(6)
    expect(result).toMatchObject({ created: 0, invalid: 6 })
    expect(
      mocks.insertItem.mock.calls.filter(
        ([row]) => row.outcome === "skippedInvalid",
      ),
    ).toHaveLength(6)
  })

  test("a check stops trying items once its time budget is spent", async () => {
    setup({ maxItemsPerRun: 5 }, 10)
    const started = Date.now()
    const clock = vi.spyOn(Date, "now")
    clock.mockReturnValue(started + 60 * 60 * 1000)

    await run()
    clock.mockRestore()

    expect(mocks.createInTx).not.toHaveBeenCalled()
  })

  test("an idempotency conflict means the item already has its post: it is ledgered, not a failure", async () => {
    setup({}, 2)
    mocks.createInTx
      .mockRejectedValueOnce(
        new ChatbotXException("key in use", "socialPostKeyConflict", 409),
      )
      .mockResolvedValue({ created: true, id: "post-1" })

    const result = await run()

    expect(result).toMatchObject({ created: 1, kind: "checked" })
    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemKey: "i0",
        outcome: "skippedOld",
        reason: "alreadyPosted",
      }),
    )
  })

  test("a shared text that renders empty does not skip an item whose networks all have their own text", async () => {
    mocks.claimRun.mockResolvedValue({
      ...feed,
      templatesByProvider: {
        facebook: "FB {{ title }}",
        threads: "TH {{ title }}",
      },
      textTemplate: "{{#if author}}{{ author }}{{/if}}",
    })
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW))])
    const both = [
      { id: "fb", provider: "facebook" },
      { id: "th", provider: "threads" },
    ]
    mocks.listDestinations.mockResolvedValue(
      both.map((d) => ({ destinationId: d.id })),
    )
    mocks.findDestinations.mockResolvedValue(both)
    mocks.prepare.mockResolvedValue(undefined)
    mocks.insertItem.mockResolvedValue({ id: "ledger-1" })
    mocks.createInTx.mockResolvedValue({ created: true, id: "post-1" })

    await run()

    expect(mocks.createInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targets: [
          { destinationId: "fb" },
          { destinationId: "th", text: "TH a" },
        ],
        text: "FB a",
      }),
    )
  })

  test("a network that relies on an empty shared text is left out while the one with its own text posts", async () => {
    mocks.claimRun.mockResolvedValue({
      ...feed,
      templatesByProvider: { facebook: "FB {{ title }}" },
      textTemplate: "{{#if author}}{{ author }}{{/if}}",
    })
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW))])
    const both = [
      { id: "fb", provider: "facebook" },
      { id: "th", provider: "threads" },
    ]
    mocks.listDestinations.mockResolvedValue(
      both.map((d) => ({ destinationId: d.id })),
    )
    mocks.findDestinations.mockResolvedValue(both)
    mocks.prepare.mockResolvedValue(undefined)
    mocks.insertItem.mockResolvedValue({ id: "ledger-1" })
    mocks.createInTx.mockResolvedValue({ created: true, id: "post-1" })

    await run()

    expect(mocks.createInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targets: [{ destinationId: "fb" }],
        text: "FB a",
      }),
    )
    expect(mocks.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        droppedDestinationIds: ["th"],
        outcome: "created",
      }),
    )
  })
})

describe("socialPostFeedRunner.runFeed run summary and stale copies", () => {
  const fb = [{ id: "fb", provider: "facebook" }]
  const MIN = 60_000
  const setup = (overrides: Record<string, unknown> = {}) => {
    mocks.claimRun.mockResolvedValue({ ...feed, ...overrides })
    mocks.listDestinations.mockResolvedValue([{ destinationId: "fb" }])
    mocks.findDestinations.mockResolvedValue(fb)
    mocks.prepare.mockResolvedValue(undefined)
    mocks.insertItem.mockResolvedValue({ id: "ledger-1" })
    mocks.createInTx.mockResolvedValue({ created: true, id: "post-1" })
  }
  const run = () =>
    socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })
  const finished = () =>
    mocks.finishRun.mock.calls.at(-1)?.[0].result as Record<string, unknown>

  test("a body with no new items does nothing and says so in the summary", async () => {
    setup()
    mocks.parseFeed.mockResolvedValue([
      item("a", new Date(NOW - 5 * MIN)),
      item("b", new Date(NOW - 6 * MIN)),
    ])
    mocks.findKnownKeys.mockResolvedValue(new Set(["a", "b"]))

    const result = await run()

    expect(result).toMatchObject({
      created: 0,
      fresh: 0,
      items: 2,
      kind: "checked",
    })
    expect(mocks.insertItem).not.toHaveBeenCalled()
    expect(mocks.createInTx).not.toHaveBeenCalled()
    expect(finished().summary).toEqual({
      created: 0,
      fresh: 0,
      items: 2,
      kind: "checked",
      refused: 0,
      staleRetries: 0,
      waiting: 0,
    })
  })

  test("the summary counts posts made, refused items and items left for the next check", async () => {
    setup({ maxItemsPerRun: 1 })
    mocks.parseFeed.mockResolvedValue([
      item("a", new Date(NOW - 3 * MIN)),
      item("b", new Date(NOW - 2 * MIN)),
      item("c", new Date(NOW - 1 * MIN)),
    ])

    await run()

    expect(finished().summary).toMatchObject({
      created: 1,
      fresh: 3,
      items: 3,
      kind: "checked",
      waiting: 2,
    })
  })

  test("items left because the rolling 24 h cap is spent say so, with the cap and the next free time", async () => {
    setup({ dailyCap: 3 })
    const oldest = new Date(NOW - 20 * HOUR_MS)
    mocks.countCreatedSince.mockResolvedValue(3)
    mocks.oldestCreatedSince.mockResolvedValue(oldest)
    mocks.parseFeed.mockResolvedValue([
      item("a", new Date(NOW - 3 * MIN)),
      item("b", new Date(NOW - 2 * MIN)),
    ])

    await run()

    expect(finished().summary).toMatchObject({
      created: 0,
      dailyCap: 3,
      nextSlotAt: new Date(oldest.getTime() + 24 * HOUR_MS).toISOString(),
      waiting: 2,
      waitingReason: "dailyCap",
    })
  })

  test("a cap lowered below the posts already made points at the place that frees it", async () => {
    setup({ dailyCap: 3 })
    mocks.countCreatedSince.mockResolvedValue(5)
    mocks.oldestCreatedSince.mockResolvedValue(new Date(NOW - 10 * HOUR_MS))
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW - 3 * MIN))])

    await run()

    // 5 posts against a cap of 3: the third oldest (offset 2) must leave the window first.
    expect(mocks.oldestCreatedSince).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 2, workspaceId: "ws-1" }),
    )
  })

  test("items left by the per-check limit say runLimit and carry no cap", async () => {
    setup({ maxItemsPerRun: 1 })
    mocks.parseFeed.mockResolvedValue([
      item("a", new Date(NOW - 3 * MIN)),
      item("b", new Date(NOW - 2 * MIN)),
    ])

    await run()

    const summary = finished().summary as Record<string, unknown>
    expect(summary).toMatchObject({ waiting: 1, waitingReason: "runLimit" })
    expect(summary).not.toHaveProperty("dailyCap")
    expect(summary).not.toHaveProperty("nextSlotAt")
  })

  test("a copy whose newest item is older than the ledger's is stale: nothing is written, the check repeats in about 2 minutes, failures are untouched", async () => {
    setup({
      consecutiveFailures: 2,
      etag: "old-etag",
      lastErrorCode: "timeout",
    })
    mocks.maxPublishedAt.mockResolvedValue(new Date(NOW))
    mocks.fetcher.mockResolvedValue({
      body: "<rss/>",
      etag: "stale-etag",
      kind: "ok",
      lastModified: "stale",
    })
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW - 60 * MIN))])

    const result = await run()

    expect(result).toEqual({ kind: "stale", retries: 1 })
    expect(mocks.findKnownKeys).not.toHaveBeenCalled()
    expect(mocks.insertItems).not.toHaveBeenCalled()
    expect(mocks.insertItem).not.toHaveBeenCalled()
    expect(mocks.createInTx).not.toHaveBeenCalled()
    const written = finished()
    expect(written).toMatchObject({
      consecutiveFailures: 2,
      etag: "old-etag",
      lastErrorCode: "timeout",
      status: "active",
      summary: { kind: "stale", staleRetries: 1 },
    })
    const early = (written.nextCheckAt as Date).getTime() - Date.now()
    expect(early).toBeGreaterThan(100_000)
    expect(early).toBeLessThanOrEqual(120_000)
  })

  test("the watermark counts only this address's ledger, in this workspace, and never a future date", async () => {
    setup({})
    mocks.maxPublishedAt.mockResolvedValue(null)
    mocks.fetcher.mockResolvedValue({
      body: "<rss/>",
      etag: null,
      kind: "ok",
      lastModified: null,
    })
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW - 60 * MIN))])

    await run()

    const query = mocks.maxPublishedAt.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(query).toMatchObject({
      feedId: expect.any(String),
      workspaceId: expect.any(String),
    })
    expect(query.since).toBeInstanceOf(Date)
    expect((query.notAfter as Date).getTime()).toBeGreaterThanOrEqual(NOW)
    expect(mocks.findKnownKeys).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: expect.any(String) }),
    )
  })

  test("early re-checks are bounded: after three the copy is taken as the truth, and the counter resets", async () => {
    mocks.maxPublishedAt.mockResolvedValue(new Date(NOW))
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW - 60 * MIN))])
    mocks.findKnownKeys.mockResolvedValue(new Set(["a"]))

    setup({ lastRunSummary: { kind: "stale", staleRetries: 2 } })
    expect(await run()).toEqual({ kind: "stale", retries: 3 })
    expect(finished().summary).toMatchObject({ staleRetries: 3 })

    setup({ lastRunSummary: { kind: "stale", staleRetries: 3 } })
    const result = await run()
    expect(result).toMatchObject({ fresh: 0, kind: "checked" })
    // Taken as the truth: the next check is a full interval away, not a stale retry.
    expect(finished().nextCheckAt.getTime()).toBeGreaterThan(
      Date.now() + 2 * 60 * 1000,
    )
    expect(finished().summary).toMatchObject({
      kind: "checked",
      staleRetries: 0,
    })
  })

  test("the next run with the current body creates its posts", async () => {
    mocks.maxPublishedAt.mockResolvedValue(new Date(NOW - 30 * MIN))
    setup({ lastRunSummary: { kind: "stale", staleRetries: 1 } })
    mocks.parseFeed.mockResolvedValue([
      item("new1", new Date(NOW - 2 * MIN)),
      item("new2", new Date(NOW - 1 * MIN)),
      item("old", new Date(NOW - 30 * MIN)),
    ])
    mocks.findKnownKeys.mockResolvedValue(new Set(["old"]))

    const result = await run()

    expect(result).toMatchObject({ created: 2, fresh: 2, kind: "checked" })
    expect(finished().summary).toMatchObject({ created: 2, staleRetries: 0 })
  })

  test("a copy with no dates, an equal watermark or an unprimed feed is never stale", async () => {
    mocks.maxPublishedAt.mockResolvedValue(new Date(NOW))
    setup()
    mocks.findKnownKeys.mockResolvedValue(new Set())
    mocks.parseFeed.mockResolvedValue([item("x", null)])
    expect(await run()).toMatchObject({ kind: "checked" })

    mocks.parseFeed.mockResolvedValue([item("y", new Date(NOW))])
    expect(await run()).toMatchObject({ kind: "checked" })
  })

  test("a failed check records a failed summary", async () => {
    setup()
    mocks.parseFeed.mockRejectedValue(new Error("boom"))

    await run()

    expect(finished().summary).toMatchObject({ kind: "failed" })
  })
})

describe("scanDue", () => {
  const batch = (size: number, offset = 0) =>
    Array.from({ length: size }, (_, index) => ({
      id: `f-${offset + index}`,
      workspaceId: "ws-1",
    }))

  beforeEach(() => {
    mocks.claimDue.mockReset()
    mocks.queueAdd.mockReset()
    mocks.queueAdd.mockResolvedValue(undefined)
    mocks.queueGetJob.mockReset()
    mocks.queueGetJob.mockResolvedValue(undefined)
  })

  test("a feed whose job is still waiting or running keeps the claim's interval-ahead date (never made due again, so a backlog drains) and is not counted, and no job is added", async () => {
    mocks.claimDue.mockResolvedValueOnce(batch(2))
    mocks.queueGetJob.mockResolvedValueOnce({ id: "f-0" })
    mocks.markDue.mockReset()

    expect(await socialPostFeedRunner.scanDue(new Date(NOW))).toBe(1)

    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.markDue).not.toHaveBeenCalled()
  })

  test("keeps claiming batches while a full batch comes back, so the tick is not capped at one batch", async () => {
    mocks.claimDue
      .mockResolvedValueOnce(batch(20))
      .mockResolvedValueOnce(batch(20, 20))
      .mockResolvedValueOnce(batch(7, 40))

    const queued = await socialPostFeedRunner.scanDue(new Date(NOW))

    expect(queued).toBe(47)
    expect(mocks.claimDue).toHaveBeenCalledTimes(3)
    expect(mocks.queueAdd).toHaveBeenCalledTimes(47)
  })

  test("a short first batch ends the tick after one claim", async () => {
    mocks.claimDue.mockResolvedValueOnce(batch(3))

    expect(await socialPostFeedRunner.scanDue(new Date(NOW))).toBe(3)
    expect(mocks.claimDue).toHaveBeenCalledTimes(1)
  })

  test("stops claiming when the time budget is spent and leaves the rest for the next tick", async () => {
    const clock = vi.spyOn(Date, "now")
    clock.mockReturnValueOnce(0).mockReturnValue(41_000)
    mocks.claimDue.mockResolvedValue(batch(20))

    const queued = await socialPostFeedRunner.scanDue(new Date(NOW))
    clock.mockRestore()

    expect(queued).toBe(20)
    expect(mocks.claimDue).toHaveBeenCalledTimes(1)
  })

  test("queues feed checks behind publish jobs and counts only the jobs that were queued", async () => {
    mocks.claimDue.mockResolvedValueOnce(batch(2))
    mocks.queueAdd
      .mockRejectedValueOnce(new Error("queue down"))
      .mockResolvedValueOnce(undefined)

    expect(await socialPostFeedRunner.scanDue(new Date(NOW))).toBe(1)
    expect(mocks.queueAdd).toHaveBeenLastCalledWith(
      "runFeed",
      expect.anything(),
      expect.objectContaining({ jobId: "f-1", priority: 100 }),
    )
  })
})

describe("a check fences every write on its lease", () => {
  const MIN = 60_000
  const run = () =>
    socialPostFeedRunner.runFeed({ id: "feed-1", workspaceId: "ws-1" })
  const ready = (overrides: Record<string, unknown>) => {
    mocks.claimRun.mockResolvedValue({ ...feed, ...overrides })
    mocks.parseFeed.mockResolvedValue([item("a", new Date(NOW))])
    mocks.listDestinations.mockResolvedValue([{ destinationId: "d1" }])
    mocks.findDestinations.mockResolvedValue(FACEBOOK)
    mocks.prepare.mockResolvedValue(undefined)
    mocks.insertItem.mockResolvedValue({ id: "ledger-1" })
    mocks.createInTx.mockResolvedValue({ created: true, id: "post-1" })
  }

  test("normal processing: a lost lease writes no ledger row and creates no post, and the feed is made due again", async () => {
    ready({})
    mocks.lockLease.mockResolvedValue(false)
    mocks.finishRun.mockResolvedValue(false)

    expect(await run()).toEqual({ kind: "skipped" })

    expect(mocks.insertItems).not.toHaveBeenCalled()
    expect(mocks.insertItem).not.toHaveBeenCalled()
    expect(mocks.createInTx).not.toHaveBeenCalled()
    expect(mocks.finishRun).not.toHaveBeenCalled()
    expect(mocks.markDue).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "feed-1",
        unleasedOnly: true,
        workspaceId: "ws-1",
      }),
    )
  })

  test("priming: a lost lease records nothing from the old address", async () => {
    ready({ primedAt: null })
    mocks.lockLease.mockResolvedValue(false)

    await run()

    expect(mocks.insertItems).not.toHaveBeenCalled()
    expect(mocks.createInTx).not.toHaveBeenCalled()
  })

  test("the lease is lost between two items: the first post stands, the second is never made", async () => {
    ready({})
    mocks.parseFeed.mockResolvedValue([
      item("a", new Date(NOW - 2 * MIN)),
      item("b", new Date(NOW - MIN)),
    ])
    // fence: items ledger (1), post of a (2), then lost for post of b (3)
    mocks.lockLease
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false)

    await run()

    expect(mocks.createInTx).toHaveBeenCalledTimes(1)
  })

  test("a check that kept its lease does not touch nextCheckAt", async () => {
    ready({})

    await run()

    expect(mocks.markDue).not.toHaveBeenCalled()
  })
})

describe("scanDue with a refusing queue", () => {
  beforeEach(() => {
    mocks.claimDue.mockReset()
    mocks.markDue.mockReset()
    mocks.queueAdd.mockReset()
    mocks.queueGetJob.mockReset()
    mocks.queueGetJob.mockResolvedValue(undefined)
  })

  test("feeds the queue refused are made due again, and a batch refused in full stops the tick", async () => {
    mocks.queueAdd.mockRejectedValue(new Error("queue down"))
    mocks.claimDue.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        id: `f-${index}`,
        workspaceId: "ws-1",
      })),
    )

    expect(await socialPostFeedRunner.scanDue(new Date(NOW))).toBe(0)

    expect(mocks.claimDue).toHaveBeenCalledTimes(1)
    expect(mocks.markDue).toHaveBeenCalledTimes(20)
  })
})
