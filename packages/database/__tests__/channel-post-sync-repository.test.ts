import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { channelPostSyncRepository } from "../src/repositories/channel-post-sync/repository"

const dialect = new PgDialect()
const NOW = new Date("2026-11-22T10:00:00.000Z")

/** A drizzle update chain that records `set` and `where` and resolves `rows`. */
const updateTx = (rows: unknown[]) => {
  const returning = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where })
  const update = vi.fn().mockReturnValue({ set })
  return { set, tx: { update } as unknown as DatabaseClient, update, where }
}

const render = (where: ReturnType<typeof vi.fn>) =>
  dialect.sqlToQuery(where.mock.calls[0][0])

describe("owner-fenced writes", () => {
  const owner = { claimToken: "token-1", id: "7" }

  test.each([
    [
      "saveProgress",
      (tx: DatabaseClient) =>
        channelPostSyncRepository.saveProgress(
          { ...owner, now: NOW, resumeCursor: "c", syncedCount: 3 },
          tx,
        ),
    ],
    [
      "release",
      (tx: DatabaseClient) =>
        channelPostSyncRepository.release(
          {
            ...owner,
            markBackfillComplete: true,
            markSynced: true,
            now: NOW,
            outcome: {
              attempts: 0,
              lastError: null,
              lastErrorCategory: null,
              nextSyncAt: NOW,
              resumeCursor: null,
              syncedCount: 3,
            },
          },
          tx,
        ),
    ],
    [
      "markFailed",
      (tx: DatabaseClient) =>
        channelPostSyncRepository.markFailed(
          {
            ...owner,
            lastError: "boom",
            lastErrorCategory: "auth_failed",
            now: NOW,
          },
          tx,
        ),
    ],
  ])("%s only writes a row this worker still owns", async (_name, run) => {
    const { tx, where } = updateTx([{ id: "7" }])

    await expect(run(tx)).resolves.toBe(true)

    const condition = render(where)
    expect(condition.sql).toContain('"ChannelPostSync"."id" = $1')
    expect(condition.sql).toContain('"ChannelPostSync"."claimToken" = $2')
    expect(condition.sql).toContain('"ChannelPostSync"."status" = $3')
    expect(condition.params).toEqual(["7", "token-1", "running"])
  })

  test.each([
    [
      "saveProgress",
      (tx: DatabaseClient) =>
        channelPostSyncRepository.saveProgress(
          { ...owner, now: NOW, resumeCursor: null, syncedCount: 0 },
          tx,
        ),
    ],
    [
      "markFailed",
      (tx: DatabaseClient) =>
        channelPostSyncRepository.markFailed(
          { ...owner, lastError: "x", lastErrorCategory: null, now: NOW },
          tx,
        ),
    ],
  ])("%s answers false when the worker was taken over", async (_name, run) => {
    const { tx } = updateTx([])

    await expect(run(tx)).resolves.toBe(false)
  })

  test("release hands the row back with no owner and keeps backfill state unless told", async () => {
    const { set, tx } = updateTx([{ id: "7" }])

    await channelPostSyncRepository.release(
      {
        ...owner,
        markBackfillComplete: false,
        markSynced: false,
        now: NOW,
        outcome: {
          attempts: 2,
          lastError: "rate limited",
          lastErrorCategory: "rate_limited",
          nextSyncAt: NOW,
          resumeCursor: "cursor",
          syncedCount: 40,
        },
      },
      tx,
    )

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 2,
        claimToken: null,
        lastError: "rate limited",
        lastHeartbeatAt: null,
        resumeCursor: "cursor",
        status: "idle",
        syncedCount: 40,
      }),
    )
  })

  test("markFailed stops the row until a person acts: no next run, no owner", async () => {
    const { set, tx } = updateTx([{ id: "7" }])

    await channelPostSyncRepository.markFailed(
      {
        ...owner,
        lastError: "denied",
        lastErrorCategory: "permission_denied",
        now: NOW,
      },
      tx,
    )

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: null,
        lastErrorCategory: "permission_denied",
        nextSyncAt: null,
        status: "failed",
      }),
    )
  })
})

describe("claim", () => {
  test("takes only a queued row and records the token and a first heartbeat", async () => {
    const row = { id: "7", inboxId: "3" }
    const { set, tx, where } = updateTx([row])

    const claimed = await channelPostSyncRepository.claim(
      { claimToken: "t", inboxId: "3", now: NOW },
      tx,
    )

    expect(claimed).toBe(row)
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: "t",
        lastHeartbeatAt: NOW,
        status: "running",
      }),
    )
    const condition = render(where)
    expect(condition.sql).toContain('"ChannelPostSync"."status" = $2')
    expect(condition.params.slice(0, 3)).toEqual(["3", "queued", "connected"])
    expect(condition.sql).toContain(
      'EXISTS (SELECT 1 FROM "Inbox" AS "eligibleInbox"',
    )
  })

  test("answers null when the row is not queued any more", async () => {
    const { tx } = updateTx([])

    await expect(
      channelPostSyncRepository.claim(
        { claimToken: "t", inboxId: "3", now: NOW },
        tx,
      ),
    ).resolves.toBeNull()
  })
})

describe("requestRefresh", () => {
  test("takes a waiting row only outside the cooldown, and resets the failure state", async () => {
    const { set, tx, where } = updateTx([{ id: "7", inboxId: "3" }])
    const queuedUntil = new Date(NOW.getTime() + 600_000)

    await channelPostSyncRepository.requestRefresh(
      {
        cooldownMs: 60_000,
        inboxId: "3",
        now: NOW,
        queuedUntil,
        workspaceId: "ws-1",
      },
      tx,
    )

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 0,
        lastError: null,
        lastRequestedAt: NOW,
        nextSyncAt: queuedUntil,
        status: "queued",
      }),
    )
    // The listing position survives while the first listing is unfinished.
    const resume = dialect.sqlToQuery(set.mock.calls[0][0].resumeCursor)
    expect(resume.sql).toContain(
      'CASE WHEN "ChannelPostSync"."backfillCompletedAt" IS NULL THEN "ChannelPostSync"."resumeCursor" END',
    )
    const condition = render(where)
    expect(condition.sql).toContain('"ChannelPostSync"."workspaceId" = $2')
    expect(condition.sql).toContain('"ChannelPostSync"."status" in ($3, $4)')
    expect(condition.sql).toContain('"lastRequestedAt" is null')
    expect(condition.params.slice(0, 4)).toEqual([
      "3",
      "ws-1",
      "idle",
      "failed",
    ])
    expect(condition.params.at(-1)).toBe(
      new Date(NOW.getTime() - 60_000).toISOString(),
    )
    // Only a syncable inbox (connected, with its integration row) is refreshed.
    expect(condition.sql).toContain('"IntegrationMessenger"')
    expect(condition.params).toContain("connected")
  })

  test("a queued, running or just-refreshed inbox answers null", async () => {
    const { tx } = updateTx([])

    await expect(
      channelPostSyncRepository.requestRefresh(
        {
          cooldownMs: 60_000,
          inboxId: "3",
          now: NOW,
          queuedUntil: NOW,
          workspaceId: "ws-1",
        },
        tx,
      ),
    ).resolves.toBeNull()
  })
})

describe("resetAfterAuthChange", () => {
  test("clears a failed or parked row of the inbox and makes it due now", async () => {
    const { set, tx, where } = updateTx([{ id: "7" }])

    await expect(
      channelPostSyncRepository.resetAfterAuthChange(
        { inboxId: "3", now: NOW, workspaceId: "ws-1" },
        tx,
      ),
    ).resolves.toBe(true)

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 0,
        claimToken: null,
        lastError: null,
        lastErrorCategory: null,
        nextSyncAt: NOW,
        status: "idle",
      }),
    )
    const condition = render(where)
    expect(condition.sql).toContain('"ChannelPostSync"."inboxId" = $1')
    expect(condition.sql).toContain('"ChannelPostSync"."workspaceId" = $2')
    expect(condition.params).toEqual(
      expect.arrayContaining(["3", "ws-1", "failed", "idle", "notConnected"]),
    )
  })

  test("answers false when there is nothing to reset", async () => {
    const { tx } = updateTx([])

    await expect(
      channelPostSyncRepository.resetAfterAuthChange(
        { inboxId: "3", now: NOW, workspaceId: "ws-1" },
        tx,
      ),
    ).resolves.toBe(false)
  })
})

describe("ensureRows", () => {
  test("creates missing rows idle and due now, and leaves existing rows alone", async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
    const values = vi.fn().mockReturnValue({ onConflictDoNothing })
    const insert = vi.fn().mockReturnValue({ values })

    await channelPostSyncRepository.ensureRows(
      {
        inboxes: [{ channel: "messenger", id: "3" }],
        now: NOW,
        workspaceId: "ws-1",
      },
      { insert } as unknown as DatabaseClient,
    )

    expect(values).toHaveBeenCalledWith([
      {
        channel: "messenger",
        inboxId: "3",
        nextSyncAt: NOW,
        status: "idle",
        workspaceId: "ws-1",
      },
    ])
    expect(onConflictDoNothing).toHaveBeenCalled()
  })

  test("does nothing without inboxes", async () => {
    const insert = vi.fn()

    await channelPostSyncRepository.ensureRows(
      { inboxes: [], now: NOW, workspaceId: "ws-1" },
      { insert } as unknown as DatabaseClient,
    )

    expect(insert).not.toHaveBeenCalled()
  })
})

describe("queueDue", () => {
  const buildTx = (due: unknown[], queued: unknown[]) => {
    const forUpdate = vi.fn().mockResolvedValue(due)
    const limit = vi.fn().mockReturnValue({ for: forUpdate })
    const orderBy = vi.fn().mockReturnValue({ limit })
    const selectWhere = vi.fn().mockReturnValue({ orderBy })
    const from = vi.fn().mockReturnValue({ where: selectWhere })
    const select = vi.fn().mockReturnValue({ from })
    const update = updateTx(queued)
    const client = { select, update: update.update }
    const tx = {
      transaction: async (run: (c: typeof client) => Promise<unknown>) =>
        await run(client),
    } as unknown as DatabaseClient
    return { forUpdate, limit, selectWhere, tx, update }
  }

  test("locks the due rows with SKIP LOCKED, bounded, and queues them with no owner", async () => {
    const { forUpdate, limit, selectWhere, tx, update } = buildTx(
      [{ id: "1" }, { id: "2" }],
      [{ id: "1", inboxId: "3", workspaceId: "ws-1" }],
    )
    const queuedUntil = new Date(NOW.getTime() + 600_000)

    const queued = await channelPostSyncRepository.queueDue(
      {
        batchSize: 50,
        now: NOW,
        queuedUntil,
        stalledBefore: new Date(NOW.getTime() - 600_000),
      },
      tx,
    )

    expect(limit).toHaveBeenCalledWith(50)
    expect(forUpdate).toHaveBeenCalledWith("update", { skipLocked: true })
    const due = dialect.sqlToQuery(selectWhere.mock.calls[0][0])
    expect(due.sql).toContain('"ChannelPostSync"."status" in ($1, $2)')
    expect(due.sql).toContain('"ChannelPostSync"."nextSyncAt" <= $3')
    expect(due.sql).toContain('"ChannelPostSync"."lastHeartbeatAt" < $5')
    // Only a syncable inbox is queued: connected, in the row's workspace, with
    // the integration row of its channel (each EXISTS scoped by workspace too).
    expect(due.sql).toContain(
      'EXISTS (SELECT 1 FROM "Inbox" AS "eligibleInbox"',
    )
    expect(due.sql).toContain(
      '"eligibleInbox"."workspaceId" = "ChannelPostSync"."workspaceId"',
    )
    expect(due.params).toContain("connected")
    for (const table of [
      "IntegrationMessenger",
      "IntegrationInstagram",
      "IntegrationThreads",
      "IntegrationTiktok",
    ]) {
      expect(due.sql).toContain(`FROM "${table}"`)
      expect(due.sql).toContain(
        `"${table}"."workspaceId" = "ChannelPostSync"."workspaceId"`,
      )
    }
    expect(due.params).toEqual(
      expect.arrayContaining(["messenger", "instagram", "threads", "tiktok"]),
    )
    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: null,
        nextSyncAt: queuedUntil,
        status: "queued",
      }),
    )
    expect(queued).toEqual([{ id: "1", inboxId: "3", workspaceId: "ws-1" }])
  })

  test("queues nothing when nothing is due", async () => {
    const { tx, update } = buildTx([], [])

    const queued = await channelPostSyncRepository.queueDue(
      { batchSize: 50, now: NOW, queuedUntil: NOW, stalledBefore: NOW },
      tx,
    )

    expect(queued).toEqual([])
    expect(update.update).not.toHaveBeenCalled()
  })
})

describe("findEligibleInboxes", () => {
  test("correlates the eligibility subquery through an aliased inner inbox table", async () => {
    const orderBy = vi.fn().mockResolvedValue([])
    const where = vi.fn().mockReturnValue({ orderBy })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    const tx = { select } as unknown as DatabaseClient

    await channelPostSyncRepository.findEligibleInboxes(
      { channels: ["messenger"], workspaceId: "ws-1" },
      tx,
    )

    const fields = select.mock.calls[0][0] as { syncable: unknown }
    const { sql: text } = dialect.sqlToQuery(fields.syncable as never)
    // The inner table is aliased, so its columns are compared with the OUTER
    // inbox's columns instead of with themselves.
    expect(text).toContain('FROM "Inbox" AS "eligibleInbox"')
    expect(text).toContain('"eligibleInbox"."id" = "Inbox"."id"')
    expect(text).toContain(
      '"eligibleInbox"."workspaceId" = "Inbox"."workspaceId"',
    )
    expect(text).toContain('"eligibleInbox"."status" =')
    expect(text).not.toContain('FROM "Inbox" WHERE')
  })
})
