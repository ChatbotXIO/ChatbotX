// @vitest-environment node

/**
 * `aiHandoverBulkRunRepository` against a real Postgres. The unit test mocks
 * the query chain, so what only the database can prove lives here: the
 * `CASE` expressions that write the status enum (a bare string literal there is
 * `text` and Postgres refuses it), the one-live-run partial unique index, the
 * claim / lease / cancel transitions and the sweeper query.
 *
 * Every test runs in a transaction that is always rolled back, on an existing
 * Page (the tables have foreign keys to its inbox and workspace), so nothing
 * is left behind.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database, or when it has
 * no workspace yet; run it with `pnpm --filter @chatbotx.io/database test:db`.
 */

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { aiHandoverBulkRunRepository as repository } from "../../src/repositories/ai-handover-bulk-run/repository"
import { aiHandoverSettingsRepository as settingsRepository } from "../../src/repositories/ai-handover-settings/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

/** Thrown at the end of a fixture transaction so it never commits. */
class RollbackSignal extends Error {}

describe.skipIf(!databaseUrl)("aiHandoverBulkRunRepository on Postgres", () => {
  let client: Client
  let db: ReturnType<typeof drizzle<typeof schema, typeof relations>>
  let page: { workspaceId: string; inboxId: string } | null = null

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl ?? undefined })
    await client.connect()
    db = drizzle({ client, schema, relations })
    const [inbox] = (
      await client.query<{ id: string; workspaceId: string }>(
        `SELECT id, "workspaceId" FROM "Inbox" WHERE status = 'connected' LIMIT 1`,
      )
    ).rows
    page = inbox ? { workspaceId: inbox.workspaceId, inboxId: inbox.id } : null
  })

  afterAll(async () => {
    await client.end()
  })

  const inRolledBackTransaction = async (
    fn: (
      tx: DatabaseClient,
      ref: { workspaceId: string; inboxId: string },
    ) => Promise<void>,
  ) => {
    if (!page) {
      return
    }
    const ref = page
    try {
      await db.transaction(async (tx) => {
        await fn(tx as unknown as DatabaseClient, ref)
        throw new RollbackSignal()
      })
    } catch (error) {
      if (!(error instanceof RollbackSignal)) {
        throw error
      }
    }
  }

  const create = (
    tx: DatabaseClient,
    ref: { workspaceId: string; inboxId: string },
    revision: number,
    action: "enable" | "disable" = "disable",
  ) =>
    repository.createForRevision(
      {
        ...ref,
        channel: "messenger",
        revision,
        action,
        message: action === "disable" ? "hello" : null,
        requestedByUserId: null,
        requestedAt: new Date(),
      },
      tx,
    )

  const expireHeartbeat = (tx: DatabaseClient, runId: string) =>
    tx.execute(sql`
      UPDATE "AIHandoverBulkRun"
      SET "lastHeartbeatAt" = NOW() - INTERVAL '20 minutes'
      WHERE id = ${runId}`)

  test("a Page has one live run, and one run per revision", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      const first = await create(tx, ref, 1)
      expect(first?.status).toBe("pending")
      // A live run holds the Page.
      expect(await create(tx, ref, 2, "enable")).toBeNull()

      await tx.execute(
        sql`UPDATE "AIHandoverBulkRun" SET status = 'completed' WHERE id = ${first?.id}`,
      )

      // The slot is free again, but a revision never runs twice.
      expect(await create(tx, ref, 1, "enable")).toBeNull()
      expect(await create(tx, ref, 2, "enable")).not.toBeNull()
    })
  })

  test("the settings row is created on demand, locked, and its revision counts real changes", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      // Nothing exists until a real change needs a row.
      expect(await settingsRepository.lockExisting(ref, tx)).toBeNull()
      const { settings: locked, inboxStatus } =
        await settingsRepository.lockForApplyToAll(
          { ...ref, channel: "messenger" },
          tx,
        )
      expect(inboxStatus).toEqual(expect.any(String))
      expect(locked).toMatchObject({
        applyToAllCustomers: false,
        applyToAllRevision: 0,
        enabled: false,
      })

      const first = await settingsRepository.setApplyToAll(
        {
          ...ref,
          applyToAllCustomers: true,
          applyToAllMessage: null,
          requestedByUserId: null,
        },
        tx,
      )
      const second = await settingsRepository.setApplyToAll(
        {
          ...ref,
          applyToAllCustomers: false,
          applyToAllMessage: "bye",
          requestedByUserId: null,
        },
        tx,
      )
      expect([first.applyToAllRevision, second.applyToAllRevision]).toEqual([
        1, 2,
      ])
      expect(second).toMatchObject({
        applyToAllCustomers: false,
        applyToAllMessage: "bye",
      })
      // Locking again finds the row, it does not create a second one.
      expect(
        (
          await settingsRepository.lockForApplyToAll(
            { ...ref, channel: "messenger" },
            tx,
          )
        ).settings.id,
      ).toBe(locked.id)
    })
  })

  test("the sweeper lists only Pages a run is DUE for", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      const awaiting = async () =>
        (await repository.listInboxesAwaitingRun({ limit: 1000 }, tx)).some(
          (candidate) => candidate.inboxId === ref.inboxId,
        )
      await settingsRepository.lockForApplyToAll(
        { ...ref, channel: "messenger" },
        tx,
      )

      // A change that has no run yet: due.
      await settingsRepository.setApplyToAll(
        {
          ...ref,
          applyToAllCustomers: false,
          applyToAllMessage: "bye",
          requestedByUserId: null,
        },
        tx,
      )
      expect(await awaiting()).toBe(true)

      // An ON waits for a switched-on automation: not due while it is off.
      await settingsRepository.setApplyToAll(
        {
          ...ref,
          applyToAllCustomers: true,
          applyToAllMessage: null,
          requestedByUserId: null,
        },
        tx,
      )
      expect(await awaiting()).toBe(false)
      await tx.execute(
        sql`UPDATE "AIHandoverSettings" SET enabled = true WHERE "inboxId" = ${ref.inboxId}`,
      )
      expect(await awaiting()).toBe(true)

      // Resuming after this Page's id skips it (the sweeper's rotation).
      expect(
        (
          await repository.listInboxesAwaitingRun(
            { limit: 1000, afterInboxId: ref.inboxId },
            tx,
          )
        ).some((candidate) => candidate.inboxId === ref.inboxId),
      ).toBe(false)

      // A disconnected Page waits.
      await tx.execute(
        sql`UPDATE "Inbox" SET status = 'disconnected' WHERE id = ${ref.inboxId}`,
      )
      expect(await awaiting()).toBe(false)
      await tx.execute(
        sql`UPDATE "Inbox" SET status = 'connected' WHERE id = ${ref.inboxId}`,
      )

      // A live run still holds the Page, and a revision that ran is not due.
      const run = await create(tx, ref, 2, "enable")
      expect(await awaiting()).toBe(false)
      await tx.execute(
        sql`UPDATE "AIHandoverBulkRun" SET status = 'failed' WHERE id = ${run?.id}`,
      )
      expect(await awaiting()).toBe(false)
    })
  })

  test("a disconnect cancelling under the settings lock waits for a run being created, and then sees it", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      await settingsRepository.lockForApplyToAll(
        { ...ref, channel: "messenger" },
        tx,
      )
      const run = await create(tx, ref, 1)

      // The lock is re-entrant inside one transaction; the run it created is
      // visible to the cancel that follows it.
      expect(await settingsRepository.lockExisting(ref, tx)).not.toBeNull()
      expect((await repository.cancelLive(ref, tx))?.id).toBe(run?.id)
    })
  })

  test("claim, progress, yield and cancel move the run through the enum states", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      const run = await create(tx, ref, 1)
      if (!run) {
        throw new Error("run not created")
      }
      const target = { runId: run.id, workspaceId: ref.workspaceId }

      const claimed = await repository.claim(target, tx)
      expect(claimed?.status).toBe("running")
      const guard = { claimToken: claimed?.claimToken ?? "" }
      // Another workspace's job cannot take it.
      expect(
        await repository.claim({ ...target, workspaceId: "0" }, tx),
      ).toBeNull()
      // A second worker cannot claim a run whose lease is held and fresh.
      expect(await repository.claim(target, tx)).toBeNull()

      expect(
        await repository.recordProgress(
          {
            runId: run.id,
            expect: guard,
            progress: { addProcessed: 3, cursorContactInboxId: "ci-1" },
          },
          tx,
        ),
      ).toBe("running")
      expect(
        await repository.recordProgress(
          { runId: run.id, expect: { claimToken: "stale" }, progress: {} },
          tx,
        ),
      ).toBeNull()

      expect(
        await repository.yieldForContinuation(
          { runId: run.id, expect: guard },
          tx,
        ),
      ).toBe(1)
      // Released: the next chunk can claim it again.
      expect((await repository.claim(target, tx))?.status).toBe("running")
    })
  })

  test("a run parked for a quota pause cannot be claimed or re-dispatched until the pause ends", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      const run = await create(tx, ref, 1)
      const target = { runId: run?.id ?? "", workspaceId: ref.workspaceId }
      const claimed = await repository.claim(target, tx)
      await repository.yieldForContinuation(
        {
          runId: target.runId,
          expect: { claimToken: claimed?.claimToken ?? "" },
          pausedUntil: new Date(Date.now() + 60 * 60 * 1000),
        },
        tx,
      )
      await tx.execute(sql`
        UPDATE "AIHandoverBulkRun"
        SET "lastHeartbeatAt" = NOW() - INTERVAL '5 minutes', attempts = 0
        WHERE id = ${target.runId}`)

      expect(await repository.claim(target, tx)).toBeNull()
      expect(await repository.reopenReleased({ runId: target.runId }, tx)).toBe(
        0,
      )
      const picked = await repository.pickDue(
        { maxAttempts: 5, batchSize: 50 },
        tx,
      )
      expect(picked.some((candidate) => candidate.id === target.runId)).toBe(
        false,
      )

      // Time passes.
      await tx.execute(sql`
        UPDATE "AIHandoverBulkRun" SET "pausedUntil" = NOW() - INTERVAL '1 second'
        WHERE id = ${target.runId}`)
      expect((await repository.claim(target, tx))?.status).toBe("running")
    })
  })

  test("quota pauses in a row never fail a run: each one resets the retry budget even though nothing settles", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      const run = await create(tx, ref, 1)
      const target = { runId: run?.id ?? "", workspaceId: ref.workspaceId }

      for (let pause = 0; pause < 6; pause++) {
        const claimed = await repository.claim(target, tx)
        await repository.yieldForContinuation(
          {
            runId: target.runId,
            expect: { claimToken: claimed?.claimToken ?? "" },
            pausedUntil: new Date(Date.now() + 60 * 60 * 1000),
          },
          tx,
        )
        // The pause ends and the sweeper has to re-dispatch (the delayed job
        // was lost): that burns an attempt, the next pause gives it back.
        await tx.execute(sql`
          UPDATE "AIHandoverBulkRun"
          SET "pausedUntil" = NOW() - INTERVAL '1 second',
              "lastHeartbeatAt" = NOW() - INTERVAL '5 minutes'
          WHERE id = ${target.runId}`)
        await repository.pickDue({ maxAttempts: 5, batchSize: 50 }, tx)
        await repository.markMaxAttemptsFailed({ maxAttempts: 5 }, tx)
      }

      const after = await repository.findByRevision({ ...ref, revision: 1 }, tx)
      expect(after?.status).not.toBe("failed")
    })
  })

  test("a pending or released run is cancelled outright, a claimed one winds down, and a cancel ends a pause", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      const pending = await create(tx, ref, 1)
      const cancelledPending = await repository.cancelLive(ref, tx)
      expect(cancelledPending?.id).toBe(pending?.id)
      expect(cancelledPending?.status).toBe("cancelled")
      expect(cancelledPending?.finishedAt).not.toBeNull()

      const claimedRun = await create(tx, ref, 2)
      const target = {
        runId: claimedRun?.id ?? "",
        workspaceId: ref.workspaceId,
      }
      await repository.claim(target, tx)
      expect((await repository.cancelLive(ref, tx))?.status).toBe("cancelling")
      // The cancelling run still holds the Page: nothing new can start.
      expect(await create(tx, ref, 3, "enable")).toBeNull()

      // A cancelling run is claimable (to wind it down) even though it is "paused".
      await tx.execute(sql`
        UPDATE "AIHandoverBulkRun"
        SET "claimToken" = NULL, "pausedUntil" = NOW() + INTERVAL '1 hour'
        WHERE id = ${target.runId}`)
      expect((await repository.claim(target, tx))?.status).toBe("cancelling")
    })
  })

  test("cancelLive limited to an action leaves a live run of the other action alone", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      const run = await create(tx, ref, 1, "disable")

      expect(
        await repository.cancelLive({ ...ref, action: "enable" }, tx),
      ).toBeNull()
      expect(
        (await repository.cancelLive({ ...ref, action: "disable" }, tx))?.id,
      ).toBe(run?.id)
    })
  })

  test("refundDispatch undoes pickDue for the picked values only, so the next sweep sees the same queued job", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      const run = await create(tx, ref, 1)
      const runId = run?.id ?? ""
      await tx.execute(
        sql`UPDATE "AIHandoverBulkRun" SET attempts = 2, "chunkSeq" = 5 WHERE id = ${runId}`,
      )
      const read = async () =>
        (
          await tx.execute<{ attempts: number; chunkSeq: number }>(
            sql`SELECT attempts, "chunkSeq" FROM "AIHandoverBulkRun" WHERE id = ${runId}`,
          )
        ).rows[0]

      // The run moved on since it was picked: left alone.
      expect(
        await repository.refundDispatch(
          { runId, attempts: 3, chunkSeq: 5 },
          tx,
        ),
      ).toBe(false)
      expect(await read()).toEqual({ attempts: 2, chunkSeq: 5 })

      expect(
        await repository.refundDispatch(
          { runId, attempts: 2, chunkSeq: 5 },
          tx,
        ),
      ).toBe(true)
      expect(await read()).toEqual({ attempts: 1, chunkSeq: 4 })
    })
  })

  test("refundDispatch never takes a counter below zero", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      const run = await create(tx, ref, 1)

      expect(
        await repository.refundDispatch(
          { runId: run?.id ?? "", attempts: 0, chunkSeq: 0 },
          tx,
        ),
      ).toBe(false)
    })
  })

  test("a released parked run is cancelled at once: there is no worker to wind it down", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      const run = await create(tx, ref, 1)
      const target = { runId: run?.id ?? "", workspaceId: ref.workspaceId }
      const claimed = await repository.claim(target, tx)
      await repository.yieldForContinuation(
        {
          runId: target.runId,
          expect: { claimToken: claimed?.claimToken ?? "" },
          pausedUntil: new Date(Date.now() + 60 * 60 * 1000),
        },
        tx,
      )

      const cancelled = await repository.cancelLive(ref, tx)

      expect(cancelled?.status).toBe("cancelled")
      expect(cancelled?.pausedUntil).toBeNull()
      // The Page is free for the next revision immediately.
      expect(await create(tx, ref, 2, "enable")).not.toBeNull()
    })
  })

  test("a terminal run is never reopened by a stale job", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      const run = await create(tx, ref, 1)
      const target = { runId: run?.id ?? "", workspaceId: ref.workspaceId }
      const claimed = await repository.claim(target, tx)
      await repository.finish(
        {
          runId: target.runId,
          expect: { claimToken: claimed?.claimToken ?? "" },
          outcome: { status: "completed" },
        },
        tx,
      )

      expect(await repository.claim(target, tx)).toBeNull()
    })
  })

  test("the sweeper ends an exhausted stale run (a cancelling one as cancelled) and redispatches a stuck pending one", async () => {
    await inRolledBackTransaction(async (tx, ref) => {
      const run = await create(tx, ref, 1)
      const target = { runId: run?.id ?? "", workspaceId: ref.workspaceId }
      await repository.claim(target, tx)
      await tx.execute(sql`
        UPDATE "AIHandoverBulkRun" SET status = 'cancelling', attempts = 5 WHERE id = ${target.runId}`)
      await expireHeartbeat(tx, target.runId)

      // The last dispatch was just made (its job may be waiting in a backed-up
      // queue): it gets a full lease to start before the run is given up on.
      await repository.markMaxAttemptsFailed({ maxAttempts: 5 }, tx)
      expect(
        (await repository.findByRevision({ ...ref, revision: 1 }, tx))?.status,
      ).toBe("cancelling")

      await tx.execute(sql`
        UPDATE "AIHandoverBulkRun" SET "updatedAt" = NOW() - INTERVAL '16 minutes' WHERE id = ${target.runId}`)
      await repository.markMaxAttemptsFailed({ maxAttempts: 5 }, tx)

      expect(
        (await repository.findByRevision({ ...ref, revision: 1 }, tx))?.status,
      ).toBe("cancelled")

      const stuck = await create(tx, ref, 2, "enable")
      await tx.execute(sql`
        UPDATE "AIHandoverBulkRun" SET "updatedAt" = NOW() - INTERVAL '5 minutes' WHERE id = ${stuck?.id}`)
      const picked = await repository.pickDue(
        { maxAttempts: 5, batchSize: 10 },
        tx,
      )

      // One attempt burned, and a fresh revision so its job id cannot collide.
      expect(
        picked.find((candidate) => candidate.id === stuck?.id),
      ).toMatchObject({
        attempts: 1,
        chunkSeq: 1,
      })
    })
  })
})
