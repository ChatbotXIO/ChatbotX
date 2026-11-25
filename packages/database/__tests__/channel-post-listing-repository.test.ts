import { formatInTimeZone } from "date-fns-tz"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import {
  type ListedChannelPost,
  upsertListedChannelPosts,
} from "../src/repositories/channel-post/listing"

const dialect = new PgDialect()
const NOW = new Date("2026-11-22T10:00:00.000Z")
/** 03:00 the next day in Ho Chi Minh, still the same UTC day. */
const LATE = new Date("2026-11-22T20:00:00.000Z")

const post = (
  overrides: Partial<ListedChannelPost> = {},
): ListedChannelPost => ({
  authorExternalId: null,
  authorName: null,
  caption: "Hello",
  commentsCount: 4,
  contentType: "photo",
  externalPostId: "ext-1",
  liveStatus: null,
  mediaType: "added_photos",
  permalink: "https://example.test/p/1",
  publishedAt: new Date("2026-11-20T08:00:00.000Z"),
  reactionsCount: null,
  sharesCount: 2,
  viewsCount: null,
  ...overrides,
})

const target = {
  channel: "messenger",
  inboxId: "11",
  integrationId: "5",
  sourceAccountId: "page-1",
  workspaceId: "ws-1",
}

const runUpsert = async (posts: ListedChannelPost[]) => {
  const execute = vi.fn().mockResolvedValue({ rowCount: 0 })
  const client = { execute }
  const tx = {
    transaction: async (run: (c: typeof client) => Promise<unknown>) =>
      await run(client),
  } as unknown as DatabaseClient

  await upsertListedChannelPosts({ now: NOW, posts, target }, tx)

  return execute.mock.calls.map(([statement]) => dialect.sqlToQuery(statement))
}

describe("upsertListedChannelPosts", () => {
  test("writes a page as an insert, a row lock, a snapshot and an update in a single transaction", async () => {
    const statements = await runUpsert([post()])

    expect(statements).toHaveLength(4)
    expect(statements[0]?.sql).toContain('INSERT INTO "ChannelPost"')
    expect(statements[0]?.sql).toContain(
      'ON CONFLICT ("workspaceId", "channel", "externalPostId") DO NOTHING',
    )
    expect(statements[3]?.sql).toContain('UPDATE "ChannelPost" AS p SET')
  })

  test("locks the page's existing rows in id order before updating, like the bulk update does", async () => {
    const [, lock] = await runUpsert([
      post(),
      post({ externalPostId: "ext-2" }),
    ])

    expect(lock?.sql).toContain('ORDER BY "id"')
    expect(lock?.sql).toContain("FOR UPDATE")
    // One array parameter: a bare JS array would be spread into a record.
    expect(lock?.sql).toContain('"externalPostId" = ANY($3::text[])')
    expect(lock?.params).toEqual(["ws-1", "messenger", ["ext-1", "ext-2"]])
  })

  test("a new post starts an unreported count at zero, and engagement is the sum", async () => {
    const [insert] = await runUpsert([post()])

    expect(insert?.sql).toContain('COALESCE(v."commentsCount", 0)')
    expect(insert?.sql).toContain(
      'COALESCE(v."commentsCount", 0) + COALESCE(v."reactionsCount", 0) + COALESCE(v."sharesCount", 0)',
    )
  })

  test("an existing post keeps a stored count the listing leaves out", async () => {
    const [, , , update] = await runUpsert([post()])

    expect(update?.sql).toContain(
      '"reactionsCount" = COALESCE(v."reactionsCount", p."reactionsCount")',
    )
    expect(update?.sql).toContain(
      '"engagementCount" = COALESCE(v."commentsCount", p."commentsCount") + COALESCE(v."reactionsCount", p."reactionsCount") + COALESCE(v."sharesCount", p."sharesCount")',
    )
  })

  test("an existing post keeps a stored description column the listing leaves out", async () => {
    const [, , , update] = await runUpsert([post()])

    for (const column of ["caption", "mediaType", "permalink", "publishedAt"]) {
      expect(update?.sql).toContain(
        `"${column}" = COALESCE(v."${column}", p."${column}")`,
      )
    }
  })

  test("a listing without a live status never clears a stored one, and only a newer reading replaces it", async () => {
    const [, , , update] = await runUpsert([post()])

    expect(update?.sql).toContain(
      `"liveStatus" = CASE WHEN (v."liveStatus" IS NOT NULL AND (p."liveStatusObservedAt" IS NULL OR p."liveStatusObservedAt" < `,
    )
    expect(update?.sql).toContain(`THEN v."liveStatus" ELSE p."liveStatus" END`)
    expect(update?.sql).toContain(`ELSE p."liveStatusObservedAt" END`)
  })

  test("a post lookup reporting a plain video does not turn a stored reel or live broadcast back into a video", async () => {
    const [, , , update] = await runUpsert([post({ contentType: "video" })])

    expect(update?.sql).toContain(
      `"contentType" = CASE WHEN p."contentType" IN ('reel', 'live') AND v."contentType" = 'video' THEN p."contentType" ELSE COALESCE(v."contentType", p."contentType") END`,
    )
  })

  test("never writes the columns the sync does not own", async () => {
    const [insert, , , update] = await runUpsert([post()])
    const written = update?.sql.split("FROM (VALUES")[0] ?? ""

    for (const column of [
      "hideComments",
      "hidePhoneComments",
      "skipComments",
      "phoneCommentsCount",
      "thumbnail",
    ]) {
      expect(written).not.toContain(`"${column}"`)
      expect(insert?.sql.split("SELECT")[0]).not.toContain(`"${column}"`)
    }
  })

  test("a post the listing shows again is no longer hidden", async () => {
    const [insert, , , update] = await runUpsert([post()])

    expect(update?.sql).toContain('"removedAt" = NULL')
    expect(update?.sql).toContain('p."removedAt" IS NOT NULL')
    expect(insert?.sql.split("SELECT")[0]).not.toContain('"removedAt"')
  })

  test("rewrites a row only when something it reports changed or it was never measured", async () => {
    const [, , , update] = await runUpsert([post()])

    expect(update?.sql).toContain('p."metricsFetchedAt" IS NULL')
    expect(update?.sql).toContain("IS DISTINCT FROM")
  })

  test("scopes the update to the workspace and channel", async () => {
    const [, , , update] = await runUpsert([post()])

    expect(update?.sql).toContain('p."workspaceId" = $')
    expect(update?.sql).toContain('p."channel" = $')
    expect(update?.params).toContain("ws-1")
    expect(update?.params).toContain("messenger")
  })

  test("sends every value as a bound parameter, never inline", async () => {
    const hostile = `x'); DROP TABLE "ChannelPost"; --`
    const statements = await runUpsert([post({ caption: hostile })])

    const [insert, lock, , update] = statements
    for (const statement of statements) {
      expect(statement.sql).not.toContain("DROP TABLE")
    }
    // The caption travels in the insert and the update; the lock only names rows.
    expect(insert?.params).toContain(hostile)
    expect(update?.params).toContain(hostile)
    expect(lock?.params).not.toContain(hostile)
  })

  test("a null count is sent as null, not zero, so it stays unknown", async () => {
    const [insert] = await runUpsert([post({ commentsCount: null })])

    expect(insert?.params).not.toContain(0)
  })

  test("writes the first snapshot of a new post in the same statement as its insert", async () => {
    const [insert] = await runUpsert([post()])

    expect(insert?.sql).toContain("WITH inserted AS (")
    expect(insert?.sql).toContain('INSERT INTO "ChannelPostMetricDaily" AS d')
    expect(insert?.sql).toContain("FROM inserted i")
    expect(insert?.sql).toContain('"metricsKnownMask"')
  })

  test("computes the snapshot of an existing post from the locked row, before the update", async () => {
    const statements = await runUpsert([post()])
    const [, lock, snapshot, update] = statements

    expect(statements.indexOf(snapshot as never)).toBeGreaterThan(
      statements.indexOf(lock as never),
    )
    expect(snapshot?.sql).toContain('INSERT INTO "ChannelPostMetricDaily" AS d')
    expect(snapshot?.sql).toContain(
      'ON CONFLICT ("workspaceId", "day", "channelPostId") DO UPDATE',
    )
    // Gain is reported - stored, only for a count that was known before.
    expect(snapshot?.sql).toContain('v."commentsCount" - p."commentsCount"')
    expect(snapshot?.sql).toContain('(p."metricsKnownMask" & 1) > 0')
    expect(update?.sql).toContain('"metricsKnownMask" =')
  })

  test("a stale observation is skipped by the snapshot and the update alike", async () => {
    const [, , snapshot, update] = await runUpsert([post()])

    for (const statement of [snapshot, update]) {
      expect(statement?.sql).toContain(
        'p."metricsFetchedAt" IS NULL OR p."metricsFetchedAt" <',
      )
    }
  })

  test("names the snapshot day in the workspace time zone and falls back to UTC for an unknown one", async () => {
    const run = async (timezone?: string) => {
      const execute = vi.fn().mockResolvedValue({ rowCount: 0 })
      const tx = {
        transaction: async (
          fn: (c: { execute: typeof execute }) => Promise<unknown>,
        ) => await fn({ execute }),
      } as unknown as DatabaseClient
      await upsertListedChannelPosts(
        { now: LATE, posts: [post()], target, timezone },
        tx,
      )
      return dialect.sqlToQuery(execute.mock.calls[0]?.[0]).params
    }

    // The day is computed in JS (no pg_timezone_names scan per statement) and sent as a date.
    const day = (timezone: string) =>
      formatInTimeZone(LATE, timezone, "yyyy-MM-dd")
    expect(day("Asia/Ho_Chi_Minh")).not.toBe(day("UTC"))
    expect(await run("Asia/Ho_Chi_Minh")).toContain(day("Asia/Ho_Chi_Minh"))
    expect(await run("Not/AZone")).not.toContain("Not/AZone")
    expect(await run("Not/AZone")).toContain(day("UTC"))
    expect(await run()).toContain(day("UTC"))
  })

  test("counts are bigint end to end", async () => {
    const [insert] = await runUpsert([post()])

    expect(insert?.sql).toContain("::bigint")
    expect(insert?.sql).not.toContain("::integer")
  })

  test("lists a post twice and writes it once", async () => {
    const [, lock] = await runUpsert([
      post({ commentsCount: 1 }),
      post({ commentsCount: 2 }),
    ])

    expect(lock?.params?.at(-1)).toEqual(["ext-1"])
  })

  test("writes nothing for an empty page", async () => {
    expect(await runUpsert([])).toEqual([])
  })
})
