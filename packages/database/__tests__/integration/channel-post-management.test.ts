// @vitest-environment node

/**
 * The post management list and topics against a real database: keyset paging
 * over ties and microsecond timestamps for every sort, the filters, and that
 * every sort is served by an index with no Sort node.
 *
 * Runs only against an explicitly configured local database after the approved
 * migrations were applied: `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  type DatabaseClient,
  db,
  isUniqueViolationError,
} from "../../src/client"
import {
  type ChannelPostManagementSort,
  channelPostManagementSorts,
} from "../../src/partials/channel-post"
import { relations } from "../../src/relations"
import { channelPostManagementRepository } from "../../src/repositories/channel-post/management"
import { postTopicRepository } from "../../src/repositories/post-topic/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const POST_COUNT = 40
const ASCENDING_SORT = /^(fewest|least)/
const PAGE_SIZE = 7

type Fixture = { inboxId: string; userId: string; workspaceId: string }

/** `ORDER BY` of each sort, written independently of the repository. */
const EXPECTED_ORDER: Record<ChannelPostManagementSort, string> = {
  newest: `COALESCE("publishedAt", "createdAt") DESC, id DESC`,
  mostComments: `"commentsCount" DESC, id DESC`,
  fewestComments: `"commentsCount" ASC, id ASC`,
  mostPhones: `"phoneCommentsCount" DESC, id DESC`,
  fewestPhones: `"phoneCommentsCount" ASC, id ASC`,
  mostEngagement: `"engagementCount" DESC, id DESC`,
  leastEngagement: `"engagementCount" ASC, id ASC`,
  mostShares: `"sharesCount" DESC, id DESC`,
  fewestShares: `"sharesCount" ASC, id ASC`,
}

describe.skipIf(!databaseUrl)("post management against a real database", () => {
  let client: Client
  let fixture: Fixture
  const postIds: string[] = []

  const rawOrderedIds = async (
    sort: ChannelPostManagementSort,
    where = `"removedAt" IS NULL`,
  ) => {
    const result = await client.query<{ id: string }>(
      `SELECT id::text FROM "ChannelPost" WHERE "workspaceId" = $1 AND ${where} ORDER BY ${EXPECTED_ORDER[sort]}`,
      [fixture.workspaceId],
    )
    return result.rows.map((row) => row.id)
  }

  const pageThrough = async (
    sort: ChannelPostManagementSort,
    filters: { hasComments: boolean } = { hasComments: false },
  ) => {
    const ids: string[] = []
    let cursor:
      | { id: string; sort: ChannelPostManagementSort; sortValue: string }
      | undefined
    for (;;) {
      const rows = await channelPostManagementRepository.list({
        cursor,
        filters,
        limit: PAGE_SIZE,
        sort,
        workspaceId: fixture.workspaceId,
      })
      ids.push(...rows.map((row) => row.id))
      const last = rows.at(-1)
      if (rows.length < PAGE_SIZE || !last) {
        return ids
      }
      cursor = { id: last.id, sort, sortValue: last.sortValue }
    }
  }

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
    const database = drizzle({ client, relations, schema })
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await database
      .insert(schema.userModel)
      .values({ email: `post-management-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await database
      .insert(schema.workspaceModel)
      .values({ name: `post-management-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    const [inbox] = await database
      .insert(schema.inboxModel)
      .values({
        channel: "messenger",
        name: `Messenger ${suffix}`,
        sourceId: `messenger-${suffix}`,
        workspaceId: workspace.id,
      })
      .returning({ id: schema.inboxModel.id })
    fixture = { inboxId: inbox.id, userId: user.id, workspaceId: workspace.id }

    for (let index = 0; index < POST_COUNT; index++) {
      const [post] = await database
        .insert(schema.channelPostModel)
        .values({
          channel: "messenger",
          // Few distinct values, so every count sort has many ties.
          commentsCount: index % 5,
          engagementCount: index % 4,
          externalPostId: `post-${suffix}-${index}`,
          inboxId: inbox.id,
          integrationId: "1",
          // 0: measured, no comments; 1: measured, comments; 2: never measured.
          metricsFetchedAt: index % 3 === 2 ? null : new Date(),
          phoneCommentsCount: index % 3,
          sharesCount: index % 6,
          sourceAccountId: `account-${suffix}`,
          workspaceId: workspace.id,
        })
        .returning({ id: schema.channelPostModel.id })
      postIds.push(post.id)
    }
    // Groups of four posts share an hour; inside a group two distinct
    // microsecond values give ties a millisecond-precision Date cannot make.
    // Every ninth post has no publishedAt, so it sorts by createdAt.
    await client.query(
      `UPDATE "ChannelPost" SET
         "commentsCount" = CASE WHEN "metricsFetchedAt" IS NOT NULL AND "commentsCount" = 0 AND mod(id, 3) = 0 THEN 0 ELSE "commentsCount" END,
         "publishedAt" = CASE WHEN mod(id, 9) = 0 THEN NULL
           ELSE timestamptz '2026-11-01 10:00:00.123456+00'
             + (id / 4 % 10) * interval '1 hour'
             + (id % 2) * interval '1 microsecond' END
       WHERE "workspaceId" = $1`,
      [fixture.workspaceId],
    )
    await client.query(
      `UPDATE "ChannelPost" SET "removedAt" = now() WHERE id = $1`,
      [postIds[3]],
    )
  })

  afterAll(async () => {
    if (fixture) {
      const database = drizzle({ client, relations, schema })
      await database
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, fixture.workspaceId))
      await database
        .delete(schema.userModel)
        .where(eq(schema.userModel.id, fixture.userId))
    }
    await client?.end()
  })

  describe("keyset paging", () => {
    test.each(
      channelPostManagementSorts.options,
    )("%s pages through every post once, in the same order as a single query", async (sort) => {
      const expected = await rawOrderedIds(sort)

      const paged = await pageThrough(sort)

      expect(new Set(paged).size).toBe(paged.length)
      expect(paged).toEqual(expected)
      // The removed post never shows up.
      expect(paged).toHaveLength(POST_COUNT - 1)
      expect(paged).not.toContain(postIds[3])
    })

    test("a page boundary inside a run of equal sort values neither skips nor repeats", async () => {
      const paged = await pageThrough("mostComments")
      const values = await client.query<{ id: string; commentsCount: number }>(
        `SELECT id::text, "commentsCount" FROM "ChannelPost" WHERE "workspaceId" = $1`,
        [fixture.workspaceId],
      )
      const counts = values.rows.map((row) => row.commentsCount)

      expect(new Set(counts).size).toBeLessThan(POST_COUNT / PAGE_SIZE)
      expect(new Set(paged).size).toBe(POST_COUNT - 1)
    })
  })

  describe("filters", () => {
    test("hasComments keeps posts with comments and posts no sync has measured yet", async () => {
      const kept = await pageThrough("newest", { hasComments: true })

      const expected = await rawOrderedIds(
        "newest",
        `"removedAt" IS NULL AND ("commentsCount" > 0 OR "metricsFetchedAt" IS NULL OR EXISTS (SELECT 1 FROM "SocialPostTarget" t WHERE t."channelPostId" = "ChannelPost".id AND t."workspaceId" = "ChannelPost"."workspaceId"))`,
      )
      expect(kept).toEqual(expected)
      expect(kept.length).toBeLessThan(POST_COUNT - 1)
      expect(kept.length).toBeGreaterThan(0)
    })

    test("a post published from ChatbotX is listed by default even with no comments; another workspace's target does not count", async () => {
      const database = drizzle({ client, relations, schema })
      const { rows } = await client.query<{ id: string }>(
        `SELECT id::text FROM "ChannelPost"
         WHERE "workspaceId" = $1 AND "removedAt" IS NULL AND "commentsCount" = 0 AND "metricsFetchedAt" IS NOT NULL
         ORDER BY id LIMIT 2`,
        [fixture.workspaceId],
      )
      const [published, foreign] = rows.map((row) => row.id)
      expect(published && foreign).toBeTruthy()
      const [other] = await database
        .insert(schema.workspaceModel)
        .values({ name: `other-${Date.now()}`, ownerId: fixture.userId })
        .returning({ id: schema.workspaceModel.id })
      const [otherInbox] = await database
        .insert(schema.inboxModel)
        .values({
          channel: "messenger",
          name: `Other ${Date.now()}`,
          sourceId: `other-${Date.now()}-${Math.random()}`,
          workspaceId: other.id,
        })
        .returning({ id: schema.inboxModel.id })
      const link = async (
        workspaceId: string,
        inboxId: string,
        channelPostId: string,
      ) => {
        const [destination] = await database
          .insert(schema.publishDestinationModel)
          .values({ inboxId, provider: "facebook", workspaceId })
          .returning({ id: schema.publishDestinationModel.id })
        const [post] = await database
          .insert(schema.socialPostModel)
          .values({ workspaceId })
          .returning({ id: schema.socialPostModel.id })
        await database.insert(schema.socialPostTargetModel).values({
          channelPostId,
          contentType: "text",
          provider: "facebook",
          publishDestinationId: destination.id,
          socialPostId: post.id,
          workspaceId,
        })
      }
      try {
        await link(fixture.workspaceId, fixture.inboxId, published)
        await link(other.id, otherInbox.id, foreign)

        const listed = await pageThrough("newest", { hasComments: true })

        expect(listed).toContain(published)
        expect(listed).not.toContain(foreign)
      } finally {
        await database
          .delete(schema.socialPostTargetModel)
          .where(
            inArray(schema.socialPostTargetModel.workspaceId, [
              fixture.workspaceId,
              other.id,
            ]),
          )
        await database
          .delete(schema.workspaceModel)
          .where(eq(schema.workspaceModel.id, other.id))
        await database
          .delete(schema.socialPostTargetModel)
          .where(eq(schema.socialPostTargetModel.channelPostId, published))
      }
    })

    test("filters by inbox, channel, and a search text with a hostile value", async () => {
      const base = {
        filters: { hasComments: false },
        limit: 100,
        sort: "newest" as const,
        workspaceId: fixture.workspaceId,
      }

      const byInbox = await channelPostManagementRepository.list({
        ...base,
        filters: { hasComments: false, inboxIds: [fixture.inboxId] },
      })
      const otherChannel = await channelPostManagementRepository.list({
        ...base,
        filters: { channels: ["instagram"], hasComments: false },
      })
      const hostile = await channelPostManagementRepository.list({
        ...base,
        filters: {
          hasComments: false,
          search: `'; DROP TABLE "ChannelPost"; --`,
        },
      })

      expect(byInbox).toHaveLength(POST_COUNT - 1)
      expect(otherChannel).toHaveLength(0)
      expect(hostile).toHaveLength(0)
      const still = await client.query(`SELECT 1 FROM "ChannelPost" LIMIT 1`)
      expect(still.rowCount).toBe(1)
    })

    test("never returns another workspace's posts", async () => {
      const rows = await channelPostManagementRepository.list({
        filters: { hasComments: false },
        limit: 100,
        sort: "newest",
        workspaceId: "1",
      })

      expect(rows.every((row) => !postIds.includes(row.id))).toBe(true)
    })
  })

  describe("topics", () => {
    test("filters by topic and keeps the join rows consistent", async () => {
      const sale = await postTopicRepository.insert({
        color: null,
        name: "Sale",
        workspaceId: fixture.workspaceId,
      })
      const vip = await postTopicRepository.insert({
        color: "#112233",
        name: "VIP",
        workspaceId: fixture.workspaceId,
      })
      expect(sale && vip).toBeTruthy()
      const saleId = sale?.id ?? ""
      const vipId = vip?.id ?? ""

      await postTopicRepository.addToPosts({
        channelPostIds: [postIds[0], postIds[1]],
        topicIds: [saleId],
      })
      await postTopicRepository.addToPosts({
        channelPostIds: [postIds[0]],
        topicIds: [saleId, vipId],
      })

      const withSale = await channelPostManagementRepository.list({
        filters: { hasComments: false, topicIds: [saleId] },
        limit: 100,
        sort: "newest",
        workspaceId: fixture.workspaceId,
      })
      const withVip = await channelPostManagementRepository.list({
        filters: { hasComments: false, topicIds: [vipId] },
        limit: 100,
        sort: "newest",
        workspaceId: fixture.workspaceId,
      })
      const either = await channelPostManagementRepository.list({
        filters: { hasComments: false, topicIds: [saleId, vipId] },
        limit: 100,
        sort: "newest",
        workspaceId: fixture.workspaceId,
      })

      expect(withSale.map((row) => row.id).sort()).toEqual(
        [postIds[0], postIds[1]].sort(),
      )
      expect(withVip.map((row) => row.id)).toEqual([postIds[0]])
      // A post carrying both topics is listed once.
      expect(either).toHaveLength(2)

      const labels = await postTopicRepository.listForPosts({
        channelPostIds: [postIds[0]],
      })
      expect(labels.map((label) => label.name)).toEqual(["Sale", "VIP"])

      await postTopicRepository.replaceForPosts({
        channelPostIds: [postIds[0], postIds[1]],
        topicIds: [vipId],
      })
      const afterReplace = await postTopicRepository.listForPosts({
        channelPostIds: [postIds[0], postIds[1]],
      })
      expect(afterReplace.map((row) => row.id)).toEqual([vipId, vipId])

      await postTopicRepository.addToPosts({
        channelPostIds: [postIds[0]],
        topicIds: [saleId],
      })
      expect(
        await postTopicRepository.findPostsOverTopicLimit({
          channelPostIds: [postIds[0], postIds[1]],
          limit: 1,
        }),
      ).toEqual([postIds[0]])

      await postTopicRepository.replaceForPosts({
        channelPostIds: [postIds[0], postIds[1]],
        topicIds: [],
      })
      expect(
        await postTopicRepository.listForPosts({
          channelPostIds: [postIds[0], postIds[1]],
        }),
      ).toEqual([])
    })

    test("a taken name is refused on insert and on rename", async () => {
      const first = await postTopicRepository.insert({
        color: null,
        name: "Unique",
        workspaceId: fixture.workspaceId,
      })
      const second = await postTopicRepository.insert({
        color: null,
        name: "Other",
        workspaceId: fixture.workspaceId,
      })

      expect(
        await postTopicRepository.insert({
          color: null,
          name: "Unique",
          workspaceId: fixture.workspaceId,
        }),
      ).toBeNull()
      expect(first && second).toBeTruthy()
      await expect(
        postTopicRepository.update({
          id: second?.id ?? "",
          name: "Unique",
          workspaceId: fixture.workspaceId,
        }),
      ).rejects.toSatisfy((error: unknown) =>
        isUniqueViolationError(error, "PostTopic_workspaceId_name_key"),
      )
    })

    test("deleting a topic removes it from the posts that carried it", async () => {
      const topic = await postTopicRepository.insert({
        color: null,
        name: "Temporary",
        workspaceId: fixture.workspaceId,
      })
      await postTopicRepository.addToPosts({
        channelPostIds: [postIds[5]],
        topicIds: [topic?.id ?? ""],
      })

      await postTopicRepository.delete({
        id: topic?.id ?? "",
        workspaceId: fixture.workspaceId,
      })

      expect(
        await postTopicRepository.listForPosts({
          channelPostIds: [postIds[5]],
        }),
      ).toEqual([])
    })

    test("a topic of another workspace is not found by id", async () => {
      const topic = await postTopicRepository.insert({
        color: null,
        name: "Scoped",
        workspaceId: fixture.workspaceId,
      })

      expect(
        await postTopicRepository.findById({
          id: topic?.id ?? "",
          workspaceId: "1",
        }),
      ).toBeNull()
    })
  })

  describe("row lock", () => {
    test("locks live posts of the workspace in id order and skips removed ones", async () => {
      const locked = await db.transaction(
        async (tx) =>
          await channelPostManagementRepository.lockExistingIds(
            {
              ids: [postIds[9], postIds[3], postIds[1]],
              workspaceId: fixture.workspaceId,
            },
            tx,
          ),
      )

      expect(locked).toEqual([postIds[1], postIds[9]])
    })
  })

  describe("index use", () => {
    // Forbid every plan that sorts, scans the whole table or merges bitmaps:
    // a plan can then only exist if an index already yields the ORDER BY.
    const explain = async (sort: ChannelPostManagementSort) => {
      const captured: { params: unknown[]; query: string }[] = []
      const database = drizzle({
        client,
        logger: {
          logQuery: (query, params) => captured.push({ params, query }),
        },
        relations,
        schema,
      })
      await channelPostManagementRepository.list(
        {
          filters: { hasComments: false },
          limit: 10,
          sort,
          workspaceId: fixture.workspaceId,
        },
        database as unknown as DatabaseClient,
      )
      const statement = captured.at(-1)
      if (!statement) {
        throw new Error("the list query was not captured")
      }
      await client.query("BEGIN")
      try {
        await client.query("SET LOCAL enable_sort = off")
        await client.query("SET LOCAL enable_seqscan = off")
        await client.query("SET LOCAL enable_bitmapscan = off")
        const plan = await client.query<{ "QUERY PLAN": unknown }>(
          `EXPLAIN (FORMAT JSON) ${statement.query}`,
          statement.params,
        )
        return JSON.stringify(plan.rows[0]?.["QUERY PLAN"])
      } finally {
        await client.query("ROLLBACK")
      }
    }

    test.each(
      channelPostManagementSorts.options,
    )("%s is served by an index with no Sort node", async (sort) => {
      const plan = await explain(sort)

      expect(plan).not.toContain('"Node Type":"Sort"')
      expect(plan).toContain("Index Scan")
      // Fewest/least orders read the descending index backwards.
      const ascending = ASCENDING_SORT.test(sort)
      expect(plan.includes('"Scan Direction":"Backward"')).toBe(ascending)
    })
  })
})
