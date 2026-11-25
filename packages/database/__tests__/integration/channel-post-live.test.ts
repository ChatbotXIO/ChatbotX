// @vitest-environment node

/**
 * The live status of a post against a real database: the guarded observation
 * write (an older one never wins, a comment never reopens an ended broadcast),
 * a listing that never clears or downgrades what a live signal stored, and the
 * index the live filters read.
 *
 * Runs only against an explicitly configured local database after the approved
 * migrations were applied: `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import {
  type ListedChannelPost,
  upsertListedChannelPosts,
} from "../../src/repositories/channel-post/listing"
import {
  type ChannelPostLiveObservation,
  channelPostRepository,
} from "../../src/repositories/channel-post/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const MINUTE = 60_000
const T0 = new Date("2026-11-24T10:00:00.000Z")
const at = (minutes: number) => new Date(T0.getTime() + minutes * MINUTE)

describe.skipIf(!databaseUrl)(
  "post live status against a real database",
  () => {
    let client: Client
    let workspaceId: string
    let userId: string
    let inboxId: string

    const unique = () => `live-${Date.now()}-${Math.random()}`

    const observe = async (
      externalPostId: string,
      overrides: Partial<ChannelPostLiveObservation> = {},
    ) =>
      await channelPostRepository.recordLiveObservation({
        channel: "messenger",
        externalPostId,
        inboxId,
        integrationId: "5",
        observedAt: at(0),
        source: "webhook",
        sourceAccountId: "page-1",
        status: "live",
        workspaceId,
        ...overrides,
      })

    const row = async (externalPostId: string) =>
      (
        await client.query(
          `SELECT "contentType", "liveStatus", "liveStatusObservedAt" FROM "ChannelPost" WHERE "workspaceId" = $1 AND "channel" = 'messenger' AND "externalPostId" = $2`,
          [workspaceId, externalPostId],
        )
      ).rows[0]

    const listed = (
      externalPostId: string,
      overrides: Partial<ListedChannelPost> = {},
    ): ListedChannelPost => ({
      authorExternalId: null,
      authorName: null,
      caption: "Hello",
      commentsCount: 1,
      contentType: "video",
      externalPostId,
      liveStatus: null,
      mediaType: "added_video",
      permalink: null,
      publishedAt: new Date("2026-11-24T09:00:00.000Z"),
      reactionsCount: 1,
      sharesCount: 0,
      viewsCount: null,
      ...overrides,
    })

    const sync = async (posts: ListedChannelPost[], observedAt: Date) =>
      await upsertListedChannelPosts({
        now: observedAt,
        observedAt,
        posts,
        target: {
          channel: "messenger",
          inboxId,
          integrationId: "5",
          sourceAccountId: "page-1",
          workspaceId,
        },
      })

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
      const database = drizzle({ client, relations, schema })
      const suffix = `${Date.now()}-${Math.random()}`
      const [user] = await database
        .insert(schema.userModel)
        .values({ email: `post-live-${suffix}@example.test` })
        .returning({ id: schema.userModel.id })
      userId = user.id
      const [workspace] = await database
        .insert(schema.workspaceModel)
        .values({ name: `post-live-${suffix}`, ownerId: user.id })
        .returning({ id: schema.workspaceModel.id })
      workspaceId = workspace.id
      const [inbox] = await database
        .insert(schema.inboxModel)
        .values({
          channel: "messenger",
          name: "Live inbox",
          sourceId: `messenger-live-${suffix}`,
          workspaceId,
        })
        .returning({ id: schema.inboxModel.id })
      inboxId = inbox.id
    })

    afterAll(async () => {
      if (client) {
        const database = drizzle({ client, relations, schema })
        await database
          .delete(schema.workspaceModel)
          .where(eq(schema.workspaceModel.id, workspaceId))
        await database
          .delete(schema.userModel)
          .where(eq(schema.userModel.id, userId))
        await client.end()
      }
    })

    describe("recordLiveObservation", () => {
      test("creates the post as a live broadcast when it is not stored yet", async () => {
        const id = unique()

        expect(await observe(id)).toBe(true)

        const stored = await row(id)
        expect(stored.contentType).toBe("live")
        expect(stored.liveStatus).toBe("live")
        expect(stored.liveStatusObservedAt).toEqual(at(0))
      })

      test("a newer observation ends the broadcast", async () => {
        const id = unique()
        await observe(id)

        expect(await observe(id, { observedAt: at(5), status: "ended" })).toBe(
          true,
        )

        expect((await row(id)).liveStatus).toBe("ended")
      })

      test("an older observation never overwrites a newer one", async () => {
        const id = unique()
        await observe(id, { observedAt: at(10), status: "ended" })

        expect(await observe(id, { observedAt: at(5), status: "live" })).toBe(
          false,
        )

        const stored = await row(id)
        expect(stored.liveStatus).toBe("ended")
        expect(stored.liveStatusObservedAt).toEqual(at(10))
      })

      test("a comment never reopens an ended broadcast", async () => {
        const id = unique()
        await observe(id, { observedAt: at(5), status: "ended" })

        expect(
          await observe(id, {
            observedAt: at(9),
            source: "comment",
            status: "live",
          }),
        ).toBe(false)

        expect((await row(id)).liveStatus).toBe("ended")
      })

      test("an ended comment on an ended broadcast writes nothing", async () => {
        const id = unique()
        await observe(id, { observedAt: at(5), status: "ended" })

        expect(
          await observe(id, {
            observedAt: at(9),
            source: "comment",
            status: "ended",
          }),
        ).toBe(false)

        expect((await row(id)).liveStatusObservedAt).toEqual(at(5))
      })

      test("a comment can start a live status on a post that has none", async () => {
        const id = unique()
        await sync([listed(id)], at(-30))

        expect(await observe(id, { source: "comment", status: "live" })).toBe(
          true,
        )

        const stored = await row(id)
        expect(stored.liveStatus).toBe("live")
        expect(stored.contentType).toBe("live")
      })

      test("a comment does not refresh a broadcast that is already live", async () => {
        const id = unique()
        await observe(id, { observedAt: at(0) })

        expect(
          await observe(id, {
            observedAt: at(3),
            source: "comment",
            status: "live",
          }),
        ).toBe(false)

        expect((await row(id)).liveStatusObservedAt).toEqual(at(0))
      })

      test("a comment that says the video is over ends the broadcast", async () => {
        const id = unique()
        await observe(id, { observedAt: at(0) })

        expect(
          await observe(id, {
            observedAt: at(4),
            source: "comment",
            status: "ended",
          }),
        ).toBe(true)

        expect((await row(id)).liveStatus).toBe("ended")
      })

      test("keeps a stored kind that is not a plain video", async () => {
        const id = unique()
        await sync([listed(id, { contentType: "reel" })], at(-30))

        await observe(id)

        expect((await row(id)).contentType).toBe("reel")
      })

      test("is scoped to its workspace", async () => {
        const id = unique()
        await observe(id)

        const other = await client.query(
          `SELECT 1 FROM "ChannelPost" WHERE "workspaceId" <> $1 AND "externalPostId" = $2`,
          [workspaceId, id],
        )

        expect(other.rowCount).toBe(0)
      })
    })

    describe("a listing next to a live signal", () => {
      test("one row: a live post that is also in the feed stays a live broadcast", async () => {
        const id = unique()
        await sync(
          [listed(id, { contentType: "live", liveStatus: "live" })],
          at(0),
        )

        await sync([listed(id)], at(5))

        const count = await client.query(
          `SELECT count(*)::int AS n FROM "ChannelPost" WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
          [workspaceId, id],
        )
        expect(count.rows[0].n).toBe(1)
        const stored = await row(id)
        expect(stored.contentType).toBe("live")
        expect(stored.liveStatus).toBe("live")
      })

      test("a past broadcast listed as ended is stored ended", async () => {
        const id = unique()

        await sync(
          [listed(id, { contentType: "live", liveStatus: "ended" })],
          at(0),
        )

        const stored = await row(id)
        expect(stored.contentType).toBe("live")
        expect(stored.liveStatus).toBe("ended")
        expect(stored.liveStatusObservedAt).toEqual(at(0))
      })

      test("a listing without a live status never clears a stored one", async () => {
        const id = unique()
        await observe(id, { observedAt: at(0) })

        await sync([listed(id)], at(10))

        expect((await row(id)).liveStatus).toBe("live")
      })

      test("a listing read before the last observation does not overwrite it", async () => {
        const id = unique()
        await observe(id, { observedAt: at(10), status: "ended" })

        await sync(
          [listed(id, { contentType: "live", liveStatus: "live" })],
          at(5),
        )

        expect((await row(id)).liveStatus).toBe("ended")
      })

      test("a newer listing ends a broadcast that was stored live", async () => {
        const id = unique()
        await observe(id, { observedAt: at(0) })

        await sync(
          [listed(id, { contentType: "live", liveStatus: "ended" })],
          at(20),
        )

        expect((await row(id)).liveStatus).toBe("ended")
      })
    })

    describe("liveRecheckAt", () => {
      const recheckAt = async (externalPostId: string) =>
        (
          await client.query(
            `SELECT "liveRecheckAt" FROM "ChannelPost" WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
            [workspaceId, externalPostId],
          )
        ).rows[0]?.liveRecheckAt as Date | null

      test("a live observation schedules the next re-read ten minutes later", async () => {
        const id = unique()

        await observe(id, { observedAt: at(0) })

        expect(await recheckAt(id)).toEqual(at(10))
      })

      test("an ended observation clears it", async () => {
        const id = unique()
        await observe(id, { observedAt: at(0) })

        await observe(id, { observedAt: at(5), status: "ended" })

        expect(await recheckAt(id)).toBeNull()
      })

      test("an observation that is not applied leaves it as it was", async () => {
        const id = unique()
        await observe(id, { observedAt: at(10) })

        await observe(id, { observedAt: at(5), status: "ended" })

        expect(await recheckAt(id)).toEqual(at(20))
      })

      test("a listing that says live schedules it and one that says ended clears it", async () => {
        const id = unique()
        await sync(
          [listed(id, { contentType: "live", liveStatus: "live" })],
          at(0),
        )
        expect(await recheckAt(id)).toEqual(at(10))

        await sync(
          [listed(id, { contentType: "live", liveStatus: "ended" })],
          at(20),
        )

        expect(await recheckAt(id)).toBeNull()
      })

      test("a listing without a live status leaves it alone", async () => {
        const id = unique()
        await observe(id, { observedAt: at(0) })

        await sync([listed(id)], at(30))

        expect(await recheckAt(id)).toEqual(at(10))
      })
    })

    describe("claimLiveRechecks", () => {
      const claim = async (limit: number, now: Date) =>
        await channelPostRepository.claimLiveRechecks({
          giveUpBefore: new Date(now.getTime() - 24 * 60 * MINUTE),
          limit,
          now,
          recheckAfterMs: 10 * MINUTE,
        })
      const names = async (ids: string[]) =>
        (
          await client.query(
            `SELECT "externalPostId" FROM "ChannelPost" WHERE "id" = ANY($1::bigint[])`,
            [ids],
          )
        ).rows.map((row) => row.externalPostId as string)
      /** Rows the other tests of this file leave due must not be claimed here: park them. */
      const parkEverythingElse = async () =>
        await client.query(
          `UPDATE "ChannelPost" SET "liveRecheckAt" = NULL WHERE "workspaceId" = $1`,
          [workspaceId],
        )

      test("claims due rows oldest first, moves them a window ahead and never returns them twice", async () => {
        await parkEverythingElse()
        const first = unique()
        const second = unique()
        await observe(first, { observedAt: at(-60) })
        await observe(second, { observedAt: at(-50) })
        const now = at(0)

        const batch = await claim(500, now)
        const again = await claim(500, now)

        const claimed = await names(batch.map((row) => row.id))
        expect(claimed).toEqual(expect.arrayContaining([first, second]))
        expect(claimed.indexOf(first)).toBeLessThan(claimed.indexOf(second))
        expect(await names(again.map((row) => row.id))).not.toContain(first)
        const stored = await client.query(
          `SELECT "liveRecheckAt" FROM "ChannelPost" WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
          [workspaceId, first],
        )
        expect(stored.rows[0].liveRecheckAt).toEqual(at(10))
      })

      test("a batch that cannot be served moves on, so the next scan reaches the next rows", async () => {
        await parkEverythingElse()
        const ids = Array.from({ length: 21 }, () => unique())
        for (const [index, id] of ids.entries()) {
          await observe(id, { observedAt: at(-120 + index) })
        }
        const now = at(0)

        const firstScan = await claim(20, now)
        const secondScan = await claim(20, now)

        expect(firstScan).toHaveLength(20)
        expect(await names(secondScan.map((row) => row.id))).toEqual([ids[20]])
      })

      test("a broadcast older than the give-up window is cleared and not returned", async () => {
        await parkEverythingElse()
        const id = unique()
        await observe(id, { observedAt: at(-60) })
        await client.query(
          `UPDATE "ChannelPost" SET "publishedAt" = '2020-01-01' WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
          [workspaceId, id],
        )

        const batch = await claim(500, at(0))

        expect(await names(batch.map((row) => row.id))).not.toContain(id)
        const stored = await client.query(
          `SELECT "liveRecheckAt" FROM "ChannelPost" WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
          [workspaceId, id],
        )
        expect(stored.rows[0].liveRecheckAt).toBeNull()
      })

      test("a row that is not due is not claimed", async () => {
        await parkEverythingElse()
        const id = unique()
        await observe(id, { observedAt: at(0) })

        const batch = await claim(500, at(5))

        expect(await names(batch.map((row) => row.id))).not.toContain(id)
      })
    })

    describe("the claim index", () => {
      test("serves the due-row scan in order, with no Sort node", async () => {
        await client.query("BEGIN")
        try {
          await client.query("SET LOCAL enable_seqscan = off")
          const plan = await client.query(
            `EXPLAIN SELECT "id" FROM "ChannelPost" WHERE "liveStatus" = 'live' AND "liveRecheckAt" IS NOT NULL AND "liveRecheckAt" <= now() ORDER BY "liveRecheckAt", "id" LIMIT 20`,
          )
          const text = plan.rows.map((item) => item["QUERY PLAN"]).join("\n")
          expect(text).toContain("ChannelPost_liveRecheckAt_id_idx")
          expect(text).not.toContain("Sort")
        } finally {
          await client.query("ROLLBACK")
        }
      })
    })

    describe("the live filter index", () => {
      test("exists, is partial, and the live filter can use it", async () => {
        const index = await client.query(
          `SELECT pg_get_indexdef(indexrelid) AS def, indisvalid FROM pg_index WHERE indexrelid = to_regclass('"ChannelPost_workspaceId_liveStatus_sortAt_id_idx"')`,
        )
        expect(index.rows[0].indisvalid).toBe(true)
        expect(index.rows[0].def).toContain(`WHERE ("liveStatus" IS NOT NULL)`)

        await client.query("BEGIN")
        try {
          await client.query("SET LOCAL enable_seqscan = off")
          const plan = await client.query(
            `EXPLAIN SELECT "id" FROM "ChannelPost" WHERE "workspaceId" = $1 AND "liveStatus" = 'live' ORDER BY COALESCE("publishedAt", "createdAt") DESC, "id" DESC NULLS LAST LIMIT 30`,
            [workspaceId],
          )
          const text = plan.rows.map((item) => item["QUERY PLAN"]).join("\n")
          expect(text).toContain(
            "ChannelPost_workspaceId_liveStatus_sortAt_id_idx",
          )
          expect(text).not.toContain("Sort")
        } finally {
          await client.query("ROLLBACK")
        }
      })
    })
  },
)
