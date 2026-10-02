import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { aiHandoverBulkRunRepository } from "../src/repositories/ai-handover-bulk-run/repository"
import { aiHandoverBulkRunModel } from "../src/schema"

const dialect = new PgDialect()
const GUARD = { claimToken: "token-1" }

const updateTx = (returned: unknown[]) => {
  const returning = vi.fn().mockResolvedValue(returned)
  const where = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where })
  const update = vi.fn().mockReturnValue({ set })
  return { tx: { update } as unknown as DatabaseClient, set, where }
}

const renderWhere = (where: ReturnType<typeof vi.fn>) =>
  dialect.sqlToQuery(where.mock.calls[0][0])

describe("aiHandoverBulkRunRepository.createForRevision", () => {
  const buildTx = (returned: unknown[]) => {
    const returning = vi.fn().mockResolvedValue(returned)
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning })
    const values = vi.fn().mockReturnValue({ onConflictDoNothing })
    const insert = vi.fn().mockReturnValue({ values })
    return {
      tx: { insert } as unknown as DatabaseClient,
      insert,
      values,
      onConflictDoNothing,
    }
  }
  const input = {
    workspaceId: "ws-1",
    inboxId: "inbox-1",
    revision: 3,
    channel: "messenger" as const,
    action: "disable" as const,
    message: "We are back",
    requestedByUserId: "user-1",
    requestedAt: new Date("2026-10-02T00:00:00Z"),
  }

  test("writes every column explicitly as a pending run", async () => {
    const row = { id: "run-1" }
    const { tx, insert, values, onConflictDoNothing } = buildTx([row])

    const result = await aiHandoverBulkRunRepository.createForRevision(
      input,
      tx,
    )

    expect(result).toBe(row)
    expect(insert).toHaveBeenCalledWith(aiHandoverBulkRunModel)
    expect(values).toHaveBeenCalledWith({
      ...input,
      status: "pending",
      startedAt: null,
      finishedAt: null,
      lastHeartbeatAt: null,
      pausedUntil: null,
      claimToken: null,
      attempts: 0,
      chunkSeq: 0,
      totalCount: null,
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      cursorContactInboxId: null,
      inFlightFromId: null,
      inFlightToId: null,
      currentError: null,
    })
    expect(onConflictDoNothing).toHaveBeenCalledWith()
  })

  test("returns null when the Page has a live run or already ran this revision", async () => {
    const { tx } = buildTx([])

    await expect(
      aiHandoverBulkRunRepository.createForRevision(input, tx),
    ).resolves.toBeNull()
  })
})

describe("guarded writes", () => {
  test.each([
    [
      "recordProgress",
      (tx: DatabaseClient) =>
        aiHandoverBulkRunRepository.recordProgress(
          { runId: "run-1", expect: GUARD, progress: { addProcessed: 3 } },
          tx,
        ),
    ],
    [
      "yieldForContinuation",
      (tx: DatabaseClient) =>
        aiHandoverBulkRunRepository.yieldForContinuation(
          { runId: "run-1", expect: GUARD },
          tx,
        ),
    ],
    [
      "finish",
      (tx: DatabaseClient) =>
        aiHandoverBulkRunRepository.finish(
          {
            runId: "run-1",
            expect: GUARD,
            outcome: { status: "completed" },
          },
          tx,
        ),
    ],
  ])("%s is conditional on the run id, a live status and the claim token", async (_name, call) => {
    const { tx, where } = updateTx([])

    await call(tx)

    const { sql, params } = renderWhere(where)
    expect(sql).toContain('"claimToken" = $')
    expect(params).toEqual(
      expect.arrayContaining(["run-1", "token-1", "running", "cancelling"]),
    )
  })

  test("recordProgress reports null when the claim was lost and the status when it landed", async () => {
    const lost = updateTx([])
    const cancelling = updateTx([{ status: "cancelling" }])

    await expect(
      aiHandoverBulkRunRepository.recordProgress(
        { runId: "run-1", expect: GUARD, progress: {} },
        lost.tx,
      ),
    ).resolves.toBeNull()
    await expect(
      aiHandoverBulkRunRepository.recordProgress(
        { runId: "run-1", expect: GUARD, progress: {} },
        cancelling.tx,
      ),
    ).resolves.toBe("cancelling")
  })

  test("recordProgress only touches the cursors it was given", async () => {
    const { tx, set } = updateTx([{ id: "run-1" }])

    await aiHandoverBulkRunRepository.recordProgress(
      {
        runId: "run-1",
        expect: GUARD,
        progress: { cursorContactInboxId: "ci-5", inFlightFromId: null },
      },
      tx,
    )

    const patch = set.mock.calls[0][0]
    expect(patch.cursorContactInboxId).toBe("ci-5")
    // `null` clears a marker, `undefined` leaves the column alone.
    expect(patch.inFlightFromId).toBeNull()
    expect("cursorInboxId" in patch).toBe(false)
    expect("totalCount" in patch).toBe(false)
    expect("currentError" in patch).toBe(false)
  })

  test.each([
    ["a marker write", { inFlightFromId: "a", inFlightToId: "b" }],
    ["a cursor write", { cursorContactInboxId: "ci-1" }],
    ["a total count", { totalCount: 40 }],
    [
      "a settled count of zero",
      { addProcessed: 0, addSkipped: 0, addFailed: 0 },
    ],
  ])("%s is not progress: it leaves the sweeper's retry budget alone, or a run whose every call fails would never run out of attempts", async (_label, progress) => {
    const { tx, set } = updateTx([{ status: "running" }])

    await aiHandoverBulkRunRepository.recordProgress(
      { runId: "run-1", expect: GUARD, progress },
      tx,
    )

    expect("attempts" in set.mock.calls[0][0]).toBe(false)
  })

  test.each([
    ["processed", { addProcessed: 1 }],
    ["skipped", { addSkipped: 1 }],
    ["failed", { addFailed: 1 }],
  ])("a settled thread (%s) resets the retry budget", async (_label, progress) => {
    const { tx, set } = updateTx([{ status: "running" }])

    await aiHandoverBulkRunRepository.recordProgress(
      { runId: "run-1", expect: GUARD, progress },
      tx,
    )

    expect(set.mock.calls[0][0].attempts).toBe(0)
  })

  test("recordProgress resets the retry budget: attempts count dispatches WITHOUT progress", async () => {
    const { tx, set } = updateTx([{ status: "running" }])

    await aiHandoverBulkRunRepository.recordProgress(
      {
        runId: "run-1",
        expect: GUARD,
        progress: { addProcessed: 1, currentError: "pageSkipped" },
      },
      tx,
    )

    expect(set.mock.calls[0][0]).toMatchObject({
      attempts: 0,
      currentError: "pageSkipped",
    })
  })

  test("a plain continuation (no pause) leaves the retry budget alone", async () => {
    const { tx, set } = updateTx([{ chunkSeq: 3 }])

    await aiHandoverBulkRunRepository.yieldForContinuation(
      { runId: "run-1", expect: GUARD },
      tx,
    )

    expect("attempts" in set.mock.calls[0][0]).toBe(false)
  })

  test("finish without a reason keeps the one recorded while the run was going", async () => {
    const { tx, set } = updateTx([{ id: "run-1" }])

    await aiHandoverBulkRunRepository.finish(
      { runId: "run-1", expect: GUARD, outcome: { status: "completed" } },
      tx,
    )

    expect("currentError" in set.mock.calls[0][0]).toBe(false)
  })

  test("yieldForContinuation returns the next revision, or null when the guard failed", async () => {
    const won = updateTx([{ chunkSeq: 4 }])
    const lost = updateTx([])

    await expect(
      aiHandoverBulkRunRepository.yieldForContinuation(
        { runId: "run-1", expect: GUARD },
        won.tx,
      ),
    ).resolves.toBe(4)
    await expect(
      aiHandoverBulkRunRepository.yieldForContinuation(
        { runId: "run-1", expect: GUARD },
        lost.tx,
      ),
    ).resolves.toBeNull()
    expect(won.set.mock.calls[0][0].claimToken).toBeNull()
  })

  test("yieldForContinuation can park the run: pausedUntil is written, the heartbeat stays real", async () => {
    const { tx, set } = updateTx([{ chunkSeq: 2 }])
    const pausedUntil = new Date("2026-10-02T13:00:00Z")

    await aiHandoverBulkRunRepository.yieldForContinuation(
      { runId: "run-1", expect: GUARD, pausedUntil },
      tx,
    )

    expect(set.mock.calls[0][0]).toMatchObject({
      claimToken: null,
      pausedUntil,
    })
    expect(set.mock.calls[0][0].lastHeartbeatAt).not.toBe(pausedUntil)
  })

  test("finish clears the lease and the in-flight markers", async () => {
    const { tx, set } = updateTx([{ id: "run-1" }])

    await aiHandoverBulkRunRepository.finish(
      {
        runId: "run-1",
        expect: GUARD,
        outcome: {
          status: "failed",
          currentError: "token revoked",
          totalCount: 7,
        },
      },
      tx,
    )

    expect(set.mock.calls[0][0]).toMatchObject({
      status: "failed",
      currentError: "token revoked",
      totalCount: 7,
      claimToken: null,
      inFlightFromId: null,
      inFlightToId: null,
    })
  })
})

describe("claim", () => {
  test("only a pending, released or stale-lease live run can be claimed", async () => {
    const { tx, where } = updateTx([])

    const result = await aiHandoverBulkRunRepository.claim(
      { runId: "run-1", workspaceId: "ws-1" },
      tx,
    )

    expect(result).toBeNull()
    const { sql, params } = renderWhere(where)
    expect(params).toEqual(
      expect.arrayContaining(["pending", "running", "cancelling"]),
    )
    // Terminal statuses are never in the claimable set.
    expect(params).not.toContain("completed")
    expect(params).not.toContain("failed")
    expect(params).not.toContain("cancelled")
    expect(sql).toContain('"claimToken" IS NULL')
    expect(sql).toContain("15 minutes")
    // Scoped to the job's workspace: a stray job cannot take the lease.
    expect(params).toEqual(expect.arrayContaining(["run-1", "ws-1"]))
  })

  test("a paused run cannot be claimed until the pause is over, but a cancelling one can", async () => {
    const { tx, where } = updateTx([])

    await aiHandoverBulkRunRepository.claim(
      { runId: "run-1", workspaceId: "ws-1" },
      tx,
    )

    const { sql } = renderWhere(where)
    expect(sql).toContain('"pausedUntil" IS NULL')
    expect(sql).toContain('"pausedUntil" <= NOW()')
    expect(sql).toContain("\"status\" = 'cancelling'")
  })

  test("a cancelling run keeps its status and a pending one starts running", async () => {
    const { tx, set } = updateTx([{ id: "run-1" }])

    await aiHandoverBulkRunRepository.claim(
      { runId: "run-1", workspaceId: "ws-1" },
      tx,
    )

    const status = dialect.sqlToQuery(set.mock.calls[0][0].status)
    expect(status.sql).toContain("'running'")
    expect(status.sql).toContain('ELSE "AIHandoverBulkRun"."status"')
    expect(typeof set.mock.calls[0][0].claimToken).toBe("string")
  })
})

describe("cancelLive", () => {
  test("a run nobody holds (pending, or released and parked) is cancelled outright, a claimed one winds down", async () => {
    const { tx, set, where } = updateTx([{ id: "run-1" }])

    await aiHandoverBulkRunRepository.cancelLive(
      { workspaceId: "ws-1", inboxId: "inbox-1" },
      tx,
    )

    const patch = set.mock.calls[0][0]
    const status = dialect.sqlToQuery(patch.status).sql
    expect(status).toContain(`'cancelled'::"aiHandoverBulkStatus"`)
    expect(status).toContain(`'cancelling'::"aiHandoverBulkStatus"`)
    expect(status).toContain('"claimToken" IS NULL')
    // The cancel also ends a pause.
    expect(patch.pausedUntil).toBeNull()
    expect(renderWhere(where).params).toEqual(
      expect.arrayContaining(["pending", "running"]),
    )
  })

  test("cancelLive targets the Page's live run, scoped by workspace and inbox", async () => {
    const { tx, where } = updateTx([{ id: "run-1" }])

    await aiHandoverBulkRunRepository.cancelLive(
      { workspaceId: "ws-1", inboxId: "inbox-1" },
      tx,
    )

    expect(renderWhere(where).params).toEqual(
      expect.arrayContaining(["ws-1", "inbox-1", "pending", "running"]),
    )
  })

  test("returns null when nothing live is left to cancel", async () => {
    const { tx } = updateTx([])

    await expect(
      aiHandoverBulkRunRepository.cancelLive(
        { workspaceId: "ws-1", inboxId: "inbox-1" },
        tx,
      ),
    ).resolves.toBeNull()
  })
})

describe("sweeper queries", () => {
  test("reopenReleased only matches a running run with no token", async () => {
    const { tx, where, set } = updateTx([{ id: "run-1" }])

    await expect(
      aiHandoverBulkRunRepository.reopenReleased({ runId: "run-1" }, tx),
    ).resolves.toBe(1)
    expect(set.mock.calls[0][0].status).toBe("pending")
    const { sql, params } = renderWhere(where)
    expect(sql).toContain('"claimToken" IS NULL')
    expect(params).toEqual(expect.arrayContaining(["run-1", "running"]))
  })

  test("refundDispatch undoes pickDue's counters for exactly the picked values", async () => {
    const { tx, where, set } = updateTx([{ id: "run-1" }])

    await expect(
      aiHandoverBulkRunRepository.refundDispatch(
        { runId: "run-1", attempts: 3, chunkSeq: 4 },
        tx,
      ),
    ).resolves.toBe(true)

    const patch = set.mock.calls[0][0]
    expect(dialect.sqlToQuery(patch.attempts).sql).toContain("- 1")
    expect(dialect.sqlToQuery(patch.chunkSeq).sql).toContain("- 1")
    expect(renderWhere(where).params).toEqual(
      expect.arrayContaining(["run-1", 3, 4]),
    )
  })

  test("refundDispatch does nothing when the run moved on since it was picked", async () => {
    const { tx } = updateTx([])

    await expect(
      aiHandoverBulkRunRepository.refundDispatch(
        { runId: "run-1", attempts: 3, chunkSeq: 4 },
        tx,
      ),
    ).resolves.toBe(false)
  })

  test("neither reopenReleased, markMaxAttemptsFailed nor pickDue touches a run that is paused on purpose", async () => {
    const reopen = updateTx([])
    const mark = updateTx([])
    const execute = vi.fn().mockResolvedValue({ rows: [] })

    await aiHandoverBulkRunRepository.reopenReleased(
      { runId: "run-1" },
      reopen.tx,
    )
    await aiHandoverBulkRunRepository.markMaxAttemptsFailed(
      { maxAttempts: 5 },
      mark.tx,
    )
    await aiHandoverBulkRunRepository.pickDue(
      { maxAttempts: 5, batchSize: 10 },
      { execute } as unknown as DatabaseClient,
    )

    expect(renderWhere(reopen.where).sql).toContain('"pausedUntil" IS NULL')
    expect(renderWhere(mark.where).sql).toContain('"pausedUntil" IS NULL')
    expect(dialect.sqlToQuery(execute.mock.calls[0][0]).sql).toContain(
      '"pausedUntil" IS NULL OR "pausedUntil" <= NOW()',
    )
  })

  test("markMaxAttemptsFailed ends exhausted live runs with a stale lease", async () => {
    const { tx, where, set } = updateTx([])

    await aiHandoverBulkRunRepository.markMaxAttemptsFailed(
      { maxAttempts: 5 },
      tx,
    )

    const { sql, params } = renderWhere(where)
    expect(params).toContain(5)
    expect(sql).toContain('"lastHeartbeatAt" IS NULL')
    expect(sql).toContain("15 minutes")
    // The last dispatch gets a full lease to start (its job may be queued).
    expect(sql).toContain('"updatedAt" < NOW() - ')
    expect(dialect.sqlToQuery(set.mock.calls[0][0].status).sql).toContain(
      `'cancelled'::"aiHandoverBulkStatus" ELSE 'failed'::"aiHandoverBulkStatus"`,
    )
  })

  test("pickDue burns an attempt, skips locked rows and returns the revision", async () => {
    const rows = [
      {
        id: "run-1",
        workspaceId: "ws-1",
        attempts: 1,
        chunkSeq: 2,
        status: "pending",
      },
    ]
    const execute = vi.fn().mockResolvedValue({ rows })
    const tx = { execute } as unknown as DatabaseClient

    const picked = await aiHandoverBulkRunRepository.pickDue(
      { maxAttempts: 5, batchSize: 10 },
      tx,
    )

    expect(picked).toBe(rows)
    const { sql, params } = dialect.sqlToQuery(execute.mock.calls[0][0])
    expect(sql).toContain("attempts = attempts + 1")
    expect(sql).toContain("FOR UPDATE SKIP LOCKED")
    // Every dispatch gets its own revision, so its job id cannot collide.
    expect(sql).toContain('"chunkSeq" = "chunkSeq" + 1')
    expect(sql).toContain("2 minutes")
    expect(params).toEqual(expect.arrayContaining([5, 10]))
  })
})

describe("finders", () => {
  test("listInboxesAwaitingRun resumes after the given Page id", async () => {
    const limit = vi.fn().mockResolvedValue([])
    const orderBy = vi.fn().mockReturnValue({ limit })
    const where = vi.fn().mockReturnValue({ orderBy })
    const innerJoin = vi.fn().mockReturnValue({ where })
    const from = vi.fn().mockReturnValue({ innerJoin })
    const select = vi
      .fn()
      .mockImplementation((fields: object) =>
        "one" in fields ? { from: () => ({ where: vi.fn() }) } : { from },
      )

    await aiHandoverBulkRunRepository.listInboxesAwaitingRun(
      { limit: 20, afterInboxId: "inbox-500" },
      { select } as unknown as DatabaseClient,
    )

    expect(dialect.sqlToQuery(where.mock.calls[0][0]).params).toContain(
      "inbox-500",
    )
  })

  test("listInboxesAwaitingRun only lists Pages a run is DUE for, oldest change first, so waiting Pages cannot crowd them out", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue([{ workspaceId: "ws-1", inboxId: "i-1" }])
    const orderBy = vi.fn().mockReturnValue({ limit })
    const where = vi.fn().mockReturnValue({ orderBy })
    const innerJoin = vi.fn().mockReturnValue({ where })
    const from = vi.fn().mockReturnValue({ innerJoin })
    const subWhere = vi.fn()
    const subFrom = vi.fn().mockReturnValue({ where: subWhere })
    const select = vi
      .fn()
      .mockImplementation((fields: object) =>
        "one" in fields ? { from: subFrom } : { from },
      )
    const tx = { select } as unknown as DatabaseClient

    await expect(
      aiHandoverBulkRunRepository.listInboxesAwaitingRun({ limit: 20 }, tx),
    ).resolves.toEqual([{ workspaceId: "ws-1", inboxId: "i-1" }])

    const due = dialect.sqlToQuery(where.mock.calls[0][0])
    // Connected Page, a revision that was changed, an ON only with the
    // automation on, no run for the revision, no live run.
    expect(due.params).toEqual(
      expect.arrayContaining(["connected", 0, false, true]),
    )
    // Walked by Page id (keyset), never in a fixed head-of-line order.
    expect(orderBy).toHaveBeenCalledTimes(1)
    expect(limit).toHaveBeenCalledWith(20)
    const noRun = dialect.sqlToQuery(subWhere.mock.calls[0][0])
    expect(noRun.params).toEqual(
      expect.arrayContaining(["pending", "running", "cancelling"]),
    )
  })
})
