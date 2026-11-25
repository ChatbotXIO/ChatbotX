// @vitest-environment node

/**
 * Feed auto-posting against a real Postgres: `createInTx` atomicity, the
 * ledger's exactly-once guarantee (replay, two concurrent checks, a crash
 * between the ledger row and the post), first-run priming, the per-check and
 * daily caps, the failure counter and the retention prune. Commits for real,
 * so every test deletes its workspace afterwards.
 */

import { db, eq, sql } from "@chatbotx.io/database/client"
import { socialPostFeedRepository } from "@chatbotx.io/database/repositories"
import {
  inboxModel,
  publishDestinationModel,
  socialPostFeedItemModel,
  socialPostFeedModel,
  socialPostModel,
  socialPostTargetModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

const queueAdd = vi.hoisted(() => vi.fn())

vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: (_key: string, fn: () => Promise<unknown>) => fn(),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  postPublishQueue: { add: queueAdd },
}))
vi.mock("../../src/platform/settings", () => ({
  resolveTenantSettings: async () => ({ storageUrl: "https://files.test" }),
}))
vi.mock("../../src/social-post/notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/social-post/notify")>()),
  emitSocialPostChanged: vi.fn().mockResolvedValue(undefined),
}))

const { socialPostService } = await import("../../src/social-post/service")
const { socialPostFeedService } = await import(
  "../../src/social-post-feed/service"
)
const { socialPostFeedRunner } = await import(
  "../../src/social-post-feed/runner"
)
const { FeedFetchError, registerFeedFetcher } = await import(
  "../../src/social-post-feed/fetcher"
)

const databaseUrl = realDatabaseUrl()
const DAY_MS = 24 * 60 * 60 * 1000
const FEED_URL = "http://93.184.216.34/feed.xml"

type Fixture = { destinationId: string; userId: string; workspaceId: string }
type FetchResult = Parameters<typeof registerFeedFetcher>[0] extends (
  ...args: never[]
) => Promise<infer Result>
  ? Result
  : never

const item = (guid: string, title: string, publishedAt: Date): string =>
  `<item><guid>${guid}</guid><title>${title}</title><link>https://example.com/${guid}</link><pubDate>${publishedAt.toUTCString()}</pubDate></item>`

const rss = (...items: string[]): FetchResult => ({
  body: `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>${items.join("")}</channel></rss>`,
  etag: '"e1"',
  kind: "ok",
  lastModified: null,
})

describe.skipIf(!databaseUrl)("feed auto-posting on a real database", () => {
  const created: Fixture[] = []
  let response: FetchResult | Error = rss()
  const fetcher = vi.fn((): Promise<FetchResult> => {
    if (response instanceof Error) {
      return Promise.reject(response)
    }
    return Promise.resolve(response)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    response = rss()
    registerFeedFetcher(fetcher)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    for (const { workspaceId, userId } of created.splice(0)) {
      await db
        .delete(socialPostFeedItemModel)
        .where(eq(socialPostFeedItemModel.workspaceId, workspaceId))
      await db
        .delete(socialPostTargetModel)
        .where(eq(socialPostTargetModel.workspaceId, workspaceId))
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const makeFixture = async (): Promise<Fixture> => {
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(userModel)
      .values({ email: `feed-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `feed-${suffix}`, ownerId: user.id })
      .returning({ id: workspaceModel.id })
    const [inbox] = await db
      .insert(inboxModel)
      .values({
        channel: "messenger",
        name: "page",
        sourceId: `page-${suffix}`,
        workspaceId: workspace.id,
      })
      .returning({ id: inboxModel.id })
    const [publishDestination] = await db
      .insert(publishDestinationModel)
      .values({
        inboxId: inbox.id,
        provider: "facebook",
        workspaceId: workspace.id,
      })
      .returning({ id: publishDestinationModel.id })
    const fixture = {
      destinationId: publishDestination.id,
      userId: user.id,
      workspaceId: workspace.id,
    }
    created.push(fixture)
    return fixture
  }

  const makeFeed = async (
    fixture: Fixture,
    overrides: Partial<Parameters<typeof socialPostFeedService.create>[0]> = {},
  ) =>
    await socialPostFeedService.create({
      createdById: fixture.userId,
      destinationIds: [fixture.destinationId],
      feedUrl: FEED_URL,
      name: "Blog",
      workspaceId: fixture.workspaceId,
      ...overrides,
    })

  const key = (fixture: Fixture, feedId: string) => ({
    id: feedId,
    workspaceId: fixture.workspaceId,
  })

  const ledger = async (feedId: string) =>
    await db
      .select()
      .from(socialPostFeedItemModel)
      .where(eq(socialPostFeedItemModel.feedId, feedId))

  const feedPosts = async (workspaceId: string) =>
    await db
      .select()
      .from(socialPostModel)
      .where(eq(socialPostModel.workspaceId, workspaceId))

  /** A primed feed whose `startedAt` is well in the past, so items of "yesterday" qualify. */
  const primedFeed = async (
    fixture: Fixture,
    overrides: Partial<Parameters<typeof socialPostFeedService.create>[0]> = {},
  ) => {
    const feed = await makeFeed(fixture, overrides)
    await db
      .update(socialPostFeedModel)
      .set({
        primedAt: new Date(),
        startedAt: new Date(Date.now() - 3 * DAY_MS),
      })
      .where(eq(socialPostFeedModel.id, feed.id))
    return feed
  }

  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000)

  describe("createInTx", () => {
    test("a rolled-back transaction leaves neither a post nor a target", async () => {
      const fixture = await makeFixture()

      await expect(
        db.transaction(async (tx) => {
          await socialPostService.createInTx(tx, {
            createdById: null,
            createdVia: "feed",
            idempotencyKey: "k-rollback",
            targets: [{ destinationId: fixture.destinationId }],
            text: "hello",
            workspaceId: fixture.workspaceId,
          })
          throw new Error("boom")
        }),
      ).rejects.toThrow("boom")

      expect(await feedPosts(fixture.workspaceId)).toHaveLength(0)
      const targets = await db
        .select()
        .from(socialPostTargetModel)
        .where(eq(socialPostTargetModel.workspaceId, fixture.workspaceId))
      expect(targets).toHaveLength(0)
    })

    test("a committed transaction stores the post as a feed draft, and a repeated key returns it", async () => {
      const fixture = await makeFixture()
      const input = {
        createdById: null,
        createdVia: "feed" as const,
        idempotencyKey: "k-1",
        targets: [{ destinationId: fixture.destinationId }],
        text: "hello",
        workspaceId: fixture.workspaceId,
      }

      const first = await db.transaction((tx) =>
        socialPostService.createInTx(tx, input),
      )
      const again = await db.transaction((tx) =>
        socialPostService.createInTx(tx, input),
      )

      expect(first.created).toBe(true)
      expect(again).toEqual({ created: false, id: first.id })
      const [post] = await feedPosts(fixture.workspaceId)
      expect(post?.createdVia).toBe("feed")
      expect(post?.status).toBe("draft")
    })

    test("refuses a file named by URL, since no download may run inside the caller's transaction", async () => {
      const fixture = await makeFixture()

      await expect(
        db.transaction((tx) =>
          socialPostService.createInTx(tx, {
            createdById: null,
            createdVia: "feed",
            media: [{ url: "https://example.com/a.png" }],
            targets: [{ destinationId: fixture.destinationId }],
            text: "x",
            workspaceId: fixture.workspaceId,
          }),
        ),
      ).rejects.toMatchObject({ field: "media" })
    })
  })

  test("the first check only primes the ledger: no post, every existing item recorded", async () => {
    const fixture = await makeFixture()
    const feed = await makeFeed(fixture)
    response = rss(
      item("a", "A", hoursAgo(1)),
      item("b", "B", hoursAgo(2)),
      item("c", "C", hoursAgo(3)),
    )

    const result = await socialPostFeedRunner.runFeed(key(fixture, feed.id))

    expect(result).toMatchObject({ created: 0, kind: "checked", primed: true })
    expect(await feedPosts(fixture.workspaceId)).toHaveLength(0)
    const rows = await ledger(feed.id)
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.outcome === "skippedOld")).toBe(true)
    expect(
      (await socialPostFeedService.get(key(fixture, feed.id))).primed,
    ).toBe(true)
  })

  test("a new item becomes one draft post per check, exactly once even when the same document comes back", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture)
    response = rss(
      item("new", "Fresh news", hoursAgo(1)),
      item("old", "Old news", hoursAgo(80)),
    )

    const first = await socialPostFeedRunner.runFeed(key(fixture, feed.id))
    const second = await socialPostFeedRunner.runFeed(key(fixture, feed.id))

    expect(first).toMatchObject({ created: 1, kind: "checked" })
    expect(second).toMatchObject({ created: 0, kind: "checked" })
    const posts = await feedPosts(fixture.workspaceId)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      createdVia: "feed",
      // A new feed posts "as a link": the item link rides in `linkUrl`, not in the text.
      linkUrl: "https://example.com/new",
      status: "draft",
      text: "Fresh news",
    })
    const rows = await ledger(feed.id)
    expect(rows.find((row) => row.itemKey === "new")).toMatchObject({
      outcome: "created",
      socialPostId: posts[0]?.id,
    })
    expect(rows.find((row) => row.itemKey === "old")?.outcome).toBe(
      "skippedOld",
    )
  })

  test("two checks at once: the lease lets one run and the other is skipped", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture)
    response = rss(item("x", "X", hoursAgo(1)))

    const results = await Promise.all([
      socialPostFeedRunner.runFeed(key(fixture, feed.id)),
      socialPostFeedRunner.runFeed(key(fixture, feed.id)),
    ])

    expect(results.filter((r) => r.kind === "skipped")).toHaveLength(1)
    expect(await feedPosts(fixture.workspaceId)).toHaveLength(1)
  })

  test("the unique ledger key stops a second writer even without the lease", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture)
    const row = {
      feedId: feed.id,
      itemKey: "dup",
      link: null,
      outcome: "created" as const,
      publishedAt: null,
      reason: null,
      title: "T",
      workspaceId: fixture.workspaceId,
    }

    const [one, two] = await Promise.all([
      socialPostFeedRepository.insertItem(row),
      socialPostFeedRepository.insertItem(row),
    ])

    expect([one, two].filter(Boolean)).toHaveLength(1)
    expect(await ledger(feed.id)).toHaveLength(1)
  })

  test("a crash between the ledger row and the post leaves nothing behind, and the next check creates the post once", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture)
    response = rss(item("c1", "Crashy", hoursAgo(1)))
    const spy = vi
      .spyOn(socialPostService, "createInTx")
      .mockRejectedValueOnce(new Error("crash"))

    const crashed = await socialPostFeedRunner.runFeed(key(fixture, feed.id))

    expect(crashed).toEqual({ code: "internal", kind: "failed" })
    expect(await ledger(feed.id)).toHaveLength(0)
    expect(await feedPosts(fixture.workspaceId)).toHaveLength(0)

    spy.mockRestore()
    const retried = await socialPostFeedRunner.runFeed(key(fixture, feed.id))

    expect(retried).toMatchObject({ created: 1 })
    expect(await feedPosts(fixture.workspaceId)).toHaveLength(1)
    expect(await ledger(feed.id)).toHaveLength(1)
  })

  test("one check creates at most maxItemsPerRun posts, oldest first; the rest of a burst is NOT recorded and the next check takes it", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture, { maxItemsPerRun: 1 })
    response = rss(
      item("n1", "N1", hoursAgo(1)),
      item("n2", "N2", hoursAgo(2)),
      item("n3", "N3", hoursAgo(3)),
    )

    const result = await socialPostFeedRunner.runFeed(key(fixture, feed.id))

    expect(result).toMatchObject({ created: 1 })
    const rows = await ledger(feed.id)
    expect(rows.filter((row) => row.outcome === "created")).toHaveLength(1)
    expect(rows.map((row) => row.itemKey)).toEqual(["n3"])
    expect(await feedPosts(fixture.workspaceId)).toHaveLength(1)

    await socialPostFeedRunner.runFeed(key(fixture, feed.id))
    expect((await ledger(feed.id)).map((row) => row.itemKey).sort()).toEqual([
      "n2",
      "n3",
    ])
  })

  test("the daily cap stops creation and leaves later items for the next day (not recorded)", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture, { dailyCap: 1, maxItemsPerRun: 5 })
    response = rss(item("d1", "D1", hoursAgo(1)), item("d2", "D2", hoursAgo(2)))

    const first = await socialPostFeedRunner.runFeed(key(fixture, feed.id))
    const second = await socialPostFeedRunner.runFeed(key(fixture, feed.id))

    expect(first).toMatchObject({ created: 1 })
    expect(second).toMatchObject({ created: 0 })
    expect(await feedPosts(fixture.workspaceId)).toHaveLength(1)
    expect(await ledger(feed.id)).toHaveLength(1)

    await db
      .update(socialPostFeedItemModel)
      .set({ createdAt: new Date(Date.now() - 2 * DAY_MS) })
      .where(eq(socialPostFeedItemModel.feedId, feed.id))
    const nextDay = await socialPostFeedRunner.runFeed(key(fixture, feed.id))

    expect(nextDay).toMatchObject({ created: 1 })
  })

  test("an item published before the feed was added is never posted", async () => {
    const fixture = await makeFixture()
    const feed = await makeFeed(fixture)
    await db
      .update(socialPostFeedModel)
      .set({ primedAt: new Date(), startedAt: new Date() })
      .where(eq(socialPostFeedModel.id, feed.id))
    response = rss(item("pre", "Before", hoursAgo(5)))

    const result = await socialPostFeedRunner.runFeed(key(fixture, feed.id))

    expect(result).toMatchObject({ created: 0 })
    expect((await ledger(feed.id))[0]?.outcome).toBe("skippedOld")
  })

  test("queue mode without a posting schedule is auto-spaced: a scheduled post, no refusal", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture, { mode: "queue" })
    response = rss(item("q1", "Q1", hoursAgo(1)))

    const result = await socialPostFeedRunner.runFeed(key(fixture, feed.id))

    expect(result).toMatchObject({ created: 1, invalid: 0 })
    const posts = await feedPosts(fixture.workspaceId)
    expect(posts).toHaveLength(1)
    expect(posts[0]?.status).toBe("scheduled")
    const [row] = await ledger(feed.id)
    expect(row?.outcome).toBe("created")
  })

  test("a feed without destinations records items as refused instead of throwing", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture)
    await db.execute(
      sql`DELETE FROM "SocialPostFeedDestination" WHERE "feedId" = ${feed.id}`,
    )
    response = rss(item("nd", "ND", hoursAgo(1)))

    const result = await socialPostFeedRunner.runFeed(key(fixture, feed.id))

    expect(result).toMatchObject({ created: 0, invalid: 1 })
    expect((await ledger(feed.id))[0]?.reason).toBe("noDestination")
  })

  test("a 304 keeps the validators and resets the failure counter", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture)
    await db
      .update(socialPostFeedModel)
      .set({ consecutiveFailures: 3, etag: '"e0"' })
      .where(eq(socialPostFeedModel.id, feed.id))
    response = { kind: "notModified" }

    const result = await socialPostFeedRunner.runFeed(key(fixture, feed.id))

    expect(result).toEqual({ kind: "notModified" })
    const [row] = await db
      .select()
      .from(socialPostFeedModel)
      .where(eq(socialPostFeedModel.id, feed.id))
    expect(row).toMatchObject({
      consecutiveFailures: 0,
      etag: '"e0"',
      lastErrorCode: null,
      status: "active",
    })
    expect(row?.leaseExpiresAt).toBeNull()
  })

  test("five failed checks in a row park the feed in error; resume brings it back", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture)
    response = new FeedFetchError("unreachable", "down")

    for (let attempt = 0; attempt < 5; attempt++) {
      await socialPostFeedRunner.runFeed(key(fixture, feed.id))
    }

    const parked = await socialPostFeedService.get(key(fixture, feed.id))
    expect(parked).toMatchObject({
      consecutiveFailures: 5,
      lastErrorCode: "unreachable",
      status: "error",
    })
    expect(await socialPostFeedRunner.runFeed(key(fixture, feed.id))).toEqual({
      kind: "skipped",
    })

    const resumed = await socialPostFeedService.resume(key(fixture, feed.id))
    expect(resumed).toMatchObject({ consecutiveFailures: 0, status: "active" })
  })

  test("a malformed document counts as an invalidFeed failure", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture)
    response = {
      body: "<html></html>",
      etag: null,
      kind: "ok",
      lastModified: null,
    }

    expect(await socialPostFeedRunner.runFeed(key(fixture, feed.id))).toEqual({
      code: "invalidFeed",
      kind: "failed",
    })
  })

  test("a paused feed is not scanned and its running check cannot re-activate it", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture)
    await socialPostFeedService.pause(key(fixture, feed.id))
    await db
      .update(socialPostFeedModel)
      .set({ nextCheckAt: new Date(Date.now() - 1000) })
      .where(eq(socialPostFeedModel.id, feed.id))

    expect(await socialPostFeedRunner.scanDue()).toBe(0)
    expect(await socialPostFeedRunner.runFeed(key(fixture, feed.id))).toEqual({
      kind: "skipped",
    })
  })

  test("the scan hands a due feed to the queue once and pushes its next check by the interval", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture, { intervalMinutes: 30 })
    await db
      .update(socialPostFeedModel)
      .set({ nextCheckAt: new Date(Date.now() - 1000) })
      .where(eq(socialPostFeedModel.id, feed.id))

    const first = await socialPostFeedRunner.scanDue()
    const second = await socialPostFeedRunner.scanDue()

    expect(first).toBeGreaterThanOrEqual(1)
    expect(second).toBe(0)
    expect(queueAdd).toHaveBeenCalledWith(
      "runFeed",
      {
        data: { feedId: feed.id, workspaceId: fixture.workspaceId },
        type: "runFeed",
      },
      { jobId: `social-post-feed-${feed.id}` },
    )
    const after = await socialPostFeedService.get(key(fixture, feed.id))
    expect(after.nextCheckAt.getTime()).toBeGreaterThan(
      Date.now() + 25 * 60_000,
    )
  })

  test("the due scan can use the partial index", async () => {
    const plan = await db.transaction(async (tx) => {
      // The table is tiny here, so the planner would pick a sequential scan.
      await tx.execute(sql`SET LOCAL enable_seqscan = off`)
      const result = await tx.execute<{ "QUERY PLAN": string }>(sql`
        EXPLAIN SELECT "id" FROM "SocialPostFeed"
        WHERE "status" = 'active' AND "nextCheckAt" <= now()
        ORDER BY "nextCheckAt", "id" LIMIT 20`)
      return result.rows.map((row) => row["QUERY PLAN"]).join("\n")
    })

    expect(plan).toContain("SocialPostFeed_due_idx")
  })

  test("run now has a 5-minute cool-down and needs an active feed", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture)

    await socialPostFeedService.checkNow(key(fixture, feed.id))

    expect(queueAdd).toHaveBeenCalledTimes(1)
    await expect(
      socialPostFeedService.checkNow(key(fixture, feed.id)),
    ).rejects.toMatchObject({ code: "feedCheckCooldown" })

    await socialPostFeedService.pause(key(fixture, feed.id))
    await expect(
      socialPostFeedService.checkNow(key(fixture, feed.id)),
    ).rejects.toMatchObject({ code: "feedNotActive" })
  })

  test("creating validates the address, the interval, the destinations and uniqueness", async () => {
    const fixture = await makeFixture()
    const other = await makeFixture()

    await expect(
      makeFeed(fixture, { feedUrl: "http://127.0.0.1/feed.xml" }),
    ).rejects.toMatchObject({ field: "feedUrl" })
    await expect(
      makeFeed(fixture, { feedUrl: "ftp://93.184.216.34/feed" }),
    ).rejects.toMatchObject({ field: "feedUrl" })
    await expect(
      makeFeed(fixture, { feedUrl: "http://user:pw@93.184.216.34/feed" }),
    ).rejects.toMatchObject({ field: "feedUrl" })
    await expect(
      makeFeed(fixture, { intervalMinutes: 5 }),
    ).rejects.toMatchObject({ field: "intervalMinutes" })
    await expect(
      makeFeed(fixture, { destinationIds: [other.destinationId] }),
    ).rejects.toMatchObject({ field: "destinationIds" })
    await makeFeed(fixture)
    await expect(makeFeed(fixture)).rejects.toMatchObject({
      code: "feedUrlTaken",
    })
  })

  test("a workspace can have at most 20 feeds", async () => {
    const fixture = await makeFixture()
    for (let index = 0; index < 20; index++) {
      await makeFeed(fixture, {
        feedUrl: `http://93.184.216.34/feed-${index}.xml`,
      })
    }

    await expect(
      makeFeed(fixture, { feedUrl: "http://93.184.216.34/feed-21.xml" }),
    ).rejects.toMatchObject({ field: "feedUrl" })
  })

  test("the ledger is pruned past its retention, and a pruned old item cannot re-trigger a post", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture)
    const old = hoursAgo(24 * 200)
    await socialPostFeedRepository.insertItem({
      feedId: feed.id,
      itemKey: "ancient",
      link: null,
      outcome: "created",
      publishedAt: old,
      reason: null,
      title: "Ancient",
      workspaceId: fixture.workspaceId,
    })
    await db
      .update(socialPostFeedItemModel)
      .set({ createdAt: old })
      .where(eq(socialPostFeedItemModel.feedId, feed.id))
    response = rss(item("ancient", "Ancient", old))

    await socialPostFeedRunner.runFeed(key(fixture, feed.id))

    // The row is past its retention and gone ...
    expect(await ledger(feed.id)).toHaveLength(0)

    // ... and the item, still in the feed, is too old to become a post: it is
    // recorded as skipped, never created.
    await socialPostFeedRunner.runFeed(key(fixture, feed.id))
    expect((await ledger(feed.id)).map((row) => row.outcome)).toEqual([
      "skippedOld",
    ])
    expect(await feedPosts(fixture.workspaceId)).toHaveLength(0)
  })

  test("items are listed newest first with a cursor", async () => {
    const fixture = await makeFixture()
    const feed = await primedFeed(fixture)
    response = rss(
      item("l1", "L1", hoursAgo(1)),
      item("l2", "L2", hoursAgo(2)),
      item("l3", "L3", hoursAgo(3)),
    )
    await socialPostFeedRunner.runFeed(key(fixture, feed.id))

    const page = await socialPostFeedService.listItems({
      ...key(fixture, feed.id),
      limit: 2,
    })
    const rest = await socialPostFeedService.listItems({
      ...key(fixture, feed.id),
      cursor: page.nextCursor ?? undefined,
      limit: 2,
    })

    expect(page.items).toHaveLength(2)
    expect(page.nextCursor).not.toBeNull()
    expect(rest.items).toHaveLength(1)
    expect(rest.nextCursor).toBeNull()
  })
})
