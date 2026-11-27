// @vitest-environment node

/**
 * Two write-path guarantees of `upsertListedChannelPosts` against a real
 * database: a change in what a comments total counts never books a fake gain,
 * and a metrics-only read that advanced the observation fence does not make an
 * earlier full listing drop the columns only a listing reports.
 *
 * Runs only against an explicitly configured local database after the approved
 * migrations were applied: `pnpm --filter @chatbotx.io/database test:db`.
 */

import {
  CHANNEL_POST_COMMENTS_REPORTED_BITS,
  channelPostMetricBits,
} from "@chatbotx.io/utils/post-metrics"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import { channelPostRepository } from "../../src/repositories/channel-post"
import {
  type ListedChannelPost,
  upsertListedChannelPosts,
} from "../../src/repositories/channel-post/listing"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const OLD_DEFINITION_MASK = channelPostMetricBits.comments
const CURRENT_DEFINITION_MASK = CHANNEL_POST_COMMENTS_REPORTED_BITS

// biome-ignore lint/suspicious/noBitwiseOperators: reading a bit mask
const hasBits = (mask: number, bits: number): boolean => (mask & bits) === bits

type Workspace = { id: string; inboxId: string }
type PostRow = {
  caption: string | null
  commentsCount: number
  engagementCount: number
  mask: number
  metricsFetchedAt: Date | null
  permalink: string | null
  removedAt: Date | null
}

const listed = (
  externalPostId: string,
  overrides: Partial<ListedChannelPost> = {},
): ListedChannelPost => ({
  authorExternalId: null,
  authorName: null,
  caption: `post ${externalPostId}`,
  commentsCount: 0,
  contentType: null,
  externalPostId,
  liveStatus: null,
  mediaType: null,
  permalink: null,
  publishedAt: new Date(Date.now() - 10 * DAY),
  reactionsCount: 0,
  sharesCount: 0,
  viewsCount: null,
  ...overrides,
})

describe.skipIf(!databaseUrl)(
  "post metric continuity on a real database",
  () => {
    let client: Client
    let userId: string
    const workspaces: Workspace[] = []
    const database = () => drizzle({ client, relations, schema })

    const createWorkspace = async (label: string): Promise<Workspace> => {
      const suffix = `${Date.now()}-${Math.random()}`
      const [workspace] = await database()
        .insert(schema.workspaceModel)
        .values({ name: `${label}-${suffix}`, ownerId: userId })
        .returning({ id: schema.workspaceModel.id })
      const [inbox] = await database()
        .insert(schema.inboxModel)
        .values({
          channel: "messenger",
          name: `Inbox ${label}`,
          sourceId: `messenger-${suffix}`,
          workspaceId: workspace.id,
        })
        .returning({ id: schema.inboxModel.id })
      const created = { id: workspace.id, inboxId: inbox.id }
      workspaces.push(created)
      return created
    }

    const write = async (
      workspace: Workspace,
      posts: ListedChannelPost[],
      observedAt: Date,
      mode: "listing" | "metricsOnly" = "listing",
      channel = "messenger",
    ): Promise<void> =>
      await upsertListedChannelPosts(
        {
          mode,
          now: observedAt,
          observedAt,
          posts,
          target: {
            channel,
            inboxId: workspace.inboxId,
            integrationId: "1",
            sourceAccountId: "page-1",
            workspaceId: workspace.id,
          },
          timezone: "UTC",
        },
        database(),
      )

    const row = async (
      workspace: Workspace,
      externalPostId: string,
    ): Promise<PostRow> => {
      const result = await client.query<PostRow>(
        `SELECT "caption", "commentsCount"::int AS "commentsCount", "engagementCount"::int AS "engagementCount",
         "metricsKnownMask" AS "mask", "metricsFetchedAt", "permalink", "removedAt"
       FROM "ChannelPost" WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
        [workspace.id, externalPostId],
      )
      return result.rows[0] as PostRow
    }

    const dayGains = async (
      workspace: Workspace,
      externalPostId: string,
    ): Promise<{ commentsGain: number; engagementGain: number }> => {
      const result = await client.query<{
        commentsGain: number
        engagementGain: number
      }>(
        `SELECT COALESCE(SUM(d."commentsGain"), 0)::int AS "commentsGain", COALESCE(SUM(d."engagementGain"), 0)::int AS "engagementGain"
       FROM "ChannelPostMetricDaily" d JOIN "ChannelPost" p ON p."id" = d."channelPostId"
       WHERE d."workspaceId" = $1 AND p."externalPostId" = $2`,
        [workspace.id, externalPostId],
      )
      return result.rows[0] as { commentsGain: number; engagementGain: number }
    }

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
      const [user] = await database()
        .insert(schema.userModel)
        .values({
          email: `continuity-${Date.now()}-${Math.random()}@example.test`,
        })
        .returning({ id: schema.userModel.id })
      userId = user.id
    })

    afterAll(async () => {
      for (const workspace of workspaces) {
        await client.query(
          `DELETE FROM "ChannelPostMetricDaily" WHERE "workspaceId" = $1`,
          [workspace.id],
        )
        await client.query(`DELETE FROM "Workspace" WHERE "id" = $1`, [
          workspace.id,
        ])
      }
      await client.query(`DELETE FROM "User" WHERE "id" = $1`, [userId])
      await client?.end()
    })

    describe("comments total definition", () => {
      test("a row measured before the current definition is re-baselined, not given the difference as a gain", async () => {
        const workspace = await createWorkspace("definition")
        const start = new Date(Date.now() - 2 * DAY)
        await write(workspace, [listed("p1", { commentsCount: 10 })], start)
        // Simulate a row written before the bit existed.
        await client.query(
          `UPDATE "ChannelPost" SET "metricsKnownMask" = $3 WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
          [workspace.id, "p1", OLD_DEFINITION_MASK],
        )
        const before = await dayGains(workspace, "p1")

        await write(
          workspace,
          [listed("p1", { commentsCount: 30 })],
          new Date(start.getTime() + MINUTE),
        )

        const stored = await row(workspace, "p1")
        expect(stored.commentsCount).toBe(30)
        expect(hasBits(stored.mask, CURRENT_DEFINITION_MASK)).toBe(true)
        expect(await dayGains(workspace, "p1")).toEqual(before)
      })

      test("the next read after the re-baseline counts a real difference", async () => {
        const workspace = await createWorkspace("definition-next")
        const start = new Date(Date.now() - 2 * DAY)
        await write(workspace, [listed("p1", { commentsCount: 10 })], start)
        await client.query(
          `UPDATE "ChannelPost" SET "metricsKnownMask" = $3 WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
          [workspace.id, "p1", OLD_DEFINITION_MASK],
        )
        await write(
          workspace,
          [listed("p1", { commentsCount: 30 })],
          new Date(start.getTime() + MINUTE),
        )
        const before = await dayGains(workspace, "p1")

        await write(
          workspace,
          [listed("p1", { commentsCount: 33 })],
          new Date(start.getTime() + 2 * MINUTE),
          "metricsOnly",
        )

        const after = await dayGains(workspace, "p1")
        expect(after.commentsGain - before.commentsGain).toBe(3)
        expect(after.engagementGain - before.engagementGain).toBe(3)
      })

      test("a channel whose comment total did not change still books the real gain of a row with only the comments bit", async () => {
        const workspace = await createWorkspace("unchanged-channel")
        const start = new Date(Date.now() - 2 * DAY)
        await write(
          workspace,
          [listed("p1", { commentsCount: 10 })],
          start,
          "listing",
          "instagram",
        )
        await client.query(
          `UPDATE "ChannelPost" SET "metricsKnownMask" = $3 WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
          [workspace.id, "p1", OLD_DEFINITION_MASK],
        )
        const before = await dayGains(workspace, "p1")

        await write(
          workspace,
          [listed("p1", { commentsCount: 13 })],
          new Date(start.getTime() + MINUTE),
          "listing",
          "instagram",
        )

        const after = await dayGains(workspace, "p1")
        expect(after.commentsGain - before.commentsGain).toBe(3)
      })

      test("the webhook increment sets the display bit and the current-definition bit", async () => {
        const workspace = await createWorkspace("webhook")
        await write(
          workspace,
          [listed("p1", { commentsCount: null })],
          new Date(),
        )
        const result = await client.query<{ id: string }>(
          `SELECT "id"::text AS "id" FROM "ChannelPost" WHERE "workspaceId" = $1`,
          [workspace.id],
        )

        await channelPostRepository.incrementCommentsCount(
          { id: result.rows[0]?.id as string, workspaceId: workspace.id },
          database(),
        )

        const stored = await row(workspace, "p1")
        expect(stored.commentsCount).toBe(1)
        expect(hasBits(stored.mask, CURRENT_DEFINITION_MASK)).toBe(true)
      })
    })

    describe("metrics-only read overtaking a full listing", () => {
      test("the full listing still writes its descriptive columns and clears a removal, keeping the newer counts", async () => {
        const workspace = await createWorkspace("race")
        const t0 = new Date(Date.now() - 3 * MINUTE)
        const t1 = new Date(Date.now() - 2 * MINUTE)
        const t2 = new Date(Date.now() - MINUTE)
        await write(
          workspace,
          [listed("p1", { caption: "old", commentsCount: 1 })],
          t0,
        )
        await client.query(
          `UPDATE "ChannelPost" SET "removedAt" = now() WHERE "workspaceId" = $1`,
          [workspace.id],
        )
        // The metrics-only read that started later commits first.
        await write(
          workspace,
          [listed("p1", { commentsCount: 5 })],
          t2,
          "metricsOnly",
        )

        await write(
          workspace,
          [
            listed("p1", {
              caption: "edited",
              commentsCount: 2,
              permalink: "https://example.test/p1",
            }),
          ],
          t1,
        )

        const stored = await row(workspace, "p1")
        expect(stored.caption).toBe("edited")
        expect(stored.permalink).toBe("https://example.test/p1")
        expect(stored.removedAt).toBeNull()
        expect(stored.commentsCount).toBe(5)
        expect(stored.engagementCount).toBe(5)
        expect(stored.metricsFetchedAt?.getTime()).toBe(t2.getTime())
      })

      test("an older full listing landing after a newer one keeps the newer caption", async () => {
        const workspace = await createWorkspace("older-listing")
        const t0 = new Date(Date.now() - 3 * MINUTE)
        const t1 = new Date(Date.now() - 2 * MINUTE)
        const t2 = new Date(Date.now() - MINUTE)
        await write(workspace, [listed("p1", { caption: "first" })], t0)
        await write(workspace, [listed("p1", { caption: "newest" })], t2)

        await write(workspace, [listed("p1", { caption: "older read" })], t1)

        expect((await row(workspace, "p1")).caption).toBe("newest")
      })

      test("a newer read that started before an older one finished still updates the description", async () => {
        const workspace = await createWorkspace("overlap")
        const t0 = new Date(Date.now() - 3 * MINUTE)
        const t1 = new Date(Date.now() - 2 * MINUTE)
        const t2 = new Date(Date.now() - MINUTE)
        await write(workspace, [listed("p1", { caption: "seed" })], t0)
        // The older read (t1) finishes first and stamps the fence with its observation time.
        await write(workspace, [listed("p1", { caption: "older" })], t1)

        await write(workspace, [listed("p1", { caption: "newer" })], t2)

        expect((await row(workspace, "p1")).caption).toBe("newer")
      })

      test("a bare row with a stamped metadata time still gets its empty caption filled", async () => {
        const workspace = await createWorkspace("bare")
        const t0 = new Date(Date.now() - 3 * MINUTE)
        await write(workspace, [listed("p1", { caption: "x" })], t0)
        await client.query(
          `UPDATE "ChannelPost" SET "caption" = NULL, "metadataFetchedAt" = now() + interval '1 minute' WHERE "workspaceId" = $1`,
          [workspace.id],
        )

        await write(
          workspace,
          [listed("p1", { caption: "filled" })],
          new Date(),
        )

        expect((await row(workspace, "p1")).caption).toBe("filled")
      })

      test("does not touch another workspace's post with the same external id", async () => {
        const mine = await createWorkspace("race-mine")
        const theirs = await createWorkspace("race-theirs")
        const t0 = new Date(Date.now() - 3 * MINUTE)
        await write(mine, [listed("p1", { caption: "mine" })], t0)
        await write(theirs, [listed("p1", { caption: "theirs" })], t0)

        await write(
          mine,
          [listed("p1", { caption: "mine edited" })],
          new Date(),
        )

        expect((await row(theirs, "p1")).caption).toBe("theirs")
      })
    })
  },
)
