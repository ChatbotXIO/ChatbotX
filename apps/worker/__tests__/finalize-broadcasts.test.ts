import { BROADCAST_OUTCOME_GRACE_MS } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const listAwaitingFinalization = vi.fn()
const countRecipientOutcomes = vi.fn()
const completeSending = vi.fn()
const recordAuditLog = vi.fn()
const runExclusiveSpy = vi.fn()
const loggerInfoSpy = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  broadcastService: {
    listAwaitingFinalization: (...args: unknown[]) =>
      listAwaitingFinalization(...args),
    countRecipientOutcomes: (...args: unknown[]) =>
      countRecipientOutcomes(...args),
    completeSending: (...args: unknown[]) => completeSending(...args),
  },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: (...args: unknown[]) => recordAuditLog(...args) },
}))

vi.mock("@chatbotx.io/database/partials", async () =>
  vi.importActual("@chatbotx.io/database/partials"),
)

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: (opts: {
      key: string
      timeoutInSeconds: number
      fn: () => Promise<unknown>
    }) => {
      runExclusiveSpy(opts)
      return opts.fn()
    },
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: (...args: unknown[]) => loggerInfoSpy(...args),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const { finalizeBroadcasts } = await import(
  "../src/schedule/handlers/finalize-broadcasts"
)

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60 * 1000)

// Grace-window fixtures are derived from the real BROADCAST_OUTCOME_GRACE_MS
// (rather than a hardcoded literal) so they stay correct if the grace period
// is ever tuned.
const withinGraceWindowAgo = () =>
  new Date(Date.now() - (BROADCAST_OUTCOME_GRACE_MS - 60 * 1000))
const pastGraceWindowAgo = () =>
  new Date(Date.now() - (BROADCAST_OUTCOME_GRACE_MS + 60 * 1000))

const makeBroadcast = (
  id: string,
  contactCount: number | null,
  handoffCompletedAt: Date,
) => ({ id, workspaceId: "ws-1", contactCount, handoffCompletedAt })

beforeEach(() => {
  listAwaitingFinalization.mockReset().mockResolvedValue([])
  countRecipientOutcomes
    .mockReset()
    .mockResolvedValue({ completed: 0, failed: 0 })
  completeSending.mockReset().mockResolvedValue(true)
  recordAuditLog.mockReset().mockResolvedValue(undefined)
})

describe("finalizeBroadcasts", () => {
  test("acquires the lock with the expected key", async () => {
    await finalizeBroadcasts()
    expect(runExclusiveSpy.mock.calls[0][0]).toMatchObject({
      key: "schedule:finalize-broadcasts",
      timeoutInSeconds: 55,
    })
  })

  test("returns zero counts when nothing awaits finalization", async () => {
    expect(await finalizeBroadcasts()).toEqual({
      skipped: false,
      finalized: 0,
      failed: 0,
    })
    expect(completeSending).not.toHaveBeenCalled()
  })

  test("marks null/zero-contact handed-off broadcasts sent without counting outcomes", async () => {
    listAwaitingFinalization.mockResolvedValue([
      makeBroadcast("b-1", null, minutesAgo(1)),
      makeBroadcast("b-2", 0, minutesAgo(1)),
    ])

    const result = await finalizeBroadcasts()

    expect(countRecipientOutcomes).not.toHaveBeenCalled()
    expect(completeSending).toHaveBeenCalledWith({
      broadcastId: "b-1",
      status: "sent",
    })
    expect(completeSending).toHaveBeenCalledWith({
      broadcastId: "b-2",
      status: "sent",
    })
    expect(result).toEqual({ skipped: false, finalized: 2, failed: 0 })
  })

  test("marks sent when every recipient has an outcome and not all failed", async () => {
    listAwaitingFinalization.mockResolvedValue([
      makeBroadcast("b-1", 10, minutesAgo(1)),
    ])
    countRecipientOutcomes.mockResolvedValue({ completed: 10, failed: 2 })

    const result = await finalizeBroadcasts()

    expect(completeSending).toHaveBeenCalledWith({
      broadcastId: "b-1",
      status: "sent",
    })
    expect(recordAuditLog).toHaveBeenCalledTimes(1)
    expect(recordAuditLog).toHaveBeenCalledWith({
      action: "broadcast_sent",
      detail: "sent a broadcast (#b-1)",
      workspaceId: "ws-1",
      source: "schedule:finalizeBroadcasts",
    })
    expect(result).toEqual({ skipped: false, finalized: 1, failed: 0 })
  })

  test("marks failed when every recipient failed", async () => {
    listAwaitingFinalization.mockResolvedValue([
      makeBroadcast("b-1", 10, minutesAgo(1)),
    ])
    countRecipientOutcomes.mockResolvedValue({ completed: 10, failed: 10 })

    const result = await finalizeBroadcasts()

    expect(completeSending).toHaveBeenCalledWith({
      broadcastId: "b-1",
      status: "failed",
    })
    expect(recordAuditLog).toHaveBeenCalledTimes(1)
    expect(recordAuditLog).toHaveBeenCalledWith({
      action: "broadcast_failed",
      detail: "broadcast failed (#b-1)",
      workspaceId: "ws-1",
      source: "schedule:finalizeBroadcasts",
    })
    expect(result).toEqual({ skipped: false, finalized: 0, failed: 1 })
  })

  test("policy: Completed unless every targeted recipient failed (tolerance case is an intentional false-negative)", async () => {
    // 1000 targeted, 950 completed (>1% missing → not within tolerance) — must wait.
    listAwaitingFinalization.mockResolvedValue([
      makeBroadcast("b-1", 1000, minutesAgo(1)),
    ])
    countRecipientOutcomes.mockResolvedValue({ completed: 950, failed: 950 })
    await finalizeBroadcasts()
    expect(completeSending).not.toHaveBeenCalled()

    // 1000 targeted, 995 completed, all of them failed → within tolerance; 995 < 1000 → sent (spec D5).
    countRecipientOutcomes.mockResolvedValue({ completed: 995, failed: 995 })
    await finalizeBroadcasts()
    expect(completeSending).toHaveBeenCalledWith({
      broadcastId: "b-1",
      status: "sent",
    })
  })

  test("waits inside the grace window when outcomes are incomplete", async () => {
    listAwaitingFinalization.mockResolvedValue([
      makeBroadcast("b-1", 10, withinGraceWindowAgo()),
    ])
    countRecipientOutcomes.mockResolvedValue({ completed: 3, failed: 0 })

    await finalizeBroadcasts()

    expect(completeSending).not.toHaveBeenCalled()
    expect(recordAuditLog).not.toHaveBeenCalled()
  })

  test("resolves with whatever is known once the grace window elapsed (later outcomes do not change status)", async () => {
    listAwaitingFinalization.mockResolvedValue([
      makeBroadcast("b-1", 10, pastGraceWindowAgo()),
    ])
    countRecipientOutcomes.mockResolvedValue({ completed: 3, failed: 0 })

    const result = await finalizeBroadcasts()

    expect(completeSending).toHaveBeenCalledWith({
      broadcastId: "b-1",
      status: "sent",
    })
    expect(result).toEqual({ skipped: false, finalized: 1, failed: 0 })
  })

  test("keeps a broadcast for the next run when finalization transiently fails", async () => {
    listAwaitingFinalization.mockResolvedValue([
      makeBroadcast("b-1", 10, minutesAgo(1)),
    ])
    countRecipientOutcomes.mockRejectedValueOnce(new Error("db timeout"))

    await expect(finalizeBroadcasts()).rejects.toThrow("db timeout")

    // Nothing was written, so the row is still `sending` + handed off and is listed again next minute.
    expect(completeSending).not.toHaveBeenCalled()
  })

  test("does not count a lost race", async () => {
    // Protocol case "stop after markHandoffCompleted -> resume": this run's
    // `listAwaitingFinalization` read is stale relative to a concurrent
    // stopSending/resumeSending round-trip. `resumeSending` clears
    // handoffCompletedAt in the same UPDATE that flips status back to
    // "sending" (broadcast-service-transitions.test.ts), so by the time this
    // run's completeSending() fires, its WHERE clause (status='sending' AND
    // handoffCompletedAt IS NOT NULL — broadcast-service-lifecycle.test.ts)
    // no longer matches: 0 rows. finalize must not count that as a finalize,
    // leaving reconcileBroadcasts (which re-enqueues on handoffCompletedAt
    // IS NULL — reconcile-broadcasts.test.ts) as the one driving the
    // resumed run.
    listAwaitingFinalization.mockResolvedValue([
      makeBroadcast("b-1", 10, minutesAgo(1)),
    ])
    countRecipientOutcomes.mockResolvedValue({ completed: 10, failed: 0 })
    completeSending.mockResolvedValue(false)

    const result = await finalizeBroadcasts()

    expect(result).toEqual({ skipped: false, finalized: 0, failed: 0 })
    expect(recordAuditLog).not.toHaveBeenCalled()
  })
})
