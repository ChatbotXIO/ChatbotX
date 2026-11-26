// @vitest-environment node

/**
 * Post-metric snapshots against a real database: partition routing, baseline,
 * the stale-observation guard, unknown vs zero, retention, workspace scoping,
 * the reads and their query plans.
 *
 * Runs only against an explicitly configured local database after the approved
 * migrations were applied: `pnpm --filter @chatbotx.io/database test:db`.
 */

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { db } from "../../src/client"
import { relations } from "../../src/relations"
import {
  type ListedChannelPost,
  upsertListedChannelPosts,
} from "../../src/repositories/channel-post/listing"
import {
  countChannelPostMetricDefaultRows,
  countPostsPublished,
  createChannelPostMetricPartition,
  deleteChannelPostMetricDefaultRowsBefore,
  dropChannelPostMetricPartition,
  listChannelPostMetricDefaultMonths,
  listChannelPostMetricPartitions,
  listPostMetricPoints,
  type PostMetricScope,
  postMetricCoverage,
  sampleBestTimes,
  summarizePostMetrics,
  timeseriesPostMetrics,
  topPostsByMetric,
} from "../../src/repositories/channel-post-metric"
import { workspacePurgeRepository } from "../../src/repositories/workspace-purge"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const RANGE_INDEX =
  /"Index Name":"ChannelPostMetricDaily_\w*(pkey|workspaceId_\w+_idx\d*)"/
const WORKSPACE_INDEX =
  /"Index Name":"ChannelPostMetricDaily_\w*workspaceId_\w+_idx\d*"/
const PARTITION_SCAN = /"Relation Name":"ChannelPostMetricDaily_/g

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const TIMEZONE = "Asia/Ho_Chi_Minh"

const localDay = (at: Date, timezone = TIMEZONE): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at)

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

type Workspace = { id: string; inboxId: string }

describe.skipIf(!databaseUrl)(
  "post metric snapshots on a real database",
  () => {
    let client: Client
    let userId: string
    const workspaces: Workspace[] = []
    const database = () => drizzle({ client, relations, schema })

    const createWorkspace = async (label: string): Promise<Workspace> => {
      const suffix = `${Date.now()}-${Math.random()}`
      const [workspace] = await database()
        .insert(schema.workspaceModel)
        .values({
          name: `${label}-${suffix}`,
          ownerId: userId,
          timezone: TIMEZONE,
        })
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

    const upsert = async (
      workspace: Workspace,
      posts: ListedChannelPost[],
      observedAt: Date,
    ) =>
      await upsertListedChannelPosts(
        {
          now: observedAt,
          observedAt,
          posts,
          target: {
            channel: "messenger",
            inboxId: workspace.inboxId,
            integrationId: "1",
            sourceAccountId: "page-1",
            workspaceId: workspace.id,
          },
          timezone: TIMEZONE,
        },
        database(),
      )

    const postId = async (workspace: Workspace, externalPostId: string) => {
      const result = await client.query<{ id: string }>(
        `SELECT "id"::text AS "id" FROM "ChannelPost" WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
        [workspace.id, externalPostId],
      )
      return result.rows[0]?.id as string
    }

    const snapshots = async (workspace: Workspace, externalPostId: string) => {
      const result = await client.query(
        `SELECT d.*, d.tableoid::regclass::text AS "partition", to_char(d."day", 'YYYY-MM-DD') AS "dayText"
       FROM "ChannelPostMetricDaily" d
       WHERE d."workspaceId" = $1 AND d."channelPostId" = $2 ORDER BY d."day"`,
        [workspace.id, await postId(workspace, externalPostId)],
      )
      return result.rows
    }

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
      const [user] = await database()
        .insert(schema.userModel)
        .values({
          email: `post-metrics-${Date.now()}-${Math.random()}@example.test`,
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

    describe("writes", () => {
      test("routes a snapshot into its monthly partition, not the default one", async () => {
        const workspace = await createWorkspace("route")
        const observedAt = new Date()
        await upsert(
          workspace,
          [listed("p1", { commentsCount: 3 })],
          observedAt,
        )

        const [row] = await snapshots(workspace, "p1")
        const [year, month] = localDay(observedAt).split("-")
        expect(String(row.partition).replaceAll('"', "")).toBe(
          `ChannelPostMetricDaily_${year}_${month}`,
        )
        expect(row.dayText).toBe(localDay(observedAt))
      })

      test("a post first seen long after publication only seeds a baseline", async () => {
        const workspace = await createWorkspace("baseline")
        await upsert(
          workspace,
          [
            listed("old", {
              commentsCount: 40,
              reactionsCount: 900,
              sharesCount: 5,
              viewsCount: 12_000,
            }),
          ],
          new Date(),
        )

        const [row] = await snapshots(workspace, "old")
        expect(row).toMatchObject({
          commentsCount: "40",
          commentsGain: "0",
          engagementCount: "945",
          engagementGain: "0",
          isBaseline: true,
          reactionsCount: "900",
          viewsCount: "12000",
          viewsGain: "0",
        })
      })

      test("a post first seen right after publication counts its first total as that day's gain", async () => {
        const workspace = await createWorkspace("fresh")
        await upsert(
          workspace,
          [
            listed("new", {
              commentsCount: 4,
              publishedAt: new Date(Date.now() - HOUR),
              reactionsCount: 10,
            }),
          ],
          new Date(),
        )

        const [row] = await snapshots(workspace, "new")
        expect(row).toMatchObject({
          commentsGain: "4",
          engagementGain: "14",
          isBaseline: false,
          reactionsGain: "10",
        })
      })

      test("later observations add signed gains to the day and keep the baseline flag", async () => {
        const workspace = await createWorkspace("gain")
        const t0 = new Date()
        await upsert(workspace, [listed("g", { commentsCount: 10 })], t0)
        await upsert(
          workspace,
          [listed("g", { commentsCount: 15 })],
          new Date(t0.getTime() + MINUTE),
        )
        await upsert(
          workspace,
          [listed("g", { commentsCount: 12 })],
          new Date(t0.getTime() + 2 * MINUTE),
        )

        const rows = await snapshots(workspace, "g")
        const sameDay = rows.filter((row) => row.dayText === localDay(t0))
        expect(sameDay).toHaveLength(1)
        // +5 then -3: the net change of the day, a decrease is kept signed.
        expect(sameDay[0]).toMatchObject({
          commentsCount: "12",
          commentsGain: "2",
          isBaseline: true,
        })
      })

      test("an unchanged post writes no new row and leaves the stored one alone", async () => {
        const workspace = await createWorkspace("same")
        const t0 = new Date()
        await upsert(workspace, [listed("s", { commentsCount: 2 })], t0)
        const [before] = await snapshots(workspace, "s")
        await upsert(
          workspace,
          [listed("s", { commentsCount: 2 })],
          new Date(t0.getTime() + 5 * MINUTE),
        )
        const rows = await snapshots(workspace, "s")
        expect(rows).toHaveLength(1)
        expect(rows[0].observedAt).toEqual(before.observedAt)
      })

      test("a stale observation changes neither the post nor its snapshots", async () => {
        const workspace = await createWorkspace("stale")
        const t0 = new Date()
        await upsert(workspace, [listed("st", { commentsCount: 10 })], t0)
        const newer = new Date(t0.getTime() + 10 * MINUTE)
        await upsert(workspace, [listed("st", { commentsCount: 20 })], newer)
        // An older read (taken before the newer one) lands last.
        await upsert(
          workspace,
          [listed("st", { commentsCount: 11 })],
          new Date(t0.getTime() + 5 * MINUTE),
        )

        const stored = await client.query(
          `SELECT "commentsCount", "metricsFetchedAt" FROM "ChannelPost" WHERE "id" = $1`,
          [await postId(workspace, "st")],
        )
        expect(stored.rows[0].commentsCount).toBe("20")
        expect(new Date(stored.rows[0].metricsFetchedAt)).toEqual(newer)
        const [row] = await snapshots(workspace, "st")
        expect(row).toMatchObject({ commentsCount: "20", commentsGain: "10" })
      })

      test("an unreported count is NULL, becomes a baseline when first reported, never a gain", async () => {
        const workspace = await createWorkspace("unknown")
        const t0 = new Date()
        // Comments only (like a listing without reactions or shares).
        await upsert(
          workspace,
          [
            listed("u", {
              commentsCount: 5,
              reactionsCount: null,
              sharesCount: null,
            }),
          ],
          t0,
        )
        let [row] = await snapshots(workspace, "u")
        expect(row.reactionsCount).toBeNull()
        expect(row.sharesCount).toBeNull()
        expect(row.viewsCount).toBeNull()
        expect(row.engagementCount).toBe("5")

        // Reactions become known with a large lifetime total: baseline, not +300.
        await upsert(
          workspace,
          [
            listed("u", {
              commentsCount: 5,
              reactionsCount: 300,
              sharesCount: null,
            }),
          ],
          new Date(t0.getTime() + MINUTE),
        )
        ;[row] = await snapshots(workspace, "u")
        expect(row).toMatchObject({
          engagementGain: "0",
          reactionsCount: "300",
          reactionsGain: "0",
        })
        const stored = await client.query(
          `SELECT "metricsKnownMask" FROM "ChannelPost" WHERE "id" = $1`,
          [await postId(workspace, "u")],
        )
        expect(stored.rows[0].metricsKnownMask).toBe(11) // comments (1) + reactions (2) + current comments definition (8)

        // Now they are known: a later change is a real gain.
        await upsert(
          workspace,
          [
            listed("u", {
              commentsCount: 5,
              reactionsCount: 310,
              sharesCount: null,
            }),
          ],
          new Date(t0.getTime() + 2 * MINUTE),
        )
        ;[row] = await snapshots(workspace, "u")
        expect(row).toMatchObject({
          reactionsCount: "310",
          reactionsGain: "10",
        })
      })

      test("a bare row recorded from a comment is a baseline, not a day's gain", async () => {
        const workspace = await createWorkspace("bare")
        await client.query(
          `INSERT INTO "ChannelPost" ("id", "workspaceId", "inboxId", "channel", "integrationId", "sourceAccountId",
           "externalPostId", "publishedAt", "commentsCount", "engagementCount")
         VALUES (floor(random() * 9e15)::bigint + 1e15::bigint, $1, $2, 'messenger', 1, 'page-1', 'bare', now() - interval '5 days', 500, 500)`,
          [workspace.id, workspace.inboxId],
        )
        await upsert(
          workspace,
          [listed("bare", { commentsCount: 500 })],
          new Date(),
        )

        const [row] = await snapshots(workspace, "bare")
        expect(row).toMatchObject({
          commentsCount: "500",
          commentsGain: "0",
          isBaseline: true,
        })
      })

      test("a post older than the 90-day window gets no snapshot", async () => {
        const workspace = await createWorkspace("window")
        await upsert(
          workspace,
          [
            listed("ancient", {
              commentsCount: 9,
              publishedAt: new Date(Date.now() - 100 * DAY),
            }),
          ],
          new Date(),
        )
        expect(await snapshots(workspace, "ancient")).toHaveLength(0)
      })

      test("a page that lists a post twice is written once", async () => {
        const workspace = await createWorkspace("dupe")
        await upsert(
          workspace,
          [
            listed("d", { commentsCount: 1 }),
            listed("d", { commentsCount: 2 }),
          ],
          new Date(),
        )
        const rows = await snapshots(workspace, "d")
        expect(rows).toHaveLength(1)
        expect(rows[0].commentsCount).toBe("2")
      })
    })

    describe("retention", () => {
      test("a month past retention is dropped whole; the others stay", async () => {
        const month = new Date(Date.UTC(2019, 0, 1))
        // A leftover of an interrupted earlier run would make `create` answer false.
        await client.query(
          'DROP TABLE IF EXISTS "ChannelPostMetricDaily_2019_01"',
        )
        expect(await createChannelPostMetricPartition(month)).toBe(true)
        expect(await createChannelPostMetricPartition(month)).toBe(false)
        const workspace = await createWorkspace("retention")
        await client.query(
          `INSERT INTO "ChannelPostMetricDaily" ("workspaceId", "day", "channelPostId", "inboxId", "channel")
         VALUES ($1, '2019-01-15', 1, $2, 'messenger')`,
          [workspace.id, workspace.inboxId],
        )
        const old = (await listChannelPostMetricPartitions()).find(
          (partition) => partition.name === "ChannelPostMetricDaily_2019_01",
        )
        expect(old?.monthStart).toEqual(month)

        await dropChannelPostMetricPartition("ChannelPostMetricDaily_2019_01")

        const names = (await listChannelPostMetricPartitions()).map(
          (partition) => partition.name,
        )
        expect(names).not.toContain("ChannelPostMetricDaily_2019_01")
        expect(names.length).toBeGreaterThanOrEqual(3)
        const left = await client.query(
          `SELECT count(*)::int AS "n" FROM "ChannelPostMetricDaily" WHERE "workspaceId" = $1`,
          [workspace.id],
        )
        expect(left.rows[0].n).toBe(0)
      })

      test("refuses to drop a partition that is not a metric month", async () => {
        await expect(
          dropChannelPostMetricPartition("ContactActiveHourly_2026_01"),
        ).rejects.toThrow()
      })
    })

    describe("review fixes", () => {
      const insertBare = async (
        workspace: Workspace,
        externalPostId: string,
        publishedHoursAgo: number,
      ) =>
        await client.query(
          `INSERT INTO "ChannelPost" ("id", "workspaceId", "inboxId", "channel", "integrationId", "sourceAccountId",
           "externalPostId", "publishedAt")
         VALUES (floor(random() * 9e15)::bigint + 1e15::bigint, $1, $2, 'messenger', 1, 'page-1', $3, now() - make_interval(hours => $4))`,
          [workspace.id, workspace.inboxId, externalPostId, publishedHoursAgo],
        )

      test("a post published through the composer counts its first sync as that day's gain", async () => {
        const workspace = await createWorkspace("composer")
        await insertBare(workspace, "composed", 2)
        await upsert(
          workspace,
          [
            listed("composed", {
              commentsCount: 7,
              publishedAt: new Date(Date.now() - 2 * HOUR),
            }),
          ],
          new Date(),
        )

        const [row] = await snapshots(workspace, "composed")
        expect(row).toMatchObject({
          commentsCount: "7",
          commentsGain: "7",
          engagementGain: "7",
          isBaseline: false,
        })
      })

      test("a bare row published long ago still seeds only a baseline", async () => {
        const workspace = await createWorkspace("composer-old")
        await insertBare(workspace, "old-bare", 24 * 20)
        await upsert(
          workspace,
          [
            listed("old-bare", {
              commentsCount: 70,
              publishedAt: new Date(Date.now() - 20 * DAY),
            }),
          ],
          new Date(),
        )

        const [row] = await snapshots(workspace, "old-bare")
        expect(row).toMatchObject({ commentsGain: "0", isBaseline: true })
      })

      test("a quiet window is 0, not unavailable, while a count nobody reports stays unavailable", async () => {
        const workspace = await createWorkspace("quiet")
        const t0 = new Date()
        await upsert(
          workspace,
          [
            listed("p", {
              commentsCount: 3,
              reactionsCount: 1,
              sharesCount: 0,
            }),
          ],
          t0,
        )
        const quiet = {
          from: localDay(new Date(Date.now() - 60 * DAY)),
          to: localDay(new Date(Date.now() - 50 * DAY)),
        }
        const before = {
          from: localDay(new Date(Date.now() - 80 * DAY)),
          to: localDay(new Date(Date.now() - 61 * DAY)),
        }

        const summary = await summarizePostMetrics({
          current: quiet,
          previous: before,
          scope: { workspaceId: workspace.id },
        })
        expect(summary.current.comments).toBe(0)
        expect(summary.available.comments).toBe(true)
        expect(summary.available.engagement).toBe(true)
        expect(summary.available.views).toBe(false)

        const series = await timeseriesPostMetrics({
          groupBy: "none",
          metric: "comments",
          range: quiet,
          scope: { workspaceId: workspace.id },
        })
        expect(series).toEqual({ available: true, rows: [] })
        const views = await timeseriesPostMetrics({
          groupBy: "none",
          metric: "views",
          range: quiet,
          scope: { workspaceId: workspace.id },
        })
        expect(views.available).toBe(false)
      })

      test("a read that needs no post column gives the same totals as one that joins the post", async () => {
        const workspace = await createWorkspace("nojoin")
        const t0 = new Date()
        await upsert(workspace, [listed("j", { commentsCount: 1 })], t0)
        await upsert(
          workspace,
          [listed("j", { commentsCount: 4 })],
          new Date(t0.getTime() + MINUTE),
        )
        const range = {
          from: localDay(new Date(Date.now() - DAY)),
          to: localDay(new Date(Date.now() + DAY)),
        }
        const read = async (scope: PostMetricScope) =>
          (
            await summarizePostMetrics({
              current: range,
              previous: range,
              scope,
            })
          ).current.comments
        const base = { workspaceId: workspace.id }
        // No post filter: no ChannelPost join. A topic filter forces the join.
        expect(await read(base)).toBe(3)
        expect(await read({ ...base, channels: ["messenger"] })).toBe(3)
        expect(await read({ ...base, channels: ["instagram"] })).toBe(0)
        expect(await read({ ...base, topicIds: ["0"] })).toBe(0)
      })

      test("removing a post later does not rewrite past gains", async () => {
        const workspace = await createWorkspace("removed")
        const t0 = new Date()
        await upsert(workspace, [listed("r", { commentsCount: 1 })], t0)
        await upsert(
          workspace,
          [listed("r", { commentsCount: 6 })],
          new Date(t0.getTime() + MINUTE),
        )
        const range = {
          from: localDay(new Date(Date.now() - DAY)),
          to: localDay(new Date(Date.now() + DAY)),
        }
        const scope = { workspaceId: workspace.id }
        const read = async () =>
          (
            await summarizePostMetrics({
              current: range,
              previous: range,
              scope,
            })
          ).current.comments
        expect(await read()).toBe(5)

        await client.query(
          `UPDATE "ChannelPost" SET "removedAt" = now() WHERE "id" = $1`,
          [await postId(workspace, "r")],
        )

        expect(await read()).toBe(5)
        expect(
          await topPostsByMetric({
            limit: 10,
            metric: "comments",
            range,
            rankBy: "gained",
            scope,
            timezone: TIMEZONE,
          }),
        ).toHaveLength(0)
      })

      test("posts published are counted by workspace-local day boundaries", async () => {
        const workspace = await createWorkspace("bounds")
        // 2026-11-23T18:00Z is 2026-11-24 01:00 in Ho Chi Minh (UTC+7).
        await upsert(
          workspace,
          [listed("edge", { publishedAt: new Date("2026-11-23T18:00:00Z") })],
          new Date("2026-11-23T19:00:00Z"),
        )
        const count = async (day: string, timezone: string) =>
          await countPostsPublished({
            range: { from: day, to: day },
            scope: { workspaceId: workspace.id },
            timezone,
          })
        expect(await count("2026-11-24", "Asia/Ho_Chi_Minh")).toBe(1)
        expect(await count("2026-11-23", "Asia/Ho_Chi_Minh")).toBe(0)
        expect(await count("2026-11-23", "UTC")).toBe(1)
        expect(await count("2026-11-24", "UTC")).toBe(0)
      })

      test("a month missing while the DEFAULT partition holds its rows is healed, rows kept", async () => {
        const month = new Date(Date.UTC(2018, 2, 1))
        await client.query(
          'DROP TABLE IF EXISTS "ChannelPostMetricDaily_2018_03"',
        )
        const workspace = await createWorkspace("heal")
        await client.query(
          `INSERT INTO "ChannelPostMetricDaily" ("workspaceId", "day", "channelPostId", "inboxId", "channel", "commentsCount")
         VALUES ($1, '2018-03-10', 1, $2, 'messenger', 5), ($1, '2018-03-11', 1, $2, 'messenger', 6)`,
          [workspace.id, workspace.inboxId],
        )
        const strayed = await client.query(
          `SELECT count(*)::int AS "n" FROM "ChannelPostMetricDaily_default" WHERE "workspaceId" = $1`,
          [workspace.id],
        )
        expect(strayed.rows[0].n).toBe(2)

        expect(await createChannelPostMetricPartition(month)).toBe(true)

        const placed = await client.query(
          `SELECT d.tableoid::regclass::text AS "partition", d."commentsCount"::int AS "n"
         FROM "ChannelPostMetricDaily" d WHERE d."workspaceId" = $1 ORDER BY d."day"`,
          [workspace.id],
        )
        expect(placed.rows).toEqual([
          { n: 5, partition: '"ChannelPostMetricDaily_2018_03"' },
          { n: 6, partition: '"ChannelPostMetricDaily_2018_03"' },
        ])
        const left = await client.query(
          `SELECT count(*)::int AS "n" FROM "ChannelPostMetricDaily_default" WHERE "workspaceId" = $1`,
          [workspace.id],
        )
        expect(left.rows[0].n).toBe(0)
        expect(typeof (await countChannelPostMetricDefaultRows())).toBe(
          "number",
        )
        await dropChannelPostMetricPartition("ChannelPostMetricDaily_2018_03")
      })

      test("lists the months held by the DEFAULT partition and deletes those before a horizon", async () => {
        await client.query(
          'DROP TABLE IF EXISTS "ChannelPostMetricDaily_2017_05"',
        )
        const workspace = await createWorkspace("default-purge")
        await client.query(
          `INSERT INTO "ChannelPostMetricDaily" ("workspaceId", "day", "channelPostId", "inboxId", "channel", "commentsCount")
         VALUES ($1, '2017-05-10', 1, $2, 'messenger', 1), ($1, '2017-06-10', 1, $2, 'messenger', 1)`,
          [workspace.id, workspace.inboxId],
        )
        const months = (await listChannelPostMetricDefaultMonths()).map((m) =>
          m.toISOString().slice(0, 7),
        )
        expect(months).toContain("2017-05")
        expect(months).toContain("2017-06")
        expect(
          await deleteChannelPostMetricDefaultRowsBefore(
            new Date(Date.UTC(2017, 5, 1)),
          ),
        ).toBeGreaterThanOrEqual(1)
        const left = await client.query(
          `SELECT to_char("day", 'YYYY-MM-DD') AS "d" FROM "ChannelPostMetricDaily_default" WHERE "workspaceId" = $1`,
          [workspace.id],
        )
        expect(left.rows).toEqual([{ d: "2017-06-10" }])
      })
    })

    describe("reads", () => {
      let a: Workspace
      let b: Workspace
      const range = {
        from: localDay(new Date(Date.now() - 5 * DAY)),
        to: localDay(new Date(Date.now() + DAY)),
      }
      const previous = {
        from: localDay(new Date(Date.now() - 12 * DAY)),
        to: localDay(new Date(Date.now() - 6 * DAY)),
      }

      beforeAll(async () => {
        a = await createWorkspace("read-a")
        b = await createWorkspace("read-b")
        const t0 = new Date()
        await upsert(
          a,
          [
            listed("top", {
              commentsCount: 10,
              reactionsCount: 0,
              sharesCount: 0,
            }),
            listed("quiet", {
              commentsCount: 1,
              reactionsCount: 0,
              sharesCount: 0,
            }),
          ],
          t0,
        )
        await upsert(
          a,
          [
            listed("top", {
              commentsCount: 25,
              reactionsCount: 8,
              sharesCount: 0,
            }),
            listed("quiet", {
              commentsCount: 2,
              reactionsCount: 0,
              sharesCount: 0,
            }),
          ],
          new Date(t0.getTime() + MINUTE),
        )
        await upsert(b, [listed("other", { commentsCount: 1 })], t0)
        await upsert(
          b,
          [listed("other", { commentsCount: 999 })],
          new Date(t0.getTime() + MINUTE),
        )
      })

      test("summary counts only the workspace's gains and reports availability", async () => {
        const summary = await summarizePostMetrics({
          current: range,
          previous,
          scope: { workspaceId: a.id },
        })
        expect(summary.current.comments).toBe(16) // (25-10) + (2-1)
        expect(summary.current.reactions).toBe(8)
        expect(summary.current.engagement).toBe(24)
        expect(summary.available.comments).toBe(true)
        expect(summary.available.views).toBe(false)
        expect(summary.previous.comments).toBe(0)
      })

      test("timeseries fills nothing itself and is scoped by inbox", async () => {
        const series = await timeseriesPostMetrics({
          groupBy: "inbox",
          metric: "comments",
          range,
          scope: { inboxIds: [a.inboxId], workspaceId: a.id },
        })
        expect(series.available).toBe(true)
        expect(series.rows.every((row) => row.groupKey === a.inboxId)).toBe(
          true,
        )
        expect(series.rows.reduce((sum, row) => sum + row.gain, 0)).toBe(16)

        const foreign = await timeseriesPostMetrics({
          groupBy: "none",
          metric: "comments",
          range,
          scope: { inboxIds: [b.inboxId], workspaceId: a.id },
        })
        expect(foreign.rows).toEqual([])
      })

      test("top posts rank by gain and by total, without leaking another workspace", async () => {
        const gained = await topPostsByMetric({
          limit: 5,
          metric: "comments",
          range,
          rankBy: "gained",
          scope: { workspaceId: a.id },
          timezone: TIMEZONE,
        })
        expect(gained.map((post) => post.caption)).toEqual([
          "post top",
          "post quiet",
        ])
        expect(gained[0]).toMatchObject({ gained: 15, total: 25 })

        const total = await topPostsByMetric({
          limit: 5,
          metric: "comments",
          range: {
            from: localDay(new Date(Date.now() - 30 * DAY)),
            to: range.to,
          },
          rankBy: "total",
          scope: { workspaceId: a.id },
          timezone: TIMEZONE,
        })
        expect(total.map((post) => post.total)).toEqual([25, 2])

        const views = await topPostsByMetric({
          limit: 5,
          metric: "views",
          range,
          rankBy: "gained",
          scope: { workspaceId: a.id },
          timezone: TIMEZONE,
        })
        expect(views).toEqual([])
      })

      test("coverage tells measured posts from posts with history", async () => {
        const { rows, truncated } = await postMetricCoverage({
          now: new Date(),
          scope: { workspaceId: a.id },
        })
        expect(truncated).toBe(false)
        expect(rows).toEqual([
          expect.objectContaining({
            channel: "messenger",
            posts: 2,
            postsMeasured: 2,
            postsWithHistory: 2,
            trackingSince: localDay(new Date()),
          }),
        ])
        const empty = await postMetricCoverage({
          now: new Date(),
          scope: { workspaceId: "1" },
        })
        expect(empty.rows).toEqual([])
      })

      test("per-post points come back oldest first and scoped to the workspace", async () => {
        const topId = await postId(a, "top")
        const points = await listPostMetricPoints({
          channelPostIds: [topId],
          range,
          workspaceId: a.id,
        })
        expect(points.get(topId)?.[0]).toMatchObject({
          comments: { gain: 15, total: 25 },
          isBaseline: true,
        })
        const foreign = await listPostMetricPoints({
          channelPostIds: [topId],
          range,
          workspaceId: b.id,
        })
        expect(foreign.size).toBe(0)
      })

      test("best-times sample leaves young posts and other workspaces out", async () => {
        const { samples } = await sampleBestTimes({
          now: new Date(),
          scope: { workspaceId: a.id },
        })
        // The two posts were published 10 days ago with known counts.
        expect(samples).toHaveLength(2)
      })

      const explain = async (statement: string, params: unknown[]) => {
        await client.query("BEGIN")
        try {
          await client.query("SET LOCAL enable_seqscan = off")
          const plan = await client.query<{ "QUERY PLAN": unknown }>(
            `EXPLAIN (FORMAT JSON) ${statement}`,
            params,
          )
          return JSON.stringify(plan.rows[0]?.["QUERY PLAN"])
        } finally {
          await client.query("ROLLBACK")
        }
      }

      test("the range read and the per-post read use the workspace-leading indexes", async () => {
        const range_ = await explain(
          `SELECT sum(d."commentsGain") FROM "ChannelPostMetricDaily" d
         JOIN "ChannelPost" cp ON cp."id" = d."channelPostId" AND cp."workspaceId" = d."workspaceId"
         WHERE d."workspaceId" = $1::bigint AND d."day" >= $2::date AND d."day" <= $3::date AND cp."removedAt" IS NULL`,
          [a.id, range.from, range.to],
        )
        // The planner may pick either workspace-leading index; both prune to the
        // months of the range and neither falls back to a sequential scan.
        expect(range_).toMatch(RANGE_INDEX)
        expect(range_.match(PARTITION_SCAN)?.length).toBeLessThanOrEqual(2)
        expect(range_).not.toContain("Seq Scan")

        const perPost = await explain(
          `SELECT * FROM "ChannelPostMetricDaily" d WHERE d."workspaceId" = $1::bigint
         AND d."channelPostId" = ANY($2::bigint[]) AND d."day" >= $3::date AND d."day" <= $4::date`,
          [a.id, [await postId(a, "top")], range.from, range.to],
        )
        expect(perPost).toMatch(WORKSPACE_INDEX)
        expect(perPost).not.toContain("Seq Scan")
      })
    })

    describe("workspace purge", () => {
      test("drains the partitioned table by workspace only", async () => {
        const mine = await createWorkspace("purge-a")
        const theirs = await createWorkspace("purge-b")
        await upsert(mine, [listed("x", { commentsCount: 1 })], new Date())
        await upsert(theirs, [listed("y", { commentsCount: 1 })], new Date())
        const spec = {
          primaryKey: ["workspaceId", "day", "channelPostId"],
          selector: "workspace",
          table: "ChannelPostMetricDaily",
        } as const

        const deleted = await workspacePurgeRepository.deletePartitionedBatch(
          spec,
          mine.id,
          100,
          db,
        )

        expect(deleted).toBeGreaterThan(0)
        expect(
          await workspacePurgeRepository.hasPartitionedWorkspaceRows(
            spec,
            mine.id,
            db,
          ),
        ).toBe(false)
        expect(
          await workspacePurgeRepository.hasPartitionedWorkspaceRows(
            spec,
            theirs.id,
            db,
          ),
        ).toBe(true)
      })
    })
  },
)
