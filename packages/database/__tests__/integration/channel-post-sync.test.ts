// @vitest-environment node

/**
 * The post sync against a real database: row ownership (claim, fencing,
 * takeover), the scanner's locking, and the page upsert that must never touch
 * what the sync does not own.
 *
 * Runs only against an explicitly configured local database after the approved
 * migrations were applied: `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { db } from "../../src/client"
import { relations } from "../../src/relations"
import {
  findListedPostsWithoutThumbnail,
  type ListedChannelPost,
  saveListedPostThumbnail,
  upsertListedChannelPosts,
} from "../../src/repositories/channel-post/listing"
import { channelPostManagementRepository } from "../../src/repositories/channel-post/management"
import { channelPostRepository } from "../../src/repositories/channel-post/repository"
import { channelPostSyncRepository } from "../../src/repositories/channel-post-sync/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const MINUTE = 60_000

type Fixture = { userId: string; workspaceId: string }

describe.skipIf(!databaseUrl)("post sync against a real database", () => {
  let client: Client
  let fixture: Fixture
  const inboxIds: string[] = []

  const createInbox = async (
    label: string,
    options: { withIntegration?: boolean } = {},
  ) => {
    const database = drizzle({ client, relations, schema })
    const [inbox] = await database
      .insert(schema.inboxModel)
      .values({
        channel: "messenger",
        name: `Inbox ${label}`,
        sourceId: `messenger-${label}-${Math.random()}`,
        workspaceId: fixture.workspaceId,
      })
      .returning({ id: schema.inboxModel.id })
    inboxIds.push(inbox.id)
    if (options.withIntegration !== false) {
      await createIntegration(inbox.id, label)
    }
    return inbox.id
  }

  /** The inbox's messenger integration row; a sync can only run with one. */
  const createIntegration = async (inboxId: string, label: string) => {
    const database = drizzle({ client, relations, schema })
    await database.insert(schema.integrationMessengerModel).values({
      auth: {},
      conversationStarters: [],
      inboxId,
      name: label,
      pageId: `page-${label}-${Math.random()}`,
      persistentMenus: [],
      personas: [],
      workspaceId: fixture.workspaceId,
    })
  }

  const syncRow = async (inboxId: string) => {
    const result = await client.query(
      `SELECT * FROM "ChannelPostSync" WHERE "inboxId" = $1`,
      [inboxId],
    )
    return result.rows[0]
  }

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
    const database = drizzle({ client, relations, schema })
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await database
      .insert(schema.userModel)
      .values({ email: `post-sync-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await database
      .insert(schema.workspaceModel)
      .values({ name: `post-sync-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    fixture = { userId: user.id, workspaceId: workspace.id }
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

  describe("rows and requests", () => {
    test("creates a row per inbox once, idle and due now, and never resets an existing row", async () => {
      const inboxId = await createInbox("ensure")
      const now = new Date()

      await channelPostSyncRepository.ensureRows({
        inboxes: [{ channel: "messenger", id: inboxId }],
        now,
        workspaceId: fixture.workspaceId,
      })
      await client.query(
        `UPDATE "ChannelPostSync" SET status = 'failed' WHERE "inboxId" = $1`,
        [inboxId],
      )
      await channelPostSyncRepository.ensureRows({
        inboxes: [{ channel: "messenger", id: inboxId }],
        now: new Date(),
        workspaceId: fixture.workspaceId,
      })

      const rows = await client.query(
        `SELECT status FROM "ChannelPostSync" WHERE "inboxId" = $1`,
        [inboxId],
      )
      expect(rows.rows).toEqual([{ status: "failed" }])
    })

    test("a refresh takes an idle or failed row once, then the cooldown and the queue refuse it", async () => {
      const inboxId = await createInbox("request")
      const now = new Date()
      await channelPostSyncRepository.ensureRows({
        inboxes: [{ channel: "messenger", id: inboxId }],
        now,
        workspaceId: fixture.workspaceId,
      })
      const ask = (at: Date) =>
        channelPostSyncRepository.requestRefresh({
          cooldownMs: MINUTE,
          inboxId,
          now: at,
          queuedUntil: new Date(at.getTime() + 10 * MINUTE),
          workspaceId: fixture.workspaceId,
        })

      expect(await ask(now)).not.toBeNull()
      // Queued: refused whatever the time.
      expect(await ask(new Date(now.getTime() + 5 * MINUTE))).toBeNull()

      await client.query(
        `UPDATE "ChannelPostSync" SET status = 'failed' WHERE "inboxId" = $1`,
        [inboxId],
      )
      // Failed but inside the cooldown of the last request.
      expect(await ask(new Date(now.getTime() + 10_000))).toBeNull()
      // Failed and past the cooldown.
      expect(await ask(new Date(now.getTime() + 2 * MINUTE))).not.toBeNull()
    })

    test("a refresh keeps the listing position while the first listing is unfinished, and resets it after", async () => {
      const inboxId = await createInbox("keep-cursor")
      await channelPostSyncRepository.ensureRows({
        inboxes: [{ channel: "messenger", id: inboxId }],
        now: new Date(),
        workspaceId: fixture.workspaceId,
      })
      const ask = (at: Date) =>
        channelPostSyncRepository.requestRefresh({
          cooldownMs: 0,
          inboxId,
          now: at,
          queuedUntil: new Date(at.getTime() + 10 * MINUTE),
          workspaceId: fixture.workspaceId,
        })
      await client.query(
        `UPDATE "ChannelPostSync" SET "resumeCursor" = 'page-9' WHERE "inboxId" = $1`,
        [inboxId],
      )

      await ask(new Date())
      expect((await syncRow(inboxId)).resumeCursor).toBe("page-9")

      await client.query(
        `UPDATE "ChannelPostSync" SET status = 'idle', "backfillCompletedAt" = now() WHERE "inboxId" = $1`,
        [inboxId],
      )
      await ask(new Date())
      expect((await syncRow(inboxId)).resumeCursor).toBeNull()
    })

    test("a refresh of another workspace's inbox takes nothing", async () => {
      const inboxId = await createInbox("scope")
      await channelPostSyncRepository.ensureRows({
        inboxes: [{ channel: "messenger", id: inboxId }],
        now: new Date(),
        workspaceId: fixture.workspaceId,
      })

      const row = await channelPostSyncRepository.requestRefresh({
        cooldownMs: MINUTE,
        inboxId,
        now: new Date(),
        queuedUntil: new Date(),
        workspaceId: "1",
      })

      expect(row).toBeNull()
    })

    test("deleting the inbox deletes its sync row", async () => {
      const inboxId = await createInbox("cascade")
      await channelPostSyncRepository.ensureRows({
        inboxes: [{ channel: "messenger", id: inboxId }],
        now: new Date(),
        workspaceId: fixture.workspaceId,
      })

      await client.query(`DELETE FROM "Inbox" WHERE id = $1`, [inboxId])

      expect(await syncRow(inboxId)).toBeUndefined()
    })
  })

  describe("scanner", () => {
    const seed = async (
      label: string,
      overrides: {
        heartbeatAgoMs?: number
        nextAgoMs?: number
        status: string
      },
    ) => {
      const inboxId = await createInbox(label)
      await client.query(
        `INSERT INTO "ChannelPostSync" (id, "workspaceId", "inboxId", channel, status, "nextSyncAt", "lastHeartbeatAt", "claimToken")
         VALUES ((floor(random() * 9e15) + 1)::bigint, $1, $2, 'messenger', $3::"channelPostSyncStatus",
                 now() - ($4::int * interval '1 millisecond'), now() - ($5::int * interval '1 millisecond'), 'old-owner')`,
        [
          fixture.workspaceId,
          inboxId,
          overrides.status,
          overrides.nextAgoMs ?? 0,
          overrides.heartbeatAgoMs ?? 0,
        ],
      )
      return inboxId
    }
    const queueAll = async () => {
      const now = new Date()
      return await channelPostSyncRepository.queueDue({
        batchSize: 500,
        now,
        queuedUntil: new Date(now.getTime() + 10 * MINUTE),
        stalledBefore: new Date(now.getTime() - 10 * MINUTE),
      })
    }

    test("queues due waiting rows, lost queued rows and stalled running rows, and nothing else", async () => {
      const due = await seed("due", { nextAgoMs: MINUTE, status: "idle" })
      const future = await seed("future", {
        nextAgoMs: -MINUTE * 30,
        status: "idle",
      })
      const lost = await seed("lost", { nextAgoMs: MINUTE, status: "queued" })
      const stalled = await seed("stalled", {
        heartbeatAgoMs: 30 * MINUTE,
        status: "running",
      })
      const alive = await seed("alive", {
        heartbeatAgoMs: MINUTE,
        status: "running",
      })
      const failed = await seed("failed", {
        nextAgoMs: MINUTE,
        status: "failed",
      })

      const queued = (await queueAll()).map((row) => row.inboxId)

      for (const inboxId of [due, lost, stalled]) {
        expect(queued).toContain(inboxId)
      }
      for (const inboxId of [future, alive, failed]) {
        expect(queued).not.toContain(inboxId)
      }
      // A stalled owner loses its token, so it can no longer write.
      expect((await syncRow(stalled)).claimToken).toBeNull()
      expect((await syncRow(stalled)).status).toBe("queued")
    })

    test("never queues a row whose inbox is disconnected, and a claim of it finds nothing", async () => {
      const disconnected = await seed("disconnected", {
        nextAgoMs: MINUTE,
        status: "idle",
      })
      const queuedButDisconnected = await seed("queued-disconnected", {
        nextAgoMs: MINUTE,
        status: "queued",
      })
      const connected = await seed("still-connected", {
        nextAgoMs: MINUTE,
        status: "idle",
      })
      await client.query(
        `UPDATE "Inbox" SET status = 'disconnected' WHERE id = ANY($1::bigint[])`,
        [[disconnected, queuedButDisconnected]],
      )

      const queued = (await queueAll()).map((row) => row.inboxId)

      expect(queued).toContain(connected)
      expect(queued).not.toContain(disconnected)
      expect(queued).not.toContain(queuedButDisconnected)
      expect(
        await channelPostSyncRepository.claim({
          claimToken: "worker-a",
          inboxId: queuedButDisconnected,
          now: new Date(),
        }),
      ).toBeNull()
      // The rows are kept as they were.
      expect((await syncRow(disconnected)).status).toBe("idle")
    })

    test("two scanners never queue the same row", async () => {
      for (let index = 0; index < 6; index++) {
        await seed(`race-${index}`, { nextAgoMs: MINUTE, status: "idle" })
      }
      const now = new Date()
      const scan = () =>
        channelPostSyncRepository.queueDue({
          batchSize: 100,
          now,
          queuedUntil: new Date(now.getTime() + 10 * MINUTE),
          stalledBefore: new Date(now.getTime() - 10 * MINUTE),
        })

      const [first, second] = await Promise.all([scan(), scan()])

      const ids = [...first, ...second].map((row) => row.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe("eligibility: a connected inbox without its integration row", () => {
    const seedRow = async (
      inboxId: string,
      columns: {
        category?: string | null
        error?: string | null
        status: string
      },
    ) => {
      await client.query(
        `INSERT INTO "ChannelPostSync" (id, "workspaceId", "inboxId", channel, status, "nextSyncAt", "lastError", "lastErrorCategory", attempts)
         VALUES ((floor(random() * 9e15) + 1)::bigint, $1, $2, 'messenger', $3::"channelPostSyncStatus",
                 CASE WHEN $3 = 'failed' THEN NULL ELSE now() - interval '1 minute' END, $4, $5, 3)`,
        [
          fixture.workspaceId,
          inboxId,
          columns.status,
          columns.error ?? null,
          columns.category ?? null,
        ],
      )
    }

    test("is excluded from the request, the list, the queue and the claim", async () => {
      const inboxId = await createInbox("no-integration", {
        withIntegration: false,
      })
      await seedRow(inboxId, { status: "queued" })
      const now = new Date()

      const eligible = await channelPostSyncRepository.findEligibleInboxes({
        channels: ["messenger"],
        inboxIds: [inboxId],
        workspaceId: fixture.workspaceId,
      })
      const refresh = await channelPostSyncRepository.requestRefresh({
        cooldownMs: MINUTE,
        inboxId,
        now,
        queuedUntil: new Date(now.getTime() + MINUTE),
        workspaceId: fixture.workspaceId,
      })
      const listed = await channelPostSyncRepository.listForWorkspace({
        workspaceId: fixture.workspaceId,
      })
      const queued = await channelPostSyncRepository.queueDue({
        batchSize: 500,
        now,
        queuedUntil: new Date(now.getTime() + 10 * MINUTE),
        stalledBefore: new Date(now.getTime() - 10 * MINUTE),
      })
      const claim = await channelPostSyncRepository.claim({
        claimToken: "worker",
        inboxId,
        now,
      })

      expect(eligible.map((row) => [row.id, row.syncable])).toEqual([
        [inboxId, false],
      ])
      expect(refresh).toBeNull()
      expect(listed.map((row) => row.inboxId)).not.toContain(inboxId)
      expect(queued.map((row) => row.inboxId)).not.toContain(inboxId)
      expect(claim).toBeNull()
    })

    test("a connected inbox with its integration is syncable", async () => {
      const inboxId = await createInbox("with-integration")

      const [row] = await channelPostSyncRepository.findEligibleInboxes({
        channels: ["messenger"],
        inboxIds: [inboxId],
        workspaceId: fixture.workspaceId,
      })

      expect(row?.syncable).toBe(true)
    })

    test("parks a legacy failed row of such an inbox as notConnected, once", async () => {
      const inboxId = await createInbox("legacy-failed", {
        withIntegration: false,
      })
      await seedRow(inboxId, {
        category: "auth_failed",
        error: "Unable to find integration auth",
        status: "failed",
      })

      const first = await channelPostSyncRepository.parkIneligible({
        batchSize: 500,
        now: new Date(),
      })
      const second = await channelPostSyncRepository.parkIneligible({
        batchSize: 500,
        now: new Date(),
      })

      const row = await syncRow(inboxId)
      expect(row).toMatchObject({
        attempts: 0,
        lastError: null,
        lastErrorCategory: "notConnected",
        nextSyncAt: null,
        status: "idle",
      })
      expect(first).toBeGreaterThanOrEqual(1)
      expect(second).toBe(0)
    })

    test("leaves the row of a syncable inbox alone", async () => {
      const inboxId = await createInbox("syncable-failed")
      await seedRow(inboxId, {
        category: "auth_failed",
        error: "expired",
        status: "failed",
      })

      await channelPostSyncRepository.parkIneligible({
        batchSize: 500,
        now: new Date(),
      })

      expect(await syncRow(inboxId)).toMatchObject({
        lastErrorCategory: "auth_failed",
        status: "failed",
      })
    })
  })

  describe("parked rows", () => {
    const seedRow = async (
      inboxId: string,
      columns: {
        category?: string | null
        error?: string | null
        status: string
      },
    ) => {
      await client.query(
        `INSERT INTO "ChannelPostSync" (id, "workspaceId", "inboxId", channel, status, "nextSyncAt", "lastError", "lastErrorCategory", attempts)
         VALUES ((floor(random() * 9e15) + 1)::bigint, $1, $2, 'messenger', $3::"channelPostSyncStatus", NULL, $4, $5, 3)`,
        [
          fixture.workspaceId,
          inboxId,
          columns.status,
          columns.error ?? null,
          columns.category ?? null,
        ],
      )
    }

    test("releaseReconnectedParked frees a parked row of a syncable inbox only, never a failed one", async () => {
      const parked = await createInbox("reconnected-parked")
      const failed = await createInbox("reconnected-failed")
      await seedRow(parked, { category: "notConnected", status: "idle" })
      await seedRow(failed, {
        category: "auth_failed",
        error: "expired",
        status: "failed",
      })

      await channelPostSyncRepository.releaseReconnectedParked({
        batchSize: 500,
        now: new Date(),
      })

      expect(await syncRow(parked)).toMatchObject({
        lastErrorCategory: null,
        status: "idle",
      })
      expect(await syncRow(failed)).toMatchObject({
        lastErrorCategory: "auth_failed",
        status: "failed",
      })
    })

    test("releaseParkedForInbox frees a notConnected row and leaves a failed auth row alone", async () => {
      const parked = await createInbox("resume-parked")
      const failed = await createInbox("resume-failed")
      await seedRow(parked, { category: "notConnected", status: "idle" })
      await seedRow(failed, {
        category: "permission_denied",
        error: "no",
        status: "failed",
      })
      const now = new Date()

      await channelPostSyncRepository.releaseParkedForInbox({
        inboxId: parked,
        now,
        workspaceId: fixture.workspaceId,
      })
      await channelPostSyncRepository.releaseParkedForInbox({
        inboxId: failed,
        now,
        workspaceId: fixture.workspaceId,
      })

      expect((await syncRow(parked)).lastErrorCategory).toBeNull()
      expect(await syncRow(failed)).toMatchObject({
        lastErrorCategory: "permission_denied",
        status: "failed",
      })
    })

    test("the parked-row scan is served by the partial index, not a table scan", async () => {
      await client.query("BEGIN")
      try {
        await client.query("SET LOCAL enable_seqscan = off")
        const plan = await client.query<{ "QUERY PLAN": unknown }>(
          `EXPLAIN (FORMAT JSON) SELECT id FROM "ChannelPostSync"
           WHERE status = 'idle' AND "lastErrorCategory" = 'notConnected'
           ORDER BY id LIMIT 50`,
        )
        const text = JSON.stringify(plan.rows[0]?.["QUERY PLAN"])
        expect(text).toContain("ChannelPostSync_parked_notConnected_idx")
        expect(text).not.toContain('"Node Type":"Sort"')
      } finally {
        await client.query("ROLLBACK")
      }
    })
  })

  describe("auth recovery", () => {
    const seedFailed = async (inboxId: string, category: string) => {
      await client.query(
        `INSERT INTO "ChannelPostSync" (id, "workspaceId", "inboxId", channel, status, "lastError", "lastErrorCategory", attempts, "updatedAt")
         VALUES ((floor(random() * 9e15) + 1)::bigint, $1, $2, 'messenger', 'failed', 'boom', $3, 1, now() - interval '1 hour')`,
        [fixture.workspaceId, inboxId, category],
      )
    }
    const release = () =>
      channelPostSyncRepository.releaseRecoveredAuthFailures({
        batchSize: 500,
        now: new Date(),
      })

    test("an unchanged integration keeps a failed auth row failed", async () => {
      const inboxId = await createInbox("auth-unchanged")
      // The integration was last written before the failure.
      await client.query(
        `UPDATE "IntegrationMessenger" SET "updatedAt" = now() - interval '2 hours' WHERE "inboxId" = $1`,
        [inboxId],
      )
      await seedFailed(inboxId, "auth_failed")

      await release()

      expect((await syncRow(inboxId)).status).toBe("failed")
    })

    test("an integration updated after the failure makes the row due once", async () => {
      const inboxId = await createInbox("auth-changed")
      await seedFailed(inboxId, "permission_denied")
      await client.query(
        `UPDATE "IntegrationMessenger" SET "updatedAt" = now() WHERE "inboxId" = $1`,
        [inboxId],
      )

      const released = await release()
      const row = await syncRow(inboxId)

      expect(released).toBeGreaterThanOrEqual(1)
      expect(row).toMatchObject({
        attempts: 0,
        lastError: null,
        lastErrorCategory: null,
        status: "idle",
      })
      expect(row.nextSyncAt).not.toBeNull()
    })

    test("a transient failure is not released this way", async () => {
      const inboxId = await createInbox("auth-transient")
      await seedFailed(inboxId, "network_error")
      await client.query(
        `UPDATE "IntegrationMessenger" SET "updatedAt" = now() WHERE "inboxId" = $1`,
        [inboxId],
      )

      await release()

      expect((await syncRow(inboxId)).status).toBe("failed")
    })

    test("resetAfterAuthChange makes a failed or parked row due and clears it, and leaves a queued one", async () => {
      const failedInbox = await createInbox("reset-failed")
      await seedFailed(failedInbox, "auth_failed")
      const parkedInbox = await createInbox("reset-parked")
      await client.query(
        `INSERT INTO "ChannelPostSync" (id, "workspaceId", "inboxId", channel, status, "lastErrorCategory")
         VALUES ((floor(random() * 9e15) + 1)::bigint, $1, $2, 'messenger', 'idle', 'notConnected')`,
        [fixture.workspaceId, parkedInbox],
      )
      const queuedInbox = await createInbox("reset-queued")
      await client.query(
        `INSERT INTO "ChannelPostSync" (id, "workspaceId", "inboxId", channel, status)
         VALUES ((floor(random() * 9e15) + 1)::bigint, $1, $2, 'messenger', 'queued')`,
        [fixture.workspaceId, queuedInbox],
      )
      const reset = (inboxId: string, workspaceId = fixture.workspaceId) =>
        channelPostSyncRepository.resetAfterAuthChange({
          inboxId,
          now: new Date(),
          workspaceId,
        })

      expect(await reset(failedInbox, "1")).toBe(false)
      expect(await reset(failedInbox)).toBe(true)
      expect(await reset(parkedInbox)).toBe(true)
      expect(await reset(queuedInbox)).toBe(false)

      expect(await syncRow(failedInbox)).toMatchObject({
        attempts: 0,
        claimToken: null,
        lastError: null,
        lastErrorCategory: null,
        status: "idle",
      })
      expect((await syncRow(failedInbox)).nextSyncAt).not.toBeNull()
      expect((await syncRow(parkedInbox)).lastErrorCategory).toBeNull()
      expect((await syncRow(queuedInbox)).status).toBe("queued")
    })
  })

  describe("ownership", () => {
    const queuedRow = async (label: string) => {
      const inboxId = await createInbox(label)
      await channelPostSyncRepository.ensureRows({
        inboxes: [{ channel: "messenger", id: inboxId }],
        now: new Date(),
        workspaceId: fixture.workspaceId,
      })
      await client.query(
        `UPDATE "ChannelPostSync" SET status = 'queued' WHERE "inboxId" = $1`,
        [inboxId],
      )
      return inboxId
    }

    test("one worker claims a queued row; a second claim finds nothing", async () => {
      const inboxId = await queuedRow("claim")

      const first = await channelPostSyncRepository.claim({
        claimToken: "worker-a",
        inboxId,
        now: new Date(),
      })
      const second = await channelPostSyncRepository.claim({
        claimToken: "worker-b",
        inboxId,
        now: new Date(),
      })

      expect(first?.inboxId).toBe(inboxId)
      expect(second).toBeNull()
      expect((await syncRow(inboxId)).claimToken).toBe("worker-a")
    })

    test("two workers racing for one queued row: exactly one wins", async () => {
      const inboxId = await queuedRow("claim-race")

      const results = await Promise.all(
        ["a", "b", "c", "d"].map((token) =>
          channelPostSyncRepository.claim({
            claimToken: token,
            inboxId,
            now: new Date(),
          }),
        ),
      )

      expect(results.filter(Boolean)).toHaveLength(1)
    })

    test("a worker that was taken over cannot write any more, and its successor can", async () => {
      const inboxId = await queuedRow("takeover")
      const stale = await channelPostSyncRepository.claim({
        claimToken: "stale-worker",
        inboxId,
        now: new Date(),
      })
      await client.query(
        `UPDATE "ChannelPostSync" SET "lastHeartbeatAt" = now() - interval '30 minutes' WHERE "inboxId" = $1`,
        [inboxId],
      )
      const now = new Date()
      await channelPostSyncRepository.queueDue({
        batchSize: 500,
        now,
        queuedUntil: new Date(now.getTime() + 10 * MINUTE),
        stalledBefore: new Date(now.getTime() - 10 * MINUTE),
      })
      const successor = await channelPostSyncRepository.claim({
        claimToken: "successor",
        inboxId,
        now: new Date(),
      })

      const staleProgress = await channelPostSyncRepository.saveProgress({
        claimToken: "stale-worker",
        id: stale?.id ?? "",
        now: new Date(),
        resumeCursor: "stale-cursor",
        syncedCount: 999,
      })
      const staleFinish = await channelPostSyncRepository.release({
        claimToken: "stale-worker",
        id: stale?.id ?? "",
        markBackfillComplete: true,
        markSynced: true,
        now: new Date(),
        outcome: {
          attempts: 0,
          lastError: null,
          lastErrorCategory: null,
          nextSyncAt: new Date(),
          resumeCursor: null,
          syncedCount: 999,
        },
      })
      const staleFail = await channelPostSyncRepository.markFailed({
        claimToken: "stale-worker",
        id: stale?.id ?? "",
        lastError: "stale",
        lastErrorCategory: null,
        now: new Date(),
      })
      const successorProgress = await channelPostSyncRepository.saveProgress({
        claimToken: "successor",
        id: successor?.id ?? "",
        now: new Date(),
        resumeCursor: "fresh-cursor",
        syncedCount: 100,
      })

      expect([staleProgress, staleFinish, staleFail]).toEqual([
        false,
        false,
        false,
      ])
      expect(successorProgress).toBe(true)
      const row = await syncRow(inboxId)
      expect(row.resumeCursor).toBe("fresh-cursor")
      expect(row.syncedCount).toBe(100)
      expect(row.status).toBe("running")
      expect(row.claimToken).toBe("successor")
    })

    test("finishing a cycle frees the row, records the time and marks the history loaded", async () => {
      const inboxId = await queuedRow("complete")
      const claim = await channelPostSyncRepository.claim({
        claimToken: "w",
        inboxId,
        now: new Date(),
      })
      const next = new Date(Date.now() + 6 * 60 * MINUTE)

      const done = await channelPostSyncRepository.release({
        claimToken: "w",
        id: claim?.id ?? "",
        markBackfillComplete: true,
        markSynced: true,
        now: new Date(),
        outcome: {
          attempts: 0,
          lastError: null,
          lastErrorCategory: null,
          nextSyncAt: next,
          resumeCursor: null,
          syncedCount: 42,
        },
      })

      expect(done).toBe(true)
      const row = await syncRow(inboxId)
      expect(row.status).toBe("idle")
      expect(row.claimToken).toBeNull()
      expect(row.backfillCompletedAt).not.toBeNull()
      expect(row.lastSyncedAt).not.toBeNull()
      expect(row.syncedCount).toBe(42)
      expect(new Date(row.nextSyncAt).getTime()).toBe(next.getTime())
    })

    test("a failed sync stays failed with no next run until a person refreshes it", async () => {
      const inboxId = await queuedRow("fail")
      const claim = await channelPostSyncRepository.claim({
        claimToken: "w",
        inboxId,
        now: new Date(),
      })

      await channelPostSyncRepository.markFailed({
        claimToken: "w",
        id: claim?.id ?? "",
        lastError: "token expired",
        lastErrorCategory: "auth_failed",
        now: new Date(),
      })

      const now = new Date()
      const queued = await channelPostSyncRepository.queueDue({
        batchSize: 500,
        now: new Date(now.getTime() + 24 * 60 * MINUTE),
        queuedUntil: now,
        stalledBefore: now,
      })
      expect(queued.map((row) => row.inboxId)).not.toContain(inboxId)
      const row = await syncRow(inboxId)
      expect(row.status).toBe("failed")
      expect(row.nextSyncAt).toBeNull()
      expect(row.lastErrorCategory).toBe("auth_failed")
    })
  })

  describe("page upsert", () => {
    const listed = (
      externalPostId: string,
      overrides: Partial<ListedChannelPost> = {},
    ): ListedChannelPost => ({
      authorExternalId: null,
      authorName: null,
      caption: "Hello",
      commentsCount: 4,
      contentType: "photo",
      externalPostId,
      liveStatus: null,
      mediaType: "added_photos",
      permalink: `https://example.test/${externalPostId}`,
      publishedAt: new Date("2026-11-20T08:00:00.000Z"),
      reactionsCount: 10,
      sharesCount: 2,
      viewsCount: null,
      ...overrides,
    })
    const write = async (
      inboxId: string,
      posts: ListedChannelPost[],
      now = new Date(),
    ) =>
      await upsertListedChannelPosts({
        now,
        posts,
        target: {
          channel: "messenger",
          inboxId,
          integrationId: "5",
          sourceAccountId: "page-1",
          workspaceId: fixture.workspaceId,
        },
      })
    const postRow = async (externalPostId: string) =>
      (
        await client.query(
          // The counts are bigint, which node-postgres returns as strings: read them as numbers.
          `SELECT *, "commentsCount"::int AS "commentsCount", "reactionsCount"::int AS "reactionsCount", "sharesCount"::int AS "sharesCount", "engagementCount"::int AS "engagementCount", "viewsCount"::int AS "viewsCount" FROM "ChannelPost" WHERE "workspaceId" = $1 AND "channel" = 'messenger' AND "externalPostId" = $2`,
          [fixture.workspaceId, externalPostId],
        )
      ).rows[0]
    const unique = () => `ext-${Date.now()}-${Math.random()}`

    describe("a post we just published", () => {
      const known = {
        caption: "published text",
        contentType: "photo" as const,
        permalink: "https://example.test/published",
        publishedAt: new Date("2026-11-23T08:00:00.000Z"),
        thumbnail: "public/space/1/a.png",
      }
      const publish = async (inboxId: string, externalPostId: string) =>
        await channelPostRepository.upsertPublished({
          channel: "messenger",
          externalPostId,
          inboxId,
          integrationId: "5",
          known,
          sourceAccountId: "page-1",
          workspaceId: fixture.workspaceId,
        })

      test("a new row carries what the publish knows", async () => {
        const inboxId = await createInbox("published-new")
        const id = unique()

        await publish(inboxId, id)

        expect(await postRow(id)).toMatchObject({
          caption: "published text",
          contentType: "photo",
          metadataFetchedAt: null,
          permalink: "https://example.test/published",
          thumbnail: "public/space/1/a.png",
        })
      })

      test("an existing row keeps its synced values and only gaps are filled", async () => {
        const inboxId = await createInbox("published-existing")
        const id = unique()
        await write(inboxId, [
          listed(id, { caption: "synced", contentType: null, permalink: null }),
        ])

        const rowId = await publish(inboxId, id)

        expect(rowId).toBe((await postRow(id)).id)
        expect(await postRow(id)).toMatchObject({
          caption: "synced",
          contentType: "photo",
          permalink: "https://example.test/published",
        })
      })
    })

    test("inserts a new post with its counts, the engagement sum and the measure time", async () => {
      const inboxId = await createInbox("upsert-new")
      const id = unique()

      await write(inboxId, [listed(id)])

      const row = await postRow(id)
      expect(row).toMatchObject({
        caption: "Hello",
        commentsCount: 4,
        contentType: "photo",
        engagementCount: 16,
        inboxId,
        integrationId: "5",
        reactionsCount: 10,
        sharesCount: 2,
        sourceAccountId: "page-1",
        thumbnail: null,
      })
      expect(row.metricsFetchedAt).not.toBeNull()
      expect(row.metadataFetchedAt).not.toBeNull()
    })

    test("a count the listing leaves out starts at zero on a new post and is kept on an existing one", async () => {
      const inboxId = await createInbox("upsert-unknown")
      const fresh = unique()
      const known = unique()
      await write(inboxId, [listed(known)])

      await write(inboxId, [
        listed(fresh, {
          commentsCount: null,
          reactionsCount: null,
          sharesCount: null,
        }),
        listed(known, {
          commentsCount: null,
          reactionsCount: 11,
          sharesCount: null,
        }),
      ])

      expect(await postRow(fresh)).toMatchObject({
        commentsCount: 0,
        engagementCount: 0,
        reactionsCount: 0,
        sharesCount: 0,
      })
      expect(await postRow(known)).toMatchObject({
        commentsCount: 4,
        engagementCount: 17,
        reactionsCount: 11,
        sharesCount: 2,
      })
    })

    test("never touches what the sync does not own", async () => {
      const inboxId = await createInbox("upsert-owned")
      const id = unique()
      await write(inboxId, [listed(id)])
      await client.query(
        `UPDATE "ChannelPost" SET "hideComments" = true, "hidePhoneComments" = true, "skipComments" = true,
                "phoneCommentsCount" = 9, "thumbnail" = 'public/thumb.png'
         WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
        [fixture.workspaceId, id],
      )

      await write(inboxId, [
        listed(id, { caption: "Edited", commentsCount: 50 }),
      ])

      const row = await postRow(id)
      expect(row).toMatchObject({
        caption: "Edited",
        commentsCount: 50,
        hideComments: true,
        hidePhoneComments: true,
        phoneCommentsCount: 9,
        skipComments: true,
        thumbnail: "public/thumb.png",
      })
    })

    test("a post marked removed is shown again as soon as the listing contains it", async () => {
      const inboxId = await createInbox("upsert-heal")
      const id = unique()
      await write(inboxId, [listed(id)])
      await client.query(
        `UPDATE "ChannelPost" SET "removedAt" = now() WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
        [fixture.workspaceId, id],
      )

      await write(inboxId, [listed(id)])

      expect((await postRow(id)).removedAt).toBeNull()
    })

    test("does not rewrite a post whose reported values did not change", async () => {
      const inboxId = await createInbox("upsert-unchanged")
      const id = unique()
      await write(inboxId, [listed(id)])
      const before = await postRow(id)

      await write(inboxId, [listed(id)], new Date(Date.now() + 5000))

      const after = await postRow(id)
      expect(new Date(after.updatedAt).getTime()).toBe(
        new Date(before.updatedAt).getTime(),
      )
      expect(new Date(after.metricsFetchedAt).getTime()).toBe(
        new Date(before.metricsFetchedAt).getTime(),
      )
    })

    test("rewrites a post the comment path recorded and no sync has measured", async () => {
      const inboxId = await createInbox("upsert-bare")
      const id = unique()
      await client.query(
        `INSERT INTO "ChannelPost" (id, "workspaceId", "inboxId", channel, "integrationId", "sourceAccountId", "externalPostId")
         VALUES ((floor(random() * 9e15) + 1)::bigint, $1, $2, 'messenger', 5, 'page-1', $3)`,
        [fixture.workspaceId, inboxId, id],
      )

      await write(inboxId, [listed(id)])

      const row = await postRow(id)
      expect(row.metricsFetchedAt).not.toBeNull()
      expect(row).toMatchObject({ caption: "Hello", commentsCount: 4 })
    })

    test("handles quotes, unicode and a hostile caption as plain data", async () => {
      const inboxId = await createInbox("upsert-hostile")
      const id = unique()
      const caption = `'); DROP TABLE "ChannelPost"; -- Chào bạn 🎉 \\ " $1`

      await write(inboxId, [listed(id, { caption })])

      expect((await postRow(id)).caption).toBe(caption)
      expect(
        (await client.query(`SELECT 1 FROM "ChannelPost" LIMIT 1`)).rowCount,
      ).toBe(1)
    })

    test("a page repeating one post id writes it once", async () => {
      const inboxId = await createInbox("upsert-dup")
      const id = unique()

      await write(inboxId, [listed(id), listed(id, { caption: "Second" })])

      const rows = await client.query(
        `SELECT count(*)::int AS n FROM "ChannelPost" WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
        [fixture.workspaceId, id],
      )
      expect(rows.rows[0].n).toBe(1)
    })

    test("running the same page twice is safe", async () => {
      const inboxId = await createInbox("upsert-twice")
      const ids = [unique(), unique()]

      await Promise.all([
        write(
          inboxId,
          ids.map((id) => listed(id)),
        ),
        write(
          inboxId,
          ids.map((id) => listed(id)),
        ),
      ])

      const rows = await client.query(
        `SELECT count(*)::int AS n FROM "ChannelPost" WHERE "workspaceId" = $1 AND "externalPostId" = ANY($2)`,
        [fixture.workspaceId, ids],
      )
      expect(rows.rows[0].n).toBe(2)
    })

    test("a null content type, live status and publish date are stored as null", async () => {
      const inboxId = await createInbox("upsert-nulls")
      const id = unique()

      await write(inboxId, [
        listed(id, { contentType: null, liveStatus: null, publishedAt: null }),
      ])

      expect(await postRow(id)).toMatchObject({
        contentType: null,
        liveStatus: null,
        publishedAt: null,
      })
    })

    test("thumbnails are found only for posts without one and stored only once", async () => {
      const inboxId = await createInbox("thumbs")
      const [withoutThumb, withThumb] = [unique(), unique()]
      await write(inboxId, [listed(withoutThumb), listed(withThumb)])
      const withThumbRow = await postRow(withThumb)
      await saveListedPostThumbnail({
        id: withThumbRow.id,
        thumbnail: "public/first.png",
        workspaceId: fixture.workspaceId,
      })

      const missing = await findListedPostsWithoutThumbnail({
        channel: "messenger",
        externalPostIds: [withoutThumb, withThumb],
        workspaceId: fixture.workspaceId,
      })
      await saveListedPostThumbnail({
        id: withThumbRow.id,
        thumbnail: "public/second.png",
        workspaceId: fixture.workspaceId,
      })

      expect(missing.map((post) => post.externalPostId)).toEqual([withoutThumb])
      expect((await postRow(withThumb)).thumbnail).toBe("public/first.png")
    })
  })

  describe("a page and the fenced position in one transaction", () => {
    const page = (externalPostId: string, commentsCount: number) => ({
      authorExternalId: null,
      authorName: null,
      caption: "Fresh",
      commentsCount,
      contentType: "photo" as const,
      externalPostId,
      liveStatus: null,
      mediaType: "added_photos",
      permalink: null,
      publishedAt: new Date("2026-11-20T08:00:00.000Z"),
      reactionsCount: 1,
      sharesCount: 0,
      viewsCount: null,
    })
    const target = (inboxId: string) => ({
      channel: "messenger",
      inboxId,
      integrationId: "5",
      sourceAccountId: "page-1",
      workspaceId: fixture.workspaceId,
    })
    const postCount = async (externalPostId: string) =>
      (
        await client.query<{ commentsCount: number }>(
          `SELECT "commentsCount"::int AS "commentsCount" FROM "ChannelPost" WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
          [fixture.workspaceId, externalPostId],
        )
      ).rows

    /** What the service's `commitPage` does: the page, then the fenced write, in one transaction. */
    const commit = async (
      inboxId: string,
      claimToken: string,
      id: string,
      posts: ReturnType<typeof page>[],
    ): Promise<boolean> => {
      try {
        await db.transaction(async (tx) => {
          await upsertListedChannelPosts(
            { now: new Date(), posts, target: target(inboxId) },
            tx,
          )
          const kept = await channelPostSyncRepository.saveProgress(
            {
              claimToken,
              id,
              now: new Date(),
              resumeCursor: "c2",
              syncedCount: 1,
            },
            tx,
          )
          if (!kept) {
            throw new Error("claim lost")
          }
        })
        return true
      } catch (error) {
        if (error instanceof Error && error.message === "claim lost") {
          return false
        }
        throw error
      }
    }

    const takeOver = async (label: string) => {
      const inboxId = await createInbox(label)
      await channelPostSyncRepository.ensureRows({
        inboxes: [{ channel: "messenger", id: inboxId }],
        now: new Date(),
        workspaceId: fixture.workspaceId,
      })
      await client.query(
        `UPDATE "ChannelPostSync" SET status = 'queued' WHERE "inboxId" = $1`,
        [inboxId],
      )
      const stale = await channelPostSyncRepository.claim({
        claimToken: "stale-worker",
        inboxId,
        now: new Date(),
      })
      await client.query(
        `UPDATE "ChannelPostSync" SET "lastHeartbeatAt" = now() - interval '30 minutes' WHERE "inboxId" = $1`,
        [inboxId],
      )
      const now = new Date()
      await channelPostSyncRepository.queueDue({
        batchSize: 500,
        now,
        queuedUntil: new Date(now.getTime() + 10 * MINUTE),
        stalledBefore: new Date(now.getTime() - 10 * MINUTE),
      })
      const successor = await channelPostSyncRepository.claim({
        claimToken: "successor",
        inboxId,
        now: new Date(),
      })
      return { inboxId, stale, successor }
    }

    test("the owner's page and position are both written", async () => {
      const inboxId = await createInbox("commit-owner")
      await channelPostSyncRepository.ensureRows({
        inboxes: [{ channel: "messenger", id: inboxId }],
        now: new Date(),
        workspaceId: fixture.workspaceId,
      })
      await client.query(
        `UPDATE "ChannelPostSync" SET status = 'queued' WHERE "inboxId" = $1`,
        [inboxId],
      )
      const owner = await channelPostSyncRepository.claim({
        claimToken: "owner",
        inboxId,
        now: new Date(),
      })

      const kept = await commit(inboxId, "owner", owner?.id ?? "", [
        page("tx-owner-post", 7),
      ])

      expect(kept).toBe(true)
      expect(await postCount("tx-owner-post")).toEqual([{ commentsCount: 7 }])
      expect((await syncRow(inboxId)).resumeCursor).toBe("c2")
    })

    test("a worker that was taken over leaves no page behind, and its successor writes its own", async () => {
      const { inboxId, stale, successor } = await takeOver("commit-takeover")

      const staleKept = await commit(inboxId, "stale-worker", stale?.id ?? "", [
        page("tx-takeover-post", 1),
      ])
      const successorKept = await commit(
        inboxId,
        "successor",
        successor?.id ?? "",
        [page("tx-takeover-post", 99)],
      )

      expect(staleKept).toBe(false)
      expect(successorKept).toBe(true)
      // Only the successor's numbers exist: the stale page rolled back, and a
      // later stale page cannot overwrite them either.
      expect(await postCount("tx-takeover-post")).toEqual([
        { commentsCount: 99 },
      ])
      const lateStale = await commit(inboxId, "stale-worker", stale?.id ?? "", [
        page("tx-takeover-post", 2),
      ])
      expect(lateStale).toBe(false)
      expect(await postCount("tx-takeover-post")).toEqual([
        { commentsCount: 99 },
      ])
    })

    test("a stale worker's new posts are not created either", async () => {
      const { inboxId, stale } = await takeOver("commit-no-new")

      await commit(inboxId, "stale-worker", stale?.id ?? "", [
        page("tx-never-written", 5),
      ])

      expect(await postCount("tx-never-written")).toEqual([])
    })

    test("a failure inside the transaction rolls the page back too", async () => {
      const inboxId = await createInbox("commit-failure")
      await channelPostSyncRepository.ensureRows({
        inboxes: [{ channel: "messenger", id: inboxId }],
        now: new Date(),
        workspaceId: fixture.workspaceId,
      })

      await expect(
        db.transaction(async (tx) => {
          await upsertListedChannelPosts(
            {
              now: new Date(),
              posts: [page("tx-rolled-back", 3)],
              target: target(inboxId),
            },
            tx,
          )
          throw new Error("boom")
        }),
      ).rejects.toThrow("boom")

      expect(await postCount("tx-rolled-back")).toEqual([])
    })
  })

  describe("refresh target and removal", () => {
    test("finds a post for a refresh in its workspace only, and hides a removed one", async () => {
      const inboxId = await createInbox("refresh")
      const externalPostId = `ext-${Date.now()}-${Math.random()}`
      await upsertListedChannelPosts({
        now: new Date(),
        posts: [
          {
            authorExternalId: null,
            authorName: null,
            caption: null,
            commentsCount: 1,
            contentType: null,
            externalPostId,
            liveStatus: null,
            mediaType: null,
            permalink: null,
            publishedAt: null,
            reactionsCount: null,
            sharesCount: null,
            viewsCount: null,
          },
        ],
        target: {
          channel: "messenger",
          inboxId,
          integrationId: "5",
          sourceAccountId: "page-1",
          workspaceId: fixture.workspaceId,
        },
      })
      const row = (
        await client.query(
          `SELECT id::text FROM "ChannelPost" WHERE "workspaceId" = $1 AND "externalPostId" = $2`,
          [fixture.workspaceId, externalPostId],
        )
      ).rows[0]

      const target = await channelPostManagementRepository.findRefreshTarget({
        id: row.id,
        workspaceId: fixture.workspaceId,
      })
      const foreign = await channelPostManagementRepository.findRefreshTarget({
        id: row.id,
        workspaceId: "1",
      })
      await channelPostManagementRepository.markRemoved({
        id: row.id,
        now: new Date(),
        workspaceId: fixture.workspaceId,
      })
      const afterRemoval =
        await channelPostManagementRepository.findRefreshTarget({
          id: row.id,
          workspaceId: fixture.workspaceId,
        })
      const listed = await channelPostManagementRepository.list({
        filters: { hasComments: false },
        limit: 500,
        sort: "newest",
        workspaceId: fixture.workspaceId,
      })

      expect(target).toMatchObject({
        channel: "messenger",
        externalPostId,
        inboxId,
        integrationId: "5",
        sourceAccountId: "page-1",
      })
      expect(foreign).toBeNull()
      expect(afterRemoval).toBeNull()
      expect(listed.map((post) => post.id)).not.toContain(row.id)
    })
  })
})
